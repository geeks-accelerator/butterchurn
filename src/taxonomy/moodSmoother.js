/**
 * Mood Smoother
 *
 * §G2 (plan: docs/plans/2026-06-12-butterchurn-taxonomy-improvements.md):
 *   detectMood() runs per frame. Individual frames are noisy — a single
 *   ambiguous frame can flip the label and (post Phase 9 item 2) queue a
 *   pendingSwitchOnPhrase. Smoothing over a Gaussian-weighted window of
 *   recent detections suppresses single-frame jitter while preserving real
 *   transitions (which sustain across many frames).
 *
 * Mirrors the trend-smoothing pattern from advancedAnalyzer.getTrends() — the
 * Gaussian kernel itself uses the same formula and defaults the same way.
 *
 * Algorithm:
 *   1. Push each frame's {label, confidence} into a ring buffer
 *   2. Compute, per label, the Gaussian-weighted sum of confidences
 *      (more weight to more recent frames, peak at center per the kernel)
 *   3. Return {label, confidence} = {argmax label, normalized winning weight}
 *
 * Behaviors worth noting:
 *   - On a sustained transition (e.g. relaxed → aggressive holds for 8+ frames),
 *     the smoothed label updates after ~window/2 frames — the same lag a
 *     centered Gaussian kernel produces for any peak.
 *   - On a single-frame outlier, the outlier's contribution is bounded by
 *     its single Gaussian weight (< 0.5 of the kernel for the central tap),
 *     so it cannot dominate when 2+ neighboring frames disagree.
 *   - Returns null until at least one frame is pushed. The caller already
 *     handles `mood = null` (matcher's Stage 1 falls through, scoreContinuous
 *     gives moodScore = 0), so cold start is safe.
 */

// Generate a normalized Gaussian kernel for smoothing.
// Same formula as advancedAnalyzer._generateGaussianKernel.
function generateGaussianKernel(size, sigma = 1.0) {
    const kernel = [];
    const center = Math.floor(size / 2);
    let sum = 0;
    for (let i = 0; i < size; i++) {
        const x = i - center;
        const value = Math.exp(-(x * x) / (2 * sigma * sigma));
        kernel.push(value);
        sum += value;
    }
    return kernel.map(v => v / sum);
}

export class MoodSmoother {
    /**
     * @param {Object} [options]
     * @param {number} [options.windowSize=11] — number of frames to retain.
     *   At 60fps, 11 frames ≈ 180ms — long enough to suppress single-frame
     *   jitter but short enough that real transitions still update within
     *   ~100ms of crossing the midpoint.
     * @param {number} [options.sigma=2.0] — Gaussian sigma. Larger = more
     *   smoothing, more lag. 2.0 with window=11 gives the central frame
     *   ~0.20 weight (vs ~0.05 for the edges), a moderate hill.
     */
    constructor(options = {}) {
        this.windowSize = options.windowSize ?? 11;
        this.sigma = options.sigma ?? 2.0;
        this.kernel = generateGaussianKernel(this.windowSize, this.sigma);
        this.history = []; // [{label, confidence}, ...] — newest pushed last
    }

    /**
     * Push a new raw mood detection.
     * @param {{label: string, confidence: number}|null} mood
     */
    push(mood) {
        if (!mood?.label) return;
        const c = Number.isFinite(mood.confidence) ? Math.max(0, Math.min(1, mood.confidence)) : 0;
        this.history.push({ label: mood.label, confidence: c });
        if (this.history.length > this.windowSize) {
            this.history.shift();
        }
    }

    /**
     * Compute the smoothed label + confidence over the current window.
     *
     * Weighting: each retained frame contributes
     *   weight = kernel[positionInWindow] * frame.confidence
     * to its label's bucket. The kernel is anchored to the END of the
     * window (newest frame gets the central tap, which has the highest
     * weight) so recent frames dominate while older frames still contribute.
     *
     * @returns {{label: string, confidence: number}|null}
     */
    get() {
        if (this.history.length === 0) return null;

        // Anchor kernel so the most recent frame is at the kernel center.
        // For an 11-frame window with center index 5:
        //   - Newest frame (history[len-1]) uses kernel[5] (max weight)
        //   - history[len-2] uses kernel[4], ..., history[len-6] uses kernel[0]
        // When history is shorter than window, only the last N kernel slots are used.
        const len = this.history.length;
        const center = Math.floor(this.kernel.length / 2);

        const buckets = new Map(); // label -> weighted confidence sum
        let totalWeight = 0;

        for (let i = 0; i < len; i++) {
            // i=0 is oldest, i=len-1 is newest
            const distanceFromNewest = (len - 1) - i;
            const kernelIdx = center - distanceFromNewest;
            if (kernelIdx < 0) continue; // older than the kernel reaches
            const w = this.kernel[kernelIdx];

            const entry = this.history[i];
            const contribution = w * entry.confidence;
            buckets.set(entry.label, (buckets.get(entry.label) ?? 0) + contribution);
            totalWeight += w;
        }

        if (buckets.size === 0 || totalWeight === 0) return null;

        // Winning label = highest weighted sum
        let bestLabel = null;
        let bestSum = -1;
        for (const [label, sum] of buckets) {
            if (sum > bestSum) {
                bestSum = sum;
                bestLabel = label;
            }
        }

        return {
            label: bestLabel,
            // Normalize by total kernel weight to keep confidence in [0, 1].
            confidence: Math.max(0, Math.min(1, bestSum / totalWeight))
        };
    }

    /** Drop all retained frames (e.g. on session reset). */
    reset() {
        this.history.length = 0;
    }
}

export default MoodSmoother;
