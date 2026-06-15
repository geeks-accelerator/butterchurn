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
 * - Earlier: preset↔fingerprint misalignment
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Canonical vocabularies (must match validate-fingerprint-mapping.js)
const VALID_VOCABULARY = {
    energyLabel: new Set(['calm', 'flowing', 'dynamic', 'energetic', 'intense', 'explosive']),
    musicalResponsiveness: new Set(['spectral_analysis', 'beat_detection', 'volume_reactive', 'time_only', 'basic_audio']),
    reliabilityTier: new Set(['rock_solid', 'stable', 'finicky', 'experimental']),
    visualStyle: new Set(['abstract', 'organic', 'fractal', 'geometric', 'particle', 'tunnel', 'fluid_organic', 'kaleidoscope', 'waveform']),
    dominantHue: new Set(['warm', 'cool', 'neutral', 'natural', 'rainbow']),
    colorProfile: new Set(['warm', 'cool', 'neutral', 'natural', 'rainbow', 'vibrant', 'muted']),
    motionSpeed: new Set(['static', 'slow', 'medium', 'fast', 'chaotic'])
};

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

        test('energyLabel vocabulary is valid', () => {
            const invalid = [];
            for (const [name, data] of Object.entries(db.presets)) {
                const val = data.fingerprint?.energyLabel;
                if (val && !VALID_VOCABULARY.energyLabel.has(val)) {
                    invalid.push({ name, value: val });
                }
            }
            expect(invalid.length).toBe(0);
        });

        test('musicalResponsiveness vocabulary is valid', () => {
            const invalid = [];
            for (const [name, data] of Object.entries(db.presets)) {
                const val = data.fingerprint?.musicalResponsiveness;
                if (val && !VALID_VOCABULARY.musicalResponsiveness.has(val)) {
                    invalid.push({ name, value: val });
                }
            }
            expect(invalid.length).toBe(0);
        });

        test('reliabilityTier vocabulary is valid', () => {
            const invalid = [];
            for (const [name, data] of Object.entries(db.presets)) {
                const val = data.fingerprint?.reliabilityTier;
                if (val && !VALID_VOCABULARY.reliabilityTier.has(val)) {
                    invalid.push({ name, value: val });
                }
            }
            expect(invalid.length).toBe(0);
        });

        test('visualStyle vocabulary is valid', () => {
            const invalid = [];
            for (const [name, data] of Object.entries(db.presets)) {
                const val = data.fingerprint?.visualStyle;
                if (val && !VALID_VOCABULARY.visualStyle.has(val)) {
                    invalid.push({ name, value: val });
                }
            }
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

        test('vocabulary fields are valid', () => {
            let invalid = 0;
            for (const data of Object.values(db.presets)) {
                const fp = data.fingerprint || {};
                if (fp.energyLabel && !VALID_VOCABULARY.energyLabel.has(fp.energyLabel)) invalid++;
                if (fp.musicalResponsiveness && !VALID_VOCABULARY.musicalResponsiveness.has(fp.musicalResponsiveness)) invalid++;
                if (fp.reliabilityTier && !VALID_VOCABULARY.reliabilityTier.has(fp.reliabilityTier)) invalid++;
                if (fp.visualStyle && !VALID_VOCABULARY.visualStyle.has(fp.visualStyle)) invalid++;
            }
            expect(invalid).toBe(0);
        });

        test('optimalBpm is object', () => {
            const scalar = Object.values(db.presets).filter(d => typeof d.fingerprint?.optimalBpm !== 'object');
            expect(scalar.length).toBe(0);
        });
    });
});
