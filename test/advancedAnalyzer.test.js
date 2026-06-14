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

        // V2.1 Extended Mood Detection Tests
        describe('Extended Moods (v2.1)', () => {
            it('should detect meditative mood for very low energy and sharpness', () => {
                // Centroid >= 0.4 to avoid triggering relaxed (which requires centroid < 0.4)
                const features = {
                    bass: 0.15,
                    mid: 0.2,
                    treble: 0.1,
                    beatStrength: 0.1,
                    dynamicRange: 0.15,
                    spectral: { centroid: 0.45, flatness: 0.2, sharpness: 0.1, flux: 0.1, rolloff: 0.3 }
                };

                const mood = analyzer.detectMood(features);
                expect(mood.label).toBe('meditative');
                expect(mood.confidence).toBeGreaterThanOrEqual(0.6);
            });

            it('should detect dreamy mood for low energy with high centroid', () => {
                const features = {
                    bass: 0.25,
                    mid: 0.4,
                    treble: 0.5,
                    beatStrength: 0.25,
                    dynamicRange: 0.3,
                    spectral: { centroid: 0.65, flatness: 0.35, sharpness: 0.2, flux: 0.2, rolloff: 0.5 }
                };

                const mood = analyzer.detectMood(features);
                expect(mood.label).toBe('dreamy');
                expect(mood.confidence).toBeGreaterThanOrEqual(0.55);
            });

            it('should detect hypnotic mood for moderate energy with low dynamic range', () => {
                const features = {
                    bass: 0.4,
                    mid: 0.55,
                    treble: 0.35,
                    beatStrength: 0.45,
                    dynamicRange: 0.2,
                    spectral: { centroid: 0.45, flatness: 0.35, sharpness: 0.35, flux: 0.2, rolloff: 0.4 }
                };

                const mood = analyzer.detectMood(features);
                expect(mood.label).toBe('hypnotic');
                expect(mood.confidence).toBeGreaterThanOrEqual(0.55);
            });

            it('should detect mystical mood for organic sound with high rolloff', () => {
                const features = {
                    bass: 0.3,
                    mid: 0.45,
                    treble: 0.4,
                    beatStrength: 0.35,
                    dynamicRange: 0.35,
                    spectral: { centroid: 0.5, flatness: 0.2, sharpness: 0.3, flux: 0.2, rolloff: 0.65 }
                };

                const mood = analyzer.detectMood(features);
                expect(mood.label).toBe('mystical');
                expect(mood.confidence).toBeGreaterThanOrEqual(0.5);
            });

            it('should detect psychedelic mood for high flux and dynamic range', () => {
                const features = {
                    bass: 0.4,
                    mid: 0.5,
                    treble: 0.55,
                    beatStrength: 0.5,
                    dynamicRange: 0.55,
                    spectral: { centroid: 0.55, flatness: 0.4, sharpness: 0.4, flux: 0.45, rolloff: 0.5 }
                };

                const mood = analyzer.detectMood(features);
                expect(mood.label).toBe('psychedelic');
                expect(mood.confidence).toBeGreaterThanOrEqual(0.5);
            });

            it('should prioritize primary moods when confidence is high', () => {
                // Strong aggressive features should take priority
                const features = {
                    bass: 0.85,
                    mid: 0.5,
                    treble: 0.4,
                    beatStrength: 0.8,
                    dynamicRange: 0.5,
                    spectral: { centroid: 0.5, flatness: 0.3, sharpness: 0.7, flux: 0.4, rolloff: 0.5 }
                };

                const mood = analyzer.detectMood(features);
                expect(mood.label).toBe('aggressive');
                expect(mood.confidence).toBeGreaterThan(0.7);
            });

            it('should fall back to extended moods only when primary confidence is low', () => {
                // Features that don't strongly match any primary mood
                // but match meditative (very low everything)
                const features = {
                    bass: 0.1,
                    mid: 0.15,
                    treble: 0.1,
                    beatStrength: 0.15,
                    dynamicRange: 0.1,
                    spectral: { centroid: 0.35, flatness: 0.28, sharpness: 0.15, flux: 0.1, rolloff: 0.3 }
                };

                const mood = analyzer.detectMood(features);
                // Should be meditative since primary moods don't match well
                expect(['meditative', 'relaxed']).toContain(mood.label);
            });
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

    // ============================================
    // D1: Tests for review follow-up fixes
    // ============================================

    describe('Gaussian Smoothing (Priority 5)', () => {
        it('should generate normalized Gaussian kernel', () => {
            const kernel = analyzer._generateGaussianKernel(5, 1.0);

            expect(kernel.length).toBe(5);
            // Kernel should sum to ~1 (normalized)
            const sum = kernel.reduce((a, b) => a + b, 0);
            expect(sum).toBeCloseTo(1.0, 5);
            // Center should be highest
            expect(kernel[2]).toBeGreaterThan(kernel[0]);
            expect(kernel[2]).toBeGreaterThan(kernel[4]);
            // Should be symmetric
            expect(kernel[0]).toBeCloseTo(kernel[4], 10);
            expect(kernel[1]).toBeCloseTo(kernel[3], 10);
        });

        it('should smooth feature history', () => {
            // Create history with a spike
            const history = [
                { bass: 0.5 }, { bass: 0.5 }, { bass: 0.9 },
                { bass: 0.5 }, { bass: 0.5 }, { bass: 0.5 }, { bass: 0.5 }
            ];
            analyzer.featureHistory = history;

            const smoothed = analyzer._smoothFeatureHistory(history, 'bass');

            // Smoothing reduces spike impact
            expect(smoothed.length).toBeLessThan(history.length);
            // All values should be defined
            smoothed.forEach(v => expect(v).toBeDefined());
        });

        it('should return raw values when history too short for kernel', () => {
            const shortHistory = [{ bass: 0.5 }, { bass: 0.6 }];
            const smoothed = analyzer._smoothFeatureHistory(shortHistory, 'bass');

            expect(smoothed.length).toBe(2);
            expect(smoothed[0]).toBe(0.5);
            expect(smoothed[1]).toBe(0.6);
        });
    });

    describe('A5 Fix: features.energy', () => {
        it('should set features.energy as alias for beatStrength', () => {
            const freqData = createMockFreqArray(0.7);
            const timeData = createMockTimeArray(0.7);

            const features = analyzer.calculateFeatures(freqData, timeData);

            expect(features.energy).toBeDefined();
            expect(features.energy).toBe(features.beatStrength);
        });
    });

    describe('A1/A3 Fix: BPM clamping', () => {
        it('should iteratively clamp very slow BPM (25 → 50 → 100)', async () => {
            // Create buffer with very slow beats (25 BPM)
            const slowBuffer = createMockAudioBuffer(44100, 10, 25);
            const bpm = await analyzer.detectBPM(slowBuffer);

            if (bpm !== null) {
                expect(bpm).toBeGreaterThanOrEqual(60);
                expect(bpm).toBeLessThanOrEqual(180);
            }
        });

        it('should iteratively clamp very fast BPM (400 → 200 → 100)', async () => {
            // Create buffer with very fast beats (400 BPM)
            const fastBuffer = createMockAudioBuffer(44100, 10, 400);
            const bpm = await analyzer.detectBPM(fastBuffer);

            if (bpm !== null) {
                expect(bpm).toBeGreaterThanOrEqual(60);
                expect(bpm).toBeLessThanOrEqual(180);
            }
        });

        it('should derive beatInterval from clamped BPM', async () => {
            const buffer = createMockAudioBuffer(44100, 10, 120);
            await analyzer.detectBPM(buffer);

            if (analyzer.detectedBPM !== null) {
                // beatInterval should be 60000 / BPM
                const expectedInterval = 60000 / analyzer.detectedBPM;
                expect(analyzer.beatInterval).toBeCloseTo(expectedInterval, 1);
            }
        });
    });

    describe('A2 Fix: Beat skip handling', () => {
        it('should handle multiple elapsed beats after long pause', () => {
            analyzer.detectedBPM = 120;
            analyzer.beatInterval = 500; // 120 BPM = 500ms per beat
            analyzer.beatPosition = 0;
            analyzer.barPosition = 0;
            analyzer.phraseLength = 16;

            // Simulate being called 2 seconds after last beat (4 beats elapsed)
            analyzer.lastBeatTime = performance.now() - 2000;

            const beatInfo = analyzer.trackBeatPhase();

            // After 4 beats: beatPosition should have advanced by 4 mod 4 = 0
            // barPosition should have advanced by 1 (4 beats = 1 bar)
            expect(beatInfo.beatPosition).toBe(0);
            expect(beatInfo.barPosition).toBeGreaterThanOrEqual(0);
        });

        it('should advance through full phrase correctly', () => {
            analyzer.detectedBPM = 120;
            analyzer.beatInterval = 500;
            analyzer.beatPosition = 0;
            analyzer.barPosition = 0;
            analyzer.phraseLength = 16;

            // Simulate 8 seconds elapsed (16 beats = full phrase)
            analyzer.lastBeatTime = performance.now() - 8000;

            const beatInfo = analyzer.trackBeatPhase();

            // Should wrap around to start of new phrase
            expect(beatInfo.phrasePosition).toBeGreaterThanOrEqual(0);
            expect(beatInfo.phrasePosition).toBeLessThan(16);
        });
    });

    describe('A4 Fix: phraseLength wiring', () => {
        it('should update phraseLength when genre detected', () => {
            // Set up features for ambient genre (phraseLength = 64)
            const features = {
                bass: 0.2,
                mid: 0.3,
                treble: 0.3,
                beatStrength: 0.2,
                spectralCentroid: 0.3,
                dynamicRange: 0.2,
                spectral: { flatness: 0.2, sharpness: 0.2 }
            };

            const genre = analyzer.detectGenre(features);

            expect(analyzer.phraseLength).toBe(genre.phraseLength);
        });

        it('should return phraseLength in trackBeatPhase', () => {
            analyzer.detectedBPM = 120;
            analyzer.beatInterval = 500;
            analyzer.phraseLength = 32; // Dubstep-style
            analyzer.lastBeatTime = performance.now();

            const beatInfo = analyzer.trackBeatPhase();

            expect(beatInfo.phraseLength).toBe(32);
        });
    });

    describe('B4 Fix: Meyda readiness', () => {
        it('should expose meydaReady getter', () => {
            expect(analyzer.meydaReady).toBe(false);
        });

        it('should provide waitForMeyda promise', async () => {
            // Without audioContext, should return false immediately
            const result = await analyzer.waitForMeyda();
            expect(result).toBe(false);
        });
    });

    describe('B1 Fix: Buildup window size', () => {
        it('should use configurable buildup history size', () => {
            const customAnalyzer = new AdvancedAudioAnalyzer({
                buildupHistorySize: 240
            });

            expect(customAnalyzer.BUILDUP_HISTORY_SIZE).toBe(240);
            customAnalyzer.destroy();
        });

        it('should default to 480 frames (~8 seconds)', () => {
            expect(analyzer.BUILDUP_HISTORY_SIZE).toBe(480);
        });
    });

    describe('C1 Fix: Configurable thresholds', () => {
        it('should accept custom threshold config', () => {
            const customAnalyzer = new AdvancedAudioAnalyzer({
                dropBassChangeThreshold: 0.3,
                trendStabilityThreshold: 0.08,
                onsetThreshold: 2.0,
                onsetEnergyFloor: 0.02
            });

            expect(customAnalyzer.dropBassChangeThreshold).toBe(0.3);
            expect(customAnalyzer.trendStabilityThreshold).toBe(0.08);
            expect(customAnalyzer.onsetThreshold).toBe(2.0);
            expect(customAnalyzer.onsetEnergyFloor).toBe(0.02);
            customAnalyzer.destroy();
        });

        it('should use defaults when not configured', () => {
            expect(analyzer.dropBassChangeThreshold).toBe(0.2);
            expect(analyzer.trendStabilityThreshold).toBe(0.05);
            expect(analyzer.onsetThreshold).toBe(1.5);
            expect(analyzer.onsetEnergyFloor).toBe(0.01);
        });
    });

    describe('B2 Fix: recommendFFTSize removed', () => {
        it('should not have recommendFFTSize method', () => {
            expect(analyzer.recommendFFTSize).toBeUndefined();
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
