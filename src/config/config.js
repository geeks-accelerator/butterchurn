/**
 * Configuration system - All thresholds and settings in one place
 *
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
        },
        midRange: {
          minMemory: 4,
          minCores: 2,
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
          targetFPS: 60,
          meshSize: 64,
          enableFXAA: true,
        },
        midRange: {
          resolution: 1280,
          targetFPS: 60,
          meshSize: 48,
          enableFXAA: false,
        },
        lowEnd: {
          resolution: 800,
          targetFPS: 30,
          meshSize: 32,
          enableFXAA: false,
        },
        mobile: {
          resolution: 640,
          targetFPS: 30,
          meshSize: 24,
          enableFXAA: false,
        },
      },

      // Intelligent preset selection
      presetSelection: {
        minSwitchInterval: 2000, // 2 seconds minimum
        maxSwitchInterval: 30000, // 30 seconds maximum
        warmupBufferTime: 2000, // Extra time after warmup

        // Musical event detection
        musicalEvents: {
          dropDetectionThreshold: 0.8, // Energy change for drop
          buildupDetectionThreshold: 0.3, // Energy rise rate
          structureChangeThreshold: 0.5, // Confidence for section change
        },

        // Scoring weights
        scoringWeights: {
          energyMatch: 0.3,
          frequencyMatch: 0.25,
          rhythmMatch: 0.2,
          dynamicsMatch: 0.15,
          continuity: 0.1,
        },
      },

      // Emergency presets (hardcoded simple presets that always work)
      emergencyPresets: {
        maxEmergencyTime: 10000, // Max time to show emergency preset (10s)
        transitionTime: 2000, // Blend time when exiting emergency mode
      },

      // User preferences (can be overridden)
      userPreferences: {
        preferHighQuality: false,
        preferredGenres: [],
        skipProblematicPresets: true,
        allowExperimental: false,
      },
    };
  }

  /**
   * Deep merge two objects
   */
  deepMerge(target, source) {
    const output = { ...target };

    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }

    return output;
  }

  /**
   * Check if value is an object
   */
  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Get setting by path (e.g., 'frameAnalysis.thresholds.blackFrame')
   */
  get(path, defaultValue = null) {
    const keys = path.split('.');
    let current = this.settings;

    for (const key of keys) {
      if (current[key] === undefined) {
        return defaultValue;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * Set setting by path
   */
  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let current = this.settings;

    for (const key of keys) {
      if (!current[key]) {
        current[key] = {};
      }
      current = current[key];
    }

    current[lastKey] = value;
    this.saveUserPreferences();
  }

  /**
   * Get device-specific configuration
   */
  getDeviceConfig(deviceTier) {
    const base = this.settings;
    const strategy = base.renderingStrategies[deviceTier] || base.renderingStrategies.midRange;

    // Apply device adjustments to frame analysis
    const frameAdjustments = base.frameAnalysis.deviceAdjustments[deviceTier];
    let frameThresholds = { ...base.frameAnalysis.thresholds };

    if (frameAdjustments) {
      Object.keys(frameThresholds).forEach(key => {
        if (frameAdjustments[key]) {
          frameThresholds[key] = Math.round(frameThresholds[key] * frameAdjustments[key]);
        }
      });
    }

    return {
      rendering: strategy,
      frameAnalysis: {
        ...base.frameAnalysis,
        thresholds: frameThresholds,
      },
      performance: base.performance,
    };
  }

  /**
   * Load user preferences from localStorage
   */
  loadUserPreferences() {
    try {
      const stored = localStorage.getItem('butterchurn-user-config');
      if (stored) {
        const prefs = JSON.parse(stored);
        this.settings.userPreferences = {
          ...this.settings.userPreferences,
          ...prefs,
        };
      }
    } catch (e) {
      console.warn('[Config] Failed to load user preferences:', e);
    }
  }

  /**
   * Save user preferences to localStorage
   */
  saveUserPreferences() {
    try {
      localStorage.setItem(
        'butterchurn-user-config',
        JSON.stringify(this.settings.userPreferences)
      );
    } catch (e) {
      console.warn('[Config] Failed to save user preferences:', e);
    }
  }

  /**
   * Reset to defaults
   */
  reset() {
    this.settings = this.getDefaults();
    this.saveUserPreferences();
  }

  /**
   * Export configuration for debugging
   */
  export() {
    return JSON.stringify(this.settings, null, 2);
  }

  /**
   * Import configuration
   */
  import(configString) {
    try {
      const imported = JSON.parse(configString);
      this.settings = this.deepMerge(this.getDefaults(), imported);
      this.saveUserPreferences();
      return true;
    } catch (e) {
      console.error('[Config] Failed to import configuration:', e);
      return false;
    }
  }
}

// Export singleton for easy use
export const config = new Config();

export default Config;