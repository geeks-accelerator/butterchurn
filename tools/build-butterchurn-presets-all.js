#!/usr/bin/env node
/**
 * Build butterchurnPresetsAll - The Expanded Preset Collection
 *
 * Merges:
 * 1. Original 495 presets from individual butterchurn packs
 * 2. 12,108 ansorre presets (mapped from numeric keys to proper names)
 *
 * Handles:
 * - Name collisions (appends hash suffix)
 * - Whitespace trimming
 * - Deduplication by content hash
 *
 * Output:
 * - presets/full-collection/butterchurnPresetsAll.json
 * - presets/full-collection/butterchurnPresetsAll.js
 * - presets/full-collection/butterchurnPresetsAll.min.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('[build] Building butterchurnPresetsAll - Expanded Collection\n');

// Load original packs
const ORIGINAL_PACKS = [
    'butterchurnPresets',
    'butterchurnPresetsExtra',
    'butterchurnPresetsExtra2',
    'butterchurnPresetsMD1',
    'butterchurnPresetsMinimal',
    'butterchurnPresetsNonMinimal'
];

const mergedPresets = {};
const seenHashes = new Map(); // hash -> name (for dedup)
const nameCollisions = [];
const stats = {
    originalLoaded: 0,
    ansorrerLoaded: 0,
    duplicatesSkipped: 0,
    collisionsResolved: 0,
    whitespaceFixed: 0
};

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

// Helper: add preset with collision handling
function addPreset(name, preset, source) {
    // Trim whitespace
    let cleanName = name.trim();
    if (cleanName !== name) {
        stats.whitespaceFixed++;
    }

    // Compute hash for deduplication
    const hash = computeHash(preset);

    // Check for duplicate content
    if (seenHashes.has(hash)) {
        stats.duplicatesSkipped++;
        return false;
    }

    // Check for name collision
    if (mergedPresets[cleanName]) {
        // Append hash suffix to resolve collision
        const originalName = cleanName;
        cleanName = `${cleanName} (${hash})`;
        nameCollisions.push({ original: originalName, resolved: cleanName, hash });
        stats.collisionsResolved++;
    }

    mergedPresets[cleanName] = preset;
    seenHashes.set(hash, cleanName);

    if (source === 'original') {
        stats.originalLoaded++;
    } else {
        stats.ansorrerLoaded++;
    }

    return true;
}

// Step 1: Load original presets from individual packs
console.log('[build] Step 1: Loading original presets from packs...');

for (const packName of ORIGINAL_PACKS) {
    const jsPath = path.join(PROJECT_ROOT, 'presets/full-collection', `${packName}.min.js`);

    if (!fs.existsSync(jsPath)) {
        console.log(`  [skip] ${packName} not found`);
        continue;
    }

    try {
        // Read the JS file and extract presets
        const jsContent = fs.readFileSync(jsPath, 'utf8');

        // The packs use UMD format - we need to extract the presets object
        // They typically have a pattern like: return{getPresets:function(){return PRESETS}}
        // or const presets = {...}

        // Create a sandbox to evaluate the module
        const sandbox = { exports: {}, module: { exports: {} } };
        const wrapper = `(function(exports, module) { ${jsContent} })`;

        try {
            const fn = eval(wrapper);
            fn(sandbox.exports, sandbox.module);

            let presets = null;
            if (sandbox.module.exports.getPresets) {
                presets = sandbox.module.exports.getPresets();
            } else if (sandbox.exports.getPresets) {
                presets = sandbox.exports.getPresets();
            }

            if (presets && typeof presets === 'object') {
                const count = Object.keys(presets).length;
                for (const [name, preset] of Object.entries(presets)) {
                    addPreset(name, preset, 'original');
                }
                console.log(`  [ok] ${packName}: ${count} presets`);
            } else {
                console.log(`  [warn] ${packName}: could not extract presets`);
            }
        } catch (evalError) {
            console.log(`  [warn] ${packName}: eval failed - ${evalError.message}`);
        }
    } catch (error) {
        console.log(`  [error] ${packName}: ${error.message}`);
    }
}

console.log(`  Total original: ${stats.originalLoaded}`);

// Step 2: Load ansorre presets with name mapping from fingerprints
console.log('\n[build] Step 2: Loading ansorre presets...');

const ansorrePath = path.join(PROJECT_ROOT, 'presets/imports/ansorre-unique.json');
const ansorreFpPath = path.join(PROJECT_ROOT, 'presets/imports/ansorre.fingerprints.json');

if (fs.existsSync(ansorrePath) && fs.existsSync(ansorreFpPath)) {
    const ansorre = JSON.parse(fs.readFileSync(ansorrePath, 'utf8'));
    const ansorreFp = JSON.parse(fs.readFileSync(ansorreFpPath, 'utf8'));

    // Build hash -> name mapping from fingerprints
    const hashToName = {};
    for (const [hash, data] of Object.entries(ansorreFp.presets)) {
        if (data.names && data.names[0]) {
            hashToName[hash] = data.names[0];
        }
    }

    // Build index -> hash mapping by computing hashes for ansorre presets
    const indexToHash = {};
    for (const [index, preset] of Object.entries(ansorre)) {
        const hash = computeHash(preset);
        indexToHash[index] = hash;
    }

    // Now add ansorre presets with proper names
    let mapped = 0;
    let unmapped = 0;

    for (const [index, preset] of Object.entries(ansorre)) {
        const hash = indexToHash[index];
        const name = hashToName[hash];

        if (name) {
            addPreset(name, preset, 'ansorre');
            mapped++;
        } else {
            // Fallback: use hash as name
            addPreset(`Preset_${hash}`, preset, 'ansorre');
            unmapped++;
        }
    }

    console.log(`  Mapped with names: ${mapped}`);
    console.log(`  Unmapped (using hash): ${unmapped}`);
    console.log(`  Total ansorre: ${stats.ansorrerLoaded}`);
} else {
    console.log('  [skip] ansorre files not found');
}

// Step 3: Generate output files
console.log('\n[build] Step 3: Generating output files...');

const outputDir = path.join(PROJECT_ROOT, 'presets/full-collection');
const totalPresets = Object.keys(mergedPresets).length;

// JSON file
const jsonPath = path.join(outputDir, 'butterchurnPresetsAll.json');
fs.writeFileSync(jsonPath, JSON.stringify(mergedPresets, null, 2));
console.log(`  [ok] ${jsonPath} (${totalPresets} presets)`);

// JS file (UMD format)
const jsContent = `(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = global || self, global.butterchurnPresetsAll = factory());
}(this, function () {
    'use strict';

    const presets = ${JSON.stringify(mergedPresets)};

    return {
        getPresets() {
            return presets;
        },
        getPresetList() {
            return Object.keys(presets);
        }
    };
}));`;

const jsPath = path.join(outputDir, 'butterchurnPresetsAll.js');
fs.writeFileSync(jsPath, jsContent);
console.log(`  [ok] ${jsPath}`);

// Minified JS (just remove whitespace from the JSON part)
const minContent = `(function(g,f){typeof exports==='object'&&typeof module!=='undefined'?module.exports=f():typeof define==='function'&&define.amd?define(f):(g=g||self,g.butterchurnPresetsAll=f())}(this,function(){'use strict';const p=${JSON.stringify(mergedPresets)};return{getPresets(){return p},getPresetList(){return Object.keys(p)}}}));`;

const minPath = path.join(outputDir, 'butterchurnPresetsAll.min.js');
fs.writeFileSync(minPath, minContent);
console.log(`  [ok] ${minPath}`);

// Step 4: Summary
console.log('\n[build] Summary');
console.log('===============');
console.log(`Total presets: ${totalPresets}`);
console.log(`  From original packs: ${stats.originalLoaded}`);
console.log(`  From ansorre: ${stats.ansorrerLoaded}`);
console.log(`Duplicates skipped: ${stats.duplicatesSkipped}`);
console.log(`Collisions resolved: ${stats.collisionsResolved}`);
console.log(`Whitespace fixed: ${stats.whitespaceFixed}`);

if (nameCollisions.length > 0) {
    console.log('\nName collisions (first 10):');
    nameCollisions.slice(0, 10).forEach(({ original, resolved }) => {
        console.log(`  "${original}" -> "${resolved}"`);
    });
    if (nameCollisions.length > 10) {
        console.log(`  ... and ${nameCollisions.length - 10} more`);
    }
}

const jsonSize = fs.statSync(jsonPath).size;
const jsSize = fs.statSync(jsPath).size;
const minSize = fs.statSync(minPath).size;

console.log('\nFile sizes:');
console.log(`  JSON: ${(jsonSize / 1024 / 1024).toFixed(1)} MB`);
console.log(`  JS: ${(jsSize / 1024 / 1024).toFixed(1)} MB`);
console.log(`  min.js: ${(minSize / 1024 / 1024).toFixed(1)} MB`);

console.log('\n✅ Build complete!');
