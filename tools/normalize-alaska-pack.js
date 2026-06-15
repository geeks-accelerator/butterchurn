#!/usr/bin/env node
/**
 * Normalize Alaska Pack Schema
 *
 * Ensures alaska pack matches canonical butterchurnPresetsAll schema:
 * - Adds missing inner hash fields
 * - Fixes any invalid vocabulary
 * - Updates version to match canonical
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateContentHash } from '../src/utils/contentHash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const VALID_RELIABILITY = ['rock_solid', 'stable', 'finicky', 'experimental'];

console.log('[normalize-alaska] Normalizing alaska pack...\n');

// Load alaska fingerprints and presets
const alaskaFpPath = path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.fingerprints.json');
const alaskaPresetsPath = path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.json');

const db = JSON.parse(fs.readFileSync(alaskaFpPath, 'utf8'));
const presets = JSON.parse(fs.readFileSync(alaskaPresetsPath, 'utf8'));

console.log('Total fingerprints:', Object.keys(db.presets).length);

let hashesAdded = 0;
let reliabilityFixed = 0;

for (const [name, data] of Object.entries(db.presets)) {
    const fp = data.fingerprint;

    // Add missing inner hash
    if (!data.hash && presets[name]) {
        data.hash = generateContentHash(presets[name]);
        hashesAdded++;
    }

    // Fix reliabilityTier if needed
    if (fp && !VALID_RELIABILITY.includes(fp.reliabilityTier)) {
        const complexity = fp.complexity ?? 0.5;
        const warmupTime = fp.warmupTime ?? 0;
        if (complexity < 0.3 && warmupTime === 0) fp.reliabilityTier = 'rock_solid';
        else if (complexity < 0.5) fp.reliabilityTier = 'stable';
        else if (complexity < 0.7) fp.reliabilityTier = 'finicky';
        else fp.reliabilityTier = 'experimental';
        reliabilityFixed++;
    }
}

console.log('Inner hashes added:', hashesAdded);
console.log('reliabilityTier fixed:', reliabilityFixed);

// Update version to match canonical
db.version = '2.2.2';
db.generated = new Date().toISOString();

// Write back
fs.writeFileSync(alaskaFpPath, JSON.stringify(db, null, 2));
fs.writeFileSync(alaskaFpPath.replace('.json', '.min.json'), JSON.stringify(db));

// Verify
let missingHash = 0;
for (const data of Object.values(db.presets)) {
    if (!data.hash) missingHash++;
}
console.log('\nVerification:');
console.log('  Missing hashes:', missingHash, missingHash === 0 ? '✅' : '❌');
console.log('  Version:', db.version);

console.log('\n✅ Alaska pack normalized!');
