/**
 * Advanced Audio Analyzer
 * Provides sophisticated audio feature extraction for music visualization
 * Including beat detection, spectral analysis, musical event detection,
 * BPM tracking, mood detection, and buildup anticipation.
 *
 * v2.0: Enhanced with Meyda.js spectral features, phrase-aligned timing,
 * and pre-drop anticipation (per intelligent-preset-selector-improvements.md plan)
 */

// Dynamic import for Meyda to handle SSR/Node environments gracefully
let Meyda = null;
const loadMeyda = async () => {
    if (Meyda) return Meyda;
    try {
        const module = await import('meyda');
        Meyda = module.default || module;
        return Meyda;
    } catch (e) {
        console.warn('[AdvancedAnalyzer] Meyda not available:', e.message);
        return null;
    }
};

export class AdvancedAudioAnalyzer {
    /**
     * Initialize the audio analyzer with configurable thresholds
     * @param {Object} config - Configuration object with optional threshold values
     * @param {AudioContext} audioContext - Optional: Web Audio context for Meyda
     * @param {AudioNode} source - Optional: Audio source node for Meyda
     */
    constructor(config = {}, audioContext = null, source = null) {
        // EXISTING: History for trend detection (keep unchanged)
        this.featureHistory = [];
        this.maxHistorySize = config.maxHistorySize || 30;

        // EXISTING: Event detection thresholds (keep unchanged)
        this.dropThreshold = config.dropThreshold || 0.7;
        this.buildupThreshold = config.buildupThreshold || 0.5;
        this.breakdownThreshold = config.breakdownThreshold || 0.3;
        this.chillThreshold = config.chillThreshold || 0.3;
        this.bassWeight = config.bassWeight || 0.6;
        this.trebleWeight = config.trebleWeight || 0.3;

        // NEW: Meyda integration (only if audio context provided)
        this.meydaAnalyzer = null;
        this.audioContext = audioContext;
        this.source = source;
        this._meydaReady = false;
        // B4 FIX: Promise for callers to await Meyda initialization
        this._meydaReadyPromise = null;
        this._meydaReadyResolve = null;

        // Initialize Meyda asynchronously if audio context provided
        if (audioContext && source) {
            this._meydaReadyPromise = new Promise(resolve => {
                this._meydaReadyResolve = resolve;
            });
            this._initMeyda(audioContext, source);
        }

        // NEW: Flux history for spike detection
        this.fluxHistory = [];
        this.FLUX_HISTORY_SIZE = 30;

        // SUG-1 FIX: Make flux spike multiplier configurable
        this.fluxSpikeMultiplier = config.fluxSpikeMultiplier || 2.5;

        // C1 FIX: Configurable thresholds (previously hardcoded magic numbers)
        this.dropBassChangeThreshold = config.dropBassChangeThreshold || 0.2;
        this.trendStabilityThreshold = config.trendStabilityThreshold || 0.05;
        this.onsetThreshold = config.onsetThreshold || 1.5;
        this.onsetEnergyFloor = config.onsetEnergyFloor || 0.01;
        // A4 hysteresis: only adopt a new phraseLength when genre confidence
        // exceeds this threshold. Prevents phrase tracker from flapping when a
        // single low-confidence frame returns 'unknown' (phraseLength 16).
        this.genreConfidenceThreshold = config.genreConfidenceThreshold || 0.6;

        // NEW: BPM tracking
        this.detectedBPM = null;
        this.beatInterval = 500; // Default 120 BPM
        this.lastBeatTime = 0;
        this.beatPhase = 0;

        // NEW: Hierarchical timing: beat -> bar -> phrase
        this.beatPosition = 0;      // 0-3: beat within bar
        this.barPosition = 0;       // 0-3: bar within phrase
        this.phraseLength = 16;     // 16 beats = 4 bars = 1 phrase

        // NEW: Buildup tracking for pre-drop anticipation
        // B1 FIX: Configurable buildup window (default 4 bars at ~120 BPM ≈ 8 seconds)
        // Real EDM buildups span 8-16 bars; 1 second was too short to characterize them
        this.buildupHistory = [];
        this.BUILDUP_HISTORY_SIZE = config.buildupHistorySize || 480; // ~8 seconds at 60fps

        // Gaussian smoothing for noise reduction in trend calculations
        // Window size 5, sigma 1.0 balances noise suppression with peak preservation
        this.gaussianKernel = this._generateGaussianKernel(
            config.gaussianWindow || 5,
            config.gaussianSigma || 1.0
        );
    }

    /**
     * Initialize Meyda analyzer asynchronously
     * @private
     */
    async _initMeyda(audioContext, source) {
        const MeydaLib = await loadMeyda();
        if (!MeydaLib) return;

        try {
            // CRIT-1 FIX: Use 2048 buffer to match CLAUDE.md requirement
            // "PRESERVE 2048-sample audio buffer size - never revert to 512"
            this.meydaAnalyzer = MeydaLib.createMeydaAnalyzer({
                audioContext: audioContext,
                source: source,
                bufferSize: 2048,  // MUST match existing pipeline (was 512)
                featureExtractors: [
                    'rms', 'spectralCentroid', 'spectralFlux',
                    'spectralFlatness', 'spectralRolloff', 'zcr',
                    'perceptualSharpness'
                ],
                callback: null
            });
            this.meydaAnalyzer.start();
            this._meydaReady = true;
            if (this._meydaReadyResolve) this._meydaReadyResolve(true);
        } catch (e) {
            console.warn('[AdvancedAnalyzer] Meyda init failed:', e.message);
            if (this._meydaReadyResolve) this._meydaReadyResolve(false);
        }
    }

    /**
     * B4 FIX: Getter for Meyda readiness state
     * @returns {boolean} True if Meyda is initialized and ready
     */
    get meydaReady() {
        return this._meydaReady;
    }

    /**
     * B4 FIX: Wait for Meyda initialization to complete
     * @returns {Promise<boolean>} Resolves to true if Meyda initialized, false if failed/unavailable
     */
    async waitForMeyda() {
        if (!this._meydaReadyPromise) return false;
        return this._meydaReadyPromise;
    }

    /**
     * Generate a normalized Gaussian kernel for smoothing
     * @private
     * @param {number} size - Kernel window size (odd number preferred)
     * @param {number} sigma - Standard deviation (controls smoothing strength)
     * @returns {number[]} Normalized Gaussian weights summing to 1.0
     */
    _generateGaussianKernel(size, sigma = 1.0) {
        const kernel = [];
        const center = Math.floor(size / 2);
        let sum = 0;

        for (let i = 0; i < size; i++) {
            const x = i - center;
            const value = Math.exp(-(x * x) / (2 * sigma * sigma));
            kernel.push(value);
            sum += value;
        }

        // Normalize so weights sum to 1
        return kernel.map(v => v / sum);
    }

    /**
     * Apply Gaussian smoothing to a signal (feature history array)
     * Convolves signal with pre-computed Gaussian kernel to reduce noise
     * while preserving genuine peaks and trends.
     * @private
     * @param {Object[]} history - Array of feature objects
     * @param {string} feature - Feature key to extract and smooth
     * @returns {number[]} Smoothed values (shorter by kernel.length - 1)
     */
    _smoothFeatureHistory(history, feature) {
        if (history.length < this.gaussianKernel.length) {
            return history.map(f => f[feature] || 0);
        }

        const values = history.map(f => f[feature] || 0);
        const smoothed = [];
        const halfWindow = Math.floor(this.gaussianKernel.length / 2);

        for (let i = halfWindow; i < values.length - halfWindow; i++) {
            let sum = 0;
            for (let j = 0; j < this.gaussianKernel.length; j++) {
                sum += values[i - halfWindow + j] * this.gaussianKernel[j];
            }
            smoothed.push(sum);
        }

        return smoothed;
    }

    /**
     * Calculate advanced audio features from frequency and time domain data
     * @param {Uint8Array|Float32Array} dataArray - Frequency domain data (0-255 or 0-1.0)
     * @param {Uint8Array} timeByteArray - Time domain data (waveform)
     * @returns {Object} Extracted audio features
     */
    calculateFeatures(dataArray, timeByteArray) {
        const features = {};

        // EXISTING: Beat detection - look for sudden amplitude changes
        let maxAmp = 0;
        let beatThreshold = 0;
        for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i] > maxAmp) maxAmp = dataArray[i];
            beatThreshold += dataArray[i];
        }
        beatThreshold = beatThreshold / dataArray.length * 1.5;
        features.beatDetected = maxAmp > beatThreshold;
        features.beatStrength = Math.min(1.0, maxAmp / 255);

        // EXISTING: Spectral centroid - brightness indicator
        let weightedSum = 0;
        let magnitudeSum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            weightedSum += i * dataArray[i];
            magnitudeSum += dataArray[i];
        }
        features.spectralCentroid = magnitudeSum > 0 ?
            (weightedSum / magnitudeSum) / dataArray.length : 0;

        // EXISTING: Zero crossing rate - percussive content detector
        let zeroCrossings = 0;
        for (let i = 1; i < timeByteArray.length; i++) {
            const prev = timeByteArray[i - 1] - 128;
            const curr = timeByteArray[i] - 128;
            if ((prev < 0 && curr >= 0) || (prev >= 0 && curr < 0)) {
                zeroCrossings++;
            }
        }
        features.zeroCrossingRate = zeroCrossings / timeByteArray.length;

        // EXISTING: Dynamic range
        let min = 255, max = 0;
        for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i] < min) min = dataArray[i];
            if (dataArray[i] > max) max = dataArray[i];
        }
        features.dynamicRange = (max - min) / 255;

        // EXISTING: Frequency band energies
        const bandSize = Math.floor(dataArray.length / 4);
        features.subBass = this.calculateBandEnergy(dataArray, 0, bandSize / 2);
        features.bass = this.calculateBandEnergy(dataArray, bandSize / 2, bandSize);
        features.mid = this.calculateBandEnergy(dataArray, bandSize, bandSize * 2);
        features.highMid = this.calculateBandEnergy(dataArray, bandSize * 2, bandSize * 3);
        features.treble = this.calculateBandEnergy(dataArray, bandSize * 3, dataArray.length);

        // A5 FIX: Set features.energy as alias for beatStrength
        // Many selector branches read features.energy - this was never set before
        features.energy = features.beatStrength;

        // EXISTING: Add to history for trend detection
        this.featureHistory.push(features);
        if (this.featureHistory.length > this.maxHistorySize) {
            this.featureHistory.shift();
        }

        // NEW: Add Meyda spectral features if available
        // TWIN-CRIT-1 FIX: Check AudioContext state before calling get()
        // Mobile browsers auto-suspend AudioContext, causing stale/undefined data
        if (this.meydaAnalyzer && this.audioContext?.state === 'running') {
            try {
                const meydaFeatures = this.meydaAnalyzer.get([
                    'rms', 'spectralCentroid', 'spectralFlux',
                    'spectralFlatness', 'spectralRolloff', 'zcr', 'perceptualSharpness'
                ]);

                if (meydaFeatures && meydaFeatures.spectralFlux !== undefined) {
                    this.fluxHistory.push(meydaFeatures.spectralFlux);
                    if (this.fluxHistory.length > this.FLUX_HISTORY_SIZE) {
                        this.fluxHistory.shift();
                    }
                }

                const avgFlux = this.fluxHistory.length > 0
                    ? this.fluxHistory.reduce((a, b) => a + b, 0) / this.fluxHistory.length
                    : 0;

                // ADD new 'spectral' object to existing features
                // SUG-1 FIX: Use configurable multiplier instead of magic number
                features.spectral = meydaFeatures ? {
                    rms: meydaFeatures.rms || 0,
                    centroid: meydaFeatures.spectralCentroid || 0,
                    flux: meydaFeatures.spectralFlux || 0,
                    flatness: meydaFeatures.spectralFlatness || 0,
                    rolloff: meydaFeatures.spectralRolloff || 0,
                    zcr: meydaFeatures.zcr || 0,
                    sharpness: meydaFeatures.perceptualSharpness || 0,
                    avgFlux: avgFlux,
                    isFluxSpike: meydaFeatures.spectralFlux > avgFlux * this.fluxSpikeMultiplier
                } : null;
            } catch (e) {
                features.spectral = null;
            }
        } else {
            // TWIN-CRIT-1 FIX: Graceful degradation when Meyda unavailable
            // or AudioContext suspended (common on mobile)
            features.spectral = null;
        }

        return features;
    }

    /**
     * Calculate energy in a frequency band
     * @private
     */
    calculateBandEnergy(dataArray, start, end) {
        let sum = 0;
        for (let i = start; i < end && i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        return sum / ((end - start) * 255);
    }

    /**
     * Detect musical events based on audio features and history
     * Enhanced with flux spike detection (WARN-4 FIX)
     * @param {Object} features - Current audio features from calculateFeatures
     * @returns {Object} Detected musical event with type, confidence, details
     */
    detectMusicalEvent(features) {
        const event = {
            type: 'Steady',
            confidence: 0.5,
            details: {}
        };

        // Need history for trend detection
        if (this.featureHistory.length < 5) {
            return event;
        }

        // Get recent history
        const recent = this.featureHistory.slice(-5);
        const older = this.featureHistory.slice(0, 5);

        // Calculate trends
        const recentBass = recent.reduce((sum, f) => sum + (f.bass || 0), 0) / recent.length;
        const olderBass = older.reduce((sum, f) => sum + (f.bass || 0), 0) / older.length;
        const bassChange = recentBass - olderBass;

        const recentEnergy = recent.reduce((sum, f) => sum + (f.beatStrength || 0), 0) / recent.length;
        const olderEnergy = older.reduce((sum, f) => sum + (f.beatStrength || 0), 0) / older.length;
        const energyChange = recentEnergy - olderEnergy;

        // WARN-4 FIX: Combine flux spike with bass change instead of early return
        // This prevents false positives from transient sounds (hand clap, static)
        const hasFluxSpike = features.spectral?.isFluxSpike || false;
        // C1 FIX: Use configurable threshold
        const hasBassIncrease = bassChange > this.dropBassChangeThreshold;

        // Detect drops - ENHANCED with flux spike as confidence booster
        if (features.bass > this.dropThreshold && hasBassIncrease && features.beatDetected) {
            event.type = 'Drop';
            event.confidence = Math.min(1.0, features.bass + bassChange);
            event.details.bassLevel = features.bass;
            event.details.impact = bassChange;

            // Flux spike boosts confidence but doesn't trigger alone
            if (hasFluxSpike) {
                event.confidence = Math.min(1.0, event.confidence + 0.2);
                event.details.fluxSpike = true;
                event.details.fluxImpact = features.spectral.flux / features.spectral.avgFlux;
            }
        }
        // Detect buildups (increasing energy, moderate bass)
        else if (energyChange > 0.1 && recentEnergy > this.buildupThreshold &&
                 features.spectralCentroid > 0.5) {
            event.type = 'Buildup';
            event.confidence = Math.min(1.0, energyChange * 2);
            event.details.energyTrend = energyChange;
            event.details.brightness = features.spectralCentroid;
        }
        // Detect breakdowns (low energy, low bass)
        else if (features.bass < this.breakdownThreshold && features.beatStrength < 0.3) {
            event.type = 'Breakdown';
            event.confidence = 1.0 - features.bass;
            event.details.calmness = 1.0 - features.beatStrength;
        }
        // Detect ambient sections (very low energy, smooth)
        else if (features.dynamicRange < 0.2 && features.zeroCrossingRate < 0.1) {
            event.type = 'Ambient';
            event.confidence = 1.0 - features.dynamicRange;
            event.details.smoothness = 1.0 - features.zeroCrossingRate;
        }
        // High energy sections
        else if (features.beatStrength > 0.7 && features.bass > 0.5) {
            event.type = 'Peak';
            event.confidence = features.beatStrength;
            event.details.intensity = features.beatStrength;
        }

        return event;
    }

    /**
     * Onset detection for BPM calculation
     * Uses energy-based onset detection with adaptive threshold
     *
     * B5 LIMITATION: Only analyzes the chunk passed in (typically first 10 seconds).
     * Tracks with slow intros (e.g., piano → drums at 1:30) may report inaccurate BPM.
     * For production use, consider sampling multiple chunks across the buffer.
     *
     * @private
     * @param {Float32Array} channelData - Audio samples to analyze
     * @param {number} sampleRate - Sample rate in Hz
     * @returns {number[]} Array of onset times in seconds
     */
    _detectOnsets(channelData, sampleRate) {
        const onsets = [];
        const windowSize = Math.floor(sampleRate * 0.01); // 10ms windows
        let prevEnergy = 0;
        // C1 FIX: Use configurable threshold
        const threshold = this.onsetThreshold;
        const energyFloor = this.onsetEnergyFloor;

        for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
            let energy = 0;
            for (let j = 0; j < windowSize; j++) {
                energy += channelData[i + j] ** 2;
            }
            energy /= windowSize;

            // Onset = significant energy increase above minimum threshold
            if (energy > prevEnergy * threshold && energy > energyFloor) {
                onsets.push(i / sampleRate);
            }
            prevEnergy = energy;
        }
        return onsets;
    }

    /**
     * Detect BPM from audio buffer (call once when audio loads)
     * CRIT-2 FIX: Added graceful degradation when detection fails
     * @param {AudioBuffer} audioBuffer - The audio buffer to analyze
     * @returns {number|null} Detected BPM or null if detection fails
     */
    async detectBPM(audioBuffer) {
        if (!audioBuffer || audioBuffer.length === 0) {
            console.warn('[Analyzer] Empty audio buffer, BPM detection skipped');
            this.detectedBPM = null;
            return null;
        }

        try {
            const channelData = audioBuffer.getChannelData(0);
            const sampleRate = audioBuffer.sampleRate;

            // Analyze onsets in 10-second chunks (or full buffer if shorter)
            const chunkSize = Math.min(sampleRate * 10, channelData.length);
            const onsets = this._detectOnsets(channelData.slice(0, chunkSize), sampleRate);

            // Need at least 4 onsets for reliable interval calculation
            if (onsets.length < 4) {
                console.warn('[Analyzer] Insufficient onsets for BPM detection, using fallback');
                this.detectedBPM = null;
                return null;
            }

            // Calculate intervals between onsets - use MEDIAN for robustness (not average)
            const intervals = [];
            for (let i = 1; i < onsets.length; i++) {
                intervals.push(onsets[i] - onsets[i-1]);
            }

            // Sort and take median (more robust than average against outliers)
            intervals.sort((a, b) => a - b);
            const medianInterval = intervals[Math.floor(intervals.length / 2)];

            this.detectedBPM = 60 / medianInterval;

            // A3 FIX: Iterative BPM clamping to handle extreme values (e.g., 25 → 50 → 100)
            while (this.detectedBPM < 60) this.detectedBPM *= 2;
            while (this.detectedBPM > 180) this.detectedBPM /= 2;

            // A1 FIX: Derive beatInterval from clamped BPM, not raw median
            // Previously beatInterval was set before clamp, causing 2x timing errors
            this.beatInterval = 60000 / this.detectedBPM;

            return this.detectedBPM;
        } catch (e) {
            console.warn('[Analyzer] BPM detection failed:', e.message);
            this.detectedBPM = null;
            return null;
        }
    }

    /**
     * Track beat, bar, and phrase position (call every frame)
     * WARN-1 FIX: Accept audioContextTime parameter for accurate sync
     * @param {number|null} audioContextTime - audioContext.currentTime in seconds
     * @returns {Object|null} Beat timing info or null if no BPM detected
     */
    trackBeatPhase(audioContextTime = null) {
        if (!this.detectedBPM) return null;

        // Prefer audioContext.currentTime (high-priority thread, no drift)
        // Fall back to performance.now() if not provided
        const now = audioContextTime !== null ?
            audioContextTime * 1000 : performance.now();
        const timeSinceLastBeat = now - this.lastBeatTime;

        // A2 FIX: Handle multiple beats elapsed (tab pause, GC stall, frame drops)
        // O(1) arithmetic — previously a for-loop that ran beatsElapsed times,
        // pathological for long tab suspensions (e.g. 1 hour @ 120 BPM = 7200 iterations).
        if (timeSinceLastBeat >= this.beatInterval) {
            const beatsElapsed = Math.floor(timeSinceLastBeat / this.beatInterval);
            this.lastBeatTime = now - (timeSinceLastBeat % this.beatInterval);

            const barsPerPhrase = this.phraseLength / 4;
            const totalBeats = this.beatPosition + beatsElapsed;
            const barAdvances = Math.floor(totalBeats / 4);
            this.beatPosition = totalBeats % 4;
            this.barPosition = (this.barPosition + barAdvances) % barsPerPhrase;
        }

        this.beatPhase = timeSinceLastBeat / this.beatInterval;
        // A4 FIX: Use actual phraseLength (may be 16/32/64 depending on genre)
        const phrasePosition = (this.barPosition * 4) + this.beatPosition;

        return {
            bpm: this.detectedBPM,
            beatPhase: this.beatPhase,
            beatPosition: this.beatPosition,        // 0-3: beat within bar
            barPosition: this.barPosition,          // 0-(barsPerPhrase-1): bar within phrase
            phrasePosition: phrasePosition,         // 0-(phraseLength-1): beat within phrase
            phraseLength: this.phraseLength,        // Current phrase length (genre-dependent)
            isBarBoundary: this.beatPosition === 0 && this.beatPhase < 0.1,
            isPhraseBoundary: phrasePosition === 0 && this.beatPhase < 0.1
        };
    }

    /**
     * Detect if we're in a buildup leading to a drop
     * TWIN-CRIT-2 FIX: Accept audioContextTime for consistent timing
     * Mixing performance.now() and audioContext.currentTime causes drift
     * @param {Object} features - Current audio features
     * @param {number|null} audioContextTime - audioContext.currentTime in seconds
     * @returns {Object} Buildup detection result
     */
    detectBuildup(features, audioContextTime = null) {
        // Use audioContext.currentTime when available (high-priority thread, no drift)
        const timestamp = audioContextTime !== null ?
            audioContextTime * 1000 : performance.now();

        // C3: features.energy is now always set (A5 alias for beatStrength),
        // so the previous `features.energy || features.beatStrength || 0`
        // fallback chain is redundant.
        this.buildupHistory.push({
            energy: features.energy || 0,
            spectralCentroid: features.spectralCentroid || 0,
            timestamp: timestamp
        });

        if (this.buildupHistory.length > this.BUILDUP_HISTORY_SIZE) {
            this.buildupHistory.shift();
        }

        if (this.buildupHistory.length < 30) {
            return { isBuildup: false, confidence: 0, dropETA: null };
        }

        // Compare first half to second half - rising energy + brightness = buildup
        const midpoint = Math.floor(this.buildupHistory.length / 2);
        const firstHalf = this.buildupHistory.slice(0, midpoint);
        const secondHalf = this.buildupHistory.slice(midpoint);

        const firstAvgEnergy = firstHalf.reduce((s, h) => s + h.energy, 0) / firstHalf.length;
        const secondAvgEnergy = secondHalf.reduce((s, h) => s + h.energy, 0) / secondHalf.length;
        const firstAvgCentroid = firstHalf.reduce((s, h) => s + h.spectralCentroid, 0) / firstHalf.length;
        const secondAvgCentroid = secondHalf.reduce((s, h) => s + h.spectralCentroid, 0) / secondHalf.length;

        const energyRising = secondAvgEnergy > firstAvgEnergy + 0.1;
        const brightnessRising = secondAvgCentroid > firstAvgCentroid + 0.05;

        if (energyRising && brightnessRising && secondAvgEnergy > 0.5) {
            return {
                isBuildup: true,
                confidence: Math.min(1.0, (secondAvgEnergy - firstAvgEnergy) * 2),
                dropETA: this.beatInterval * 8, // ~2 bars until drop
                energyTrend: secondAvgEnergy - firstAvgEnergy
            };
        }

        return { isBuildup: false, confidence: 0, dropETA: null };
    }

    /**
     * Detect current audio mood based on spectral features
     * CRIT-5 FIX: Use actual property names from analyzer output
     * v2.1: Added support for new mood types (mystical, hypnotic, psychedelic, dreamy, meditative)
     * @param {Object} features - Current audio features
     * @returns {Object} Mood detection result with label and confidence
     */
    detectMood(features) {
        if (!features.spectral) return { label: 'neutral', confidence: 0.5 };

        // CRIT-5 FIX: Use actual property names from calculateFeatures()
        // C2 FIX: Removed stale eslint-disable - all destructured variables are now used
        const { bass, mid, treble, beatStrength, dynamicRange, zeroCrossingRate } = features;
        const { centroid, flatness, sharpness, flux, rolloff } = features.spectral;

        // Use normalized energy (beatStrength) instead of absolute volume
        // This makes mood detection volume-invariant
        const energy = beatStrength || 0;

        let mood = { label: 'neutral', confidence: 0.5 };

        // ============================================
        // PRIMARY MOODS (original 5)
        // ============================================

        // High energy + bass = aggressive (volume-invariant)
        if (bass > 0.7 && energy > 0.6 && (sharpness || 0) > 0.5) {
            mood = { label: 'aggressive', confidence: 0.7 + (bass * 0.3) };
        }
        // Low energy + low brightness = relaxed
        else if (energy < 0.3 && centroid < 0.4 && (flatness || 0) < 0.3) {
            mood = { label: 'relaxed', confidence: 0.6 + ((1 - energy) * 0.3) };
        }
        // High brightness + mid energy = happy
        else if (centroid > 0.6 && treble > 0.5 && energy > 0.4) {
            mood = { label: 'happy', confidence: 0.6 + (centroid * 0.2) };
        }
        // High flatness = electronic
        else if ((flatness || 0) > 0.5 && bass > 0.5) {
            mood = { label: 'electronic', confidence: 0.6 + ((flatness || 0) * 0.3) };
        }
        // Low flatness + mid-focused = acoustic
        else if ((flatness || 0) < 0.25 && mid > bass && mid > treble) {
            mood = { label: 'acoustic', confidence: 0.55 };
        }

        // ============================================
        // EXTENDED MOODS (v2.1 - new mood types)
        // These provide more nuanced detection when primary moods don't match strongly
        // B3 FIX: Independent if blocks allow all candidates to compete fairly
        // Previously else-if chain only evaluated the first matching branch
        // ============================================

        // Only check extended moods if primary mood confidence is low
        if (mood.confidence < 0.65) {
            // Meditative: Very calm, minimal activity
            if (energy < 0.2 && (sharpness || 0) < 0.2 && (dynamicRange || 0) < 0.25) {
                const conf = 0.6 + ((1 - energy) * 0.2) + ((1 - (sharpness || 0)) * 0.1);
                if (conf > mood.confidence) {
                    mood = { label: 'meditative', confidence: Math.min(0.9, conf) };
                }
            }
            // Dreamy: Soft, floating, ethereal
            if (energy < 0.35 && (sharpness || 0) < 0.3 && centroid > 0.5 && bass < 0.4) {
                const conf = 0.55 + (centroid * 0.2) + ((1 - bass) * 0.1);
                if (conf > mood.confidence) {
                    mood = { label: 'dreamy', confidence: Math.min(0.85, conf) };
                }
            }
            // Hypnotic: Repetitive, trance-inducing, steady
            if (energy > 0.3 && energy < 0.6 && (dynamicRange || 0) < 0.3 && mid > 0.4) {
                const conf = 0.55 + ((1 - (dynamicRange || 0)) * 0.2) + (mid * 0.1);
                if (conf > mood.confidence) {
                    mood = { label: 'hypnotic', confidence: Math.min(0.8, conf) };
                }
            }
            // Mystical: Ethereal, otherworldly
            if (energy < 0.5 && (flatness || 0) < 0.3 && (rolloff || 0) > 0.5 && (sharpness || 0) < 0.4) {
                const conf = 0.5 + ((rolloff || 0) * 0.2) + ((1 - (flatness || 0)) * 0.15);
                if (conf > mood.confidence) {
                    mood = { label: 'mystical', confidence: Math.min(0.8, conf) };
                }
            }
            // Psychedelic: Trippy, constantly evolving, high variation
            if ((flux || 0) > 0.3 && (dynamicRange || 0) > 0.4 && treble > 0.4 && (flatness || 0) > 0.3) {
                const conf = 0.5 + ((flux || 0) * 0.2) + ((dynamicRange || 0) * 0.15);
                if (conf > mood.confidence) {
                    mood = { label: 'psychedelic', confidence: Math.min(0.8, conf) };
                }
            }
        }

        return mood;
    }

    /**
     * Detect music genre based on audio characteristics
     * Used for genre-specific timing adjustments
     * @param {Object} features - Current audio features
     * @returns {Object} Genre detection with label, confidence, and timing multiplier
     */
    detectGenre(features) {
        const bpm = this.detectedBPM;
        const { bass, mid, treble, beatStrength } = features;
        const spectral = features.spectral || {};
        const flatness = spectral.flatness || 0;
        const sharpness = spectral.sharpness || 0;

        // Default genre detection result
        let genre = {
            label: 'unknown',
            confidence: 0.5,
            timingMultiplier: 1.0,  // Multiplier for switch intervals
            phraseLength: 16        // Standard 16-beat phrases
        };

        // EDM/Electronic: 120-140 BPM, high flatness (synthetic sounds), heavy bass
        if (bpm && bpm >= 118 && bpm <= 145 && flatness > 0.4 && bass > 0.5) {
            genre = {
                label: 'edm',
                confidence: 0.6 + (flatness * 0.2) + ((bass > 0.7) ? 0.1 : 0),
                timingMultiplier: 0.7,  // Faster switching for high-energy EDM
                phraseLength: 16        // Standard 16-beat phrases
            };
        }
        // Dubstep/Bass: 140-150 BPM (or half-time 70-75), very heavy bass, sharp transients
        else if (bpm && ((bpm >= 138 && bpm <= 155) || (bpm >= 69 && bpm <= 78)) &&
                 bass > 0.7 && sharpness > 0.5) {
            genre = {
                label: 'dubstep',
                confidence: 0.6 + (bass * 0.2),
                timingMultiplier: 0.8,  // Quick switching for drops
                phraseLength: 32        // Longer build-drop cycles
            };
        }
        // Hip-Hop/Trap: 80-115 BPM, strong bass, percussive
        else if (bpm && bpm >= 78 && bpm <= 118 && bass > 0.5 && beatStrength > 0.5) {
            genre = {
                label: 'hiphop',
                confidence: 0.55 + (bass * 0.2),
                timingMultiplier: 0.9,
                phraseLength: 16
            };
        }
        // Rock/Alternative: 100-140 BPM, mid-focused, moderate flatness
        else if (bpm && bpm >= 98 && bpm <= 145 && mid > bass && mid > treble && flatness < 0.5) {
            genre = {
                label: 'rock',
                confidence: 0.5 + ((mid - bass) * 0.3),
                timingMultiplier: 1.0,  // Standard timing
                phraseLength: 16
            };
        }
        // Classical/Orchestral: Variable BPM, low flatness (organic), high dynamic range
        else if (flatness < 0.25 && features.dynamicRange > 0.5 && beatStrength < 0.4) {
            genre = {
                label: 'classical',
                confidence: 0.5 + (features.dynamicRange * 0.3),
                timingMultiplier: 1.5,  // Much slower switching for classical
                phraseLength: 32        // Longer musical phrases
            };
        }
        // Ambient/Chill: Low energy, low brightness, minimal beat
        else if (beatStrength < 0.3 && features.spectralCentroid < 0.4 &&
                 features.dynamicRange < 0.3) {
            genre = {
                label: 'ambient',
                confidence: 0.55 + ((1 - beatStrength) * 0.2),
                timingMultiplier: 2.0,  // Very slow switching for ambient
                phraseLength: 64        // Extended ambient sections
            };
        }
        // Pop/Dance: 100-130 BPM, balanced spectrum, regular beats
        else if (bpm && bpm >= 98 && bpm <= 132 && beatStrength > 0.4 &&
                 Math.abs(bass - treble) < 0.2) {
            genre = {
                label: 'pop',
                confidence: 0.5,
                timingMultiplier: 1.0,
                phraseLength: 16
            };
        }

        // A4 FIX: Update phraseLength when genre detected (with hysteresis)
        // Only adopt a new phraseLength when genre confidence is high enough.
        // Without this gate, a single 'unknown'-genre frame would flip the
        // tracker to 16 mid-track, causing visible phrase-boundary artifacts
        // for genres with longer phrases (dubstep 32, ambient 64).
        if (genre.confidence >= this.genreConfidenceThreshold &&
            genre.phraseLength !== this.phraseLength) {
            // Clamp barPosition to the new range so a 7-of-8 position under
            // a 32-beat phrase doesn't become out-of-range under a 16-beat one.
            const newBarsPerPhrase = genre.phraseLength / 4;
            this.barPosition = this.barPosition % newBarsPerPhrase;
            this.phraseLength = genre.phraseLength;
        }

        return genre;
    }

    /**
     * Reset analyzer history
     */
    reset() {
        this.featureHistory = [];
        this.fluxHistory = [];
        this.buildupHistory = [];
        this.beatPosition = 0;
        this.barPosition = 0;
        this.lastBeatTime = 0;
    }

    /**
     * Get current feature trends with Gaussian smoothing applied
     * Smoothing reduces frame-to-frame jitter while preserving genuine musical changes
     */
    getTrends() {
        if (this.featureHistory.length < 10) {
            return null;
        }

        // Apply Gaussian smoothing to reduce noise before trend calculation
        const smoothedBass = this._smoothFeatureHistory(this.featureHistory, 'bass');
        const smoothedEnergy = this._smoothFeatureHistory(this.featureHistory, 'beatStrength');
        const smoothedBrightness = this._smoothFeatureHistory(this.featureHistory, 'spectralCentroid');
        const smoothedPercussion = this._smoothFeatureHistory(this.featureHistory, 'zeroCrossingRate');

        // Need enough smoothed samples for trend comparison
        if (smoothedBass.length < 10) {
            // Fall back to unsmoothed comparison if not enough data
            const recent = this.featureHistory.slice(-5);
            const older = this.featureHistory.slice(-10, -5);
            return {
                bass: this.calculateTrend(older, recent, 'bass'),
                energy: this.calculateTrend(older, recent, 'beatStrength'),
                brightness: this.calculateTrend(older, recent, 'spectralCentroid'),
                percussion: this.calculateTrend(older, recent, 'zeroCrossingRate')
            };
        }

        return {
            bass: this._calculateSmoothedTrend(smoothedBass),
            energy: this._calculateSmoothedTrend(smoothedEnergy),
            brightness: this._calculateSmoothedTrend(smoothedBrightness),
            percussion: this._calculateSmoothedTrend(smoothedPercussion)
        };
    }

    /**
     * Calculate trend from smoothed values array
     * @private
     */
    _calculateSmoothedTrend(smoothedValues) {
        const midpoint = Math.floor(smoothedValues.length / 2);
        const older = smoothedValues.slice(0, midpoint);
        const recent = smoothedValues.slice(midpoint);

        const oldAvg = older.reduce((a, b) => a + b, 0) / older.length;
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const change = recentAvg - oldAvg;

        // C1 FIX: Use configurable threshold
        if (Math.abs(change) < this.trendStabilityThreshold) return 'stable';
        return change > 0 ? 'rising' : 'falling';
    }

    /**
     * Calculate trend for a specific feature
     * @private
     */
    calculateTrend(older, recent, feature) {
        const oldAvg = older.reduce((sum, f) => sum + (f[feature] || 0), 0) / older.length;
        const recentAvg = recent.reduce((sum, f) => sum + (f[feature] || 0), 0) / recent.length;
        const change = recentAvg - oldAvg;

        // C1 FIX: Use configurable threshold
        if (Math.abs(change) < this.trendStabilityThreshold) return 'stable';
        return change > 0 ? 'rising' : 'falling';
    }

    /**
     * Clean up Meyda analyzer and resources
     */
    destroy() {
        if (this.meydaAnalyzer) {
            this.meydaAnalyzer.stop();
            this.meydaAnalyzer = null;
        }
        this._meydaReady = false;
        this.fluxHistory = [];
        this.buildupHistory = [];
        this.featureHistory = [];
    }
}

export default AdvancedAudioAnalyzer;
