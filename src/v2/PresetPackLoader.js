/**
 * PresetPackLoader - Loads and manages v1 preset packs
 * Enables 500+ presets with WASM compilation support
 */

export class PresetPackLoader {
  constructor() {
    this.presets = new Map();
    this.metadata = null;
    this.loaded = false;
  }

  /**
   * Load preset pack metadata
   */
  async loadMetadata() {
    try {
      // Use global metadata (loaded via script tag)
      if (typeof window !== 'undefined' && window.butterchurnPresetPackMeta) {
        this.metadata = window.butterchurnPresetPackMeta;
      } else {
        console.warn('[PresetPackLoader] Metadata not found in global scope');
        this.metadata = {
          getMainPresetMeta: () => ({ presets: [] }),
          getExtraPresetKeys: () => ({ presets: [] }),
          getExtra2PresetKeys: () => ({ presets: [] }),
          getMinimalPresetKeys: () => ({ presets: [] }),
          getNonMinimalPresetKeys: () => ({ presets: [] }),
          getMD1PresetKeys: () => ({ presets: [] }),
        };
      }

      console.log('[PresetPackLoader] Metadata loaded with preset categories:', {
        main: this.metadata.getMainPresetMeta?.()?.presets?.length || 0,
        extra: this.metadata.getExtraPresetKeys?.()?.presets?.length || 0,
        extra2: this.metadata.getExtra2PresetKeys?.()?.presets?.length || 0,
        minimal: this.metadata.getMinimalPresetKeys?.()?.presets?.length || 0,
        nonMinimal: this.metadata.getNonMinimalPresetKeys?.()?.presets?.length || 0,
        md1: this.metadata.getMD1PresetKeys?.()?.presets?.length || 0,
      });

      return true;
    } catch (error) {
      console.error('[PresetPackLoader] Failed to load metadata:', error);
      return false;
    }
  }

  /**
   * Load a specific preset pack
   */
  async loadPresetPack(packName) {
    try {
      console.log(`[PresetPackLoader] Loading pack: ${packName}`);

      // Access preset packs from global scope (loaded via script tags)
      if (typeof window === 'undefined') {
        console.error('[PresetPackLoader] Window is undefined, cannot load presets');
        return false;
      }

      // Map pack names to global objects
      const packModules = {
        'butterchurnPresets': window.butterchurnPresets,
        'butterchurnPresetsMinimal': window.butterchurnPresetsMinimal,
        'butterchurnPresetsExtra': window.butterchurnPresetsExtra,
        'butterchurnPresetsExtra2': window.butterchurnPresetsExtra2,
        'butterchurnPresetsNonMinimal': window.butterchurnPresetsNonMinimal,
        'butterchurnPresetsMD1': window.butterchurnPresetsMD1
      };

      const presetModule = packModules[packName];

      // Debug logging
      console.log(`[PresetPackLoader] Pack module for ${packName}:`, presetModule);
      console.log(`[PresetPackLoader] Type:`, typeof presetModule);

      if (!presetModule) {
        console.error(`[PresetPackLoader] Unknown pack: ${packName}`);
        return false;
      }

      // The preset packs have getPresets() as a static method on the constructor
      let presets = null;

      if (typeof presetModule === 'function') {
        // Check if getPresets exists as a static method on the constructor
        if (typeof presetModule.getPresets === 'function') {
          try {
            presets = presetModule.getPresets();
            console.log(`[PresetPackLoader] Called static getPresets(), got:`, typeof presets);
            if (presets) {
              const keys = Object.keys(presets);
              console.log(`[PresetPackLoader] Found ${keys.length} presets via static getPresets()`);
            }
          } catch (e) {
            console.log(`[PresetPackLoader] Error calling getPresets:`, e.message);
          }
        } else {
          // Fallback: try instantiating
          try {
            const instance = new presetModule();
            console.log(`[PresetPackLoader] Created instance, checking for methods...`);

            if (instance && typeof instance.getPresets === 'function') {
              presets = instance.getPresets();
              console.log(`[PresetPackLoader] Called instance getPresets()`);
            }
          } catch (e) {
            console.log(`[PresetPackLoader] Error instantiating:`, e.message);
          }
        }
      } else if (typeof presetModule === 'object') {
        // Try direct object access
        if (presetModule.getPresets && typeof presetModule.getPresets === 'function') {
          presets = presetModule.getPresets();
          console.log(`[PresetPackLoader] Called getPresets() on object`);
        } else {
          presets = presetModule;
          console.log(`[PresetPackLoader] Using module directly as object`);
        }
      }

      // Log what we got
      console.log(`[PresetPackLoader] Got presets object, keys:`, presets ? Object.keys(presets).slice(0, 5) : 'null');

      // Store all presets from this pack
      if (presets && typeof presets === 'object') {
        let count = 0;
        Object.entries(presets).forEach(([name, preset]) => {
          // Skip non-preset properties
          if (typeof preset !== 'object' || !preset) return;

          this.presets.set(name, {
            name,
            preset,
            pack: packName,
            // Mark as v1 preset that can be compiled to WASM
            version: 1,
            needsCompilation: true
          });
          count++;
        });

        console.log(`[PresetPackLoader] Loaded ${count} presets from ${packName}`);
      }

      return true;
    } catch (error) {
      console.error(`[PresetPackLoader] Failed to load pack ${packName}:`, error);
      return false;
    }
  }

  /**
   * Load all available preset packs
   */
  async loadAllPacks() {
    if (this.loaded) {
      console.log('[PresetPackLoader] Presets already loaded');
      return true;
    }

    // First load metadata
    await this.loadMetadata();

    // Start with minimal packs for testing, then expand
    const packs = [
      'butterchurnPresetsMinimal',   // Minimal pack (good for testing)
      'butterchurnPresets',          // Main pack (~100 presets)
      // Uncomment to load all 500+ presets:
      // 'butterchurnPresetsExtra',  // Extra pack (large)
      // 'butterchurnPresetsExtra2', // Extra pack 2 (large)
      // 'butterchurnPresetsNonMinimal', // Non-minimal pack
      // 'butterchurnPresetsMD1',    // MD1 pack
    ];

    console.log('[PresetPackLoader] Starting to load preset packs...');

    for (const pack of packs) {
      await this.loadPresetPack(pack);
    }

    this.loaded = true;
    console.log(`[PresetPackLoader] Total presets loaded: ${this.presets.size}`);

    return true;
  }

  /**
   * Get a preset by name
   */
  getPreset(name) {
    return this.presets.get(name);
  }

  /**
   * Get all preset names
   */
  getPresetNames() {
    return Array.from(this.presets.keys());
  }

  /**
   * Get a random preset
   */
  getRandomPreset() {
    const names = this.getPresetNames();
    if (names.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * names.length);
    return this.presets.get(names[randomIndex]);
  }

  /**
   * Convert v1 preset to v2 format for WASM compilation
   */
  convertToV2Format(v1Preset) {
    // V1 presets have the Milkdrop equation format
    // They need to be prepared for WASM compilation

    if (!v1Preset || !v1Preset.preset) {
      return null;
    }

    const preset = v1Preset.preset;

    return {
      name: v1Preset.name,
      // Include all the Milkdrop preset data
      init_eqs_str: preset.init_eqs_str || '',
      frame_eqs_str: preset.frame_eqs_str || '',
      pixel_eqs_str: preset.pixel_eqs_str || '',
      warp_shader: preset.warp_shader || preset.warp || '',
      comp_shader: preset.comp_shader || preset.comp || '',
      shapes: preset.shapes || [],
      waves: preset.waves || [],
      // Mark for WASM compilation
      wasmSource: preset,
      needsWASM: true,
      version: 1
    };
  }
}

// Singleton instance
const presetPackLoader = new PresetPackLoader();
export default presetPackLoader;