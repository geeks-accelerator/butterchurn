#!/usr/bin/env node
/**
 * Backfill derived v2.2 fields onto a fingerprint file.
 *
 * P1.1b (issue 2026-06-14-butterchurn-taxonomy-implementation-review):
 * Adds energyLabel, musicalResponsiveness, reliabilityTier, and dominantHue
 * to fingerprints that already have the v2.2 base fields (energy, bassEnergy,
 * trebleEnergy, beatSync, complexity, warmupTime, colorProfile).
 *
 * H1+H2 (plan §H Pre-Import Readiness Audit, 2026-06-14):
 *   - H1: stamp every record with `fingerprintAlgorithm: '2.2'`
 *   - H2: rebuild v2.2 indices (energyLabel/visualStyle/musicalResponsiveness/
 *         reliabilityTier/dominantHue) with alphabetical hash ordering for
 *         stable diffs across regenerations.
 *
 * Does NOT re-run CLIP — preserves existing visualStyle / visualStyleScores.
 * Does NOT regenerate from preset content — works purely on fingerprint data.
 *
 * Fields needing preset-content access (colorPaletteType / brightness /
 * colorComplexity from analyzePresetColor) are left unset; the matcher's
 * defensive null reads tolerate this. A full re-run of the generator
 * remains available for completeness — see tools/generate-fingerprints.js.
 *
 * Usage:
 *   node tools/backfill-fingerprint-derived-fields.mjs <input.fingerprints.json> [output.fingerprints.json]
 *
 * If output is omitted, writes in place.
 */

import fs from 'node:fs';
import path from 'node:path';
import { deriveEnergyLabel } from '../src/taxonomy/energyLabel.js';
import { deriveMusicalResponsiveness } from '../src/taxonomy/musicalResponsiveness.js';
import { deriveReliabilityTier } from '../src/taxonomy/reliability.js';

// H1 (plan §H): canonical content-hash algorithm version. Stamped on every
// record so the matcher and validators can detect divergent algorithms.
export const FINGERPRINT_ALGORITHM_VERSION = '2.2';

// colorProfile -> dominantHue mapping. colorProfile has 4 values
// (warm/cool/neutral/vivid); dominantHue has 5 (warm/cool/natural/neutral/rainbow).
// `vivid` maps to `rainbow` (multi-hue is the closest semantic match);
// `natural` is not derivable from `colorProfile` so unmapped presets get null.
const COLOR_PROFILE_TO_DOMINANT_HUE = {
    warm: 'warm',
    cool: 'cool',
    neutral: 'neutral',
    vivid: 'rainbow'
};

/**
 * Apply backfill derivations to a single preset record.
 * Pure function — no side effects. Caller is responsible for writing back.
 *
 * @param {string} hash - Content hash (unused, kept for symmetry with future
 *   per-hash derivations).
 * @param {Object} presetData - Raw preset entry from the fingerprints file.
 * @returns {Object} New preset entry with the derived fields added.
 */
export function backfillFingerprint(hash, presetData) {
    const fp = presetData.fingerprint ?? {};
    const out = { ...fp };

    // Phase 1: energyLabel from continuous energy
    if (out.energyLabel === undefined && typeof out.energy === 'number') {
        out.energyLabel = deriveEnergyLabel(out.energy);
    }

    // Phase 2: musicalResponsiveness from bassEnergy/trebleEnergy/beatSync
    if (out.musicalResponsiveness === undefined) {
        out.musicalResponsiveness = deriveMusicalResponsiveness({
            bassEnergy: out.bassEnergy ?? out.bass,
            trebleEnergy: out.trebleEnergy,
            beatSync: out.beatSync ?? out.beat
        });
    }

    // Phase 3: reliabilityTier from complexity + warmupTime.
    // Pass {} for preset so heavyPixel/heavyComp default to false — best-effort
    // when preset content isn't loaded. A full generator re-run produces a
    // more accurate value for presets with heavy pixel/comp shaders.
    if (out.reliabilityTier === undefined) {
        out.reliabilityTier = deriveReliabilityTier(
            { complexity: out.complexity ?? 0, warmupTime: out.warmupTime ?? 0 },
            {}
        );
    }

    // Phase 7: dominantHue from existing colorProfile (best-effort mapping)
    if (out.dominantHue === undefined && out.colorProfile) {
        const mapped = COLOR_PROFILE_TO_DOMINANT_HUE[out.colorProfile];
        if (mapped) out.dominantHue = mapped;
    }

    // H1: stamp algorithm version on every record
    if (out.fingerprintAlgorithm === undefined) {
        out.fingerprintAlgorithm = FINGERPRINT_ALGORITHM_VERSION;
    }

    // Mark backfilled fields as experimental so consumers know their provenance
    const backfilled = [];
    if (out.energyLabel !== undefined && fp.energyLabel === undefined) backfilled.push('energyLabel');
    if (out.musicalResponsiveness !== undefined && fp.musicalResponsiveness === undefined) backfilled.push('musicalResponsiveness');
    if (out.reliabilityTier !== undefined && fp.reliabilityTier === undefined) backfilled.push('reliabilityTier');
    if (out.dominantHue !== undefined && fp.dominantHue === undefined) backfilled.push('dominantHue');

    if (backfilled.length > 0) {
        const existing = Array.isArray(out._experimental) ? out._experimental : [];
        out._experimental = Array.from(new Set([...existing, ...backfilled]));
    }

    return { ...presetData, fingerprint: out };
}

/**
 * H2 (plan §H): build v2.2 indices keyed by the new categorical dimensions.
 * Hashes within each bucket are sorted alphabetically so re-runs against the
 * same input produce byte-identical files (also addresses §G8 plan item).
 *
 * @param {Object<string, Object>} presets - hash -> preset entry
 * @returns {Object} indices object containing legacy buckets + new v2.2 buckets
 */
export function buildIndices(presets) {
    const idx = {
        // Legacy 7-key buckets — kept so any v1.0 consumer code still works.
        high: [],
        bass: [],
        calm: [],
        particle: [],
        fractal: [],
        geometric: [],
        organic: [],

        // H2 v2.2 categorical buckets used by the matcher's Stage 1 filter.
        energyLabel: {
            calm: [], flowing: [], dynamic: [], energetic: [], intense: [], explosive: []
        },
        visualStyle: {
            fluid_organic: [], particle: [], geometric: [], fractal: [],
            abstract: [], kaleidoscope: [], tunnel: [], waveform: []
        },
        musicalResponsiveness: {
            spectral_analysis: [], beat_detection: [], volume_reactive: [],
            time_only: [], basic_audio: []
        },
        reliabilityTier: {
            rock_solid: [], stable: [], finicky: [], experimental: []
        },
        dominantHue: {
            warm: [], cool: [], natural: [], neutral: [], rainbow: []
        }
    };

    for (const [hash, presetData] of Object.entries(presets)) {
        const fp = presetData.fingerprint ?? {};

        // Legacy bucket population
        if (fp.energy > 0.7) idx.high.push(hash);
        if (fp.energy < 0.3) idx.calm.push(hash);
        if ((fp.bassEnergy ?? fp.bass ?? 0) > 0.6) idx.bass.push(hash);

        const legacyStyles = Array.isArray(fp.styles) ? fp.styles : [];
        if (legacyStyles.includes('particle')) idx.particle.push(hash);
        if (legacyStyles.includes('fractal')) idx.fractal.push(hash);
        if (legacyStyles.includes('geometric')) idx.geometric.push(hash);
        if (legacyStyles.includes('organic')) idx.organic.push(hash);

        // v2.2 bucket population — only when the categorical is present
        if (fp.energyLabel && idx.energyLabel[fp.energyLabel]) {
            idx.energyLabel[fp.energyLabel].push(hash);
        }
        if (fp.visualStyle && idx.visualStyle[fp.visualStyle]) {
            idx.visualStyle[fp.visualStyle].push(hash);
        }
        if (fp.musicalResponsiveness && idx.musicalResponsiveness[fp.musicalResponsiveness]) {
            idx.musicalResponsiveness[fp.musicalResponsiveness].push(hash);
        }
        if (fp.reliabilityTier && idx.reliabilityTier[fp.reliabilityTier]) {
            idx.reliabilityTier[fp.reliabilityTier].push(hash);
        }
        if (fp.dominantHue && idx.dominantHue[fp.dominantHue]) {
            idx.dominantHue[fp.dominantHue].push(hash);
        }
    }

    // Sort every bucket alphabetically by hash for stable diffs.
    const sortAll = (obj) => {
        for (const [k, v] of Object.entries(obj)) {
            if (Array.isArray(v)) {
                v.sort();
            } else if (v && typeof v === 'object') {
                sortAll(v);
            }
        }
    };
    sortAll(idx);
    return idx;
}

function main() {
    const inputPath = process.argv[2];
    const outputPath = process.argv[3] || inputPath;

    if (!inputPath) {
        console.error('Usage: backfill-fingerprint-derived-fields.mjs <input> [output]');
        process.exit(1);
    }

    const absInput = path.resolve(inputPath);
    const absOutput = path.resolve(outputPath);

    console.log(`[backfill] Reading ${absInput}`);
    const data = JSON.parse(fs.readFileSync(absInput, 'utf8'));

    const presets = data.presets || {};
    let touched = 0;
    let unchanged = 0;
    let algoStamped = 0;
    const counts = { energyLabel: 0, musicalResponsiveness: 0, reliabilityTier: 0, dominantHue: 0 };

    for (const [hash, presetData] of Object.entries(presets)) {
        const before = presetData.fingerprint || {};
        const after = backfillFingerprint(hash, presetData);
        const afterFp = after.fingerprint;

        let changed = false;
        for (const field of Object.keys(counts)) {
            if (afterFp[field] !== undefined && before[field] === undefined) {
                counts[field]++;
                changed = true;
            }
        }
        if (afterFp.fingerprintAlgorithm !== undefined && before.fingerprintAlgorithm === undefined) {
            algoStamped++;
            changed = true;
        }

        if (changed) {
            presets[hash] = after;
            touched++;
        } else {
            unchanged++;
        }
    }

    // H2: always rebuild indices so they reflect the current categorical fields
    // and are alphabetically sorted. Stable across re-runs over identical input.
    data.indices = buildIndices(presets);

    console.log(`[backfill] Updated ${touched} presets, ${unchanged} already had derived fields`);
    console.log(`[backfill] Field additions:`);
    for (const [field, count] of Object.entries(counts)) {
        console.log(`           ${field}: ${count}`);
    }
    console.log(`           fingerprintAlgorithm: ${algoStamped}`);
    console.log(`[backfill] Rebuilt indices with alphabetical hash ordering`);

    fs.writeFileSync(absOutput, JSON.stringify(data, null, 2));
    console.log(`[backfill] Wrote ${absOutput}`);
}

// Run main() only when invoked as a script (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
