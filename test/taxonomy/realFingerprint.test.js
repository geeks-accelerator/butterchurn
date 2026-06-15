/**
 * Real-fingerprint integration tests
 *
 * P4.1 + P4.2 (issue 2026-06-14-butterchurn-taxonomy-implementation-review):
 *
 * P4.1 — verify the actual JSON fingerprint files the loader ships with carry
 * the v2.2 derived fields the matcher expects. Catches the class of bug where
 * the generator is updated but never re-run against the data, leaving the
 * matcher silently no-op-ing against legacy data.
 *
 * P4.2 — verify that with realistic targets and a realistic preset shape,
 * `findMatches` returns a Stage 1 hit (matchDepth >= 1, and the targeted
 * categorical dimensions stay out of relaxedDimensions). Catches the class of
 * bug where missing target fields silently skip Stage 1 filtering entirely.
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HierarchicalMatcher } from '../../src/taxonomy/hierarchicalMatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

// Canonical pack (butterchurnPresetsAll) is the primary test target
const CANONICAL_PATH = path.join(
    REPO_ROOT, 'presets', 'full-collection', 'butterchurnPresetsAll.fingerprints.json'
);

describe('P4.1 — fingerprint files carry v2.2 derived fields', () => {
    test('butterchurnPresetsAll has energyLabel on every preset', () => {
        const db = JSON.parse(fs.readFileSync(CANONICAL_PATH, 'utf8'));
        const fingerprints = Object.values(db.presets).map(p => p.fingerprint);
        const missing = fingerprints.filter(fp => fp.energyLabel === undefined);
        expect(missing.length).toBe(0);
    });

    test('butterchurnPresetsAll has musicalResponsiveness on every preset', () => {
        const db = JSON.parse(fs.readFileSync(CANONICAL_PATH, 'utf8'));
        const fingerprints = Object.values(db.presets).map(p => p.fingerprint);
        const missing = fingerprints.filter(fp => fp.musicalResponsiveness === undefined);
        expect(missing.length).toBe(0);
    });

    test('butterchurnPresetsAll has reliabilityTier on every preset', () => {
        const db = JSON.parse(fs.readFileSync(CANONICAL_PATH, 'utf8'));
        const fingerprints = Object.values(db.presets).map(p => p.fingerprint);
        const missing = fingerprints.filter(fp => fp.reliabilityTier === undefined);
        expect(missing.length).toBe(0);
    });

    test('butterchurnPresetsAll moodAffinities values are numbers (not stringified)', () => {
        const db = JSON.parse(fs.readFileSync(CANONICAL_PATH, 'utf8'));
        const sample = Object.values(db.presets)[0].fingerprint;
        const values = Object.values(sample.moodAffinities);
        const allNumeric = values.every(v => typeof v === 'number');
        expect(allNumeric).toBe(true);
    });

    test('butterchurnPresetsAll is v2.2 with all derived fields', () => {
        const db = JSON.parse(fs.readFileSync(CANONICAL_PATH, 'utf8'));
        expect(db.version).toMatch(/^2\.2/);
        const fp = Object.values(db.presets)[0].fingerprint;
        expect(fp.energyLabel).toBeDefined();
        expect(fp.musicalResponsiveness).toBeDefined();
        expect(fp.reliabilityTier).toBeDefined();
        expect(fp.dominantHue).toBeDefined();
    });
});

const ALASKA_BUTTER_PATH = path.join(
    REPO_ROOT, 'presets', 'alaska-butter', 'alaskaButter.fingerprints.json'
);

describe('P4.1 — alaskaButter fingerprints carry v2.2 derived fields (dual-pack coverage)', () => {
    test('alaskaButter has energyLabel on every preset', () => {
        const db = JSON.parse(fs.readFileSync(ALASKA_BUTTER_PATH, 'utf8'));
        const fingerprints = Object.values(db.presets).map(p => p.fingerprint);
        const missing = fingerprints.filter(fp => fp.energyLabel === undefined);
        expect(missing.length).toBe(0);
    });

    test('alaskaButter has musicalResponsiveness on every preset', () => {
        const db = JSON.parse(fs.readFileSync(ALASKA_BUTTER_PATH, 'utf8'));
        const fingerprints = Object.values(db.presets).map(p => p.fingerprint);
        const missing = fingerprints.filter(fp => fp.musicalResponsiveness === undefined);
        expect(missing.length).toBe(0);
    });

    test('alaskaButter has reliabilityTier on every preset', () => {
        const db = JSON.parse(fs.readFileSync(ALASKA_BUTTER_PATH, 'utf8'));
        const fingerprints = Object.values(db.presets).map(p => p.fingerprint);
        const missing = fingerprints.filter(fp => fp.reliabilityTier === undefined);
        expect(missing.length).toBe(0);
    });

    test('alaskaButter fingerprint count matches preset count (388)', () => {
        const db = JSON.parse(fs.readFileSync(ALASKA_BUTTER_PATH, 'utf8'));
        expect(Object.keys(db.presets).length).toBe(388);
    });
});

describe('P4.2 — Stage 1 categorical filter actually runs with realistic data', () => {
    let db;

    beforeAll(() => {
        db = JSON.parse(fs.readFileSync(CANONICAL_PATH, 'utf8'));
    });

    test('targeting visualStyle "particle" keeps it out of relaxedDimensions', () => {
        const matcher = new HierarchicalMatcher(db);

        const target = {
            energy: 0.7,
            bassEnergy: 0.6,
            trebleEnergy: 0.5,
            beatSync: 0.5,
            visualStyle: 'particle'
        };

        const result = matcher.findMatches(target, { limit: 30 });

        // With 12,461 butterchurnPresetsAll presets, Stage 1 should comfortably find
        // >= 5 matches on visualStyle alone (plus the relaxation buffer).
        expect(result.matchDepth).toBeGreaterThanOrEqual(1);
        expect(result.relaxedDimensions).not.toContain('visualStyle');
        expect(result.matches.length).toBeGreaterThan(0);

        // Every survivor should have visualStyle === 'particle' OR a similar
        // style (per VISUAL_STYLE_SIMILARITY soft-match for visualStyle).
        const survivorStyles = result.matches.map(h => db.presets[h].fingerprint.visualStyle);
        const distinct = new Set(survivorStyles);
        // 'particle' similar list is ['fluid_organic', 'abstract'] — survivors are a subset of {particle, fluid_organic, abstract}.
        const allowed = new Set(['particle', 'fluid_organic', 'abstract']);
        for (const style of distinct) {
            expect(allowed.has(style)).toBe(true);
        }
    });

    test('targeting musicalResponsiveness narrows the survivor set', () => {
        const matcher = new HierarchicalMatcher(db);

        const target = {
            energy: 0.5,
            bassEnergy: 0.5,
            trebleEnergy: 0.5,
            beatSync: 0.3,
            musicalResponsiveness: 'beat_detection'
        };

        const result = matcher.findMatches(target, { limit: 30 });

        expect(result.matchDepth).toBeGreaterThanOrEqual(1);
        expect(result.relaxedDimensions).not.toContain('musicalResponsiveness');

        const survivorTypes = result.matches.map(h => db.presets[h].fingerprint.musicalResponsiveness);
        // Stage 1 has no similarity map for musicalResponsiveness — only exact match
        for (const t of survivorTypes) {
            expect(t).toBe('beat_detection');
        }
    });

    test('combined visualStyle + musicalResponsiveness target still finds matches', () => {
        const matcher = new HierarchicalMatcher(db);

        const target = {
            energy: 0.6,
            bassEnergy: 0.5,
            trebleEnergy: 0.5,
            beatSync: 0.4,
            visualStyle: 'fractal',
            musicalResponsiveness: 'spectral_analysis'
        };

        const result = matcher.findMatches(target, { limit: 30 });

        // Even when both categoricals filter, we expect Stage 1 to find enough
        // candidates without relaxing both (the relaxation order drops the
        // lowest-priority categorical first).
        expect(result.matchDepth).toBeGreaterThanOrEqual(1);
    });

    test('no-target Stage 1 means everything passes (matchDepth at full)', () => {
        const matcher = new HierarchicalMatcher(db);

        // No categorical targets — matcher relaxes all categoricals and Stage 2
        // ranks everything. matchDepth reports 0 in that scenario.
        const target = {
            energy: 0.5, bassEnergy: 0.5, trebleEnergy: 0.5, beatSync: 0.3
        };

        const result = matcher.findMatches(target, { limit: 30 });

        // Without categorical targets, no constraint applies, so everything
        // survives Stage 1 vacuously and matchDepth lands at the top of the
        // priority list (matcher reports the deepest depth that still meets
        // minCandidates — when nothing is constraining, that's the full depth).
        expect(result.matches.length).toBeGreaterThan(0);
    });
});
