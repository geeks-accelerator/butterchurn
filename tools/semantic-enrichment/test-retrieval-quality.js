#!/usr/bin/env node

/**
 * Semantic Enrichment: Retrieval Quality Test
 * Phase 6.1: Validate that embeddings produce useful similarity search results
 *
 * The load-bearing gate: mean rating across 10 prompts × top-10 retrievals ≥ 3.5/5
 *
 * Usage:
 *   node tools/semantic-enrichment/test-retrieval-quality.js --pack alaska-butter
 *   node tools/semantic-enrichment/test-retrieval-quality.js --embeddings embeddings.json --descriptions descriptions.json
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// 10 hand-crafted music-mood prompts for retrieval testing
const TEST_PROMPTS = [
  'calm dreamy ambient electronic',
  'aggressive industrial techno',
  'warm acoustic folk sunset',
  'hypnotic psychedelic trance',
  'dark ominous cinematic horror',
  'upbeat energetic pop dance',
  'melancholic introspective piano',
  'chaotic glitchy experimental noise',
  'peaceful meditative nature sounds',
  'powerful epic orchestral adventure',
];

// Configuration
const DEFAULT_CONFIG = {
  embeddingModel: 'nomic-embed-text:latest',
  ollamaUrl: 'http://localhost:11434',
  topK: 10,
};

async function parseArgs() {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--embeddings':
        config.embeddingsPath = args[++i];
        break;
      case '--descriptions':
        config.descriptionsPath = args[++i];
        break;
      case '--pack':
        config.pack = args[++i];
        break;
      case '--model':
        config.embeddingModel = args[++i];
        break;
      case '--auto':
        config.autoRate = true;
        break;
      case '--help':
        console.log(`
Usage: node test-retrieval-quality.js [options]

Options:
  --embeddings <path>     Embeddings JSON file
  --descriptions <path>   Descriptions JSON file (for displaying retrieved presets)
  --pack <name>           Preset pack name (infers paths)
  --model <name>          Embedding model for query embedding
  --auto                  Use LLM to auto-rate (no manual input)
  --help                  Show this help message

Quality Gate: Mean rating ≥ 3.5 across all prompts × top-10 retrievals
        `);
        process.exit(0);
    }
  }

  return config;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function embedQuery(config, query) {
  const payload = {
    model: config.embeddingModel,
    input: query,
  };

  const response = await fetch(`${config.ollamaUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Ollama embed API error: ${response.status}`);
  }

  const result = await response.json();
  return result.embeddings?.[0] || result.embedding;
}

function findTopK(queryEmbedding, embeddings, k) {
  const scored = [];

  for (const [presetName, data] of Object.entries(embeddings)) {
    if (!data.embedding) continue;

    const similarity = cosineSimilarity(queryEmbedding, data.embedding);
    scored.push({
      presetName,
      similarity,
      hash: data.hash,
    });
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, k);
}

async function promptForRating(rl, prompt, results, descriptions) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Query: "${prompt}"`);
  console.log(`${'='.repeat(60)}\n`);

  console.log('Top-10 Retrieved Presets:\n');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const desc = descriptions[r.presetName]?.description || '[no description]';
    const descPreview = desc.substring(0, 100).replace(/\n/g, ' ');

    console.log(`${i + 1}. ${r.presetName}`);
    console.log(`   Similarity: ${r.similarity.toFixed(4)}`);
    console.log(`   "${descPreview}..."\n`);
  }

  return new Promise((resolve) => {
    rl.question('\nRate this retrieval set (1-5, where 5=excellent match): ', (answer) => {
      const rating = parseFloat(answer);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        console.log('Invalid rating, using 3.0');
        resolve(3.0);
      } else {
        resolve(rating);
      }
    });
  });
}

async function autoRate(config, prompt, results, descriptions) {
  // Use LLM to auto-rate the retrieval quality
  const resultsText = results.map((r, i) => {
    const desc = descriptions[r.presetName]?.description || '[no description]';
    return `${i + 1}. "${r.presetName}": ${desc}`;
  }).join('\n');

  const ratingPrompt = `You are evaluating music visualizer preset retrieval quality.

Query: "${prompt}"

Retrieved presets (top 10 by embedding similarity):
${resultsText}

Rate how well these retrieved presets match the query on a scale of 1-5:
1 = Completely irrelevant, no match
2 = Poor match, maybe 1-2 relevant
3 = Moderate match, some relevant results
4 = Good match, most results relevant
5 = Excellent match, nearly all results highly relevant

Respond with ONLY a single number (1-5).`;

  try {
    const response = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2:latest',
        prompt: ratingPrompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 5 },
      }),
    });

    if (!response.ok) {
      throw new Error('LLM rating failed');
    }

    const result = await response.json();
    const rating = parseFloat(result.response?.trim());

    if (isNaN(rating) || rating < 1 || rating > 5) {
      console.log(`  Auto-rating unclear ("${result.response}"), using 3.0`);
      return 3.0;
    }

    return rating;
  } catch (error) {
    console.log(`  Auto-rating error: ${error.message}, using 3.0`);
    return 3.0;
  }
}

async function main() {
  const config = await parseArgs();

  console.log('[Retrieval Quality Test] Starting');
  console.log(`  Embedding model: ${config.embeddingModel}`);
  console.log(`  Top-K: ${config.topK}`);

  // Determine paths
  let embeddingsPath = config.embeddingsPath;
  let descriptionsPath = config.descriptionsPath;

  if (config.pack) {
    const packDir = config.pack === 'alaska-butter'
      ? path.join(PROJECT_ROOT, 'presets/alaska-butter')
      : path.join(PROJECT_ROOT, 'presets/full-collection');

    const prefix = config.pack === 'alaska-butter' ? 'alaskaButter' : 'butterchurnPresetsAll';

    embeddingsPath = embeddingsPath || path.join(packDir, `${prefix}.semantic.embeddings.json`);
    descriptionsPath = descriptionsPath || path.join(packDir, `${prefix}.semantic.descriptions.json`);
  }

  if (!embeddingsPath) {
    console.error('Error: Must specify --embeddings or --pack');
    process.exit(1);
  }

  // Load embeddings
  console.log(`  Loading embeddings: ${embeddingsPath}`);
  const embeddingsData = JSON.parse(await fs.readFile(embeddingsPath, 'utf-8'));
  const embeddings = embeddingsData.embeddings;
  console.log(`  Loaded ${Object.keys(embeddings).length} embeddings`);

  // Load descriptions (optional, for display)
  let descriptions = {};
  if (descriptionsPath) {
    try {
      const descriptionsData = JSON.parse(await fs.readFile(descriptionsPath, 'utf-8'));
      descriptions = descriptionsData.descriptions;
      console.log(`  Loaded ${Object.keys(descriptions).length} descriptions`);
    } catch {
      console.log('  No descriptions file found (display will be limited)');
    }
  }

  // Run retrieval tests
  const ratings = [];

  const rl = config.autoRate ? null : readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    for (const prompt of TEST_PROMPTS) {
      console.log(`\nProcessing: "${prompt}"`);

      // Embed the query
      const queryEmbedding = await embedQuery(config, prompt);

      // Find top-K similar presets
      const topK = findTopK(queryEmbedding, embeddings, config.topK);

      // Get rating
      let rating;
      if (config.autoRate) {
        rating = await autoRate(config, prompt, topK, descriptions);
        console.log(`  Auto-rated: ${rating.toFixed(1)}`);
      } else {
        rating = await promptForRating(rl, prompt, topK, descriptions);
      }

      ratings.push({ prompt, rating, topK });
    }
  } finally {
    if (rl) rl.close();
  }

  // Calculate statistics
  const meanRating = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
  const minRating = Math.min(...ratings.map(r => r.rating));
  const maxRating = Math.max(...ratings.map(r => r.rating));

  // Output results
  console.log('\n' + '='.repeat(60));
  console.log('RETRIEVAL QUALITY TEST RESULTS');
  console.log('='.repeat(60));

  console.log('\nPer-Prompt Ratings:');
  for (const r of ratings) {
    const status = r.rating >= 3.5 ? '✓' : '✗';
    console.log(`  ${status} "${r.prompt.substring(0, 40)}..." → ${r.rating.toFixed(1)}`);
  }

  console.log('\nAggregate Statistics:');
  console.log(`  Mean rating: ${meanRating.toFixed(2)}`);
  console.log(`  Min rating: ${minRating.toFixed(1)}`);
  console.log(`  Max rating: ${maxRating.toFixed(1)}`);

  // Quality gate
  const passed = meanRating >= 3.5;
  console.log('\n' + '='.repeat(60));
  if (passed) {
    console.log(`✅ QUALITY GATE PASSED: Mean ${meanRating.toFixed(2)} ≥ 3.5`);
  } else {
    console.log(`❌ QUALITY GATE FAILED: Mean ${meanRating.toFixed(2)} < 3.5`);
  }
  console.log('='.repeat(60));

  // Write results to file
  const resultsPath = path.join(
    path.dirname(embeddingsPath),
    'semantic.retrieval-quality.json'
  );

  await fs.writeFile(resultsPath, JSON.stringify({
    version: 'v1.0',
    testedAt: new Date().toISOString(),
    embeddingModel: config.embeddingModel,
    topK: config.topK,
    prompts: TEST_PROMPTS,
    ratings: ratings.map(r => ({ prompt: r.prompt, rating: r.rating })),
    meanRating,
    minRating,
    maxRating,
    passed,
  }, null, 2));

  console.log(`\nResults saved to: ${resultsPath}`);

  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
