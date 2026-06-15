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

// Derive dominantHue from preset name/equations
function deriveDominantHue(preset, name) {
    const nameLower = (name || '').toLowerCase();
    const frameEqs = (preset.frame_eqs_str || '').toLowerCase();
    const allText = nameLower + ' ' + frameEqs;

    if (/rainbow|spectrum|prism/i.test(allText)) return 'rainbow';
    if (/fire|flame|lava|warm|red|orange|yellow|gold|amber/i.test(allText)) return 'warm';
    if (/ice|cold|blue|cyan|aqua|ocean|water|cool/i.test(allText)) return 'cool';
    if (/forest|tree|leaf|grass|earth|natural|nature/i.test(allText)) return 'natural';
    return 'neutral';
}

// Derive colorProfile from preset
function deriveColorProfile(preset, name) {
    const nameLower = (name || '').toLowerCase();
    const baseVals = preset.baseVals || {};

    if (/vivid|vibrant|neon|glow|bright/i.test(nameLower)) return 'vivid';
    if (/natural|nature|organic|earth/i.test(nameLower)) return 'nature';
    if (/warm|fire|flame|red|orange|gold/i.test(nameLower)) return 'warm';
    if (/cool|cold|ice|blue|cyan/i.test(nameLower)) return 'cool';

    const gamma = baseVals.gamma ?? 1;
    if (gamma > 1.3) return 'vivid';

    return 'neutral';
}

// Derive motionSpeed from preset
function deriveMotionSpeed(preset) {
    const baseVals = preset.baseVals || {};
    const zoom = baseVals.zoom ?? 1;
    const rot = baseVals.rot ?? 0;
    const warp = baseVals.warp ?? 0;
    const zoomexp = baseVals.zoomexp ?? 1;

    const zoomDelta = Math.abs(zoom - 1);
    const rotSpeed = Math.abs(rot);
    const warpAmount = Math.abs(warp);

    const motionScore = zoomDelta * 2 + rotSpeed * 5 + warpAmount + (zoomexp - 1);

    if (motionScore > 1.5) return 'chaotic';
    if (motionScore > 0.8) return 'fast';
    if (motionScore > 0.3) return 'medium';
    if (motionScore > 0.05) return 'slow';
    return 'static';
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

    // Check and fix dominantHue
    if (fp.dominantHue === undefined) {
        fp.dominantHue = deriveDominantHue(preset, name);
        changed = true;
    }

    // Check and fix colorProfile
    if (fp.colorProfile === undefined) {
        fp.colorProfile = deriveColorProfile(preset, name);
        changed = true;
    }

    // Check and fix motionSpeed
    if (fp.motionSpeed === undefined) {
        fp.motionSpeed = deriveMotionSpeed(preset);
        changed = true;
    }

    // Check and fix visualStyleScores (ensure all 9 keys)
    const expectedStyleKeys = ['particle', 'fractal', 'geometric', 'fluid_organic', 'abstract', 'kaleidoscope', 'tunnel', 'waveform', 'organic'];
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
    } else {
        // Ensure all 9 keys exist
        for (const key of expectedStyleKeys) {
            if (fp.visualStyleScores[key] === undefined) {
                fp.visualStyleScores[key] = 0.1;
                changed = true;
            }
        }
    }

    // Check and fix moodAffinities
    if (!fp.moodAffinities) {
        const energy = fp.energy ?? 0.5;
        fp.moodAffinities = {
            energetic: energy,
            calm: 1 - energy,
            dark: 0.3,
            bright: 0.5,
            hypnotic: 0.4,
            aggressive: energy * 0.5,
            mystical: 0.3,
            psychedelic: 0.2,
            dreamy: 0.3,
            meditative: 1 - energy
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
let missingDominantHue = 0, missingColorProfile = 0, missingMotionSpeed = 0;
let missingOrganicKey = 0, missingMoodAffinities = 0;
const expectedStyleKeys = ['particle', 'fractal', 'geometric', 'fluid_organic', 'abstract', 'kaleidoscope', 'tunnel', 'waveform', 'organic'];
for (const data of Object.values(fpDb.presets)) {
    const fp = data.fingerprint || {};
    if (fp.warmupTime === undefined) missingWarmup++;
    if (typeof fp.optimalBpm !== 'object') missingOptimalBpm++;
    if (fp.colorPaletteType === undefined) missingColorPalette++;
    if (!fp.visualStyleScores) missingStyleScores++;
    else if (expectedStyleKeys.some(k => fp.visualStyleScores[k] === undefined)) missingOrganicKey++;
    if (fp.dominantHue === undefined) missingDominantHue++;
    if (fp.colorProfile === undefined) missingColorProfile++;
    if (fp.motionSpeed === undefined) missingMotionSpeed++;
    if (!fp.moodAffinities) missingMoodAffinities++;
}

console.log('\nVerification:');
console.log('  Missing warmupTime:', missingWarmup);
console.log('  Invalid optimalBpm:', missingOptimalBpm);
console.log('  Missing colorPaletteType:', missingColorPalette);
console.log('  Missing visualStyleScores:', missingStyleScores);
console.log('  Missing visualStyleScores keys:', missingOrganicKey);
console.log('  Missing dominantHue:', missingDominantHue);
console.log('  Missing colorProfile:', missingColorProfile);
console.log('  Missing motionSpeed:', missingMotionSpeed);
console.log('  Missing moodAffinities:', missingMoodAffinities);

const totalMissing = missingWarmup + missingOptimalBpm + missingColorPalette + missingStyleScores +
                     missingDominantHue + missingColorProfile + missingMotionSpeed +
                     missingOrganicKey + missingMoodAffinities;
if (totalMissing === 0) {
    console.log('\n✅ Backfill complete! All fields populated.');
} else {
    console.log('\n⚠️  Backfill complete with ' + totalMissing + ' remaining issues.')
}
