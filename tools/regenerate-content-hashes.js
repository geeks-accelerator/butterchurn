#!/usr/bin/env node
/**
 * Regenerate Content Hashes
 *
 * Updates the inner `hash` field in fingerprint records to match
 * the canonical generateContentHash algorithm.
 *
 * This is a migration tool - run after any change to contentHash.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateContentHash } from '../src/utils/contentHash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

async function regenerateHashes(fingerprintsPath, presetsPath) {
    console.log(`[regen] Loading fingerprints: ${fingerprintsPath}`);
    const fingerprints = JSON.parse(fs.readFileSync(fingerprintsPath, 'utf8'));

    console.log(`[regen] Loading presets: ${presetsPath}`);
    const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));

    const fpEntries = fingerprints.presets || {};
    let updated = 0;
    let skipped = 0;
    let mismatchCount = 0;
    const mismatches = [];

    console.log(`[regen] Processing ${Object.keys(fpEntries).length} fingerprint records...`);

    for (const [dbKey, data] of Object.entries(fpEntries)) {
        const names = data.names || [];
        const presetName = names[0];

        if (!presetName || !presets[presetName]) {
            skipped++;
            continue;
        }

        const preset = presets[presetName];
        const newHash = generateContentHash(preset);
        const oldHash = data.fingerprint?.hash;

        // Check if DB key matches recomputed hash
        if (dbKey !== newHash) {
            mismatchCount++;
            if (mismatches.length < 5) {
                mismatches.push({ dbKey, newHash, name: presetName.substring(0, 50) });
            }
        }

        // Update inner hash field
        if (!data.fingerprint) data.fingerprint = {};
        data.fingerprint.hash = newHash;
        updated++;
    }

    console.log(`\n[regen] Results`);
    console.log(`=================`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (no preset): ${skipped}`);
    console.log(`DB key mismatches: ${mismatchCount}`);

    if (mismatches.length > 0) {
        console.log(`\nSample mismatches (dbKey vs recomputed):`);
        mismatches.forEach(m => console.log(`  ${m.dbKey} -> ${m.newHash}: ${m.name}`));
    }

    // Write back
    console.log(`\n[regen] Writing updated fingerprints...`);
    fs.writeFileSync(fingerprintsPath, JSON.stringify(fingerprints, null, 2));

    const minPath = fingerprintsPath.replace('.json', '.min.json');
    fs.writeFileSync(minPath, JSON.stringify(fingerprints));

    console.log(`[regen] Updated: ${fingerprintsPath}`);
    console.log(`[regen] Updated: ${minPath}`);

    return { updated, skipped, mismatchCount };
}

async function main() {
    console.log('[regen] Content Hash Regenerator');
    console.log('[regen] ==========================\n');

    // Process canonical pack
    console.log('=== Canonical Pack ===');
    const canonicalResult = await regenerateHashes(
        path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.fingerprints.json'),
        path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.json')
    );

    console.log('\n=== Alaska Pack ===');
    const alaskaResult = await regenerateHashes(
        path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.fingerprints.json'),
        path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.json')
    );

    console.log('\n✅ Done!');
    console.log(`Canonical: ${canonicalResult.updated} updated, ${canonicalResult.mismatchCount} key mismatches`);
    console.log(`Alaska: ${alaskaResult.updated} updated, ${alaskaResult.mismatchCount} key mismatches`);
}

main().catch(err => {
    console.error('[regen] Error:', err);
    process.exit(1);
});
