/**
 * Taxonomy Module Index
 *
 * Re-exports all taxonomy modules for convenient imports.
 */

export { deriveEnergyLabel, ENERGY_LABELS, getEnergyLabelInfo, getAllEnergyLabels } from './energyLabel.js';
export { deriveMusicalResponsiveness, determineTargetResponsiveness, RESPONSIVENESS_TYPES, getAllResponsivenessTypes } from './musicalResponsiveness.js';
export { deriveReliabilityTier, tiersAllowedForDevice, RELIABILITY_TIERS, getAllReliabilityTiers } from './reliability.js';
export { VISUAL_STYLE_SIMILARITY, getSimilarStyles, areStylesSimilar, getAllVisualStyles } from './visualStyleSimilarity.js';
export { analyzePresetColor, extractStaticColors, classifyRgbColor, classifyDominantHue, detectDynamicColor, classifyBrightness } from './colorAnalysis.js';
export { HierarchicalMatcher } from './hierarchicalMatcher.js';
