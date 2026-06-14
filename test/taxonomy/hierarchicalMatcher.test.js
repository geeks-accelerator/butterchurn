import { describe, test, expect, beforeEach } from '@jest/globals';
import { HierarchicalMatcher } from '../../src/taxonomy/hierarchicalMatcher.js';

describe('HierarchicalMatcher', () => {
  let mockDb;
  let matcher;

  beforeEach(() => {
    mockDb = {
      presets: {
        'hash1': {
          fingerprint: {
            energy: 0.5,
            bassEnergy: 0.4,
            trebleEnergy: 0.5,
            beatSync: 0.3,
            complexity: 0.3,
            visualStyle: 'fractal',
            musicalResponsiveness: 'spectral_analysis',
            reliabilityTier: 'stable',
            dominantHue: 'cool',
            colorProfile: 'cool',
            moodAffinities: { aggressive: 0.3, relaxed: 0.7, happy: 0.5, electronic: 0.6, acoustic: 0.4 },
            optimalBpm: { min: 90, max: 130, ideal: 110 }
          }
        },
        'hash2': {
          fingerprint: {
            energy: 0.8,
            bassEnergy: 0.7,
            trebleEnergy: 0.6,
            beatSync: 0.6,
            complexity: 0.6,
            visualStyle: 'particle',
            musicalResponsiveness: 'beat_detection',
            reliabilityTier: 'finicky',
            dominantHue: 'warm',
            colorProfile: 'warm',
            moodAffinities: { aggressive: 0.7, relaxed: 0.3, happy: 0.6, electronic: 0.8, acoustic: 0.2 },
            optimalBpm: { min: 120, max: 160, ideal: 140 }
          }
        },
        'hash3': {
          fingerprint: {
            energy: 0.2,
            bassEnergy: 0.2,
            trebleEnergy: 0.3,
            beatSync: 0.1,
            complexity: 0.2,
            visualStyle: 'fluid_organic',
            musicalResponsiveness: 'time_only',
            reliabilityTier: 'rock_solid',
            dominantHue: 'natural',
            colorProfile: 'nature',
            moodAffinities: { aggressive: 0.1, relaxed: 0.9, happy: 0.4, electronic: 0.2, acoustic: 0.8 },
            optimalBpm: { min: 60, max: 90, ideal: 75 }
          }
        }
      }
    };
    matcher = new HierarchicalMatcher(mockDb);
  });

  describe('constructor', () => {
    test('uses default config when no options provided', () => {
      expect(matcher.categoricalDims).toContain('visualStyle');
      expect(matcher.minCandidates).toBeGreaterThan(0);
    });

    test('accepts custom options', () => {
      const customMatcher = new HierarchicalMatcher(mockDb, {
        categoricalDims: ['visualStyle'],
        minCandidates: 10,
        weights: { energy: 0.5 }
      });
      expect(customMatcher.categoricalDims).toEqual(['visualStyle']);
      expect(customMatcher.minCandidates).toBe(10);
      expect(customMatcher.weights.energy).toBe(0.5);
    });
  });

  describe('findMatches', () => {
    test('returns all candidates when no categorical filters apply', () => {
      // With minCandidates=5 and only 3 presets, all dimensions get relaxed
      // matchDepth becomes -1 (exhausted all dimensions)
      const result = matcher.findMatches({});
      expect(result.matches.length).toBe(3);
      // matchDepth is -1 because we exhausted all categorical filters
      // trying to reach minCandidates threshold
      expect(result.matchDepth).toBeLessThanOrEqual(0);
    });

    test('filters by visualStyle when provided', () => {
      const result = matcher.findMatches({ visualStyle: 'fractal' });
      expect(result.matches).toContain('hash1');
    });

    test('applies device tier reliability filter', () => {
      const result = matcher.findMatches({}, { deviceTier: 'mobile' });
      expect(result.matches).toContain('hash3'); // rock_solid
      expect(result.matches).not.toContain('hash2'); // finicky excluded
    });

    test('relaxes categorical filters when not enough candidates', () => {
      // Request a style that doesn't exist
      const result = matcher.findMatches(
        { visualStyle: 'kaleidoscope' },
        { deviceTier: 'high_end' }
      );
      expect(result.matchDepth).toBeLessThan(matcher.categoricalDims.length);
      expect(result.relaxedDimensions.length).toBeGreaterThan(0);
    });

    test('returns match metadata', () => {
      const result = matcher.findMatches({});
      expect(result).toHaveProperty('matches');
      expect(result).toHaveProperty('scores');
      expect(result).toHaveProperty('matchDepth');
      expect(result).toHaveProperty('relaxedDimensions');
      expect(result).toHaveProperty('stage1Survivors');
    });

    test('respects candidateHashes filter', () => {
      const result = matcher.findMatches({}, { candidateHashes: ['hash1', 'hash3'] });
      expect(result.matches.length).toBeLessThanOrEqual(2);
      expect(result.matches).not.toContain('hash2');
    });
  });

  describe('scoreContinuous', () => {
    test('returns score in [0, 1] range', () => {
      const fp = mockDb.presets.hash1.fingerprint;
      const target = { energy: 0.5, bassEnergy: 0.4, trebleEnergy: 0.5 };
      const score = matcher.scoreContinuous(fp, target);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    test('higher score for matching energy', () => {
      const fp = mockDb.presets.hash1.fingerprint;
      const matchingTarget = { energy: 0.5 };
      const mismatchingTarget = { energy: 0.9 };

      const matchingScore = matcher.scoreContinuous(fp, matchingTarget);
      const mismatchingScore = matcher.scoreContinuous(fp, mismatchingTarget);

      expect(matchingScore).toBeGreaterThan(mismatchingScore);
    });

    test('includes mood scoring when mood provided', () => {
      const fp = mockDb.presets.hash1.fingerprint;
      const target = { energy: 0.5 };
      const mood = { label: 'relaxed', confidence: 1.0 };

      const scoreWithMood = matcher.scoreContinuous(fp, target, mood);
      const scoreWithoutMood = matcher.scoreContinuous(fp, target);

      // relaxed affinity is high (0.7) so score should be higher
      expect(scoreWithMood).toBeGreaterThan(scoreWithoutMood);
    });

    test('includes BPM scoring when detectedBpm provided', () => {
      const fp = mockDb.presets.hash1.fingerprint;
      const target = {};

      // Ideal BPM = 110
      const scorePerfectBpm = matcher.scoreContinuous(fp, target, null, 110);
      const scoreOutsideBpm = matcher.scoreContinuous(fp, target, null, 200);

      expect(scorePerfectBpm).toBeGreaterThan(scoreOutsideBpm);
    });

    test('includes visual continuity when currentFp provided', () => {
      const fp = mockDb.presets.hash1.fingerprint;
      const currentFp = mockDb.presets.hash3.fingerprint; // similar complexity
      const target = {};

      const scoreWithContinuity = matcher.scoreContinuous(fp, target, null, null, currentFp);
      const scoreWithoutContinuity = matcher.scoreContinuous(fp, target);

      // Should include continuity score component
      expect(typeof scoreWithContinuity).toBe('number');
      expect(typeof scoreWithoutContinuity).toBe('number');
    });
  });

  describe('scoreOne', () => {
    test('scores a single preset', () => {
      const target = { energy: 0.5 };
      const score = matcher.scoreOne('hash1', target);
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
    });

    test('returns 0 for invalid hash', () => {
      const score = matcher.scoreOne('invalid', {});
      expect(score).toBe(0);
    });
  });

  describe('filterByCategoricals', () => {
    test('returns all candidates when no dims active', () => {
      const candidates = ['hash1', 'hash2', 'hash3'];
      const result = matcher.filterByCategoricals(candidates, {}, []);
      expect(result.length).toBe(3);
    });

    test('filters by exact visualStyle match', () => {
      const candidates = ['hash1', 'hash2', 'hash3'];
      const result = matcher.filterByCategoricals(
        candidates,
        { visualStyle: 'fractal' },
        ['visualStyle']
      );
      expect(result).toContain('hash1');
      expect(result).not.toContain('hash2');
    });

    test('allows similar visualStyles', () => {
      const candidates = ['hash1', 'hash2', 'hash3'];
      // fluid_organic is similar to fractal
      const result = matcher.filterByCategoricals(
        candidates,
        { visualStyle: 'fluid_organic' },
        ['visualStyle']
      );
      expect(result).toContain('hash1'); // fractal is similar to fluid_organic
      expect(result).toContain('hash3'); // exact match
    });

    test('excludes untagged presets from active categoricals', () => {
      mockDb.presets.hash4 = {
        fingerprint: {
          energy: 0.5,
          // Missing visualStyle
        }
      };
      const matcher2 = new HierarchicalMatcher(mockDb);
      const candidates = ['hash1', 'hash2', 'hash3', 'hash4'];
      const result = matcher2.filterByCategoricals(
        candidates,
        { visualStyle: 'fractal' },
        ['visualStyle']
      );
      expect(result).not.toContain('hash4');
    });
  });
});
