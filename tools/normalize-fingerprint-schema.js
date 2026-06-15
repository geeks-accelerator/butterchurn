#!/usr/bin/env node
/**
 * Normalize Fingerprint Schema
 *
 * Fixes Phase 3/4 fingerprints that used a divergent schema:
 * - energyLabel: "medium"/"high" → derive from energy value
 * - musicalResponsiveness: "medium"/"high" → derive from beatSync/complexity
 * - optimalBpm: scalar number → {min, max, ideal} object
 * - reliabilityTier: "stable"/"moderate"/"erratic" → canonical vocab
 * - Adds missing inner hash fields
 *
 * Run after any fingerprint generation to ensure schema consistency.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateContentHash } from '../src/utils/contentHash.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Canonical vocabularies (must match validate-fingerprint-mapping.js)
const VALID_ENERGY_LABEL = ['calm', 'flowing', 'dynamic', 'energetic', 'intense', 'explosive'];
const VALID_MUSICAL_RESP = ['spectral_analysis', 'beat_detection', 'volume_reactive', 'time_only', 'basic_audio'];
const VALID_RELIABILITY = ['rock_solid', 'stable', 'finicky', 'experimental'];

// Derive energyLabel from energy value
function deriveEnergyLabel(energy) {
    if (energy === undefined || energy === null) return 'dynamic';
    if (energy < 0.15) return 'calm';
    if (energy < 0.3) return 'flowing';
    if (energy < 0.5) return 'dynamic';
    if (energy < 0.7) return 'energetic';
    if (energy < 0.85) return 'intense';
    return 'explosive';
}

// Derive musicalResponsiveness from beatSync and complexity
function deriveMusicalResponsiveness(fp) {
    const beatSync = fp.beatSync ?? fp.beat ?? 0;
    const complexity = fp.complexity ?? 0.5;
    const bassEnergy = fp.bassEnergy ?? fp.bass ?? 0.5;

    // High beat sync = beat detection
    if (beatSync > 0.7) return 'beat_detection';
    // High bass + moderate beat = volume reactive
    if (bassEnergy > 0.6 && beatSync > 0.3) return 'volume_reactive';
    // High complexity = spectral analysis
    if (complexity > 0.6) return 'spectral_analysis';
    // Low everything = time only
    if (beatSync < 0.2 && complexity < 0.3) return 'time_only';
    // Default
    return 'basic_audio';
}

// Derive reliabilityTier
function deriveReliabilityTier(fp) {
    const complexity = fp.complexity ?? 0.5;
    const warmupTime = fp.warmupTime ?? 0;

    if (complexity < 0.3 && warmupTime === 0) return 'rock_solid';
    if (complexity < 0.5) return 'stable';
    if (complexity < 0.7) return 'finicky';
    return 'experimental';
}

// Convert scalar optimalBpm to object
function normalizeOptimalBpm(bpm, energy) {
    if (typeof bpm === 'object' && bpm !== null && 'ideal' in bpm) {
        return bpm; // Already correct format
    }

    // Convert scalar to object
    const ideal = typeof bpm === 'number' ? bpm : Math.round(80 + (energy ?? 0.5) * 80);
    return {
        min: Math.max(60, ideal - 30),
        max: Math.min(180, ideal + 30),
        ideal: ideal
    };
}

console.log('[normalize] Normalizing fingerprint schema to canonical format\n');

// Process butterchurnPresetsAll
const fpPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.fingerprints.json');
const presetsPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.json');

const db = JSON.parse(fs.readFileSync(fpPath, 'utf8'));
const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));

console.log(`[normalize] Loaded ${Object.keys(db.presets).length} fingerprints`);

// Stats
const stats = {
    energyLabelFixed: 0,
    musicalRespFixed: 0,
    reliabilityFixed: 0,
    optimalBpmFixed: 0,
    hashAdded: 0,
    total: Object.keys(db.presets).length
};

for (const [name, data] of Object.entries(db.presets)) {
    const fp = data.fingerprint;
    if (!fp) continue;

    // Fix energyLabel
    if (!VALID_ENERGY_LABEL.includes(fp.energyLabel)) {
        fp.energyLabel = deriveEnergyLabel(fp.energy);
        stats.energyLabelFixed++;
    }

    // Fix musicalResponsiveness
    if (!VALID_MUSICAL_RESP.includes(fp.musicalResponsiveness)) {
        fp.musicalResponsiveness = deriveMusicalResponsiveness(fp);
        stats.musicalRespFixed++;
    }

    // Fix reliabilityTier
    if (!VALID_RELIABILITY.includes(fp.reliabilityTier)) {
        fp.reliabilityTier = deriveReliabilityTier(fp);
        stats.reliabilityFixed++;
    }

    // Fix optimalBpm
    if (typeof fp.optimalBpm !== 'object' || !fp.optimalBpm?.ideal) {
        fp.optimalBpm = normalizeOptimalBpm(fp.optimalBpm, fp.energy);
        stats.optimalBpmFixed++;
    }

    // Add missing inner hash
    if (!data.hash && presets[name]) {
        data.hash = generateContentHash(presets[name]);
        stats.hashAdded++;
    }
}

console.log('\n[normalize] Fixes applied:');
console.log(`  energyLabel: ${stats.energyLabelFixed} (invalid → derived)`);
console.log(`  musicalResponsiveness: ${stats.musicalRespFixed} (invalid → derived)`);
console.log(`  reliabilityTier: ${stats.reliabilityFixed} (invalid → derived)`);
console.log(`  optimalBpm: ${stats.optimalBpmFixed} (scalar → object)`);
console.log(`  hash: ${stats.hashAdded} (missing → computed)`);

// Rebuild indices for categorical fields
console.log('\n[normalize] Rebuilding categorical indices...');

db.indices.energyLabel = { calm: [], flowing: [], dynamic: [], energetic: [], intense: [], explosive: [] };
db.indices.musicalResponsiveness = { spectral_analysis: [], beat_detection: [], volume_reactive: [], time_only: [], basic_audio: [] };
db.indices.reliabilityTier = { rock_solid: [], stable: [], finicky: [], experimental: [] };

for (const [name, data] of Object.entries(db.presets)) {
    const fp = data.fingerprint;
    if (!fp) continue;

    if (fp.energyLabel && db.indices.energyLabel[fp.energyLabel]) {
        db.indices.energyLabel[fp.energyLabel].push(name);
    }
    if (fp.musicalResponsiveness && db.indices.musicalResponsiveness[fp.musicalResponsiveness]) {
        db.indices.musicalResponsiveness[fp.musicalResponsiveness].push(name);
    }
    if (fp.reliabilityTier && db.indices.reliabilityTier[fp.reliabilityTier]) {
        db.indices.reliabilityTier[fp.reliabilityTier].push(name);
    }
}

// Sort all buckets
for (const category of ['energyLabel', 'musicalResponsiveness', 'reliabilityTier']) {
    for (const bucket of Object.keys(db.indices[category])) {
        db.indices[category][bucket].sort();
    }
}

// Update version
db.version = '2.2.2';
db.generated = new Date().toISOString();
db.schemaNormalized = new Date().toISOString();

// Write back
fs.writeFileSync(fpPath, JSON.stringify(db, null, 2));
fs.writeFileSync(fpPath.replace('.json', '.min.json'), JSON.stringify(db));

// Verify
console.log('\n[normalize] Verification:');
let invalidEnergy = 0, invalidMusical = 0, invalidReliability = 0, scalarBpm = 0;
for (const data of Object.values(db.presets)) {
    const fp = data.fingerprint;
    if (!VALID_ENERGY_LABEL.includes(fp?.energyLabel)) invalidEnergy++;
    if (!VALID_MUSICAL_RESP.includes(fp?.musicalResponsiveness)) invalidMusical++;
    if (!VALID_RELIABILITY.includes(fp?.reliabilityTier)) invalidReliability++;
    if (typeof fp?.optimalBpm !== 'object') scalarBpm++;
}
console.log(`  Invalid energyLabel: ${invalidEnergy} ${invalidEnergy === 0 ? '✅' : '❌'}`);
console.log(`  Invalid musicalResponsiveness: ${invalidMusical} ${invalidMusical === 0 ? '✅' : '❌'}`);
console.log(`  Invalid reliabilityTier: ${invalidReliability} ${invalidReliability === 0 ? '✅' : '❌'}`);
console.log(`  Scalar optimalBpm: ${scalarBpm} ${scalarBpm === 0 ? '✅' : '❌'}`);

// Index sizes
console.log('\n[normalize] Index bucket sizes:');
for (const [category, buckets] of Object.entries(db.indices)) {
    if (typeof buckets === 'object' && !Array.isArray(buckets)) {
        const sizes = Object.entries(buckets).map(([k, v]) => `${k}:${v.length}`).join(', ');
        console.log(`  ${category}: ${sizes}`);
    }
}

const allFixed = invalidEnergy === 0 && invalidMusical === 0 && invalidReliability === 0 && scalarBpm === 0;
console.log(`\n${allFixed ? '✅' : '❌'} Schema normalization ${allFixed ? 'complete' : 'incomplete'}!`);
