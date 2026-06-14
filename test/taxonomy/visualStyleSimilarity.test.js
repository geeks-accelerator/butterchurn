/**
 * P5.1 — Symmetric closure for VISUAL_STYLE_SIMILARITY
 *
 * The matcher's styleContinuity scoring reads similarity from
 * `currentFp.visualStyle`'s neighbours only. If A is in similar(B) but B is
 * not in similar(A), then A→B transitions get a continuity bonus but B→A
 * doesn't — surprising user-visible asymmetry. This test enforces the
 * invariant that the relation is symmetric so a future map edit can't
 * accidentally break the property.
 */

import { describe, test, expect } from '@jest/globals';
import {
    VISUAL_STYLE_SIMILARITY,
    areStylesSimilar,
    getAllVisualStyles
} from '../../src/taxonomy/visualStyleSimilarity.js';

describe('P5.1 — VISUAL_STYLE_SIMILARITY is symmetric', () => {
    test('every (A, B) where B in similar(A) also has A in similar(B)', () => {
        const violations = [];
        for (const [a, similars] of Object.entries(VISUAL_STYLE_SIMILARITY)) {
            for (const b of similars) {
                const backRef = VISUAL_STYLE_SIMILARITY[b] || [];
                if (!backRef.includes(a)) {
                    violations.push(`${a} → ${b} (but ${b} does not list ${a})`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    test('areStylesSimilar(A, B) === areStylesSimilar(B, A) for all pairs', () => {
        const styles = getAllVisualStyles();
        const asymmetries = [];
        for (const a of styles) {
            for (const b of styles) {
                if (areStylesSimilar(a, b) !== areStylesSimilar(b, a)) {
                    asymmetries.push(`${a}↔${b}`);
                }
            }
        }
        expect(asymmetries).toEqual([]);
    });

    test('every style is similar to itself', () => {
        for (const style of getAllVisualStyles()) {
            expect(areStylesSimilar(style, style)).toBe(true);
        }
    });
});
