#!/usr/bin/env node

/**
 * Detect problematic presets by pre-rendering at low resolution
 * and checking for black frames after warmup period
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');
const butterchurn = require('../lib/butterchurn.js');
const presetPackMeta = require('butterchurn-presets');
const presetPack = require('butterchurn-presets/lib/butterchurnPresets.min');

class ProblematicPresetDetector {
    constructor() {
        this.canvas = createCanvas(256, 144); // Low resolution for fast testing
        this.ctx = this.canvas.getContext('2d');
        this.visualizer = null;
        this.problematicPresets = new Set();
        this.audioContext = null;
        this.results = {
            problematic: [],
            working: [],
            audioReactive: []
        };
    }

    /**
     * Initialize the visualizer
     */
    initialize() {
        // Create a mock audio context for testing
        this.audioContext = {
            sampleRate: 44100,
            createGain: () => ({
                gain: { value: 1 },
                connect: () => {},
                disconnect: () => {}
            }),
            createDelay: () => ({
                delayTime: { value: 0 },
                connect: () => {},
                disconnect: () => {}
            }),
            createScriptProcessor: () => ({
                connect: () => {},
                disconnect: () => {},
                onaudioprocess: null
            })
        };

        // Create visualizer
        this.visualizer = butterchurn.createVisualizer(this.audioContext, this.canvas, {
            width: 256,
            height: 144,
            meshWidth: 16,
            meshHeight: 12,
            pixelRatio: 1
        });
    }

    /**
     * Generate synthetic audio data for testing
     */
    generateAudioData(energy = 0.5) {
        const timeByteArray = new Uint8Array(512);
        const timeByteArrayL = new Uint8Array(512);
        const timeByteArrayR = new Uint8Array(512);

        // Generate some waveform data
        for (let i = 0; i < 512; i++) {
            const value = Math.floor(128 + Math.sin(i * 0.1) * energy * 127);
            timeByteArray[i] = value;
            timeByteArrayL[i] = value;
            timeByteArrayR[i] = value;
        }

        const freqByteArray = new Uint8Array(512);
        // Generate frequency spectrum
        for (let i = 0; i < 512; i++) {
            if (i < 50) {
                // Bass
                freqByteArray[i] = Math.floor(energy * 255 * 0.8);
            } else if (i < 200) {
                // Mids
                freqByteArray[i] = Math.floor(energy * 255 * 0.5);
            } else {
                // Treble
                freqByteArray[i] = Math.floor(energy * 255 * 0.3);
            }
        }

        return { timeByteArray, timeByteArrayL, timeByteArrayR, freqByteArray };
    }

    /**
     * Check if canvas is mostly black
     */
    isBlackFrame(threshold = 0.01) {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;
        let totalBrightness = 0;
        let pixelCount = 0;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const brightness = (r + g + b) / (3 * 255);
            totalBrightness += brightness;
            pixelCount++;
        }

        const avgBrightness = totalBrightness / pixelCount;
        return avgBrightness < threshold;
    }

    /**
     * Test a single preset
     */
    async testPreset(presetName, preset, warmupTime = 0) {
        console.log(`Testing: ${presetName} (warmup: ${warmupTime}s)`);

        try {
            // Load the preset
            this.visualizer.loadPreset(preset, 0); // No blending for testing

            // Render frames during warmup
            const warmupFrames = Math.ceil((warmupTime + 3) * 30); // warmup + 3 seconds at 30fps
            let blackFrameCount = 0;
            let hasVisibleContent = false;

            // Test with different audio energy levels
            const energyLevels = [0.1, 0.5, 1.0]; // Low, medium, high energy

            for (const energy of energyLevels) {
                const audioData = this.generateAudioData(energy);

                // Skip warmup frames
                for (let i = 0; i < warmupTime * 30; i++) {
                    this.visualizer.addTimeSamples(audioData.timeByteArray, audioData.freqByteArray,
                        audioData.timeByteArrayL, audioData.timeByteArrayR);
                    this.visualizer.render();
                }

                // Test actual frames after warmup
                for (let i = 0; i < 90; i++) { // 3 seconds at 30fps
                    this.visualizer.addTimeSamples(audioData.timeByteArray, audioData.freqByteArray,
                        audioData.timeByteArrayL, audioData.timeByteArrayR);
                    this.visualizer.render();

                    // Check every 10th frame
                    if (i % 10 === 0) {
                        if (this.isBlackFrame()) {
                            blackFrameCount++;
                        } else {
                            hasVisibleContent = true;
                        }
                    }
                }

                // If we found visible content at any energy level, it works
                if (hasVisibleContent) {
                    break;
                }
            }

            // Determine if problematic
            const totalChecks = 9 * energyLevels.length; // 9 checks per energy level
            const blackRatio = blackFrameCount / totalChecks;

            if (!hasVisibleContent || blackRatio > 0.9) {
                return { problematic: true, reason: 'black_frames', blackRatio };
            } else if (blackRatio > 0.5) {
                return { problematic: false, audioReactive: true, blackRatio };
            } else {
                return { problematic: false, working: true, blackRatio };
            }

        } catch (error) {
            console.error(`Error testing ${presetName}:`, error.message);
            return { problematic: true, reason: 'error', error: error.message };
        }
    }

    /**
     * Test all presets
     */
    async testAllPresets() {
        this.initialize();

        // Load fingerprint database for warmup times
        let fingerprintDb = {};
        const fingerprintPath = path.join(__dirname, '..', 'fingerprints-with-warmup.json');
        if (fs.existsSync(fingerprintPath)) {
            fingerprintDb = JSON.parse(fs.readFileSync(fingerprintPath, 'utf8'));
        }

        const presets = Object.entries(presetPack.presets);
        console.log(`Testing ${presets.length} presets...`);

        for (const [name, preset] of presets) {
            // Find warmup time from fingerprint database
            let warmupTime = 0;
            for (const [hash, data] of Object.entries(fingerprintDb.presets || {})) {
                if (data.names && data.names.includes(name)) {
                    warmupTime = data.fingerprint?.warmupTime || 0;
                    break;
                }
            }

            const result = await this.testPreset(name, preset, warmupTime);

            if (result.problematic) {
                this.results.problematic.push({
                    name,
                    reason: result.reason,
                    error: result.error,
                    solidRatio: result.solidRatio
                });
                console.log(`  ❌ Problematic: ${result.reason}`);
            } else if (result.audioReactive) {
                this.results.audioReactive.push({
                    name,
                    solidRatio: result.solidRatio
                });
                console.log(`  ⚡ Audio-reactive (needs loud audio)`);
            } else {
                this.results.working.push({
                    name,
                    solidRatio: result.solidRatio
                });
                console.log(`  ✅ Working`);
            }

            // Small delay between presets
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Save results
        this.saveResults();
    }

    /**
     * Save detection results
     */
    saveResults() {
        const outputPath = path.join(__dirname, '..', 'detected-problematic-presets.json');

        const output = {
            timestamp: new Date().toISOString(),
            summary: {
                total: this.results.problematic.length + this.results.audioReactive.length + this.results.working.length,
                problematic: this.results.problematic.length,
                audioReactive: this.results.audioReactive.length,
                working: this.results.working.length
            },
            problematic_presets: this.results.problematic,
            audio_reactive_presets: this.results.audioReactive,
            working_presets: this.results.working.map(p => p.name) // Just names for working ones
        };

        fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
        console.log(`\nResults saved to ${outputPath}`);
        console.log(`Summary:`);
        console.log(`  Problematic: ${output.summary.problematic}`);
        console.log(`  Audio-reactive: ${output.summary.audioReactive}`);
        console.log(`  Working: ${output.summary.working}`);
    }
}

// Run detection if called directly
if (require.main === module) {
    const detector = new ProblematicPresetDetector();
    detector.testAllPresets().catch(console.error);
}

module.exports = ProblematicPresetDetector;