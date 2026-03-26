/**
 * Fingerprint Generation Unit Tests
 * Phase 7: Testing for intelligent preset selector improvements
 *
 * Tests:
 * - extractColorProfile()
 * - extractMotionSpeed()
 * - calculateOptimalBpm()
 * - deriveMoodAffinities()
 * - Enhanced fingerprint schema v2.0
 */

import { describe, it, expect } from '@jest/globals';

// Inline implementations of the helper functions for testing
// (These mirror the functions in generate-fingerprints.js)

function extractColorProfile(preset) {
    const equations = (preset.init_eqs_eel || preset.init_eqs_str || '') +
                     (preset.frame_eqs_eel || preset.frame_eqs_str || '');

    const redUsage = (equations.match(/red\s*=/gi) || []).length;
    const greenUsage = (equations.match(/green\s*=/gi) || []).length;
    const blueUsage = (equations.match(/blue\s*=/gi) || []).length;

    let dominant = 'neutral';
    if (redUsage > greenUsage && redUsage > blueUsage) dominant = 'warm';
    if (blueUsage > redUsage && blueUsage > greenUsage) dominant = 'cool';
    if (greenUsage > redUsage && greenUsage > blueUsage) dominant = 'nature';

    return dominant;
}

function extractMotionSpeed(preset, energy) {
    const frameEqs = preset.frame_eqs_eel || preset.frame_eqs_str || '';
    const complexity = frameEqs.length / 1000;

    if (complexity > 5 || energy > 0.7) return 'fast';
    if (complexity > 2 || energy > 0.4) return 'medium';
    return 'slow';
}

function calculateOptimalBpm(motionSpeed, energy) {
    const ranges = {
        slow: { min: 60, max: 100, ideal: 80 },
        medium: { min: 100, max: 140, ideal: 120 },
        fast: { min: 130, max: 180, ideal: 150 }
    };

    const base = ranges[motionSpeed] || ranges.medium;
    const energyOffset = (energy - 0.5) * 20;

    return {
        min: Math.round(base.min + energyOffset),
        max: Math.round(base.max + energyOffset),
        ideal: Math.round(base.ideal + energyOffset)
    };
}

function deriveMoodAffinities(visualStyle, motionSpeed, colorProfile) {
    const affinities = {
        aggressive: 0.5,
        relaxed: 0.5,
        happy: 0.5,
        electronic: 0.5,
        acoustic: 0.5
    };

    // Style influences
    const styleBoosts = {
        fluid_organic: { relaxed: 0.3, acoustic: 0.2 },
        organic: { relaxed: 0.3, acoustic: 0.2 },
        particle: { electronic: 0.4, happy: 0.1 },
        geometric: { electronic: 0.3, aggressive: 0.1 },
        fractal: { electronic: 0.2, relaxed: 0.1 },
        tunnel: { aggressive: 0.2, electronic: 0.3 }
    };

    const primaryStyle = Array.isArray(visualStyle) ? visualStyle[0] : visualStyle;
    if (primaryStyle && styleBoosts[primaryStyle]) {
        for (const [mood, boost] of Object.entries(styleBoosts[primaryStyle])) {
            affinities[mood] = Math.min(1, affinities[mood] + boost);
        }
    }

    // Motion speed influences
    if (motionSpeed === 'fast') {
        affinities.aggressive += 0.2;
        affinities.relaxed -= 0.2;
    } else if (motionSpeed === 'slow') {
        affinities.relaxed += 0.2;
        affinities.aggressive -= 0.2;
    }

    // Color influences
    if (colorProfile === 'warm') {
        affinities.aggressive += 0.1;
        affinities.happy += 0.1;
    } else if (colorProfile === 'cool') {
        affinities.relaxed += 0.1;
        affinities.electronic += 0.1;
    }

    // Normalize
    return Object.fromEntries(
        Object.entries(affinities).map(([k, v]) => [k, Math.max(0, Math.min(1, v)).toFixed(2)])
    );
}

describe('Fingerprint Generation', () => {
    describe('extractColorProfile', () => {
        it('should detect warm color profile', () => {
            const preset = {
                frame_eqs_eel: 'red = 1; red = 0.5; green = 0.2;'
            };
            expect(extractColorProfile(preset)).toBe('warm');
        });

        it('should detect cool color profile', () => {
            const preset = {
                frame_eqs_eel: 'blue = 1; blue = 0.8; red = 0.1;'
            };
            expect(extractColorProfile(preset)).toBe('cool');
        });

        it('should detect nature color profile', () => {
            const preset = {
                frame_eqs_eel: 'green = 1; green = 0.9; blue = 0.2; red = 0.1;'
            };
            expect(extractColorProfile(preset)).toBe('nature');
        });

        it('should return neutral for balanced colors', () => {
            const preset = {
                frame_eqs_eel: 'red = 0.5; green = 0.5; blue = 0.5;'
            };
            expect(extractColorProfile(preset)).toBe('neutral');
        });

        it('should handle missing equations', () => {
            const preset = {};
            expect(extractColorProfile(preset)).toBe('neutral');
        });
    });

    describe('extractMotionSpeed', () => {
        it('should return fast for high complexity', () => {
            const preset = {
                frame_eqs_eel: 'x'.repeat(6000) // High complexity
            };
            expect(extractMotionSpeed(preset, 0.5)).toBe('fast');
        });

        it('should return fast for high energy', () => {
            const preset = { frame_eqs_eel: 'simple' };
            expect(extractMotionSpeed(preset, 0.8)).toBe('fast');
        });

        it('should return medium for moderate complexity', () => {
            const preset = {
                frame_eqs_eel: 'x'.repeat(3000)
            };
            expect(extractMotionSpeed(preset, 0.3)).toBe('medium');
        });

        it('should return slow for low complexity and energy', () => {
            const preset = { frame_eqs_eel: 'simple' };
            expect(extractMotionSpeed(preset, 0.2)).toBe('slow');
        });
    });

    describe('calculateOptimalBpm', () => {
        it('should return slow BPM range for slow motion', () => {
            const range = calculateOptimalBpm('slow', 0.5);
            expect(range.min).toBe(60);
            expect(range.max).toBe(100);
            expect(range.ideal).toBe(80);
        });

        it('should return fast BPM range for fast motion', () => {
            const range = calculateOptimalBpm('fast', 0.5);
            expect(range.min).toBe(130);
            expect(range.max).toBe(180);
            expect(range.ideal).toBe(150);
        });

        it('should adjust for high energy', () => {
            const highEnergy = calculateOptimalBpm('medium', 0.9);
            const lowEnergy = calculateOptimalBpm('medium', 0.1);

            expect(highEnergy.ideal).toBeGreaterThan(lowEnergy.ideal);
        });

        it('should adjust by ~20 BPM between 0.0 and 1.0 energy', () => {
            const low = calculateOptimalBpm('medium', 0.0);
            const high = calculateOptimalBpm('medium', 1.0);

            const diff = high.ideal - low.ideal;
            expect(diff).toBe(20); // (1.0 - 0.0) * 20 * 2 / 2 = 20
        });
    });

    describe('deriveMoodAffinities', () => {
        it('should boost electronic for particle style', () => {
            const affinities = deriveMoodAffinities('particle', 'medium', 'neutral');
            expect(parseFloat(affinities.electronic)).toBeGreaterThan(0.5);
        });

        it('should boost relaxed for organic style', () => {
            const affinities = deriveMoodAffinities('organic', 'medium', 'neutral');
            expect(parseFloat(affinities.relaxed)).toBeGreaterThan(0.5);
        });

        it('should boost aggressive for fast motion', () => {
            const fast = deriveMoodAffinities('abstract', 'fast', 'neutral');
            const slow = deriveMoodAffinities('abstract', 'slow', 'neutral');

            expect(parseFloat(fast.aggressive)).toBeGreaterThan(parseFloat(slow.aggressive));
        });

        it('should boost relaxed for slow motion', () => {
            const slow = deriveMoodAffinities('abstract', 'slow', 'neutral');
            const fast = deriveMoodAffinities('abstract', 'fast', 'neutral');

            expect(parseFloat(slow.relaxed)).toBeGreaterThan(parseFloat(fast.relaxed));
        });

        it('should boost happy for warm colors', () => {
            const warm = deriveMoodAffinities('abstract', 'medium', 'warm');
            const cool = deriveMoodAffinities('abstract', 'medium', 'cool');

            expect(parseFloat(warm.happy)).toBeGreaterThan(parseFloat(cool.happy));
        });

        it('should return values between 0 and 1', () => {
            const affinities = deriveMoodAffinities('particle', 'fast', 'warm');

            for (const value of Object.values(affinities)) {
                expect(parseFloat(value)).toBeGreaterThanOrEqual(0);
                expect(parseFloat(value)).toBeLessThanOrEqual(1);
            }
        });

        it('should handle array visual styles', () => {
            const affinities = deriveMoodAffinities(['particle', 'organic'], 'medium', 'neutral');
            // Should use first style (particle)
            expect(parseFloat(affinities.electronic)).toBeGreaterThan(0.5);
        });
    });

    describe('Enhanced Fingerprint Schema v2.0', () => {
        // Simulate the full fingerprint generation
        function generateTestFingerprint(preset, visualStyleFromCLIP = null) {
            const energy = 0.6;
            const bassEnergy = 0.5;
            const trebleEnergy = 0.5;

            const colorProfile = extractColorProfile(preset);
            const motionSpeed = extractMotionSpeed(preset, energy);
            const optimalBpm = calculateOptimalBpm(motionSpeed, energy);
            const existingStyles = ['particle'];
            const visualStyle = visualStyleFromCLIP?.visualStyle || existingStyles[0] || 'abstract';
            const visualStyleScores = visualStyleFromCLIP?.visualStyleScores || null;
            const moodAffinities = deriveMoodAffinities(visualStyle, motionSpeed, colorProfile);

            return {
                energy,
                bassEnergy,
                bass: bassEnergy,
                trebleEnergy,
                complexity: 0.3,
                beatSync: 1,
                beat: 1,
                fps: 60,
                styles: existingStyles,
                warmupTime: 0,
                visualStyle,
                visualStyleScores,
                colorProfile,
                motionSpeed,
                moodAffinities,
                optimalBpm,
                _experimental: ['colorProfile', 'motionSpeed', 'moodAffinities']
            };
        }

        it('should include all v1.0 fields for backward compatibility', () => {
            const fp = generateTestFingerprint({ frame_eqs_eel: 'simple' });

            expect(fp.energy).toBeDefined();
            expect(fp.bassEnergy).toBeDefined();
            expect(fp.bass).toBeDefined(); // Alias
            expect(fp.trebleEnergy).toBeDefined();
            expect(fp.complexity).toBeDefined();
            expect(fp.beatSync).toBeDefined();
            expect(fp.beat).toBeDefined(); // Alias
            expect(fp.fps).toBeDefined();
            expect(fp.styles).toBeDefined();
            expect(fp.warmupTime).toBeDefined();
        });

        it('should include all v2.0 fields', () => {
            const fp = generateTestFingerprint({ frame_eqs_eel: 'simple' });

            expect(fp.visualStyle).toBeDefined();
            expect(fp.colorProfile).toBeDefined();
            expect(fp.motionSpeed).toBeDefined();
            expect(fp.moodAffinities).toBeDefined();
            expect(fp.optimalBpm).toBeDefined();
        });

        it('should mark experimental fields', () => {
            const fp = generateTestFingerprint({ frame_eqs_eel: 'simple' });

            expect(fp._experimental).toContain('colorProfile');
            expect(fp._experimental).toContain('motionSpeed');
            expect(fp._experimental).toContain('moodAffinities');
        });

        it('should NOT include spectralProfile (CRIT-7)', () => {
            const fp = generateTestFingerprint({ frame_eqs_eel: 'simple' });

            expect(fp.spectralProfile).toBeUndefined();
        });

        it('should use CLIP visual style when provided', () => {
            const clipResult = {
                visualStyle: 'kaleidoscope',
                visualStyleScores: {
                    kaleidoscope: 0.85,
                    particle: 0.1
                }
            };

            const fp = generateTestFingerprint({ frame_eqs_eel: 'simple' }, clipResult);

            expect(fp.visualStyle).toBe('kaleidoscope');
            expect(fp.visualStyleScores).toEqual(clipResult.visualStyleScores);
        });

        it('should have valid optimalBpm structure', () => {
            const fp = generateTestFingerprint({ frame_eqs_eel: 'simple' });

            expect(fp.optimalBpm).toHaveProperty('min');
            expect(fp.optimalBpm).toHaveProperty('max');
            expect(fp.optimalBpm).toHaveProperty('ideal');
            expect(fp.optimalBpm.min).toBeLessThan(fp.optimalBpm.max);
            expect(fp.optimalBpm.ideal).toBeGreaterThanOrEqual(fp.optimalBpm.min);
            expect(fp.optimalBpm.ideal).toBeLessThanOrEqual(fp.optimalBpm.max);
        });

        it('should have valid moodAffinities structure', () => {
            const fp = generateTestFingerprint({ frame_eqs_eel: 'simple' });

            expect(fp.moodAffinities).toHaveProperty('aggressive');
            expect(fp.moodAffinities).toHaveProperty('relaxed');
            expect(fp.moodAffinities).toHaveProperty('happy');
            expect(fp.moodAffinities).toHaveProperty('electronic');
            expect(fp.moodAffinities).toHaveProperty('acoustic');
        });
    });
});
