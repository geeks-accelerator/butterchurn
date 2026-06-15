/**
 * Canonical Vocabulary for Fingerprint v2.2 Schema
 *
 * SINGLE SOURCE OF TRUTH for all categorical field vocabularies.
 * Used by: validator.test.js, validate-fingerprint-mapping.js, generate-missing-fingerprints.js
 *
 * When updating vocabulary:
 * 1. Update this file
 * 2. Run npm test to verify no regressions
 * 3. Update any fingerprint generation tools that use these values
 */

export const VALID_VOCABULARY = {
    energyLabel: new Set(['calm', 'flowing', 'dynamic', 'energetic', 'intense', 'explosive']),
    musicalResponsiveness: new Set(['spectral_analysis', 'beat_detection', 'volume_reactive', 'time_only', 'basic_audio']),
    reliabilityTier: new Set(['rock_solid', 'stable', 'finicky', 'experimental']),
    visualStyle: new Set(['abstract', 'organic', 'fractal', 'geometric', 'particle', 'tunnel', 'fluid_organic', 'kaleidoscope', 'waveform']),
    dominantHue: new Set(['warm', 'cool', 'natural', 'neutral', 'rainbow']),
    colorProfile: new Set(['warm', 'cool', 'neutral', 'vivid', 'nature']),
    motionSpeed: new Set(['static', 'slow', 'medium', 'fast', 'chaotic']),
};

export const CATEGORICAL_FIELDS = Object.keys(VALID_VOCABULARY);
