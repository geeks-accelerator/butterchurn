#!/usr/bin/env node

/**
 * Semantic Enrichment: Embed Descriptions
 * Phase 6.1: Generate embeddings from preset descriptions using EmbeddingGemma
 *
 * Usage:
 *   node tools/semantic-enrichment/embed-descriptions.js --input descriptions.json --output embeddings.bin
 *   node tools/semantic-enrichment/embed-descriptions.js --pack alaska-butter
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Configuration
const DEFAULT_CONFIG = {
  embeddingModel: 'nomic-embed-text:latest',
  ollamaUrl: 'http://localhost:11434',
  outputFormat: 'json', // 'json' or 'binary'
  batchSize: 50,
};

async function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        config.inputPath = args[++i];
        break;
      case '--output':
        config.outputPath = args[++i];
        break;
      case '--pack':
        config.pack = args[++i];
        break;
      case '--model':
        config.embeddingModel = args[++i];
        break;
      case '--format':
        config.outputFormat = args[++i];
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--help':
        console.log(`
Usage: node embed-descriptions.js [options]

Options:
  --input <path>      Input descriptions JSON file
  --output <path>     Output embeddings file (JSON or binary)
  --pack <name>       Preset pack name (infers paths from pack)
  --model <name>      Embedding model (default: nomic-embed-text:latest)
  --format <type>     Output format: json or binary (default: json)
  --dry-run           Show what would be processed
  --help              Show this help message
        `);
        process.exit(0);
    }
  }

  return config;
}

async function callEmbeddingModel(config, text) {
  const payload = {
    model: config.embeddingModel,
    input: text,
  };

  const response = await fetch(`${config.ollamaUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Ollama embed API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return result.embeddings?.[0] || result.embedding;
}

async function batchEmbed(config, descriptions) {
  const results = [];
  const errors = [];
  let processed = 0;
  const total = Object.keys(descriptions).length;

  for (const [presetName, data] of Object.entries(descriptions)) {
    if (!data.description) {
      errors.push({ presetName, error: 'No description' });
      continue;
    }

    try {
      if (config.dryRun) {
        results.push({
          presetName,
          hash: data.hash,
          embedding: '[DRY RUN - 768 dims]',
        });
      } else {
        const embedding = await callEmbeddingModel(config, data.description);
        results.push({
          presetName,
          hash: data.hash,
          embedding,
        });
      }

      processed++;
      if (processed % 10 === 0) {
        const pct = Math.round((processed / total) * 100);
        console.log(`  Progress: ${pct}% (${processed}/${total})`);
      }
    } catch (error) {
      errors.push({ presetName, error: error.message });
      console.log(`  Error embedding ${presetName}: ${error.message}`);
    }
  }

  return { results, errors };
}

function float32ToFloat16(float32Array) {
  // Simple float16 conversion for storage
  // This is a basic implementation - for production, use a proper library
  const float16Array = new Uint16Array(float32Array.length);

  for (let i = 0; i < float32Array.length; i++) {
    const val = float32Array[i];

    // Handle special cases
    if (val === 0) {
      float16Array[i] = 0;
      continue;
    }

    // Simple truncation approach (good enough for cosine similarity)
    const sign = val < 0 ? 1 : 0;
    const abs = Math.abs(val);

    if (abs > 65504) {
      // Overflow to infinity
      float16Array[i] = (sign << 15) | 0x7C00;
    } else if (abs < 6.1e-5) {
      // Underflow to zero
      float16Array[i] = sign << 15;
    } else {
      // Normal conversion
      const exp = Math.floor(Math.log2(abs));
      const mantissa = abs / Math.pow(2, exp) - 1;
      const biasedExp = exp + 15;
      const mantissaBits = Math.round(mantissa * 1024);
      float16Array[i] = (sign << 15) | (biasedExp << 10) | mantissaBits;
    }
  }

  return float16Array;
}

async function writeBinaryEmbeddings(outputPath, results) {
  // Binary format:
  // Header: 8 bytes (magic "EMBV1\0\0\0") + 4 bytes (count) + 4 bytes (dims)
  // Per entry: 32 bytes (hash, null-padded) + dims*2 bytes (float16 embedding)

  const dims = results[0].embedding.length;
  const headerSize = 16;
  const entrySize = 32 + dims * 2;
  const totalSize = headerSize + results.length * entrySize;

  const buffer = Buffer.alloc(totalSize);
  let offset = 0;

  // Write header
  buffer.write('EMBV1\0\0\0', offset);
  offset += 8;
  buffer.writeUInt32LE(results.length, offset);
  offset += 4;
  buffer.writeUInt32LE(dims, offset);
  offset += 4;

  // Write entries
  for (const result of results) {
    // Hash (32 bytes, null-padded)
    const hashStr = result.hash || '';
    buffer.write(hashStr.substring(0, 32), offset);
    offset += 32;

    // Embedding (float16)
    const float32 = new Float32Array(result.embedding);
    const float16 = float32ToFloat16(float32);
    Buffer.from(float16.buffer).copy(buffer, offset);
    offset += dims * 2;
  }

  await fs.writeFile(outputPath, buffer);
}

async function main() {
  const config = await parseArgs();

  console.log('[Semantic Enrichment] Starting embedding generation');
  console.log(`  Embedding model: ${config.embeddingModel}`);

  // Determine input/output paths
  let inputPath = config.inputPath;
  let outputPath = config.outputPath;

  if (config.pack) {
    const packDir = config.pack === 'alaska-butter'
      ? path.join(PROJECT_ROOT, 'presets/alaska-butter')
      : path.join(PROJECT_ROOT, 'presets/full-collection');

    const prefix = config.pack === 'alaska-butter' ? 'alaskaButter' : 'butterchurnPresetsAll';

    inputPath = inputPath || path.join(packDir, `${prefix}.semantic.descriptions.json`);
    outputPath = outputPath || path.join(packDir, `${prefix}.semantic.embeddings.json`);
  }

  if (!inputPath) {
    console.error('Error: Must specify --input or --pack');
    process.exit(1);
  }

  console.log(`  Input: ${inputPath}`);
  console.log(`  Output: ${outputPath}`);

  // Load descriptions
  let descriptionsData;
  try {
    const raw = await fs.readFile(inputPath, 'utf-8');
    descriptionsData = JSON.parse(raw);
  } catch (error) {
    console.error(`Error loading descriptions: ${error.message}`);
    process.exit(1);
  }

  const descriptions = descriptionsData.descriptions;
  const totalPresets = Object.keys(descriptions).length;
  console.log(`  Loaded ${totalPresets} descriptions`);

  // Generate embeddings
  const { results, errors } = await batchEmbed(config, descriptions);

  // Build output
  const output = {
    version: 'v1.0',
    generatedAt: new Date().toISOString(),
    embeddingModel: config.embeddingModel,
    dimensions: results.length > 0 ? results[0].embedding.length : 0,
    totalPresets: totalPresets,
    successCount: results.length,
    errorCount: errors.length,
    embeddings: {},
  };

  for (const r of results) {
    output.embeddings[r.presetName] = {
      hash: r.hash,
      embedding: r.embedding,
    };
  }

  if (errors.length > 0) {
    output.errors = errors;
  }

  // Write output
  if (outputPath) {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    if (config.outputFormat === 'binary' && outputPath.endsWith('.bin')) {
      await writeBinaryEmbeddings(outputPath, results);
      console.log(`\nWrote ${results.length} embeddings to ${outputPath} (binary, float16)`);
    } else {
      await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
      console.log(`\nWrote ${results.length} embeddings to ${outputPath}`);
    }
  } else {
    // Just show summary for stdout
    console.log(`\nGenerated ${results.length} embeddings (${output.dimensions} dimensions)`);
  }

  // Summary
  console.log('\n[Summary]');
  console.log(`  Success: ${results.length}`);
  console.log(`  Errors: ${errors.length}`);
  console.log(`  Dimensions: ${output.dimensions}`);

  // Estimate storage
  const jsonSize = JSON.stringify(output).length;
  const binarySize = results.length * (32 + output.dimensions * 2);
  console.log(`  JSON size: ${(jsonSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Binary (float16) size: ${(binarySize / 1024 / 1024).toFixed(2)} MB`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
