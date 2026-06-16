#!/usr/bin/env node

/**
 * Semantic Enrichment: Describe Presets
 * Phase 6.1: Generate free-form descriptions of preset visuals using vision-LM
 *
 * Usage:
 *   node tools/semantic-enrichment/describe-presets.js --pack alaska-butter
 *   node tools/semantic-enrichment/describe-presets.js --pack full-collection --limit 10
 *   node tools/semantic-enrichment/describe-presets.js --frames presets/imports/frames --output descriptions.json
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Read prompt template
const SYSTEM_PROMPT = `You are a visual analyst describing music visualizer frames. Your descriptions will be used to create searchable embeddings, so be specific and vivid. Focus on what makes this visual unique.`;

const USER_PROMPT = `Describe this music visualizer preset based on these frames. Include:
- Visual appearance (shapes, patterns, textures, motion implied)
- Color palette and dominant hues
- Mood or atmosphere evoked
- Any specific imagery or metaphors it brings to mind

Be specific and vivid. 2-4 sentences.`;

// Configuration
const DEFAULT_CONFIG = {
  visionModel: 'llama3.2-vision:11b',
  ollamaUrl: 'http://localhost:11434',
  framesPerPreset: 2,
  batchSize: 10,
  retryAttempts: 3,
  retryDelayMs: 1000,
};

async function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pack':
        config.pack = args[++i];
        break;
      case '--frames':
        config.framesDir = args[++i];
        break;
      case '--output':
        config.outputPath = args[++i];
        break;
      case '--model':
        config.visionModel = args[++i];
        break;
      case '--limit':
        config.limit = parseInt(args[++i], 10);
        break;
      case '--offset':
        config.offset = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--help':
        console.log(`
Usage: node describe-presets.js [options]

Options:
  --pack <name>       Preset pack name (alaska-butter, full-collection)
  --frames <dir>      Directory containing rendered frames
  --output <path>     Output JSON file path
  --model <name>      Vision model to use (default: llama3.2-vision:11b)
  --limit <n>         Process only first N presets
  --offset <n>        Skip first N presets
  --dry-run           Show what would be processed without calling the model
  --help              Show this help message
        `);
        process.exit(0);
    }
  }

  return config;
}

async function loadFingerprintIndex(pack) {
  const packPaths = {
    'alaska-butter': path.join(PROJECT_ROOT, 'presets/alaska-butter/alaskaButter.fingerprints.json'),
    'full-collection': path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.fingerprints.json'),
  };

  const fpPath = packPaths[pack];
  if (!fpPath) {
    throw new Error(`Unknown pack: ${pack}. Use: ${Object.keys(packPaths).join(', ')}`);
  }

  const raw = await fs.readFile(fpPath, 'utf-8');
  const data = JSON.parse(raw);

  // Handle both flat and nested (v2.2+) fingerprint formats
  // v2.2+ has { version, presets: {...} }, older has flat { presetName: {...} }
  if (data.presets && typeof data.presets === 'object') {
    return data.presets;
  }

  // Filter out metadata fields from flat format
  const metadataKeys = ['version', 'generated', 'fingerprintAlgorithm'];
  const fingerprints = {};
  for (const [key, value] of Object.entries(data)) {
    if (!metadataKeys.includes(key) && typeof value === 'object' && value !== null) {
      fingerprints[key] = value;
    }
  }
  return fingerprints;
}

async function findPresetFrames(framesDir, presetName) {
  // Frame naming conventions:
  // 1. presetName_0.png, presetName_1.png, etc.
  // 2. hash_0.png, hash_1.png, etc.

  const files = await fs.readdir(framesDir);

  // Try exact name match first
  const namePattern = new RegExp(`^${escapeRegex(presetName)}_\\d+\\.png$`, 'i');
  let frames = files.filter(f => namePattern.test(f));

  if (frames.length === 0) {
    // Try sanitized name (spaces → underscores, special chars removed)
    const sanitized = presetName.replace(/[^a-zA-Z0-9]/g, '_');
    const sanitizedPattern = new RegExp(`^${escapeRegex(sanitized)}_\\d+\\.png$`, 'i');
    frames = files.filter(f => sanitizedPattern.test(f));
  }

  if (frames.length === 0) {
    return null;
  }

  // Sort by frame index and take middle frame
  frames.sort((a, b) => {
    const idxA = parseInt(a.match(/_(\d+)\.png$/)?.[1] || '0', 10);
    const idxB = parseInt(b.match(/_(\d+)\.png$/)?.[1] || '0', 10);
    return idxA - idxB;
  });

  // Take 1 middle frame (llama3.2-vision only supports single image)
  const totalFrames = frames.length;
  const midIdx = Math.floor(totalFrames / 2);
  const selectedFrame = frames[midIdx] || frames[0];

  return [path.join(framesDir, selectedFrame)];
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function loadImageAsBase64(imagePath) {
  const buffer = await fs.readFile(imagePath);
  return buffer.toString('base64');
}

async function callVisionModel(config, images, retryCount = 0) {
  // Note: llama3.2-vision only supports ONE image at a time
  // Use the first (middle) frame only
  const imagePath = images[0];
  const imageBase64 = await loadImageAsBase64(imagePath);

  const payload = {
    model: config.visionModel,
    prompt: USER_PROMPT,
    system: SYSTEM_PROMPT,
    images: [imageBase64],
    stream: false,
    options: {
      temperature: 0.7,
      num_predict: 200,
    },
  };

  try {
    const response = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result.response?.trim() || '';
  } catch (error) {
    if (retryCount < config.retryAttempts) {
      console.log(`  Retry ${retryCount + 1}/${config.retryAttempts} after error: ${error.message}`);
      await new Promise(r => setTimeout(r, config.retryDelayMs * (retryCount + 1)));
      return callVisionModel(config, images, retryCount + 1);
    }
    throw error;
  }
}

async function processPreset(config, presetName, hash, framesDir) {
  const frames = await findPresetFrames(framesDir, presetName);

  if (!frames || frames.length === 0) {
    return { presetName, hash, error: 'No frames found', description: null };
  }

  if (config.dryRun) {
    return { presetName, hash, frames, description: '[DRY RUN]' };
  }

  try {
    const description = await callVisionModel(config, frames);
    return { presetName, hash, description, frames };
  } catch (error) {
    return { presetName, hash, error: error.message, description: null };
  }
}

async function main() {
  const config = await parseArgs();

  console.log('[Semantic Enrichment] Starting preset description generation');
  console.log(`  Vision model: ${config.visionModel}`);

  // Determine frames directory and output path
  let framesDir = config.framesDir;
  let outputPath = config.outputPath;
  let fingerprints = null;

  if (config.pack) {
    fingerprints = await loadFingerprintIndex(config.pack);
    console.log(`  Pack: ${config.pack} (${Object.keys(fingerprints).length} presets)`);

    // Default frames directory for the pack
    if (!framesDir) {
      if (config.pack === 'alaska-butter') {
        framesDir = path.join(PROJECT_ROOT, 'presets/alaska-butter/frames');
      } else {
        framesDir = path.join(PROJECT_ROOT, 'presets/imports/frames');
      }
    }

    // Default output path
    if (!outputPath) {
      const packPrefix = config.pack === 'alaska-butter' ? 'alaskaButter' : 'butterchurnPresetsAll';
      outputPath = path.join(PROJECT_ROOT, `presets/${config.pack.replace('full-collection', 'full-collection')}/${packPrefix}.semantic.descriptions.json`);
    }
  }

  if (!framesDir) {
    console.error('Error: Must specify --pack or --frames');
    process.exit(1);
  }

  // Check if frames directory exists
  try {
    await fs.access(framesDir);
  } catch {
    console.error(`Error: Frames directory not found: ${framesDir}`);
    console.error('Run the frame renderer first: node tools/render-preset-frames.js');
    process.exit(1);
  }

  console.log(`  Frames directory: ${framesDir}`);
  console.log(`  Output: ${outputPath || '[stdout]'}`);

  // Build list of presets to process
  let presetList;
  if (fingerprints) {
    presetList = Object.entries(fingerprints).map(([name, fp]) => ({
      name,
      hash: fp.hash,
    }));
  } else {
    // Scan frames directory for unique preset names
    const files = await fs.readdir(framesDir);
    const presetNames = new Set();
    for (const f of files) {
      const match = f.match(/^(.+)_\d+\.png$/);
      if (match) presetNames.add(match[1]);
    }
    presetList = Array.from(presetNames).map(name => ({ name, hash: null }));
  }

  // Apply offset and limit
  let startIdx = config.offset || 0;
  let endIdx = config.limit ? startIdx + config.limit : presetList.length;
  presetList = presetList.slice(startIdx, endIdx);

  console.log(`  Processing ${presetList.length} presets (offset=${startIdx}, limit=${config.limit || 'none'})`);

  if (config.dryRun) {
    console.log('\n[DRY RUN] Would process:');
  }

  // Process presets
  const results = [];
  const errors = [];
  let processed = 0;

  for (const preset of presetList) {
    const result = await processPreset(config, preset.name, preset.hash, framesDir);

    if (result.error) {
      errors.push(result);
      console.log(`  [${++processed}/${presetList.length}] ${preset.name}: ERROR - ${result.error}`);
    } else {
      results.push(result);
      const descPreview = result.description.substring(0, 60).replace(/\n/g, ' ');
      console.log(`  [${++processed}/${presetList.length}] ${preset.name}: "${descPreview}..."`);
    }

    // Progress update every 10 presets
    if (processed % 10 === 0) {
      const pct = Math.round((processed / presetList.length) * 100);
      console.log(`  Progress: ${pct}% (${processed}/${presetList.length})`);
    }
  }

  // Build output structure
  const output = {
    version: 'v1.0',
    generatedAt: new Date().toISOString(),
    visionModel: config.visionModel,
    promptVersion: 'v1',
    totalPresets: presetList.length,
    successCount: results.length,
    errorCount: errors.length,
    descriptions: {},
  };

  for (const r of results) {
    output.descriptions[r.presetName] = {
      hash: r.hash,
      description: r.description,
    };
  }

  if (errors.length > 0) {
    output.errors = errors.map(e => ({ presetName: e.presetName, error: e.error }));
  }

  // Write output
  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
    console.log(`\nWrote ${results.length} descriptions to ${outputPath}`);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }

  // Summary
  console.log('\n[Summary]');
  console.log(`  Success: ${results.length}`);
  console.log(`  Errors: ${errors.length}`);
  if (errors.length > 0 && errors.length <= 10) {
    console.log('  Failed presets:');
    for (const e of errors) {
      console.log(`    - ${e.presetName}: ${e.error}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
