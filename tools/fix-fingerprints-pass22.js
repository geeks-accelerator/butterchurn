#!/usr/bin/env node
/**
 * Pass 22 Fix Script - Fingerprint Alignment
 *
 * Fixes identified in ultrathink review:
 * 1. Restore visualStyleSource from import artifacts (ansorre has CLIP provenance)
 * 2. Regenerate reliabilityTier with fixed derivation (was 75% finicky)
 * 3. Bump version to v2.2.2
 * 4. Ensure butterchurnPresetsAll and alaskaButter are aligned
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveReliabilityTier } from '../src/taxonomy/reliability.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('[Pass 22] Starting fingerprint alignment fix\n');

// Load main fingerprints and presets
const fpPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.fingerprints.json');
const presetsPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.json');

const fp = JSON.parse(fs.readFileSync(fpPath, 'utf8'));
const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));

// Build name-to-hash map
const nameToHash = {};
for (const [hash, data] of Object.entries(fp.presets)) {
    for (const name of data.names || []) {
        nameToHash[name] = hash;
    }
}

// ============================================================================
// Step 1: Restore visualStyleSource from import artifacts
// ============================================================================
console.log('[Step 1] Restoring visualStyleSource from import artifacts...');

// Load import artifacts
const importPaths = [
    ['ansorre', path.join(PROJECT_ROOT, 'presets/imports/ansorre.fingerprints.json')],
    ['cotc', path.join(PROJECT_ROOT, 'presets/imports/cream-of-the-crop.fingerprints.json')],
    ['projectm', path.join(PROJECT_ROOT, 'presets/imports/projectm-classic.fingerprints.json')]
];

// Build hash -> visualStyleSource mapping from imports
const hashToVSS = new Map();
for (const [source, importPath] of importPaths) {
    if (!fs.existsSync(importPath)) {
        console.log(`  [skip] ${source}: file not found`);
        continue;
    }

    const importData = JSON.parse(fs.readFileSync(importPath, 'utf8'));
    let found = 0;

    for (const [hash, data] of Object.entries(importData.presets)) {
        const vss = data.fingerprint?.visualStyleSource;
        if (vss) {
            hashToVSS.set(hash, vss);
            found++;
        }
    }

    console.log(`  [ok] ${source}: ${found} visualStyleSource values`);
}

// Apply visualStyleSource to main fingerprints
let vssRestored = 0;
let vssEquation = 0;

for (const [hash, data] of Object.entries(fp.presets)) {
    const vss = hashToVSS.get(hash);
    if (vss) {
        data.fingerprint.visualStyleSource = vss;
        vssRestored++;
    } else {
        // Default to equation-derived for presets without CLIP classification
        data.fingerprint.visualStyleSource = 'equation';
        vssEquation++;
    }
}

console.log(`  Restored from CLIP: ${vssRestored}`);
console.log(`  Defaulted to equation: ${vssEquation}`);

// ============================================================================
// Step 2: Regenerate reliabilityTier with fixed derivation
// ============================================================================
console.log('\n[Step 2] Regenerating reliabilityTier with fixed derivation...');

const rtBefore = { rock_solid: 0, stable: 0, finicky: 0, experimental: 0 };
const rtAfter = { rock_solid: 0, stable: 0, finicky: 0, experimental: 0 };

for (const [name, preset] of Object.entries(presets)) {
    const hash = nameToHash[name];
    if (!hash) continue;

    const data = fp.presets[hash];
    if (!data?.fingerprint) continue;

    // Record before
    const oldTier = data.fingerprint.reliabilityTier;
    if (rtBefore[oldTier] !== undefined) rtBefore[oldTier]++;

    // Compute new tier
    const newTier = deriveReliabilityTier(data.fingerprint, preset);
    data.fingerprint.reliabilityTier = newTier;

    // Record after
    if (rtAfter[newTier] !== undefined) rtAfter[newTier]++;
}

console.log('  Before:', JSON.stringify(rtBefore));
console.log('  After:', JSON.stringify(rtAfter));

// ============================================================================
// Step 3: Bump version to v2.2.2
// ============================================================================
console.log('\n[Step 3] Bumping version to v2.2.2...');

fp.version = '2.2.2';
fp.generated = new Date().toISOString();
console.log(`  Version: ${fp.version}`);

// ============================================================================
// Step 4: Save updated fingerprints
// ============================================================================
console.log('\n[Step 4] Saving updated fingerprints...');

fs.writeFileSync(fpPath, JSON.stringify(fp, null, 2));
console.log(`  [ok] ${fpPath}`);

// Minified version
const minPath = fpPath.replace('.json', '.min.json');
fs.writeFileSync(minPath, JSON.stringify(fp));
console.log(`  [ok] ${minPath}`);

// ============================================================================
// Step 5: Sync alaskaButter with butterchurnPresetsAll
// ============================================================================
console.log('\n[Step 5] Syncing alaskaButter with butterchurnPresetsAll...');

const alaskaFpPath = path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.fingerprints.json');
const alaskaPresetsPath = path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.json');

const alaskaFp = JSON.parse(fs.readFileSync(alaskaFpPath, 'utf8'));
const alaskaPresets = JSON.parse(fs.readFileSync(alaskaPresetsPath, 'utf8'));

// Build alaska name-to-hash map
const alaskaNameToHash = {};
for (const [hash, data] of Object.entries(alaskaFp.presets)) {
    for (const name of data.names || []) {
        alaskaNameToHash[name] = hash;
    }
}

// Regenerate reliabilityTier for alaska
let alaskaUpdated = 0;
for (const [name, preset] of Object.entries(alaskaPresets)) {
    const hash = alaskaNameToHash[name];
    if (!hash) continue;

    const data = alaskaFp.presets[hash];
    if (!data?.fingerprint) continue;

    const newTier = deriveReliabilityTier(data.fingerprint, preset);
    if (data.fingerprint.reliabilityTier !== newTier) {
        data.fingerprint.reliabilityTier = newTier;
        alaskaUpdated++;
    }
}

alaskaFp.version = '2.2.2';
alaskaFp.generated = new Date().toISOString();

fs.writeFileSync(alaskaFpPath, JSON.stringify(alaskaFp, null, 2));
console.log(`  [ok] ${alaskaFpPath} (${alaskaUpdated} tiers updated)`);

// Minified version
const alaskaMinPath = alaskaFpPath.replace('.json', '.min.json');
fs.writeFileSync(alaskaMinPath, JSON.stringify(alaskaFp));
console.log(`  [ok] ${alaskaMinPath}`);

// ============================================================================
// Summary
// ============================================================================
console.log('\n[Pass 22] Summary');
console.log('==================');
console.log(`butterchurnPresetsAll: ${Object.keys(fp.presets).length} presets, v${fp.version}`);
console.log(`  visualStyleSource: ${vssRestored} CLIP, ${vssEquation} equation`);
console.log(`  reliabilityTier: rock_solid=${rtAfter.rock_solid}, stable=${rtAfter.stable}, finicky=${rtAfter.finicky}, experimental=${rtAfter.experimental}`);
console.log(`alaskaButter: ${Object.keys(alaskaFp.presets).length} presets, v${alaskaFp.version}`);
console.log(`  reliabilityTier updated: ${alaskaUpdated}`);
console.log('\n✅ Pass 22 complete!');
