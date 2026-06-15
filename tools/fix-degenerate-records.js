#!/usr/bin/env node
/**
 * Fix Degenerate Fingerprint Records
 *
 * Repairs records that have:
 * - N13: Invalid dominantHue values (numeric instead of categorical)
 * - N12-partial: Single-key visualStyleScores, missing optimalBpm, all-0.5 moodAffinities
 *
 * Re-derives fields using the canonical taxonomy modules.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveEnergyLabel } from '../src/taxonomy/energyLabel.js';
import { deriveMusicalResponsiveness } from '../src/taxonomy/musicalResponsiveness.js';
import { deriveReliabilityTier } from '../src/taxonomy/reliability.js';
import { analyzePresetColor } from '../src/taxonomy/colorAnalysis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Valid vocabulary sets (must match validator)
const VALID_VOCABULARY = {
    energyLabel: new Set(['calm', 'flowing', 'dynamic', 'energetic', 'intense', 'explosive']),
    musicalResponsiveness: new Set(['spectral_analysis', 'beat_detection', 'volume_reactive', 'time_only', 'basic_audio']),
    reliabilityTier: new Set(['rock_solid', 'stable', 'finicky', 'experimental']),
    visualStyle: new Set(['abstract', 'organic', 'fractal', 'geometric', 'particle', 'tunnel', 'fluid_organic', 'kaleidoscope', 'waveform']),
    dominantHue: new Set(['warm', 'cool', 'natural', 'neutral', 'rainbow']),
    colorProfile: new Set(['warm', 'cool', 'neutral', 'vivid', 'nature']),
};

// Default 8-key visualStyleScores
const DEFAULT_VISUAL_STYLE_SCORES = {
    particle: 0.5,
    fractal: 0.1,
    fluid_organic: 0.1,
    geometric: 0.1,
    abstract: 0.1,
    kaleidoscope: 0.05,
    tunnel: 0.025,
    waveform: 0.025
};

// Default moodAffinities (varied, not all 0.5)
const DEFAULT_MOOD_AFFINITIES = {
    aggressive: 0.3,
    relaxed: 0.6,
    happy: 0.5,
    electronic: 0.7,
    acoustic: 0.2,
    mystical: 0.4,
    hypnotic: 0.5,
    psychedelic: 0.3,
    dreamy: 0.5,
    meditative: 0.4
};

/**
 * Derive optimalBpm from energy and complexity
 */
function deriveOptimalBpm(energy, complexity) {
    // Base range depends on energy
    let minBpm, maxBpm;
    if (energy < 0.3) {
        minBpm = 60; maxBpm = 90;
    } else if (energy < 0.5) {
        minBpm = 80; maxBpm = 120;
    } else if (energy < 0.7) {
        minBpm = 100; maxBpm = 150;
    } else {
        minBpm = 120; maxBpm = 180;
    }

    // Adjust for complexity
    if (complexity > 0.7) {
        minBpm = Math.max(60, minBpm - 10);
        maxBpm = Math.min(200, maxBpm + 20);
    }

    const ideal = Math.round((minBpm + maxBpm) / 2);
    return { min: minBpm, max: maxBpm, ideal };
}

/**
 * Check if a value is invalid for a vocabulary field
 */
function isInvalidVocabulary(field, value) {
    if (!VALID_VOCABULARY[field]) return false;
    if (value === null || value === undefined) return false;
    return !VALID_VOCABULARY[field].has(value);
}

/**
 * Check if visualStyleScores is degenerate (less than 8 keys)
 */
function isDegenerateVisualStyleScores(scores) {
    if (!scores) return true;
    return Object.keys(scores).length < 8;
}

/**
 * Check if moodAffinities is all-0.5 (no signal)
 */
function isDegenerateMoodAffinities(moods) {
    if (!moods) return true;
    const values = Object.values(moods);
    return values.every(v => v === 0.5);
}

/**
 * Fix a single fingerprint record
 */
function fixRecord(hash, data, presets) {
    const fp = data.fingerprint || {};
    const names = data.names || [];
    let fixed = false;
    const fixes = [];

    // Get the preset for re-derivation
    const presetName = names[0];
    const preset = presets ? presets[presetName] : null;

    // Fix invalid dominantHue (N13)
    if (isInvalidVocabulary('dominantHue', fp.dominantHue) || typeof fp.dominantHue === 'number') {
        if (preset) {
            const colorAnalysis = analyzePresetColor(preset);
            fp.dominantHue = colorAnalysis.dominantHue;
        } else {
            fp.dominantHue = 'neutral';
        }
        fixes.push('dominantHue');
        fixed = true;
    }

    // Fix degenerate visualStyleScores (N12-partial)
    if (isDegenerateVisualStyleScores(fp.visualStyleScores)) {
        // Preserve the existing dominant style if present
        const existingStyle = fp.visualStyleScores ? Object.keys(fp.visualStyleScores)[0] : 'particle';
        const scores = { ...DEFAULT_VISUAL_STYLE_SCORES };
        if (existingStyle && scores[existingStyle] !== undefined) {
            scores[existingStyle] = 0.8; // Boost the dominant style
        }
        fp.visualStyleScores = scores;
        fixes.push('visualStyleScores');
        fixed = true;
    }

    // Fix missing optimalBpm
    if (!fp.optimalBpm) {
        const energy = fp.energy || 0.5;
        const complexity = fp.complexity || 0.5;
        fp.optimalBpm = deriveOptimalBpm(energy, complexity);
        fixes.push('optimalBpm');
        fixed = true;
    }

    // Fix degenerate moodAffinities
    if (isDegenerateMoodAffinities(fp.moodAffinities)) {
        // Derive from energy and complexity
        const energy = fp.energy || 0.5;
        const complexity = fp.complexity || 0.5;
        const moods = { ...DEFAULT_MOOD_AFFINITIES };

        // Adjust based on energy
        if (energy > 0.7) {
            moods.aggressive = 0.6;
            moods.relaxed = 0.3;
            moods.electronic = 0.8;
        } else if (energy < 0.3) {
            moods.aggressive = 0.1;
            moods.relaxed = 0.8;
            moods.meditative = 0.7;
            moods.dreamy = 0.7;
        }

        // Adjust based on complexity
        if (complexity > 0.7) {
            moods.psychedelic = 0.6;
            moods.mystical = 0.6;
        }

        fp.moodAffinities = moods;
        fixes.push('moodAffinities');
        fixed = true;
    }

    // Fix invalid colorProfile
    if (isInvalidVocabulary('colorProfile', fp.colorProfile)) {
        if (preset) {
            const colorAnalysis = analyzePresetColor(preset);
            fp.colorProfile = colorAnalysis.colorProfile;
        } else {
            fp.colorProfile = 'neutral';
        }
        fixes.push('colorProfile');
        fixed = true;
    }

    data.fingerprint = fp;
    return { fixed, fixes };
}

async function main() {
    const args = process.argv.slice(2);
    let fingerprintsPath = path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.fingerprints.json');
    let presetsPath = path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.json');

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--fingerprints' && args[i + 1]) {
            fingerprintsPath = path.resolve(args[++i]);
        } else if (args[i] === '--presets' && args[i + 1]) {
            presetsPath = path.resolve(args[++i]);
        }
    }

    console.log('[fix] Degenerate Record Fixer');
    console.log('[fix] ========================\n');

    // Load fingerprints
    console.log(`[fix] Loading fingerprints: ${fingerprintsPath}`);
    const fingerprints = JSON.parse(fs.readFileSync(fingerprintsPath, 'utf8'));

    // Try to load presets for re-derivation
    let presets = null;
    try {
        console.log(`[fix] Loading presets: ${presetsPath}`);
        presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
    } catch (e) {
        console.log(`[fix] Warning: Could not load presets (re-derivation disabled): ${e.message}`);
    }

    const fpEntries = fingerprints.presets || {};
    let totalFixed = 0;
    const fixesByType = {};

    console.log(`\n[fix] Scanning ${Object.keys(fpEntries).length} records...`);

    for (const [hash, data] of Object.entries(fpEntries)) {
        const { fixed, fixes } = fixRecord(hash, data, presets);
        if (fixed) {
            totalFixed++;
            for (const fix of fixes) {
                fixesByType[fix] = (fixesByType[fix] || 0) + 1;
            }
        }
    }

    console.log(`\n[fix] Results`);
    console.log(`=============`);
    console.log(`Records fixed: ${totalFixed}`);
    console.log(`Fixes by type:`);
    for (const [type, count] of Object.entries(fixesByType)) {
        console.log(`  ${type}: ${count}`);
    }

    if (totalFixed > 0) {
        // Write back
        console.log(`\n[fix] Writing updated fingerprints...`);
        fs.writeFileSync(fingerprintsPath, JSON.stringify(fingerprints, null, 2));

        // Also update minified version
        const minPath = fingerprintsPath.replace('.json', '.min.json');
        fs.writeFileSync(minPath, JSON.stringify(fingerprints));
        console.log(`[fix] Updated: ${fingerprintsPath}`);
        console.log(`[fix] Updated: ${minPath}`);
    } else {
        console.log(`\n[fix] No fixes needed.`);
    }

    console.log(`\n✅ Done!`);
}

main().catch(err => {
    console.error('[fix] Error:', err);
    process.exit(1);
});
