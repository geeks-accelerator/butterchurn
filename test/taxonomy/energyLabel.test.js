import { describe, test, expect } from '@jest/globals';
import { deriveEnergyLabel, ENERGY_LABELS, getAllEnergyLabels } from '../../src/taxonomy/energyLabel.js';

describe('energyLabel', () => {
  describe('deriveEnergyLabel', () => {
    test('boundary values map per half-open intervals', () => {
      expect(deriveEnergyLabel(0)).toBe('calm');
      expect(deriveEnergyLabel(0.19999)).toBe('calm');
      expect(deriveEnergyLabel(0.2)).toBe('flowing');
      expect(deriveEnergyLabel(0.39999)).toBe('flowing');
      expect(deriveEnergyLabel(0.4)).toBe('dynamic');
      expect(deriveEnergyLabel(0.59999)).toBe('dynamic');
      expect(deriveEnergyLabel(0.6)).toBe('energetic');
      expect(deriveEnergyLabel(0.79999)).toBe('energetic');
      expect(deriveEnergyLabel(0.8)).toBe('intense');
      expect(deriveEnergyLabel(0.94999)).toBe('intense');
      expect(deriveEnergyLabel(0.95)).toBe('explosive');
      expect(deriveEnergyLabel(1.0)).toBe('explosive');
    });

    test('clamps out-of-range values', () => {
      expect(deriveEnergyLabel(-0.5)).toBe('calm');
      expect(deriveEnergyLabel(-1)).toBe('calm');
      expect(deriveEnergyLabel(1.5)).toBe('explosive');
      expect(deriveEnergyLabel(100)).toBe('explosive');
    });

    test('handles NaN and undefined gracefully', () => {
      expect(deriveEnergyLabel(NaN)).toBe('dynamic');
      expect(deriveEnergyLabel(undefined)).toBe('dynamic');
    });
  });

  describe('ENERGY_LABELS', () => {
    test('has 6 labels', () => {
      expect(ENERGY_LABELS).toHaveLength(6);
    });

    test('labels are lowercase', () => {
      ENERGY_LABELS.forEach(({ label }) => {
        expect(label).toBe(label.toLowerCase());
      });
    });

    test('intervals are contiguous and cover [0, 1]', () => {
      expect(ENERGY_LABELS[0].min).toBe(0);
      expect(ENERGY_LABELS[ENERGY_LABELS.length - 1].max).toBeGreaterThan(1);

      for (let i = 1; i < ENERGY_LABELS.length; i++) {
        expect(ENERGY_LABELS[i].min).toBe(ENERGY_LABELS[i - 1].max);
      }
    });
  });

  describe('getAllEnergyLabels', () => {
    test('returns array of 6 labels', () => {
      const labels = getAllEnergyLabels();
      expect(labels).toHaveLength(6);
      expect(labels).toContain('calm');
      expect(labels).toContain('explosive');
    });
  });
});
