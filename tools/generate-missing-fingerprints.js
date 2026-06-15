#!/usr/bin/env node
/**
 * Generate Fingerprints for Missing Presets
 *
 * After merge-fingerprints-for-all.js, some presets may not have fingerprints
 * because the source artifacts used a different hash algorithm. This script
 * generates equation-based fingerprints for those missing presets.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateContentHash } from '../src/utils/contentHash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('[gen-missing] Generating fingerprints for missing presets\n');

// Load preset bundle
const presetsPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.json');
const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
console.log(`[gen-missing] Loaded ${Object.keys(presets).length} presets from bundle`);

// Load current fingerprints
const fpPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.fingerprints.json');
const fpDb = JSON.parse(fs.readFileSync(fpPath, 'utf8'));
console.log(`[gen-missing] Existing fingerprints: ${Object.keys(fpDb.presets).length}`);

// Find missing presets
const existingNames = new Set(Object.keys(fpDb.presets));
const missing = [];
for (const [name, preset] of Object.entries(presets)) {
    if (!existingNames.has(name)) {
        missing.push({ name, preset });
    }
}
console.log(`[gen-missing] Missing: ${missing.length}`);

if (missing.length === 0) {
    console.log('\n✅ No missing fingerprints!');
    process.exit(0);
}

// Extract author from preset name
function extractAuthor(name) {
    const match = name.match(/^([^-+]+)/);
    return match ? match[1].trim() : 'Unknown';
}

// Derive visualStyle from equations (equation-based, not CLIP)
function deriveVisualStyle(preset) {
    const name = preset.name || '';
    const nameLower = name.toLowerCase();

    // Keyword matching with word boundaries
    if (/\bparticle\b/i.test(nameLower)) return 'particle';
    if (/\bfractal\b/i.test(nameLower)) return 'fractal';
    if (/\bgeometr/i.test(nameLower)) return 'geometric';
    if (/\borganic\b/i.test(nameLower)) return 'organic';
    if (/\btunnel\b/i.test(nameLower)) return 'tunnel';
    if (/\bwave\b/i.test(nameLower)) return 'waveform';
    if (/\bfluid\b/i.test(nameLower)) return 'fluid_organic';
    if (/\bkaleidoscope\b/i.test(nameLower)) return 'kaleidoscope';

    // Default based on equation complexity
    const hasShapes = (preset.shapes || []).length > 0;
    const hasWaves = (preset.waves || []).length > 0;
    const hasWarp = !!(preset.warp_eqs_str || preset.warp?.eel || (typeof preset.warp === 'string' && preset.warp));

    if (hasShapes && !hasWaves) return 'geometric';
    if (hasWaves && !hasShapes) return 'waveform';
    if (hasWarp) return 'fractal';

    return 'abstract';
}

// Derive energy from equations
function deriveEnergy(preset) {
    const baseVals = preset.baseVals || {};
    const zoom = baseVals.zoom || 1;
    const decay = baseVals.decay || 0.98;
    const warp = baseVals.warp || 0;

    let energy = 0.5;
    if (zoom > 1.1 || zoom < 0.9) energy += 0.2;
    if (decay < 0.95) energy += 0.15;
    if (warp > 0.5) energy += 0.15;

    return Math.min(1, Math.max(0, energy));
}

// Generate fingerprint for a preset
function generateFingerprint(name, preset) {
    const hash = generateContentHash(preset);
    const author = extractAuthor(name);
    const visualStyle = deriveVisualStyle({ ...preset, name });
    const energy = deriveEnergy(preset);

    const energyLabel = energy > 0.7 ? 'high' : energy < 0.3 ? 'low' : 'medium';
    const musicalResponsiveness = 'medium';
    const reliabilityTier = 'stable';
    const dominantHue = 'neutral';
    const colorProfile = 'neutral';

    return {
        hash,
        authors: [author],
        names: [name],
        firstSeen: author,
        fingerprint: {
            energy,
            bassEnergy: 0.5,
            bass: 0.5,
            trebleEnergy: 0.5,
            complexity: 0.5,
            beatSync: 0,
            beat: 0,
            fps: 60,
            styles: [],
            warmupTime: 0,
            visualStyle,
            visualStyleSource: 'equation',
            visualStyleScores: {
                particle: 0.1,
                fractal: 0.1,
                geometric: 0.1,
                fluid_organic: 0.1,
                abstract: 0.2,
                kaleidoscope: 0.1,
                tunnel: 0.1,
                waveform: 0.1,
                organic: 0.1
            },
            energyLabel,
            musicalResponsiveness,
            reliabilityTier,
            dominantHue,
            colorProfile,
            motionSpeed: 'medium',
            moodAffinities: {
                energetic: energy,
                calm: 1 - energy,
                dark: 0.3,
                bright: 0.5,
                hypnotic: 0.4,
                aggressive: energy * 0.5,
                mystical: 0.3,
                psychedelic: 0.2,
                dreamy: 0.3,
                meditative: 1 - energy
            },
            optimalBpm: Math.round(80 + energy * 80),
            fingerprintAlgorithm: '2.2'
        }
    };
}

// Generate fingerprints for all missing presets
let generated = 0;
for (const { name, preset } of missing) {
    const fp = generateFingerprint(name, preset);
    fpDb.presets[name] = fp;
    fpDb.nameIndex[name] = name;

    // Update author index
    for (const author of fp.authors) {
        if (!fpDb.authorIndex[author]) {
            fpDb.authorIndex[author] = [];
        }
        if (!fpDb.authorIndex[author].includes(name)) {
            fpDb.authorIndex[author].push(name);
        }
    }

    // Update indices
    const f = fp.fingerprint;
    if (f.energy > 0.7) fpDb.indices.high.push(name);
    if (f.energy < 0.3) fpDb.indices.calm.push(name);
    if (f.bassEnergy > 0.6) fpDb.indices.bass.push(name);

    if (f.energyLabel && fpDb.indices.energyLabel[f.energyLabel]) {
        fpDb.indices.energyLabel[f.energyLabel].push(name);
    }
    if (f.visualStyle && fpDb.indices.visualStyle[f.visualStyle]) {
        fpDb.indices.visualStyle[f.visualStyle].push(name);
    }
    if (f.musicalResponsiveness && fpDb.indices.musicalResponsiveness[f.musicalResponsiveness]) {
        fpDb.indices.musicalResponsiveness[f.musicalResponsiveness].push(name);
    }
    if (f.reliabilityTier && fpDb.indices.reliabilityTier[f.reliabilityTier]) {
        fpDb.indices.reliabilityTier[f.reliabilityTier].push(name);
    }
    if (f.dominantHue && fpDb.indices.dominantHue[f.dominantHue]) {
        fpDb.indices.dominantHue[f.dominantHue].push(name);
    }

    generated++;
}

console.log(`[gen-missing] Generated: ${generated}`);

// Sort all index arrays
for (const key of ['high', 'bass', 'calm', 'particle', 'fractal', 'geometric', 'organic']) {
    if (fpDb.indices[key]) fpDb.indices[key].sort();
}
for (const category of ['energyLabel', 'visualStyle', 'musicalResponsiveness', 'reliabilityTier', 'dominantHue']) {
    if (fpDb.indices[category]) {
        for (const bucket of Object.keys(fpDb.indices[category])) {
            fpDb.indices[category][bucket].sort();
        }
    }
}

// Update metadata
fpDb.version = '2.2.1';
fpDb.generated = new Date().toISOString();

// Write updated fingerprints
fs.writeFileSync(fpPath, JSON.stringify(fpDb, null, 2));

// Write minified version
const minPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.fingerprints.min.json');
fs.writeFileSync(minPath, JSON.stringify(fpDb));

const stats = fs.statSync(fpPath);
console.log(`\n[gen-missing] Output: ${fpPath}`);
console.log(`[gen-missing] Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
console.log(`[gen-missing] Total presets: ${Object.keys(fpDb.presets).length}`);

console.log('\n✅ Missing fingerprints generated!');
