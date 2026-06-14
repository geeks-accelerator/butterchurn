/**
 * Musical Responsiveness Taxonomy Module
 *
 * Derives categorical labels describing how a preset responds to audio.
 * Source of truth remains bassEnergy/trebleEnergy/beatSync (floats).
 * This label is used for Stage 1 categorical filtering in the matcher.
 */

// Per Audit F2: lowercase_snake to match v2.2 convention
export const RESPONSIVENESS_TYPES = {
  spectral_analysis: 'Uses frequency bands independently',
  beat_detection:    'Responds to rhythm',
  volume_reactive:   'Responds to overall loudness',
  time_only:         'Ignores audio, time-based animation',
  basic_audio:       'Simple audio interaction'
};

/**
 * Derive musical responsiveness label from fingerprint fields
 * @param {Object} fp - Fingerprint object with bassEnergy, trebleEnergy, beatSync
 * @returns {string} Responsiveness type
 */
export function deriveMusicalResponsiveness(fp) {
  const bassEnergy = fp.bassEnergy ?? fp.bass ?? 0;
  const trebleEnergy = fp.trebleEnergy ?? 0;
  const beatSync = fp.beatSync ?? fp.beat ?? 0;

  if (beatSync > 0.5) return 'beat_detection';
  if (bassEnergy > 0.4 && trebleEnergy > 0.4) return 'spectral_analysis';
  if (bassEnergy < 0.15 && trebleEnergy < 0.15 && beatSync < 0.1) return 'time_only';
  if (bassEnergy > 0.2 || trebleEnergy > 0.2) return 'volume_reactive';
  return 'basic_audio';
}

/**
 * Determine target responsiveness from real-time audio features
 * Used by the audio side of the matcher (not fingerprint generation)
 * @param {Object} audioFeatures - Real-time audio analysis features
 * @returns {string} Target responsiveness type
 */
export function determineTargetResponsiveness(audioFeatures) {
  if (audioFeatures.beatStrength > 0.7) return 'beat_detection';
  if (audioFeatures.bassEnergy > 0.5 && audioFeatures.trebleEnergy > 0.5) return 'spectral_analysis';
  if (audioFeatures.bassEnergy > 0.6) return 'spectral_analysis';
  if (audioFeatures.energy < 0.2) return 'time_only';
  return 'volume_reactive';
}

/**
 * Get all valid responsiveness types
 * @returns {string[]} Array of valid types
 */
export function getAllResponsivenessTypes() {
  return Object.keys(RESPONSIVENESS_TYPES);
}

/**
 * Get description for a responsiveness type
 * @param {string} type - Responsiveness type
 * @returns {string|null} Description or null if not found
 */
export function getResponsivenessDescription(type) {
  return RESPONSIVENESS_TYPES[type] ?? null;
}
