/**
 * Energy Label Taxonomy Module
 *
 * Derives categorical labels from continuous energy values.
 * The float `energy` is the source of truth; `energyLabel` is a derived convenience
 * for indexing, UI display, and Stage 1 categorical filtering.
 *
 * The matcher (Phase 5) uses the float for Stage 2 scoring, not the label.
 */

// Per Audit F2: lowercase to match v2.2 field-family convention
// (visualStyle: 'fluid_organic', colorProfile: 'warm', mood: 'aggressive')
// Half-open intervals: [min, max). Upper bound exclusive.
export const ENERGY_LABELS = [
  { label: 'calm',      min: 0.00, max: 0.20, description: 'Ambient, meditative' },
  { label: 'flowing',   min: 0.20, max: 0.40, description: 'Gentle movement' },
  { label: 'dynamic',   min: 0.40, max: 0.60, description: 'Active, engaging' },
  { label: 'energetic', min: 0.60, max: 0.80, description: 'High motion' },
  { label: 'intense',   min: 0.80, max: 0.95, description: 'Very active' },
  { label: 'explosive', min: 0.95, max: 1.01, description: 'Maximum energy' }  // 1.01 so 1.0 maps in
];

/**
 * Derive energy label from continuous energy value
 * @param {number} numericEnergy - Energy value in range [0, 1]
 * @returns {string} Energy label (calm/flowing/dynamic/energetic/intense/explosive)
 */
export function deriveEnergyLabel(numericEnergy) {
  const clamped = Math.max(0, Math.min(1, numericEnergy));
  return ENERGY_LABELS.find(r => clamped >= r.min && clamped < r.max)?.label ?? 'dynamic';
}

/**
 * Get label info including description
 * @param {string} label - Energy label
 * @returns {Object|null} Label info or null if not found
 */
export function getEnergyLabelInfo(label) {
  return ENERGY_LABELS.find(r => r.label === label) ?? null;
}

/**
 * Get all valid energy labels
 * @returns {string[]} Array of valid labels
 */
export function getAllEnergyLabels() {
  return ENERGY_LABELS.map(r => r.label);
}
