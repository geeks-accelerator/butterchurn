/**
 * Centralized preset pack names configuration
 * WARN-4 FIX: Single source of truth for preset pack names
 *
 * Add new preset packs here - they will be automatically picked up
 * by both FingerprintLoader and IntelligentPresetSelector
 */

// H1 (plan §H Pre-Import Readiness Audit, 2026-06-14): v2.2 is the
// CANONICAL content-hash algorithm. The 7 legacy v1.0 packs were retired
// from this list because:
//
//   - Their content-hash algorithm differs from the v2.2 unified file.
//     353 v1.0 hashes did not collide with the 495 v2.2 hashes — they
//     represent the SAME presets under different IDs, which made the
//     matcher double-count and complicated continuity tracking.
//
//   - butterchurnPresetsAll covers 504 unique preset names; v1.0 packs
//     combined cover 359 names, 358 of which are already in v2.2.
//     The single non-overlapping preset (`flexi + amandio c -
//     organic12-3d-2.milk`) will be picked back up when the next ~20K
//     import regenerates the full corpus under v2.2.
//
//   - The pack file `butterchurnPresetsMixedDugan.fingerprints.json`
//     never existed on disk despite being in this list — its load
//     produced a 404 every startup. Retired now along with the others.
//
// To re-enable a v1.0 pack temporarily, add its name back to this array.
// The matcher's defensive null reads tolerate missing v2.2 fields.
export const PRESET_PACK_NAMES = [
    'butterchurnPresetsAll'
];

export default PRESET_PACK_NAMES;
