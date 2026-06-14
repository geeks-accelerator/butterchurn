/**
 * MoodSmoother tests (§G2)
 *
 * Verifies the smoother's contract:
 *   - Empty state returns null
 *   - Single push returns that label with reduced confidence
 *   - Single-frame outliers are suppressed when neighbors disagree
 *   - Sustained label transitions eventually flip the smoothed result
 *   - Confidence outputs stay in [0, 1]
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { MoodSmoother } from '../../src/taxonomy/moodSmoother.js';

describe('MoodSmoother — §G2 Gaussian-weighted mood smoothing', () => {
    let s;

    beforeEach(() => {
        s = new MoodSmoother({ windowSize: 11, sigma: 2.0 });
    });

    test('returns null when no frames have been pushed', () => {
        expect(s.get()).toBeNull();
    });

    test('handles null pushes safely (no detection on that frame)', () => {
        s.push(null);
        s.push({ label: 'relaxed', confidence: 0.8 });
        s.push(undefined);
        const out = s.get();
        expect(out?.label).toBe('relaxed');
    });

    test('single push returns the label with confidence scaled by kernel center', () => {
        s.push({ label: 'aggressive', confidence: 0.9 });
        const out = s.get();
        expect(out?.label).toBe('aggressive');
        // With only one frame contributing, smoothed confidence equals raw
        // (single-frame total/total normalization yields original value).
        expect(out?.confidence).toBeCloseTo(0.9, 5);
    });

    test('confidence is clamped to [0, 1]', () => {
        s.push({ label: 'happy', confidence: 1.5 });   // clamp up
        let out = s.get();
        expect(out?.confidence).toBeLessThanOrEqual(1);

        s.reset();
        s.push({ label: 'happy', confidence: -0.4 });  // clamp down
        out = s.get();
        expect(out?.confidence).toBeGreaterThanOrEqual(0);
    });

    test('suppresses a single-frame outlier when neighbours disagree', () => {
        // Many neighbouring frames vote 'relaxed' (high confidence), one
        // recent frame jitters to 'aggressive'. Smoothed result stays
        // 'relaxed' because the kernel weights bracket the outlier.
        for (let i = 0; i < 8; i++) {
            s.push({ label: 'relaxed', confidence: 0.8 });
        }
        s.push({ label: 'aggressive', confidence: 0.9 }); // jitter

        const out = s.get();
        expect(out?.label).toBe('relaxed');
    });

    test('flips to a sustained new label after enough frames', () => {
        // Establish a baseline mood.
        for (let i = 0; i < 11; i++) {
            s.push({ label: 'relaxed', confidence: 0.8 });
        }
        expect(s.get()?.label).toBe('relaxed');

        // Sustained transition: feed enough new-label frames that they
        // dominate the kernel even though some old-label frames remain.
        for (let i = 0; i < 8; i++) {
            s.push({ label: 'aggressive', confidence: 0.8 });
        }
        expect(s.get()?.label).toBe('aggressive');
    });

    test('ties broken by accumulated weight (more recent wins under equal counts)', () => {
        // 5 'a' frames followed by 5 'b' frames. 'b' frames are newer so
        // sit closer to the kernel center and accumulate more weight.
        for (let i = 0; i < 5; i++) {
            s.push({ label: 'a', confidence: 0.7 });
        }
        for (let i = 0; i < 5; i++) {
            s.push({ label: 'b', confidence: 0.7 });
        }
        const out = s.get();
        expect(out?.label).toBe('b');
    });

    test('reset() clears state', () => {
        s.push({ label: 'happy', confidence: 0.9 });
        s.reset();
        expect(s.get()).toBeNull();
    });

    test('window cap drops oldest frames once full', () => {
        // Push 20 frames into an 11-window smoother. Internally only the last
        // 11 are retained.
        for (let i = 0; i < 9; i++) {
            s.push({ label: 'old', confidence: 0.9 });
        }
        for (let i = 0; i < 11; i++) {
            s.push({ label: 'new', confidence: 0.9 });
        }
        // 'old' should be entirely evicted; smoothed label is 'new'.
        expect(s.get()?.label).toBe('new');
    });
});
