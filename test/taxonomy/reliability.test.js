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

    test('heavy pixel_eqs triggers finicky regardless of complexity (Pass 22 fix)', () => {
      // Pass 22: heavyPixel always triggers finicky - this is a performance concern
      const longPixelEqs = 'a'.repeat(250);
      expect(deriveReliabilityTier({ complexity: 0.2, warmupTime: 0 }, { pixel_eqs_str: longPixelEqs }))
        .toBe('finicky');
      expect(deriveReliabilityTier({ complexity: 0.55, warmupTime: 0 }, { pixel_eqs_str: longPixelEqs }))
        .toBe('finicky');
    });

    test('moderate complexity with brief warmup (3) → stable (Pass 22 fix)', () => {
      // Pass 22: warmup threshold raised from >2 to >5 for finicky
      // warmup 3 + complexity < 0.7 + no heavyPixel → stable
      expect(deriveReliabilityTier({ complexity: 0.65, warmupTime: 3 }, {}))
        .toBe('stable');
    });

    test('very long warmup (>5) → finicky', () => {
      // Pass 22: warmup > 5 triggers finicky
      expect(deriveReliabilityTier({ complexity: 0.65, warmupTime: 6 }, {}))
        .toBe('finicky');
      expect(deriveReliabilityTier({ complexity: 0.85, warmupTime: 6 }, {}))
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
