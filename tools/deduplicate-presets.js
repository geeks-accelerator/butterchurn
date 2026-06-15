#!/usr/bin/env node

/**
 * Preset Deduplicator
 *
 * Removes duplicate presets by comparing SHA256 content hashes.
 * Uses the SAME hashing algorithm as generate-fingerprints.js via shared module.
 *
 * Usage: node deduplicate-presets.js --input ./new-presets.json --existing ./existing.fingerprints.json --output ./unique-presets.json
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { generateContentHash } from '../src/utils/contentHash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class PresetDeduplicator {
    constructor() {
        this.existingHashes = new Set();
        this.stats = {
            inputCount: 0,
            duplicates: 0,
            unique: 0,
            duplicateNames: []
        };
    }

    /**
     * Load existing hashes from fingerprints file
     */
    async loadExistingHashes(fingerprintsPath) {
        console.log(`Loading existing fingerprints from: ${fingerprintsPath}`);

        const content = await fs.readFile(fingerprintsPath, 'utf8');
        const data = JSON.parse(content);

        // Extract all hash IDs from the presets object
        for (const hash of Object.keys(data.presets || {})) {
            this.existingHashes.add(hash);
        }

        console.log(`  Loaded ${this.existingHashes.size} existing hashes`);
    }

    /**
     * Deduplicate presets
     */
    async deduplicate(inputPath, outputPath) {
        console.log(`\nDeduplicating presets from: ${inputPath}`);

        const content = await fs.readFile(inputPath, 'utf8');
        const presets = JSON.parse(content);

        const uniquePresets = {};
        const newHashes = new Set();

        for (const [name, preset] of Object.entries(presets)) {
            this.stats.inputCount++;

            const hash = generateContentHash(preset);

            // Check against existing hashes
            if (this.existingHashes.has(hash)) {
                this.stats.duplicates++;
                if (this.stats.duplicateNames.length < 20) {
                    this.stats.duplicateNames.push(`${name} (matches existing ${hash})`);
                }
                continue;
            }

            // Check against already-seen hashes in this batch
            if (newHashes.has(hash)) {
                this.stats.duplicates++;
                if (this.stats.duplicateNames.length < 20) {
                    this.stats.duplicateNames.push(`${name} (internal duplicate ${hash})`);
                }
                continue;
            }

            newHashes.add(hash);
            uniquePresets[name] = preset;
            this.stats.unique++;

            // Progress
            if (this.stats.inputCount % 2000 === 0) {
                console.log(`  Processed ${this.stats.inputCount}, found ${this.stats.unique} unique so far...`);
            }
        }

        // Write output
        console.log(`\nWriting ${this.stats.unique} unique presets to: ${outputPath}`);
        await fs.writeFile(outputPath, JSON.stringify(uniquePresets, null, 2), 'utf8');

        // Also write minified version
        const minPath = outputPath.replace('.json', '.min.json');
        await fs.writeFile(minPath, JSON.stringify(uniquePresets), 'utf8');
        console.log(`Also wrote minified version to ${minPath}`);
    }

    printStats() {
        console.log('\n=== Deduplication Statistics ===');
        console.log(`Input presets: ${this.stats.inputCount}`);
        console.log(`Duplicates found: ${this.stats.duplicates}`);
        console.log(`Unique presets: ${this.stats.unique}`);
        console.log(`Deduplication rate: ${((this.stats.duplicates / this.stats.inputCount) * 100).toFixed(1)}%`);

        if (this.stats.duplicateNames.length > 0) {
            console.log(`\nSample duplicates (first ${this.stats.duplicateNames.length}):`);
            this.stats.duplicateNames.forEach(name => console.log(`  - ${name}`));
        }
    }
}

async function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    let inputPath = null;
    let existingPath = null;
    let outputPath = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) {
            inputPath = args[i + 1];
            i++;
        } else if (args[i] === '--existing' && args[i + 1]) {
            existingPath = args[i + 1];
            i++;
        } else if (args[i] === '--output' && args[i + 1]) {
            outputPath = args[i + 1];
            i++;
        }
    }

    // Defaults
    if (!inputPath) {
        inputPath = path.join(__dirname, '../presets/imports/ansorre-combined.json');
    }
    if (!existingPath) {
        existingPath = path.join(__dirname, '../presets/alaska-butter/alaskaButter.fingerprints.json');
    }
    if (!outputPath) {
        outputPath = path.join(__dirname, '../presets/imports/ansorre-unique.json');
    }

    console.log('Preset Deduplicator');
    console.log('===================\n');

    const deduplicator = new PresetDeduplicator();
    await deduplicator.loadExistingHashes(existingPath);
    await deduplicator.deduplicate(inputPath, outputPath);
    deduplicator.printStats();

    console.log('\n✅ Deduplication complete!');
}

main().catch(err => {
    console.error('Deduplication failed:', err);
    process.exit(1);
});
