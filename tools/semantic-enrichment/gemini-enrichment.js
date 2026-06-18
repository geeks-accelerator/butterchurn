#!/usr/bin/env node

/**
 * Gemini Semantic Enrichment Pipeline
 * Phase 6.8: Fast cloud-based enrichment for butterchurnPresetsAll (21,687 presets)
 *
 * Uses Google Gemini 2.5 Flash for vision descriptions.
 * Estimated time: ~7 minutes with 50 concurrent requests.
 * Estimated cost: ~$7.50
 *
 * Usage:
 *   export GOOGLE_AI_API_KEY=your-api-key
 *   node tools/semantic-enrichment/gemini-enrichment.js --concurrency 50
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const PROMPT = `Describe this music visualizer preset based on this frame. Include:
- Visual appearance (shapes, patterns, textures, motion implied)
- Color palette and dominant hues
- Mood or atmosphere evoked
- Any specific imagery or metaphors it brings to mind

Be specific and vivid. 2-4 sentences.`;

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
            if (queue.length > 0) queue.shift()();
        }
    };
}

async function describeFrameGemini(framePath, apiKey, retries = 3) {
    const imageBuffer = await fs.readFile(framePath);
    const imageBase64 = imageBuffer.toString('base64');

    const payload = {
        contents: [{
            parts: [
                { text: PROMPT },
                { inline_data: { mime_type: 'image/png', data: imageBase64 } }
            ]
        }],
        generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.7,
        }
    };

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (response.status === 429) {
                // Rate limited - wait and retry
                const waitTime = Math.pow(2, attempt) * 1000;
                console.log(`  Rate limited, waiting ${waitTime}ms...`);
                await new Promise(r => setTimeout(r, waitTime));
                continue;
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini API error ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (!text) {
                throw new Error('Empty response from Gemini');
            }
            return text;
        } catch (e) {
            if (attempt === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    let concurrency = 50;
    let limit = null;
    let offset = 0;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--concurrency') concurrency = parseInt(args[++i], 10);
        if (args[i] === '--limit') limit = parseInt(args[++i], 10);
        if (args[i] === '--offset') offset = parseInt(args[++i], 10);
        if (args[i] === '--help') {
            console.log(`
Usage: node gemini-enrichment.js [options]

Options:
  --concurrency <n>  Concurrent API requests (default: 50)
  --limit <n>        Process only N presets
  --offset <n>       Skip first N presets
  --help             Show this help

Prerequisites:
  export GOOGLE_AI_API_KEY=your-api-key

Cost estimate: ~$7.50 for 21,687 presets using gemini-2.5-flash
            `);
            process.exit(0);
        }
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error('ERROR: GOOGLE_AI_API_KEY or GEMINI_API_KEY environment variable not set');
        console.error('Get an API key at: https://aistudio.google.com/apikey');
        process.exit(1);
    }

    console.log('[Gemini Pipeline] Semantic Enrichment');
    console.log(`  Model: ${GEMINI_MODEL}`);
    console.log(`  Concurrency: ${concurrency}`);

    // Load presets and fingerprints
    const presetPackPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.json');
    const fingerprintsPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.fingerprints.json');
    const framesDir = path.join(PROJECT_ROOT, 'presets/imports/frames');
    const descriptionsPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.semantic.descriptions.json');

    console.log('  Loading presets...');
    const presetPack = JSON.parse(await fs.readFile(presetPackPath, 'utf-8'));
    const fingerprints = JSON.parse(await fs.readFile(fingerprintsPath, 'utf-8'));

    // Load existing descriptions for resume
    let existingDescriptions = {};
    try {
        const existing = JSON.parse(await fs.readFile(descriptionsPath, 'utf-8'));
        existingDescriptions = existing.descriptions || {};
        console.log(`  Resuming: ${Object.keys(existingDescriptions).length} existing descriptions`);
    } catch { /* starting fresh */ }

    // Build work list - only presets with rendered frames
    let presetList = Object.entries(presetPack).map(([name, data]) => {
        const safeName = name.replace(/[^a-z0-9]/gi, '_').substring(0, 100);
        const framePath = path.join(framesDir, `${safeName}_0.png`);
        return {
            name,
            safeName,
            framePath,
            hash: fingerprints.presets?.[name]?.fingerprint?.hash || fingerprints.presets?.[name]?.hash,
            hasFrame: existsSync(framePath),
        };
    });

    // Filter: need frame, not already processed
    presetList = presetList.filter(p => p.hasFrame && !existingDescriptions[p.name]);

    const totalWithFrames = presetList.length + Object.keys(existingDescriptions).length;
    console.log(`  Total presets: ${Object.keys(presetPack).length}`);
    console.log(`  With frames: ${totalWithFrames}`);
    console.log(`  Already processed: ${Object.keys(existingDescriptions).length}`);
    console.log(`  Remaining: ${presetList.length}`);

    // Apply offset/limit
    if (offset) presetList = presetList.slice(offset);
    if (limit) presetList = presetList.slice(0, limit);
    console.log(`  Processing: ${presetList.length} presets`);

    if (presetList.length === 0) {
        console.log('[Gemini Pipeline] All presets already processed!');
        return;
    }

    // Process presets
    const results = { ...existingDescriptions };
    const errors = [];
    let processed = 0;
    const startTime = Date.now();

    const limiter = createConcurrencyLimiter(concurrency);

    console.log('\n[Gemini Pipeline] Starting...');

    const processPreset = async (preset) => {
        return limiter(async () => {
            try {
                const description = await describeFrameGemini(preset.framePath, apiKey);

                // Add result immediately
                results[preset.name] = {
                    hash: preset.hash,
                    description: description,
                };

                processed++;

                // Progress
                if (processed % 100 === 0) {
                    const elapsed = (Date.now() - startTime) / 1000;
                    const rate = processed / elapsed;
                    const remaining = (presetList.length - processed) / rate;
                    const pct = Math.round((processed / presetList.length) * 100);
                    console.log(`  [${processed}/${presetList.length}] ${pct}% | ${rate.toFixed(1)}/s | ETA: ${formatTime(remaining)}`);

                    // Checkpoint
                    await saveResults(descriptionsPath, results, errors);
                }

                return { presetName: preset.name, success: true };
            } catch (e) {
                errors.push({ presetName: preset.name, error: e.message });
                return { presetName: preset.name, success: false, error: e.message };
            }
        });
    };

    // Process all in parallel
    const promises = presetList.map(preset => processPreset(preset));
    await Promise.all(promises);

    // Final save
    await saveResults(descriptionsPath, results, errors);

    // Summary
    const totalTime = (Date.now() - startTime) / 1000;
    console.log('\n[Gemini Pipeline] Complete!');
    console.log(`  Success: ${Object.keys(results).length}`);
    console.log(`  Errors: ${errors.length}`);
    console.log(`  Total time: ${formatTime(totalTime)}`);
    console.log(`  Rate: ${(processed / totalTime).toFixed(2)} presets/sec`);

    // Estimate cost
    const inputTokens = processed * 308; // ~258 image + 50 prompt
    const outputTokens = processed * 100;
    const inputCost = (inputTokens / 1_000_000) * 0.30;
    const outputCost = (outputTokens / 1_000_000) * 2.50;
    console.log(`  Est. cost: $${(inputCost + outputCost).toFixed(2)}`);
}

async function saveResults(outputPath, results, errors) {
    const output = {
        version: 'v1.0',
        generatedAt: new Date().toISOString(),
        backend: 'gemini',
        visionModel: GEMINI_MODEL,
        promptVersion: 'v1',
        totalPresets: Object.keys(results).length,
        successCount: Object.keys(results).length,
        errorCount: errors.length,
        descriptions: results,
    };

    if (errors.length > 0) {
        output.errors = errors.slice(-100);
    }

    await fs.writeFile(outputPath, JSON.stringify(output, null, 2));
    console.log(`  [Checkpoint] Saved ${Object.keys(results).length} descriptions`);
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
