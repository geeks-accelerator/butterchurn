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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRAMES_PER_PRESET = 5;
const FRAME_INTERVAL_MS = 600;
const FRAME_SIZE = 512;

async function renderPresetFrames(presetPackPath, outputDir) {
    console.log(`[Renderer] Starting preset frame rendering`);
    console.log(`[Renderer] Input: ${presetPackPath}`);
    console.log(`[Renderer] Output: ${outputDir}`);

    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });

    // Load preset pack
    const presetPackContent = await fs.readFile(presetPackPath, 'utf8');
    const presetPack = JSON.parse(presetPackContent);
    const presetNames = Object.keys(presetPack);

    console.log(`[Renderer] Found ${presetNames.length} presets to render`);

    // Launch browser
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--use-gl=swiftshader',
            '--enable-webgl'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: FRAME_SIZE + 100, height: FRAME_SIZE + 100 });

    // Create test HTML with butterchurn
    const testHtmlPath = path.resolve(__dirname, '..', 'test', 'preset-render-test.html');

    // Check if test page exists, if not create a minimal one
    const testPageExists = await fs.access(testHtmlPath).then(() => true).catch(() => false);

    if (!testPageExists) {
        console.log(`[Renderer] Creating test page at ${testHtmlPath}`);
        await createTestPage(testHtmlPath);
    }

    await page.goto(`file://${testHtmlPath}`, { waitUntil: 'networkidle0' });

    // Wait for butterchurn to initialize
    await page.waitForFunction(() => {
        return typeof window.visualizer !== 'undefined';
    }, { timeout: 10000 }).catch(() => {
        console.error('[Renderer] Butterchurn did not initialize');
    });

    // Inject preset pack
    await page.evaluate((presets) => {
        window.presetPack = presets;
    }, presetPack);

    let processed = 0;
    for (const presetName of presetNames) {
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
                await page.waitForTimeout(FRAME_INTERVAL_MS);

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

            processed++;
            if (processed % 50 === 0) {
                console.log(`[Renderer] Processed ${processed}/${presetNames.length} presets`);
            }
        } catch (e) {
            console.error(`[Renderer] Error rendering ${presetName}: ${e.message}`);
        }
    }

    await browser.close();
    console.log(`[Renderer] Complete! Rendered ${processed} presets to ${outputDir}`);
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
        import butterchurn from '../dist/butterchurn.js';

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
