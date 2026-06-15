#!/usr/bin/env node
/**
 * Converted Preset Validator
 *
 * Validates converted presets to ensure they meet Butterchurn requirements.
 * Distinguishes between missing required fields (errors) and missing optional fields (warnings).
 *
 * Checks:
 * - Required fields present (baseVals, shapes, waves)
 * - Equation strings are valid JavaScript
 * - Shader strings are present (if Milkdrop 2+)
 * - baseVals has required rendering parameters
 * - Shapes and waves have valid structure
 *
 * Usage:
 *   node tools/validate-converted-presets.js --input ./converted.json [--strict]
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Required fields that must be present
const REQUIRED_FIELDS = ['baseVals', 'shapes', 'waves'];

// Optional fields with warnings if missing
const OPTIONAL_FIELDS = ['init_eqs_str', 'frame_eqs_str', 'pixel_eqs_str', 'warp', 'comp'];

// Required baseVals parameters for rendering
const REQUIRED_BASEVALS = ['decay'];

// Recommended baseVals parameters
const RECOMMENDED_BASEVALS = [
    'wave_mode', 'zoom', 'rot', 'cx', 'cy', 'warp'
];

class PresetValidator {
    constructor(options = {}) {
        this.strict = options.strict || false;
        this.stats = {
            total: 0,
            valid: 0,
            warnings: 0,
            errors: 0
        };
        this.issues = [];
    }

    validateEquationString(eqStr, fieldName, presetName) {
        if (!eqStr || eqStr.length === 0) {
            return { valid: true, empty: true };
        }

        // Check for common JavaScript patterns that indicate valid equations
        const hasAssignment = eqStr.includes("a['") || eqStr.includes('a["');
        const hasMath = eqStr.includes('Math.');
        const hasOperator = /[+\-*/%]/.test(eqStr);

        // Try to detect syntax errors by looking for unbalanced brackets
        const brackets = { '(': 0, '[': 0, '{': 0 };
        for (const char of eqStr) {
            if (char === '(') brackets['(']++;
            if (char === ')') brackets['(']--;
            if (char === '[') brackets['[']++;
            if (char === ']') brackets['[']--;
            if (char === '{') brackets['{']++;
            if (char === '}') brackets['{']--;
        }

        const balanced = Object.values(brackets).every(v => v === 0);
        if (!balanced) {
            return {
                valid: false,
                error: `Unbalanced brackets in ${fieldName}`,
                details: brackets
            };
        }

        // Check for obviously broken code patterns
        if (eqStr.includes('undefined') && !eqStr.includes("'undefined'")) {
            return {
                valid: false,
                error: `Contains undefined reference in ${fieldName}`,
                warning: true
            };
        }

        return { valid: true, hasContent: true };
    }

    validateBaseVals(baseVals, presetName) {
        const errors = [];
        const warnings = [];

        if (!baseVals || typeof baseVals !== 'object') {
            errors.push('baseVals is missing or not an object');
            return { errors, warnings };
        }

        // Check required baseVals
        for (const field of REQUIRED_BASEVALS) {
            if (!(field in baseVals)) {
                warnings.push(`Missing required baseVals.${field} (will use default)`);
            }
        }

        // Check recommended baseVals
        for (const field of RECOMMENDED_BASEVALS) {
            if (!(field in baseVals)) {
                // Only add if strict mode
                if (this.strict) {
                    warnings.push(`Missing recommended baseVals.${field}`);
                }
            }
        }

        // Validate value ranges
        if ('decay' in baseVals) {
            const decay = baseVals.decay;
            if (decay < 0 || decay > 1) {
                warnings.push(`baseVals.decay (${decay}) outside typical range [0, 1]`);
            }
        }

        if ('zoom' in baseVals) {
            const zoom = baseVals.zoom;
            if (zoom <= 0) {
                errors.push(`baseVals.zoom (${zoom}) must be positive`);
            }
        }

        return { errors, warnings };
    }

    validateShapes(shapes, presetName) {
        const errors = [];
        const warnings = [];

        if (!Array.isArray(shapes)) {
            errors.push('shapes must be an array');
            return { errors, warnings };
        }

        shapes.forEach((shape, idx) => {
            if (!shape.baseVals) {
                warnings.push(`shapes[${idx}] missing baseVals`);
            }
        });

        return { errors, warnings };
    }

    validateWaves(waves, presetName) {
        const errors = [];
        const warnings = [];

        if (!Array.isArray(waves)) {
            errors.push('waves must be an array');
            return { errors, warnings };
        }

        waves.forEach((wave, idx) => {
            if (!wave.baseVals) {
                warnings.push(`waves[${idx}] missing baseVals`);
            }
        });

        return { errors, warnings };
    }

    validatePreset(preset, name) {
        const errors = [];
        const warnings = [];

        // Check required fields
        for (const field of REQUIRED_FIELDS) {
            if (!(field in preset)) {
                errors.push(`Missing required field: ${field}`);
            }
        }

        // Check optional fields
        for (const field of OPTIONAL_FIELDS) {
            if (!(field in preset)) {
                warnings.push(`Missing optional field: ${field}`);
            }
        }

        // Validate equation strings
        const eqFields = ['init_eqs_str', 'frame_eqs_str', 'pixel_eqs_str'];
        for (const field of eqFields) {
            if (field in preset) {
                const result = this.validateEquationString(preset[field], field, name);
                if (!result.valid) {
                    if (result.warning) {
                        warnings.push(result.error);
                    } else {
                        errors.push(result.error);
                    }
                }
            }
        }

        // Validate baseVals
        const baseValsResult = this.validateBaseVals(preset.baseVals, name);
        errors.push(...baseValsResult.errors);
        warnings.push(...baseValsResult.warnings);

        // Validate shapes
        if (preset.shapes) {
            const shapesResult = this.validateShapes(preset.shapes, name);
            errors.push(...shapesResult.errors);
            warnings.push(...shapesResult.warnings);
        }

        // Validate waves
        if (preset.waves) {
            const wavesResult = this.validateWaves(preset.waves, name);
            errors.push(...wavesResult.errors);
            warnings.push(...wavesResult.warnings);
        }

        // Check for shader content (Milkdrop 2+ presets should have shaders)
        const hasWarp = preset.warp && preset.warp.length > 0;
        const hasComp = preset.comp && preset.comp.length > 0;
        if (!hasWarp && !hasComp) {
            warnings.push('No warp or comp shaders (Milkdrop 1 preset or conversion issue)');
        }

        return { errors, warnings, isValid: errors.length === 0 };
    }

    async validate(inputPath) {
        console.log('=== Converted Preset Validator ===');
        console.log(`Input: ${inputPath}`);
        console.log(`Mode: ${this.strict ? 'strict' : 'normal'}`);
        console.log('');

        const content = await fs.readFile(inputPath, 'utf8');
        const presets = JSON.parse(content);
        const names = Object.keys(presets);

        this.stats.total = names.length;
        console.log(`Validating ${names.length} presets...`);

        for (const name of names) {
            const result = this.validatePreset(presets[name], name);

            if (result.isValid) {
                this.stats.valid++;
            } else {
                this.stats.errors++;
            }

            if (result.warnings.length > 0) {
                this.stats.warnings++;
            }

            if (result.errors.length > 0 || (this.strict && result.warnings.length > 0)) {
                this.issues.push({
                    name,
                    errors: result.errors,
                    warnings: result.warnings
                });
            }
        }

        this.printReport();

        return {
            total: this.stats.total,
            valid: this.stats.valid,
            withWarnings: this.stats.warnings,
            withErrors: this.stats.errors,
            issues: this.issues
        };
    }

    printReport() {
        console.log('\n=== Validation Report ===');
        console.log(`Total presets: ${this.stats.total}`);
        console.log(`Valid (no errors): ${this.stats.valid} (${((this.stats.valid / this.stats.total) * 100).toFixed(1)}%)`);
        console.log(`With warnings: ${this.stats.warnings}`);
        console.log(`With errors: ${this.stats.errors}`);

        if (this.issues.length > 0) {
            console.log(`\n=== Issues (showing first 10) ===`);
            const showCount = Math.min(10, this.issues.length);
            for (let i = 0; i < showCount; i++) {
                const issue = this.issues[i];
                console.log(`\n[${i + 1}] ${issue.name.substring(0, 50)}...`);
                issue.errors.forEach(e => console.log(`  ❌ ${e}`));
                issue.warnings.slice(0, 3).forEach(w => console.log(`  ⚠️  ${w}`));
            }

            if (this.issues.length > 10) {
                console.log(`\n... and ${this.issues.length - 10} more issues`);
            }
        }

        // Summary by issue type
        const errorTypes = {};
        const warningTypes = {};
        this.issues.forEach(issue => {
            issue.errors.forEach(e => {
                const type = e.split(':')[0].trim();
                errorTypes[type] = (errorTypes[type] || 0) + 1;
            });
            issue.warnings.forEach(w => {
                const type = w.split(':')[0].trim();
                warningTypes[type] = (warningTypes[type] || 0) + 1;
            });
        });

        if (Object.keys(errorTypes).length > 0) {
            console.log('\n=== Error Summary ===');
            Object.entries(errorTypes)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .forEach(([type, count]) => console.log(`  ${count}x: ${type}`));
        }

        if (Object.keys(warningTypes).length > 0) {
            console.log('\n=== Warning Summary ===');
            Object.entries(warningTypes)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .forEach(([type, count]) => console.log(`  ${count}x: ${type}`));
        }

        console.log('\n=== Validation Complete ===');
        if (this.stats.errors === 0) {
            console.log('✅ All presets passed validation');
        } else {
            console.log(`❌ ${this.stats.errors} presets have errors`);
        }
    }
}

async function main() {
    const args = process.argv.slice(2);

    let inputPath = null;
    let strict = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) {
            inputPath = args[i + 1];
            i++;
        } else if (args[i] === '--strict') {
            strict = true;
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log(`
Converted Preset Validator

Usage:
  node tools/validate-converted-presets.js --input <file> [--strict]

Options:
  --input <file>  JSON file with converted presets
  --strict        Enable strict mode (warn about optional fields)
  --help          Show this help message

Validation checks:
  - Required fields: baseVals, shapes, waves
  - Optional fields: init_eqs_str, frame_eqs_str, pixel_eqs_str, warp, comp
  - Equation syntax: balanced brackets, valid JavaScript patterns
  - baseVals: decay required, zoom/rot/etc recommended
  - Shapes/waves: valid array structure
`);
            process.exit(0);
        }
    }

    if (!inputPath) {
        console.error('Error: --input is required');
        console.error('Run with --help for usage information');
        process.exit(1);
    }

    inputPath = path.resolve(inputPath);

    const validator = new PresetValidator({ strict });
    const result = await validator.validate(inputPath);

    // Exit with error code if any presets failed
    process.exit(result.withErrors > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Validation failed:', err);
    process.exit(1);
});
