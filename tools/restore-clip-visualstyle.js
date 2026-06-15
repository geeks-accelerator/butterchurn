#!/usr/bin/env node
/**
 * Restore CLIP visualStyle to Merged Fingerprints
 *
 * The Phase 3/4 fingerprint regeneration overwrote Phase 1's CLIP-classified
 * visualStyle data with equation-based fallbacks. This tool restores the CLIP
 * data from the preserved ansorre artifact.
 *
 * Strategy:
 * 1. Load the merged fingerprints (24K presets)
 * 2. Load the ansorre CLIP artifact (11,451 CLIP-classified)
 * 3. For each preset in merged, look up by content hash in ansorre
 * 4. If CLIP data exists, restore visualStyle + set visualStyleSource='clip'
 * 5. If no CLIP data, set visualStyleSource='equation'
 * 6. Rebuild indices with restored data
 *
 * Also fixes:
 * - Invalid 'psychedelic' visualStyle (not in schema) → map to 'abstract'
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('[restore-clip] Restoring CLIP visualStyle to merged fingerprints\n');

// Valid visualStyle categories from the schema
const VALID_VISUAL_STYLES = [
    'fluid_organic', 'particle', 'geometric', 'fractal',
    'abstract', 'kaleidoscope', 'tunnel', 'waveform', 'organic'
];

// Load merged fingerprints
const mergedPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.fingerprints.json');
const merged = JSON.parse(fs.readFileSync(mergedPath, 'utf8'));
console.log(`[restore-clip] Loaded merged fingerprints: ${Object.keys(merged.presets).length} presets`);

// Load ansorre CLIP artifact (hash-keyed)
const ansorrePath = path.join(PROJECT_ROOT, 'presets/imports/ansorre.fingerprints.json');
const ansorre = JSON.parse(fs.readFileSync(ansorrePath, 'utf8'));
console.log(`[restore-clip] Loaded ansorre artifact: ${Object.keys(ansorre.presets).length} presets`);

// Build hash → CLIP fingerprint lookup from ansorre
const hashToClip = new Map();
let clipCount = 0;
for (const [hash, data] of Object.entries(ansorre.presets)) {
    if (data.fingerprint?.visualStyleSource === 'clip') {
        hashToClip.set(hash, {
            visualStyle: data.fingerprint.visualStyle,
            visualStyleScores: data.fingerprint.visualStyleScores
        });
        clipCount++;
    }
}
console.log(`[restore-clip] CLIP-classified in ansorre: ${clipCount}`);

// Stats
let restored = 0;
let keptEquation = 0;
let psychedelicFixed = 0;
const beforeStyles = {};
const afterStyles = {};
const sourceStats = { clip: 0, equation: 0 };

// Process each preset in merged
for (const [name, data] of Object.entries(merged.presets)) {
    const hash = data.hash;
    const currentStyle = data.fingerprint?.visualStyle || 'undefined';
    beforeStyles[currentStyle] = (beforeStyles[currentStyle] || 0) + 1;

    // Check for CLIP data from ansorre
    const clipData = hashToClip.get(hash);

    if (clipData) {
        // Restore CLIP visualStyle
        data.fingerprint.visualStyle = clipData.visualStyle;
        data.fingerprint.visualStyleSource = 'clip';
        if (clipData.visualStyleScores) {
            data.fingerprint.visualStyleScores = clipData.visualStyleScores;
        }
        restored++;
        sourceStats.clip++;
    } else {
        // Keep equation-based, but validate visualStyle
        let style = data.fingerprint?.visualStyle;

        // Fix invalid 'psychedelic' → 'abstract' (closest semantic match)
        if (style === 'psychedelic') {
            data.fingerprint.visualStyle = 'abstract';
            psychedelicFixed++;
            style = 'abstract';
        }

        // Mark as equation-derived
        data.fingerprint.visualStyleSource = 'equation';
        keptEquation++;
        sourceStats.equation++;
    }

    const finalStyle = data.fingerprint?.visualStyle || 'undefined';
    afterStyles[finalStyle] = (afterStyles[finalStyle] || 0) + 1;
}

console.log(`\n[restore-clip] Results:`);
console.log(`  CLIP restored: ${restored}`);
console.log(`  Equation kept: ${keptEquation}`);
console.log(`  psychedelic→abstract: ${psychedelicFixed}`);

console.log(`\n[restore-clip] visualStyle BEFORE:`);
for (const [style, count] of Object.entries(beforeStyles).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${style}: ${count}`);
}

console.log(`\n[restore-clip] visualStyle AFTER:`);
for (const [style, count] of Object.entries(afterStyles).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${style}: ${count}`);
}

console.log(`\n[restore-clip] visualStyleSource distribution:`);
console.log(`  clip: ${sourceStats.clip}`);
console.log(`  equation: ${sourceStats.equation}`);

// Rebuild v2.2 categorical indices
console.log(`\n[restore-clip] Rebuilding indices...`);

merged.indices = merged.indices || {};
merged.indices.visualStyle = {
    fluid_organic: [],
    particle: [],
    geometric: [],
    fractal: [],
    abstract: [],
    kaleidoscope: [],
    tunnel: [],
    waveform: [],
    organic: []
};

for (const [name, data] of Object.entries(merged.presets)) {
    const style = data.fingerprint?.visualStyle;
    if (style && merged.indices.visualStyle[style]) {
        merged.indices.visualStyle[style].push(name);
    }
}

// Sort all buckets
for (const bucket of Object.keys(merged.indices.visualStyle)) {
    merged.indices.visualStyle[bucket].sort();
}

// Report index sizes
console.log(`[restore-clip] visualStyle index sizes:`);
for (const [style, presets] of Object.entries(merged.indices.visualStyle)) {
    console.log(`  ${style}: ${presets.length}`);
}

// Update metadata
merged.version = '2.2.1';
merged.generated = new Date().toISOString();
merged.clipRestored = new Date().toISOString();

// Write updated fingerprints
fs.writeFileSync(mergedPath, JSON.stringify(merged, null, 2));

// Also write minified version
const minPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.fingerprints.min.json');
fs.writeFileSync(minPath, JSON.stringify(merged));

const stats = fs.statSync(mergedPath);
console.log(`\n[restore-clip] Output: ${mergedPath}`);
console.log(`[restore-clip] Size: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);

console.log('\n✅ CLIP visualStyle restoration complete!');
