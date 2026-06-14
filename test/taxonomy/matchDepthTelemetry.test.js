/**
 * §G4 — Match-depth telemetry tests
 *
 * Verifies the per-session histogram, fractions, and rollup metrics
 * (fullCategoricalMatchRate, allRelaxedRate) exposed by the selector.
 *
 * Per plan success metrics: a healthy session has
 *   fullCategoricalMatchRate >= 30%   (Stage 1 filters succeed often)
 *   allRelaxedRate           <= 10%   (taxonomy rarely collapses)
 */

import { describe, test, expect, beforeEach } from '@jest/globals';

const mockDb = {
    presets: {
        'h1': {
            names: ['P1'],
            fingerprint: {
                energy: 0.5, bassEnergy: 0.5, trebleEnergy: 0.5, beatSync: 0.3,
                complexity: 0.3, visualStyle: 'fractal',
                musicalResponsiveness: 'spectral_analysis',
                reliabilityTier: 'stable', dominantHue: 'cool', colorProfile: 'cool',
                energyLabel: 'dynamic',
                moodAffinities: { aggressive: 0.3, relaxed: 0.7 },
                optimalBpm: { min: 90, max: 130, ideal: 110 }
            }
        }
    },
    indices: {}
};

import IntelligentPresetSelector from '../../src/intelligentPresetSelector.js';
const mockButterchurn = { loadPreset: () => {}, getRendererProps: () => ({ texsizeX: 800, texsizeY: 600 }) };

describe('§G4 match-depth telemetry', () => {
    let selector;

    beforeEach(() => {
        selector = new IntelligentPresetSelector(mockButterchurn, mockDb, { rngSeed: 42 });
    });

    test('starts empty', () => {
        const t = selector.getMatchDepthTelemetry();
        expect(t.total).toBe(0);
        expect(t.histogram).toEqual({});
        expect(t.fullCategoricalMatchRate).toBe(0);
        expect(t.allRelaxedRate).toBe(0);
    });

    test('records per-switch depths into the histogram', () => {
        selector._recordMatchDepth(4);
        selector._recordMatchDepth(4);
        selector._recordMatchDepth(2);
        selector._recordMatchDepth(0);

        const t = selector.getMatchDepthTelemetry();
        expect(t.total).toBe(4);
        expect(t.histogram).toEqual({ '4': 2, '2': 1, '0': 1 });
    });

    test('fractions sum to 1 across the histogram', () => {
        selector._recordMatchDepth(4);
        selector._recordMatchDepth(3);
        selector._recordMatchDepth(0);

        const t = selector.getMatchDepthTelemetry();
        const sum = Object.values(t.fractions).reduce((a, b) => a + b, 0);
        expect(sum).toBeCloseTo(1.0, 6);
    });

    test('fullCategoricalMatchRate counts only the deepest depth', () => {
        // Matcher's default categoricalDims has length 4; deepest depth = 4.
        selector._recordMatchDepth(4);  // full
        selector._recordMatchDepth(4);  // full
        selector._recordMatchDepth(3);  // relaxed one
        selector._recordMatchDepth(0);  // all relaxed

        const t = selector.getMatchDepthTelemetry();
        expect(t.fullCategoricalMatchRate).toBeCloseTo(0.5, 6);
    });

    test('allRelaxedRate counts only depth=0', () => {
        selector._recordMatchDepth(4);
        selector._recordMatchDepth(0);
        selector._recordMatchDepth(0);
        selector._recordMatchDepth(2);

        const t = selector.getMatchDepthTelemetry();
        expect(t.allRelaxedRate).toBeCloseTo(0.5, 6);
    });

    test('matcher exhaustion (depth=-1) bucketed under "-1"', () => {
        selector._recordMatchDepth(-1);
        selector._recordMatchDepth(-1);
        selector._recordMatchDepth(4);

        const t = selector.getMatchDepthTelemetry();
        expect(t.histogram['-1']).toBe(2);
        // -1 should NOT count as full-categorical or all-relaxed
        expect(t.fullCategoricalMatchRate).toBeCloseTo(1 / 3, 6);
        expect(t.allRelaxedRate).toBe(0);
    });

    test('resetMatchDepthTelemetry clears the histogram', () => {
        selector._recordMatchDepth(4);
        selector._recordMatchDepth(2);
        selector.resetMatchDepthTelemetry();

        const t = selector.getMatchDepthTelemetry();
        expect(t.total).toBe(0);
        expect(t.histogram).toEqual({});
    });
});
