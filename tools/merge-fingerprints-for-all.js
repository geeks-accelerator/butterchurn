#!/usr/bin/env node
/**
 * Merge Fingerprints for butterchurnPresetsAll
 *
 * Takes the combined preset bundle and merges fingerprints from:
 * 1. Original butterchurnPresetsAll fingerprints (495)
 * 2. Ansorre fingerprints (12,108)
 *
 * Output: butterchurnPresetsAll.fingerprints.json keyed by preset name
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('[merge-fp] Merging fingerprints for butterchurnPresetsAll\n');

// Helper: sort object keys for consistent hashing (must match generate-fingerprints.js)
function sortObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    return Object.keys(obj)
        .sort()
        .reduce((sorted, key) => {
            sorted[key] = obj[key];
            return sorted;
        }, {});
}

// Helper: compute content hash (must match generate-fingerprints.js exactly)
function computeHash(preset) {
    const equations = [
        preset.init_eqs_str || preset.init_eqs_eel || '',
        preset.frame_eqs_str || preset.frame_eqs_eel || '',
        preset.pixel_eqs_str || preset.pixel_eqs_eel || '',
        preset.warp_eqs_str || preset.warp?.eel || '',
        preset.comp_eqs_str || preset.comp?.eel || '',
        JSON.stringify(sortObject(preset.baseVals || {})),
        JSON.stringify((preset.shapes || []).map(s => sortObject(s))),
        JSON.stringify((preset.waves || []).map(w => sortObject(w)))
    ].join('|');
    return createHash('sha256').update(equations).digest('hex').substring(0, 8);
}

// Load preset bundle
const presetsPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.json');
const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
console.log(`[merge-fp] Loaded ${Object.keys(presets).length} presets from bundle`);

// Load fingerprint sources - individual packs + ansorre
const ORIGINAL_PACKS = [
    'butterchurnPresets',
    'butterchurnPresetsExtra',
    'butterchurnPresetsExtra2',
    'butterchurnPresetsMD1',
    'butterchurnPresetsMinimal',
    'butterchurnPresetsNonMinimal'
];

const ansorreFpPath = path.join(PROJECT_ROOT, 'presets/imports/ansorre.fingerprints.json');
const ansorreFp = JSON.parse(fs.readFileSync(ansorreFpPath, 'utf8'));
console.log(`[merge-fp] Ansorre fingerprints: ${Object.keys(ansorreFp.presets).length}`);

// COTC (Cream of the Crop) fingerprints
const cotcFpPath = path.join(PROJECT_ROOT, 'presets/imports/cream-of-the-crop.fingerprints.json');
const cotcFp = fs.existsSync(cotcFpPath) ? JSON.parse(fs.readFileSync(cotcFpPath, 'utf8')) : { presets: {} };
console.log(`[merge-fp] COTC fingerprints: ${Object.keys(cotcFp.presets).length}`);

let origTotal = 0;
const origFps = [];
for (const pack of ORIGINAL_PACKS) {
    const fpPath = path.join(PROJECT_ROOT, `presets/full-collection/${pack}.fingerprints.json`);
    if (fs.existsSync(fpPath)) {
        const fp = JSON.parse(fs.readFileSync(fpPath, 'utf8'));
        origFps.push(fp);
        const count = Object.keys(fp.presets).length;
        origTotal += count;
        console.log(`[merge-fp] ${pack}: ${count}`);
    }
}
console.log(`[merge-fp] Total original fingerprints: ${origTotal}`);

// Build hash -> fingerprint lookup from all sources
const hashToFp = new Map();

// Load original pack fingerprints first
for (const fp of origFps) {
    for (const [hash, data] of Object.entries(fp.presets)) {
        hashToFp.set(hash, data);
    }
}

// Then load ansorre fingerprints (won't overwrite originals)
for (const [hash, data] of Object.entries(ansorreFp.presets)) {
    if (!hashToFp.has(hash)) {
        hashToFp.set(hash, data);
    }
}

// Then load COTC fingerprints (won't overwrite previous)
for (const [hash, data] of Object.entries(cotcFp.presets)) {
    if (!hashToFp.has(hash)) {
        hashToFp.set(hash, data);
    }
}

console.log(`[merge-fp] Total unique fingerprints available: ${hashToFp.size}\n`);

// Build merged fingerprints database keyed by preset name
const mergedDb = {
    version: '2.2.0',
    generated: new Date().toISOString(),
    fingerprintAlgorithm: '2.2',
    presets: {},
    nameIndex: {},
    authorIndex: {},
    indices: {
        // Legacy 7-key buckets
        high: [],
        bass: [],
        calm: [],
        particle: [],
        fractal: [],
        geometric: [],
        organic: [],
        // v2.2 categorical buckets
        energyLabel: { low: [], medium: [], high: [] },
        visualStyle: { fluid_organic: [], particle: [], geometric: [], fractal: [], abstract: [], kaleidoscope: [], tunnel: [], waveform: [] },
        musicalResponsiveness: { low: [], medium: [], high: [] },
        reliabilityTier: { stable: [], moderate: [], erratic: [] },
        dominantHue: { warm: [], cool: [], neutral: [] }
    }
};

let matched = 0;
let missing = 0;
const missingPresets = [];

for (const [name, preset] of Object.entries(presets)) {
    const hash = computeHash(preset);
    const fpData = hashToFp.get(hash);

    if (fpData) {
        // Copy fingerprint data with the name as key
        mergedDb.presets[name] = {
            hash: hash,
            authors: fpData.authors || [],
            names: [name],
            firstSeen: fpData.firstSeen || '',
            fingerprint: fpData.fingerprint || {}
        };
        mergedDb.nameIndex[name] = name;

        // Update author index
        for (const author of fpData.authors || []) {
            if (!mergedDb.authorIndex[author]) {
                mergedDb.authorIndex[author] = [];
            }
            if (!mergedDb.authorIndex[author].includes(name)) {
                mergedDb.authorIndex[author].push(name);
            }
        }

        // Build indices
        const fp = fpData.fingerprint || {};

        // Legacy indices
        if (fp.energy > 0.7) mergedDb.indices.high.push(name);
        if (fp.energy < 0.3) mergedDb.indices.calm.push(name);
        if ((fp.bassEnergy ?? fp.bass ?? 0) > 0.6) mergedDb.indices.bass.push(name);

        const styles = fp.styles || [];
        if (styles.includes('particle')) mergedDb.indices.particle.push(name);
        if (styles.includes('fractal')) mergedDb.indices.fractal.push(name);
        if (styles.includes('geometric')) mergedDb.indices.geometric.push(name);
        if (styles.includes('organic')) mergedDb.indices.organic.push(name);

        // v2.2 categorical indices
        if (fp.energyLabel && mergedDb.indices.energyLabel[fp.energyLabel]) {
            mergedDb.indices.energyLabel[fp.energyLabel].push(name);
        }
        if (fp.visualStyle && mergedDb.indices.visualStyle[fp.visualStyle]) {
            mergedDb.indices.visualStyle[fp.visualStyle].push(name);
        }
        if (fp.musicalResponsiveness && mergedDb.indices.musicalResponsiveness[fp.musicalResponsiveness]) {
            mergedDb.indices.musicalResponsiveness[fp.musicalResponsiveness].push(name);
        }
        if (fp.reliabilityTier && mergedDb.indices.reliabilityTier[fp.reliabilityTier]) {
            mergedDb.indices.reliabilityTier[fp.reliabilityTier].push(name);
        }
        if (fp.dominantHue && mergedDb.indices.dominantHue[fp.dominantHue]) {
            mergedDb.indices.dominantHue[fp.dominantHue].push(name);
        }

        matched++;
    } else {
        missing++;
        missingPresets.push({ name, hash });
    }
}

// Sort all index arrays alphabetically
for (const key of ['high', 'bass', 'calm', 'particle', 'fractal', 'geometric', 'organic']) {
    mergedDb.indices[key].sort();
}
for (const category of ['energyLabel', 'visualStyle', 'musicalResponsiveness', 'reliabilityTier', 'dominantHue']) {
    for (const bucket of Object.keys(mergedDb.indices[category])) {
        mergedDb.indices[category][bucket].sort();
    }
}

console.log(`[merge-fp] Matched: ${matched}`);
console.log(`[merge-fp] Missing: ${missing}`);

if (missingPresets.length > 0) {
    console.log('\nMissing fingerprints (first 10):');
    missingPresets.slice(0, 10).forEach(({ name, hash }) => {
        console.log(`  ${hash}: "${name.substring(0, 50)}..."`);
    });
    if (missingPresets.length > 10) {
        console.log(`  ... and ${missingPresets.length - 10} more`);
    }
}

// Write merged fingerprints
const outputPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.fingerprints.json');
fs.writeFileSync(outputPath, JSON.stringify(mergedDb, null, 2));

const stats = fs.statSync(outputPath);
console.log(`\n[merge-fp] Output: ${outputPath}`);
console.log(`[merge-fp] Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
console.log(`[merge-fp] Presets: ${Object.keys(mergedDb.presets).length}`);

console.log('\n✅ Fingerprint merge complete!');
