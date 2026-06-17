#!/usr/bin/env node

/**
 * Butterchurn Preset Frame Renderer
 * Phase 6: ML Visual Style Tagging
 *
 * Renders multiple frames of each preset for CLIP visual style classification.
 * Uses Puppeteer to capture headless WebGL renders.
 *
 * Usage: node render-preset-frames.js --input ./presets --output ./frames
 */

import puppeteer from 'puppeteer';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Simple HTTP server for serving files (ES modules require http://)
function createServer(port = 8765) {
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
        server.listen(port, () => {
            console.log(`[Renderer] Server started on http://localhost:${port}`);
            resolve(server);
        });
    });
}

const FRAMES_PER_PRESET = 5;
const FRAME_INTERVAL_MS = 400; // Reduced from 600 for faster rendering
const FRAME_SIZE = 512;
const BATCH_SIZE = 30; // Restart browser every N presets to prevent frame detachment

async function createBrowserAndPage(server) {
    const browser = await puppeteer.launch({
        headless: 'new',
        protocolTimeout: 60000, // 60 second timeout for CDP commands
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-angle=swiftshader',
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--disable-dev-shm-usage'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: FRAME_SIZE + 100, height: FRAME_SIZE + 100 });

    // Suppress verbose console messages but keep errors
    page.on('pageerror', err => console.error('[Browser Error]', err.message));

    await page.goto('http://localhost:8765/test/preset-render-test.html', { waitUntil: 'networkidle0' });

    // Wait for butterchurn to initialize
    await page.waitForFunction(() => {
        return window.butterchurnReady === true;
    }, { timeout: 15000 });

    return { browser, page };
}

async function renderPresetFrames(presetPackPath, outputDir) {
    console.log(`[Renderer] Starting preset frame rendering`);
    console.log(`[Renderer] Input: ${presetPackPath}`);
    console.log(`[Renderer] Output: ${outputDir}`);

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Load preset pack
    const presetPackContent = await fs.readFile(presetPackPath, 'utf8');
    const presetPack = JSON.parse(presetPackContent);
    const allPresetNames = Object.keys(presetPack);

    // Check which presets are already rendered (resume capability)
    const existingFiles = await fs.readdir(outputDir).catch(() => []);
    const renderedPresets = new Set();
    for (const file of existingFiles) {
        // Extract preset name from filename (remove _N.png suffix)
        const match = file.match(/^(.+)_\d+\.png$/);
        if (match) {
            renderedPresets.add(match[1]);
        }
    }

    // Filter to only unrendered presets
    const presetNames = allPresetNames.filter(name => {
        const safeName = name.replace(/[^a-z0-9]/gi, '_').substring(0, 100);
        return !renderedPresets.has(safeName);
    });

    console.log(`[Renderer] Found ${allPresetNames.length} total presets`);
    console.log(`[Renderer] Already rendered: ${renderedPresets.size} presets`);
    console.log(`[Renderer] Remaining: ${presetNames.length} presets`);

    if (presetNames.length === 0) {
        console.log('[Renderer] All presets already rendered!');
        return;
    }

    // Start HTTP server (ES modules require http://, not file://)
    const server = await createServer(8765);

    let totalProcessed = renderedPresets.size;
    let batchProcessed = 0;
    let browser = null;
    let page = null;

    try {
        // Process in batches, restarting browser between batches
        for (let batchStart = 0; batchStart < presetNames.length; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE, presetNames.length);
            const batch = presetNames.slice(batchStart, batchEnd);

            console.log(`[Renderer] Starting batch ${Math.floor(batchStart / BATCH_SIZE) + 1} (presets ${batchStart + 1}-${batchEnd})`);

            // Create fresh browser for this batch
            if (browser) {
                await browser.close().catch(() => {});
            }

            try {
                ({ browser, page } = await createBrowserAndPage(server));
            } catch (e) {
                console.error(`[Renderer] Failed to create browser: ${e.message}`);
                continue;
            }

            // Inject only the presets for this batch (not the entire pack - it's too large)
            const batchPresets = {};
            for (const name of batch) {
                if (presetPack[name]) {
                    batchPresets[name] = presetPack[name];
                }
            }
            await page.evaluate((presets) => {
                window.presetPack = presets;
            }, batchPresets);

            for (const presetName of batch) {
                try {
                    // Load preset
                    await page.evaluate((name) => {
                        if (window.visualizer && window.presetPack[name]) {
                            window.visualizer.loadPreset(window.presetPack[name], 0);
                        }
                    }, presetName);

                    // Sanitize preset name for filename
                    const safeName = presetName.replace(/[^a-z0-9]/gi, '_').substring(0, 100);

                    // Capture frames with intervals
                    for (let f = 0; f < FRAMES_PER_PRESET; f++) {
                        await new Promise(r => setTimeout(r, FRAME_INTERVAL_MS));

                        // Force a render
                        await page.evaluate(() => {
                            if (window.visualizer && window.visualizer.render) {
                                const fakeAudio = {
                                    timeByteArray: new Uint8Array(2048).fill(128),
                                    timeByteArrayL: new Uint8Array(2048).fill(128),
                                    timeByteArrayR: new Uint8Array(2048).fill(128)
                                };
                                // Add some variation based on frame number
                                for (let i = 0; i < 512; i++) {
                                    fakeAudio.timeByteArray[i] = 128 + Math.sin(i / 20) * 50;
                                }
                                window.visualizer.render({ audioLevels: fakeAudio });
                            }
                        });

                        const framePath = path.join(outputDir, `${safeName}_${f}.png`);

                        await page.screenshot({
                            path: framePath,
                            clip: { x: 50, y: 50, width: FRAME_SIZE, height: FRAME_SIZE },
                            omitBackground: true
                        });
                    }

                    totalProcessed++;
                    batchProcessed++;

                    if (totalProcessed % 50 === 0) {
                        console.log(`[Renderer] Progress: ${totalProcessed}/${allPresetNames.length} presets`);
                    }
                } catch (e) {
                    console.error(`[Renderer] Error rendering ${presetName}: ${e.message}`);
                    // If we get a frame detachment error, break out of batch to restart browser
                    if (e.message.includes('detached Frame')) {
                        console.log('[Renderer] Frame detached, restarting browser...');
                        break;
                    }
                }
            }
        }
    } finally {
        if (browser) {
            await browser.close().catch(() => {});
        }
        server.close();
    }

    console.log(`[Renderer] Complete! Total rendered: ${totalProcessed}/${allPresetNames.length} presets`);
}

async function createTestPage(outputPath) {
    const html = `<!DOCTYPE html>
<html>
<head>
    <title>Preset Render Test</title>
    <style>
        body { margin: 0; background: #000; }
        canvas { display: block; }
    </style>
</head>
<body>
    <canvas id="canvas" width="512" height="512"></canvas>
    <script type="module">
        import butterchurn from '/dist/butterchurn.esm.js';

        const canvas = document.getElementById('canvas');
        const audioContext = new AudioContext();

        // Create visualizer
        window.visualizer = butterchurn.createVisualizer(audioContext, canvas, {
            width: 512,
            height: 512,
            pixelRatio: 1,
            textureRatio: 1
        });

        // Simple render loop
        function render() {
            requestAnimationFrame(render);
        }
        render();

        console.log('Butterchurn initialized for rendering');
    </script>
</body>
</html>`;

    await fs.writeFile(outputPath, html, 'utf8');
}

// Parse command line arguments
const args = process.argv.slice(2);
let inputPath = null;
let outputPath = './frames';

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
        inputPath = args[i + 1];
        i++;
    } else if (args[i] === '--output' && args[i + 1]) {
        outputPath = args[i + 1];
        i++;
    }
}

if (!inputPath) {
    console.log('Usage: node render-preset-frames.js --input <preset-pack.json> --output <output-dir>');
    process.exit(1);
}

renderPresetFrames(inputPath, outputPath).catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
