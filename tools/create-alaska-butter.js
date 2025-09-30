#!/usr/bin/env node

/**
 * Create Alaska Butter - Combined preset package with all 553 unique presets
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createAlaskaButter() {
    console.log('🧈 Creating Alaska Butter - The Ultimate Preset Collection\n');

    const sourceDir = path.join(__dirname, '..', 'presets', 'full-collection');
    const targetDir = path.join(__dirname, '..', 'presets', 'alaska-butter');

    // Create target directory
    await fs.mkdir(targetDir, { recursive: true });

    // Preset packages to combine
    const packages = [
        'butterchurnPresets',
        'butterchurnPresetsExtra',
        'butterchurnPresetsExtra2',
        'butterchurnPresetsMD1',
        'butterchurnPresetsMinimal',
        'butterchurnPresetsNonMinimal'
    ];

    const allPresets = {};
    const seenHashes = new Set();
    let totalPresets = 0;
    let duplicatesSkipped = 0;

    // Load and combine all presets
    for (const packageName of packages) {
        const jsonPath = path.join(sourceDir, `${packageName}.json`);

        try {
            console.log(`Loading ${packageName}...`);
            const content = await fs.readFile(jsonPath, 'utf8');
            const presets = JSON.parse(content);

            let packageCount = 0;
            for (const [presetName, presetData] of Object.entries(presets)) {
                // Generate a simple hash for deduplication
                const presetStr = typeof presetData === 'string' ? presetData : JSON.stringify(presetData);
                const hash = createHash('sha256').update(presetStr).digest('hex').substring(0, 8);

                if (!seenHashes.has(hash)) {
                    seenHashes.add(hash);
                    // Store with original name
                    allPresets[presetName] = presetData;
                    packageCount++;
                    totalPresets++;
                } else {
                    duplicatesSkipped++;
                    console.log(`  Skipping duplicate: ${presetName}`);
                }
            }

            console.log(`  ✓ Added ${packageCount} unique presets from ${packageName}`);
        } catch (error) {
            console.error(`  ✗ Error loading ${packageName}:`, error.message);
        }
    }

    console.log(`\n📊 Statistics:`);
    console.log(`  Total unique presets: ${totalPresets}`);
    console.log(`  Duplicates skipped: ${duplicatesSkipped}`);

    // Save combined JSON file
    const jsonOutputPath = path.join(targetDir, 'alaskaButter.json');
    await fs.writeFile(jsonOutputPath, JSON.stringify(allPresets, null, 2));
    console.log(`\n✅ Saved JSON: ${jsonOutputPath}`);

    // Create JavaScript module (UMD format matching butterchurnPresets)
    // Export presets directly instead of wrapped in methods
    const jsContent = `(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = global || self, global.alaskaButter = factory());
}(this, function () {
    'use strict';

    return ${JSON.stringify(allPresets)};
}));`;

    const jsOutputPath = path.join(targetDir, 'alaskaButter.js');
    await fs.writeFile(jsOutputPath, jsContent);
    console.log(`✅ Saved JS module: ${jsOutputPath}`);

    // Create minified version
    const jsMinContent = jsContent.replace(/\s+/g, ' ').replace(/\s*([{}:,;()])\s*/g, '$1');
    const jsMinOutputPath = path.join(targetDir, 'alaskaButter.min.js');
    await fs.writeFile(jsMinOutputPath, jsMinContent);
    console.log(`✅ Saved minified JS: ${jsMinOutputPath}`);

    // Create a metadata file
    const metadata = {
        name: 'Alaska Butter',
        description: 'The ultimate Butterchurn preset collection - All 553 unique presets combined',
        version: '1.0.0',
        created: new Date().toISOString(),
        totalPresets: totalPresets,
        duplicatesRemoved: duplicatesSkipped,
        sourcePacks: packages,
        stats: {
            butterchurnPresets: Object.keys(allPresets).filter(k => k.includes('Geiss') || k.includes('Rovastar')).length,
            totalAuthors: new Set(Object.keys(allPresets).map(k => k.split(' - ')[0])).size
        }
    };

    const metaPath = path.join(targetDir, 'metadata.json');
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));
    console.log(`✅ Saved metadata: ${metaPath}\n`);

    console.log('🎉 Alaska Butter creation complete!');
    console.log('🧈 The smoothest, richest preset collection ever churned!');

    return totalPresets;
}

// Run if called directly
createAlaskaButter().catch(console.error);

export default createAlaskaButter;