#!/usr/bin/env node
/**
 * Merge Preset Collection
 *
 * Merges new presets into butterchurnPresetsAll, excluding invalid presets.
 *
 * Usage:
 *   node tools/merge-preset-collection.js \
 *     --input presets/imports/cream-of-the-crop.json \
 *     --exclude "preset name with error"
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Paths
const ALL_PRESETS_PATH = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.json');
const ALL_PRESETS_JS_PATH = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.js');

async function main() {
    const args = process.argv.slice(2);
    let inputPath = null;
    const excludeNames = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) {
            inputPath = path.resolve(args[i + 1]);
            i++;
        } else if (args[i] === '--exclude' && args[i + 1]) {
            excludeNames.push(args[i + 1]);
            i++;
        }
    }

    if (!inputPath) {
        console.error('Usage: node merge-preset-collection.js --input <file.json> [--exclude "name"]');
        process.exit(1);
    }

    console.log('[merge] Merge Preset Collection');
    console.log('================================\n');

    // Load existing presets
    console.log('[merge] Loading existing butterchurnPresetsAll...');
    const existingPresets = JSON.parse(fs.readFileSync(ALL_PRESETS_PATH, 'utf8'));
    const existingCount = Object.keys(existingPresets).length;
    console.log(`[merge] Existing presets: ${existingCount}`);

    // Load new presets
    console.log(`[merge] Loading new presets from: ${inputPath}`);
    const newPresets = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const newCount = Object.keys(newPresets).length;
    console.log(`[merge] New presets: ${newCount}`);

    // Merge, excluding specified names
    let added = 0;
    let excluded = 0;
    let duplicates = 0;

    for (const [name, preset] of Object.entries(newPresets)) {
        // Check exclusion list
        const shouldExclude = excludeNames.some(ex => name.includes(ex));
        if (shouldExclude) {
            excluded++;
            console.log(`[merge] Excluded: ${name.substring(0, 60)}...`);
            continue;
        }

        // Check for duplicates (by name)
        if (existingPresets[name]) {
            duplicates++;
            continue;
        }

        existingPresets[name] = preset;
        added++;
    }

    console.log(`\n[merge] Results:`);
    console.log(`  Added: ${added}`);
    console.log(`  Excluded: ${excluded}`);
    console.log(`  Duplicates (by name): ${duplicates}`);
    console.log(`  Final count: ${Object.keys(existingPresets).length}`);

    // Write updated JSON
    console.log('\n[merge] Writing updated butterchurnPresetsAll.json...');
    fs.writeFileSync(ALL_PRESETS_PATH, JSON.stringify(existingPresets, null, 2), 'utf8');

    // Write JS module format
    console.log('[merge] Writing updated butterchurnPresetsAll.js...');
    const jsContent = `// Auto-generated preset bundle
// Generated: ${new Date().toISOString()}
// Count: ${Object.keys(existingPresets).length} presets

const butterchurnPresetsAll = ${JSON.stringify(existingPresets)};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = butterchurnPresetsAll;
}
`;
    fs.writeFileSync(ALL_PRESETS_JS_PATH, jsContent, 'utf8');

    console.log('\n✅ Merge complete!');
}

main().catch(err => {
    console.error('Merge failed:', err);
    process.exit(1);
});
