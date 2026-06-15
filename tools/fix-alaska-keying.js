#!/usr/bin/env node
/**
 * Fix Alaska Pack Keying
 *
 * Converts alaska fingerprints from hash-keyed to name-keyed format
 * to match the canonical butterchurnPresetsAll structure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateContentHash } from '../src/utils/contentHash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('[fix-alaska] Converting alaska fingerprints from hash-keyed to name-keyed...\n');

// Load alaska fingerprints (hash-keyed) and presets (name-keyed)
const hashKeyedDb = JSON.parse(fs.readFileSync(
    path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.fingerprints.json'), 'utf8'));
const presets = JSON.parse(fs.readFileSync(
    path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.json'), 'utf8'));

console.log('Original entries:', Object.keys(hashKeyedDb.presets).length);
console.log('Presets:', Object.keys(presets).length);

// Build hash → fingerprint lookup
const hashToFp = new Map();
for (const [hash, data] of Object.entries(hashKeyedDb.presets)) {
    hashToFp.set(hash, { ...data, hash });
}

// Create new name-keyed DB
const newDb = {
    version: '2.2.2',
    generated: new Date().toISOString(),
    fingerprintAlgorithm: '2.2',
    presets: {},
    nameIndex: {},
    authorIndex: {},
    indices: {}
};

let matched = 0;
let missing = 0;

for (const [name, preset] of Object.entries(presets)) {
    const hash = generateContentHash(preset);
    const fpData = hashToFp.get(hash);

    if (fpData) {
        newDb.presets[name] = {
            hash: hash,
            authors: fpData.authors || [],
            names: [name],
            fingerprint: fpData.fingerprint
        };
        newDb.nameIndex[name] = name;
        matched++;
    } else {
        // Generate basic fingerprint for unmatched presets
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
        missing++;
    }
}

console.log('\nMatched:', matched);
console.log('Generated:', missing);
console.log('Total:', Object.keys(newDb.presets).length);

// Rebuild indices
newDb.indices = {
    high: [], bass: [], calm: [], particle: [], fractal: [], geometric: [], organic: [],
    energyLabel: { calm: [], flowing: [], dynamic: [], energetic: [], intense: [], explosive: [] },
    visualStyle: { fluid_organic: [], particle: [], geometric: [], fractal: [], abstract: [], kaleidoscope: [], tunnel: [], waveform: [], organic: [] },
    musicalResponsiveness: { spectral_analysis: [], beat_detection: [], volume_reactive: [], time_only: [], basic_audio: [] },
    reliabilityTier: { rock_solid: [], stable: [], finicky: [], experimental: [] },
    dominantHue: { warm: [], cool: [], neutral: [] }
};

for (const [name, data] of Object.entries(newDb.presets)) {
    const fp = data.fingerprint;
    if (!fp) continue;

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
}

// Sort indices
for (const key of ['high', 'bass', 'calm']) {
    newDb.indices[key].sort();
}
for (const category of ['energyLabel', 'visualStyle', 'musicalResponsiveness', 'reliabilityTier', 'dominantHue']) {
    for (const bucket of Object.keys(newDb.indices[category])) {
        newDb.indices[category][bucket].sort();
    }
}

// Write
const outPath = path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.fingerprints.json');
fs.writeFileSync(outPath, JSON.stringify(newDb, null, 2));
fs.writeFileSync(outPath.replace('.json', '.min.json'), JSON.stringify(newDb));

// Verify
let hasHash = 0;
for (const data of Object.values(newDb.presets)) {
    if (data.hash) hasHash++;
}
console.log('\nVerification:');
console.log('  All have hash:', hasHash === Object.keys(newDb.presets).length ? '✅' : '❌', `(${hasHash}/${Object.keys(newDb.presets).length})`);
console.log('  Total presets:', Object.keys(newDb.presets).length);

console.log('\n✅ Alaska pack fixed!');
