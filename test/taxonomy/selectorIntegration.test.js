import { describe, test, expect, beforeEach } from '@jest/globals';

// Mock the modules that would normally be dynamically imported
const mockDb = {
  presets: {
    'hash1': {
      names: ['Test Preset 1'],
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
        moodAffinities: { aggressive: 0.3, relaxed: 0.7, happy: 0.5, electronic: 0.6 },
        optimalBpm: { min: 90, max: 130, ideal: 110 }
      }
    },
    'hash2': {
      names: ['Test Preset 2'],
      fingerprint: {
        energy: 0.8,
        bassEnergy: 0.7,
        trebleEnergy: 0.6,
        beatSync: 0.6,
        complexity: 0.6,
        visualStyle: 'particle',
        musicalResponsiveness: 'beat_detection',
        reliabilityTier: 'stable',
        dominantHue: 'warm',
        colorProfile: 'warm',
        moodAffinities: { aggressive: 0.7, relaxed: 0.3, happy: 0.6, electronic: 0.8 },
        optimalBpm: { min: 120, max: 160, ideal: 140 }
      }
    },
    'hash3': {
      names: ['Test Preset 3'],
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
        moodAffinities: { aggressive: 0.1, relaxed: 0.9, happy: 0.4, electronic: 0.2 },
        optimalBpm: { min: 60, max: 90, ideal: 75 }
      }
    }
  },
  indices: {
    high: ['hash2'],
    calm: ['hash3'],
    bass: ['hash1', 'hash2'],
    fractal: ['hash1'],
    particle: ['hash2'],
    organic: ['hash3']
  }
};

// Import after mocking
import IntelligentPresetSelector from '../../src/intelligentPresetSelector.js';

describe('IntelligentPresetSelector + HierarchicalMatcher Integration', () => {
  let selector;
  const mockButterchurn = {
    loadPreset: () => {},
    getRendererProps: () => ({ texsizeX: 800, texsizeY: 600 })
  };

  beforeEach(() => {
    selector = new IntelligentPresetSelector(mockButterchurn, mockDb, { rngSeed: 42 });
  });

  describe('HierarchicalMatcher initialization', () => {
    test('initializes matcher when database is provided', () => {
      expect(selector.hierarchicalMatcher).not.toBeNull();
    });

    test('matcher has correct database reference', () => {
      expect(selector.hierarchicalMatcher.db).toBe(mockDb);
    });

    test('feature flag enables matcher by default', () => {
      expect(selector.useHierarchicalMatcher).toBe(true);
    });
  });

  describe('selectBestPresetWithLogic uses matcher', () => {
    test('returns result with hierarchical_matcher method', () => {
      const features = { energy: 0.5, bassEnergy: 0.4, trebleEnergy: 0.5 };
      const result = selector.selectBestPresetWithLogic(features);

      expect(result.logic.method).toBe('hierarchical_matcher');
    });

    test('includes matchDepth in logic', () => {
      const features = { energy: 0.5, bassEnergy: 0.4, trebleEnergy: 0.5 };
      const result = selector.selectBestPresetWithLogic(features);

      expect(result.logic.matchDepth).toBeDefined();
      expect(typeof result.logic.matchDepth).toBe('number');
    });

    test('returns valid preset hash', () => {
      const features = { energy: 0.5, bassEnergy: 0.4, trebleEnergy: 0.5 };
      const result = selector.selectBestPresetWithLogic(features);

      expect(result.bestHash).toBeTruthy();
      expect(Object.keys(mockDb.presets)).toContain(result.bestHash);
    });

    test('respects mood parameter', () => {
      const features = { energy: 0.5, bassEnergy: 0.4, trebleEnergy: 0.5 };
      const mood = { label: 'relaxed', confidence: 0.9 };
      const result = selector.selectBestPresetWithLogic(features, mood);

      expect(result.logic.mood).toBe('relaxed');
    });
  });

  describe('falls back to legacy when matcher disabled', () => {
    test('uses legacy method when flag disabled', () => {
      selector.useHierarchicalMatcher = false;
      const features = { energy: 0.5, bassEnergy: 0.4, trebleEnergy: 0.5 };
      const result = selector.selectBestPresetWithLogic(features);

      expect(result.logic.method).toBe('legacy');
    });

    test('uses legacy method when matcher is null', () => {
      selector.hierarchicalMatcher = null;
      const features = { energy: 0.5, bassEnergy: 0.4, trebleEnergy: 0.5 };
      const result = selector.selectBestPresetWithLogic(features);

      expect(result.logic.method).toBe('legacy');
    });
  });

  describe('updateFingerprintDatabase reinitializes matcher', () => {
    test('updates matcher with new database', () => {
      const newDb = {
        presets: {
          'newhash': {
            names: ['New Preset'],
            fingerprint: { energy: 0.6, reliabilityTier: 'stable' }
          }
        }
      };

      selector.updateFingerprintDatabase(newDb);

      expect(selector.hierarchicalMatcher).not.toBeNull();
      expect(selector.hierarchicalMatcher.db).toBe(newDb);
    });
  });
});
