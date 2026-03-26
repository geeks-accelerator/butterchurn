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
        this.meydaReady = false;

        // Initialize Meyda asynchronously if audio context provided
        if (audioContext && source) {
            this._initMeyda(audioContext, source);
        }

        // NEW: Flux history for spike detection
        this.fluxHistory = [];
        this.FLUX_HISTORY_SIZE = 30;

        // SUG-1 FIX: Make flux spike multiplier configurable
        this.fluxSpikeMultiplier = config.fluxSpikeMultiplier || 2.5;

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
        this.buildupHistory = [];
        this.BUILDUP_HISTORY_SIZE = 60; // ~1 second at 60fps
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
            this.meydaReady = true;
        } catch (e) {
            console.warn('[AdvancedAnalyzer] Meyda init failed:', e.message);
        }
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
        const hasBassIncrease = bassChange > 0.2;

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
     * CRIT-2 FIX: Implement _detectOnsets method (was missing)
     * Uses energy-based onset detection with adaptive threshold
     * @private
     */
    _detectOnsets(channelData, sampleRate) {
        const onsets = [];
        const windowSize = Math.floor(sampleRate * 0.01); // 10ms windows
        let prevEnergy = 0;
        const threshold = 1.5; // Energy must increase by 50%

        for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
            let energy = 0;
            for (let j = 0; j < windowSize; j++) {
                energy += channelData[i + j] ** 2;
            }
            energy /= windowSize;

            // Onset = significant energy increase above minimum threshold
            if (energy > prevEnergy * threshold && energy > 0.01) {
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
            this.beatInterval = medianInterval * 1000;

            // Clamp to reasonable BPM range
            if (this.detectedBPM < 60) this.detectedBPM *= 2;
            if (this.detectedBPM > 180) this.detectedBPM /= 2;

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

        if (timeSinceLastBeat >= this.beatInterval) {
            this.lastBeatTime = now - (timeSinceLastBeat % this.beatInterval);
            this.beatPosition = (this.beatPosition + 1) % 4;
            if (this.beatPosition === 0) {
                this.barPosition = (this.barPosition + 1) % 4;
            }
        }

        this.beatPhase = timeSinceLastBeat / this.beatInterval;
        const phrasePosition = (this.barPosition * 4) + this.beatPosition; // 0-15

        return {
            bpm: this.detectedBPM,
            beatPhase: this.beatPhase,
            beatPosition: this.beatPosition,        // 0-3: beat within bar
            barPosition: this.barPosition,          // 0-3: bar within phrase
            phrasePosition: phrasePosition,         // 0-15: beat within phrase
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

        this.buildupHistory.push({
            energy: features.energy || features.beatStrength || 0,
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
        // ============================================

        // Only check extended moods if primary mood confidence is low
        if (mood.confidence < 0.65) {
            // Meditative: Very calm, minimal activity
            // Characteristics: very low energy, smooth (low ZCR), low dynamics
            if (energy < 0.2 && (sharpness || 0) < 0.2 && (dynamicRange || 0) < 0.25) {
                const conf = 0.6 + ((1 - energy) * 0.2) + ((1 - (sharpness || 0)) * 0.1);
                if (conf > mood.confidence) {
                    mood = { label: 'meditative', confidence: Math.min(0.9, conf) };
                }
            }
            // Dreamy: Soft, floating, ethereal
            // Characteristics: low energy, low sharpness, high centroid (bright but soft), low bass
            else if (energy < 0.35 && (sharpness || 0) < 0.3 && centroid > 0.5 && bass < 0.4) {
                const conf = 0.55 + (centroid * 0.2) + ((1 - bass) * 0.1);
                if (conf > mood.confidence) {
                    mood = { label: 'dreamy', confidence: Math.min(0.85, conf) };
                }
            }
            // Hypnotic: Repetitive, trance-inducing, steady
            // Characteristics: moderate energy, low dynamic range (consistent), mid-focused
            else if (energy > 0.3 && energy < 0.6 && (dynamicRange || 0) < 0.3 && mid > 0.4) {
                const conf = 0.55 + ((1 - (dynamicRange || 0)) * 0.2) + (mid * 0.1);
                if (conf > mood.confidence) {
                    mood = { label: 'hypnotic', confidence: Math.min(0.8, conf) };
                }
            }
            // Mystical: Ethereal, otherworldly
            // Characteristics: low-moderate energy, organic (low flatness), bright (high rolloff), soft
            else if (energy < 0.5 && (flatness || 0) < 0.3 && (rolloff || 0) > 0.5 && (sharpness || 0) < 0.4) {
                const conf = 0.5 + ((rolloff || 0) * 0.2) + ((1 - (flatness || 0)) * 0.15);
                if (conf > mood.confidence) {
                    mood = { label: 'mystical', confidence: Math.min(0.8, conf) };
                }
            }
            // Psychedelic: Trippy, constantly evolving, high variation
            // Characteristics: high flux (changing), high dynamic range, mid-high treble, moderate+ flatness
            else if ((flux || 0) > 0.3 && (dynamicRange || 0) > 0.4 && treble > 0.4 && (flatness || 0) > 0.3) {
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
     * Get current feature trends
     */
    getTrends() {
        if (this.featureHistory.length < 10) {
            return null;
        }

        const recent = this.featureHistory.slice(-5);
        const older = this.featureHistory.slice(-10, -5);

        return {
            bass: this.calculateTrend(older, recent, 'bass'),
            energy: this.calculateTrend(older, recent, 'beatStrength'),
            brightness: this.calculateTrend(older, recent, 'spectralCentroid'),
            percussion: this.calculateTrend(older, recent, 'zeroCrossingRate')
        };
    }

    /**
     * Calculate trend for a specific feature
     * @private
     */
    calculateTrend(older, recent, feature) {
        const oldAvg = older.reduce((sum, f) => sum + (f[feature] || 0), 0) / older.length;
        const recentAvg = recent.reduce((sum, f) => sum + (f[feature] || 0), 0) / recent.length;
        const change = recentAvg - oldAvg;

        if (Math.abs(change) < 0.05) return 'stable';
        return change > 0 ? 'rising' : 'falling';
    }

    /**
     * Recommend optimal FFT size based on device capabilities and preset complexity
     * Note: The actual AudioProcessor uses fixed 2048 samples (CLAUDE.md requirement)
     * This method provides recommendations for future optimization or manual configuration
     *
     * @param {Object} deviceCapabilities - Device info from IntelligentPresetSelector.detectDeviceTier()
     * @param {number} presetComplexity - Complexity score from preset fingerprint (0-1)
     * @returns {Object} FFT recommendation with size, reason, and confidence
     */
    recommendFFTSize(deviceCapabilities = {}, presetComplexity = 0.5) {
        const tier = deviceCapabilities.tier || 'medium';
        const cores = deviceCapabilities.cores || 4;
        const memory = deviceCapabilities.memory || 4;

        // Default: 2048 (CLAUDE.md requirement: never go below this)
        let recommended = 2048;
        let reason = 'Default optimal balance';
        let confidence = 0.8;

        // High-end devices with low-complexity presets can use larger FFT
        if (tier === 'high-end' && cores >= 8 && memory >= 8) {
            if (presetComplexity < 0.5) {
                recommended = 4096;
                reason = 'High-end device with simple preset - maximum frequency resolution';
                confidence = 0.9;
            } else {
                recommended = 2048;
                reason = 'High-end device but complex preset - balanced performance';
                confidence = 0.85;
            }
        }
        // Medium devices - stick with default
        else if (tier === 'medium' || tier === 'integrated') {
            recommended = 2048;
            reason = 'Medium device - standard FFT for reliable performance';
            confidence = 0.8;
        }
        // Low-end devices - still use 2048 per CLAUDE.md, but flag as potentially stressed
        else if (tier === 'low-end') {
            recommended = 2048;
            reason = 'Low-end device - minimum recommended (cannot go lower per CLAUDE.md)';
            confidence = 0.6;
        }

        return {
            recommendedSize: recommended,
            currentSize: 2048,  // AudioProcessor fixed size
            reason,
            confidence,
            canUpgrade: recommended > 2048,
            deviceTier: tier,
            presetComplexity
        };
    }

    /**
     * Clean up Meyda analyzer and resources
     */
    destroy() {
        if (this.meydaAnalyzer) {
            this.meydaAnalyzer.stop();
            this.meydaAnalyzer = null;
        }
        this.meydaReady = false;
        this.fluxHistory = [];
        this.buildupHistory = [];
        this.featureHistory = [];
    }
}

export default AdvancedAudioAnalyzer;
