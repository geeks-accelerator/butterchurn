#!/usr/bin/env node
/**
 * Backfill derived v2.2 fields onto a fingerprint file.
 *
 * P1.1b (issue 2026-06-14-butterchurn-taxonomy-implementation-review):
 * Adds energyLabel, musicalResponsiveness, reliabilityTier, and dominantHue
 * to fingerprints that already have the v2.2 base fields (energy, bassEnergy,
 * trebleEnergy, beatSync, complexity, warmupTime, colorProfile).
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

function backfillFingerprint(hash, presetData) {
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

        if (changed) {
            presets[hash] = after;
            touched++;
        } else {
            unchanged++;
        }
    }

    console.log(`[backfill] Updated ${touched} presets, ${unchanged} already had derived fields`);
    console.log(`[backfill] Field additions:`);
    for (const [field, count] of Object.entries(counts)) {
        console.log(`           ${field}: ${count}`);
    }

    fs.writeFileSync(absOutput, JSON.stringify(data, null, 2));
    console.log(`[backfill] Wrote ${absOutput}`);
}

main();
