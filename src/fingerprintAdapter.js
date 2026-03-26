/**
 * Adapter to convert FingerprintLoader data to the format expected
 * by IntelligentPresetSelector
 */
class FingerprintAdapter {
  constructor(fingerprintLoader) {
    this.loader = fingerprintLoader;
    this.db = null;
  }

  /**
   * Convert FingerprintLoader data to selector-compatible format
   */
  async buildDatabase() {
    // First load all fingerprints
    if (this.loader.fingerprints.size === 0) {
      await this.loader.loadAllFingerprints();
    }

    // Build the database structure
    // CRIT-3 FIX: Bump to v2.1.0 for expanded mood vocabulary
    this.db = {
      version: '2.1.0',
      generated: new Date().toISOString(),
      presets: {},
      indices: this.loader.indices,
      nameIndex: {},
      namesToHashes: {},
      packMapping: {},
      stats: this.loader.getStats()
    };

    // Convert fingerprints to expected format
    for (const [hash, data] of this.loader.fingerprints.entries()) {
      this.db.presets[hash] = data;

      // Build name indices for lookup
      if (data.names) {
        for (const name of data.names) {
          this.db.nameIndex[name] = hash;
          this.db.namesToHashes[name] = hash;
        }
      }

      // Store pack mapping
      this.db.packMapping[hash] = data.pack;
    }

    console.log('[FingerprintAdapter] Built database:', {
      presetCount: Object.keys(this.db.presets).length,
      categories: Object.keys(this.db.indices),
      packs: Object.keys(this.loader.stats.packStats)
    });

    return this.db;
  }

  /**
   * Get the adapted database
   */
  getDatabase() {
    return this.db;
  }

  /**
   * Load a specific preset pack's JS file and return presets
   * This is needed for actually loading the preset code, not just fingerprints
   */
  async loadPresetPack(packName) {
    try {
      // Dynamic import for browser
      const packUrl = `/presets/full-collection/${packName}.js`;
      const module = await import(packUrl);

      // Get the global variable name (e.g., butterchurnPresets)
      const globalName = packName;

      // Check if module exports or uses global
      if (module.default && typeof module.default.getPresets === 'function') {
        return module.default.getPresets();
      } else if (window[globalName] && typeof window[globalName].getPresets === 'function') {
        return window[globalName].getPresets();
      } else {
        console.error(`[FingerprintAdapter] Could not find getPresets for ${packName}`);
        return {};
      }
    } catch (error) {
      console.error(`[FingerprintAdapter] Error loading preset pack ${packName}:`, error);
      return {};
    }
  }

  /**
   * Get actual preset data by hash, loading from pack if needed
   */
  async getPresetByHash(hash) {
    const fingerprint = this.loader.getPresetFingerprint(hash);
    if (!fingerprint) {
      console.error(`[FingerprintAdapter] No fingerprint for hash ${hash}`);
      return null;
    }

    const packName = fingerprint.pack;

    // Try to load from cache first
    if (this.presetCache && this.presetCache[packName]) {
      const presetName = fingerprint.names?.[0];
      if (presetName && this.presetCache[packName][presetName]) {
        return this.presetCache[packName][presetName];
      }
    }

    // Load the pack
    const presets = await this.loadPresetPack(packName);

    // Cache it
    if (!this.presetCache) {
      this.presetCache = {};
    }
    this.presetCache[packName] = presets;

    // Find the preset by name
    const presetName = fingerprint.names?.[0];
    if (presetName && presets[presetName]) {
      return presets[presetName];
    }

    console.error(`[FingerprintAdapter] Could not find preset ${presetName} in pack ${packName}`);
    return null;
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FingerprintAdapter;
}

export default FingerprintAdapter;