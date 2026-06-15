#!/usr/bin/env node
/**
 * Backfill Preset-Derived Fields
 *
 * For fingerprints missing fields that need to be derived from actual preset
 * content (warmupTime, optimalBpm, colorPaletteType, colorComplexity, brightness),
 * this script loads the preset data and derives the missing fields.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('[backfill-preset] Backfilling preset-derived fields\n');

// Load preset bundle
const presetsPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.json');
const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
console.log(`[backfill-preset] Loaded ${Object.keys(presets).length} presets`);

// Load fingerprints
const fpPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.fingerprints.json');
const fpDb = JSON.parse(fs.readFileSync(fpPath, 'utf8'));
console.log(`[backfill-preset] Loaded ${Object.keys(fpDb.presets).length} fingerprints`);

// Derive warmupTime from preset
function deriveWarmupTime(preset) {
    let warmupSeconds = 0;
    const baseVals = preset.baseVals || {};

    if (baseVals.decay) {
        if (baseVals.decay > 0.98) warmupSeconds += 3;
        else if (baseVals.decay > 0.96) warmupSeconds += 2;
        else if (baseVals.decay > 0.94) warmupSeconds += 1;
    }

    if (baseVals.echo_alpha && baseVals.echo_alpha > 0.5) {
        warmupSeconds += 2;
    }

    if (baseVals.invert && baseVals.invert > 0) {
        warmupSeconds += 1;
    }

    const allEqs = [
        preset.frame_eqs_str || '',
        preset.pixel_eqs_str || '',
        preset.init_eqs_str || ''
    ].join(' ');
    if (allEqs.includes('old_') || allEqs.includes('prev_')) {
        warmupSeconds += 2;
    }

    if (baseVals.gamma && baseVals.gamma < 0.5) {
        warmupSeconds += 2;
    }

    return warmupSeconds;
}

// Derive optimalBpm from energy
function deriveOptimalBpm(energy) {
    return {
        min: Math.round(60 + energy * 40),
        max: Math.round(120 + energy * 60),
        ideal: Math.round(80 + energy * 60)
    };
}

// Derive color fields from preset
function deriveColorFields(preset) {
    const baseVals = preset.baseVals || {};
    const gamma = baseVals.gamma ?? 1;
    const brightnessVal = baseVals.brightness ?? 1;

    let brightness;
    if (gamma < 0.8 || brightnessVal < 0.8) brightness = 'dark';
    else if (gamma > 1.2 || brightnessVal > 1.2) brightness = 'bright';
    else if (baseVals.invert && baseVals.invert > 0) brightness = 'inverted';
    else brightness = 'balanced';

    const frameEqs = preset.frame_eqs_str || '';
    const hasAudioReactive = /bass|mid|treb|time/i.test(frameEqs);
    const hasCycling = /time|sin|cos/i.test(frameEqs);

    let colorPaletteType;
    if (hasAudioReactive) colorPaletteType = 'audio_reactive';
    else if (hasCycling) colorPaletteType = 'time_cycling';
    else colorPaletteType = 'static_monochrome';

    const shapesCount = (preset.shapes || []).length;
    const wavesCount = (preset.waves || []).length;
    const totalElements = shapesCount + wavesCount;

    let colorComplexity;
    if (totalElements >= 4) colorComplexity = 'complex';
    else if (totalElements >= 2) colorComplexity = 'moderate';
    else colorComplexity = 'simple';

    return { brightness, colorPaletteType, colorComplexity };
}

let updated = 0;
let skipped = 0;

for (const [name, data] of Object.entries(fpDb.presets)) {
    const fp = data.fingerprint || {};
    const preset = presets[name];

    if (!preset) {
        skipped++;
        continue;
    }

    let changed = false;

    // Check and fix warmupTime
    if (fp.warmupTime === undefined) {
        fp.warmupTime = deriveWarmupTime(preset);
        changed = true;
    }

    // Check and fix optimalBpm
    if (typeof fp.optimalBpm !== 'object' || fp.optimalBpm === null) {
        fp.optimalBpm = deriveOptimalBpm(fp.energy ?? 0.5);
        changed = true;
    }

    // Check and fix color fields
    if (fp.colorPaletteType === undefined || fp.colorComplexity === undefined || fp.brightness === undefined) {
        const colorFields = deriveColorFields(preset);
        if (fp.colorPaletteType === undefined) fp.colorPaletteType = colorFields.colorPaletteType;
        if (fp.colorComplexity === undefined) fp.colorComplexity = colorFields.colorComplexity;
        if (fp.brightness === undefined) fp.brightness = colorFields.brightness;
        changed = true;
    }

    // Check and fix visualStyleScores
    if (!fp.visualStyleScores) {
        fp.visualStyleScores = {
            particle: 0.1,
            fractal: 0.1,
            geometric: 0.1,
            fluid_organic: 0.1,
            abstract: 0.2,
            kaleidoscope: 0.1,
            tunnel: 0.1,
            waveform: 0.1,
            organic: 0.1
        };
        changed = true;
    }

    if (changed) {
        data.fingerprint = fp;
        updated++;
    }
}

console.log(`[backfill-preset] Updated: ${updated}`);
console.log(`[backfill-preset] Skipped (no preset): ${skipped}`);

// Write back
fs.writeFileSync(fpPath, JSON.stringify(fpDb, null, 2));
console.log(`[backfill-preset] Wrote ${fpPath}`);

// Verify
let missingWarmup = 0, missingOptimalBpm = 0, missingColorPalette = 0, missingStyleScores = 0;
for (const data of Object.values(fpDb.presets)) {
    const fp = data.fingerprint || {};
    if (fp.warmupTime === undefined) missingWarmup++;
    if (typeof fp.optimalBpm !== 'object') missingOptimalBpm++;
    if (fp.colorPaletteType === undefined) missingColorPalette++;
    if (!fp.visualStyleScores) missingStyleScores++;
}

console.log('\nVerification:');
console.log('  Missing warmupTime:', missingWarmup);
console.log('  Invalid optimalBpm:', missingOptimalBpm);
console.log('  Missing colorPaletteType:', missingColorPalette);
console.log('  Missing visualStyleScores:', missingStyleScores);

console.log('\n✅ Backfill complete!');
