#!/usr/bin/env node
/**
 * Batch Milk Preset Converter
 *
 * Converts a directory of .milk files to Butterchurn JSON format.
 *
 * Features:
 * - Parallel conversion with configurable workers
 * - Error logging for failed conversions
 * - Progress reporting
 * - Resume capability via checkpoint file
 *
 * Usage:
 *   node tools/batch-convert-milk.js \
 *     --input ./presets-cream-of-the-crop/ \
 *     --output ./presets/imports/cream-of-the-crop.json \
 *     --workers 4
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Load the converter (UMD bundle needs require, not import)
const CONVERTER_PATH = path.join(__dirname, 'milkdrop-preset-converter/dist/milkdrop-preset-converter.min.js');
const converter = require(CONVERTER_PATH);

class BatchConverter {
    constructor(options = {}) {
        this.inputDir = options.input;
        this.outputPath = options.output;
        this.workerCount = options.workers || 4;
        this.checkpointPath = options.checkpoint || `${options.output}.checkpoint.json`;
        this.errorLogPath = options.errorLog || `${options.output}.errors.json`;

        this.stats = {
            total: 0,
            converted: 0,
            failed: 0,
            skipped: 0,
            startTime: Date.now()
        };

        this.results = {};
        this.errors = [];
        this.checkpoint = { completed: new Set() };
    }

    async loadCheckpoint() {
        try {
            const data = await fs.readFile(this.checkpointPath, 'utf8');
            const parsed = JSON.parse(data);
            this.checkpoint.completed = new Set(parsed.completed || []);
            this.results = parsed.results || {};
            console.log(`Resuming from checkpoint: ${this.checkpoint.completed.size} files already processed`);
        } catch (err) {
            // No checkpoint file, starting fresh
        }
    }

    async saveCheckpoint() {
        const data = {
            completed: Array.from(this.checkpoint.completed),
            results: this.results
        };
        await fs.writeFile(this.checkpointPath, JSON.stringify(data), 'utf8');
    }

    async findMilkFiles(dir) {
        const files = [];
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const subFiles = await this.findMilkFiles(fullPath);
                files.push(...subFiles);
            } else if (entry.name.toLowerCase().endsWith('.milk')) {
                files.push(fullPath);
            }
        }

        return files;
    }

    async convertSingleFile(filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        const result = await converter.convertPreset(content);

        // Remove presetParts (internal processing data)
        delete result.presetParts;

        return result;
    }

    async processFiles(files) {
        const filesToProcess = files.filter(f => !this.checkpoint.completed.has(f));
        console.log(`Processing ${filesToProcess.length} files (${this.checkpoint.completed.size} already done)`);

        const batchSize = Math.ceil(filesToProcess.length / this.workerCount);
        const batches = [];

        for (let i = 0; i < filesToProcess.length; i += batchSize) {
            batches.push(filesToProcess.slice(i, i + batchSize));
        }

        // Process in parallel batches
        let processed = 0;
        const total = filesToProcess.length;

        for (const batch of batches) {
            for (const filePath of batch) {
                try {
                    const result = await this.convertSingleFile(filePath);
                    const presetName = this.extractPresetName(filePath);

                    this.results[presetName] = result;
                    this.checkpoint.completed.add(filePath);
                    this.stats.converted++;
                } catch (err) {
                    this.stats.failed++;
                    this.errors.push({
                        file: filePath,
                        error: err.message,
                        stack: err.stack
                    });
                }

                processed++;
                if (processed % 100 === 0 || processed === total) {
                    const elapsed = (Date.now() - this.stats.startTime) / 1000;
                    const rate = processed / elapsed;
                    const eta = Math.round((total - processed) / rate);
                    console.log(`Progress: ${processed}/${total} (${this.stats.failed} failed) | ETA: ${eta}s`);

                    // Save checkpoint every 100 files
                    if (processed % 100 === 0) {
                        await this.saveCheckpoint();
                    }
                }
            }
        }
    }

    extractPresetName(filePath) {
        // Get relative path from input dir, remove .milk extension
        const relativePath = path.relative(this.inputDir, filePath);
        const name = relativePath.replace(/\.milk$/i, '');
        // Replace path separators with ' - ' for flat naming
        return name.replace(/[/\\]/g, ' - ').trim();
    }

    async run() {
        console.log('=== Batch Milk Preset Converter ===');
        console.log(`Input: ${this.inputDir}`);
        console.log(`Output: ${this.outputPath}`);
        console.log(`Workers: ${this.workerCount}`);
        console.log('');

        // Load any existing checkpoint
        await this.loadCheckpoint();

        // Find all .milk files
        console.log('Scanning for .milk files...');
        const files = await this.findMilkFiles(this.inputDir);
        this.stats.total = files.length;
        console.log(`Found ${files.length} .milk files`);

        // Process files
        await this.processFiles(files);

        // Save final results
        console.log('\nWriting output...');
        await fs.writeFile(this.outputPath, JSON.stringify(this.results, null, 2), 'utf8');

        // Write minified version
        const minPath = this.outputPath.replace('.json', '.min.json');
        await fs.writeFile(minPath, JSON.stringify(this.results), 'utf8');

        // Write error log if any
        if (this.errors.length > 0) {
            await fs.writeFile(this.errorLogPath, JSON.stringify(this.errors, null, 2), 'utf8');
            console.log(`Errors logged to: ${this.errorLogPath}`);
        }

        // Clean up checkpoint on success
        try {
            await fs.unlink(this.checkpointPath);
        } catch (e) {
            // Ignore if doesn't exist
        }

        // Print summary
        const elapsed = ((Date.now() - this.stats.startTime) / 1000).toFixed(1);
        console.log('\n=== Conversion Summary ===');
        console.log(`Total files: ${this.stats.total}`);
        console.log(`Converted: ${this.stats.converted}`);
        console.log(`Failed: ${this.stats.failed}`);
        console.log(`Skipped: ${this.stats.skipped}`);
        console.log(`Time: ${elapsed}s`);
        console.log(`Output: ${this.outputPath}`);
        console.log(`Output size: ${Object.keys(this.results).length} presets`);

        return {
            total: this.stats.total,
            converted: this.stats.converted,
            failed: this.stats.failed,
            outputPath: this.outputPath
        };
    }
}

async function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    let inputDir = null;
    let outputPath = null;
    let workers = 4;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) {
            inputDir = args[i + 1];
            i++;
        } else if (args[i] === '--output' && args[i + 1]) {
            outputPath = args[i + 1];
            i++;
        } else if (args[i] === '--workers' && args[i + 1]) {
            workers = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log(`
Batch Milk Preset Converter

Usage:
  node tools/batch-convert-milk.js --input <dir> --output <file> [--workers <n>]

Options:
  --input <dir>    Directory containing .milk files (recursive)
  --output <file>  Output JSON file path
  --workers <n>    Number of parallel workers (default: 4)
  --help           Show this help message

Examples:
  node tools/batch-convert-milk.js \\
    --input ./presets-cream-of-the-crop/ \\
    --output ./presets/imports/cream-of-the-crop.json
`);
            process.exit(0);
        }
    }

    if (!inputDir || !outputPath) {
        console.error('Error: --input and --output are required');
        console.error('Run with --help for usage information');
        process.exit(1);
    }

    // Resolve paths
    inputDir = path.resolve(inputDir);
    outputPath = path.resolve(outputPath);

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    const converter = new BatchConverter({
        input: inputDir,
        output: outputPath,
        workers: workers
    });

    await converter.run();
}

main().catch(err => {
    console.error('Batch conversion failed:', err);
    process.exit(1);
});
