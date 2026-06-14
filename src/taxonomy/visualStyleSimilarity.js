/**
 * Visual Style Similarity Map
 *
 * Maps each CLIP-derived visual style to similar styles for Stage 1 relaxation.
 * When the exact visualStyle target has too few candidates, the matcher can
 * accept presets with similar styles.
 *
 * The 8 visual styles are derived from the CLIP image classifier:
 * fluid_organic, particle, geometric, fractal, abstract, kaleidoscope, tunnel, waveform
 */

// CLIP-grounded similarity for archetype-level Stage 1 relaxation.
//
// P5.1 (issue 2026-06-14-...-taxonomy-implementation-review): this map is the
// SYMMETRIC CLOSURE. If A lists B, B lists A. The matcher's styleContinuity
// scoring reads from `currentFp.visualStyle`'s neighbour list only, so an
// asymmetric map would silently award different bonuses for A→B vs B→A
// transitions. The symmetric-closure test in
// test/taxonomy/visualStyleSimilarity.test.js enforces the invariant on every
// future edit.
export const VISUAL_STYLE_SIMILARITY = {
  fluid_organic: ['fractal', 'abstract', 'particle'],
  particle:      ['fluid_organic', 'abstract', 'waveform'],
  geometric:     ['kaleidoscope', 'abstract'],
  fractal:       ['kaleidoscope', 'fluid_organic', 'tunnel'],
  abstract:      ['fluid_organic', 'geometric', 'particle', 'waveform'],
  kaleidoscope:  ['fractal', 'geometric', 'tunnel'],
  tunnel:        ['fractal', 'kaleidoscope'],
  waveform:      ['particle', 'abstract']
};

/**
 * Get similar styles for a given visual style
 * @param {string} style - Visual style
 * @returns {string[]} Array of similar styles (empty if style not found)
 */
export function getSimilarStyles(style) {
  return VISUAL_STYLE_SIMILARITY[style] || [];
}

/**
 * Check if two styles are similar (match or adjacent)
 * @param {string} style1 - First style
 * @param {string} style2 - Second style
 * @returns {boolean} True if styles match or are similar
 */
export function areStylesSimilar(style1, style2) {
  if (style1 === style2) return true;
  const similar = VISUAL_STYLE_SIMILARITY[style1] || [];
  return similar.includes(style2);
}

/**
 * Get all valid visual styles
 * @returns {string[]} Array of valid styles
 */
export function getAllVisualStyles() {
  return Object.keys(VISUAL_STYLE_SIMILARITY);
}
