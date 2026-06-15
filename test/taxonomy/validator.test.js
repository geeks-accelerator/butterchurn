/**
 * Validator Integration Test
 *
 * This test wires the fingerprint validator into the test suite so that
 * vocabulary/type/mapping regressions are caught automatically instead of
 * requiring manual validator runs.
 *
 * This test would have caught:
 * - Pass 11: 16,718 invalid vocabulary (energyLabel/musicalResponsiveness "medium")
 * - Pass 12: 8,359 scalar optimalBpm (wrong type)
 * - Pass 16: 46 records with undefined dominantHue/colorProfile/motionSpeed
 * - Earlier: preset↔fingerprint misalignment
 *
 * IMPORTANT: Uses shared vocabulary from src/utils/vocabulary.js (single source of truth)
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VALID_VOCABULARY, CATEGORICAL_FIELDS } from '../../src/utils/vocabulary.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('Fingerprint Validator — wired into test suite', () => {
    describe('butterchurnPresetsAll', () => {
        const FP_PATH = path.join(REPO_ROOT, 'presets', 'full-collection', 'butterchurnPresetsAll.fingerprints.json');
        const PRESETS_PATH = path.join(REPO_ROOT, 'presets', 'full-collection', 'butterchurnPresetsAll.json');

        let db, presets;

        beforeAll(() => {
            db = JSON.parse(fs.readFileSync(FP_PATH, 'utf8'));
            presets = JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf8'));
        });

        test('fingerprint count matches preset count', () => {
            expect(Object.keys(db.presets).length).toBe(Object.keys(presets).length);
        });

        test('every fingerprint has a matching preset (name-keyed)', () => {
            const presetNames = new Set(Object.keys(presets));
            const orphans = [];
            for (const name of Object.keys(db.presets)) {
                if (!presetNames.has(name)) orphans.push(name);
            }
            expect(orphans.length).toBe(0);
        });

        test('every preset has a fingerprint', () => {
            const fpNames = new Set(Object.keys(db.presets));
            const missing = [];
            for (const name of Object.keys(presets)) {
                if (!fpNames.has(name)) missing.push(name);
            }
            expect(missing.length).toBe(0);
        });

        test('every fingerprint has inner hash field', () => {
            const missing = [];
            for (const [name, data] of Object.entries(db.presets)) {
                if (!data.hash) missing.push(name);
            }
            expect(missing.length).toBe(0);
        });

        // Test all 7 categorical fields (energyLabel, musicalResponsiveness, reliabilityTier,
        // visualStyle, dominantHue, colorProfile, motionSpeed)
        test.each(CATEGORICAL_FIELDS)('%s vocabulary is valid and not undefined', (field) => {
            const invalid = [];
            const undefinedCount = [];
            const validSet = VALID_VOCABULARY[field];

            for (const [name, data] of Object.entries(db.presets)) {
                const val = data.fingerprint?.[field];
                if (val === undefined) {
                    undefinedCount.push(name);
                } else if (!validSet.has(val)) {
                    invalid.push({ name, value: val });
                }
            }

            expect(undefinedCount.length).toBe(0);
            expect(invalid.length).toBe(0);
        });

        test('optimalBpm is object with {min, max, ideal}', () => {
            const invalid = [];
            for (const [name, data] of Object.entries(db.presets)) {
                const bpm = data.fingerprint?.optimalBpm;
                if (typeof bpm !== 'object' || bpm === null || bpm.ideal === undefined) {
                    invalid.push({ name, type: typeof bpm });
                }
            }
            expect(invalid.length).toBe(0);
        });

        test('no NaN in continuous fields', () => {
            const nanFields = [];
            for (const [name, data] of Object.entries(db.presets)) {
                const fp = data.fingerprint || {};
                for (const field of ['energy', 'bassEnergy', 'complexity', 'beatSync']) {
                    if (typeof fp[field] === 'number' && isNaN(fp[field])) {
                        nanFields.push({ name, field });
                    }
                }
            }
            expect(nanFields.length).toBe(0);
        });

        test('visualStyleScores has all 9 keys', () => {
            const expectedKeys = ['particle', 'fractal', 'geometric', 'fluid_organic', 'abstract', 'kaleidoscope', 'tunnel', 'waveform', 'organic'];
            const missing = [];
            for (const [name, data] of Object.entries(db.presets)) {
                const scores = data.fingerprint?.visualStyleScores;
                if (!scores) {
                    missing.push({ name, reason: 'no visualStyleScores' });
                } else {
                    const keys = Object.keys(scores);
                    const missingKeys = expectedKeys.filter(k => !keys.includes(k));
                    if (missingKeys.length > 0) {
                        missing.push({ name, reason: `missing keys: ${missingKeys.join(',')}` });
                    }
                }
            }
            expect(missing.length).toBe(0);
        });

        test('moodAffinities exists and has numeric values', () => {
            const invalid = [];
            for (const [name, data] of Object.entries(db.presets)) {
                const moods = data.fingerprint?.moodAffinities;
                if (!moods) {
                    invalid.push({ name, reason: 'no moodAffinities' });
                } else {
                    for (const [key, val] of Object.entries(moods)) {
                        if (typeof val !== 'number') {
                            invalid.push({ name, reason: `${key} is ${typeof val}` });
                        }
                    }
                }
            }
            expect(invalid.length).toBe(0);
        });
    });

    describe('alaskaButter', () => {
        const FP_PATH = path.join(REPO_ROOT, 'presets', 'alaska-butter', 'alaskaButter.fingerprints.json');
        const PRESETS_PATH = path.join(REPO_ROOT, 'presets', 'alaska-butter', 'alaskaButter.json');

        let db, presets;

        beforeAll(() => {
            db = JSON.parse(fs.readFileSync(FP_PATH, 'utf8'));
            presets = JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf8'));
        });

        test('fingerprint count matches preset count', () => {
            expect(Object.keys(db.presets).length).toBe(Object.keys(presets).length);
        });

        test('every fingerprint has a matching preset', () => {
            const presetNames = new Set(Object.keys(presets));
            const orphans = Object.keys(db.presets).filter(n => !presetNames.has(n));
            expect(orphans.length).toBe(0);
        });

        test('every fingerprint has inner hash field', () => {
            const missing = Object.values(db.presets).filter(d => !d.hash);
            expect(missing.length).toBe(0);
        });

        // Test all 7 categorical fields
        test.each(CATEGORICAL_FIELDS)('%s vocabulary is valid and not undefined', (field) => {
            const invalid = [];
            const undefinedCount = [];
            const validSet = VALID_VOCABULARY[field];

            for (const [name, data] of Object.entries(db.presets)) {
                const val = data.fingerprint?.[field];
                if (val === undefined) {
                    undefinedCount.push(name);
                } else if (!validSet.has(val)) {
                    invalid.push({ name, value: val });
                }
            }

            expect(undefinedCount.length).toBe(0);
            expect(invalid.length).toBe(0);
        });

        test('optimalBpm is object', () => {
            const scalar = Object.values(db.presets).filter(d => typeof d.fingerprint?.optimalBpm !== 'object');
            expect(scalar.length).toBe(0);
        });

        test('visualStyleScores exists', () => {
            const missing = Object.values(db.presets).filter(d => !d.fingerprint?.visualStyleScores);
            expect(missing.length).toBe(0);
        });

        test('moodAffinities exists', () => {
            const missing = Object.values(db.presets).filter(d => !d.fingerprint?.moodAffinities);
            expect(missing.length).toBe(0);
        });
    });
});
