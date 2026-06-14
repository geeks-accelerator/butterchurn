#!/usr/bin/env node
/**
 * Orchestrate taxonomy validation for preset collection.
 *
 * Usage:
 *   node validate-taxonomy.js                    # Validate all presets
 *   node validate-taxonomy.js --sample 50        # Validate random 50
 *   node validate-taxonomy.js --llm-validate     # Include LLM tier 2
 *   node validate-taxonomy.js --preset abc123    # Validate single preset
 */

import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  RENDER_DURATION_MS: 5000,
  FRAME_INTERVAL_MS: 500,
  WARMUP_MS: 1000,
  SERVER_PORT: 8192,
  OUTPUT_DIR: path.join(__dirname, 'output'),
  FINGERPRINT_PATH: 'presets/full-collection/butterchurnPresetsAll.fingerprints.json'
};

async function renderPreset(browser, presetHash, outputDir) {
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600 });

  const framesDir = path.join(outputDir, presetHash);
  await fs.mkdir(framesDir, { recursive: true });

  try {
    await page.goto(
      `http://localhost:${CONFIG.SERVER_PORT}/test/validation-render.html?preset=${presetHash}`,
      { waitUntil: 'networkidle0', timeout: 30000 }
    );

    await new Promise(r => setTimeout(r, CONFIG.WARMUP_MS));

    let frameIndex = 0;
    const startTime = Date.now();

    while (Date.now() - startTime < CONFIG.RENDER_DURATION_MS - CONFIG.WARMUP_MS) {
      const framePath = path.join(framesDir, `frame_${String(frameIndex).padStart(3, '0')}.png`);
      await page.screenshot({ path: framePath });
      frameIndex++;
      await new Promise(r => setTimeout(r, CONFIG.FRAME_INTERVAL_MS));
    }

    return { framesDir, frameCount: frameIndex };
  } finally {
    await page.close();
  }
}

async function runPythonAnalysis(framesDir, staticTaxonomy) {
  const staticFile = path.join(framesDir, 'static-taxonomy.json');
  const outputFile = path.join(framesDir, 'render-analysis.json');

  await fs.writeFile(staticFile, JSON.stringify(staticTaxonomy, null, 2));

  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [
      path.join(__dirname, 'analyze_frames.py'),
      '--frames-dir', framesDir,
      '--static-taxonomy', staticFile,
      '--output', outputFile
    ]);

    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', async (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(await fs.readFile(outputFile, 'utf-8'));
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse analysis output: ${e.message}`));
        }
      } else {
        reject(new Error(`Python analysis failed (code ${code}): ${stderr}`));
      }
    });
  });
}

async function runLlmValidation(framesDir, presetHash, staticTaxonomy) {
  const staticFile = path.join(framesDir, 'static-taxonomy.json');
  const outputFile = path.join(framesDir, 'llm-validation.json');

  await fs.writeFile(staticFile, JSON.stringify(staticTaxonomy, null, 2));

  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [
      path.join(__dirname, 'llm_validate.py'),
      '--frames-dir', framesDir,
      '--preset-hash', presetHash,
      '--static-taxonomy', staticFile,
      '--output', outputFile
    ]);

    let stderr = '';
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', async (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(await fs.readFile(outputFile, 'utf-8'));
          resolve(result);
        } catch (e) {
          reject(new Error(`Failed to parse LLM output: ${e.message}`));
        }
      } else {
        reject(new Error(`LLM validation failed (code ${code}): ${stderr}`));
      }
    });
  });
}

function parseArgs(args) {
  const result = {
    sampleSize: null,
    useLlm: false,
    singlePreset: null,
    help: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--sample':
        result.sampleSize = parseInt(args[++i], 10);
        break;
      case '--llm-validate':
        result.useLlm = true;
        break;
      case '--preset':
        result.singlePreset = args[++i];
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
    }
  }

  return result;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    console.log(`
Usage: node validate-taxonomy.js [options]

Options:
  --sample N        Validate random N presets (default: all)
  --llm-validate    Include LLM tier 2 validation (10% sample + mismatches)
  --preset HASH     Validate single preset by hash
  -h, --help        Show this help

Prerequisites:
  1. Start server: python3 -m http.server 8192 (from butterchurn root)
  2. Install Python deps: pip install colorthief opencv-python-headless numpy pillow anthropic
  3. For LLM validation: export ANTHROPIC_API_KEY=...
`);
    process.exit(0);
  }

  const llmSampleRate = 0.1;

  console.log('Loading fingerprint database...');
  const dbPath = path.join(process.cwd(), CONFIG.FINGERPRINT_PATH);

  let db;
  try {
    db = JSON.parse(await fs.readFile(dbPath, 'utf-8'));
  } catch (e) {
    console.error(`Failed to load fingerprint database: ${e.message}`);
    console.error(`Expected at: ${dbPath}`);
    console.error('Run from butterchurn root directory.');
    process.exit(1);
  }

  let presetHashes = opts.singlePreset ? [opts.singlePreset] : Object.keys(db.presets);

  if (opts.sampleSize && !opts.singlePreset) {
    presetHashes = presetHashes
      .sort(() => Math.random() - 0.5)
      .slice(0, opts.sampleSize);
  }

  console.log(`Validating ${presetHashes.length} presets...`);
  if (opts.useLlm) {
    console.log(`LLM validation enabled (${Math.round(llmSampleRate * 100)}% sample + mismatches)`);
  }

  await fs.mkdir(CONFIG.OUTPUT_DIR, { recursive: true });

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < presetHashes.length; i++) {
    const hash = presetHashes[i];
    const preset = db.presets[hash];

    if (!preset) {
      console.log(`[${i + 1}/${presetHashes.length}] SKIP: ${hash} not found in database`);
      results.push({ hash, error: 'Not found in database' });
      continue;
    }

    const presetName = preset.names?.[0] || hash;
    const progress = `[${i + 1}/${presetHashes.length}]`;

    console.log(`${progress} Processing ${hash} (${presetName.substring(0, 40)}...)`);

    try {
      const { framesDir, frameCount } = await renderPreset(browser, hash, CONFIG.OUTPUT_DIR);
      console.log(`  Captured ${frameCount} frames`);

      const staticTaxonomy = preset.fingerprint || {};
      const analysis = await runPythonAnalysis(framesDir, staticTaxonomy);
      console.log(`  Analysis: ${analysis.comparison?.confidence || 'N/A'} confidence`);

      let llmResult = null;
      if (opts.useLlm) {
        const isMismatch = analysis.comparison?.confidence === 'LOW';
        const isRandomSample = Math.random() < llmSampleRate;

        if (isMismatch || isRandomSample) {
          console.log(`  Running LLM validation (${isMismatch ? 'mismatch' : 'sample'})...`);
          try {
            llmResult = await runLlmValidation(framesDir, hash, staticTaxonomy);
            console.log(`  LLM: ${llmResult.confidence || 'N/A'} confidence`);
          } catch (e) {
            console.log(`  LLM validation failed: ${e.message}`);
            llmResult = { error: e.message };
          }
        }
      }

      results.push({
        hash,
        name: presetName,
        static_taxonomy: staticTaxonomy,
        render_analysis: analysis,
        llm_validation: llmResult,
        validation_confidence: analysis.comparison?.confidence || 'UNKNOWN'
      });
    } catch (error) {
      console.log(`  ERROR: ${error.message}`);
      results.push({
        hash,
        name: presetName,
        error: error.message
      });
    }
  }

  await browser.close();

  const reportPath = path.join(CONFIG.OUTPUT_DIR, 'validation-report.json');
  await fs.writeFile(reportPath, JSON.stringify(results, null, 2));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const successful = results.filter(r => !r.error);
  const highConf = successful.filter(r => r.validation_confidence === 'HIGH');
  const medConf = successful.filter(r => r.validation_confidence === 'MEDIUM');
  const lowConf = successful.filter(r => r.validation_confidence === 'LOW');
  const errors = results.filter(r => r.error);

  console.log('\n' + '='.repeat(60));
  console.log('VALIDATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total presets:     ${results.length}`);
  console.log(`Successful:        ${successful.length}`);
  console.log(`Errors:            ${errors.length}`);
  console.log(`Time elapsed:      ${elapsed}s`);
  console.log('');
  console.log('Validation Confidence:');
  console.log(`  HIGH:   ${highConf.length} (${successful.length ? (highConf.length/successful.length*100).toFixed(1) : 0}%)`);
  console.log(`  MEDIUM: ${medConf.length} (${successful.length ? (medConf.length/successful.length*100).toFixed(1) : 0}%)`);
  console.log(`  LOW:    ${lowConf.length} (${successful.length ? (lowConf.length/successful.length*100).toFixed(1) : 0}%)`);
  console.log('');
  console.log(`Report saved to: ${reportPath}`);

  if (lowConf.length > 0) {
    console.log('\nLow-confidence presets (need review):');
    lowConf.slice(0, 10).forEach(r => {
      console.log(`  ${r.hash}: ${r.name?.substring(0, 50)}`);
      const comp = r.render_analysis?.comparison?.comparisons;
      if (comp) {
        Object.entries(comp).forEach(([dim, data]) => {
          if (!data.match) {
            console.log(`    ${dim}: static=${data.static} vs rendered=${data.rendered}`);
          }
        });
      }
    });
    if (lowConf.length > 10) {
      console.log(`  ... and ${lowConf.length - 10} more`);
    }
  }

  const matchRate = highConf.length / Math.max(1, successful.length);
  if (matchRate < 0.7) {
    console.log(`\nWARNING: Match rate ${(matchRate * 100).toFixed(1)}% below 70% — investigate`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
