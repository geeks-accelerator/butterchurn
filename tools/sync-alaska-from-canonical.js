#!/usr/bin/env node
/**
 * Sync Alaska Pack from Canonical
 *
 * Alaska pack is a curated subset of butterchurnPresetsAll.
 * This script syncs fingerprints from the canonical pack to ensure
 * alaska has the same quality fingerprints.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateContentHash } from '../src/utils/contentHash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('[sync-alaska] Syncing alaska fingerprints from canonical...\n');

// Load canonical fingerprints (name-keyed)
const canonicalPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.fingerprints.json');
const canonical = JSON.parse(fs.readFileSync(canonicalPath, 'utf8'));

// Build hash → fingerprint lookup from canonical
const hashToFp = new Map();
for (const [name, data] of Object.entries(canonical.presets)) {
    if (data.hash) {
        hashToFp.set(data.hash, { ...data, canonicalName: name });
    }
}
console.log('Canonical fingerprints loaded:', Object.keys(canonical.presets).length);
console.log('Hash lookup entries:', hashToFp.size);

// Load alaska presets
const alaskaPresetsPath = path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.json');
const alaskaPresets = JSON.parse(fs.readFileSync(alaskaPresetsPath, 'utf8'));
console.log('Alaska presets:', Object.keys(alaskaPresets).length);

// Build new alaska fingerprint DB
const newDb = {
    version: '2.2.2',
    generated: new Date().toISOString(),
    fingerprintAlgorithm: '2.2',
    presets: {},
    nameIndex: {},
    authorIndex: {},
    indices: {
        high: [], bass: [], calm: [], particle: [], fractal: [], geometric: [], organic: [],
        energyLabel: { calm: [], flowing: [], dynamic: [], energetic: [], intense: [], explosive: [] },
        visualStyle: { fluid_organic: [], particle: [], geometric: [], fractal: [], abstract: [], kaleidoscope: [], tunnel: [], waveform: [], organic: [] },
        musicalResponsiveness: { spectral_analysis: [], beat_detection: [], volume_reactive: [], time_only: [], basic_audio: [] },
        reliabilityTier: { rock_solid: [], stable: [], finicky: [], experimental: [] },
        dominantHue: { warm: [], cool: [], neutral: [], natural: [], rainbow: [] }
    }
};

let matched = 0;
let notFound = 0;

for (const [name, preset] of Object.entries(alaskaPresets)) {
    const hash = generateContentHash(preset);
    const canonicalFp = hashToFp.get(hash);

    if (canonicalFp) {
        // Copy fingerprint from canonical
        newDb.presets[name] = {
            hash: hash,
            authors: canonicalFp.authors || [],
            names: [name],
            fingerprint: { ...canonicalFp.fingerprint }
        };
        matched++;
    } else {
        // Generate minimal fingerprint
        notFound++;
        console.log('  Not in canonical:', name.substring(0, 50));
        newDb.presets[name] = {
            hash: hash,
            authors: [],
            names: [name],
            fingerprint: {
                energy: 0.5, bassEnergy: 0.5, complexity: 0.5, beatSync: 0.3,
                fps: 60, warmupTime: 0,
                visualStyle: 'abstract', visualStyleSource: 'equation',
                energyLabel: 'dynamic', musicalResponsiveness: 'basic_audio',
                reliabilityTier: 'stable', dominantHue: 'neutral',
                colorProfile: 'neutral', motionSpeed: 'medium',
                optimalBpm: { min: 90, max: 150, ideal: 120 },
                fingerprintAlgorithm: '2.2',
                visualStyleScores: {
                    particle: 0.1, fractal: 0.1, geometric: 0.1, fluid_organic: 0.1,
                    abstract: 0.2, kaleidoscope: 0.1, tunnel: 0.1, waveform: 0.1, organic: 0.1
                },
                moodAffinities: {
                    energetic: 0.5, calm: 0.5, dark: 0.3, bright: 0.5,
                    hypnotic: 0.4, aggressive: 0.3, mystical: 0.3,
                    psychedelic: 0.2, dreamy: 0.3, meditative: 0.5
                }
            }
        };
    }

    // Update indices
    const fp = newDb.presets[name].fingerprint;
    if (fp.energy > 0.7) newDb.indices.high.push(name);
    if (fp.energy < 0.3) newDb.indices.calm.push(name);
    if ((fp.bassEnergy ?? 0) > 0.6) newDb.indices.bass.push(name);

    if (fp.energyLabel && newDb.indices.energyLabel[fp.energyLabel]) {
        newDb.indices.energyLabel[fp.energyLabel].push(name);
    }
    if (fp.visualStyle && newDb.indices.visualStyle[fp.visualStyle]) {
        newDb.indices.visualStyle[fp.visualStyle].push(name);
    }
    if (fp.musicalResponsiveness && newDb.indices.musicalResponsiveness[fp.musicalResponsiveness]) {
        newDb.indices.musicalResponsiveness[fp.musicalResponsiveness].push(name);
    }
    if (fp.reliabilityTier && newDb.indices.reliabilityTier[fp.reliabilityTier]) {
        newDb.indices.reliabilityTier[fp.reliabilityTier].push(name);
    }
    if (fp.dominantHue && newDb.indices.dominantHue[fp.dominantHue]) {
        newDb.indices.dominantHue[fp.dominantHue].push(name);
    }

    // Update name and author indices
    newDb.nameIndex[name] = name;
    for (const author of newDb.presets[name].authors || []) {
        if (!newDb.authorIndex[author]) newDb.authorIndex[author] = [];
        if (!newDb.authorIndex[author].includes(name)) {
            newDb.authorIndex[author].push(name);
        }
    }
}

// Sort all indices
for (const key of ['high', 'bass', 'calm', 'particle', 'fractal', 'geometric', 'organic']) {
    if (newDb.indices[key]) newDb.indices[key].sort();
}
for (const category of ['energyLabel', 'visualStyle', 'musicalResponsiveness', 'reliabilityTier', 'dominantHue']) {
    for (const bucket of Object.keys(newDb.indices[category])) {
        newDb.indices[category][bucket].sort();
    }
}

console.log('\nResults:');
console.log('  Matched from canonical:', matched);
console.log('  Not found (generated):', notFound);
console.log('  Total:', Object.keys(newDb.presets).length);

// Write
const outPath = path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.fingerprints.json');
fs.writeFileSync(outPath, JSON.stringify(newDb, null, 2));
fs.writeFileSync(outPath.replace('.json', '.min.json'), JSON.stringify(newDb));

// Verify
let sources = { clip: 0, equation: 0 };
for (const data of Object.values(newDb.presets)) {
    const src = data.fingerprint?.visualStyleSource;
    if (src === 'clip') sources.clip++;
    else sources.equation++;
}
console.log('\nvisualStyleSource:', sources);

// visualStyle distribution
let styles = {};
for (const data of Object.values(newDb.presets)) {
    const s = data.fingerprint?.visualStyle || 'undefined';
    styles[s] = (styles[s] || 0) + 1;
}
console.log('visualStyle distribution:', styles);

console.log('\n✅ Alaska pack synced from canonical!');
