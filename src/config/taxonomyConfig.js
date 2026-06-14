/**
 * Taxonomy Configuration
 *
 * Configuration for the two-stage filter+score matcher.
 * Aligned with the live selector's scorePreset weights plus taxonomy additions.
 */

// Stage 1 categorical dimensions, highest priority first.
// Matcher drops from the END when relaxing.
export const categoricalDims = [
  'visualStyle',
  'musicalResponsiveness',
  'reliabilityTier',
  'dominantHue'
];

// Stage 2 continuous scoring weights (should sum to 1.0)
// Tuned against live selector's scorePreset weights, plus BPM (Audit B5)
// plus visual/style continuity and color-mood synergy (Audit D3/D4/D5)
export const weights = {
  energy:           0.18,
  bass:             0.12,
  treble:           0.04,
  beat:             0.08,
  mood:             0.18,
  bpm:              0.12,  // uses fp.optimalBpm.{min,max,ideal}
  complexity:       0.10,
  visualContinuity: 0.08,  // D3: complexity-diff from currentHash (smoother transitions)
  styleContinuity:  0.05,  // D4: same/compatible visualStyle as currentHash
  colorSynergy:     0.05   // D5: expert color×mood table (warm+happy etc.)
};

// Filter behaviour
export const minCandidatesBeforeRelax = 5;
export const excludeUntaggedFromCategoricalFilters = true;

// Device gating
export const forceDeviceTier = null;           // e.g. 'mobile' to override autodetect for testing
export const forceReliabilityTier = null;      // e.g. 'rock_solid' to force the lowest tier

// Debug
export const logHierarchicalMatching = false;

// Export as default config object
export default {
  categoricalDims,
  weights,
  minCandidatesBeforeRelax,
  excludeUntaggedFromCategoricalFilters,
  forceDeviceTier,
  forceReliabilityTier,
  logHierarchicalMatching
};
