/**
 * embeddingScore.test.js
 * Tests for the semantic embedding score module
 */

import { describe, it, expect } from '@jest/globals';
import {
  cosineSimilarity,
  computeEmbeddingScore,
  EmbeddingCache,
  buildTargetPrompt,
  isValidEmbedding,
  DEFAULT_EMBEDDING_WEIGHT,
  EXPECTED_DIMENSIONS,
} from '../../src/taxonomy/embeddingScore.js';

describe('embeddingScore', () => {
  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const v = [1, 2, 3, 4, 5];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
    });

    it('returns 0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it('returns -1 for opposite vectors', () => {
      const a = [1, 2, 3];
      const b = [-1, -2, -3];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });

    it('returns 0 for null inputs', () => {
      expect(cosineSimilarity(null, [1, 2, 3])).toBe(0);
      expect(cosineSimilarity([1, 2, 3], null)).toBe(0);
      expect(cosineSimilarity(null, null)).toBe(0);
    });

    it('returns 0 for mismatched dimensions', () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
    });

    it('returns 0 for zero vectors', () => {
      expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
      expect(cosineSimilarity([1, 2, 3], [0, 0, 0])).toBe(0);
    });

    it('is symmetric', () => {
      const a = [1, 2, 3, 4];
      const b = [5, 6, 7, 8];
      expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
    });

    it('handles typical semantic embedding values', () => {
      // Typical embedding values are small floats
      const a = [0.1, -0.2, 0.3, -0.1, 0.05];
      const b = [0.15, -0.15, 0.25, -0.05, 0.1];
      const sim = cosineSimilarity(a, b);
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });
  });

  describe('computeEmbeddingScore', () => {
    it('returns 0 for missing target embedding', () => {
      const preset = [0.1, 0.2, 0.3];
      expect(computeEmbeddingScore(null, preset)).toBe(0);
    });

    it('returns 0 for missing preset embedding', () => {
      const target = [0.1, 0.2, 0.3];
      expect(computeEmbeddingScore(target, null)).toBe(0);
    });

    it('returns normalized score in [0, 1] range', () => {
      const a = [0.5, 0.3, 0.1];
      const b = [0.4, 0.35, 0.15];
      const score = computeEmbeddingScore(a, b);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('returns 1 for identical embeddings', () => {
      const v = [0.1, 0.2, 0.3, 0.4];
      expect(computeEmbeddingScore(v, v)).toBeCloseTo(1, 5);
    });

    it('clamps negative similarities to 0', () => {
      const a = [1, 0, 0];
      const b = [-1, 0, 0];
      expect(computeEmbeddingScore(a, b)).toBe(0);
    });
  });

  describe('EmbeddingCache', () => {
    it('stores and retrieves embeddings', () => {
      const cache = new EmbeddingCache();
      const embedding = [0.1, 0.2, 0.3];
      cache.set('test-key', embedding);
      expect(cache.get('test-key')).toEqual(embedding);
    });

    it('returns null for missing keys', () => {
      const cache = new EmbeddingCache();
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('respects max size limit', () => {
      const cache = new EmbeddingCache(3);
      cache.set('a', [1]);
      cache.set('b', [2]);
      cache.set('c', [3]);
      cache.set('d', [4]); // Should evict 'a'

      expect(cache.get('a')).toBeNull();
      expect(cache.get('b')).toEqual([2]);
      expect(cache.get('d')).toEqual([4]);
      expect(cache.size).toBe(3);
    });

    it('implements LRU eviction', () => {
      const cache = new EmbeddingCache(3);
      cache.set('a', [1]);
      cache.set('b', [2]);
      cache.set('c', [3]);

      // Access 'a' to make it recently used
      cache.get('a');

      // Add new item - should evict 'b' (least recently used)
      cache.set('d', [4]);

      expect(cache.get('a')).toEqual([1]); // Still present
      expect(cache.get('b')).toBeNull(); // Evicted
      expect(cache.get('c')).toEqual([3]);
      expect(cache.get('d')).toEqual([4]);
    });

    it('can be cleared', () => {
      const cache = new EmbeddingCache();
      cache.set('a', [1]);
      cache.set('b', [2]);
      cache.clear();
      expect(cache.size).toBe(0);
      expect(cache.get('a')).toBeNull();
    });
  });

  describe('buildTargetPrompt', () => {
    it('combines mood and genre', () => {
      expect(buildTargetPrompt('energetic', 'EDM')).toBe('energetic edm');
    });

    it('handles mood only', () => {
      expect(buildTargetPrompt('calm', null)).toBe('calm');
    });

    it('handles genre only', () => {
      expect(buildTargetPrompt(null, 'ambient')).toBe('ambient');
    });

    it('returns empty string for no context', () => {
      expect(buildTargetPrompt(null, null)).toBe('');
    });

    it('lowercases input', () => {
      expect(buildTargetPrompt('AGGRESSIVE', 'TECHNO')).toBe('aggressive techno');
    });
  });

  describe('isValidEmbedding', () => {
    it('returns false for null', () => {
      expect(isValidEmbedding(null)).toBe(false);
    });

    it('returns false for non-array', () => {
      expect(isValidEmbedding('not an array')).toBe(false);
      expect(isValidEmbedding(123)).toBe(false);
      expect(isValidEmbedding({})).toBe(false);
    });

    it('returns false for wrong dimensions', () => {
      const wrongSize = new Array(100).fill(0.1);
      expect(isValidEmbedding(wrongSize)).toBe(false);
    });

    it('returns true for valid 768-dim embedding', () => {
      const valid = new Array(EXPECTED_DIMENSIONS).fill(0).map(() => Math.random() * 2 - 1);
      expect(isValidEmbedding(valid)).toBe(true);
    });

    it('returns false for embeddings with non-numbers', () => {
      const invalid = new Array(EXPECTED_DIMENSIONS).fill(0.1);
      invalid[0] = 'string';
      expect(isValidEmbedding(invalid)).toBe(false);
    });

    it('returns false for embeddings with NaN', () => {
      const invalid = new Array(EXPECTED_DIMENSIONS).fill(0.1);
      invalid[100] = NaN;
      expect(isValidEmbedding(invalid)).toBe(false);
    });

    it('returns false for embeddings with Infinity', () => {
      const invalid = new Array(EXPECTED_DIMENSIONS).fill(0.1);
      invalid[100] = Infinity;
      expect(isValidEmbedding(invalid)).toBe(false);
    });
  });

  describe('constants', () => {
    it('DEFAULT_EMBEDDING_WEIGHT is low enough to be additive', () => {
      expect(DEFAULT_EMBEDDING_WEIGHT).toBeLessThanOrEqual(0.1);
      expect(DEFAULT_EMBEDDING_WEIGHT).toBeGreaterThan(0);
    });

    it('EXPECTED_DIMENSIONS matches EmbeddingGemma output', () => {
      expect(EXPECTED_DIMENSIONS).toBe(768);
    });
  });
});
