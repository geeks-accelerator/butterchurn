/**
 * Embedding Score Module
 * Phase 6: Semantic similarity scoring using preset description embeddings
 *
 * Provides cosine similarity computation for matcher Stage 2 integration.
 * The embedding axis adds continuous semantic discrimination beyond categorical fields.
 */

/**
 * Compute cosine similarity between two embedding vectors
 * @param {number[]} a - First embedding vector
 * @param {number[]} b - Second embedding vector
 * @returns {number} Cosine similarity in range [-1, 1], typically [0, 1] for semantic embeddings
 */
export function cosineSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Compute embedding score for matcher Stage 2
 * Score is normalized to [0, 1] range for weighted combination with other Stage 2 components
 *
 * @param {number[]|null} targetEmbedding - Query embedding from mood/genre prompt
 * @param {number[]|null} presetEmbedding - Preset's semantic embedding
 * @returns {number} Normalized score in [0, 1], 0 if either embedding is missing
 */
export function computeEmbeddingScore(targetEmbedding, presetEmbedding) {
  if (!targetEmbedding || !presetEmbedding) {
    return 0;
  }

  const similarity = cosineSimilarity(targetEmbedding, presetEmbedding);

  // Cosine similarity is in [-1, 1] but semantic embeddings are typically [0, 1]
  // Map to [0, 1] range: (sim + 1) / 2 for full range, or clamp for typical range
  // Using simple clamp since semantic embeddings rarely go negative
  return Math.max(0, Math.min(1, similarity));
}

/**
 * EmbeddingCache for efficient query embedding lookup
 * Caches recently computed query embeddings to avoid redundant embedding calls
 */
export class EmbeddingCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * Get cached embedding or null if not found
   * @param {string} key - Cache key (typically the prompt string)
   * @returns {number[]|null}
   */
  get(key) {
    const entry = this.cache.get(key);
    if (entry) {
      // LRU: move to end
      this.cache.delete(key);
      this.cache.set(key, entry);
      return entry;
    }
    return null;
  }

  /**
   * Set cached embedding
   * @param {string} key - Cache key
   * @param {number[]} embedding - Embedding vector
   */
  set(key, embedding) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, embedding);
  }

  /**
   * Clear the cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache size
   * @returns {number}
   */
  get size() {
    return this.cache.size;
  }
}

/**
 * Build a target prompt string from mood and genre for embedding
 * This prompt is embedded to find semantically similar presets
 *
 * @param {string|null} moodLabel - Current mood label (e.g., "energetic", "calm")
 * @param {string|null} genreLabel - Detected genre label (e.g., "edm", "ambient")
 * @returns {string} Prompt string for embedding
 */
export function buildTargetPrompt(moodLabel, genreLabel) {
  const parts = [];

  if (moodLabel) {
    parts.push(moodLabel.toLowerCase());
  }

  if (genreLabel) {
    parts.push(genreLabel.toLowerCase());
  }

  // Return empty string if no context available
  // Matcher should skip embedding score when prompt is empty
  return parts.join(' ').trim();
}

/**
 * Default embedding score weight for Stage 2 weighted combination
 * Kept low (0.05) to be additive without destabilizing existing matching behavior
 */
export const DEFAULT_EMBEDDING_WEIGHT = 0.05;

/**
 * Expected embedding dimensions
 * EmbeddingGemma-300M outputs 768-dim vectors
 */
export const EXPECTED_DIMENSIONS = 768;

/**
 * Validate embedding vector format
 * @param {any} embedding - Value to validate
 * @returns {boolean} True if valid embedding vector
 */
export function isValidEmbedding(embedding) {
  if (!Array.isArray(embedding)) return false;
  if (embedding.length !== EXPECTED_DIMENSIONS) return false;

  // Check a few values are numbers
  return (
    typeof embedding[0] === 'number' &&
    typeof embedding[Math.floor(embedding.length / 2)] === 'number' &&
    typeof embedding[embedding.length - 1] === 'number' &&
    !embedding.some(v => !Number.isFinite(v))
  );
}
