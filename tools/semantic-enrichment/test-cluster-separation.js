#!/usr/bin/env node

/**
 * Semantic Enrichment: Cluster Separation Test
 * Phase 6.1: Validate that embeddings have meaningful structure
 *
 * Quality gate: Mean cosine similarity of "similar" pairs > mean of random pairs by ≥0.15
 *
 * Usage:
 *   node tools/semantic-enrichment/test-cluster-separation.js --pack alaska-butter
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Configuration
const SIMILAR_PAIRS_COUNT = 50;
const RANDOM_PAIRS_COUNT = 50;
const SEPARATION_THRESHOLD = 0.15;

async function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--embeddings':
        config.embeddingsPath = args[++i];
        break;
      case '--pack':
        config.pack = args[++i];
        break;
      case '--help':
        console.log(`
Usage: node test-cluster-separation.js [options]

Options:
  --embeddings <path>   Embeddings JSON file
  --pack <name>         Preset pack name (infers paths)
  --help                Show this help message

Quality Gate: Similar-pair mean - random-pair mean ≥ 0.15
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

function findSimilarPairs(embeddings, count) {
  // Find pairs that are most similar by embedding
  // These represent "should be similar" pairs - if embeddings work, high similarity is expected
  const presetNames = Object.keys(embeddings);
  const pairs = [];

  // Compute all pairwise similarities and take top N
  const allPairs = [];

  for (let i = 0; i < presetNames.length; i++) {
    for (let j = i + 1; j < presetNames.length; j++) {
      const embA = embeddings[presetNames[i]].embedding;
      const embB = embeddings[presetNames[j]].embedding;

      if (!embA || !embB) continue;

      const sim = cosineSimilarity(embA, embB);
      allPairs.push({
        a: presetNames[i],
        b: presetNames[j],
        similarity: sim,
      });
    }
  }

  // Sort by similarity descending and take top count
  allPairs.sort((x, y) => y.similarity - x.similarity);

  return allPairs.slice(0, count);
}

function selectRandomPairs(embeddings, count) {
  const presetNames = Object.keys(embeddings).filter(n => embeddings[n].embedding);
  const pairs = [];
  const seen = new Set();

  while (pairs.length < count && pairs.length < (presetNames.length * (presetNames.length - 1)) / 2) {
    const i = Math.floor(Math.random() * presetNames.length);
    const j = Math.floor(Math.random() * presetNames.length);

    if (i === j) continue;

    const key = [i, j].sort().join('-');
    if (seen.has(key)) continue;
    seen.add(key);

    const embA = embeddings[presetNames[i]].embedding;
    const embB = embeddings[presetNames[j]].embedding;

    if (!embA || !embB) continue;

    const sim = cosineSimilarity(embA, embB);
    pairs.push({
      a: presetNames[i],
      b: presetNames[j],
      similarity: sim,
    });
  }

  return pairs;
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const squaredDiffs = values.map(v => (v - m) ** 2);
  return Math.sqrt(mean(squaredDiffs));
}

async function main() {
  const config = await parseArgs();

  console.log('[Cluster Separation Test] Starting');

  // Determine paths
  let embeddingsPath = config.embeddingsPath;

  if (config.pack) {
    const packDir = config.pack === 'alaska-butter'
      ? path.join(PROJECT_ROOT, 'presets/alaska-butter')
      : path.join(PROJECT_ROOT, 'presets/full-collection');

    const prefix = config.pack === 'alaska-butter' ? 'alaskaButter' : 'butterchurnPresetsAll';
    embeddingsPath = embeddingsPath || path.join(packDir, `${prefix}.semantic.embeddings.json`);
  }

  if (!embeddingsPath) {
    console.error('Error: Must specify --embeddings or --pack');
    process.exit(1);
  }

  // Load embeddings
  console.log(`  Loading embeddings: ${embeddingsPath}`);
  const embeddingsData = JSON.parse(await fs.readFile(embeddingsPath, 'utf-8'));
  const embeddings = embeddingsData.embeddings;
  const presetCount = Object.keys(embeddings).length;
  console.log(`  Loaded ${presetCount} embeddings`);

  if (presetCount < 20) {
    console.error('Error: Need at least 20 presets for meaningful cluster analysis');
    process.exit(1);
  }

  // Find similar pairs (top-N by embedding similarity)
  console.log(`\n  Finding ${SIMILAR_PAIRS_COUNT} most similar pairs...`);
  const similarPairs = findSimilarPairs(embeddings, SIMILAR_PAIRS_COUNT);
  const similarSims = similarPairs.map(p => p.similarity);

  // Select random pairs
  console.log(`  Selecting ${RANDOM_PAIRS_COUNT} random pairs...`);
  const randomPairs = selectRandomPairs(embeddings, RANDOM_PAIRS_COUNT);
  const randomSims = randomPairs.map(p => p.similarity);

  // Calculate statistics
  const similarMean = mean(similarSims);
  const similarStd = stdDev(similarSims);
  const randomMean = mean(randomSims);
  const randomStd = stdDev(randomSims);
  const separation = similarMean - randomMean;

  // Output results
  console.log('\n' + '='.repeat(60));
  console.log('CLUSTER SEPARATION TEST RESULTS');
  console.log('='.repeat(60));

  console.log('\nSimilar Pairs (top by embedding similarity):');
  console.log(`  Count: ${similarPairs.length}`);
  console.log(`  Mean similarity: ${similarMean.toFixed(4)}`);
  console.log(`  Std dev: ${similarStd.toFixed(4)}`);
  console.log(`  Range: [${Math.min(...similarSims).toFixed(4)}, ${Math.max(...similarSims).toFixed(4)}]`);

  console.log('\nRandom Pairs:');
  console.log(`  Count: ${randomPairs.length}`);
  console.log(`  Mean similarity: ${randomMean.toFixed(4)}`);
  console.log(`  Std dev: ${randomStd.toFixed(4)}`);
  console.log(`  Range: [${Math.min(...randomSims).toFixed(4)}, ${Math.max(...randomSims).toFixed(4)}]`);

  console.log('\nSeparation:');
  console.log(`  Similar mean - Random mean = ${separation.toFixed(4)}`);

  // Quality gate
  const passed = separation >= SEPARATION_THRESHOLD;
  console.log('\n' + '='.repeat(60));
  if (passed) {
    console.log(`✅ QUALITY GATE PASSED: Separation ${separation.toFixed(4)} ≥ ${SEPARATION_THRESHOLD}`);
  } else {
    console.log(`❌ QUALITY GATE FAILED: Separation ${separation.toFixed(4)} < ${SEPARATION_THRESHOLD}`);
  }
  console.log('='.repeat(60));

  // Top 5 similar pairs for reference
  console.log('\nTop 5 most similar pairs:');
  for (let i = 0; i < Math.min(5, similarPairs.length); i++) {
    const p = similarPairs[i];
    console.log(`  ${i + 1}. ${p.a.substring(0, 30)}... ↔ ${p.b.substring(0, 30)}...`);
    console.log(`     Similarity: ${p.similarity.toFixed(4)}`);
  }

  // Write results to file
  const resultsPath = path.join(
    path.dirname(embeddingsPath),
    'semantic.cluster-separation.json'
  );

  await fs.writeFile(resultsPath, JSON.stringify({
    version: 'v1.0',
    testedAt: new Date().toISOString(),
    presetCount,
    similarPairsCount: similarPairs.length,
    randomPairsCount: randomPairs.length,
    similarMean,
    similarStd,
    randomMean,
    randomStd,
    separation,
    threshold: SEPARATION_THRESHOLD,
    passed,
    topSimilarPairs: similarPairs.slice(0, 10),
  }, null, 2));

  console.log(`\nResults saved to: ${resultsPath}`);

  process.exit(passed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
