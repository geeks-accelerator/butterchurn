#!/usr/bin/env node

/**
 * Semantic Enrichment: Describe Presets
 * Phase 6.1: Generate free-form descriptions of preset visuals using vision-LM
 *
 * Supports two backends:
 * - Ollama (default): llama3.2-vision:11b, sequential processing
 * - MLX-VLM: Qwen2.5-VL with concurrent batching, 3-5x faster on M4 Max
 *
 * Usage:
 *   # Ollama (sequential, ~17s/preset)
 *   node tools/semantic-enrichment/describe-presets.js --pack alaska-butter
 *
 *   # MLX-VLM with concurrency (faster)
 *   node tools/semantic-enrichment/describe-presets.js --pack full-collection --backend mlx --concurrency 8
 *
 *   # Start MLX server first:
 *   mlx_vlm.server --port 8080 --model mlx-community/Qwen2.5-VL-7B-Instruct-4bit
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Read prompt template
const SYSTEM_PROMPT = `You are a visual analyst describing music visualizer frames. Your descriptions will be used to create searchable embeddings, so be specific and vivid. Focus on what makes this visual unique.`;

const USER_PROMPT = `Describe this music visualizer preset based on this frame. Include:
- Visual appearance (shapes, patterns, textures, motion implied)
- Color palette and dominant hues
- Mood or atmosphere evoked
- Any specific imagery or metaphors it brings to mind

Be specific and vivid. 2-4 sentences.`;

// Configuration
const DEFAULT_CONFIG = {
  backend: 'ollama',           // 'ollama' or 'mlx'
  visionModel: 'llama3.2-vision:11b',
  mlxModel: 'mlx-community/Qwen2.5-VL-7B-Instruct-4bit',
  ollamaUrl: 'http://localhost:11434',
  mlxUrl: 'http://localhost:8080',
  concurrency: 1,              // Parallel requests (mlx supports batching)
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
      case '--backend':
        config.backend = args[++i];
        break;
      case '--model':
        config.visionModel = args[++i];
        config.mlxModel = args[i]; // Same arg sets both
        break;
      case '--concurrency':
        config.concurrency = parseInt(args[++i], 10);
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
      case '--resume':
        config.resume = true;
        break;
      case '--help':
        console.log(`
Usage: node describe-presets.js [options]

Options:
  --pack <name>       Preset pack name (alaska-butter, full-collection)
  --frames <dir>      Directory containing rendered frames
  --output <path>     Output JSON file path
  --backend <name>    Vision backend: 'ollama' (default) or 'mlx'
  --model <name>      Vision model (backend-specific)
  --concurrency <n>   Parallel requests (default: 1, recommended: 4-8 for mlx)
  --limit <n>         Process only first N presets
  --offset <n>        Skip first N presets
  --resume            Skip presets already in output file
  --dry-run           Show what would be processed without calling the model
  --help              Show this help message

Backends:
  ollama    Uses Ollama API (default). Sequential, ~17s/preset.
            Model: llama3.2-vision:11b
            Server: ollama serve

  mlx       Uses MLX-VLM server with continuous batching. ~3-5s/preset.
            Model: mlx-community/Qwen2.5-VL-7B-Instruct-4bit
            Server: mlx_vlm.server --port 8080 --model <model>

Example (fast mode for 21K presets):
  # Terminal 1: Start MLX server
  mlx_vlm.server --port 8080 --model mlx-community/Qwen2.5-VL-7B-Instruct-4bit

  # Terminal 2: Run with concurrency
  node describe-presets.js --pack full-collection --backend mlx --concurrency 8
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

  if (data.presets && typeof data.presets === 'object') {
    return data.presets;
  }

  const metadataKeys = ['version', 'generated', 'fingerprintAlgorithm'];
  const fingerprints = {};
  for (const [key, value] of Object.entries(data)) {
    if (!metadataKeys.includes(key) && typeof value === 'object' && value !== null) {
      fingerprints[key] = value;
    }
  }
  return fingerprints;
}

async function loadExistingDescriptions(outputPath) {
  try {
    const raw = await fs.readFile(outputPath, 'utf-8');
    const data = JSON.parse(raw);
    return new Set(Object.keys(data.descriptions || {}));
  } catch {
    return new Set();
  }
}

async function findPresetFrames(framesDir, presetName) {
  const files = await fs.readdir(framesDir);

  const namePattern = new RegExp(`^${escapeRegex(presetName)}_\\d+\\.png$`, 'i');
  let frames = files.filter(f => namePattern.test(f));

  if (frames.length === 0) {
    const sanitized = presetName.replace(/[^a-zA-Z0-9]/g, '_');
    const sanitizedPattern = new RegExp(`^${escapeRegex(sanitized)}_\\d+\\.png$`, 'i');
    frames = files.filter(f => sanitizedPattern.test(f));
  }

  if (frames.length === 0) {
    return null;
  }

  frames.sort((a, b) => {
    const idxA = parseInt(a.match(/_(\d+)\.png$/)?.[1] || '0', 10);
    const idxB = parseInt(b.match(/_(\d+)\.png$/)?.[1] || '0', 10);
    return idxA - idxB;
  });

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

// Ollama backend
async function callOllama(config, imagePath, retryCount = 0) {
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
      const text = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${text}`);
    }

    const result = await response.json();
    return result.response?.trim() || '';
  } catch (error) {
    if (retryCount < config.retryAttempts) {
      await new Promise(r => setTimeout(r, config.retryDelayMs * (retryCount + 1)));
      return callOllama(config, imagePath, retryCount + 1);
    }
    throw error;
  }
}

// MLX-VLM backend (OpenAI-compatible API)
async function callMlxVlm(config, imagePath, retryCount = 0) {
  const imageBase64 = await loadImageAsBase64(imagePath);
  const imageUrl = `data:image/png;base64,${imageBase64}`;

  const payload = {
    model: config.mlxModel,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: imageUrl },
          },
          {
            type: 'text',
            text: USER_PROMPT,
          },
        ],
      },
    ],
    max_tokens: 200,
    temperature: 0.7,
  };

  try {
    const response = await fetch(`${config.mlxUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MLX-VLM API error: ${response.status} ${text}`);
    }

    const result = await response.json();
    return result.choices?.[0]?.message?.content?.trim() || '';
  } catch (error) {
    if (retryCount < config.retryAttempts) {
      await new Promise(r => setTimeout(r, config.retryDelayMs * (retryCount + 1)));
      return callMlxVlm(config, imagePath, retryCount + 1);
    }
    throw error;
  }
}

async function callVisionModel(config, imagePath) {
  if (config.backend === 'mlx') {
    return callMlxVlm(config, imagePath);
  }
  return callOllama(config, imagePath);
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
    const description = await callVisionModel(config, frames[0]);
    return { presetName, hash, description, frames };
  } catch (error) {
    return { presetName, hash, error: error.message, description: null };
  }
}

// Concurrency limiter for parallel processing
function createConcurrencyLimiter(limit) {
  let running = 0;
  const queue = [];

  return async function run(fn) {
    while (running >= limit) {
      await new Promise(resolve => queue.push(resolve));
    }
    running++;
    try {
      return await fn();
    } finally {
      running--;
      if (queue.length > 0) {
        queue.shift()();
      }
    }
  };
}

async function main() {
  const config = await parseArgs();

  console.log('[Semantic Enrichment] Starting preset description generation');
  console.log(`  Backend: ${config.backend}`);
  console.log(`  Model: ${config.backend === 'mlx' ? config.mlxModel : config.visionModel}`);
  console.log(`  Concurrency: ${config.concurrency}`);

  let framesDir = config.framesDir;
  let outputPath = config.outputPath;
  let fingerprints = null;

  if (config.pack) {
    fingerprints = await loadFingerprintIndex(config.pack);
    console.log(`  Pack: ${config.pack} (${Object.keys(fingerprints).length} presets)`);

    if (!framesDir) {
      if (config.pack === 'alaska-butter') {
        framesDir = path.join(PROJECT_ROOT, 'presets/alaska-butter/frames');
      } else {
        framesDir = path.join(PROJECT_ROOT, 'presets/full-collection/frames');
      }
    }

    if (!outputPath) {
      const packPrefix = config.pack === 'alaska-butter' ? 'alaskaButter' : 'butterchurnPresetsAll';
      outputPath = path.join(PROJECT_ROOT, `presets/${config.pack}/${packPrefix}.semantic.descriptions.json`);
    }
  }

  if (!framesDir) {
    console.error('Error: Must specify --pack or --frames');
    process.exit(1);
  }

  try {
    await fs.access(framesDir);
  } catch {
    console.error(`Error: Frames directory not found: ${framesDir}`);
    console.error('Run the frame renderer first: node tools/render-preset-frames.js');
    process.exit(1);
  }

  console.log(`  Frames directory: ${framesDir}`);
  console.log(`  Output: ${outputPath || '[stdout]'}`);

  // Load existing descriptions for resume mode
  let existingDescriptions = new Set();
  if (config.resume && outputPath) {
    existingDescriptions = await loadExistingDescriptions(outputPath);
    console.log(`  Resume mode: ${existingDescriptions.size} existing descriptions found`);
  }

  // Build list of presets to process
  let presetList;
  if (fingerprints) {
    presetList = Object.entries(fingerprints).map(([name, fp]) => ({
      name,
      hash: fp.hash || fp.fingerprint?.hash,
    }));
  } else {
    const files = await fs.readdir(framesDir);
    const presetNames = new Set();
    for (const f of files) {
      const match = f.match(/^(.+)_\d+\.png$/);
      if (match) presetNames.add(match[1]);
    }
    presetList = Array.from(presetNames).map(name => ({ name, hash: null }));
  }

  // Filter out already processed presets in resume mode
  if (config.resume) {
    const beforeCount = presetList.length;
    presetList = presetList.filter(p => !existingDescriptions.has(p.name));
    console.log(`  Filtered: ${beforeCount - presetList.length} already processed, ${presetList.length} remaining`);
  }

  // Apply offset and limit
  let startIdx = config.offset || 0;
  let endIdx = config.limit ? startIdx + config.limit : presetList.length;
  presetList = presetList.slice(startIdx, endIdx);

  console.log(`  Processing ${presetList.length} presets (offset=${startIdx}, limit=${config.limit || 'none'})`);

  if (config.dryRun) {
    console.log('\n[DRY RUN] Would process:');
  }

  // Process presets with concurrency
  const results = [];
  const errors = [];
  let processed = 0;
  const startTime = Date.now();

  const limiter = createConcurrencyLimiter(config.concurrency);

  const processWithProgress = async (preset) => {
    return limiter(async () => {
      const result = await processPreset(config, preset.name, preset.hash, framesDir);
      processed++;

      if (result.error) {
        errors.push(result);
        console.log(`  [${processed}/${presetList.length}] ${preset.name}: ERROR - ${result.error}`);
      } else {
        results.push(result);
        const descPreview = result.description.substring(0, 50).replace(/\n/g, ' ');
        console.log(`  [${processed}/${presetList.length}] ${preset.name}: "${descPreview}..."`);
      }

      // Progress update
      if (processed % 10 === 0 || processed === presetList.length) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processed / elapsed;
        const remaining = (presetList.length - processed) / rate;
        const pct = Math.round((processed / presetList.length) * 100);
        console.log(`  Progress: ${pct}% (${processed}/${presetList.length}) | ${rate.toFixed(1)}/s | ETA: ${formatTime(remaining)}`);
      }

      return result;
    });
  };

  // Process all presets in parallel (limited by concurrency)
  await Promise.all(presetList.map(processWithProgress));

  // Build output structure
  const output = {
    version: 'v1.0',
    generatedAt: new Date().toISOString(),
    backend: config.backend,
    visionModel: config.backend === 'mlx' ? config.mlxModel : config.visionModel,
    promptVersion: 'v1',
    totalPresets: presetList.length,
    successCount: results.length,
    errorCount: errors.length,
    descriptions: {},
  };

  // Merge with existing descriptions in resume mode
  if (config.resume && outputPath) {
    try {
      const existing = JSON.parse(await fs.readFile(outputPath, 'utf-8'));
      output.descriptions = existing.descriptions || {};
      output.totalPresets = Object.keys(output.descriptions).length + results.length;
      output.successCount = Object.keys(output.descriptions).length + results.length;
    } catch { /* ignore */ }
  }

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
    console.log(`\nWrote ${Object.keys(output.descriptions).length} descriptions to ${outputPath}`);
  } else {
    console.log(JSON.stringify(output, null, 2));
  }

  // Summary
  const totalTime = (Date.now() - startTime) / 1000;
  console.log('\n[Summary]');
  console.log(`  Success: ${results.length}`);
  console.log(`  Errors: ${errors.length}`);
  console.log(`  Total time: ${formatTime(totalTime)}`);
  console.log(`  Rate: ${(results.length / totalTime).toFixed(2)} presets/sec`);

  if (errors.length > 0 && errors.length <= 10) {
    console.log('  Failed presets:');
    for (const e of errors) {
      console.log(`    - ${e.presetName}: ${e.error}`);
    }
  }
}

function formatTime(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
