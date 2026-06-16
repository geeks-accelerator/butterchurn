#!/usr/bin/env node

/**
 * Semantic Enrichment: Merge Semantic Data into Fingerprints
 * Merges descriptions and embeddings back into the fingerprint file
 *
 * Usage:
 *   node tools/semantic-enrichment/merge-semantic-data.js --pack alaska-butter
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const SEMANTIC_MODEL_VERSION = 'llama3.2-vision-11b@v1.0 + nomic-embed-text@v1.0 + prompt@v1';

async function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pack':
        config.pack = args[++i];
        break;
      case '--fingerprints':
        config.fingerprintsPath = args[++i];
        break;
      case '--descriptions':
        config.descriptionsPath = args[++i];
        break;
      case '--embeddings':
        config.embeddingsPath = args[++i];
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--help':
        console.log(`
Usage: node merge-semantic-data.js [options]

Options:
  --pack <name>         Preset pack name (infers paths)
  --fingerprints <path> Fingerprints JSON file
  --descriptions <path> Descriptions JSON file
  --embeddings <path>   Embeddings JSON file
  --dry-run             Show what would be merged without writing
  --help                Show this help message
        `);
        process.exit(0);
    }
  }

  return config;
}

async function main() {
  const config = await parseArgs();

  console.log('[Semantic Merge] Starting');

  // Determine paths
  let fingerprintsPath = config.fingerprintsPath;
  let descriptionsPath = config.descriptionsPath;
  let embeddingsPath = config.embeddingsPath;

  if (config.pack) {
    const packDir = config.pack === 'alaska-butter'
      ? path.join(PROJECT_ROOT, 'presets/alaska-butter')
      : path.join(PROJECT_ROOT, 'presets/full-collection');

    const prefix = config.pack === 'alaska-butter' ? 'alaskaButter' : 'butterchurnPresetsAll';

    fingerprintsPath = fingerprintsPath || path.join(packDir, `${prefix}.fingerprints.json`);
    descriptionsPath = descriptionsPath || path.join(packDir, `${prefix}.semantic.descriptions.json`);
    embeddingsPath = embeddingsPath || path.join(packDir, `${prefix}.semantic.embeddings.json`);
  }

  console.log(`  Fingerprints: ${fingerprintsPath}`);
  console.log(`  Descriptions: ${descriptionsPath}`);
  console.log(`  Embeddings: ${embeddingsPath}`);

  // Load fingerprints
  const fpData = JSON.parse(await fs.readFile(fingerprintsPath, 'utf-8'));
  const presets = fpData.presets;
  console.log(`  Loaded ${Object.keys(presets).length} fingerprints`);

  // Load descriptions
  let descriptions = {};
  try {
    const descData = JSON.parse(await fs.readFile(descriptionsPath, 'utf-8'));
    descriptions = descData.descriptions || {};
    console.log(`  Loaded ${Object.keys(descriptions).length} descriptions`);
  } catch (error) {
    console.log(`  No descriptions file found: ${error.message}`);
  }

  // Load embeddings
  let embeddings = {};
  try {
    const embData = JSON.parse(await fs.readFile(embeddingsPath, 'utf-8'));
    embeddings = embData.embeddings || {};
    console.log(`  Loaded ${Object.keys(embeddings).length} embeddings`);
  } catch (error) {
    console.log(`  No embeddings file found: ${error.message}`);
  }

  // Merge into fingerprints
  let mergedCount = 0;
  let descOnlyCount = 0;
  let embOnlyCount = 0;
  let skippedCount = 0;

  for (const [presetName, preset] of Object.entries(presets)) {
    const desc = descriptions[presetName];
    const emb = embeddings[presetName];

    if (!desc && !emb) {
      skippedCount++;
      continue;
    }

    // Add semantic field to fingerprint
    preset.fingerprint.semantic = {
      semanticModelVersion: SEMANTIC_MODEL_VERSION,
    };

    if (desc?.description) {
      preset.fingerprint.semantic.description = desc.description;
      descOnlyCount++;
    }

    if (emb?.embedding) {
      preset.fingerprint.semantic.embedding = emb.embedding;
      preset.fingerprint.embedding = emb.embedding; // Also add at top level for matcher access
      embOnlyCount++;
    }

    if (desc?.description && emb?.embedding) {
      mergedCount++;
      descOnlyCount--;
      embOnlyCount--;
    }
  }

  console.log('\n[Merge Summary]');
  console.log(`  Full merge (desc + emb): ${mergedCount}`);
  console.log(`  Description only: ${descOnlyCount}`);
  console.log(`  Embedding only: ${embOnlyCount}`);
  console.log(`  Skipped (no data): ${skippedCount}`);
  console.log(`  Total enriched: ${mergedCount + descOnlyCount + embOnlyCount}`);

  // Write updated fingerprints
  if (config.dryRun) {
    console.log('\n[DRY RUN] Would write to:', fingerprintsPath);
  } else {
    // Update version to indicate semantic enrichment
    fpData.semanticEnrichmentVersion = SEMANTIC_MODEL_VERSION;
    fpData.semanticEnrichmentDate = new Date().toISOString();

    await fs.writeFile(fingerprintsPath, JSON.stringify(fpData, null, 2));
    console.log(`\nWrote updated fingerprints to: ${fingerprintsPath}`);

    // Calculate file size
    const stats = await fs.stat(fingerprintsPath);
    console.log(`  File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
