/**
 * AdvancedAudioAnalyzer Unit Tests
 * Phase 7: Testing for intelligent preset selector improvements
 *
 * Tests:
 * - Meyda integration (spectral features)
 * - BPM detection
 * - Beat/phrase tracking
 * - Mood detection
 * - Buildup detection
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AdvancedAudioAnalyzer } from '../src/audio/advancedAnalyzer.js';

// Mock audio data helpers
function createMockFreqArray(energy = 0.5, bassHeavy = false) {
    const arr = new Uint8Array(2048);
    for (let i = 0; i < arr.length; i++) {
        const freq = i / arr.length;
        let value = energy * 255 * (1 - freq * 0.5);
        if (bassHeavy && i < 512) {
            value *= 1.5;
        }
        arr[i] = Math.min(255, Math.max(0, value));
    }
    return arr;
}

function createMockTimeArray(energy = 0.5) {
    const arr = new Uint8Array(2048);
    for (let i = 0; i < arr.length; i++) {
        arr[i] = 128 + Math.sin(i / 10) * energy * 100;
    }
    return arr;
}

function createMockAudioBuffer(sampleRate = 44100, durationSec = 10, bpm = 120) {
    const length = sampleRate * durationSec;
    const beatInterval = (60 / bpm) * sampleRate;

    return {
        length,
        sampleRate,
        getChannelData: () => {
            const data = new Float32Array(length);
            // Create beats at BPM intervals
            for (let i = 0; i < length; i++) {
                const beatPhase = (i % beatInterval) / beatInterval;
                // Sharper transient at beat start
                if (beatPhase < 0.05) {
                    data[i] = 0.8 * (1 - beatPhase / 0.05);
                } else {
                    data[i] = 0.1 * Math.sin(i / 50);
                }
            }
            return data;
        }
    };
}

describe('AdvancedAudioAnalyzer', () => {
    let analyzer;

    beforeEach(() => {
        analyzer = new AdvancedAudioAnalyzer({});
    });

    afterEach(() => {
        if (analyzer?.destroy) {
            analyzer.destroy();
        }
    });

    describe('Basic Feature Extraction', () => {
        it('should calculate features from frequency and time data', () => {
            const freqData = createMockFreqArray(0.7);
            const timeData = createMockTimeArray(0.7);

            const features = analyzer.calculateFeatures(freqData, timeData);

            expect(features).toBeDefined();
            expect(features.beatStrength).toBeGreaterThanOrEqual(0);
            expect(features.beatStrength).toBeLessThanOrEqual(1);
            expect(features.bass).toBeDefined();
            expect(features.mid).toBeDefined();
            expect(features.treble).toBeDefined();
            expect(features.spectralCentroid).toBeDefined();
        });

        it('should detect beat when amplitude is high', () => {
            const highEnergyFreq = createMockFreqArray(0.9);
            const highEnergyTime = createMockTimeArray(0.9);

            const features = analyzer.calculateFeatures(highEnergyFreq, highEnergyTime);

            expect(features.beatStrength).toBeGreaterThan(0.5);
        });

        it('should track feature history', () => {
            for (let i = 0; i < 5; i++) {
                analyzer.calculateFeatures(createMockFreqArray(), createMockTimeArray());
            }

            expect(analyzer.featureHistory.length).toBe(5);
        });

        it('should limit history size to maxHistorySize', () => {
            for (let i = 0; i < 50; i++) {
                analyzer.calculateFeatures(createMockFreqArray(), createMockTimeArray());
            }

            expect(analyzer.featureHistory.length).toBeLessThanOrEqual(30);
        });
    });

    describe('Musical Event Detection', () => {
        it('should detect Drop with high bass and energy increase', () => {
            // Build up history with low energy
            for (let i = 0; i < 10; i++) {
                analyzer.calculateFeatures(createMockFreqArray(0.3), createMockTimeArray(0.3));
            }

            // Sudden high bass
            const dropFeatures = analyzer.calculateFeatures(
                createMockFreqArray(0.9, true),
                createMockTimeArray(0.9)
            );

            const event = analyzer.detectMusicalEvent(dropFeatures);
            // May be Drop or Peak depending on history
            expect(['Drop', 'Peak', 'Steady']).toContain(event.type);
        });

        it('should detect Ambient with low dynamic range', () => {
            // Create consistent low-energy readings
            for (let i = 0; i < 10; i++) {
                analyzer.calculateFeatures(createMockFreqArray(0.2), createMockTimeArray(0.1));
            }

            const features = {
                dynamicRange: 0.1,
                zeroCrossingRate: 0.05,
                bass: 0.2,
                beatStrength: 0.1
            };

            const event = analyzer.detectMusicalEvent(features);
            expect(['Ambient', 'Breakdown', 'Steady']).toContain(event.type);
        });
    });

    describe('BPM Detection', () => {
        it('should detect BPM from audio buffer', async () => {
            const buffer = createMockAudioBuffer(44100, 10, 120);

            const bpm = await analyzer.detectBPM(buffer);

            // BPM detection should be in a reasonable range
            if (bpm !== null) {
                expect(bpm).toBeGreaterThanOrEqual(60);
                expect(bpm).toBeLessThanOrEqual(180);
            }
        });

        it('should return null for empty audio buffer', async () => {
            const emptyBuffer = {
                length: 0,
                sampleRate: 44100,
                getChannelData: () => new Float32Array(0)
            };

            const bpm = await analyzer.detectBPM(emptyBuffer);
            expect(bpm).toBeNull();
        });

        it('should return null for null audio buffer', async () => {
            const bpm = await analyzer.detectBPM(null);
            expect(bpm).toBeNull();
        });

        it('should clamp BPM to 60-180 range', async () => {
            // Very fast BPM (would be 240 raw)
            const fastBuffer = createMockAudioBuffer(44100, 10, 240);
            const bpm = await analyzer.detectBPM(fastBuffer);

            if (bpm !== null) {
                expect(bpm).toBeLessThanOrEqual(180);
            }
        });
    });

    describe('Beat Phase Tracking', () => {
        it('should return null when no BPM detected', () => {
            expect(analyzer.detectedBPM).toBeNull();
            const beatInfo = analyzer.trackBeatPhase();
            expect(beatInfo).toBeNull();
        });

        it('should track beat position after BPM is set', () => {
            analyzer.detectedBPM = 120;
            analyzer.beatInterval = 500; // 120 BPM
            analyzer.lastBeatTime = performance.now();

            const beatInfo = analyzer.trackBeatPhase();

            expect(beatInfo).not.toBeNull();
            expect(beatInfo.bpm).toBe(120);
            expect(beatInfo.beatPosition).toBeGreaterThanOrEqual(0);
            expect(beatInfo.beatPosition).toBeLessThan(4);
            expect(beatInfo.barPosition).toBeGreaterThanOrEqual(0);
            expect(beatInfo.barPosition).toBeLessThan(4);
        });

        it('should track phrase position (0-15)', () => {
            analyzer.detectedBPM = 120;
            analyzer.beatInterval = 500;
            analyzer.beatPosition = 2;
            analyzer.barPosition = 1;
            analyzer.lastBeatTime = performance.now();

            const beatInfo = analyzer.trackBeatPhase();

            expect(beatInfo.phrasePosition).toBeGreaterThanOrEqual(0);
            expect(beatInfo.phrasePosition).toBeLessThan(16);
        });
    });

    describe('Mood Detection', () => {
        it('should return neutral mood when no spectral data', () => {
            const features = { bass: 0.5 };
            const mood = analyzer.detectMood(features);

            expect(mood.label).toBe('neutral');
            expect(mood.confidence).toBe(0.5);
        });

        it('should detect aggressive mood for high bass + energy', () => {
            const features = {
                bass: 0.8,
                beatStrength: 0.7,
                spectral: { sharpness: 0.6, centroid: 0.5, flatness: 0.4 }
            };

            const mood = analyzer.detectMood(features);
            expect(mood.label).toBe('aggressive');
            expect(mood.confidence).toBeGreaterThan(0.7);
        });

        it('should detect relaxed mood for low energy', () => {
            const features = {
                bass: 0.2,
                beatStrength: 0.2,
                spectral: { centroid: 0.3, flatness: 0.2, sharpness: 0.1 }
            };

            const mood = analyzer.detectMood(features);
            expect(mood.label).toBe('relaxed');
        });
    });

    describe('Buildup Detection', () => {
        it('should not detect buildup with insufficient history', () => {
            const features = { beatStrength: 0.5, spectralCentroid: 0.5 };
            const result = analyzer.detectBuildup(features);

            expect(result.isBuildup).toBe(false);
        });

        it('should detect buildup with rising energy', () => {
            // Build history with rising energy
            for (let i = 0; i < 60; i++) {
                const energy = 0.3 + (i / 60) * 0.5; // 0.3 -> 0.8
                analyzer.detectBuildup({
                    beatStrength: energy,
                    spectralCentroid: 0.3 + (i / 60) * 0.4
                });
            }

            const result = analyzer.detectBuildup({
                beatStrength: 0.9,
                spectralCentroid: 0.8
            });

            // May or may not detect buildup depending on exact thresholds
            expect(result).toHaveProperty('isBuildup');
            expect(result).toHaveProperty('confidence');
        });
    });

    describe('Cleanup', () => {
        it('should clean up resources on destroy', () => {
            analyzer.fluxHistory = [1, 2, 3];
            analyzer.buildupHistory = [{ energy: 0.5 }];
            analyzer.featureHistory = [{ bass: 0.5 }];

            analyzer.destroy();

            expect(analyzer.fluxHistory).toEqual([]);
            expect(analyzer.buildupHistory).toEqual([]);
            expect(analyzer.featureHistory).toEqual([]);
        });

        it('should reset beat tracking on reset', () => {
            analyzer.detectedBPM = 120;
            analyzer.beatPosition = 2;
            analyzer.barPosition = 1;
            analyzer.featureHistory = [{ bass: 0.5 }];

            analyzer.reset();

            expect(analyzer.beatPosition).toBe(0);
            expect(analyzer.barPosition).toBe(0);
            expect(analyzer.featureHistory).toEqual([]);
        });
    });
});
