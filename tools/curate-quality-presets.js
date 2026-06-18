#!/usr/bin/env node

/**
 * Curate Quality Presets from butterchurnPresetsAll
 *
 * Option C: Hybrid curation approach
 *   Step 1: Hard filters (reliability + has description)
 *   Step 2: Embedding clustering (HDBSCAN) - pick best per cluster
 *   Step 3: Diversity guarantee (floors per style/energy/mood)
 *
 * Usage:
 *   node tools/curate-quality-presets.js
 *   node tools/curate-quality-presets.js --target 2000 --dry-run
 *   node tools/curate-quality-presets.js --output curated-presets.json
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// HDBSCAN not available in Node by default - we'll use a simpler k-means-like approach
// or cosine similarity clustering

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    target: 2000,
    minPerCluster: 2,
    maxPerCluster: 4,
    similarity: 0.92,
    minPerStyle: 50,
    minPerEnergyBand: 100,
    minPerMood: 30,
    dryRun: false,
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--target':
        config.target = parseInt(args[++i], 10);
        break;
      case '--similarity':
        config.similarity = parseFloat(args[++i]);
        break;
      case '--max-per-cluster':
        config.maxPerCluster = parseInt(args[++i], 10);
        break;
      case '--min-per-style':
        config.minPerStyle = parseInt(args[++i], 10);
        break;
      case '--min-per-energy':
        config.minPerEnergyBand = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--output':
        config.output = args[++i];
        break;
      case '--help':
        console.log(`
Usage: node curate-quality-presets.js [options]

Options:
  --target <n>          Target number of curated presets (default: 2000)
  --similarity <f>      Clustering similarity threshold 0-1 (default: 0.92, higher = more clusters)
  --max-per-cluster <n> Max presets to pick per cluster (default: 4)
  --min-per-style <n>   Minimum presets per visualStyle (default: 50)
  --min-per-energy <n>  Minimum presets per energy band (default: 100)
  --dry-run             Show stats without writing output
  --output <path>       Output JSON file path
  --help                Show this help
        `);
        process.exit(0);
    }
  }

  return config;
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Simple greedy clustering by cosine similarity
function greedyCluster(items, similarityThreshold = 0.85) {
  const clusters = [];
  const assigned = new Set();

  for (const item of items) {
    if (assigned.has(item.hash)) continue;

    // Start a new cluster
    const cluster = [item];
    assigned.add(item.hash);

    // Find similar items
    for (const other of items) {
      if (assigned.has(other.hash)) continue;
      if (!item.embedding || !other.embedding) continue;

      const sim = cosineSimilarity(item.embedding, other.embedding);
      if (sim >= similarityThreshold) {
        cluster.push(other);
        assigned.add(other.hash);
      }
    }

    clusters.push(cluster);
  }

  return clusters;
}

// Extract author from preset name (e.g., "Geiss - Waterfall" -> "Geiss")
function extractAuthor(name) {
  const match = name.match(/^([^-]+)\s*-/);
  return match ? match[1].trim().toLowerCase() : 'unknown';
}

// Pick best from cluster: spread across energy range, prefer different artists
function pickFromCluster(cluster, maxPicks = 4) {
  if (cluster.length === 0) return [];
  if (cluster.length <= maxPicks) return cluster;

  // Sort by energy
  const sorted = [...cluster].sort((a, b) => a.energy - b.energy);

  // Greedy selection: pick spread across energy, avoiding repeat authors
  const picks = [];
  const usedAuthors = new Set();

  // Calculate ideal energy targets (spread evenly)
  const energyTargets = [];
  for (let i = 0; i < maxPicks; i++) {
    energyTargets.push(i / (maxPicks - 1)); // 0, 0.5, 1 for maxPicks=3
  }

  for (const targetEnergy of energyTargets) {
    if (picks.length >= maxPicks) break;

    // Find best candidate: closest to target energy, preferring new author
    let bestCandidate = null;
    let bestScore = -Infinity;

    for (const preset of sorted) {
      if (picks.includes(preset)) continue;

      const author = extractAuthor(preset.name);
      const isNewAuthor = !usedAuthors.has(author);
      const energyDist = Math.abs(preset.energy - targetEnergy);

      // Score: prefer new author (+10), penalize energy distance
      const score = (isNewAuthor ? 10 : 0) - energyDist * 5;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = preset;
      }
    }

    if (bestCandidate) {
      picks.push(bestCandidate);
      usedAuthors.add(extractAuthor(bestCandidate.name));
    }
  }

  // If we couldn't fill all slots (rare), fill with remaining by energy
  if (picks.length < maxPicks) {
    for (const preset of sorted) {
      if (picks.length >= maxPicks) break;
      if (!picks.includes(preset)) {
        picks.push(preset);
      }
    }
  }

  return picks;
}

// Energy bands (same as curate-presets.ts)
const ENERGY_BANDS = [
  [0.0, 0.2],
  [0.2, 0.4],
  [0.4, 0.6],
  [0.6, 0.8],
  [0.8, 1.0],
];

function energyBand(e) {
  for (let i = 0; i < ENERGY_BANDS.length; i++) {
    if (e >= ENERGY_BANDS[i][0] && e < ENERGY_BANDS[i][1]) return i;
  }
  return ENERGY_BANDS.length - 1;
}

async function main() {
  const config = parseArgs();

  console.log('[Curate] Loading fingerprints...');
  const fpPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.fingerprints.json');
  const fpData = JSON.parse(await fs.readFile(fpPath, 'utf-8'));
  const allPresets = Object.entries(fpData.presets);
  console.log(`  Total presets: ${allPresets.length}`);

  // Load embeddings from sidecar
  console.log('[Curate] Loading embeddings...');
  const embPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.semantic.embeddings.json');
  let embeddings = {};
  try {
    const embData = JSON.parse(await fs.readFile(embPath, 'utf-8'));
    embeddings = embData.embeddings || {};
    console.log(`  Loaded ${Object.keys(embeddings).length} embeddings`);
  } catch (err) {
    console.log(`  No embeddings file found: ${err.message}`);
  }

  // Step 1: Hard filters
  console.log('\n[Step 1] Hard filters...');

  const ALLOWED_TIERS = ['stable', 'rock_solid'];

  const filtered = allPresets
    .map(([hash, preset]) => {
      const fp = preset.fingerprint || {};
      const name = preset.names?.[0] || hash;

      // Look up embedding by preset name (same lookup as merge script)
      let embedding = null;
      if (embeddings[hash]?.embedding) {
        embedding = embeddings[hash].embedding;
      } else if (preset.names) {
        for (const n of preset.names) {
          if (embeddings[n]?.embedding) {
            embedding = embeddings[n].embedding;
            break;
          }
        }
      }

      return {
        hash,
        name,
        names: preset.names || [name],
        reliabilityTier: fp.reliabilityTier || 'stable',
        visualStyle: fp.visualStyle || 'abstract',
        visualStyleSource: fp.visualStyleSource || 'equation',
        energy: fp.energy ?? 0.5,
        complexity: fp.complexity ?? 0.5,
        hasDescription: !!fp.semantic?.description,
        description: fp.semantic?.description || null,
        moodAffinities: fp.moodAffinities || {},
        topMood: Object.entries(fp.moodAffinities || {})
          .sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral',
        embedding,
        fingerprint: fp,
      };
    })
    .filter(p => {
      // Must be stable or rock_solid
      if (!ALLOWED_TIERS.includes(p.reliabilityTier)) return false;
      // Must have description
      if (!p.hasDescription) return false;
      return true;
    });

  console.log(`  After reliability filter (${ALLOWED_TIERS.join('/')}): ${filtered.length}`);
  console.log(`  With descriptions: ${filtered.filter(p => p.hasDescription).length}`);
  console.log(`  With embeddings: ${filtered.filter(p => p.embedding).length}`);

  // Stats before clustering
  const styleCount = {};
  const tierCount = {};
  for (const p of filtered) {
    styleCount[p.visualStyle] = (styleCount[p.visualStyle] || 0) + 1;
    tierCount[p.reliabilityTier] = (tierCount[p.reliabilityTier] || 0) + 1;
  }
  console.log('\n  By visualStyle:', styleCount);
  console.log('  By reliabilityTier:', tierCount);

  // Step 2: Embedding clustering
  console.log('\n[Step 2] Embedding clustering...');

  // Only cluster presets that have embeddings
  const withEmbeddings = filtered.filter(p => p.embedding);
  const withoutEmbeddings = filtered.filter(p => !p.embedding);

  console.log(`  Clustering ${withEmbeddings.length} presets with embeddings...`);
  console.log(`  (${withoutEmbeddings.length} without embeddings will be added directly)`);

  // Cluster by similarity (higher threshold = tighter clusters = more of them)
  console.log(`  Similarity threshold: ${config.similarity}`);
  const clusters = greedyCluster(withEmbeddings, config.similarity);
  console.log(`  Found ${clusters.length} clusters`);

  // Stats on cluster sizes
  const clusterSizes = clusters.map(c => c.length);
  const avgSize = clusterSizes.reduce((a, b) => a + b, 0) / clusters.length;
  const maxSize = Math.max(...clusterSizes);
  const singletons = clusterSizes.filter(s => s === 1).length;
  console.log(`  Cluster sizes: avg=${avgSize.toFixed(1)}, max=${maxSize}, singletons=${singletons}`);

  // Pick from each cluster (spread across energy range)
  console.log(`  Max picks per cluster: ${config.maxPerCluster}`);
  let curated = [];
  for (const cluster of clusters) {
    const picks = pickFromCluster(cluster, config.maxPerCluster);
    curated.push(...picks);
  }

  // Add presets without embeddings (they couldn't be clustered)
  curated.push(...withoutEmbeddings);

  console.log(`  After clustering picks: ${curated.length}`);

  // Step 3: Diversity guarantee
  console.log('\n[Step 3] Diversity guarantee...');

  // Check current coverage
  const curatedSet = new Set(curated.map(p => p.hash));

  const byStyle = {};
  const byEnergyBand = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  const byMood = {};

  for (const p of curated) {
    byStyle[p.visualStyle] = byStyle[p.visualStyle] || [];
    byStyle[p.visualStyle].push(p);

    byEnergyBand[energyBand(p.energy)].push(p);

    byMood[p.topMood] = byMood[p.topMood] || [];
    byMood[p.topMood].push(p);
  }

  // Fill in gaps from filtered pool (not yet curated)
  const remaining = filtered.filter(p => !curatedSet.has(p.hash));

  // Ensure minimum per style
  for (const style of Object.keys(styleCount)) {
    const have = byStyle[style]?.length || 0;
    const need = Math.max(0, config.minPerStyle - have);
    if (need > 0) {
      const candidates = remaining.filter(p => p.visualStyle === style && !curatedSet.has(p.hash));
      const toAdd = candidates.slice(0, need);
      for (const p of toAdd) {
        curated.push(p);
        curatedSet.add(p.hash);
      }
      if (toAdd.length > 0) {
        console.log(`  Added ${toAdd.length} for style '${style}' (had ${have}, need ${config.minPerStyle})`);
      }
    }
  }

  // Ensure minimum per energy band
  for (let band = 0; band < 5; band++) {
    const have = byEnergyBand[band]?.length || 0;
    const need = Math.max(0, config.minPerEnergyBand - have);
    if (need > 0) {
      const candidates = remaining.filter(p => energyBand(p.energy) === band && !curatedSet.has(p.hash));
      const toAdd = candidates.slice(0, need);
      for (const p of toAdd) {
        curated.push(p);
        curatedSet.add(p.hash);
      }
      if (toAdd.length > 0) {
        console.log(`  Added ${toAdd.length} for energy band ${band} (had ${have}, need ${config.minPerEnergyBand})`);
      }
    }
  }

  // Final stats
  console.log('\n[Results]');
  console.log(`  Total curated: ${curated.length}`);

  const finalByStyle = {};
  const finalByEnergy = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const finalByTier = {};

  for (const p of curated) {
    finalByStyle[p.visualStyle] = (finalByStyle[p.visualStyle] || 0) + 1;
    finalByEnergy[energyBand(p.energy)]++;
    finalByTier[p.reliabilityTier] = (finalByTier[p.reliabilityTier] || 0) + 1;
  }

  console.log('\n  By visualStyle:');
  for (const [style, count] of Object.entries(finalByStyle).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${style}: ${count}`);
  }

  console.log('\n  By energy band:');
  for (let i = 0; i < 5; i++) {
    const [lo, hi] = ENERGY_BANDS[i];
    console.log(`    ${lo.toFixed(1)}-${hi.toFixed(1)}: ${finalByEnergy[i]}`);
  }

  console.log('\n  By reliabilityTier:');
  for (const [tier, count] of Object.entries(finalByTier).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${tier}: ${count}`);
  }

  // Sample descriptions
  console.log('\n  Sample descriptions:');
  const samples = curated.filter(p => p.description).slice(0, 3);
  for (const p of samples) {
    console.log(`    - ${p.name.slice(0, 40)}...`);
    console.log(`      "${p.description.slice(0, 100)}..."`);
  }

  // Write output
  if (!config.dryRun) {
    const outputPath = config.output || path.join(PROJECT_ROOT, 'presets/full-collection/curated-presets.json');

    const output = {
      meta: {
        generated: new Date().toISOString(),
        source: 'butterchurnPresetsAll.fingerprints.json',
        totalSource: allPresets.length,
        totalCurated: curated.length,
        filters: {
          reliabilityTiers: ALLOWED_TIERS,
          requireDescription: true,
          clusteringThreshold: config.similarity,
          maxPerCluster: config.maxPerCluster,
        },
        diversity: {
          minPerStyle: config.minPerStyle,
          minPerEnergyBand: config.minPerEnergyBand,
        },
      },
      presets: curated.map(p => ({
        hash: p.hash,
        name: p.name,
        names: p.names,
        visualStyle: p.visualStyle,
        energy: p.energy,
        complexity: p.complexity,
        reliabilityTier: p.reliabilityTier,
        topMood: p.topMood,
        description: p.description,
        fingerprint: p.fingerprint,
      })),
    };

    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n[Done] Wrote ${curated.length} presets to ${outputPath}`);
  } else {
    console.log('\n[Dry run] No output written');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
