/**
 * H3 (plan §H Pre-Import Readiness Audit, 2026-06-14): determinism harness.
 *
 * At 20K presets nobody can eyeball diffs to spot drift. If the derivation
 * step has any non-deterministic behavior (Math.random, Date-dependent
 * branches, Object.entries ordering drift across Node versions, floating-
 * point nondeterminism), repeated regenerations against identical input
 * produce noisy diffs that mask real changes.
 *
 * This harness:
 *   - Picks 5 reference preset records spanning multiple energyLabel /
 *     visualStyle / colorProfile buckets so coverage of the derivation
 *     code is non-trivial.
 *   - Runs the backfill 100× and asserts every iteration produces the
 *     exact same JSON serialization (per-iteration SHA matches the first).
 *   - Asserts index ordering stability (alphabetical) — H2.
 *   - Asserts every record has fingerprintAlgorithm = '2.2' — H1.
 *
 * Does NOT cover the CLIP step's determinism — that requires actually
 * running the model. This catches the most likely sources of drift in the
 * static-analysis derivation code.
 */

import { describe, test, expect } from '@jest/globals';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
import {
    backfillFingerprint,
    buildIndices,
    FINGERPRINT_ALGORITHM_VERSION
} from '../../tools/backfill-fingerprint-derived-fields.mjs';

// 5 reference fingerprints spanning diverse buckets. These are NOT loaded
// from the on-disk file (which could be touched by other tests) — they're
// inlined here as the canonical determinism baseline.
const REFERENCE_FINGERPRINTS = {
    'ref-calm-cool-fractal': {
        names: ['ref calm cool fractal'],
        fingerprint: {
            energy: 0.15, bassEnergy: 0.10, trebleEnergy: 0.25,
            complexity: 0.20, beatSync: 0.05, fps: 60, warmupTime: 0,
            visualStyle: 'fractal', colorProfile: 'cool'
        }
    },
    'ref-energetic-warm-particle': {
        names: ['ref energetic warm particle'],
        fingerprint: {
            energy: 0.75, bassEnergy: 0.70, trebleEnergy: 0.55,
            complexity: 0.55, beatSync: 0.85, fps: 60, warmupTime: 0.5,
            visualStyle: 'particle', colorProfile: 'warm'
        }
    },
    'ref-explosive-vivid-kaleidoscope': {
        names: ['ref explosive vivid kaleidoscope'],
        fingerprint: {
            energy: 0.97, bassEnergy: 0.92, trebleEnergy: 0.80,
            complexity: 0.78, beatSync: 0.95, fps: 55, warmupTime: 1.2,
            visualStyle: 'kaleidoscope', colorProfile: 'vivid'
        }
    },
    'ref-dynamic-neutral-abstract': {
        names: ['ref dynamic neutral abstract'],
        fingerprint: {
            energy: 0.50, bassEnergy: 0.45, trebleEnergy: 0.50,
            complexity: 0.40, beatSync: 0.55, fps: 60, warmupTime: 0,
            visualStyle: 'abstract', colorProfile: 'neutral'
        }
    },
    'ref-flowing-natural-organic': {
        names: ['ref flowing natural organic'],
        fingerprint: {
            energy: 0.30, bassEnergy: 0.20, trebleEnergy: 0.30,
            complexity: 0.25, beatSync: 0.20, fps: 60, warmupTime: 0,
            visualStyle: 'fluid_organic'
            // No colorProfile — exercises the "no mapping" path.
        }
    }
};

function sha(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

describe('H3 — backfill derivation is deterministic across 100 iterations', () => {
    test('backfillFingerprint produces identical output for identical input (100×)', () => {
        const first = backfillFingerprint('ref', REFERENCE_FINGERPRINTS['ref-calm-cool-fractal']);
        const baseline = sha(first);
        for (let i = 0; i < 99; i++) {
            const next = backfillFingerprint('ref', REFERENCE_FINGERPRINTS['ref-calm-cool-fractal']);
            expect(sha(next)).toBe(baseline);
        }
    });

    test('buildIndices produces identical output for identical input (100×)', () => {
        const presets = { ...REFERENCE_FINGERPRINTS };
        // First backfill so every record carries the v2.2 categoricals.
        for (const [hash, data] of Object.entries(presets)) {
            presets[hash] = backfillFingerprint(hash, data);
        }
        const baseline = sha(buildIndices(presets));
        for (let i = 0; i < 99; i++) {
            expect(sha(buildIndices(presets))).toBe(baseline);
        }
    });

    test('full pipeline (backfill all 5 + buildIndices) is byte-stable', () => {
        const compute = () => {
            const presets = {};
            for (const [hash, data] of Object.entries(REFERENCE_FINGERPRINTS)) {
                presets[hash] = backfillFingerprint(hash, data);
            }
            return { presets, indices: buildIndices(presets) };
        };
        const baseline = sha(compute());
        for (let i = 0; i < 99; i++) {
            expect(sha(compute())).toBe(baseline);
        }
    });

    test('H2 — every index bucket is alphabetically sorted', () => {
        const presets = {};
        for (const [hash, data] of Object.entries(REFERENCE_FINGERPRINTS)) {
            presets[hash] = backfillFingerprint(hash, data);
        }
        const idx = buildIndices(presets);

        const checkSorted = (obj, path = '') => {
            for (const [k, v] of Object.entries(obj)) {
                const subpath = path ? `${path}.${k}` : k;
                if (Array.isArray(v)) {
                    const sorted = [...v].sort();
                    expect(v).toEqual(sorted);
                } else if (v && typeof v === 'object') {
                    checkSorted(v, subpath);
                }
            }
        };
        checkSorted(idx);
    });

    test('H1 — every backfilled record carries fingerprintAlgorithm = "2.2"', () => {
        for (const [hash, data] of Object.entries(REFERENCE_FINGERPRINTS)) {
            const out = backfillFingerprint(hash, data);
            expect(out.fingerprint.fingerprintAlgorithm).toBe(FINGERPRINT_ALGORITHM_VERSION);
            expect(out.fingerprint.fingerprintAlgorithm).toBe('2.2');
        }
    });

    test('H3 — known reference SHA pins the derivation contract', () => {
        // This SHA is computed against the canonical reference set above.
        // It changes whenever:
        //   - A derivation function (deriveEnergyLabel, deriveMusicalResponsiveness,
        //     deriveReliabilityTier) changes its output for any reference input.
        //   - The COLOR_PROFILE_TO_DOMINANT_HUE map changes.
        //   - FINGERPRINT_ALGORITHM_VERSION changes.
        //   - The JSON serialization format changes (key order, etc).
        // Any of those drifts will surface as a 20K-line diff in production —
        // having the pin in CI surfaces it as a single failing test instead.
        const compute = () => {
            const presets = {};
            for (const [hash, data] of Object.entries(REFERENCE_FINGERPRINTS)) {
                presets[hash] = backfillFingerprint(hash, data);
            }
            return { presets, indices: buildIndices(presets) };
        };
        const actualSha = sha(compute());
        // To intentionally update this pin after a deliberate derivation change:
        //   1. Run with PRINT_DETERMINISM_SHA=1 to see the new SHA in the test output
        //   2. Verify the output diff is what you expected
        //   3. Paste the new hex below and document the change in the comment
        // Updated: 2026-06-15 — Pass 22: rotated after reliabilityTier threshold fix
        //   (removed complexity<0.7 from finicky trigger, raised warmup threshold to >5)
        const EXPECTED_SHA = '46112c8455b41744acc7bbf09ec6757cb49b16323aec57964b0666e4324834ee';
        expect(actualSha).toBe(EXPECTED_SHA);
        // Log so a maintainer rotating the pin can see the value to copy.
        if (process.env.PRINT_DETERMINISM_SHA) {
            // eslint-disable-next-line no-console
            console.log('[determinism] reference SHA =', actualSha);
        }
    });
});

describe('Dual-pack fingerprint stability — alaskaButter', () => {
    const ALASKA_PATH = path.join(REPO_ROOT, 'presets', 'alaska-butter', 'alaskaButter.fingerprints.json');

    test('alaskaButter fingerprint count is stable (388)', () => {
        const db = JSON.parse(fs.readFileSync(ALASKA_PATH, 'utf8'));
        expect(Object.keys(db.presets).length).toBe(388);
    });

    test('alaskaButter every fingerprint has fingerprintAlgorithm = "2.2"', () => {
        const db = JSON.parse(fs.readFileSync(ALASKA_PATH, 'utf8'));
        for (const [hash, data] of Object.entries(db.presets)) {
            expect(data.fingerprint.fingerprintAlgorithm).toBe('2.2');
        }
    });

    test('alaskaButter fingerprints match bundled preset names', () => {
        const db = JSON.parse(fs.readFileSync(ALASKA_PATH, 'utf8'));
        const presetsPath = path.join(REPO_ROOT, 'presets', 'alaska-butter', 'alaskaButter.json');
        const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
        const presetNames = new Set(Object.keys(presets));

        for (const [hash, data] of Object.entries(db.presets)) {
            for (const name of data.names || []) {
                expect(presetNames.has(name)).toBe(true);
            }
        }
    });
});

describe('Dual-pack fingerprint stability — butterchurnPresetsAll', () => {
    const CANONICAL_PATH = path.join(REPO_ROOT, 'presets', 'full-collection', 'butterchurnPresetsAll.fingerprints.json');

    test('butterchurnPresetsAll fingerprint count is stable (21,687)', () => {
        const db = JSON.parse(fs.readFileSync(CANONICAL_PATH, 'utf8'));
        expect(Object.keys(db.presets).length).toBe(21687);
    });

    test('butterchurnPresetsAll every fingerprint has fingerprintAlgorithm = "2.2"', () => {
        const db = JSON.parse(fs.readFileSync(CANONICAL_PATH, 'utf8'));
        for (const [hash, data] of Object.entries(db.presets)) {
            expect(data.fingerprint.fingerprintAlgorithm).toBe('2.2');
        }
    });

    test('butterchurnPresetsAll fingerprints match bundled preset names', () => {
        const db = JSON.parse(fs.readFileSync(CANONICAL_PATH, 'utf8'));
        const presetsPath = path.join(REPO_ROOT, 'presets', 'full-collection', 'butterchurnPresetsAll.json');
        const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
        const presetNames = new Set(Object.keys(presets));

        for (const [hash, data] of Object.entries(db.presets)) {
            for (const name of data.names || []) {
                expect(presetNames.has(name)).toBe(true);
            }
        }
    });
});
