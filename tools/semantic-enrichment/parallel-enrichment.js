#!/usr/bin/env node

/**
 * Parallel Semantic Enrichment Pipeline
 * Phase 6.8: Fast enrichment for butterchurnPresetsAll (21,687 presets)
 *
 * Orchestrates parallel frame rendering + MLX-VLM description generation.
 * Estimated time: 8-12 hours on M4 Max with 4 render workers + 8 MLX concurrency.
 *
 * Usage:
 *   # Start MLX server first:
 *   source .venv-mlx/bin/activate && mlx_vlm.server --port 8080 --model mlx-community/Qwen2.5-VL-7B-Instruct-4bit
 *
 *   # Then run pipeline:
 *   node tools/semantic-enrichment/parallel-enrichment.js --workers 4 --concurrency 8
 */

import puppeteer from 'puppeteer';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { readFileSync, existsSync } from 'fs';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const FRAME_SIZE = 512;
const MLX_URL = 'http://localhost:8080';
const MLX_MODEL = 'mlx-community/Qwen2-VL-7B-Instruct-8bit';

const SYSTEM_PROMPT = `You are a visual analyst describing music visualizer frames. Your descriptions will be used to create searchable embeddings, so be specific and vivid. Focus on what makes this visual unique.`;

const USER_PROMPT = `Describe this music visualizer preset based on this frame. Include:
- Visual appearance (shapes, patterns, textures, motion implied)
- Color palette and dominant hues
- Mood or atmosphere evoked
- Any specific imagery or metaphors it brings to mind

Be specific and vivid. 2-4 sentences.`;

// Simple HTTP server for serving files
function createServer(port) {
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.png': 'image/png',
        '.css': 'text/css'
    };

    const server = http.createServer((req, res) => {
        let filePath = path.join(PROJECT_ROOT, req.url === '/' ? 'test/preset-render-test.html' : req.url);

        if (!existsSync(filePath)) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        const ext = path.extname(filePath);
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        try {
            const content = readFileSync(filePath);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        } catch (e) {
            res.writeHead(500);
            res.end('Error reading file');
        }
    });

    return new Promise((resolve) => {
        server.listen(port, () => resolve(server));
    });
}

async function renderSingleFrame(browser, page, presetName, presetData, outputDir) {
    const safeName = presetName.replace(/[^a-z0-9]/gi, '_').substring(0, 100);
    const framePath = path.join(outputDir, `${safeName}_0.png`);

    // Check if already rendered
    if (existsSync(framePath)) {
        return { presetName, framePath, cached: true };
    }

    try {
        // Load preset
        await page.evaluate((name, data) => {
            if (window.visualizer) {
                window.visualizer.loadPreset(data, 0);
            }
        }, presetName, presetData);

        // Wait for preset to stabilize
        await new Promise(r => setTimeout(r, 300));

        // Force a render with simulated audio
        await page.evaluate(() => {
            if (window.visualizer && window.visualizer.render) {
                const fakeAudio = {
                    timeByteArray: new Uint8Array(2048).fill(128),
                    timeByteArrayL: new Uint8Array(2048).fill(128),
                    timeByteArrayR: new Uint8Array(2048).fill(128)
                };
                for (let i = 0; i < 512; i++) {
                    fakeAudio.timeByteArray[i] = 128 + Math.sin(i / 20) * 50;
                }
                window.visualizer.render({ audioLevels: fakeAudio });
            }
        });

        await page.screenshot({
            path: framePath,
            clip: { x: 50, y: 50, width: FRAME_SIZE, height: FRAME_SIZE },
            omitBackground: true
        });

        return { presetName, framePath, cached: false };
    } catch (e) {
        return { presetName, error: e.message };
    }
}

async function describeFrame(framePath, retries = 3) {
    const imageBuffer = await fs.readFile(framePath);
    const imageBase64 = imageBuffer.toString('base64');
    const imageUrl = `data:image/png;base64,${imageBase64}`;

    const payload = {
        model: MLX_MODEL,
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: imageUrl } },
                    { type: 'text', text: USER_PROMPT },
                ],
            },
        ],
        max_tokens: 200,
        temperature: 0.7,
    };

    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const response = await fetch(`${MLX_URL}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(`MLX API error: ${response.status}`);
            }

            const result = await response.json();
            return result.choices?.[0]?.message?.content?.trim() || '';
        } catch (e) {
            if (attempt === retries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
    }
}

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

async function main() {
    const args = process.argv.slice(2);
    let numWorkers = 4;
    let mlxConcurrency = 8;
    let limit = null;
    let offset = 0;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--workers') numWorkers = parseInt(args[++i], 10);
        if (args[i] === '--concurrency') mlxConcurrency = parseInt(args[++i], 10);
        if (args[i] === '--limit') limit = parseInt(args[++i], 10);
        if (args[i] === '--offset') offset = parseInt(args[++i], 10);
        if (args[i] === '--help') {
            console.log(`
Usage: node parallel-enrichment.js [options]

Options:
  --workers <n>      Number of parallel browser workers (default: 4)
  --concurrency <n>  MLX description concurrency (default: 8)
  --limit <n>        Process only N presets
  --offset <n>       Skip first N presets
  --help             Show this help

Prerequisites:
  1. Start MLX server:
     source .venv-mlx/bin/activate
     mlx_vlm.server --port 8080 --model mlx-community/Qwen2.5-VL-7B-Instruct-4bit

  2. Run this pipeline:
     node tools/semantic-enrichment/parallel-enrichment.js --workers 4 --concurrency 8
            `);
            process.exit(0);
        }
    }

    console.log('[Pipeline] Parallel Semantic Enrichment');
    console.log(`  Workers: ${numWorkers}`);
    console.log(`  MLX concurrency: ${mlxConcurrency}`);

    // Check MLX server
    try {
        const healthCheck = await fetch(`${MLX_URL}/health`).catch(() => null);
        if (!healthCheck?.ok) {
            console.error('ERROR: MLX server not running. Start it with:');
            console.error('  source .venv-mlx/bin/activate && mlx_vlm.server --port 8080 --model mlx-community/Qwen2.5-VL-7B-Instruct-4bit');
            process.exit(1);
        }
    } catch {
        console.log('  MLX server health check skipped (no /health endpoint)');
    }

    // Load presets
    const presetPackPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.json');
    const fingerprintsPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.fingerprints.json');
    const outputDir = path.join(PROJECT_ROOT, 'presets/full-collection/frames');
    const descriptionsPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.semantic.descriptions.json');

    await fs.mkdir(outputDir, { recursive: true });

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

    // Build work list
    let presetList = Object.entries(presetPack).map(([name, data]) => ({
        name,
        data,
        hash: fingerprints.presets?.[name]?.fingerprint?.hash || fingerprints.presets?.[name]?.hash,
    }));

    // Filter already processed
    presetList = presetList.filter(p => !existingDescriptions[p.name]);
    console.log(`  Total presets: ${Object.keys(presetPack).length}`);
    console.log(`  Remaining: ${presetList.length}`);

    // Apply offset/limit
    if (offset) presetList = presetList.slice(offset);
    if (limit) presetList = presetList.slice(0, limit);
    console.log(`  Processing: ${presetList.length} presets`);

    if (presetList.length === 0) {
        console.log('[Pipeline] All presets already processed!');
        return;
    }

    // Start servers for each worker (different ports)
    const servers = [];
    const browsers = [];
    const pages = [];
    const basePort = 8700;

    console.log('  Starting browser workers...');
    for (let w = 0; w < numWorkers; w++) {
        const port = basePort + w;
        const server = await createServer(port);
        servers.push(server);

        const browser = await puppeteer.launch({
            headless: 'new',
            protocolTimeout: 60000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--use-angle=swiftshader',
                '--enable-webgl',
                '--ignore-gpu-blocklist',
                '--disable-dev-shm-usage'
            ]
        });
        browsers.push(browser);

        const page = await browser.newPage();
        await page.setViewport({ width: FRAME_SIZE + 100, height: FRAME_SIZE + 100 });
        await page.goto(`http://localhost:${port}/test/preset-render-test.html`, { waitUntil: 'networkidle0' });
        await page.waitForFunction(() => window.butterchurnReady === true, { timeout: 15000 });
        pages.push(page);
    }
    console.log(`  ${numWorkers} browser workers ready`);

    // Process presets
    const results = { ...existingDescriptions };
    const errors = [];
    let processed = 0;
    const startTime = Date.now();

    const mlxLimiter = createConcurrencyLimiter(mlxConcurrency);
    const renderLimiter = createConcurrencyLimiter(numWorkers);

    const processPreset = async (preset, workerIdx) => {
        return renderLimiter(async () => {
            const page = pages[workerIdx % numWorkers];
            const browser = browsers[workerIdx % numWorkers];

            // Render frame
            const renderResult = await renderSingleFrame(browser, page, preset.name, preset.data, outputDir);
            if (renderResult.error) {
                errors.push({ presetName: preset.name, error: renderResult.error });
                return null;
            }

            // Get description from MLX
            return mlxLimiter(async () => {
                try {
                    const description = await describeFrame(renderResult.framePath);

                    // Add result immediately so checkpoints have data
                    results[preset.name] = {
                        hash: preset.hash,
                        description: description,
                    };

                    processed++;

                    // Progress
                    if (processed % 10 === 0) {
                        const elapsed = (Date.now() - startTime) / 1000;
                        const rate = processed / elapsed;
                        const remaining = (presetList.length - processed) / rate;
                        const pct = Math.round((processed / presetList.length) * 100);
                        console.log(`  [${processed}/${presetList.length}] ${pct}% | ${rate.toFixed(1)}/s | ETA: ${formatTime(remaining)}`);

                        // Save checkpoint every 100 presets
                        if (processed % 100 === 0) {
                            await saveResults(descriptionsPath, results, errors);
                        }
                    }

                    return { presetName: preset.name, hash: preset.hash, description };
                } catch (e) {
                    errors.push({ presetName: preset.name, error: e.message });
                    return null;
                }
            });
        });
    };

    // Process all presets in parallel
    console.log('\n[Pipeline] Starting parallel processing...');
    const promises = presetList.map((preset, idx) => processPreset(preset, idx));
    const allResults = await Promise.all(promises);

    // Collect results
    for (const r of allResults) {
        if (r && r.description) {
            results[r.presetName] = {
                hash: r.hash,
                description: r.description,
            };
        }
    }

    // Cleanup
    for (const browser of browsers) await browser.close().catch(() => {});
    for (const server of servers) server.close();

    // Final save
    await saveResults(descriptionsPath, results, errors);

    // Summary
    const totalTime = (Date.now() - startTime) / 1000;
    console.log('\n[Pipeline] Complete!');
    console.log(`  Success: ${Object.keys(results).length}`);
    console.log(`  Errors: ${errors.length}`);
    console.log(`  Total time: ${formatTime(totalTime)}`);
    console.log(`  Rate: ${(processed / totalTime).toFixed(2)} presets/sec`);
}

async function saveResults(outputPath, results, errors) {
    const output = {
        version: 'v1.0',
        generatedAt: new Date().toISOString(),
        backend: 'mlx',
        visionModel: MLX_MODEL,
        promptVersion: 'v1',
        totalPresets: Object.keys(results).length,
        successCount: Object.keys(results).length,
        errorCount: errors.length,
        descriptions: results,
    };

    if (errors.length > 0) {
        output.errors = errors.slice(-100); // Keep last 100 errors
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
