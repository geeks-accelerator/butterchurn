/**
 * Reliability Tier Taxonomy Module
 *
 * Derives reliability tier from STATIC complexity proxies, NOT measured fps.
 * Measured fps varies by GPU; static complexity is what the fingerprint can
 * honestly predict. The deviceTier filter at runtime is the per-device gate.
 */

// Per Audit F2: lowercase_snake to match v2.2 convention
export const RELIABILITY_TIERS = {
  rock_solid:   'Low op count, no expensive pixel ops, no warmup',
  stable:       'Moderate complexity, brief warmup acceptable',
  finicky:      'Heavy pixel_eqs or long warmup',
  experimental: 'High complexity AND pixel ops AND warmup'
};

/**
 * Derive reliability tier from fingerprint and preset data
 * @param {Object} fp - Fingerprint with complexity and warmupTime
 * @param {Object} preset - Raw preset object (for equation inspection)
 * @returns {string} Reliability tier
 */
export function deriveReliabilityTier(fp, preset = {}) {
  const complexity = fp.complexity ?? 0;
  const warmup = fp.warmupTime ?? 0;

  // pixel_eqs is the most expensive per-frame work (runs per-pixel)
  const pixelEqs = preset.pixel_eqs_str || preset.pixel_eqs_eel || '';
  const compEqs = preset.comp_eqs_str || '';
  const heavyPixel = pixelEqs.length > 200;
  const heavyComp = compEqs.length > 500;

  // FIX (Pass 22): Removed complexity < 0.7 from finicky trigger - that's not
  // "heavy pixel_eqs or long warmup", it's just "moderate complexity" which is
  // acceptable. Expanded stable threshold to include moderate complexity presets.
  if (complexity < 0.3 && warmup === 0 && !heavyPixel) return 'rock_solid';
  if (complexity < 0.7 && warmup <= 3 && !heavyPixel && !heavyComp) return 'stable';
  if (heavyPixel || warmup > 5) return 'finicky';
  return 'experimental';
}

/**
 * Get allowed reliability tiers for a device tier
 * Runtime mapping: which preset tiers a given device class can render
 * @param {string} deviceTier - Device tier (mobile/low_end/mid_range/high_end)
 * @returns {string[]} Array of allowed reliability tiers
 */
export function tiersAllowedForDevice(deviceTier) {
  const mapping = {
    'mobile':    ['rock_solid'],
    'low_end':   ['rock_solid', 'stable'],
    'mid_range': ['rock_solid', 'stable', 'finicky'],
    'high_end':  ['rock_solid', 'stable', 'finicky', 'experimental']
  };
  return mapping[deviceTier] || ['rock_solid', 'stable', 'finicky'];
}

/**
 * Get all valid reliability tiers
 * @returns {string[]} Array of valid tiers
 */
export function getAllReliabilityTiers() {
  return Object.keys(RELIABILITY_TIERS);
}

/**
 * Get description for a reliability tier
 * @param {string} tier - Reliability tier
 * @returns {string|null} Description or null if not found
 */
export function getReliabilityDescription(tier) {
  return RELIABILITY_TIERS[tier] ?? null;
}
