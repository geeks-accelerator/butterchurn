import { describe, test, expect } from '@jest/globals';
import {
  deriveMusicalResponsiveness,
  determineTargetResponsiveness,
  getAllResponsivenessTypes
} from '../../src/taxonomy/musicalResponsiveness.js';

describe('musicalResponsiveness', () => {
  describe('deriveMusicalResponsiveness', () => {
    test('high beatSync → beat_detection', () => {
      expect(deriveMusicalResponsiveness({ beatSync: 0.6, bassEnergy: 0.3, trebleEnergy: 0.3 }))
        .toBe('beat_detection');
    });

    test('high bass + high treble → spectral_analysis', () => {
      expect(deriveMusicalResponsiveness({ beatSync: 0.3, bassEnergy: 0.5, trebleEnergy: 0.5 }))
        .toBe('spectral_analysis');
    });

    test('low everything → time_only', () => {
      expect(deriveMusicalResponsiveness({ beatSync: 0.05, bassEnergy: 0.1, trebleEnergy: 0.1 }))
        .toBe('time_only');
    });

    test('moderate bass or treble → volume_reactive', () => {
      expect(deriveMusicalResponsiveness({ beatSync: 0.2, bassEnergy: 0.3, trebleEnergy: 0.15 }))
        .toBe('volume_reactive');
    });

    test('very low values → basic_audio', () => {
      expect(deriveMusicalResponsiveness({ beatSync: 0.15, bassEnergy: 0.18, trebleEnergy: 0.18 }))
        .toBe('basic_audio');
    });

    test('handles missing fields with defaults', () => {
      // Empty object → all fields default to 0 → time_only (very low audio usage)
      expect(deriveMusicalResponsiveness({})).toBe('time_only');
    });

    test('accepts alternate field names (bass instead of bassEnergy)', () => {
      expect(deriveMusicalResponsiveness({ beat: 0.6, bass: 0.3 }))
        .toBe('beat_detection');
    });
  });

  describe('determineTargetResponsiveness', () => {
    test('high beatStrength → beat_detection', () => {
      expect(determineTargetResponsiveness({ beatStrength: 0.8, bassEnergy: 0.3, trebleEnergy: 0.3, energy: 0.5 }))
        .toBe('beat_detection');
    });

    test('low energy → time_only', () => {
      expect(determineTargetResponsiveness({ beatStrength: 0.3, bassEnergy: 0.3, trebleEnergy: 0.3, energy: 0.15 }))
        .toBe('time_only');
    });

    test('high bass + high treble → spectral_analysis', () => {
      expect(determineTargetResponsiveness({ beatStrength: 0.3, bassEnergy: 0.6, trebleEnergy: 0.6, energy: 0.5 }))
        .toBe('spectral_analysis');
    });
  });

  describe('getAllResponsivenessTypes', () => {
    test('returns 5 types', () => {
      const types = getAllResponsivenessTypes();
      expect(types).toHaveLength(5);
      expect(types).toContain('spectral_analysis');
      expect(types).toContain('beat_detection');
      expect(types).toContain('volume_reactive');
      expect(types).toContain('time_only');
      expect(types).toContain('basic_audio');
    });
  });
});
