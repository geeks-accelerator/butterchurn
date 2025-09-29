#!/usr/bin/env node

/**
 * Test the dynamic preset compatibility checker
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PresetCompatibilityChecker from '../src/utils/presetCompatibilityChecker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Alaska Butter presets
const presetsPath = path.join(__dirname, '..', 'presets', 'alaska-butter', 'alaskaButter.json');
const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));

// Create checker instance
const checker = new PresetCompatibilityChecker();

console.log('=== Testing Preset Compatibility Checker ===\n');
console.log(`Total presets to analyze: ${Object.keys(presets).length}\n`);

// Analyze all presets
const results = {
    incompatible: [],
    warning: [],
    safe: []
};

Object.entries(presets).forEach(([name, preset]) => {
    const analysis = checker.analyzePreset(preset);

    if (analysis.severity === 'incompatible') {
        results.incompatible.push({
            name,
            issues: analysis.issues,
            transition: analysis.recommendedTransition,
            duration: analysis.recommendedDuration
        });
    } else if (analysis.severity === 'warning') {
        results.warning.push({
            name,
            issues: analysis.issues,
            transition: analysis.recommendedTransition,
            duration: analysis.recommendedDuration
        });
    } else {
        results.safe.push(name);
    }
});

// Display results
console.log('=== Analysis Results ===\n');

console.log(`Incompatible presets (${results.incompatible.length}):`);
if (results.incompatible.length > 0) {
    results.incompatible.forEach(p => {
        console.log(`  - ${p.name}`);
        console.log(`    Issues: ${p.issues.join(', ')}`);
        console.log(`    Recommendation: ${p.transition} (${p.duration}s)`);
    });
} else {
    console.log('  None found');
}

console.log(`\nWarning presets (${results.warning.length}):`);
if (results.warning.length > 0) {
    // Show first 10
    results.warning.slice(0, 10).forEach(p => {
        console.log(`  - ${p.name}`);
        console.log(`    Issues: ${p.issues.join(', ')}`);
        console.log(`    Recommendation: ${p.transition} (${p.duration}s)`);
    });
    if (results.warning.length > 10) {
        console.log(`  ... and ${results.warning.length - 10} more`);
    }
} else {
    console.log('  None found');
}

console.log(`\nSafe presets: ${results.safe.length}`);

// Get statistics
const stats = checker.getStatistics();
console.log('\n=== Issue Type Statistics ===');
Object.entries(stats.issueTypes).forEach(([issue, count]) => {
    console.log(`  ${issue}: ${count} presets`);
});

// Test some specific transitions
console.log('\n=== Testing Specific Transitions ===\n');

// Test known problematic presets
const problematicNames = [
    'martin - sunset over the river',
    'suksma - feign shoulder concern when i should be executed - everything is eternally shrinking'
];

problematicNames.forEach(name => {
    if (presets[name]) {
        console.log(`Testing: ${name}`);
        const fromPreset = presets['Flexi - infused with the spiral']; // A safe preset
        const toPreset = presets[name];

        const compatibility = checker.checkTransitionCompatibility(fromPreset, toPreset);
        console.log(`  Transition: ${compatibility.type}`);
        console.log(`  Duration: ${compatibility.duration}s`);
        console.log(`  Reason: ${compatibility.reason}\n`);
    }
});

console.log('=== Summary ===');
console.log(`Total analyzed: ${Object.keys(presets).length}`);
console.log(`Incompatible: ${results.incompatible.length} (${(results.incompatible.length / Object.keys(presets).length * 100).toFixed(1)}%)`);
console.log(`Warnings: ${results.warning.length} (${(results.warning.length / Object.keys(presets).length * 100).toFixed(1)}%)`);
console.log(`Safe: ${results.safe.length} (${(results.safe.length / Object.keys(presets).length * 100).toFixed(1)}%)`);