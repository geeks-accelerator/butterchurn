/**
 * Configuration system for v2 - All thresholds and settings in one place
 *
 * This addresses the review feedback about arbitrary hardcoded values.
 * All configuration can be overridden via constructor options or at runtime.
 */

export class Config {
  constructor(overrides = {}) {
    // Deep merge with defaults
    this.settings = this.deepMerge(this.getDefaults(), overrides);

    // Load user preferences from localStorage if available
    this.loadUserPreferences();
  }

  /**
   * Get default configuration
   */
  getDefaults() {
    return {
      // Device tier thresholds (data-driven from performance testing)
      deviceTiers: {
        highEnd: {
          minMemory: 8,
          minCores: 4,
          requiredGPU: 'discrete',
        },
        midRange: {
          minMemory: 4,
          minCores: 2,
          requiredGPU: null,
        },
        lowEnd: {
          maxMemory: 4,
          maxCores: 2,
        },
      },

      // Frame analysis thresholds (based on user testing feedback)
      frameAnalysis: {
        thresholds: {
          blackFrame: 60, // frames before considered black (1s @ 60fps)
          stuckFrame: 120, // frames before considered stuck (2s @ 60fps)
          solidColor: 180, // frames before considered solid (3s @ 60fps)
        },
        sensitivity: {
          blackThreshold: 0.95, // % of pixels that must be black
          colorVariance: 10, // max variance for solid color
          frameChangeThreshold: 0.01, // minimum % change between frames
        },
        // Device-specific adjustments
        deviceAdjustments: {
          mobile: {
            blackFrame: 1.5, // multiplier: 90 frames
            stuckFrame: 1.5, // multiplier: 180 frames
            solidColor: 1.33, // multiplier: 240 frames
          },
          lowEnd: {
            blackFrame: 1.25, // multiplier: 75 frames
            stuckFrame: 1.25, // multiplier: 150 frames
            solidColor: 1.17, // multiplier: 210 frames
          },
          highEnd: {
            blackFrame: 0.5, // multiplier: 30 frames
            stuckFrame: 0.5, // multiplier: 60 frames
            solidColor: 0.67, // multiplier: 120 frames
          },
        },
      },

      // Preset failure thresholds
      presetFailures: {
        autoBlocklist: {
          failureRateThreshold: 0.8, // 80% failure rate
          totalFailuresThreshold: 50, // absolute failure count
        },
        sessionLogRetention: 5, // keep last N session logs
        aggregateLogMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
      },

      // WASM error handling
      wasmErrors: {
        maxWASM2Failures: 3, // strikes before disabling WASM2
        logRetentionDays: 7, // days to keep error logs
        maxLogSizeMB: 2, // max size before trimming
        notificationRateLimit: 5000, // ms between user notifications
      },

      // Performance settings
      performance: {
        cacheTimeout: 5 * 60 * 1000, // capability cache duration
        frameAnalysisSampleSize: 1000, // pixels to sample per frame
        autoSaveInterval: 30000, // ms between auto-saves
      },

      // Rendering strategies by device tier
      renderingStrategies: {
        highEnd: {
          resolution: 1920,
          fftSize: 4096,
          targetFPS: 60,
          presetCandidates: 50,
          maxMemoryPages: 256, // 16MB
        },
        midRange: {
          resolution: 1280,
          fftSize: 2048,
          targetFPS: 60,
          presetCandidates: 30,
          maxMemoryPages: 128, // 8MB
        },
        lowEnd: {
          resolution: 854,
          fftSize: 1024,
          targetFPS: 30,
          presetCandidates: 15,
          maxMemoryPages: 64, // 4MB
        },
        mobile: {
          resolution: 640,
          fftSize: 512,
          targetFPS: 30,
          presetCandidates: 10,
          maxMemoryPages: 32, // 2MB
        },
      },

      // User preferences (can be overridden)
      userPreferences: {
        enableWASM2: true,
        enableThreads: true,
        enableSIMD: true,
        enableThreeJS: true,
        autoBlocklistEnabled: true,
        debugMode: false,
        verboseLogging: false,
      },
    };
  }

  /**
   * Deep merge objects
   * NOTE: Arrays are replaced, not merged. This is intentional for configuration
   * where arrays typically represent complete lists that should be overwritten.
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Load user preferences from localStorage
   */
  loadUserPreferences() {
    try {
      const stored = localStorage.getItem('butterchurn-v2-config');
      if (stored) {
        const prefs = JSON.parse(stored);
        this.settings.userPreferences = this.deepMerge(this.settings.userPreferences, prefs);
      }
    } catch (e) {
      console.warn('[Config] Failed to load user preferences:', e);

      // Notify user that their settings couldn't be loaded
      if (typeof window !== 'undefined' && window.butterchurnNotify) {
        window.butterchurnNotify('Your custom settings could not be loaded. Using defaults.');
      }

      // Clear corrupted settings
      try {
        localStorage.removeItem('butterchurn-v2-config');
      } catch (clearError) {
        console.error('[Config] Failed to clear corrupted settings:', clearError);
      }
    }
  }

  /**
   * Save user preferences
   */
  saveUserPreferences() {
    try {
      localStorage.setItem('butterchurn-v2-config', JSON.stringify(this.settings.userPreferences));
    } catch (e) {
      console.warn('[Config] Failed to save user preferences:', e);
    }
  }

  /**
   * Get configuration for a specific component
   */
  get(path) {
    const parts = path.split('.');
    let value = this.settings;

    for (const part of parts) {
      value = value[part];
      if (value === undefined) return undefined;
    }

    return value;
  }

  /**
   * Set configuration value
   */
  set(path, value) {
    const parts = path.split('.');
    let target = this.settings;

    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]]) {
        target[parts[i]] = {};
      }
      target = target[parts[i]];
    }

    target[parts[parts.length - 1]] = value;

    // Auto-save user preferences
    if (path.startsWith('userPreferences.')) {
      this.saveUserPreferences();
    }
  }

  /**
   * Get device-adjusted thresholds
   */
  getAdjustedThresholds(deviceTier) {
    const base = this.settings.frameAnalysis.thresholds;
    const adjustments = this.settings.frameAnalysis.deviceAdjustments[deviceTier];

    if (!adjustments) return base;

    return {
      blackFrame: Math.round(base.blackFrame * (adjustments.blackFrame || 1)),
      stuckFrame: Math.round(base.stuckFrame * (adjustments.stuckFrame || 1)),
      solidColor: Math.round(base.solidColor * (adjustments.solidColor || 1)),
    };
  }

  /**
   * Get rendering strategy for device
   */
  getRenderingStrategy(deviceTier) {
    return (
      this.settings.renderingStrategies[deviceTier] || this.settings.renderingStrategies.lowEnd
    );
  }

  /**
   * Check if a feature is enabled
   */
  isEnabled(feature) {
    return this.settings.userPreferences[feature] === true;
  }

  /**
   * Export configuration (for debugging/sharing)
   */
  export() {
    return JSON.parse(JSON.stringify(this.settings));
  }

  /**
   * Import configuration
   */
  import(config) {
    this.settings = this.deepMerge(this.getDefaults(), config);
    this.saveUserPreferences();
  }

  /**
   * Reset to defaults
   */
  reset() {
    this.settings = this.getDefaults();
    localStorage.removeItem('butterchurn-v2-config');
  }

  /**
   * Validate configuration
   */
  validate() {
    const errors = [];
    const s = this.settings;

    // WASM error settings
    if (s.wasmErrors.maxWASM2Failures < 1) {
      errors.push('maxWASM2Failures must be at least 1');
    }
    if (s.wasmErrors.logRetentionDays < 1) {
      errors.push('logRetentionDays must be at least 1');
    }
    if (s.wasmErrors.maxLogSizeMB < 0.1 || s.wasmErrors.maxLogSizeMB > 50) {
      errors.push('maxLogSizeMB must be between 0.1 and 50');
    }

    // Frame analysis thresholds
    const fa = s.frameAnalysis;
    if (fa.sensitivity.blackThreshold < 0 || fa.sensitivity.blackThreshold > 1) {
      errors.push('blackThreshold must be between 0 and 1');
    }
    if (fa.sensitivity.frameChangeThreshold < 0 || fa.sensitivity.frameChangeThreshold > 1) {
      errors.push('frameChangeThreshold must be between 0 and 1');
    }
    if (fa.thresholds.blackFrame < 1 || fa.thresholds.blackFrame > 600) {
      errors.push('blackFrame threshold must be between 1 and 600 frames');
    }
    if (fa.thresholds.stuckFrame < fa.thresholds.blackFrame) {
      errors.push('stuckFrame threshold should be >= blackFrame threshold');
    }

    // Device tier memory validation
    const dt = s.deviceTiers;
    if (dt.lowEnd.maxMemory >= dt.midRange.minMemory) {
      errors.push('lowEnd.maxMemory must be less than midRange.minMemory');
    }
    if (dt.midRange.minMemory >= dt.highEnd.minMemory) {
      errors.push('midRange.minMemory must be less than highEnd.minMemory');
    }

    // Preset failure thresholds
    const pf = s.presetFailures.autoBlocklist;
    if (pf.failureRateThreshold < 0 || pf.failureRateThreshold > 1) {
      errors.push('failureRateThreshold must be between 0 and 1');
    }
    if (pf.totalFailuresThreshold < 1) {
      errors.push('totalFailuresThreshold must be at least 1');
    }

    // Rendering strategies validation
    for (const [tier, strategy] of Object.entries(s.renderingStrategies)) {
      if (strategy.resolution < 320 || strategy.resolution > 3840) {
        errors.push(`${tier}.resolution must be between 320 and 3840`);
      }
      if (strategy.targetFPS < 15 || strategy.targetFPS > 120) {
        errors.push(`${tier}.targetFPS must be between 15 and 120`);
      }
      if (strategy.fftSize && ![128, 256, 512, 1024, 2048, 4096].includes(strategy.fftSize)) {
        errors.push(`${tier}.fftSize must be a power of 2 between 128 and 4096`);
      }
      if (strategy.maxMemoryPages < 1 || strategy.maxMemoryPages > 65536) {
        errors.push(`${tier}.maxMemoryPages must be between 1 and 65536`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance with default config
export const config = new Config();

// Also export class for custom instances
export default Config;
