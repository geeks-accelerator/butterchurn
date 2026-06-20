#!/usr/bin/env node

/**
 * Curate Quality Presets from butterchurnPresetsAll
 *
 * Option C: Hybrid curation approach
 *   Step 1: Hard filters (reliability + musicalResponsiveness admission)
 *   Step 2: Embedding clustering (greedy cosine) - pick best per cluster
 *   Step 3: Diversity guarantee (floors per style/energy/mood)
 *
 * Usage:
 *   node tools/curate-quality-presets.js --catalog reactive
 *   node tools/curate-quality-presets.js --catalog ambient
 *   node tools/curate-quality-presets.js --catalog all  # generates both + union
 *   node tools/curate-quality-presets.js --target 2000 --dry-run
 *
 * Catalogs:
 *   - reactive: For music videos. Motion-reactive presets (spectral_analysis,
 *               beat_detection, volume_reactive). Strict reliability (stable/rock_solid).
 *   - ambient:  For news podcasts/shorts. Calm presets (time_only, basic_audio) plus
 *               low-energy volume_reactive. Relaxed reliability (+finicky).
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Catalog-specific configuration keyed on musicalResponsiveness
const REACTIVE_TIERS = new Set(['spectral_analysis', 'beat_detection', 'volume_reactive']);
const AMBIENT_BASE_TIERS = new Set(['time_only', 'basic_audio']);

const CATALOGS = {
  reactive: {
    reliabilityTiers: ['stable', 'rock_solid'],
    keepPreset: (fp) => REACTIVE_TIERS.has(fp.musicalResponsiveness),
    target: 2000,
    similarity: 0.92,
    minPerStyle: 50,
    minPerEnergyBand: 100,
    admittedResponsiveness: ['spectral_analysis', 'beat_detection', 'volume_reactive'],
  },
  ambient: {
    reliabilityTiers: ['stable', 'rock_solid', 'finicky'],
    keepPreset: (fp) => {
      const mr = fp.musicalResponsiveness;
      if (AMBIENT_BASE_TIERS.has(mr)) return true;
      // Calm partial-reactive: volume_reactive under tight energy/style gate
      if (mr === 'volume_reactive' &&
          (fp.energy ?? 0.5) <= 0.5 &&
          (fp.visualStyle === 'organic' || fp.visualStyle === 'abstract')) {
        return true;
      }
      return false;
    },
    target: 2000,
    similarity: 0.92,
    minPerStyle: 40,        // smaller floors — time_only is style-skewed
    minPerEnergyBand: 80,
    admittedResponsiveness: ['time_only', 'basic_audio', 'volume_reactive (calm subset)'],
  },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    catalog: null,        // 'reactive' | 'ambient' | 'all' | null (legacy single file)
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
      case '--catalog':
        config.catalog = args[++i];
        if (!['reactive', 'ambient', 'all'].includes(config.catalog)) {
          console.error(`Invalid catalog: ${config.catalog}. Must be 'reactive', 'ambient', or 'all'.`);
          process.exit(1);
        }
        break;
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
  --catalog <name>      Catalog to generate: 'reactive', 'ambient', or 'all' (default: legacy single file)
  --target <n>          Target number of curated presets (default: 2000)
  --similarity <f>      Clustering similarity threshold 0-1 (default: 0.92, higher = more clusters)
  --max-per-cluster <n> Max presets to pick per cluster (default: 4)
  --min-per-style <n>   Minimum presets per visualStyle (default: 50)
  --min-per-energy <n>  Minimum presets per energy band (default: 100)
  --dry-run             Show stats without writing output
  --output <path>       Output JSON file path (overrides catalog-based naming)
  --help                Show this help

Catalogs:
  reactive    Music videos. Motion-reactive presets (spectral_analysis, beat_detection,
              volume_reactive). Strict reliability (stable/rock_solid). ~2000 presets.
  ambient     News podcasts/shorts. Calm presets (time_only, basic_audio, calm
              volume_reactive). Relaxed reliability (+finicky). ~2000 presets.
  all         Generate both catalogs + the union file (curated-presets.json).
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
  // Prefer the real `authors` array from the source fingerprint when available;
  // fall back to parsing the leading "X - Y" pattern from the name. The source
  // butterchurnPresetsAll.fingerprints.json has authors on ~99% of records, so
  // the regex path is now a last-resort safety net, not the primary signal.
  const presetObj = typeof name === 'object' && name !== null ? name : null;
  if (presetObj && Array.isArray(presetObj.authors) && presetObj.authors.length) {
    return presetObj.authors[0].toLowerCase();
  }
  const nameStr = presetObj ? presetObj.name : name;
  const match = (nameStr || '').match(/^([^-]+)\s*-/);
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

      const author = extractAuthor(preset);
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
      usedAuthors.add(extractAuthor(bestCandidate));
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

/**
 * Curate a single catalog from the full preset pool.
 * @param {Array} allMapped - All presets mapped to internal format
 * @param {Object} embeddings - Embeddings lookup object
 * @param {string} catalogName - 'reactive' | 'ambient'
 * @param {Object} catalogConfig - Per-catalog configuration from CATALOGS
 * @param {Object} cliConfig - CLI overrides (maxPerCluster, etc.)
 * @returns {Object} { curated: Array, stats: Object }
 */
function curateCatalog(allMapped, embeddings, catalogName, catalogConfig, cliConfig) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Catalog: ${catalogName}]`);
  console.log(`${'='.repeat(60)}`);

  const { reliabilityTiers, keepPreset, target, similarity, minPerStyle, minPerEnergyBand } = catalogConfig;

  // Step 1: Hard filters (reliability + musicalResponsiveness admission)
  console.log('\n[Step 1] Hard filters...');

  const filtered = allMapped.filter(p => {
    if (!reliabilityTiers.includes(p.reliabilityTier)) return false;
    if (!p.hasDescription) return false;
    // Apply catalog-specific musicalResponsiveness admission rule
    if (!keepPreset(p.fingerprint)) return false;
    return true;
  });

  console.log(`  Reliability tiers: ${reliabilityTiers.join('/')}`);
  console.log(`  After filters: ${filtered.length}`);
  console.log(`  With embeddings: ${filtered.filter(p => p.embedding).length}`);

  // Stats
  const styleCount = {};
  const tierCount = {};
  const mrCount = {};
  for (const p of filtered) {
    styleCount[p.visualStyle] = (styleCount[p.visualStyle] || 0) + 1;
    tierCount[p.reliabilityTier] = (tierCount[p.reliabilityTier] || 0) + 1;
    const mr = p.fingerprint.musicalResponsiveness || 'unknown';
    mrCount[mr] = (mrCount[mr] || 0) + 1;
  }
  console.log('\n  By visualStyle:', styleCount);
  console.log('  By reliabilityTier:', tierCount);
  console.log('  By musicalResponsiveness:', mrCount);

  // Step 2: Embedding clustering
  console.log('\n[Step 2] Embedding clustering...');

  const withEmbeddings = filtered.filter(p => p.embedding);
  const withoutEmbeddings = filtered.filter(p => !p.embedding);

  console.log(`  Clustering ${withEmbeddings.length} presets with embeddings...`);
  console.log(`  (${withoutEmbeddings.length} without embeddings will be added directly)`);

  const effectiveSimilarity = cliConfig.similarity || similarity;
  console.log(`  Similarity threshold: ${effectiveSimilarity}`);
  const clusters = greedyCluster(withEmbeddings, effectiveSimilarity);
  console.log(`  Found ${clusters.length} clusters`);

  if (clusters.length > 0) {
    const clusterSizes = clusters.map(c => c.length);
    const avgSize = clusterSizes.reduce((a, b) => a + b, 0) / clusters.length;
    const maxSize = Math.max(...clusterSizes);
    const singletons = clusterSizes.filter(s => s === 1).length;
    console.log(`  Cluster sizes: avg=${avgSize.toFixed(1)}, max=${maxSize}, singletons=${singletons}`);
  }

  const maxPerCluster = cliConfig.maxPerCluster || 4;
  console.log(`  Max picks per cluster: ${maxPerCluster}`);
  let curated = [];
  for (const cluster of clusters) {
    const picks = pickFromCluster(cluster, maxPerCluster);
    curated.push(...picks);
  }
  curated.push(...withoutEmbeddings);
  console.log(`  After clustering picks: ${curated.length}`);

  // Step 3: Diversity guarantee
  console.log('\n[Step 3] Diversity guarantee...');

  const curatedSet = new Set(curated.map(p => p.hash));
  const byStyle = {};
  const byEnergyBand = { 0: [], 1: [], 2: [], 3: [], 4: [] };

  for (const p of curated) {
    byStyle[p.visualStyle] = byStyle[p.visualStyle] || [];
    byStyle[p.visualStyle].push(p);
    byEnergyBand[energyBand(p.energy)].push(p);
  }

  const remaining = filtered.filter(p => !curatedSet.has(p.hash));
  const effectiveMinPerStyle = cliConfig.minPerStyle || minPerStyle;
  const effectiveMinPerEnergyBand = cliConfig.minPerEnergyBand || minPerEnergyBand;

  for (const style of Object.keys(styleCount)) {
    const have = byStyle[style]?.length || 0;
    const need = Math.max(0, effectiveMinPerStyle - have);
    if (need > 0) {
      const candidates = remaining.filter(p => p.visualStyle === style && !curatedSet.has(p.hash));
      const toAdd = candidates.slice(0, need);
      for (const p of toAdd) {
        curated.push(p);
        curatedSet.add(p.hash);
      }
      if (toAdd.length > 0) {
        console.log(`  Added ${toAdd.length} for style '${style}' (had ${have}, need ${effectiveMinPerStyle})`);
      }
    }
  }

  for (let band = 0; band < 5; band++) {
    const have = byEnergyBand[band]?.length || 0;
    const need = Math.max(0, effectiveMinPerEnergyBand - have);
    if (need > 0) {
      const candidates = remaining.filter(p => energyBand(p.energy) === band && !curatedSet.has(p.hash));
      const toAdd = candidates.slice(0, need);
      for (const p of toAdd) {
        curated.push(p);
        curatedSet.add(p.hash);
      }
      if (toAdd.length > 0) {
        console.log(`  Added ${toAdd.length} for energy band ${band} (had ${have}, need ${effectiveMinPerEnergyBand})`);
      }
    }
  }

  // Final stats
  console.log('\n[Results]');
  console.log(`  Total curated: ${curated.length}`);

  const finalByStyle = {};
  const finalByEnergy = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  const finalByTier = {};
  const finalByMR = {};

  for (const p of curated) {
    finalByStyle[p.visualStyle] = (finalByStyle[p.visualStyle] || 0) + 1;
    finalByEnergy[energyBand(p.energy)]++;
    finalByTier[p.reliabilityTier] = (finalByTier[p.reliabilityTier] || 0) + 1;
    const mr = p.fingerprint.musicalResponsiveness || 'unknown';
    finalByMR[mr] = (finalByMR[mr] || 0) + 1;
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

  console.log('\n  By musicalResponsiveness:');
  for (const [mr, count] of Object.entries(finalByMR).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${mr}: ${count}`);
  }

  return {
    curated,
    stats: {
      total: curated.length,
      byStyle: finalByStyle,
      byEnergy: finalByEnergy,
      byTier: finalByTier,
      byMusicalResponsiveness: finalByMR,
    },
  };
}

/**
 * Build the output JSON for a catalog.
 */
function buildCatalogOutput(curated, catalogName, catalogConfig, totalSource) {
  return {
    meta: {
      catalog: catalogName,
      generated: new Date().toISOString(),
      source: 'butterchurnPresetsAll.fingerprints.json',
      totalSource,
      totalCurated: curated.length,
      musicalResponsivenessAdmitted: catalogConfig.admittedResponsiveness,
      reliabilityTiers: catalogConfig.reliabilityTiers,
      filters: {
        clusteringThreshold: catalogConfig.similarity,
      },
      diversity: {
        minPerStyle: catalogConfig.minPerStyle,
        minPerEnergyBand: catalogConfig.minPerEnergyBand,
      },
    },
    presets: curated.map(p => ({
      hash: p.hash,
      name: p.name,
      names: p.names,
      authors: p.authors,
      catalog: catalogName,
      visualStyle: p.visualStyle,
      energy: p.energy,
      complexity: p.complexity,
      reliabilityTier: p.reliabilityTier,
      topMood: p.topMood,
      description: p.description,
      fingerprint: p.fingerprint,
    })),
  };
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

  // Map all presets to internal format (shared across catalogs)
  const allMapped = allPresets.map(([hash, preset]) => {
    const fp = preset.fingerprint || {};
    const name = preset.names?.[0] || hash;

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
      authors: Array.isArray(preset.authors) ? preset.authors : [],
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
  });

  // Determine which catalogs to generate
  const catalogsToGenerate = config.catalog === 'all'
    ? ['reactive', 'ambient']
    : config.catalog
      ? [config.catalog]
      : null; // null = legacy single-file mode

  if (catalogsToGenerate) {
    // Per-catalog mode
    const results = {};

    for (const catalogName of catalogsToGenerate) {
      const catalogConfig = CATALOGS[catalogName];
      const { curated, stats } = curateCatalog(allMapped, embeddings, catalogName, catalogConfig, config);
      results[catalogName] = { curated, stats, catalogConfig };
    }

    // Write outputs
    if (!config.dryRun) {
      for (const catalogName of catalogsToGenerate) {
        const { curated, catalogConfig } = results[catalogName];
        const outputPath = config.output && catalogsToGenerate.length === 1
          ? config.output
          : path.join(PROJECT_ROOT, `presets/full-collection/curated-${catalogName}.json`);

        const output = buildCatalogOutput(curated, catalogName, catalogConfig, allPresets.length);
        await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
        console.log(`\n[Done] Wrote ${curated.length} ${catalogName} presets to ${outputPath}`);
      }

      // If generating 'all', also create the union file for backfill:fx-flags compatibility
      if (config.catalog === 'all') {
        const allCurated = [];
        const seenHashes = new Set();

        // reactive wins crossovers (add reactive first)
        for (const catalogName of ['reactive', 'ambient']) {
          for (const p of results[catalogName].curated) {
            if (!seenHashes.has(p.hash)) {
              seenHashes.add(p.hash);
              allCurated.push({ ...p, catalog: catalogName });
            }
          }
        }

        const unionOutput = {
          meta: {
            generated: new Date().toISOString(),
            source: 'butterchurnPresetsAll.fingerprints.json',
            totalSource: allPresets.length,
            totalCurated: allCurated.length,
            catalogs: {
              reactive: results.reactive.curated.length,
              ambient: results.ambient.curated.length,
            },
            note: 'Union of reactive + ambient catalogs. Deduplicated by hash (reactive wins crossovers).',
          },
          presets: allCurated.map(p => ({
            hash: p.hash,
            name: p.name,
            names: p.names,
            authors: p.authors,
            catalog: p.catalog,
            visualStyle: p.visualStyle,
            energy: p.energy,
            complexity: p.complexity,
            reliabilityTier: p.reliabilityTier,
            topMood: p.topMood,
            description: p.description,
            fingerprint: p.fingerprint,
          })),
        };

        const unionPath = path.join(PROJECT_ROOT, 'presets/full-collection/curated-presets.json');
        await fs.writeFile(unionPath, JSON.stringify(unionOutput, null, 2));
        console.log(`\n[Done] Wrote ${allCurated.length} union presets to ${unionPath}`);
      }
    } else {
      console.log('\n[Dry run] No output written');
    }
  } else {
    // Legacy single-file mode (no --catalog flag)
    console.log('\n[Legacy mode] No --catalog flag; using default reactive config');

    const catalogConfig = CATALOGS.reactive;
    const { curated } = curateCatalog(allMapped, embeddings, 'reactive', catalogConfig, config);

    if (!config.dryRun) {
      const outputPath = config.output || path.join(PROJECT_ROOT, 'presets/full-collection/curated-presets.json');
      const output = buildCatalogOutput(curated, 'reactive', catalogConfig, allPresets.length);
      await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
      console.log(`\n[Done] Wrote ${curated.length} presets to ${outputPath}`);
    } else {
      console.log('\n[Dry run] No output written');
    }
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
