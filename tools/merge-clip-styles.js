#!/usr/bin/env node

/**
 * Merge CLIP Visual Style Scores into Fingerprint Database
 * Phase 6: ML Visual Style Tagging
 *
 * This script merges the CLIP-classified visual styles into the fingerprint
 * database, updating the visualStyle and visualStyleScores fields.
 *
 * Usage: node merge-clip-styles.js <clip-results.json> <fingerprints.json> [--output <output.json>]
 */

import { promises as fs } from 'fs';
import path from 'path';

async function mergeClipStyles(clipResultsPath, fingerprintsPath, outputPath) {
    console.log('[Merge] Loading CLIP results from:', clipResultsPath);
    const clipResults = JSON.parse(await fs.readFile(clipResultsPath, 'utf8'));

    console.log('[Merge] Loading fingerprints from:', fingerprintsPath);
    const fingerprints = JSON.parse(await fs.readFile(fingerprintsPath, 'utf8'));

    console.log(`[Merge] CLIP results: ${Object.keys(clipResults).length} presets`);
    console.log(`[Merge] Fingerprints: ${Object.keys(fingerprints.presets || fingerprints).length} presets`);

    // Handle both formats: { presets: {...} } and direct { hash: {...} }
    const presetData = fingerprints.presets || fingerprints;

    // Normalize name the same way render-preset-frames.js does
    function normalizeName(name) {
        return name.replace(/[^a-z0-9]/gi, '_').substring(0, 100);
    }

    // Build reverse mapping: normalized preset name -> hash
    // The fingerprint format has 'names' array containing all known names for a preset
    const nameToHash = {};
    for (const [hash, preset] of Object.entries(presetData)) {
        // Check both 'name' (single) and 'names' (array) fields
        const names = preset.names || (preset.name ? [preset.name] : []);
        for (const name of names) {
            const normalizedName = normalizeName(name);
            nameToHash[normalizedName] = hash;
        }

        // Also try using the 'firstSeen' field as a name hint
        if (preset.firstSeen) {
            const normalizedFirstSeen = normalizeName(preset.firstSeen);
            nameToHash[normalizedFirstSeen] = hash;
        }
    }

    console.log(`[Merge] Built name mapping with ${Object.keys(nameToHash).length} entries`);

    let matched = 0;
    let unmatched = 0;

    // Merge CLIP results into fingerprints
    for (const [clipName, clipData] of Object.entries(clipResults)) {
        // clipName is already normalized (from render-preset-frames.js)
        const hash = nameToHash[clipName];

        if (hash && presetData[hash]) {
            // Merge CLIP visual style data into the fingerprint sub-object only
            const preset = presetData[hash];
            if (preset.fingerprint) {
                preset.fingerprint.visualStyle = clipData.visualStyle;
                preset.fingerprint.visualStyleScores = clipData.visualStyleScores;
                preset.fingerprint.visualStyleSource = 'clip'; // Mark as CLIP-derived
            }
            // Note: Do NOT add at root level - only in fingerprint sub-object
            matched++;
        } else {
            unmatched++;
            if (unmatched <= 5) {
                console.log(`[Merge] Warning: No match for CLIP preset: ${clipName.substring(0, 50)}...`);
            }
        }
    }

    console.log(`[Merge] Matched: ${matched} presets`);
    console.log(`[Merge] Unmatched: ${unmatched} presets`);

    // Update version to indicate CLIP data is included
    if (fingerprints.version) {
        fingerprints.version = '2.2.0'; // Bump version for CLIP integration
    }

    // Write output
    const output = outputPath || fingerprintsPath;
    await fs.writeFile(output, JSON.stringify(fingerprints, null, 2), 'utf8');
    console.log(`[Merge] Wrote merged fingerprints to: ${output}`);

    // Generate distribution summary
    const styleCounts = {};
    for (const preset of Object.values(presetData)) {
        if (preset.visualStyle) {
            styleCounts[preset.visualStyle] = (styleCounts[preset.visualStyle] || 0) + 1;
        }
    }

    console.log('\n[Merge] Visual Style Distribution (after merge):');
    Object.entries(styleCounts)
        .sort((a, b) => b[1] - a[1])
        .forEach(([style, count]) => {
            const pct = ((count / Object.keys(presetData).length) * 100).toFixed(1);
            console.log(`  ${style}: ${count} (${pct}%)`);
        });
}

// Parse arguments
const args = process.argv.slice(2);
if (args.length < 2) {
    console.log('Usage: node merge-clip-styles.js <clip-results.json> <fingerprints.json> [--output <output.json>]');
    process.exit(1);
}

const clipPath = args[0];
const fingerprintsPath = args[1];
let outputPath = null;

for (let i = 2; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
        outputPath = args[i + 1];
        i++;
    }
}

mergeClipStyles(clipPath, fingerprintsPath, outputPath).catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
