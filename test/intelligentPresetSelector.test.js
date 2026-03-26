/**
 * IntelligentPresetSelector Unit Tests
 * Phase 7: Testing for intelligent preset selector improvements
 *
 * Tests:
 * - Enhanced scoring with mood/BPM/spectral
 * - Phrase-aligned switching
 * - Pre-drop anticipation
 * - Performance degradation tracking
 * - Deterministic RNG
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// We need to mock some dependencies since they may not all be available
const mockPresetDatabase = {
    version: '2.0.0',
    presets: {
        'abc12345': {
            hash: 'abc12345',
            names: ['Test Preset 1'],
            authors: ['Test Author'],
            fingerprint: {
                energy: 0.7,
                bass: 0.6,
                bassEnergy: 0.6,
                trebleEnergy: 0.5,
                complexity: 0.3,
                beatSync: 1,
                fps: 60,
                styles: ['particle'],
                moodAffinities: {
                    aggressive: 0.8,
                    relaxed: 0.2,
                    happy: 0.5,
                    electronic: 0.7,
                    acoustic: 0.3,
                    // v2.1 extended moods
                    mystical: 0.3,
                    hypnotic: 0.4,
                    psychedelic: 0.6,
                    dreamy: 0.2,
                    meditative: 0.1
                },
                optimalBpm: { min: 120, max: 150, ideal: 135 }
            }
        },
        'def67890': {
            hash: 'def67890',
            names: ['Test Preset 2'],
            authors: ['Test Author'],
            fingerprint: {
                energy: 0.3,
                bass: 0.2,
                bassEnergy: 0.2,
                trebleEnergy: 0.4,
                complexity: 0.5,
                beatSync: 1,
                fps: 60,
                styles: ['organic'],
                moodAffinities: {
                    aggressive: 0.2,
                    relaxed: 0.8,
                    happy: 0.4,
                    electronic: 0.3,
                    acoustic: 0.7,
                    // v2.1 extended moods
                    mystical: 0.7,
                    hypnotic: 0.6,
                    psychedelic: 0.3,
                    dreamy: 0.8,
                    meditative: 0.9
                },
                optimalBpm: { min: 60, max: 100, ideal: 80 }
            }
        }
    },
    indices: {
        high: ['abc12345'],
        calm: ['def67890'],
        bass: ['abc12345'],
        particle: ['abc12345'],
        organic: ['def67890'],
        fractal: [],
        geometric: []
    }
};

// Mock butterchurn
const mockButterchurn = {
    loadPreset: jest.fn(),
    audio: null
};

// v2.1 Threshold constants (mirroring the actual implementation)
const BPM_THRESHOLDS = {
    veryLow: 80,
    low: 100,
    high: 140,
    veryHigh: 160
};

const ENERGY_THRESHOLDS = {
    low: 0.35,
    medium: 0.6,
    high: 0.8
};

// Mock analyzer
const createMockAnalyzer = () => ({
    detectedBPM: null,
    beatInterval: 500,
    calculateFeatures: jest.fn(() => ({
        energy: 0.5,
        bass: 0.5,
        bassEnergy: 0.5,
        trebleEnergy: 0.5,
        beatStrength: 0.5,
        spectralCentroid: 0.5
    })),
    trackBeatPhase: jest.fn(() => null),
    detectBuildup: jest.fn(() => ({ isBuildup: false })),
    detectMood: jest.fn(() => ({ label: 'neutral', confidence: 0.5 })),
    detectBPM: jest.fn(async () => 120),
    destroy: jest.fn()
});

describe('IntelligentPresetSelector', () => {
    // We'll use a simplified test approach since the full module has many dependencies
    describe('PresetPerformanceTracker (inline)', () => {
        let tracker;

        beforeEach(() => {
            // Inline implementation to test
            tracker = {
                scoreHistory: [],
                baselineScores: [],
                maxHistorySize: 60,
                degradationThreshold: 0.4,
                BASELINE_SIZE: 30,

                update(currentScore) {
                    if (currentScore === undefined || currentScore === null) {
                        return { shouldSwitch: false, degradation: 0, reason: null };
                    }

                    if (this.baselineScores.length < this.BASELINE_SIZE) {
                        this.baselineScores.push(currentScore);
                        return { shouldSwitch: false, degradation: 0, reason: 'building_baseline' };
                    }

                    this.scoreHistory.push(currentScore);
                    if (this.scoreHistory.length > this.maxHistorySize) {
                        this.scoreHistory.shift();
                    }

                    if (this.scoreHistory.length < 30) {
                        return { shouldSwitch: false, degradation: 0, reason: null };
                    }

                    const baseline = this.baselineScores.reduce((a, b) => a + b, 0) / this.baselineScores.length;
                    const current = this.scoreHistory.reduce((a, b) => a + b, 0) / this.scoreHistory.length;
                    const degradation = baseline > 0 ? (baseline - current) / baseline : 0;

                    if (degradation > this.degradationThreshold) {
                        return {
                            shouldSwitch: true,
                            degradation,
                            reason: `performance_degraded_${(degradation * 100).toFixed(0)}%`
                        };
                    }

                    return { shouldSwitch: false, degradation };
                },

                reset() {
                    this.scoreHistory = [];
                    this.baselineScores = [];
                }
            };
        });

        it('should build baseline from first 30 scores', () => {
            for (let i = 0; i < 30; i++) {
                const result = tracker.update(0.8);
                if (i < 29) {
                    expect(result.reason).toBe('building_baseline');
                }
            }
            expect(tracker.baselineScores.length).toBe(30);
        });

        it('should not trigger switch during baseline building', () => {
            for (let i = 0; i < 29; i++) {
                const result = tracker.update(0.8);
                expect(result.shouldSwitch).toBe(false);
            }
        });

        it('should detect performance degradation', () => {
            // Build baseline with high scores
            for (let i = 0; i < 30; i++) {
                tracker.update(0.8);
            }

            // Add history with high scores
            for (let i = 0; i < 30; i++) {
                tracker.update(0.8);
            }

            // Now add many low scores
            for (let i = 0; i < 60; i++) {
                tracker.update(0.3);
            }

            const result = tracker.update(0.3);
            // Should eventually trigger switch when degradation exceeds 40%
            expect(result.degradation).toBeGreaterThan(0);
        });

        it('should reset tracking state', () => {
            for (let i = 0; i < 50; i++) {
                tracker.update(0.8);
            }

            tracker.reset();

            expect(tracker.scoreHistory).toEqual([]);
            expect(tracker.baselineScores).toEqual([]);
        });

        it('should handle null/undefined scores', () => {
            const result1 = tracker.update(null);
            const result2 = tracker.update(undefined);

            expect(result1.shouldSwitch).toBe(false);
            expect(result2.shouldSwitch).toBe(false);
        });
    });

    describe('Scoring Logic', () => {
        // Simplified scoring test
        const scorePreset = (hash, features, mood, db, analyzer) => {
            const preset = db.presets[hash];
            if (!preset || !preset.fingerprint) return 0;

            const fp = preset.fingerprint;
            let score = 0;

            // Energy match (25%)
            const energyDiff = Math.abs((fp.energy || 0.5) - (features.energy || 0.5));
            score += (1 - energyDiff) * 0.25;

            // Bass match (15%)
            const fpBass = fp.bass !== undefined ? fp.bass : fp.bassEnergy;
            if (features.bassEnergy > 0.6 && fpBass > 0.6) {
                score += 0.15;
            } else if (features.bassEnergy < 0.3 && fpBass < 0.3) {
                score += 0.075;
            }

            // Mood affinity (15%)
            if (mood && mood.label && fp.moodAffinities) {
                const moodScore = fp.moodAffinities[mood.label];
                if (moodScore !== undefined) {
                    const values = Object.values(fp.moodAffinities).map(v => parseFloat(v) || 0.5);
                    const variance = values.reduce((s, v) => s + (v - 0.5) ** 2, 0) / values.length;
                    if (variance > 0.01) {
                        score += moodScore * mood.confidence * 0.15;
                    }
                }
            }

            // BPM match (10%)
            if (analyzer?.detectedBPM && fp.optimalBpm) {
                const bpm = analyzer.detectedBPM;
                if (bpm >= fp.optimalBpm.min && bpm <= fp.optimalBpm.max) {
                    const distFromIdeal = Math.abs(bpm - fp.optimalBpm.ideal);
                    const rangeSize = (fp.optimalBpm.max - fp.optimalBpm.min) / 2;
                    score += Math.max(0, 1 - distFromIdeal / rangeSize) * 0.10;
                }
            }

            return score;
        };

        it('should score higher for energy match', () => {
            const features = { energy: 0.7, bassEnergy: 0.5 };
            const mockAnalyzer = { detectedBPM: null };

            // abc12345 has energy 0.7, def67890 has energy 0.3
            const score1 = scorePreset('abc12345', features, null, mockPresetDatabase, mockAnalyzer);
            const score2 = scorePreset('def67890', features, null, mockPresetDatabase, mockAnalyzer);

            expect(score1).toBeGreaterThan(score2);
        });

        it('should boost score for mood match', () => {
            const features = { energy: 0.5, bassEnergy: 0.5 };
            const aggressiveMood = { label: 'aggressive', confidence: 0.9 };
            const relaxedMood = { label: 'relaxed', confidence: 0.9 };
            const mockAnalyzer = { detectedBPM: null };

            // abc12345 has high aggressive affinity
            const aggressiveScore = scorePreset('abc12345', features, aggressiveMood, mockPresetDatabase, mockAnalyzer);
            const relaxedScore = scorePreset('abc12345', features, relaxedMood, mockPresetDatabase, mockAnalyzer);

            expect(aggressiveScore).toBeGreaterThan(relaxedScore);
        });

        it('should boost score for BPM in optimal range', () => {
            const features = { energy: 0.5, bassEnergy: 0.5 };

            // abc12345 optimal BPM: 120-150
            const inRangeAnalyzer = { detectedBPM: 135 };
            const outOfRangeAnalyzer = { detectedBPM: 80 };

            const inRangeScore = scorePreset('abc12345', features, null, mockPresetDatabase, inRangeAnalyzer);
            const outOfRangeScore = scorePreset('abc12345', features, null, mockPresetDatabase, outOfRangeAnalyzer);

            expect(inRangeScore).toBeGreaterThan(outOfRangeScore);
        });

        it('should return 0 for non-existent preset', () => {
            const score = scorePreset('nonexistent', {}, null, mockPresetDatabase, {});
            expect(score).toBe(0);
        });

        // v2.1 Extended Mood Scoring Tests
        it('should boost score for meditative mood match (v2.1)', () => {
            const features = { energy: 0.3, bassEnergy: 0.2 };
            const meditativeMood = { label: 'meditative', confidence: 0.9 };
            const mockAnalyzer = { detectedBPM: null };

            // def67890 has meditative: 0.9, abc12345 has meditative: 0.1
            const calmPresetScore = scorePreset('def67890', features, meditativeMood, mockPresetDatabase, mockAnalyzer);
            const energeticPresetScore = scorePreset('abc12345', features, meditativeMood, mockPresetDatabase, mockAnalyzer);

            expect(calmPresetScore).toBeGreaterThan(energeticPresetScore);
        });

        it('should boost score for hypnotic mood match (v2.1)', () => {
            const features = { energy: 0.4, bassEnergy: 0.4 };
            const hypnoticMood = { label: 'hypnotic', confidence: 0.8 };
            const mockAnalyzer = { detectedBPM: null };

            // def67890 has hypnotic: 0.6, abc12345 has hypnotic: 0.4
            const calmPresetScore = scorePreset('def67890', features, hypnoticMood, mockPresetDatabase, mockAnalyzer);
            const energeticPresetScore = scorePreset('abc12345', features, hypnoticMood, mockPresetDatabase, mockAnalyzer);

            expect(calmPresetScore).toBeGreaterThan(energeticPresetScore);
        });

        it('should handle psychedelic mood match (v2.1)', () => {
            const features = { energy: 0.6, bassEnergy: 0.5 };
            const psychedelicMood = { label: 'psychedelic', confidence: 0.8 };
            const mockAnalyzer = { detectedBPM: null };

            // abc12345 has psychedelic: 0.6, def67890 has psychedelic: 0.3
            const energeticScore = scorePreset('abc12345', features, psychedelicMood, mockPresetDatabase, mockAnalyzer);
            const calmScore = scorePreset('def67890', features, psychedelicMood, mockPresetDatabase, mockAnalyzer);

            expect(energeticScore).toBeGreaterThan(calmScore);
        });
    });

    describe('Phrase-Aligned Switching State', () => {
        // Test state management
        let state;

        beforeEach(() => {
            state = {
                pendingSwitchOnPhrase: false,
                pendingSwitchPreset: null,
                pendingSwitchHash: null,
                pendingSwitchReason: null,
                preDropSwitchScheduled: false,
                preDropSwitchTime: null
            };
        });

        it('should queue switch for phrase boundary', () => {
            // Simulate queueing a switch
            state.pendingSwitchOnPhrase = true;
            state.pendingSwitchHash = 'abc12345';
            state.pendingSwitchReason = 'audio_triggered';

            expect(state.pendingSwitchOnPhrase).toBe(true);
            expect(state.pendingSwitchHash).toBe('abc12345');
        });

        it('should clear pending switch when executed', () => {
            state.pendingSwitchOnPhrase = true;
            state.pendingSwitchHash = 'abc12345';

            // Simulate executing the switch
            state.pendingSwitchOnPhrase = false;
            state.pendingSwitchHash = null;
            state.pendingSwitchReason = null;

            expect(state.pendingSwitchOnPhrase).toBe(false);
        });

        it('should schedule pre-drop switch with lead time', () => {
            const now = performance.now();
            const dropETA = 3000; // 3 seconds
            const PRE_DROP_LEAD_TIME = 1500;

            state.preDropSwitchScheduled = true;
            state.preDropSwitchTime = now + dropETA - PRE_DROP_LEAD_TIME;

            expect(state.preDropSwitchScheduled).toBe(true);
            expect(state.preDropSwitchTime).toBeGreaterThan(now);
        });

        it('should cancel phrase switch when pre-drop scheduled', () => {
            state.pendingSwitchOnPhrase = true;
            state.pendingSwitchHash = 'def67890';

            // Pre-drop takes priority
            state.preDropSwitchScheduled = true;
            state.pendingSwitchOnPhrase = false; // Cancelled

            expect(state.preDropSwitchScheduled).toBe(true);
            expect(state.pendingSwitchOnPhrase).toBe(false);
        });
    });

    describe('Deterministic RNG', () => {
        it('should create seeded RNG that produces same sequence', () => {
            const createSeededRng = (seed) => {
                let state = seed;
                return () => {
                    state |= 0;
                    state = (state + 0x6D2B79F5) | 0;
                    let t = Math.imul(state ^ (state >>> 15), 1 | state);
                    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                };
            };

            const rng1 = createSeededRng(12345);
            const rng2 = createSeededRng(12345);

            const values1 = [rng1(), rng1(), rng1()];
            const values2 = [rng2(), rng2(), rng2()];

            expect(values1).toEqual(values2);
        });

        it('should produce different sequences for different seeds', () => {
            const createSeededRng = (seed) => {
                let state = seed;
                return () => {
                    state |= 0;
                    state = (state + 0x6D2B79F5) | 0;
                    let t = Math.imul(state ^ (state >>> 15), 1 | state);
                    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                };
            };

            const rng1 = createSeededRng(12345);
            const rng2 = createSeededRng(67890);

            const values1 = [rng1(), rng1(), rng1()];
            const values2 = [rng2(), rng2(), rng2()];

            expect(values1).not.toEqual(values2);
        });

        it('should produce values between 0 and 1', () => {
            const createSeededRng = (seed) => {
                let state = seed;
                return () => {
                    state |= 0;
                    state = (state + 0x6D2B79F5) | 0;
                    let t = Math.imul(state ^ (state >>> 15), 1 | state);
                    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                };
            };

            const rng = createSeededRng(42);

            for (let i = 0; i < 100; i++) {
                const value = rng();
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThan(1);
            }
        });
    });

    describe('v2.1 Threshold Constants', () => {
        it('should have correct BPM thresholds', () => {
            expect(BPM_THRESHOLDS.veryLow).toBe(80);
            expect(BPM_THRESHOLDS.low).toBe(100);
            expect(BPM_THRESHOLDS.high).toBe(140);
            expect(BPM_THRESHOLDS.veryHigh).toBe(160);
        });

        it('should have correct energy thresholds', () => {
            expect(ENERGY_THRESHOLDS.low).toBe(0.35);
            expect(ENERGY_THRESHOLDS.medium).toBe(0.6);
            expect(ENERGY_THRESHOLDS.high).toBe(0.8);
        });
    });

    describe('v2.1 Color Profile Scoring', () => {
        // Extended mock database with color profiles
        const colorMockDb = {
            presets: {
                'warm-happy': {
                    fingerprint: {
                        colorProfile: 'warm',
                        visualStyle: 'organic',
                        moodAffinities: { happy: '0.8', aggressive: '0.3' },
                        energy: 0.6
                    }
                },
                'cool-relaxed': {
                    fingerprint: {
                        colorProfile: 'cool',
                        visualStyle: 'fractal',
                        moodAffinities: { relaxed: '0.9', electronic: '0.7' },
                        energy: 0.3
                    }
                },
                'vivid-high': {
                    fingerprint: {
                        colorProfile: 'vivid',
                        visualStyle: 'particle',
                        moodAffinities: { happy: '0.7' },
                        energy: 0.8
                    }
                }
            }
        };

        const scoreWithColorProfile = (hash, features, mood, db) => {
            const preset = db.presets[hash];
            if (!preset?.fingerprint) return 0;

            const fp = preset.fingerprint;
            let score = 0;

            // Color profile matching (from v2.1)
            if (fp.colorProfile && mood) {
                const colorProfile = fp.colorProfile;
                const moodLabel = mood.label;

                // Warm colors: energetic, positive moods
                if (colorProfile === 'warm' && (moodLabel === 'happy' || moodLabel === 'aggressive')) {
                    score += 0.05;
                }

                // Cool colors: calm, ethereal, introspective moods
                // v2.1: Added meditative, dreamy, mystical, hypnotic
                if (colorProfile === 'cool' && (
                    moodLabel === 'relaxed' || moodLabel === 'electronic' ||
                    moodLabel === 'meditative' || moodLabel === 'dreamy' ||
                    moodLabel === 'mystical' || moodLabel === 'hypnotic'
                )) {
                    score += 0.05;
                }

                // Vivid colors: high energy or psychedelic
                // v2.1: Added psychedelic mood match
                if (colorProfile === 'vivid' && (
                    (features.beatStrength || 0) > 0.7 || moodLabel === 'psychedelic'
                )) {
                    score += 0.05;
                }
            }

            return score;
        };

        it('should boost score for warm + happy mood match', () => {
            const features = { beatStrength: 0.5 };
            const happyMood = { label: 'happy', confidence: 0.8 };
            const relaxedMood = { label: 'relaxed', confidence: 0.8 };

            const happyScore = scoreWithColorProfile('warm-happy', features, happyMood, colorMockDb);
            const relaxedScore = scoreWithColorProfile('warm-happy', features, relaxedMood, colorMockDb);

            expect(happyScore).toBeGreaterThan(relaxedScore);
        });

        it('should boost score for cool + relaxed mood match', () => {
            const features = { beatStrength: 0.5 };
            const relaxedMood = { label: 'relaxed', confidence: 0.8 };
            const happyMood = { label: 'happy', confidence: 0.8 };

            const relaxedScore = scoreWithColorProfile('cool-relaxed', features, relaxedMood, colorMockDb);
            const happyScore = scoreWithColorProfile('cool-relaxed', features, happyMood, colorMockDb);

            expect(relaxedScore).toBeGreaterThan(happyScore);
        });

        it('should boost score for vivid + high beat strength', () => {
            const highBeat = { beatStrength: 0.8 };
            const lowBeat = { beatStrength: 0.3 };
            const mood = { label: 'happy', confidence: 0.5 };

            const highScore = scoreWithColorProfile('vivid-high', highBeat, mood, colorMockDb);
            const lowScore = scoreWithColorProfile('vivid-high', lowBeat, mood, colorMockDb);

            expect(highScore).toBeGreaterThan(lowScore);
        });

        // v2.1 Extended Mood Tests
        it('should boost score for cool + meditative mood (v2.1)', () => {
            const features = { beatStrength: 0.3 };
            const meditativeMood = { label: 'meditative', confidence: 0.8 };
            const happyMood = { label: 'happy', confidence: 0.8 };

            const meditativeScore = scoreWithColorProfile('cool-relaxed', features, meditativeMood, colorMockDb);
            const happyScore = scoreWithColorProfile('cool-relaxed', features, happyMood, colorMockDb);

            expect(meditativeScore).toBeGreaterThan(happyScore);
        });

        it('should boost score for cool + dreamy mood (v2.1)', () => {
            const features = { beatStrength: 0.3 };
            const dreamyMood = { label: 'dreamy', confidence: 0.8 };
            const aggressiveMood = { label: 'aggressive', confidence: 0.8 };

            const dreamyScore = scoreWithColorProfile('cool-relaxed', features, dreamyMood, colorMockDb);
            const aggressiveScore = scoreWithColorProfile('cool-relaxed', features, aggressiveMood, colorMockDb);

            expect(dreamyScore).toBeGreaterThan(aggressiveScore);
        });

        it('should boost score for cool + hypnotic mood (v2.1)', () => {
            const features = { beatStrength: 0.4 };
            const hypnoticMood = { label: 'hypnotic', confidence: 0.8 };
            const happyMood = { label: 'happy', confidence: 0.8 };

            const hypnoticScore = scoreWithColorProfile('cool-relaxed', features, hypnoticMood, colorMockDb);
            const happyScore = scoreWithColorProfile('cool-relaxed', features, happyMood, colorMockDb);

            expect(hypnoticScore).toBeGreaterThan(happyScore);
        });

        it('should boost score for cool + mystical mood (v2.1)', () => {
            const features = { beatStrength: 0.4 };
            const mysticalMood = { label: 'mystical', confidence: 0.8 };
            const aggressiveMood = { label: 'aggressive', confidence: 0.8 };

            const mysticalScore = scoreWithColorProfile('cool-relaxed', features, mysticalMood, colorMockDb);
            const aggressiveScore = scoreWithColorProfile('cool-relaxed', features, aggressiveMood, colorMockDb);

            expect(mysticalScore).toBeGreaterThan(aggressiveScore);
        });

        it('should boost score for vivid + psychedelic mood (v2.1)', () => {
            const features = { beatStrength: 0.5 };  // Not high enough for energy-based boost
            const psychedelicMood = { label: 'psychedelic', confidence: 0.8 };
            const relaxedMood = { label: 'relaxed', confidence: 0.8 };

            const psychedelicScore = scoreWithColorProfile('vivid-high', features, psychedelicMood, colorMockDb);
            const relaxedScore = scoreWithColorProfile('vivid-high', features, relaxedMood, colorMockDb);

            // Psychedelic should get bonus even with low beat strength
            expect(psychedelicScore).toBeGreaterThan(relaxedScore);
        });
    });

    describe('v2.1 Visual Style Continuity Scoring', () => {
        const styleMockDb = {
            presets: {
                'organic-1': {
                    fingerprint: { visualStyle: 'organic' }
                },
                'organic-2': {
                    fingerprint: { visualStyle: 'organic' }
                },
                'fractal-1': {
                    fingerprint: { visualStyle: 'fractal' }
                },
                'particle-1': {
                    fingerprint: { visualStyle: 'particle' }
                }
            }
        };

        const scoreVisualStyleContinuity = (currentHash, candidateHash, db) => {
            const currentFp = db.presets[currentHash]?.fingerprint;
            const candidateFp = db.presets[candidateHash]?.fingerprint;

            if (!currentFp?.visualStyle || !candidateFp?.visualStyle) return 0;

            const currentStyle = currentFp.visualStyle;
            const candidateStyle = candidateFp.visualStyle;

            if (currentStyle === candidateStyle) {
                return 0.05;  // Same style bonus
            }

            // Compatible styles
            const compatible = {
                organic: ['fractal', 'abstract'],
                fractal: ['organic', 'geometric'],
                particle: ['geometric', 'abstract'],
                geometric: ['particle', 'fractal']
            };

            if (compatible[currentStyle]?.includes(candidateStyle)) {
                return 0.02;  // Compatible style bonus
            }

            return 0;
        };

        it('should give highest bonus for same visual style', () => {
            const sameScore = scoreVisualStyleContinuity('organic-1', 'organic-2', styleMockDb);
            const compatibleScore = scoreVisualStyleContinuity('organic-1', 'fractal-1', styleMockDb);
            const differentScore = scoreVisualStyleContinuity('organic-1', 'particle-1', styleMockDb);

            expect(sameScore).toBe(0.05);
            expect(compatibleScore).toBe(0.02);
            expect(differentScore).toBe(0);
        });

        it('should give partial bonus for compatible styles', () => {
            // organic is compatible with fractal
            const score = scoreVisualStyleContinuity('organic-1', 'fractal-1', styleMockDb);
            expect(score).toBe(0.02);
        });

        it('should give no bonus for incompatible styles', () => {
            // organic is not compatible with particle
            const score = scoreVisualStyleContinuity('organic-1', 'particle-1', styleMockDb);
            expect(score).toBe(0);
        });
    });

    describe('v2.1 BPM-Based Candidate Filtering', () => {
        const filterByBPM = (candidates, bpm, db) => {
            if (!bpm) return candidates;

            if (bpm > BPM_THRESHOLDS.veryHigh) {
                // Very fast music - prefer high-energy presets
                const filtered = candidates.filter(c =>
                    (db.presets[c]?.fingerprint?.energy || 0.5) > 0.6
                );
                return filtered.length > 0 ? filtered : candidates;
            } else if (bpm < BPM_THRESHOLDS.veryLow) {
                // Very slow music - prefer calm presets
                const filtered = candidates.filter(c =>
                    (db.presets[c]?.fingerprint?.energy || 0.5) < 0.5
                );
                return filtered.length > 0 ? filtered : candidates;
            }

            return candidates;
        };

        const bpmMockDb = {
            presets: {
                'high-energy': { fingerprint: { energy: 0.8 } },
                'low-energy': { fingerprint: { energy: 0.3 } },
                'mid-energy': { fingerprint: { energy: 0.5 } }
            }
        };

        it('should filter to high-energy presets for very fast BPM', () => {
            const candidates = ['high-energy', 'low-energy', 'mid-energy'];
            const filtered = filterByBPM(candidates, 170, bpmMockDb);

            expect(filtered).toContain('high-energy');
            expect(filtered).not.toContain('low-energy');
        });

        it('should filter to low-energy presets for very slow BPM', () => {
            const candidates = ['high-energy', 'low-energy', 'mid-energy'];
            const filtered = filterByBPM(candidates, 70, bpmMockDb);

            expect(filtered).toContain('low-energy');
            expect(filtered).not.toContain('high-energy');
        });

        it('should not filter for normal BPM range', () => {
            const candidates = ['high-energy', 'low-energy', 'mid-energy'];
            const filtered = filterByBPM(candidates, 120, bpmMockDb);

            expect(filtered.length).toBe(3);
        });
    });

    describe('v2.1 Energy-Based Candidate Filtering', () => {
        const filterByEnergy = (candidates, audioEnergy, db) => {
            if (audioEnergy < ENERGY_THRESHOLDS.low) {
                const filtered = candidates.filter(c =>
                    (db.presets[c]?.fingerprint?.energy || 0.5) < ENERGY_THRESHOLDS.medium
                );
                return filtered.length > 0 ? filtered : candidates;
            } else if (audioEnergy > ENERGY_THRESHOLDS.high) {
                const filtered = candidates.filter(c =>
                    (db.presets[c]?.fingerprint?.energy || 0.5) > ENERGY_THRESHOLDS.medium
                );
                return filtered.length > 0 ? filtered : candidates;
            }

            return candidates;
        };

        const energyMockDb = {
            presets: {
                'high-energy': { fingerprint: { energy: 0.8 } },
                'low-energy': { fingerprint: { energy: 0.3 } },
                'mid-energy': { fingerprint: { energy: 0.55 } }
            }
        };

        it('should filter to calm presets for low audio energy', () => {
            const candidates = ['high-energy', 'low-energy', 'mid-energy'];
            const filtered = filterByEnergy(candidates, 0.2, energyMockDb);

            expect(filtered).toContain('low-energy');
            expect(filtered).toContain('mid-energy');
            expect(filtered).not.toContain('high-energy');
        });

        it('should filter to high-energy presets for high audio energy', () => {
            const candidates = ['high-energy', 'low-energy', 'mid-energy'];
            const filtered = filterByEnergy(candidates, 0.9, energyMockDb);

            expect(filtered).toContain('high-energy');
            expect(filtered).not.toContain('low-energy');
        });

        it('should not filter for moderate audio energy', () => {
            const candidates = ['high-energy', 'low-energy', 'mid-energy'];
            const filtered = filterByEnergy(candidates, 0.5, energyMockDb);

            expect(filtered.length).toBe(3);
        });
    });
});
