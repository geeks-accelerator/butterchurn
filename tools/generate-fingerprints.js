#!/usr/bin/env node

/**
 * Butterchurn Preset Fingerprint Generator
 *
 * This script analyzes preset equations to generate deterministic fingerprints
 * without any audio testing. It creates 8-character content hashes and
 * deduplicates presets based on their actual mathematics.
 *
 * Usage: node generate-fingerprints.js [--input ./presets] [--output ./fingerprints.json]
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class PresetFingerprintGenerator {
    constructor() {
        this.stats = {
            totalFiles: 0,
            uniquePresets: 0,
            duplicatesFound: 0,
            authorsIdentified: new Set(),
            failedFiles: []
        };

        this.database = {
            version: "1.0.0",
            generated: new Date().toISOString(),
            presets: {},
            indices: {
                high: [],
                bass: [],
                calm: [],
                particle: [],
                fractal: [],
                geometric: [],
                organic: []
            },
            authorIndex: {},
            nameIndex: {}
        };
    }

    /**
     * Generate content-based hash from preset equations
     * This ensures identical presets get the same hash regardless of name/author
     */
    generateContentHash(preset) {
        // Collect all equation strings - handle both _eel and _str formats
        const equations = [
            preset.init_eqs_str || preset.init_eqs_eel || '',
            preset.frame_eqs_str || preset.frame_eqs_eel || '',
            preset.pixel_eqs_str || preset.pixel_eqs_eel || '',
            preset.warp_eqs_str || preset.warp?.eel || '',
            preset.comp_eqs_str || preset.comp?.eel || '',
            // Include base values that affect rendering
            JSON.stringify(this.sortObject(preset.baseVals || {})),
            // Include shapes and waves configuration
            JSON.stringify((preset.shapes || []).map(s => this.sortObject(s))),
            JSON.stringify((preset.waves || []).map(w => this.sortObject(w)))
        ].join('|');

        // Generate SHA256 hash and take first 8 characters
        return crypto.createHash('sha256')
            .update(equations)
            .digest('hex')
            .substring(0, 8);
    }

    /**
     * Sort object keys for consistent hashing
     */
    sortObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        return Object.keys(obj)
            .sort()
            .reduce((sorted, key) => {
                sorted[key] = obj[key];
                return sorted;
            }, {});
    }

    /**
     * Extract author from preset name using common patterns
     */
    extractAuthor(presetName) {
        if (!presetName) return 'unknown';

        // Common patterns in MilkDrop preset names
        const patterns = [
            /^([^-+]+?)\s*[-+]/,           // "Author - Title" or "Author + Title"
            /^(\w+\.\w+\.?\w*)/,           // "Eo.S." style
            /^\[([^\]]+)\]/,               // "[Author] Title"
            /^([^_]+?)_/,                  // "Author_Title"
            /^(\$+\s*\w+)/,                // "$$$ Royal" style
        ];

        for (const pattern of patterns) {
            const match = presetName.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }

        // If no pattern matches, try to extract first word
        const firstWord = presetName.split(/[\s\-_+]/)[0];
        return firstWord || 'unknown';
    }

    /**
     * Calculate warmup time needed for preset to become visible
     */
    calculateWarmupTime(preset) {
        let warmupSeconds = 0;

        // High decay = needs time to build up trails
        if (preset.baseVals?.decay) {
            if (preset.baseVals.decay > 0.98) warmupSeconds += 3;
            else if (preset.baseVals.decay > 0.96) warmupSeconds += 2;
            else if (preset.baseVals.decay > 0.94) warmupSeconds += 1;
        }

        // Echo effects need time to propagate
        if (preset.baseVals?.echo_alpha && preset.baseVals.echo_alpha > 0.5) {
            warmupSeconds += 2;
        }

        // Invert effects often start from black
        if (preset.baseVals?.invert && preset.baseVals.invert > 0) {
            warmupSeconds += 1;
        }

        // Check for accumulation patterns in equations
        const allEqs = this.getAllEquations(preset);
        if (allEqs.includes('old_') || allEqs.includes('prev_')) {
            warmupSeconds += 2; // Uses previous frame data
        }

        // Gamma/brightness adjustments might start dark
        if (preset.baseVals?.gamma && preset.baseVals.gamma < 0.5) {
            warmupSeconds += 2;
        }

        return warmupSeconds;
    }

    /**
     * Analyze energy level from equations
     */
    analyzeEnergy(preset) {
        let score = 0.5; // Start neutral

        // Check decay rate (higher = more trails/energy)
        if (preset.baseVals?.decay) {
            if (preset.baseVals.decay > 0.98) score += 0.2;
            else if (preset.baseVals.decay > 0.96) score += 0.1;
            else if (preset.baseVals.decay < 0.94) score -= 0.2;
        }

        // Check for zoom effects (indicates motion)
        const allEqs = this.getAllEquations(preset);
        if (allEqs.includes('zoom')) {
            const zoomCount = (allEqs.match(/zoom/g) || []).length;
            score += Math.min(0.2, zoomCount * 0.05);
        }

        // Check for rotation (indicates spinning/movement)
        if (allEqs.includes('rot')) {
            const rotCount = (allEqs.match(/rot/g) || []).length;
            score += Math.min(0.2, rotCount * 0.05);
        }

        // Check wave amplitude
        if (preset.baseVals?.wave_a) {
            if (preset.baseVals.wave_a > 0.8) score += 0.15;
            else if (preset.baseVals.wave_a < 0.3) score -= 0.15;
        }

        return Math.max(0, Math.min(1, score));
    }

    /**
     * Analyze bass/audio reactivity from variable usage
     */
    analyzeBassReactivity(preset) {
        const audioVars = ['bass', 'bass_att', 'treb', 'treb_att', 'mid', 'mid_att'];
        const allEqs = this.getAllEquations(preset);

        let totalCount = 0;
        for (const varName of audioVars) {
            const regex = new RegExp(`\\b${varName}\\b`, 'g');
            const matches = allEqs.match(regex) || [];
            totalCount += matches.length;
        }

        // Normalize to 0-1 range (10+ mentions = highly reactive)
        return Math.min(1, totalCount / 10);
    }

    /**
     * Detect beat synchronization patterns
     */
    analyzeBeatSync(preset) {
        const beatVars = ['beat', 'is_beat', 'bnot'];
        const allEqs = this.getAllEquations(preset);

        let beatScore = 0;
        for (const varName of beatVars) {
            if (allEqs.includes(varName)) {
                beatScore += 0.3;
            }
        }

        // Check for beat-triggered effects
        if (allEqs.includes('beat') && allEqs.includes('zoom')) beatScore += 0.2;
        if (allEqs.includes('beat') && allEqs.includes('rot')) beatScore += 0.2;

        return Math.min(1, beatScore);
    }

    /**
     * Analyze visual complexity
     */
    analyzeComplexity(preset) {
        let complexity = 0;

        // Count active shapes
        const activeShapes = (preset.shapes || []).filter(s => s.enabled).length;
        complexity += activeShapes * 0.1;

        // Count active waves
        const activeWaves = (preset.waves || []).filter(w => w.enabled).length;
        complexity += activeWaves * 0.1;

        // Check equation complexity
        if (preset.pixel_eqs_str && preset.pixel_eqs_str.length > 100) complexity += 0.2;
        if (preset.warp_eqs_str && preset.warp_eqs_str.length > 100) complexity += 0.2;
        if (preset.comp_eqs_str && preset.comp_eqs_str.length > 100) complexity += 0.15;

        // Check for complex mathematical operations
        const allEqs = this.getAllEquations(preset);
        const complexOps = ['sin', 'cos', 'tan', 'atan', 'sqrt', 'pow', 'exp'];
        for (const op of complexOps) {
            if (allEqs.includes(op)) complexity += 0.05;
        }

        return Math.min(1, complexity);
    }

    /**
     * Estimate performance based on equation complexity
     */
    estimatePerformance(preset) {
        let cost = 0;

        // Pixel shaders are expensive
        if (preset.pixel_eqs_str) {
            cost += preset.pixel_eqs_str.length / 10;
        }

        // Warp effects are expensive
        if (preset.warp_eqs_str) {
            cost += preset.warp_eqs_str.length / 15;
            if (preset.warp_eqs_str.includes('sin') || preset.warp_eqs_str.includes('cos')) {
                cost += 10;
            }
        }

        // Multiple shapes with additive blending
        const shapes = preset.shapes || [];
        cost += shapes.filter(s => s.enabled && s.additive).length * 5;

        // Spectrum analysis costs more than waveform
        const waves = preset.waves || [];
        cost += waves.filter(w => w.enabled && w.spectrum).length * 3;

        // Convert cost to estimated FPS (lower cost = higher FPS)
        const estimatedFPS = Math.max(20, Math.min(60, 60 - cost));
        return estimatedFPS;
    }

    /**
     * Detect visual style from patterns
     */
    detectVisualStyle(preset) {
        const styles = [];
        const allEqs = this.getAllEquations(preset);

        // Particle system detection
        const shapes = preset.shapes || [];
        if (shapes.filter(s => s.enabled && s.additive && s.rad < 0.2).length >= 2) {
            styles.push('particle');
        }

        // Fractal detection
        if (allEqs.includes('zoom') && allEqs.includes('rot') &&
            (allEqs.includes('sin') || allEqs.includes('cos'))) {
            if (preset.baseVals?.decay > 0.96) {
                styles.push('fractal');
            }
        }

        // Geometric detection
        if (shapes.filter(s => s.enabled && s.sides > 3).length > 0) {
            styles.push('geometric');
        }

        // Organic/fluid detection
        if (allEqs.includes('warp') || allEqs.includes('dx') || allEqs.includes('dy')) {
            if (!styles.includes('geometric')) {
                styles.push('organic');
            }
        }

        return styles;
    }

    /**
     * Get all equations as a single string for analysis
     */
    getAllEquations(preset) {
        return [
            preset.init_eqs_str || preset.init_eqs_eel || '',
            preset.frame_eqs_str || preset.frame_eqs_eel || '',
            preset.pixel_eqs_str || preset.pixel_eqs_eel || '',
            preset.warp_eqs_str || preset.warp?.eel || '',
            preset.comp_eqs_str || preset.comp?.eel || '',
            // Also include shape equations
            ...(preset.shapes || []).map(s => s.frame_eqs_str || s.frame_eqs_eel || '')
        ].join(' ').toLowerCase();
    }

    /**
     * Generate complete fingerprint for a preset
     */
    generateFingerprint(preset) {
        return {
            energy: this.analyzeEnergy(preset),
            bass: this.analyzeBassReactivity(preset),
            beat: this.analyzeBeatSync(preset),
            complexity: this.analyzeComplexity(preset),
            fps: this.estimatePerformance(preset),
            styles: this.detectVisualStyle(preset),
            warmupTime: this.calculateWarmupTime(preset)
        };
    }

    /**
     * Process a single preset file
     */
    async processPresetFile(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const preset = JSON.parse(content);

            // Get preset name from file or internal name
            const fileName = path.basename(filePath, path.extname(filePath));
            const presetName = preset.name || fileName;

            // Generate content hash
            const hash = this.generateContentHash(preset);
            const author = this.extractAuthor(presetName);

            this.stats.totalFiles++;
            this.stats.authorsIdentified.add(author);

            // Check if we've seen this hash before (duplicate detection)
            if (!this.database.presets[hash]) {
                // New unique preset
                this.database.presets[hash] = {
                    hash: hash,
                    authors: [author],
                    names: [presetName],
                    firstSeen: author,
                    fingerprint: this.generateFingerprint(preset),
                    files: [filePath]
                };

                this.stats.uniquePresets++;

                // Add to name index
                this.database.nameIndex[presetName] = hash;

                console.log(`✅ ${hash} - ${presetName.substring(0, 50)}${presetName.length > 50 ? '...' : ''}`);
            } else {
                // Duplicate found!
                const existing = this.database.presets[hash];

                if (!existing.authors.includes(author)) {
                    existing.authors.push(author);
                }

                if (!existing.names.includes(presetName)) {
                    existing.names.push(presetName);
                    this.database.nameIndex[presetName] = hash;
                }

                existing.files.push(filePath);
                this.stats.duplicatesFound++;

                console.log(`♻️  ${hash} - Duplicate of "${existing.names[0].substring(0, 30)}..."`);
            }

            // Update author index
            if (!this.database.authorIndex[author]) {
                this.database.authorIndex[author] = [];
            }
            if (!this.database.authorIndex[author].includes(hash)) {
                this.database.authorIndex[author].push(hash);
            }

        } catch (error) {
            console.error(`❌ Failed to process ${filePath}:`, error.message);
            this.stats.failedFiles.push(filePath);
        }
    }

    /**
     * Build category indices based on fingerprints
     */
    buildIndices() {
        for (const [hash, data] of Object.entries(this.database.presets)) {
            const fp = data.fingerprint;

            // Energy-based categories
            if (fp.energy > 0.7) this.database.indices.high.push(hash);
            else if (fp.energy < 0.3) this.database.indices.calm.push(hash);

            // Audio reactivity
            if (fp.bass > 0.6) this.database.indices.bass.push(hash);

            // Visual style categories
            if (fp.styles.includes('particle')) this.database.indices.particle.push(hash);
            if (fp.styles.includes('fractal')) this.database.indices.fractal.push(hash);
            if (fp.styles.includes('geometric')) this.database.indices.geometric.push(hash);
            if (fp.styles.includes('organic')) this.database.indices.organic.push(hash);
        }
    }

    /**
     * Find all preset files recursively
     */
    async findPresetFiles(dir) {
        const files = [];
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                // Recurse into subdirectories
                const subFiles = await this.findPresetFiles(fullPath);
                files.push(...subFiles);
            } else if (entry.name.endsWith('.json') || entry.name.endsWith('.milk')) {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Generate fingerprints for all presets in a directory
     */
    async generateForDirectory(inputDir, options = {}) {
        console.log(`\n🔍 Scanning for presets in: ${inputDir}\n`);

        let presetFiles = await this.findPresetFiles(inputDir);
        console.log(`📁 Found ${presetFiles.length} preset files\n`);

        // Apply limit if specified
        if (options.limit && options.limit > 0) {
            presetFiles = presetFiles.slice(0, options.limit);
            console.log(`📊 Limiting to first ${options.limit} presets\n`);
        }

        // Process each preset
        for (const file of presetFiles) {
            await this.processPresetFile(file);
        }

        // Build category indices
        this.buildIndices();

        // Update stats
        this.database.stats = {
            totalFiles: this.stats.totalFiles,
            uniquePresets: this.stats.uniquePresets,
            duplicatesFound: this.stats.duplicatesFound,
            authorsCount: this.stats.authorsIdentified.size,
            failedFiles: this.stats.failedFiles.length
        };

        return this.database;
    }

    /**
     * Print summary statistics
     */
    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 FINGERPRINT GENERATION COMPLETE');
        console.log('='.repeat(60));
        console.log(`Total files processed:  ${this.stats.totalFiles}`);
        console.log(`Unique presets found:   ${this.stats.uniquePresets}`);
        console.log(`Duplicates detected:    ${this.stats.duplicatesFound}`);
        console.log(`Authors identified:     ${this.stats.authorsIdentified.size}`);
        console.log(`Failed files:          ${this.stats.failedFiles.length}`);
        console.log('\n📈 Category Distribution:');
        console.log(`  High Energy:   ${this.database.indices.high.length}`);
        console.log(`  Bass Reactive: ${this.database.indices.bass.length}`);
        console.log(`  Calm:          ${this.database.indices.calm.length}`);
        console.log(`  Particles:     ${this.database.indices.particle.length}`);
        console.log(`  Fractals:      ${this.database.indices.fractal.length}`);
        console.log(`  Geometric:     ${this.database.indices.geometric.length}`);
        console.log(`  Organic:       ${this.database.indices.organic.length}`);

        if (this.stats.duplicatesFound > 0) {
            const dedupePercent = ((this.stats.duplicatesFound / this.stats.totalFiles) * 100).toFixed(1);
            console.log(`\n♻️  Deduplication saved ${dedupePercent}% (${this.stats.duplicatesFound} duplicates)`);
        }
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    let inputDir = '../node_modules/butterchurn-presets/presets';
    let outputFile = '../fingerprints.json';
    let limit = null;

    console.log('Starting fingerprint generator...');
    console.log('Arguments:', args);

    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) {
            inputDir = args[i + 1];
            i++;
        } else if (args[i] === '--output' && args[i + 1]) {
            outputFile = args[i + 1];
            i++;
        } else if (args[i] === '--limit' && args[i + 1]) {
            limit = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--help') {
            console.log('Usage: node generate-fingerprints.js [options]');
            console.log('\nOptions:');
            console.log('  --input <dir>   Input directory containing presets (default: ../node_modules/butterchurn-presets/presets)');
            console.log('  --output <file> Output file for fingerprint database (default: ../fingerprints.json)');
            console.log('  --limit <n>     Process only first N presets (for testing)');
            console.log('  --help          Show this help message');
            process.exit(0);
        }
    }

    // Resolve paths - if relative, resolve from current working directory, not __dirname
    if (!path.isAbsolute(inputDir)) {
        inputDir = path.resolve(process.cwd(), inputDir);
    }
    if (!path.isAbsolute(outputFile)) {
        outputFile = path.resolve(process.cwd(), outputFile);
    }

    // Check if input directory exists
    try {
        await fs.access(inputDir);
    } catch (error) {
        console.error(`❌ Input directory not found: ${inputDir}`);
        console.error('Please install butterchurn-presets or specify a valid preset directory');
        console.error('Run: npm install butterchurn-presets');
        process.exit(1);
    }

    // Generate fingerprints
    const generator = new PresetFingerprintGenerator();
    const database = await generator.generateForDirectory(inputDir, { limit });

    // Save database
    await fs.writeFile(outputFile, JSON.stringify(database, null, 2));
    console.log(`\n✅ Fingerprint database saved to: ${outputFile}`);

    // Save compact version for production
    const compactFile = outputFile.replace('.json', '.min.json');
    await fs.writeFile(compactFile, JSON.stringify(database));
    console.log(`✅ Compact database saved to: ${compactFile}`);

    // Print summary
    generator.printSummary();
}

// Run the main function directly since this is a CLI tool
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

export default PresetFingerprintGenerator;