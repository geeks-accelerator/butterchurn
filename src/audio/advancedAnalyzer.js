/**
 * Advanced Audio Analyzer
 * Provides sophisticated audio feature extraction for music visualization
 * Including beat detection, spectral analysis, and musical event detection
 */
export class AdvancedAudioAnalyzer {
    /**
     * Initialize the audio analyzer with configurable thresholds
     * @param {Object} config - Configuration object with optional threshold values
     */
    constructor(config = {}) {
        // History for trend detection
        this.featureHistory = [];
        this.maxHistorySize = config.maxHistorySize || 30;

        // Event detection thresholds - now configurable
        this.dropThreshold = config.dropThreshold || 0.7;
        this.buildupThreshold = config.buildupThreshold || 0.5;
        this.breakdownThreshold = config.breakdownThreshold || 0.3;
        this.chillThreshold = config.chillThreshold || 0.3;

        // Feature weights - configurable
        this.bassWeight = config.bassWeight || 0.6;
        this.trebleWeight = config.trebleWeight || 0.3;
    }

    /**
     * Calculate advanced audio features from frequency and time domain data
     * @param {Uint8Array|Float32Array} dataArray - Frequency domain data (0-255 or 0-1.0)
     * @param {Uint8Array} timeByteArray - Time domain data (waveform)
     * @returns {Object} Extracted audio features including:
     *   - energy: Overall energy level (0-1)
     *   - bassEnergy: Low frequency energy (0-1)
     *   - midEnergy: Mid frequency energy (0-1)
     *   - trebleEnergy: High frequency energy (0-1)
     *   - spectralCentroid: Brightness indicator (Hz)
     *   - zeroCrossingRate: Percussion/noise indicator (0-1)
     *   - energyVariance: Dynamics indicator (0-1)
     *   - beatStrength: Beat detection strength (0-1)
     */
    calculateFeatures(dataArray, timeByteArray) {
        const features = {};

        // Beat detection - look for sudden amplitude changes
        let maxAmp = 0;
        let beatThreshold = 0;
        for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i] > maxAmp) maxAmp = dataArray[i];
            beatThreshold += dataArray[i];
        }
        beatThreshold = beatThreshold / dataArray.length * 1.5;
        features.beatDetected = maxAmp > beatThreshold;
        features.beatStrength = Math.min(1.0, maxAmp / 255);

        // Spectral centroid - brightness indicator
        let weightedSum = 0;
        let magnitudeSum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            weightedSum += i * dataArray[i];
            magnitudeSum += dataArray[i];
        }
        features.spectralCentroid = magnitudeSum > 0 ?
            (weightedSum / magnitudeSum) / dataArray.length : 0;

        // Zero crossing rate - percussive content detector
        let zeroCrossings = 0;
        for (let i = 1; i < timeByteArray.length; i++) {
            const prev = timeByteArray[i - 1] - 128;
            const curr = timeByteArray[i] - 128;
            if ((prev < 0 && curr >= 0) || (prev >= 0 && curr < 0)) {
                zeroCrossings++;
            }
        }
        features.zeroCrossingRate = zeroCrossings / timeByteArray.length;

        // Dynamic range
        let min = 255, max = 0;
        for (let i = 0; i < dataArray.length; i++) {
            if (dataArray[i] < min) min = dataArray[i];
            if (dataArray[i] > max) max = dataArray[i];
        }
        features.dynamicRange = (max - min) / 255;

        // Frequency band energies (for more detailed analysis)
        const bandSize = Math.floor(dataArray.length / 4);
        features.subBass = this.calculateBandEnergy(dataArray, 0, bandSize / 2);
        features.bass = this.calculateBandEnergy(dataArray, bandSize / 2, bandSize);
        features.mid = this.calculateBandEnergy(dataArray, bandSize, bandSize * 2);
        features.highMid = this.calculateBandEnergy(dataArray, bandSize * 2, bandSize * 3);
        features.treble = this.calculateBandEnergy(dataArray, bandSize * 3, dataArray.length);

        // Add to history for trend detection
        this.featureHistory.push(features);
        if (this.featureHistory.length > this.maxHistorySize) {
            this.featureHistory.shift();
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
     * @param {Object} features - Current audio features from calculateFeatures
     * @returns {String} Detected musical event type:
     *   - 'drop': High energy bass-heavy section (club drops, beat drops)
     *   - 'buildup': Rising energy leading to a drop
     *   - 'breakdown': Lower energy melodic section
     *   - 'chill': Low energy ambient section
     *   - 'normal': No specific event detected
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

        // Detect drops (sudden increase in bass and energy)
        if (features.bass > this.dropThreshold && bassChange > 0.3 && features.beatDetected) {
            event.type = 'Drop';
            event.confidence = Math.min(1.0, features.bass + bassChange);
            event.details.bassLevel = features.bass;
            event.details.impact = bassChange;
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
     * Reset analyzer history
     */
    reset() {
        this.featureHistory = [];
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
}

export default AdvancedAudioAnalyzer;