#!/usr/bin/env node

/**
 * Ansorre Preset Importer
 *
 * Imports presets from the ansorre "tens-of-thousands-milkdrop-presets-for-butterchurn"
 * collection into Butterchurn format.
 *
 * The ansorre presets use _str format (pre-compiled JavaScript) which is compatible
 * with Butterchurn's loader (it handles both _eel and _str formats).
 *
 * Usage: node import-ansorre-presets.js --input ./ansorre-repo/milkdrop-presets-for-butterchurn.zip --output ./ansorre-combined.json
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class AnsorreImporter {
    constructor() {
        this.stats = {
            total: 0,
            valid: 0,
            skipped: 0,
            errors: []
        };
    }

    /**
     * Extract preset name from filename
     * Removes .json extension and 'converted/' prefix
     */
    extractPresetName(filename) {
        let name = filename;
        if (name.startsWith('converted/')) {
            name = name.substring(10);
        }
        if (name.endsWith('.json')) {
            name = name.slice(0, -5);
        }
        return name;
    }

    /**
     * Validate and normalize a preset to Butterchurn format
     */
    normalizePreset(preset, name) {
        // Required fields
        if (!preset.baseVals || !preset.shapes || !preset.waves) {
            return null;
        }

        // Ensure arrays are properly sized (Butterchurn expects 4 shapes/waves)
        while (preset.shapes.length < 4) {
            preset.shapes.push({
                baseVals: { enabled: 0 },
                init_eqs_str: '',
                frame_eqs_str: ''
            });
        }
        while (preset.waves.length < 4) {
            preset.waves.push({
                baseVals: { enabled: 0 },
                init_eqs_str: '',
                frame_eqs_str: '',
                point_eqs_str: ''
            });
        }

        // Ensure baseVals has decay (default 0.98 if missing)
        if (preset.baseVals.decay === undefined) {
            preset.baseVals.decay = 0.98;
        }

        // Normalize shape/wave format
        for (let i = 0; i < preset.shapes.length; i++) {
            const shape = preset.shapes[i];
            if (!shape.baseVals) shape.baseVals = { enabled: 0 };
            if (!shape.init_eqs_str) shape.init_eqs_str = '';
            if (!shape.frame_eqs_str) shape.frame_eqs_str = '';
        }

        for (let i = 0; i < preset.waves.length; i++) {
            const wave = preset.waves[i];
            if (!wave.baseVals) wave.baseVals = { enabled: 0 };
            if (!wave.init_eqs_str) wave.init_eqs_str = '';
            if (!wave.frame_eqs_str) wave.frame_eqs_str = '';
            if (!wave.point_eqs_str) wave.point_eqs_str = '';
        }

        // Ensure equation fields exist
        if (!preset.init_eqs_str) preset.init_eqs_str = '';
        if (!preset.frame_eqs_str) preset.frame_eqs_str = '';
        if (!preset.pixel_eqs_str) preset.pixel_eqs_str = '';
        if (!preset.warp) preset.warp = '';
        if (!preset.comp) preset.comp = '';

        return preset;
    }

    /**
     * Import presets from ansorre zip file
     */
    async importFromZip(zipPath) {
        console.log(`Reading zip file: ${zipPath}`);

        const zip = new AdmZip(zipPath);
        const entries = zip.getEntries();

        const presets = {};

        for (const entry of entries) {
            const filename = entry.entryName;

            // Skip non-JSON files and the index file
            if (!filename.endsWith('.json') || !filename.startsWith('converted/')) {
                continue;
            }

            this.stats.total++;

            try {
                const content = entry.getData().toString('utf8');
                const preset = JSON.parse(content);
                const name = this.extractPresetName(filename);

                const normalized = this.normalizePreset(preset, name);
                if (normalized) {
                    presets[name] = normalized;
                    this.stats.valid++;
                } else {
                    this.stats.skipped++;
                    if (this.stats.errors.length < 10) {
                        this.stats.errors.push(`Invalid format: ${name}`);
                    }
                }
            } catch (err) {
                this.stats.skipped++;
                if (this.stats.errors.length < 10) {
                    this.stats.errors.push(`Parse error in ${filename}: ${err.message}`);
                }
            }

            // Progress update
            if (this.stats.total % 1000 === 0) {
                console.log(`  Processed ${this.stats.total} files...`);
            }
        }

        return presets;
    }

    /**
     * Write combined preset JSON
     */
    async writeOutput(presets, outputPath) {
        console.log(`Writing ${Object.keys(presets).length} presets to ${outputPath}`);

        const output = JSON.stringify(presets, null, 2);
        await fs.writeFile(outputPath, output, 'utf8');

        // Also write a minified version
        const minPath = outputPath.replace('.json', '.min.json');
        await fs.writeFile(minPath, JSON.stringify(presets), 'utf8');
        console.log(`Also wrote minified version to ${minPath}`);
    }

    printStats() {
        console.log('\n=== Import Statistics ===');
        console.log(`Total files processed: ${this.stats.total}`);
        console.log(`Valid presets: ${this.stats.valid}`);
        console.log(`Skipped: ${this.stats.skipped}`);
        if (this.stats.errors.length > 0) {
            console.log(`\nSample errors:`);
            this.stats.errors.forEach(e => console.log(`  - ${e}`));
        }
    }
}

async function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    let inputPath = null;
    let outputPath = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) {
            inputPath = args[i + 1];
            i++;
        } else if (args[i] === '--output' && args[i + 1]) {
            outputPath = args[i + 1];
            i++;
        }
    }

    // Defaults
    if (!inputPath) {
        inputPath = path.join(__dirname, '../presets/imports/ansorre-repo/milkdrop-presets-for-butterchurn.zip');
    }
    if (!outputPath) {
        outputPath = path.join(__dirname, '../presets/imports/ansorre-combined.json');
    }

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    console.log('Ansorre Preset Importer');
    console.log('=======================\n');

    const importer = new AnsorreImporter();
    const presets = await importer.importFromZip(inputPath);
    await importer.writeOutput(presets, outputPath);
    importer.printStats();

    console.log('\n✅ Import complete!');
}

main().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
});
