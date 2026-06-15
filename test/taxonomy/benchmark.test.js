/**
 * H5 (plan §H Pre-Import Readiness Audit, 2026-06-14): matcher latency
 * benchmark on the 24K-preset database.
 *
 * Method:
 *   - Load butterchurnPresetsAll (24,473 presets) as the real corpus.
 *   - Clone factor = 1 (no synthetic scaling needed; real corpus exceeds 20K).
 *   - Time HierarchicalMatcher.findMatches across multiple scenarios:
 *       * Cold scan (no categorical targets) — Stage 1 vacuous, Stage 2 scores
 *         every survivor.
 *       * Targeted visualStyle — Stage 1 narrows; measures filter cost.
 *       * Targeted visualStyle + musicalResponsiveness — both filters active.
 *
 * Output is logged so the maintainer can read it from CI artifacts. The
 * benchmark itself asserts the latency is within a generous ceiling that
 * would trigger §G1 memoization work if exceeded. The intent is "early
 * warning when 20K becomes too slow", not "lock in a specific latency".
 *
 * Run with: NODE_OPTIONS="--experimental-vm-modules" npx jest --config jest.config.mjs --testPathPatterns="benchmark"
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HierarchicalMatcher } from '../../src/taxonomy/hierarchicalMatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CANONICAL_PATH = path.join(REPO_ROOT, 'presets', 'full-collection', 'butterchurnPresetsAll.fingerprints.json');

const CLONE_FACTOR = 1; // 24,473 real presets — above 20K target, no cloning needed

// Acceptable per-switch latency on the benchmark machine. Generous: real
// switches happen at ~1/sec under normal use, so even 100ms is fine UX-wise.
// The threshold here exists as an "early warning" — if it trips, time to
// reconsider §G1 memoization.
const LATENCY_CEILING_MS = 250;

function buildSyntheticDb() {
    const src = JSON.parse(fs.readFileSync(CANONICAL_PATH, 'utf8'));
    const presets = {};
    for (const [hash, data] of Object.entries(src.presets)) {
        for (let i = 0; i < CLONE_FACTOR; i++) {
            // Mangle the hash prefix to keep all 20K records distinct.
            // 8-hex prefix gives 16^8 ≈ 4.3B slots — plenty of headroom.
            const cloneHash = `${i.toString(16).padStart(2, '0')}${hash.slice(2)}`;
            presets[cloneHash] = data; // share fingerprint reference; matcher only reads
        }
    }
    return { presets };
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function p95(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length * 0.95)];
}

function timeRun(fn, iterations = 20) {
    const samples = [];
    // Warmup
    for (let i = 0; i < 3; i++) fn();
    for (let i = 0; i < iterations; i++) {
        const t = performance.now();
        fn();
        samples.push(performance.now() - t);
    }
    return {
        median: median(samples),
        p95: p95(samples),
        max: Math.max(...samples),
        n: samples.length
    };
}

describe('H5 — matcher latency benchmark on synthetic 20K DB', () => {
    let db;
    let matcher;
    let presetCount;

    beforeAll(() => {
        db = buildSyntheticDb();
        presetCount = Object.keys(db.presets).length;
        matcher = new HierarchicalMatcher(db, { minCandidates: 5 });
    });

    test(`DB size is approximately 20K (actual: synthetic clone factor ${CLONE_FACTOR})`, () => {
        expect(presetCount).toBeGreaterThan(15000);
        expect(presetCount).toBeLessThan(25000);
        // eslint-disable-next-line no-console
        console.log(`[benchmark] synthetic DB has ${presetCount} presets`);
    });

    test('cold-scan latency (no categorical targets, no continuity context)', () => {
        const target = { energy: 0.5, bassEnergy: 0.5, trebleEnergy: 0.5, beatSync: 0.3 };
        const stats = timeRun(() => matcher.findMatches(target, { limit: 30 }));
        // eslint-disable-next-line no-console
        console.log(`[benchmark] cold scan: median=${stats.median.toFixed(2)}ms p95=${stats.p95.toFixed(2)}ms max=${stats.max.toFixed(2)}ms n=${stats.n}`);
        expect(stats.p95).toBeLessThan(LATENCY_CEILING_MS);
    });

    test('targeted visualStyle latency (Stage 1 narrows by one categorical)', () => {
        const target = {
            energy: 0.5, bassEnergy: 0.5, trebleEnergy: 0.5, beatSync: 0.3,
            visualStyle: 'fractal'
        };
        const stats = timeRun(() => matcher.findMatches(target, { limit: 30 }));
        // eslint-disable-next-line no-console
        console.log(`[benchmark] visualStyle=fractal: median=${stats.median.toFixed(2)}ms p95=${stats.p95.toFixed(2)}ms max=${stats.max.toFixed(2)}ms n=${stats.n}`);
        expect(stats.p95).toBeLessThan(LATENCY_CEILING_MS);
    });

    test('targeted visualStyle + musicalResponsiveness latency (two-categorical filter)', () => {
        const target = {
            energy: 0.5, bassEnergy: 0.5, trebleEnergy: 0.5, beatSync: 0.3,
            visualStyle: 'particle',
            musicalResponsiveness: 'beat_detection'
        };
        const stats = timeRun(() => matcher.findMatches(target, { limit: 30 }));
        // eslint-disable-next-line no-console
        console.log(`[benchmark] visualStyle+musicalResponsiveness: median=${stats.median.toFixed(2)}ms p95=${stats.p95.toFixed(2)}ms max=${stats.max.toFixed(2)}ms n=${stats.n}`);
        expect(stats.p95).toBeLessThan(LATENCY_CEILING_MS);
    });

    test('with mood + bpm context (D5 + bpm score components active)', () => {
        const target = {
            energy: 0.6, bassEnergy: 0.6, trebleEnergy: 0.5, beatSync: 0.4,
            visualStyle: 'fluid_organic'
        };
        const stats = timeRun(() =>
            matcher.findMatches(target, {
                limit: 30,
                mood: { label: 'relaxed', confidence: 0.8 },
                detectedBpm: 120
            })
        );
        // eslint-disable-next-line no-console
        console.log(`[benchmark] with mood+bpm: median=${stats.median.toFixed(2)}ms p95=${stats.p95.toFixed(2)}ms max=${stats.max.toFixed(2)}ms n=${stats.n}`);
        expect(stats.p95).toBeLessThan(LATENCY_CEILING_MS);
    });

    test('with currentHash (continuity scoring exercises currentFp path)', () => {
        const currentHash = Object.keys(db.presets)[0];
        const target = {
            energy: 0.5, bassEnergy: 0.5, trebleEnergy: 0.5, beatSync: 0.3,
            visualStyle: 'fractal'
        };
        const stats = timeRun(() =>
            matcher.findMatches(target, {
                limit: 30,
                currentHash,
                mood: { label: 'relaxed', confidence: 0.8 },
                detectedBpm: 120
            })
        );
        // eslint-disable-next-line no-console
        console.log(`[benchmark] with currentHash continuity: median=${stats.median.toFixed(2)}ms p95=${stats.p95.toFixed(2)}ms max=${stats.max.toFixed(2)}ms n=${stats.n}`);
        expect(stats.p95).toBeLessThan(LATENCY_CEILING_MS);
    });
});
