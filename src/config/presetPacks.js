/**
 * Centralized preset pack names configuration
 * WARN-4 FIX: Single source of truth for preset pack names
 *
 * Add new preset packs here - they will be automatically picked up
 * by both FingerprintLoader and IntelligentPresetSelector
 */

export const PRESET_PACK_NAMES = [
    'butterchurnPresets',
    'butterchurnPresetsExtra',
    'butterchurnPresetsExtra2',
    'butterchurnPresetsMD1',
    'butterchurnPresetsMixedDugan',
    'butterchurnPresetsMinimal',
    'butterchurnPresetsNonMinimal',
    // P1.1a (issue 2026-06-14-butterchurn-taxonomy-implementation-review):
    // The unified v2.2 fingerprint file. Loaded LAST so its v2.2 records
    // (energyLabel, musicalResponsiveness, reliabilityTier, dominantHue) win
    // for any hash collisions with the v1.0 individual packs above.
    //
    // KNOWN DIVERGENCE: the 353 hashes in the individual v1.0 packs do NOT
    // match the 495 hashes in butterchurnPresetsAll — they were generated
    // under a different content-hash algorithm. Both sets are loaded; the
    // matcher's defensive null reads handle the heterogeneity. Reconciling
    // the hash algorithms across packs is a separate follow-up.
    'butterchurnPresetsAll'
];

export default PRESET_PACK_NAMES;
