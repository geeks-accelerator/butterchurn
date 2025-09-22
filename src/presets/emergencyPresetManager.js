/**
 * EmergencyPresetManager - Manages emergency fallback presets
 *
 * These are reliability fallbacks (NOT energy-based):
 * 1. minimal - Ultra-simple, guaranteed to work
 * 2. basic_reactive - Simple but shows audio response
 * 3. crowd_pleaser - Visually interesting but still reliable
 *
 * These presets are simple JavaScript equations for maximum reliability
 */

export class EmergencyPresetManager {
  constructor() {
    // The 3 emergency presets - simple equations for reliability
    this.emergencyPresets = {
      minimal: this.getMinimalPreset(),
      basic_reactive: this.getBasicReactivePreset(),
      crowd_pleaser: this.getCrowdPleaserPreset(),
    };

    // Track usage for smart selection
    this.usage = {
      minimal: 0,
      basic_reactive: 0,
      crowd_pleaser: 0,
      lastUsed: null,
      lastSwitchTime: 0,
    };
  }

  /**
   * Get an emergency preset based on context
   */
  getEmergencyPreset(context = {}) {
    // Determine which emergency preset to use
    let presetKey = 'minimal'; // Default to most reliable

    if (context.deviceTier === 'high_end' || context.deviceTier === 'mid_range') {
      // Can handle more complex emergency preset
      if (context.audioLevel > 0.5) {
        presetKey = 'crowd_pleaser';
      } else {
        presetKey = 'basic_reactive';
      }
    } else if (context.deviceTier === 'low_end') {
      // Stick to simple presets
      presetKey = context.audioLevel > 0.3 ? 'basic_reactive' : 'minimal';
    }
    // Mobile always gets minimal for reliability

    // Avoid using the same preset repeatedly
    if (presetKey === this.usage.lastUsed && Date.now() - this.usage.lastSwitchTime < 10000) {
      // Try to use a different one
      const alternatives = Object.keys(this.emergencyPresets).filter((k) => k !== presetKey);
      presetKey = alternatives[Math.floor(Math.random() * alternatives.length)];
    }

    // Track usage
    this.usage[presetKey]++;
    this.usage.lastUsed = presetKey;
    this.usage.lastSwitchTime = Date.now();

    console.log(`[EmergencyPresetManager] Activating ${presetKey} preset`);

    return {
      preset: this.emergencyPresets[presetKey],
      key: presetKey,
      isEmergency: true,
    };
  }

  /**
   * Minimal preset - Ultra simple, guaranteed to work
   * Uses standard Butterchurn preset format
   */
  getMinimalPreset() {
    return {
      id: 'emergency_minimal',
      name: 'Emergency: Minimal',

      // Simple initialization
      init_eqs_str: `
        decay = 0.98;
        wave_r = 0.5;
        wave_g = 0.5;
        wave_b = 0.5;
        wave_mystery = -0.5;
      `,

      // Basic frame equations - just pulse with bass
      frame_eqs_str: `
        wave_r = 0.5 + 0.5 * bass;
        wave_g = 0.5 + 0.3 * mid;
        wave_b = 0.5 + 0.4 * treb;
        zoom = 1.001 + 0.002 * bass;
        rot = 0.001 * sin(time);
      `,

      // Simple per-pixel equations
      pixel_eqs_str: `
        zoom = zoom + 0.01 * sin(rad * 4 + time);
      `,

      // Basic waveform
      waves: [
        {
          enabled: 1,
          thick: 1,
          additive: 0,
          scaling: 1,
          smoothing: 0.5,
          r: 1,
          g: 1,
          b: 1,
          a: 0.8,
        }
      ],

      // Basic shapes
      shapes: [],
    };
  }

  /**
   * Basic Reactive preset - Simple but shows audio response
   */
  getBasicReactivePreset() {
    return {
      id: 'emergency_basic_reactive',
      name: 'Emergency: Basic Reactive',

      init_eqs_str: `
        decay = 0.96;
        wave_r = 0.5;
        wave_g = 0.5;
        wave_b = 0.5;
        wave_mystery = 0;
      `,

      frame_eqs_str: `
        wave_r = 0.3 + 0.7 * bass;
        wave_g = 0.3 + 0.5 * mid;
        wave_b = 0.3 + 0.6 * treb;

        zoom = 1.002 + 0.004 * bass_att;
        rot = 0.002 * sin(time * 0.5) + 0.001 * (bass - treb);

        dx = 0.001 * sin(time);
        dy = 0.001 * cos(time * 1.1);

        decay = 0.96 + 0.03 * bass;
      `,

      pixel_eqs_str: `
        zoom = zoom + 0.02 * sin(rad * 6 + time * 2);
        rot = rot + 0.01 * cos(ang * 4 - time);
      `,

      waves: [
        {
          enabled: 1,
          thick: 1,
          additive: 1,
          scaling: 1.5,
          smoothing: 0.75,
          r: 1,
          g: 0.5,
          b: 0.2,
          a: 1,
        }
      ],

      shapes: [
        {
          enabled: 1,
          sides: 4,
          additive: 1,
          thickoutline: 0,
          x: 0.5,
          y: 0.5,
          rad: 0.3,
          ang: 0,
          r: 0.5,
          g: 0.8,
          b: 1,
          a: 0.3,
          r2: 0.5,
          g2: 0.8,
          b2: 1,
          a2: 0,
          border_r: 1,
          border_g: 1,
          border_b: 1,
          border_a: 0,
        }
      ],
    };
  }

  /**
   * Crowd Pleaser preset - Visually interesting but still reliable
   */
  getCrowdPleaserPreset() {
    return {
      id: 'emergency_crowd_pleaser',
      name: 'Emergency: Crowd Pleaser',

      init_eqs_str: `
        decay = 0.95;
        wave_r = 0.5;
        wave_g = 0.5;
        wave_b = 0.5;
        wave_mystery = -0.2;
        wave_mode = 2;
      `,

      frame_eqs_str: `
        wave_r = 0.2 + 0.8 * bass_att;
        wave_g = 0.2 + 0.6 * mid_att;
        wave_b = 0.2 + 0.7 * treb_att;

        zoom = 1.003 + 0.006 * bass_att;
        rot = 0.003 * sin(time * 0.3) + 0.002 * (bass_att - treb_att);

        cx = 0.5 + 0.1 * sin(time * 0.7);
        cy = 0.5 + 0.1 * cos(time * 0.9);

        dx = 0.002 * sin(time * 1.1) + 0.001 * (bass - 0.5);
        dy = 0.002 * cos(time * 0.9) + 0.001 * (treb - 0.5);

        decay = 0.94 + 0.04 * bass_att;

        wave_mystery = -0.2 + 0.2 * sin(time * 0.5);
      `,

      pixel_eqs_str: `
        zoom = zoom + 0.03 * sin(rad * 8 + time * 3) * bass_att;
        rot = rot + 0.02 * cos(ang * 6 - time * 2) * treb_att;
        sx = sx + 0.01 * sin(time + rad * 4);
        sy = sy + 0.01 * cos(time + rad * 4);
      `,

      waves: [
        {
          enabled: 1,
          thick: 1,
          additive: 1,
          scaling: 2,
          smoothing: 0.9,
          r: 0.9,
          g: 0.2,
          b: 0.4,
          a: 1,
        },
        {
          enabled: 1,
          thick: 0,
          additive: 0,
          scaling: 1,
          smoothing: 0.5,
          r: 0.2,
          g: 0.6,
          b: 0.9,
          a: 0.7,
        }
      ],

      shapes: [
        {
          enabled: 1,
          sides: 32,
          additive: 1,
          thickoutline: 1,
          x: 0.5,
          y: 0.5,
          rad: 0.4,
          ang: 0,
          tex_ang: 0,
          tex_zoom: 1,
          r: 1,
          g: 0.6,
          b: 0.2,
          a: 0.5,
          r2: 0.2,
          g2: 0.6,
          b2: 1,
          a2: 0.3,
          border_r: 1,
          border_g: 1,
          border_b: 1,
          border_a: 0.5,
        },
        {
          enabled: 1,
          sides: 3,
          additive: 0,
          thickoutline: 0,
          x: 0.5,
          y: 0.5,
          rad: 0.15,
          ang: 0,
          r: 0.2,
          g: 0.4,
          b: 0.8,
          a: 0.3,
          r2: 0.1,
          g2: 0.2,
          b2: 0.4,
          a2: 0,
          border_r: 0,
          border_g: 0,
          border_b: 0,
          border_a: 0,
        }
      ],
    };
  }

  /**
   * Check if a preset is an emergency preset
   */
  isEmergencyPreset(preset) {
    if (!preset) return false;
    return preset.id && preset.id.startsWith('emergency_');
  }

  /**
   * Get usage statistics
   */
  getUsageStats() {
    return { ...this.usage };
  }

  /**
   * Reset usage tracking
   */
  resetUsage() {
    this.usage = {
      minimal: 0,
      basic_reactive: 0,
      crowd_pleaser: 0,
      lastUsed: null,
      lastSwitchTime: 0,
    };
  }
}

// Export singleton for easy use
export const emergencyManager = new EmergencyPresetManager();

export default EmergencyPresetManager;