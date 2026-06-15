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
 * CLIP Integration (2026-06-14, preset expansion plan BLOCKER A+B fix):
 *   - When --clip-styles is provided, overwrites visualStyle/visualStyleScores
 *     from CLIP classification and RE-DERIVES moodAffinities from the new
 *     visualStyle. This is critical: moodAffinities was derived from a
 *     heuristic placeholder visualStyle during initial fingerprinting.
 *   - Manages _experimental field: adds visualStyle when heuristic-derived,
 *     removes it when CLIP-grounded.
 *
 * Usage:
 *   # Positional args (legacy):
 *   node tools/backfill-fingerprint-derived-fields.mjs <input.fingerprints.json> [output.fingerprints.json]
 *
 *   # Named flags (new, for CLIP integration):
 *   node tools/backfill-fingerprint-derived-fields.mjs \
 *     --fingerprints presets/imports/ansorre.fingerprints.json \
 *     --clip-styles presets/imports/ansorre-clip-styles.json \
 *     --output presets/imports/ansorre.fingerprints.json
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
 * Derive mood affinities from visual style, motion, color, and energy.
 * Copied from generate-fingerprints.js to avoid import complexity.
 * MUST stay in sync with the generator's deriveMoodAffinities.
 */
export function deriveMoodAffinities(visualStyle, motionSpeed, colorProfile, energy = 0.5, beatSync = 0.5) {
    const affinities = {
        aggressive: 0.5,
        relaxed: 0.5,
        happy: 0.5,
        electronic: 0.5,
        acoustic: 0.5,
        mystical: 0.5,
        hypnotic: 0.5,
        psychedelic: 0.5,
        dreamy: 0.5,
        meditative: 0.5
    };

    const styleBoosts = {
        fluid_organic: { relaxed: 0.3, acoustic: 0.2, dreamy: 0.2 },
        organic: { relaxed: 0.25, acoustic: 0.2, happy: 0.1, meditative: 0.15 },
        particle: { electronic: 0.4, happy: 0.2, psychedelic: 0.15 },
        geometric: { electronic: 0.3, aggressive: 0.1, hypnotic: 0.1 },
        fractal: {
            hypnotic: 0.4,
            mystical: 0.3,
            aggressive: -0.3,
            relaxed: 0.2,
            meditative: 0.2
        },
        tunnel: { aggressive: 0.2, electronic: 0.3, hypnotic: 0.25 },
        abstract: { electronic: 0.15, psychedelic: 0.1 },
        kaleidoscope: { psychedelic: 0.3, hypnotic: 0.2, happy: 0.15 },
        waveform: { electronic: 0.2, aggressive: 0.1 }
    };

    const primaryStyle = Array.isArray(visualStyle) ? visualStyle[0] : visualStyle;
    if (primaryStyle && styleBoosts[primaryStyle]) {
        for (const [mood, boost] of Object.entries(styleBoosts[primaryStyle])) {
            affinities[mood] = Math.max(0, Math.min(1, affinities[mood] + boost));
        }
    }

    // Motion speed influences
    if (motionSpeed === 'fast') {
        affinities.aggressive += 0.2;
        affinities.relaxed -= 0.2;
        affinities.happy += 0.1;
        affinities.electronic += 0.1;
        affinities.psychedelic += 0.1;
    } else if (motionSpeed === 'slow') {
        affinities.relaxed += 0.2;
        affinities.aggressive -= 0.2;
        affinities.acoustic += 0.15;
        affinities.dreamy += 0.2;
        affinities.meditative += 0.15;
    } else if (motionSpeed === 'medium') {
        affinities.happy += 0.1;
        affinities.hypnotic += 0.1;
    }

    // Color influences
    switch (colorProfile) {
        case 'warm':
            affinities.aggressive += 0.1;
            affinities.happy += 0.2;
            break;
        case 'cool':
            affinities.relaxed += 0.15;
            affinities.electronic += 0.15;
            affinities.mystical += 0.2;
            affinities.dreamy += 0.15;
            break;
        case 'nature':
            affinities.relaxed += 0.2;
            affinities.acoustic += 0.2;
            affinities.happy += 0.15;
            affinities.meditative += 0.15;
            break;
        case 'vivid':
            affinities.happy += 0.25;
            affinities.electronic += 0.15;
            affinities.psychedelic += 0.3;
            break;
        case 'bright':
            affinities.happy += 0.2;
            affinities.relaxed += 0.1;
            affinities.dreamy += 0.1;
            break;
        case 'dark':
            affinities.aggressive += 0.15;
            affinities.relaxed -= 0.1;
            affinities.acoustic += 0.1;
            affinities.mystical += 0.25;
            affinities.hypnotic += 0.15;
            break;
    }

    // Energy-based adjustments
    if (energy > 0.7) {
        affinities.aggressive += 0.15;
        affinities.electronic += 0.1;
        affinities.happy += 0.1;
        affinities.psychedelic += 0.1;
    } else if (energy < 0.3) {
        affinities.relaxed += 0.2;
        affinities.acoustic += 0.15;
        affinities.dreamy += 0.2;
        affinities.meditative += 0.2;
    }

    // Beat sync influences
    if (beatSync > 0.7) {
        affinities.electronic += 0.15;
        affinities.aggressive += 0.1;
        affinities.hypnotic += 0.15;
    } else if (beatSync < 0.3) {
        affinities.acoustic += 0.1;
        affinities.relaxed += 0.1;
        affinities.dreamy += 0.15;
        affinities.meditative += 0.1;
    }

    // Energy-relaxed cross-validation
    if (energy > 0.6) {
        affinities.relaxed -= 0.15;
    }

    // Prevent contradictions
    if (affinities.aggressive > 0.7 && affinities.relaxed > 0.7) {
        if (energy > 0.5) {
            affinities.relaxed -= 0.25;
        } else {
            affinities.aggressive -= 0.25;
        }
    }

    // Abstract variation
    if (primaryStyle === 'abstract') {
        const variation = (energy - 0.5) * 0.2;
        affinities.happy += variation;
        affinities.electronic += variation;
        affinities.psychedelic += Math.abs(variation);
    }

    // Organic caps
    if (primaryStyle === 'organic' || primaryStyle === 'fluid_organic') {
        if (affinities.electronic > affinities.acoustic) {
            const avg = (affinities.electronic + affinities.acoustic) / 2;
            affinities.acoustic = Math.min(1, avg + 0.1);
            affinities.electronic = Math.max(0, avg - 0.1);
        }
        affinities.aggressive = Math.min(affinities.aggressive, 0.75);
        affinities.relaxed = Math.max(affinities.relaxed, 0.5);
    }

    // Normalize to 2 decimal places, emit numbers not strings
    return Object.fromEntries(
        Object.entries(affinities).map(([k, v]) => [k, Number(Math.max(0, Math.min(1, v)).toFixed(2))])
    );
}

/**
 * Apply backfill derivations to a single preset record.
 * Pure function — no side effects. Caller is responsible for writing back.
 *
 * @param {string} hash - Content hash (used for CLIP lookup).
 * @param {Object} presetData - Raw preset entry from the fingerprints file.
 * @param {Object|null} clipData - CLIP classification for this preset, if available.
 * @returns {Object} New preset entry with the derived fields added.
 */
export function backfillFingerprint(hash, presetData, clipData = null) {
    const fp = presetData.fingerprint ?? {};
    const out = { ...fp };

    // Track what was CLIP-updated vs heuristic-derived
    let visualStyleFromCLIP = false;

    // CLIP integration: overwrite visualStyle/visualStyleScores if CLIP data provided
    if (clipData && clipData.visualStyle) {
        out.visualStyle = clipData.visualStyle;
        out.visualStyleScores = clipData.visualStyleScores || null;
        out.visualStyleSource = 'clip';
        visualStyleFromCLIP = true;

        // RE-DERIVE moodAffinities from the new CLIP visualStyle
        // This is critical: the original moodAffinities was derived from a heuristic placeholder
        out.moodAffinities = deriveMoodAffinities(
            out.visualStyle,
            out.motionSpeed || 'medium',
            out.colorProfile || 'neutral',
            out.energy ?? 0.5,
            out.beatSync ?? out.beat ?? 0.5
        );
    }

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

    // Manage _experimental field (SOFT FINDING C fix)
    const existing = Array.isArray(out._experimental) ? [...out._experimental] : [];

    // Fields that are always experimental until further notice
    const alwaysExperimental = [
        'colorProfile', 'motionSpeed', 'energyLabel', 'musicalResponsiveness',
        'reliabilityTier', 'colorPaletteType', 'dominantHue', 'brightness', 'colorComplexity'
    ];

    // visualStyle and moodAffinities: experimental if NOT CLIP-grounded
    if (visualStyleFromCLIP) {
        // Remove from experimental since now CLIP-grounded
        const toRemove = new Set(['visualStyle', 'visualStyleScores', 'moodAffinities']);
        out._experimental = [...new Set([...existing, ...alwaysExperimental])].filter(x => !toRemove.has(x));
    } else {
        // Add to experimental since heuristic-derived (SOFT FINDING C)
        out._experimental = [...new Set([...existing, ...alwaysExperimental, 'visualStyle', 'moodAffinities'])];
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

/**
 * Parse command line arguments.
 * Supports both legacy positional args and new named flags.
 */
function parseArgs(argv) {
    const args = {
        fingerprints: null,
        clipStyles: null,
        output: null
    };

    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];

        if (arg.startsWith('--fingerprints=')) {
            args.fingerprints = arg.split('=')[1];
        } else if (arg === '--fingerprints' && argv[i + 1]) {
            args.fingerprints = argv[++i];
        } else if (arg.startsWith('--clip-styles=')) {
            args.clipStyles = arg.split('=')[1];
        } else if (arg === '--clip-styles' && argv[i + 1]) {
            args.clipStyles = argv[++i];
        } else if (arg.startsWith('--output=')) {
            args.output = arg.split('=')[1];
        } else if (arg === '--output' && argv[i + 1]) {
            args.output = argv[++i];
        } else if (!arg.startsWith('-') && !args.fingerprints) {
            // Legacy positional: first positional is input
            args.fingerprints = arg;
        } else if (!arg.startsWith('-') && args.fingerprints && !args.output) {
            // Legacy positional: second positional is output
            args.output = arg;
        }
    }

    return args;
}

function main() {
    const args = parseArgs(process.argv);

    if (!args.fingerprints) {
        console.error(`Usage: backfill-fingerprint-derived-fields.mjs <input> [output]
       backfill-fingerprint-derived-fields.mjs --fingerprints <path> [--clip-styles <path>] [--output <path>]

Options:
  --fingerprints  Input fingerprints JSON file
  --clip-styles   CLIP classification results (overwrites visualStyle, re-derives moodAffinities)
  --output        Output path (defaults to input path for in-place update)`);
        process.exit(1);
    }

    const inputPath = args.fingerprints;
    const outputPath = args.output || inputPath;

    const absInput = path.resolve(inputPath);
    const absOutput = path.resolve(outputPath);

    console.log(`[backfill] Reading ${absInput}`);
    const data = JSON.parse(fs.readFileSync(absInput, 'utf8'));

    // Load CLIP styles if provided
    let clipStyles = null;
    if (args.clipStyles) {
        const absClip = path.resolve(args.clipStyles);
        console.log(`[backfill] Loading CLIP styles from ${absClip}`);
        clipStyles = JSON.parse(fs.readFileSync(absClip, 'utf8'));
        console.log(`[backfill] Loaded ${Object.keys(clipStyles).length} CLIP classifications`);
    }

    const presets = data.presets || {};
    let touched = 0;
    let unchanged = 0;
    let algoStamped = 0;
    let clipUpdated = 0;
    let moodRederived = 0;
    const counts = { energyLabel: 0, musicalResponsiveness: 0, reliabilityTier: 0, dominantHue: 0 };

    for (const [hash, presetData] of Object.entries(presets)) {
        const before = presetData.fingerprint || {};

        // Look up CLIP data by hash or by preset name
        // CLIP keys use sanitized filenames (non-alphanumeric -> underscore, max 100 chars)
        // so we need to normalize preset names to match
        const normalizeForCLIP = (name) => name.replace(/[^a-z0-9]/gi, '_').substring(0, 100);

        let clipData = null;
        if (clipStyles) {
            // Try hash first, then preset name, then normalized preset name
            clipData = clipStyles[hash];
            if (!clipData && presetData.names && presetData.names[0]) {
                clipData = clipStyles[presetData.names[0]];
            }
            if (!clipData && presetData.names && presetData.names[0]) {
                const normalizedName = normalizeForCLIP(presetData.names[0]);
                clipData = clipStyles[normalizedName];
            }
        }

        const after = backfillFingerprint(hash, presetData, clipData);
        const afterFp = after.fingerprint;

        let changed = false;

        // Track CLIP updates
        if (clipData && clipData.visualStyle) {
            if (before.visualStyle !== afterFp.visualStyle) {
                clipUpdated++;
                changed = true;
            }
            if (JSON.stringify(before.moodAffinities) !== JSON.stringify(afterFp.moodAffinities)) {
                moodRederived++;
                changed = true;
            }
        }

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
    if (clipStyles) {
        console.log(`[backfill] CLIP integration:`);
        console.log(`           visualStyle updated: ${clipUpdated}`);
        console.log(`           moodAffinities re-derived: ${moodRederived}`);
    }
    console.log(`[backfill] Rebuilt indices with alphabetical hash ordering`);

    fs.writeFileSync(absOutput, JSON.stringify(data, null, 2));
    console.log(`[backfill] Wrote ${absOutput}`);
}

// Run main() only when invoked as a script (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
