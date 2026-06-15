/**
 * Shared Content Hash Algorithm
 *
 * This module provides the canonical content-hash function used by both:
 * - tools/generate-fingerprints.js (fingerprint generation)
 * - tools/deduplicate-presets.js (deduplication)
 *
 * CRITICAL: Any changes here affect ALL fingerprint hashes. Treat changes
 * as a migration that invalidates existing fingerprints.
 *
 * The algorithm uses deep recursive sorting to ensure deterministic serialization
 * regardless of object key order in the source data.
 */

import crypto from 'crypto';

/**
 * Deep recursive sort of object keys for deterministic serialization.
 * Arrays preserve element order but sort each element's keys recursively.
 * @param {*} obj - Object, array, or primitive to sort
 * @returns {*} - Sorted copy (primitives returned as-is)
 */
export function sortObjectDeep(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => sortObjectDeep(item));
    }
    return Object.keys(obj)
        .sort()
        .reduce((result, key) => {
            result[key] = sortObjectDeep(obj[key]);
            return result;
        }, {});
}

/**
 * Generate content-based hash from preset equations.
 * This ensures identical presets get the same hash regardless of name/author.
 *
 * The hash is computed from:
 * 1. All equation strings (init, frame, pixel, warp, comp)
 * 2. Base values (sorted)
 * 3. Shapes configuration (sorted)
 * 4. Waves configuration (sorted)
 *
 * @param {Object} preset - The preset object
 * @returns {string} - 8-character hex hash
 */
export function generateContentHash(preset) {
    const equations = [
        preset.init_eqs_str || preset.init_eqs_eel || '',
        preset.frame_eqs_str || preset.frame_eqs_eel || '',
        preset.pixel_eqs_str || preset.pixel_eqs_eel || '',
        preset.warp_eqs_str || preset.warp?.eel || '',
        preset.comp_eqs_str || preset.comp?.eel || '',
        JSON.stringify(sortObjectDeep(preset.baseVals || {})),
        JSON.stringify(sortObjectDeep(preset.shapes || [])),
        JSON.stringify(sortObjectDeep(preset.waves || []))
    ].join('|');

    return crypto.createHash('sha256')
        .update(equations)
        .digest('hex')
        .substring(0, 8);
}

export default { sortObjectDeep, generateContentHash };
