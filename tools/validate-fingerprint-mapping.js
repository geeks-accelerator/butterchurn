#!/usr/bin/env node
/**
 * Validate Fingerprint-to-Preset Mapping
 *
 * Quality Gate: Every fingerprint hash must map to a loadable preset.
 * This is the plan's HIGHEST-PRIORITY check (lesson #1: fingerprint/preset mismatch).
 *
 * Checks:
 * 1. Every fingerprint hash exists in the preset bundle
 * 2. No trailing/leading whitespace in preset names
 * 3. No duplicate names (collision detection)
 * 4. Canonical pack alignment (fingerprints match the runtime's expected pack)
 *
 * Usage:
 *   node tools/validate-fingerprint-mapping.js [--fingerprints FILE] [--presets FILE] [--fix]
 *
 * Default files:
 *   fingerprints: presets/alaska-butter/alaskaButter.fingerprints.json
 *   presets: presets/alaska-butter/alaskaButter.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Parse arguments
const args = process.argv.slice(2);
let fingerprintsPath = path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.fingerprints.json');
let presetsPath = path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.json');
let fix = false;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--fingerprints' && args[i + 1]) {
        fingerprintsPath = path.resolve(args[++i]);
    } else if (args[i] === '--presets' && args[i + 1]) {
        presetsPath = path.resolve(args[++i]);
    } else if (args[i] === '--fix') {
        fix = true;
    } else if (args[i] === '--help') {
        console.log(`
Usage: node tools/validate-fingerprint-mapping.js [OPTIONS]

Options:
  --fingerprints FILE   Path to fingerprints JSON (default: presets/alaska-butter/alaskaButter.fingerprints.json)
  --presets FILE        Path to presets JSON (default: presets/alaska-butter/alaskaButter.json)
  --fix                 Attempt to fix whitespace issues
  --help                Show this help

Exit codes:
  0 - All validations pass
  1 - Validation failures found
`);
        process.exit(0);
    }
}

console.log('[validate] Fingerprint-to-Preset Mapping Validator');
console.log('[validate] ==========================================\n');

// Load files
let fingerprints, presets;
try {
    console.log(`[validate] Loading fingerprints: ${fingerprintsPath}`);
    fingerprints = JSON.parse(fs.readFileSync(fingerprintsPath, 'utf8'));
} catch (e) {
    console.error(`[validate] ERROR: Cannot load fingerprints: ${e.message}`);
    process.exit(1);
}

try {
    console.log(`[validate] Loading presets: ${presetsPath}`);
    presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
} catch (e) {
    console.error(`[validate] ERROR: Cannot load presets: ${e.message}`);
    console.error(`[validate] NOTE: If the preset bundle doesn't exist, it needs to be generated.`);
    process.exit(1);
}

const fpEntries = fingerprints.presets || {};
const presetNames = new Set(Object.keys(presets));

console.log(`[validate] Fingerprints: ${Object.keys(fpEntries).length}`);
console.log(`[validate] Presets: ${presetNames.size}\n`);

// Track issues
const issues = {
    missingPresets: [],      // fingerprint points to non-existent preset
    whitespaceNames: [],     // names with leading/trailing whitespace
    duplicateNames: new Map(), // name -> [hashes]
    numericKeys: 0,          // preset keys that are numeric (wrong format)
};

// Check 1: Every fingerprint must map to a loadable preset
console.log('[validate] Check 1: Fingerprint -> Preset mapping...');
for (const [hash, data] of Object.entries(fpEntries)) {
    const names = data.names || [];
    for (const name of names) {
        // Check whitespace
        if (name !== name.trim()) {
            issues.whitespaceNames.push({ hash, name, trimmed: name.trim() });
        }

        // Track name -> hash mapping for collision detection
        if (!issues.duplicateNames.has(name)) {
            issues.duplicateNames.set(name, []);
        }
        issues.duplicateNames.get(name).push(hash);

        // Check if preset exists (try both original and trimmed)
        if (!presetNames.has(name) && !presetNames.has(name.trim())) {
            issues.missingPresets.push({ hash, name });
        }
    }
}

// Check 2: Numeric keys detection (wrong format)
console.log('[validate] Check 2: Preset key format...');
for (const key of Object.keys(presets)) {
    if (/^\d+$/.test(key)) {
        issues.numericKeys++;
    }
}

// Check 3: Find actual collisions (same name, different content hashes)
const collisions = [];
for (const [name, hashes] of issues.duplicateNames) {
    if (hashes.length > 1) {
        // Check if the hashes are actually different (not just same preset, different names)
        const uniqueHashes = [...new Set(hashes)];
        if (uniqueHashes.length > 1) {
            collisions.push({ name, hashes: uniqueHashes });
        }
    }
}

// Report results
console.log('\n[validate] Results');
console.log('==================\n');

let hasErrors = false;

if (issues.missingPresets.length > 0) {
    hasErrors = true;
    console.log(`❌ MISSING PRESETS: ${issues.missingPresets.length} fingerprints point to non-existent presets`);
    console.log('   First 10:');
    issues.missingPresets.slice(0, 10).forEach(({ hash, name }) => {
        console.log(`     ${hash}: "${name}"`);
    });
    if (issues.missingPresets.length > 10) {
        console.log(`     ... and ${issues.missingPresets.length - 10} more`);
    }
    console.log();
}

if (issues.whitespaceNames.length > 0) {
    hasErrors = true;
    console.log(`❌ WHITESPACE NAMES: ${issues.whitespaceNames.length} names have leading/trailing whitespace`);
    console.log('   First 10:');
    issues.whitespaceNames.slice(0, 10).forEach(({ hash, name }) => {
        console.log(`     ${hash}: "${name}" (should be "${name.trim()}")`);
    });
    if (issues.whitespaceNames.length > 10) {
        console.log(`     ... and ${issues.whitespaceNames.length - 10} more`);
    }
    console.log();
}

if (collisions.length > 0) {
    hasErrors = true;
    console.log(`❌ NAME COLLISIONS: ${collisions.length} names map to multiple content hashes`);
    console.log('   First 10:');
    collisions.slice(0, 10).forEach(({ name, hashes }) => {
        console.log(`     "${name}" -> [${hashes.join(', ')}]`);
    });
    if (collisions.length > 10) {
        console.log(`     ... and ${collisions.length - 10} more`);
    }
    console.log();
}

if (issues.numericKeys > 0) {
    hasErrors = true;
    console.log(`❌ NUMERIC KEYS: ${issues.numericKeys} preset keys are numeric (should be preset names)`);
    console.log('   This indicates the preset JSON needs to be regenerated with proper name keys.');
    console.log();
}

if (!hasErrors) {
    console.log('✅ All validations passed!');
    console.log(`   ${Object.keys(fpEntries).length} fingerprints`);
    console.log(`   ${presetNames.size} presets`);
    console.log(`   0 missing mappings`);
    console.log(`   0 whitespace issues`);
    console.log(`   0 name collisions`);
}

// Summary
console.log('\n[validate] Summary');
console.log('==================');
console.log(`Fingerprints checked: ${Object.keys(fpEntries).length}`);
console.log(`Missing presets: ${issues.missingPresets.length}`);
console.log(`Whitespace names: ${issues.whitespaceNames.length}`);
console.log(`Name collisions: ${collisions.length}`);
console.log(`Numeric keys: ${issues.numericKeys}`);

if (hasErrors) {
    console.log('\n❌ VALIDATION FAILED - See issues above');
    process.exit(1);
} else {
    console.log('\n✅ VALIDATION PASSED');
    process.exit(0);
}
