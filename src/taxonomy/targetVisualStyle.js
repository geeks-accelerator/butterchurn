/**
 * Target Visual Style Inference
 *
 * Maps detected mood → preferred visualStyle for the matcher's Stage 1
 * categorical filter.
 *
 * P1.2 (issue 2026-06-14-butterchurn-taxonomy-implementation-review):
 * Without a populated `target.visualStyle`, Stage 1's `if (!targetVal) continue`
 * skips the visualStyle filter entirely, making the matcher one-stage in
 * production. This module supplies the target so Stage 1 can actually filter.
 *
 * The map is a starting heuristic — Phase 8 validation should tune it.
 * Returns null when mood is unknown / low-confidence so the matcher cleanly
 * skips the filter rather than constraining against a guess.
 */

// Mood → preferred visualStyle (CLIP-derived 8-style taxonomy)
// Choice rationale lives next to each entry; refine after Phase 8 validation.
const MOOD_TO_VISUAL_STYLE = {
  aggressive:  'particle',       // intense, kinetic
  relaxed:     'fluid_organic',  // soft, flowing
  happy:       'kaleidoscope',   // bright, multi-color
  electronic:  'geometric',      // structured, synthetic
  acoustic:    'fluid_organic',  // organic, natural
  mystical:    'tunnel',         // depth, otherworldly
  hypnotic:    'kaleidoscope',   // repetitive, symmetric
  psychedelic: 'fractal',        // recursive, trippy
  dreamy:      'fluid_organic',  // soft, ethereal
  meditative:  'fluid_organic'   // calm, organic
};

// Minimum mood confidence to commit to a visualStyle target.
// Below this, return null so Stage 1 skips the filter (Audit F2 hysteresis logic).
const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Determine target visualStyle from current mood detection.
 *
 * @param {{label: string, confidence: number}|null} mood - detectMood() output
 * @param {Object} [options]
 * @param {number} [options.confidenceThreshold=0.5] - skip below this
 * @returns {string|null} visualStyle from CLIP taxonomy, or null to skip filter
 */
export function determineTargetVisualStyle(mood, options = {}) {
  if (!mood?.label) return null;
  const threshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  if ((mood.confidence ?? 0) < threshold) return null;
  return MOOD_TO_VISUAL_STYLE[mood.label] ?? null;
}

export const MOOD_TO_VISUAL_STYLE_MAP = MOOD_TO_VISUAL_STYLE;
