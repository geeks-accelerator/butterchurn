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

// Per Audit finding — CLIP-grounded similarity for archetype-level Stage 1 relaxation
export const VISUAL_STYLE_SIMILARITY = {
  fluid_organic: ['fractal', 'abstract'],
  particle:      ['fluid_organic', 'abstract'],
  geometric:     ['kaleidoscope', 'abstract'],
  fractal:       ['kaleidoscope', 'fluid_organic'],
  abstract:      ['fluid_organic', 'geometric'],
  kaleidoscope:  ['fractal', 'geometric'],
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
