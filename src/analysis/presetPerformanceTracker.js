/**
 * PresetPerformanceTracker
 * Tracks how well the current preset matches ongoing audio.
 * Triggers switch when match quality degrades below threshold.
 *
 * SUGG-1 FIX: Extracted from intelligentPresetSelector.js for better modularity
 * CRIT-6 FIX: Does NOT compute its own scores - accepts scores from scorePreset()
 */
export class PresetPerformanceTracker {
    constructor(config = {}) {
        this.scoreHistory = [];
        this.maxHistorySize = config.maxHistorySize || 60;  // ~1 second at 60fps
        this.degradationThreshold = config.degradationThreshold || 0.4;  // 40% drop triggers switch

        // WARN-6 FIX: Use first N scores for stable baseline (not single value)
        this.baselineScores = [];
        this.BASELINE_SIZE = 30;  // First 0.5 seconds for baseline
    }

    /**
     * Update performance tracking with score from scorePreset()
     * CRIT-6 FIX: Accepts pre-calculated score, doesn't compute its own
     *
     * @param {number} currentScore - Score from main scorePreset() function
     * @returns {Object} { shouldSwitch, degradation, reason }
     */
    update(currentScore) {
        if (currentScore === undefined || currentScore === null) {
            return { shouldSwitch: false, degradation: 0, reason: null };
        }

        // WARN-6 FIX: Build baseline from first N scores (more stable than single value)
        if (this.baselineScores.length < this.BASELINE_SIZE) {
            this.baselineScores.push(currentScore);
            return { shouldSwitch: false, degradation: 0, reason: 'building_baseline' };
        }

        // Track ongoing score history
        this.scoreHistory.push(currentScore);
        if (this.scoreHistory.length > this.maxHistorySize) {
            this.scoreHistory.shift();
        }

        // Need enough history to detect degradation
        if (this.scoreHistory.length < 30) {
            return { shouldSwitch: false, degradation: 0, reason: null };
        }

        // Calculate baseline from first N scores (stable reference point)
        const baseline = this.baselineScores.reduce((a, b) => a + b, 0) /
                         this.baselineScores.length;

        // Calculate current average score
        const current = this.scoreHistory.reduce((a, b) => a + b, 0) /
                        this.scoreHistory.length;

        // Calculate degradation from baseline
        const degradation = baseline > 0 ? (baseline - current) / baseline : 0;

        if (degradation > this.degradationThreshold) {
            return {
                shouldSwitch: true,
                degradation: degradation,
                reason: `performance_degraded_${(degradation * 100).toFixed(0)}%`,
                baseline: baseline,
                current: current
            };
        }

        return { shouldSwitch: false, degradation, baseline, current };
    }

    /**
     * Reset tracking (call when switching presets)
     */
    reset() {
        this.scoreHistory = [];
        this.baselineScores = [];
    }
}

export default PresetPerformanceTracker;
