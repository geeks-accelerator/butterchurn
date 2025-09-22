/**
 * EmergencyPresetManager - Manages 3 emergency fallback presets
 *
 * These are reliability fallbacks (NOT energy-based):
 * 1. minimal - Ultra-simple, guaranteed to work
 * 2. basic_reactive - Simple but shows audio response
 * 3. crowd_pleaser - Visually interesting but still reliable
 *
 * These presets are hardcoded for maximum reliability
 */

export class EmergencyPresetManager {
  constructor() {
    // The 3 emergency presets - hardcoded for reliability
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

    // Hot cache - keep these precompiled
    this.compiledPresets = new Map();
    this.precompileAll();
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
      // 10 seconds
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
      compiled: this.compiledPresets.get(presetKey),
      key: presetKey,
      isEmergency: true,
    };
  }

  /**
   * Minimal preset - Ultra simple, guaranteed to work
   */
  getMinimalPreset() {
    return {
      id: 'emergency_minimal',
      name: 'Emergency: Minimal',
      description: 'Ultra-simple visualization that always works',

      // Minimal warp effect - audio reactive zoom (native GLSL)
      warp: `
        vec2 center = vec2(0.5, 0.5);
        float zoom = 1.0 + sin(uTime) * 0.02 + uBassLevel * 0.05;
        vec2 distorted = center + (vTexCoord - center) * zoom;

        // Add slight rotation based on time
        float angle = sin(uTime * 0.5) * 0.01;
        float s = sin(angle);
        float c = cos(angle);
        vec2 rotated = vec2(
          c * (distorted.x - 0.5) - s * (distorted.y - 0.5) + 0.5,
          s * (distorted.x - 0.5) + c * (distorted.y - 0.5) + 0.5
        );

        return rotated;
      `,

      // Simple pulsing colors with baseline visibility
      pixel: `
        float audio = (uBassLevel + uMidLevel + uTrebleLevel) / 3.0;

        // Time-based pulsing
        float pulse = sin(uTime * 2.0) * 0.15 + 0.85;

        // Create a gradient based on position
        float gradient = length(vTexCoord - vec2(0.5, 0.5));

        return vec3(
          0.2 + pulse * 0.3 + audio * 0.5,          // Red channel
          0.1 + gradient * 0.3 + audio * 0.3,       // Green channel
          0.4 + (1.0 - gradient) * 0.4 + audio * 0.2  // Blue channel
        );
      `,

      // Basic composite (native GLSL)
      composite: `
        // Simple temporal feedback with fade
        vec3 result = mix(color, feedback * 0.95, 0.1); // 10% feedback blend, less decay
        return result; // No additional fade needed
      `,

      // Minimal settings - ENABLE WARP
      settings: {
        fps: 30,
        meshSize: 16,
        aspectRatio: 1.0,
        enableComposite: false,
        enableWarp: true,  // ENABLED - add zoom distortion
      },
    };
  }

  /**
   * Basic Reactive preset - Simple but shows audio response
   */
  getBasicReactivePreset() {
    return {
      id: 'emergency_basic_reactive',
      name: 'Emergency: Basic Reactive',
      description: 'Simple audio-reactive visualization',

      // Audio-driven warp (native GLSL)
      warp: `
        float bass = uBassLevel;
        float zoom = 1.0 + bass * 0.1;
        vec2 center = vec2(0.5, 0.5);
        return center + (vTexCoord - center) * zoom;
      `,

      // Color waves based on frequency (native GLSL)
      pixel: `
        float bass = uBassLevel;
        float mid = uMidLevel;
        float treble = uTrebleLevel;

        float wave = sin(vTexCoord.x * 10.0 + uTime * 2.0) * 0.5 + 0.5;

        // Add baseline visibility
        float baseline = 0.15;

        return vec3(
          baseline + bass * wave + wave * 0.2,
          baseline + mid * (1.0 - wave) + (1.0 - wave) * 0.1,
          baseline + treble * 0.5 + 0.2
        );
      `,

      // TRUE TEMPORAL FEEDBACK: Motion blur with reactive glow (native GLSL)
      composite: `

        // Create motion blur using temporal feedback
        vec2 motionOffset = vec2(
          cos(uTime * 2.0) * 0.003,
          sin(uTime * 2.0) * 0.003
        );
        vec3 motionFeedback = texture2D(uFeedback, vTexCoord + motionOffset).rgb;

        // Combine current with previous frame for motion blur
        vec3 blurred = mix(color, motionFeedback * 0.96, 0.25 + uBassLevel * 0.1);

        // Add temporal glow accumulation
        float brightness = dot(blurred, vec3(0.299, 0.587, 0.114));
        vec3 glow = feedback * 0.92; // Less aggressive decay

        if (brightness > 0.4) {
          // Add new glow to bright areas (lower threshold)
          glow += blurred * (brightness - 0.4) * 0.35;
        }

        // Mix current frame with accumulated glow
        vec3 result = max(blurred * 1.05, glow); // Boost current frame slightly

        return min(result, vec3(1.0)); // Clamp instead of fade
      `,

      settings: {
        fps: 60,
        meshSize: 32,
        aspectRatio: 1.0,
        enableComposite: true,  // ENABLED - add motion blur
        enableWarp: true,  // ENABLED - add bass-reactive zoom
      },
    };
  }

  /**
   * Crowd Pleaser preset - Visually interesting but reliable
   */
  getCrowdPleaserPreset() {
    return {
      id: 'emergency_crowd_pleaser',
      name: 'Emergency: Crowd Pleaser',
      description: 'Reliable but visually engaging',

      // Spiral warp effect (native GLSL)
      warp: `
        float bass = uBassLevel;
        float angle = atan(vTexCoord.y - 0.5, vTexCoord.x - 0.5);
        float dist = length(vTexCoord - vec2(0.5, 0.5));

        angle += sin(uTime + dist * 10.0) * bass * 0.2;

        return vec2(
          0.5 + cos(angle) * dist,
          0.5 + sin(angle) * dist
        );
      `,

      // Colorful reactive patterns (native GLSL)
      pixel: `
        float bass = uBassLevel;
        float mid = uMidLevel;
        float treble = uTrebleLevel;

        // Radial gradient
        float dist = length(vTexCoord - vec2(0.5, 0.5));

        // Color rings
        float ring = sin(dist * 20.0 - uTime * 3.0) * 0.5 + 0.5;

        // Baseline visibility + audio modulation
        vec3 color = vec3(
          ring * 0.3 + ring * bass + 0.1,
          (1.0 - ring) * 0.2 + (1.0 - ring) * mid + 0.1,
          sin(uTime * 2.0) * 0.3 + sin(uTime * 2.0) * treble + 0.2
        );

        // Add some sparkle (using simple noise)
        float sparkle = fract(sin(dot(vTexCoord + uTime, vec2(12.9898, 78.233))) * 43758.5453);
        color += sparkle * 0.1 + sparkle * treble * 0.2;

        return color;
      `,

      // TRUE TEMPORAL FEEDBACK with psychedelic trails (native GLSL)
      composite: `

        // Create motion blur by mixing current with slightly zoomed previous frame
        vec2 zoomCoord = (vTexCoord - 0.5) * 0.992 + 0.5;
        vec3 zoomedFeedback = texture2D(uFeedback, zoomCoord).rgb;

        // Combine current frame with previous for true temporal trails
        vec3 trails = zoomedFeedback * 0.94; // Less aggressive decay

        // Mix current with temporal trails (boost current frame)
        vec3 result = max(color * 0.85, trails);

        // Add subtle rotation to feedback for swirl effect
        float angle = uTime * 0.015 + uBassLevel * 0.08;
        vec2 rotatedCoord = vec2(
          cos(angle) * (vTexCoord.x - 0.5) - sin(angle) * (vTexCoord.y - 0.5) + 0.5,
          sin(angle) * (vTexCoord.x - 0.5) + cos(angle) * (vTexCoord.y - 0.5) + 0.5
        );
        vec3 rotatedFeedback = texture2D(uFeedback, rotatedCoord).rgb;
        result = mix(result, rotatedFeedback * 1.05, 0.12); // Boost rotated feedback

        // Add color rotation based on audio for psychedelic effect
        float rotation = uBassLevel * 0.05;
        result.rgb = vec3(
          result.r * (1.0 - rotation) + result.b * rotation,
          result.g * 1.02, // Slight green boost for vibrancy
          result.b * (1.0 - rotation) + result.r * rotation
        );

        // Boost brightness while clamping to prevent overflow
        return min(result * 1.02, vec3(1.0));
      `,

      settings: {
        fps: 60,
        meshSize: 48,
        aspectRatio: 1.0,
        enableComposite: true,  // ENABLED - add echo/feedback effects
        enableWarp: true,  // ENABLED - add spiral distortion
        enableEcho: true,  // ENABLED - for trails
        echoAlpha: 0.3,
        echoZoom: 1.02,
      },
    };
  }

  /**
   * Precompile all emergency presets for instant switching
   */
  async precompileAll() {
    // Create a temporary canvas for WebGL context
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

    if (!gl) {
      console.error('[EmergencyPresetManager] WebGL not available for shader compilation');
      return;
    }

    for (const [key, preset] of Object.entries(this.emergencyPresets)) {
      try {
        const compiled = await this.compilePresetShaders(gl, preset);

        // For now, emergency presets use WebGL only
        // TODO: Integrate real WASM compilation when v1 presets are loaded
        this.compiledPresets.set(key, {
          ready: true,
          compiledAt: Date.now(),
          shaders: compiled.shaders,
          programs: compiled.programs,
          original: preset,
          version: 0, // 0 = WebGL, 1+ = WASM
        });

        console.log(`[EmergencyPresetManager] Successfully compiled ${key}`);
      } catch (e) {
        console.error(`[EmergencyPresetManager] Failed to precompile ${key}:`, e);
        // Still mark as available but not compiled
        this.compiledPresets.set(key, {
          ready: false,
          compiledAt: Date.now(),
          shaders: null,
          programs: null,
          original: preset,
          error: e.message,
        });
      }
    }
  }

  /**
   * Compile shaders for a preset
   */
  async compilePresetShaders(gl, preset) {
    const shaders = {};
    const programs = {};

    // Vertex shader (common for all effects)
    const vertexShaderSource = this.getVertexShaderSource();

    // Compile each effect's shaders (now using native GLSL)
    if (preset.warp) {
      const warpFrag = this.buildFragmentShader(preset.warp, 'warp');
      shaders.warp = {
        vertex: this.compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER),
        fragment: this.compileShader(gl, warpFrag, gl.FRAGMENT_SHADER),
      };
      programs.warp = this.createProgram(gl, shaders.warp.vertex, shaders.warp.fragment);
    }

    if (preset.pixel) {
      const pixelFrag = this.buildFragmentShader(preset.pixel, 'pixel');
      shaders.pixel = {
        vertex: this.compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER),
        fragment: this.compileShader(gl, pixelFrag, gl.FRAGMENT_SHADER),
      };
      programs.pixel = this.createProgram(gl, shaders.pixel.vertex, shaders.pixel.fragment);
    }

    if (preset.composite) {
      const compositeFrag = this.buildFragmentShader(preset.composite, 'composite');
      shaders.composite = {
        vertex: this.compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER),
        fragment: this.compileShader(gl, compositeFrag, gl.FRAGMENT_SHADER),
      };
      programs.composite = this.createProgram(
        gl,
        shaders.composite.vertex,
        shaders.composite.fragment
      );
    }

    return { shaders, programs };
  }

  /**
   * Get standard vertex shader source
   */
  getVertexShaderSource() {
    return `
      attribute vec2 aPosition;
      attribute vec2 aTexCoord;
      varying vec2 vTexCoord;

      void main() {
        vTexCoord = aTexCoord;
        gl_Position = vec4(aPosition, 0.0, 1.0);
      }
    `;
  }

  /**
   * Build complete GLSL fragment shader from preset code
   * Now uses native GLSL directly - no transpilation needed
   */
  buildFragmentShader(shaderCode, type) {
    // Base GLSL structure with all uniforms and helpers
    const baseGLSL = `precision mediump float;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uBassLevel;
uniform float uMidLevel;
uniform float uTrebleLevel;
uniform vec2 uResolution;

varying vec2 vTexCoord;
`;

    // console.log(`[EmergencyPresetManager] Building ${type} shader with code:`, shaderCode);

    // Build main function based on shader type
    let finalShader;

    if (type === 'warp') {
      finalShader = baseGLSL + `
vec2 warp() {
${shaderCode}
}

void main() {
  vec2 warped = warp();
  gl_FragColor = texture2D(uTexture, warped);
}`;
    } else if (type === 'pixel') {
      finalShader = baseGLSL + `
vec3 pixel() {
${shaderCode}
}

void main() {
  vec3 color = pixel();
  gl_FragColor = vec4(color, 1.0);
}`;
    } else if (type === 'composite') {
      // Add feedback texture uniform for true temporal effects
      finalShader = baseGLSL + `
uniform sampler2D uFeedback;

vec3 composite(vec3 color, vec3 feedback) {
${shaderCode}
}

void main() {
  vec3 color = texture2D(uTexture, vTexCoord).rgb;
  vec3 feedback = texture2D(uFeedback, vTexCoord).rgb;
  vec3 result = composite(color, feedback);
  gl_FragColor = vec4(result, 1.0);
}`;
    } else {
      throw new Error(`Unknown shader type: ${type}`);
    }

    // console.log(`[EmergencyPresetManager] Final ${type} shader:`, finalShader);
    return finalShader;
  }

  /**
   * Compile a shader
   */
  compileShader(gl, source, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compilation failed: ${error}`);
    }

    return shader;
  }

  /**
   * Create shader program
   */
  createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Program linking failed: ${error}`);
    }

    // Get uniform locations
    const uniforms = {
      uTexture: gl.getUniformLocation(program, 'uTexture'),
      uTime: gl.getUniformLocation(program, 'uTime'),
      uBassLevel: gl.getUniformLocation(program, 'uBassLevel'),
      uMidLevel: gl.getUniformLocation(program, 'uMidLevel'),
      uTrebleLevel: gl.getUniformLocation(program, 'uTrebleLevel'),
      uResolution: gl.getUniformLocation(program, 'uResolution'),
    };

    // Get attribute locations
    const attributes = {
      aPosition: gl.getAttribLocation(program, 'aPosition'),
      aTexCoord: gl.getAttribLocation(program, 'aTexCoord'),
    };

    return { program, uniforms, attributes };
  }

  /**
   * Check if a preset is an emergency preset
   */
  isEmergencyPreset(presetId) {
    return presetId && presetId.startsWith('emergency_');
  }

  /**
   * Get usage statistics
   */
  getUsageStats() {
    return {
      usage: this.usage,
      mostUsed: Object.entries(this.usage)
        .filter(([k]) => k !== 'lastUsed' && k !== 'lastSwitchTime')
        .sort((a, b) => b[1] - a[1])[0],
      totalUses: this.usage.minimal + this.usage.basic_reactive + this.usage.crowd_pleaser,
    };
  }

  /**
   * Reset usage statistics
   */
  resetStats() {
    this.usage = {
      minimal: 0,
      basic_reactive: 0,
      crowd_pleaser: 0,
      lastUsed: null,
      lastSwitchTime: 0,
    };
    console.log('[EmergencyPresetManager] Usage stats reset');
  }

  /**
   * Get all emergency preset IDs
   */
  getAllPresetIds() {
    return Object.keys(this.emergencyPresets).map((k) => `emergency_${k}`);
  }

  /**
   * Validate emergency presets are working
   */
  async validateAll() {
    const results = {};

    for (const [key, preset] of Object.entries(this.emergencyPresets)) {
      try {
        // Basic validation - check required fields
        const valid = preset.id && preset.warp && preset.pixel && preset.settings;
        results[key] = {
          valid,
          error: valid ? null : 'Missing required fields',
        };
      } catch (e) {
        results[key] = {
          valid: false,
          error: e.message,
        };
      }
    }

    return results;
  }
}

// Export singleton
export const emergencyManager = new EmergencyPresetManager();
