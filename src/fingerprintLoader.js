class FingerprintLoader {
  constructor() {
    this.fingerprints = new Map();
    this.indices = {
      high: [],
      bass: [],
      calm: [],
      particle: [],
      fractal: [],
      geometric: [],
      organic: []
    };
    this.packMapping = new Map(); // Maps preset hash to pack name
    this.stats = {
      totalPresets: 0,
      totalPacks: 0,
      packStats: {}
    };
  }

  async loadAllFingerprints(basePath = '/presets/full-collection/') {
    const packNames = [
      'butterchurnPresets',
      'butterchurnPresetsExtra',
      'butterchurnPresetsExtra2',
      'butterchurnPresetsMD1',
      'butterchurnPresetsMinimal',
      'butterchurnPresetsNonMinimal'
    ];

    console.log('[FingerprintLoader] Loading fingerprints from all packs...');

    for (const packName of packNames) {
      try {
        await this.loadPackFingerprints(packName, basePath);
      } catch (error) {
        console.error(`[FingerprintLoader] Failed to load pack ${packName}:`, error);
      }
    }

    console.log('[FingerprintLoader] Loading complete:', this.stats);
    return this;
  }

  async loadPackFingerprints(packName, basePath = '/presets/full-collection/') {
    const fingerprintUrl = `${basePath}${packName}.fingerprints.json`;

    try {
      const response = await fetch(fingerprintUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.presets) {
        console.warn(`[FingerprintLoader] No presets in ${packName}`);
        return;
      }

      let packCount = 0;

      // Load each preset
      for (const [hash, presetData] of Object.entries(data.presets)) {
        // Store with pack information
        this.fingerprints.set(hash, {
          ...presetData,
          pack: packName,
          hash: hash
        });

        // Store pack mapping
        this.packMapping.set(hash, packName);
        packCount++;
      }

      // Merge indices
      if (data.indices) {
        for (const [category, hashes] of Object.entries(data.indices)) {
          if (this.indices[category] && Array.isArray(hashes)) {
            // Add unique hashes only
            for (const hash of hashes) {
              if (!this.indices[category].includes(hash)) {
                this.indices[category].push(hash);
              }
            }
          }
        }
      }

      // Update stats
      this.stats.packStats[packName] = packCount;
      this.stats.totalPresets += packCount;
      this.stats.totalPacks++;

      console.log(`[FingerprintLoader] Loaded ${packCount} presets from ${packName}`);

    } catch (error) {
      console.error(`[FingerprintLoader] Error loading ${packName}:`, error);
      throw error;
    }
  }

  getPresetFingerprint(hash) {
    return this.fingerprints.get(hash);
  }

  getPresetPack(hash) {
    return this.packMapping.get(hash);
  }

  getPresetsByCategory(category) {
    const hashes = this.indices[category] || [];
    return hashes.map(hash => this.fingerprints.get(hash)).filter(Boolean);
  }

  getRandomPreset() {
    const hashes = Array.from(this.fingerprints.keys());
    if (hashes.length === 0) return null;

    const randomHash = hashes[Math.floor(Math.random() * hashes.length)];
    return this.fingerprints.get(randomHash);
  }

  getPresetsByPack(packName) {
    const presets = [];
    for (const [hash, data] of this.fingerprints.entries()) {
      if (data.pack === packName) {
        presets.push({ hash, ...data });
      }
    }
    return presets;
  }

  searchPresets(query) {
    const results = [];
    const searchStr = query.toLowerCase();

    for (const [hash, data] of this.fingerprints.entries()) {
      // Search in names
      const nameMatch = data.names?.some(name =>
        name.toLowerCase().includes(searchStr)
      );

      // Search in authors
      const authorMatch = data.authors?.some(author =>
        author.toLowerCase().includes(searchStr)
      );

      if (nameMatch || authorMatch) {
        results.push({ hash, ...data });
      }
    }

    return results;
  }

  getStats() {
    return {
      ...this.stats,
      categoryCounts: Object.entries(this.indices).reduce((acc, [cat, hashes]) => {
        acc[cat] = hashes.length;
        return acc;
      }, {})
    };
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FingerprintLoader;
}

export default FingerprintLoader;