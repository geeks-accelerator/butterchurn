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
   * Backported from v2 with working equations
   */
  getMinimalPreset() {
    return {
      id: 'emergency_minimal',
      name: 'Emergency: Minimal',

      // Simple initialization
      init_eqs_str: `
        a.decay = 0.98;
        a.wave_r = 0.5;
        a.wave_g = 0.5;
        a.wave_b = 0.5;
        a.wave_a = 0.8;
        a.wave_mystery = -0.5;
        a.wave_mode = 0;
        a.wave_dots = 0;
        a.wave_thick = 1;
        a.wave_brighten = 1;
        a.zoom = 1.0;
        a.rot = 0.0;
        a.cx = 0.5;
        a.cy = 0.5;
      `,

      // Basic frame equations - audio reactive zoom and rotation
      frame_eqs_str: `
        // Pulsing colors based on audio
        a.wave_r = 0.2 + 0.3 * Math.sin(a.time * 2.0) * 0.85 + a.bass * 0.5;
        a.wave_g = 0.1 + a.mid * 0.3;
        a.wave_b = 0.4 + a.treb * 0.2;

        // Audio-reactive zoom with baseline
        a.zoom = 1.0 + Math.sin(a.time) * 0.02 + a.bass * 0.05;

        // Slight rotation based on time
        a.rot = Math.sin(a.time * 0.5) * 0.01;

        // Keep decay high for minimal effect
        a.decay = 0.98;
      `,

      // Simple per-pixel equations - subtle distortion
      pixel_eqs_str: `
        // Add subtle zoom variation based on radius
        var dist = Math.sqrt((a.x - 0.5) * (a.x - 0.5) + (a.y - 0.5) * (a.y - 0.5));
        a.zoom = a.zoom + Math.sin(dist * 10.0 + a.time * 2.0) * 0.01;
      `,

      // Basic waveform
      waves: [
        {
          baseVals: {
            enabled: 1,
            thick: 1,
            additive: 0,
            scaling: 1,
            smoothing: 0.5,
            r: 1,
            g: 1,
            b: 1,
            a: 0.8,
          },
          // Static wave - no equations needed
          init_eqs_str: '',
          frame_eqs_str: '',
          point_eqs_str: ''
        }
      ],

      // Basic shapes
      shapes: [],

      // Empty warp and comp shaders (required by renderer)
      warp: '',
      comp: '',
    };
  }

  /**
   * Basic Reactive preset - Simple but shows audio response
   * Backported from v2 with motion blur effects
   */
  getBasicReactivePreset() {
    return {
      id: 'emergency_basic_reactive',
      name: 'Emergency: Basic Reactive',

      init_eqs_str: `
        a.decay = 0.96;
        a.wave_r = 0.5;
        a.wave_g = 0.5;
        a.wave_b = 0.5;
        a.wave_a = 1.0;
        a.wave_mystery = 0;
        a.wave_mode = 1;
        a.wave_dots = 0;
        a.wave_thick = 1;
        a.wave_brighten = 1;
        a.zoom = 1.0;
        a.rot = 0.0;
        a.cx = 0.5;
        a.cy = 0.5;
        a.dx = 0.0;
        a.dy = 0.0;
        a.echo_alpha = 0.3;
        a.echo_zoom = 1.02;
      `,

      frame_eqs_str: `
        // Color waves based on frequency
        var wave = Math.sin(a.time * 2.0) * 0.5 + 0.5;
        a.wave_r = 0.15 + a.bass * wave + wave * 0.2;
        a.wave_g = 0.15 + a.mid * (1.0 - wave) + (1.0 - wave) * 0.1;
        a.wave_b = 0.15 + a.treb * 0.5 + 0.2;

        // Audio-driven zoom
        a.zoom = 1.0 + a.bass * 0.1;

        // Motion blur effect via decay
        a.decay = 0.96 - a.bass * 0.04;

        // Add motion offset
        a.dx = Math.cos(a.time * 2.0) * 0.003;
        a.dy = Math.sin(a.time * 2.0) * 0.003;

        // Echo for motion trails
        a.echo_alpha = 0.25 + a.bass * 0.1;
        a.echo_zoom = 0.992;
      `,

      pixel_eqs_str: `
        // Add wave distortion based on position
        var wave_x = Math.sin(a.x * 10.0 + a.time * 2.0) * 0.5 + 0.5;
        a.sx = a.sx + wave_x * 0.01 * a.bass;
        a.sy = a.sy + (1.0 - wave_x) * 0.01 * a.mid;
      `,

      waves: [
        {
          baseVals: {
            enabled: 1,
            thick: 1,
            additive: 1,
            scaling: 1.5,
            smoothing: 0.75,
            r: 1,
            g: 0.5,
            b: 0.2,
            a: 1,
          },
          // Static wave - no equations needed
          init_eqs_str: '',
          frame_eqs_str: '',
          point_eqs_str: ''
        }
      ],

      shapes: [
        {
          baseVals: {
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
          },
          // Static shape - no equations needed
          init_eqs_str: '',
          frame_eqs_str: ''
        }
      ],

      // Empty warp and comp shaders (required by renderer)
      warp: '',
      comp: '',
    };
  }

  /**
   * Crowd Pleaser preset - Visually interesting but still reliable
   * Backported from v2 with psychedelic spiral effects
   */
  getCrowdPleaserPreset() {
    return {
      id: 'emergency_crowd_pleaser',
      name: 'Emergency: Crowd Pleaser',

      init_eqs_str: `
        a.decay = 0.92;
        a.wave_r = 0.5;
        a.wave_g = 0.5;
        a.wave_b = 0.5;
        a.wave_a = 1.0;
        a.wave_mystery = 0.5;
        a.wave_mode = 3;
        a.wave_dots = 0;
        a.wave_thick = 1;
        a.wave_brighten = 1;
        a.wave_x = 0.5;
        a.wave_y = 0.5;
        a.zoom = 1.0;
        a.rot = 0.0;
        a.cx = 0.5;
        a.cy = 0.5;
        a.dx = 0.0;
        a.dy = 0.0;
        a.warp = 0.0;
        a.sx = 1.0;
        a.sy = 1.0;
        a.echo_alpha = 0.5;
        a.echo_zoom = 1.01;
        a.echo_orient = 0;
        a.b1n = 0.0;
        a.b2n = 0.0;
        a.b3n = 0.0;
        a.b1x = 1.0;
        a.b1y = 1.0;
      `,

      frame_eqs_str: `
        // Update beat detection
        a.b1n = a.bass * 1.2;
        a.b2n = a.mid * 1.2;
        a.b3n = a.treb * 1.2;

        // Color rings that pulse with music
        var ring_time = a.time * 3.0;
        var ring = Math.sin(ring_time) * 0.5 + 0.5;
        var ring2 = Math.cos(ring_time * 0.7) * 0.5 + 0.5;

        // Rich, vibrant colors
        a.wave_r = ring * 0.4 + a.bass * 0.8 + 0.1;
        a.wave_g = (1.0 - ring) * 0.3 + a.mid * 0.6 + 0.1;
        a.wave_b = ring2 * 0.3 + a.treb * 0.7 + 0.2;

        // Spiral warp with bass response
        a.warp = 0.3 + Math.sin(a.time * 0.7) * 0.2 + a.bass * 0.3;

        // Dynamic zoom with breathing effect
        a.zoom = 0.99 + Math.sin(a.time * 0.5) * 0.005 + a.bass * 0.02 - a.treb * 0.01;

        // Rotation creates swirl effect
        a.rot = a.rot + 0.002 + a.bass * 0.01 - a.treb * 0.005;

        // Center drift for organic movement
        a.cx = 0.5 + Math.sin(a.time * 0.413) * 0.08;
        a.cy = 0.5 + Math.cos(a.time * 0.533) * 0.08;

        // Slight drift
        a.dx = Math.sin(a.time * 0.911) * 0.002 + (a.bass - a.treb) * 0.001;
        a.dy = Math.cos(a.time * 1.131) * 0.002 + (a.mid - a.bass) * 0.001;

        // Decay creates trails
        a.decay = 0.92 + a.bass * 0.03 - a.treb * 0.01;

        // Echo for psychedelic trails
        a.echo_alpha = 0.3 + a.bass * 0.2;
        a.echo_zoom = 1.01 + a.bass * 0.01;
        a.echo_orient = Math.sin(a.time * 0.1) * 2;

        // Wave position moves with beat
        a.wave_x = 0.5 + Math.sin(a.time * 1.7) * 0.1 * a.bass;
        a.wave_y = 0.5 + Math.cos(a.time * 1.3) * 0.1 * a.mid;

        // Mystery creates texture variation
        a.wave_mystery = Math.sin(a.time * 11.0) * 0.5 + a.treb * 0.3;

        // Brightness pulsing
        a.b1x = 1.0 + a.bass * 0.2;
        a.b1y = 1.0 + a.mid * 0.2;
      `,

      pixel_eqs_str: `
        // Spiral distortion with multiple layers
        var angle = Math.atan2(a.y - 0.5, a.x - 0.5);
        var dist = Math.sqrt((a.x - 0.5) * (a.x - 0.5) + (a.y - 0.5) * (a.y - 0.5));

        // Multi-frequency spiral
        angle = angle + Math.sin(a.time + dist * 10.0) * a.bass * 0.2;
        angle = angle + Math.cos(a.time * 0.7 + dist * 5.0) * a.mid * 0.1;

        // Apply spiral warp
        var new_dist = dist * (1.0 + Math.sin(angle * 6.0 + a.time * 2.0) * 0.05 * a.bass);

        a.x = 0.5 + Math.cos(angle) * new_dist;
        a.y = 0.5 + Math.sin(angle) * new_dist;

        // Color shift based on position
        a.sx = a.sx * (1.0 + Math.sin(dist * 20.0 - a.time * 3.0) * 0.02);
        a.sy = a.sy * (1.0 + Math.cos(dist * 20.0 - a.time * 2.0) * 0.02);

        // Add sparkle/noise
        var sparkle = Math.sin(a.x * 127.1 + a.y * 311.7 + a.time * 10.0) *
                      Math.cos(a.x * 269.5 + a.y * 183.3 + a.time * 15.0);
        a.dx = a.dx + sparkle * 0.0005 * a.treb;
        a.dy = a.dy + sparkle * 0.0005 * a.treb;
      `,

      waves: [
        {
          baseVals: {
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
          // Static wave - no equations needed
          init_eqs_str: '',
          frame_eqs_str: '',
          point_eqs_str: ''
        },
        {
          baseVals: {
            enabled: 1,
            thick: 0,
            additive: 0,
            scaling: 1,
            smoothing: 0.5,
            r: 0.2,
            g: 0.6,
            b: 0.9,
            a: 0.7,
          },
          // Static wave - no equations needed
          init_eqs_str: '',
          frame_eqs_str: '',
          point_eqs_str: ''
        }
      ],

      shapes: [
        {
          baseVals: {
            enabled: 1,
            sides: 32,
            additive: 1,
            thickoutline: 1,
            x: 0.5,
            y: 0.5,
            rad: 0.3,
            ang: 0,
            tex_ang: 0,
            tex_zoom: 1,
            r: 1,
            g: 0.3,
            b: 0.5,
            a: 0.4,
            r2: 0.5,
            g2: 0.3,
            b2: 1,
            a2: 0.2,
            border_r: 1,
            border_g: 1,
            border_b: 1,
            border_a: 0.3,
          },
          // Animated shape
          init_eqs_str: '',
          frame_eqs_str: `
            a.rad = 0.2 + 0.15 * a.bass;
            a.ang = a.time * 0.5;
            a.r = 0.5 + 0.5 * Math.sin(a.time * 2.1);
            a.g = 0.5 + 0.5 * Math.sin(a.time * 1.7);
            a.b = 0.5 + 0.5 * Math.sin(a.time * 1.3);
            a.a = 0.2 + 0.3 * a.bass;
          `
        },
        {
          baseVals: {
            enabled: 1,
            sides: 6,
            additive: 1,
            thickoutline: 0,
            x: 0.5,
            y: 0.5,
            rad: 0.1,
            ang: 0,
            r: 0.3,
            g: 0.6,
            b: 0.9,
            a: 0.2,
            r2: 0.9,
            g2: 0.6,
            b2: 0.3,
            a2: 0,
            border_r: 0,
            border_g: 0,
            border_b: 0,
            border_a: 0,
          },
          // Animated shape
          init_eqs_str: '',
          frame_eqs_str: `
            a.x = 0.5 + 0.3 * Math.cos(a.time * 0.7);
            a.y = 0.5 + 0.3 * Math.sin(a.time * 0.9);
            a.rad = 0.05 + 0.1 * a.mid;
            a.ang = a.time * -1.0;
            a.r = a.bass;
            a.g = a.mid;
            a.b = a.treb;
          `
        },
        {
          baseVals: {
            enabled: 1,
            sides: 4,
            additive: 1,
            thickoutline: 1,
            x: 0.5,
            y: 0.5,
            rad: 0.25,
            ang: 0,
            r: 1,
            g: 0.5,
            b: 0.2,
            a: 0.1,
            r2: 0.2,
            g2: 0.5,
            b2: 1,
            a2: 0.1,
            border_r: 1,
            border_g: 0.8,
            border_b: 0.6,
            border_a: 0.2,
          },
          // Animated shape
          init_eqs_str: '',
          frame_eqs_str: `
            a.ang = a.time * 0.3;
            a.rad = 0.2 + 0.1 * Math.sin(a.time * 1.1);
            a.x = 0.5 + 0.1 * Math.sin(a.time * 0.53);
            a.y = 0.5 + 0.1 * Math.cos(a.time * 0.47);
            a.border_a = 0.1 + 0.2 * a.treb;
          `
        }
      ],

      // Empty warp and comp shaders (required by renderer)
      warp: '',
      comp: '',
    };
  }

  /**
   * Check if a preset is an emergency preset
   */
  isEmergencyPreset(preset) {
    if (!preset) {return false;}
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