/**
 * Content Hash Algorithm Tests
 *
 * Ensures the shared content hash algorithm produces consistent results
 * across the codebase. Critical for deduplication and fingerprint integrity.
 */

import { describe, test, expect } from '@jest/globals';
import { sortObjectDeep, generateContentHash } from '../../src/utils/contentHash.js';

describe('sortObjectDeep', () => {
    test('returns primitives unchanged', () => {
        expect(sortObjectDeep(null)).toBe(null);
        expect(sortObjectDeep(undefined)).toBe(undefined);
        expect(sortObjectDeep(42)).toBe(42);
        expect(sortObjectDeep('hello')).toBe('hello');
        expect(sortObjectDeep(true)).toBe(true);
    });

    test('sorts object keys alphabetically', () => {
        const input = { c: 1, a: 2, b: 3 };
        const result = sortObjectDeep(input);
        expect(Object.keys(result)).toEqual(['a', 'b', 'c']);
    });

    test('recursively sorts nested objects', () => {
        const input = {
            z: { b: 1, a: 2 },
            y: 3
        };
        const result = sortObjectDeep(input);
        expect(Object.keys(result)).toEqual(['y', 'z']);
        expect(Object.keys(result.z)).toEqual(['a', 'b']);
    });

    test('preserves array order but sorts each element', () => {
        const input = [
            { z: 1, a: 2 },
            { m: 3, c: 4 }
        ];
        const result = sortObjectDeep(input);
        expect(result.length).toBe(2);
        expect(Object.keys(result[0])).toEqual(['a', 'z']);
        expect(Object.keys(result[1])).toEqual(['c', 'm']);
    });

    test('handles deeply nested structures', () => {
        const input = {
            level1: {
                level2: {
                    z: 1,
                    a: 2,
                    level3: { d: 4, c: 3 }
                }
            }
        };
        const result = sortObjectDeep(input);
        expect(Object.keys(result.level1.level2)).toEqual(['a', 'level3', 'z']);
        expect(Object.keys(result.level1.level2.level3)).toEqual(['c', 'd']);
    });

    test('handles arrays containing arrays', () => {
        const input = [
            [{ b: 1, a: 2 }],
            [{ d: 3, c: 4 }]
        ];
        const result = sortObjectDeep(input);
        expect(Object.keys(result[0][0])).toEqual(['a', 'b']);
        expect(Object.keys(result[1][0])).toEqual(['c', 'd']);
    });
});

describe('generateContentHash', () => {
    test('produces 8-character hex hash', () => {
        const preset = {
            init_eqs_str: 'x = 0;',
            frame_eqs_str: 'y = 1;',
            baseVals: { decay: 0.98 }
        };
        const hash = generateContentHash(preset);
        expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    test('identical presets produce identical hashes', () => {
        const preset1 = {
            init_eqs_str: 'x = 0;',
            frame_eqs_str: 'y = sin(time);',
            baseVals: { decay: 0.98, zoom: 1.0 }
        };
        const preset2 = {
            init_eqs_str: 'x = 0;',
            frame_eqs_str: 'y = sin(time);',
            baseVals: { decay: 0.98, zoom: 1.0 }
        };
        expect(generateContentHash(preset1)).toBe(generateContentHash(preset2));
    });

    test('key order does not affect hash (deterministic)', () => {
        const preset1 = {
            baseVals: { decay: 0.98, zoom: 1.0 },
            init_eqs_str: 'x = 0;'
        };
        const preset2 = {
            init_eqs_str: 'x = 0;',
            baseVals: { zoom: 1.0, decay: 0.98 }
        };
        expect(generateContentHash(preset1)).toBe(generateContentHash(preset2));
    });

    test('different equations produce different hashes', () => {
        const preset1 = { init_eqs_str: 'x = 0;' };
        const preset2 = { init_eqs_str: 'x = 1;' };
        expect(generateContentHash(preset1)).not.toBe(generateContentHash(preset2));
    });

    test('different baseVals produce different hashes', () => {
        const preset1 = { baseVals: { decay: 0.98 } };
        const preset2 = { baseVals: { decay: 0.99 } };
        expect(generateContentHash(preset1)).not.toBe(generateContentHash(preset2));
    });

    test('handles _eel fallback for equations', () => {
        const presetStr = { init_eqs_str: 'x = 0;' };
        const presetEel = { init_eqs_eel: 'x = 0;' };
        expect(generateContentHash(presetStr)).toBe(generateContentHash(presetEel));
    });

    test('handles shapes and waves with nested baseVals', () => {
        const preset1 = {
            shapes: [{ baseVals: { enabled: 1, r: 1, g: 0 } }],
            waves: [{ baseVals: { enabled: 1, r: 0, g: 1 } }]
        };
        const preset2 = {
            shapes: [{ baseVals: { g: 0, r: 1, enabled: 1 } }],
            waves: [{ baseVals: { g: 1, r: 0, enabled: 1 } }]
        };
        // Different key order in nested objects should produce same hash
        expect(generateContentHash(preset1)).toBe(generateContentHash(preset2));
    });

    test('handles empty preset', () => {
        const hash = generateContentHash({});
        expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });

    test('handles preset with all empty fields', () => {
        const preset = {
            init_eqs_str: '',
            frame_eqs_str: '',
            pixel_eqs_str: '',
            warp_eqs_str: '',
            comp_eqs_str: '',
            baseVals: {},
            shapes: [],
            waves: []
        };
        const hash = generateContentHash(preset);
        expect(hash).toMatch(/^[0-9a-f]{8}$/);
    });
});

describe('dedup/generator hash consistency', () => {
    test('complex preset with nested shapes produces deterministic hash', () => {
        const complexPreset = {
            init_eqs_str: 'q1 = 0;',
            frame_eqs_str: 'q1 = q1 + 0.01;',
            pixel_eqs_str: 'x = x + sin(q1);',
            baseVals: {
                decay: 0.98,
                zoom: 1.02,
                rot: 0.01,
                warp: 0.5
            },
            shapes: [
                {
                    baseVals: {
                        enabled: 1,
                        sides: 4,
                        r: 1, g: 0, b: 0,
                        r2: 0, g2: 1, b2: 0
                    },
                    init_eqs_str: 'x = 0.5;',
                    frame_eqs_str: 'rad = 0.1 + 0.05 * sin(time);'
                }
            ],
            waves: [
                {
                    baseVals: {
                        enabled: 1,
                        r: 1, g: 1, b: 1,
                        mystery: 0
                    }
                }
            ]
        };

        // Generate hash multiple times - must be identical
        const hashes = new Set();
        for (let i = 0; i < 10; i++) {
            hashes.add(generateContentHash(complexPreset));
        }
        expect(hashes.size).toBe(1);
    });

    test('key order scrambling does not affect hash', () => {
        // This is the critical test for N16 - ensures dedup and generator
        // produce the same hash for the same preset content

        const preset1 = {
            shapes: [
                {
                    baseVals: {
                        enabled: 1,
                        r: 1, g: 0.5, b: 0,
                        x: 0.5, y: 0.5,
                        rad: 0.1
                    }
                }
            ]
        };

        // Same content, different key order in nested objects
        const preset2 = {
            shapes: [
                {
                    baseVals: {
                        rad: 0.1,
                        y: 0.5, x: 0.5,
                        b: 0, g: 0.5, r: 1,
                        enabled: 1
                    }
                }
            ]
        };

        expect(generateContentHash(preset1)).toBe(generateContentHash(preset2));
    });
});
