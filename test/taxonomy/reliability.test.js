import { describe, test, expect } from '@jest/globals';
import {
  deriveReliabilityTier,
  tiersAllowedForDevice,
  getAllReliabilityTiers
} from '../../src/taxonomy/reliability.js';

describe('reliability', () => {
  describe('deriveReliabilityTier', () => {
    test('low complexity + no warmup + no heavy pixel → rock_solid', () => {
      expect(deriveReliabilityTier({ complexity: 0.2, warmupTime: 0 }, { pixel_eqs_str: '' }))
        .toBe('rock_solid');
    });

    test('moderate complexity + brief warmup → stable', () => {
      expect(deriveReliabilityTier({ complexity: 0.4, warmupTime: 1 }, { pixel_eqs_str: '', comp_eqs_str: '' }))
        .toBe('stable');
    });

    test('heavy pixel_eqs prevents rock_solid → stable', () => {
      // heavyPixel blocks rock_solid tier, falls to stable
      const longPixelEqs = 'a'.repeat(250);
      expect(deriveReliabilityTier({ complexity: 0.2, warmupTime: 0 }, { pixel_eqs_str: longPixelEqs }))
        .toBe('stable');
    });

    test('heavy pixel_eqs with moderate complexity → finicky', () => {
      // heavyPixel triggers finicky condition
      const longPixelEqs = 'a'.repeat(250);
      expect(deriveReliabilityTier({ complexity: 0.55, warmupTime: 0 }, { pixel_eqs_str: longPixelEqs }))
        .toBe('finicky');
    });

    test('high complexity with long warmup → finicky', () => {
      // warmup > 2 triggers finicky regardless of complexity
      expect(deriveReliabilityTier({ complexity: 0.65, warmupTime: 3 }, {}))
        .toBe('finicky');
      expect(deriveReliabilityTier({ complexity: 0.85, warmupTime: 3 }, {}))
        .toBe('finicky');
    });

    test('high complexity without triggers → experimental', () => {
      // complexity >= 0.7 AND warmup <= 2 AND no heavyPixel → falls through to experimental
      expect(deriveReliabilityTier({ complexity: 0.8, warmupTime: 0 }, {}))
        .toBe('experimental');
    });

    test('handles missing fields with defaults', () => {
      expect(deriveReliabilityTier({}, {})).toBe('rock_solid');
    });
  });

  describe('tiersAllowedForDevice', () => {
    test('mobile → only rock_solid', () => {
      expect(tiersAllowedForDevice('mobile')).toEqual(['rock_solid']);
    });

    test('low_end → rock_solid + stable', () => {
      expect(tiersAllowedForDevice('low_end')).toEqual(['rock_solid', 'stable']);
    });

    test('mid_range → rock_solid + stable + finicky', () => {
      expect(tiersAllowedForDevice('mid_range')).toEqual(['rock_solid', 'stable', 'finicky']);
    });

    test('high_end → all tiers', () => {
      expect(tiersAllowedForDevice('high_end')).toEqual(['rock_solid', 'stable', 'finicky', 'experimental']);
    });

    test('unknown device → default (rock_solid + stable + finicky)', () => {
      expect(tiersAllowedForDevice('unknown')).toEqual(['rock_solid', 'stable', 'finicky']);
    });
  });

  describe('getAllReliabilityTiers', () => {
    test('returns 4 tiers', () => {
      const tiers = getAllReliabilityTiers();
      expect(tiers).toHaveLength(4);
      expect(tiers).toContain('rock_solid');
      expect(tiers).toContain('stable');
      expect(tiers).toContain('finicky');
      expect(tiers).toContain('experimental');
    });
  });
});
