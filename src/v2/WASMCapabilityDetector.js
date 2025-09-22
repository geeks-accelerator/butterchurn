/**
 * WASMCapabilityDetector - Core detection system for WebAssembly capabilities
 *
 * This is the foundation of our device-adaptive strategy. It detects:
 * - WASM1 vs WASM2 support
 * - Device tier (high-end, mid-range, low-end, mobile)
 * - GPU capabilities (discrete, integrated, mobile)
 * - Memory and CPU core availability
 *
 * No backward compatibility needed - this is a complete rewrite.
 */

export class WASMCapabilityDetector {
  constructor() {
    // Cache detection results for performance
    this.cachedCapabilities = null;
    this.cacheTimestamp = 0;
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Main detection entry point - returns full capability profile
   */
  async detectCapabilities() {
    // Use cached result if available and fresh
    if (this.cachedCapabilities && Date.now() - this.cacheTimestamp < this.CACHE_DURATION) {
      return this.cachedCapabilities;
    }

    const capabilities = {
      // Basic WebAssembly support
      basic: typeof WebAssembly !== 'undefined',

      // WASM2 feature detection (SIMD requires async test)
      simd: await this.detectSIMD(),
      threads: this.detectThreads(),
      bulkMemory: this.detectBulkMemory(),
      referenceTypes: this.detectReferenceTypes(),

      // Device capabilities
      memory: navigator.deviceMemory || 4,
      cores: navigator.hardwareConcurrency || 2,
      gpu: this.detectGPUTier(),
      isMobile: this.detectMobileDevice(),

      // Browser capabilities
      webgl2: this.detectWebGL2(),
      audioWorklet: this.detectAudioWorklet(),
      offscreenCanvas: this.detectOffscreenCanvas(),
    };

    // Add device tier classification
    capabilities.tier = this.classifyDeviceTier(capabilities);

    // Determine WASM version and strategy
    const result = {
      version: this.determineWASMVersion(capabilities),
      features: capabilities,
      strategy: this.selectOptimalStrategy(capabilities),
    };

    // Cache the result
    this.cachedCapabilities = result;
    this.cacheTimestamp = Date.now();

    return result;
  }

  /**
   * Detect SIMD support with actual compilation test
   */
  async detectSIMD() {
    try {
      // Minimal SIMD test without memory operations
      // Simply checks if the engine can parse SIMD opcodes
      const wasmCode = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f,
        0x03, 0x02, 0x01, 0x00, 0x07, 0x08, 0x01, 0x04, 0x74, 0x65, 0x73, 0x74, 0x00, 0x00, 0x0a,
        0x19, 0x01, 0x16, 0x00, 0xfd, 0x0c, 0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x03,
        0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xfd, 0x15, 0x00, 0x0b,
      ]);

      // Try to compile (don't need to instantiate for detection)
      await WebAssembly.compile(wasmCode);

      // If compilation succeeds, SIMD is supported
      console.log('[WASMCapabilityDetector] SIMD support confirmed');
      return true;
    } catch (e) {
      // SIMD not supported or failed
      console.log('[WASMCapabilityDetector] SIMD test failed:', e.message);
      return false;
    }
  }

  /**
   * Detect SharedArrayBuffer support (needed for threads)
   *
   * IMPORTANT: Even if this returns true, threads will only work if the server sends:
   * - Cross-Origin-Opener-Policy: same-origin
   * - Cross-Origin-Embedder-Policy: require-corp
   * Without these headers, SharedArrayBuffer will not be available at runtime.
   */
  detectThreads() {
    // Check for SharedArrayBuffer (required for WASM threads)
    // Also check for cross-origin isolation (required for SAB)
    const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
    const isCrossOriginIsolated = self.crossOriginIsolated === true;

    if (hasSharedArrayBuffer && !isCrossOriginIsolated) {
      console.warn(
        '[WASMCapabilityDetector] SharedArrayBuffer exists but cross-origin isolation missing. Server headers required.'
      );
    }

    return hasSharedArrayBuffer && isCrossOriginIsolated;
  }

  /**
   * Detect bulk memory operations support
   */
  detectBulkMemory() {
    try {
      // Test bulk memory with memory.copy instruction
      return WebAssembly.validate(
        new Uint8Array([
          0x00,
          0x61,
          0x73,
          0x6d,
          0x01,
          0x00,
          0x00,
          0x00,
          0x01,
          0x04,
          0x01,
          0x60,
          0x00,
          0x00,
          0x03,
          0x02,
          0x01,
          0x00,
          0x05,
          0x03,
          0x01,
          0x00,
          0x00,
          0x0a,
          0x0b,
          0x01,
          0x09,
          0x00,
          0x41,
          0x00,
          0x41,
          0x00,
          0x41,
          0x00,
          0xfc,
          0x0a, // memory.copy
          0x00,
          0x00,
          0x0b,
        ])
      );
    } catch {
      return false;
    }
  }

  /**
   * Detect reference types support
   */
  detectReferenceTypes() {
    try {
      // Test for externref support
      return WebAssembly.validate(
        new Uint8Array([
          0x00,
          0x61,
          0x73,
          0x6d,
          0x01,
          0x00,
          0x00,
          0x00,
          0x01,
          0x05,
          0x01,
          0x60,
          0x00,
          0x01,
          0x6f, // externref return type
        ])
      );
    } catch {
      return false;
    }
  }

  /**
   * Detect GPU tier using WebGL debugging info
   */
  detectGPUTier() {
    // Check session storage cache first
    const cached = sessionStorage.getItem('butterchurn_gpu_tier');
    if (cached) {
      const data = JSON.parse(cached);
      const now = Date.now();
      // Cache valid for 24 hours
      if (now - data.timestamp < 24 * 60 * 60 * 1000) {
        return data.tier;
      }
    }

    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl');

      if (!gl) return 'unknown';

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return 'unknown';

      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);

      // Classify GPU tier based on renderer string
      const tier = this.classifyGPU(renderer, vendor);

      // Cache the result
      sessionStorage.setItem(
        'butterchurn_gpu_tier',
        JSON.stringify({
          tier,
          timestamp: Date.now(),
          renderer,
          vendor,
        })
      );

      return tier;
    } catch {
      return 'unknown';
    }
  }

  /**
   * Classify GPU based on renderer string
   */
  classifyGPU(renderer, vendor) {
    const lowerRenderer = renderer.toLowerCase();
    const lowerVendor = vendor.toLowerCase();

    // Discrete GPUs (high-performance)
    if (
      lowerRenderer.includes('nvidia') ||
      lowerRenderer.includes('geforce') ||
      lowerRenderer.includes('rtx') ||
      lowerRenderer.includes('gtx')
    ) {
      return 'discrete';
    }

    if (
      lowerRenderer.includes('radeon') ||
      lowerRenderer.includes('rx 5') ||
      lowerRenderer.includes('rx 6') ||
      lowerRenderer.includes('rx 7')
    ) {
      return 'discrete';
    }

    // Apple Silicon (treat as discrete for M1/M2/M3)
    if (
      lowerVendor.includes('apple') &&
      (lowerRenderer.includes('m1') || lowerRenderer.includes('m2') || lowerRenderer.includes('m3'))
    ) {
      return 'discrete';
    }

    // Integrated GPUs
    if (
      lowerRenderer.includes('intel') ||
      lowerRenderer.includes('iris') ||
      lowerRenderer.includes('uhd')
    ) {
      return 'integrated';
    }

    // Mobile GPUs
    if (
      lowerRenderer.includes('adreno') ||
      lowerRenderer.includes('mali') ||
      lowerRenderer.includes('powervr') ||
      lowerRenderer.includes('apple a')
    ) {
      return 'mobile';
    }

    // Default to integrated if unknown
    return 'integrated';
  }

  /**
   * Detect if running on mobile device
   */
  detectMobileDevice() {
    // Check multiple indicators for mobile
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent
    );

    // Check for touch support
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Check screen size (mobile typically < 768px)
    const isSmallScreen = window.innerWidth < 768;

    // Check for mobile-specific APIs
    const hasMobileAPI = 'orientation' in window || 'ondeviceorientation' in window;

    // Mobile if UA says so, or multiple mobile indicators
    return isMobileUA || (hasTouch && (isSmallScreen || hasMobileAPI));
  }

  /**
   * Detect WebGL2 support
   */
  detectWebGL2() {
    try {
      const canvas = document.createElement('canvas');
      return !!canvas.getContext('webgl2');
    } catch {
      return false;
    }
  }

  /**
   * Detect AudioWorklet support (better than ScriptProcessor)
   */
  detectAudioWorklet() {
    return typeof AudioWorkletNode !== 'undefined';
  }

  /**
   * Detect OffscreenCanvas support (better performance)
   */
  detectOffscreenCanvas() {
    return typeof OffscreenCanvas !== 'undefined';
  }

  /**
   * Classify device into performance tiers
   */
  classifyDeviceTier(capabilities) {
    const { memory, cores, gpu, isMobile } = capabilities;

    // Mobile devices get their own tier
    if (isMobile) {
      return 'mobile';
    }

    // High-end: 8+ GB RAM, 4+ cores, discrete GPU
    if (memory >= 8 && cores >= 4 && gpu === 'discrete') {
      return 'high_end';
    }

    // Low-end: < 4GB RAM or < 2 cores
    if (memory < 4 || cores < 2) {
      return 'low_end';
    }

    // Everything else is mid-range
    return 'mid_range';
  }

  /**
   * Determine which WASM version to use
   */
  determineWASMVersion(capabilities) {
    // No WASM support at all
    if (!capabilities.basic) {
      return {
        version: 0,
        reason: 'no_wasm_support',
        fallback: 'javascript',
      };
    }

    // Low memory devices should use WASM1
    if (capabilities.memory < 2) {
      return {
        version: 1,
        reason: 'memory_constraint',
        features: ['basic'],
      };
    }

    // Full WASM2 if all features supported
    if (capabilities.simd && capabilities.threads) {
      return {
        version: 2,
        reason: 'full_wasm2',
        features: ['simd', 'threads', 'bulk_memory'],
      };
    }

    // Partial WASM2 (SIMD only)
    if (capabilities.simd) {
      return {
        version: 1.5,
        reason: 'simd_only',
        features: ['simd'],
      };
    }

    // Basic WASM1
    return {
      version: 1,
      reason: 'basic_wasm',
      features: ['basic'],
    };
  }

  /**
   * Select optimal rendering strategy based on capabilities
   */
  selectOptimalStrategy(capabilities) {
    const tier = capabilities.tier;
    const wasmVersion = this.determineWASMVersion(capabilities).version;

    // Strategy matrix based on device tier and WASM support
    const strategies = {
      high_end: {
        wasmVersion: wasmVersion >= 2 ? 'wasm2' : 'wasm1',
        engine: 'dual', // Both Three.js and Butterchurn
        resolution: 1920,
        fftSize: 4096,
        targetFPS: 60,
        candidates: 50,
        features: ['threejs', 'hybrid_rendering', 'advanced_shaders'],
      },
      mid_range: {
        wasmVersion: wasmVersion >= 1 ? 'wasm1' : 'javascript',
        engine: 'butterchurn',
        resolution: 1280,
        fftSize: 2048,
        targetFPS: 60,
        candidates: 30,
        features: ['standard_shaders'],
      },
      low_end: {
        wasmVersion: wasmVersion >= 1 ? 'wasm1' : 'javascript',
        engine: 'butterchurn',
        resolution: 854,
        fftSize: 1024,
        targetFPS: 30,
        candidates: 15,
        features: ['basic_shaders'],
      },
      mobile: {
        wasmVersion: wasmVersion >= 1 ? 'wasm1' : 'javascript', // Use WASM if available on mobile
        engine: 'butterchurn',
        resolution: 640,
        fftSize: 512,
        targetFPS: 30,
        candidates: 10,
        features: ['mobile_optimized'],
      },
    };

    return strategies[tier] || strategies.low_end;
  }

  /**
   * Get a detailed report of capabilities (for debugging)
   */
  getDetailedReport() {
    const caps = this.detectCapabilities();

    return {
      summary: `Device Tier: ${caps.features.tier}, WASM Version: ${caps.version.version}`,
      wasm: {
        version: caps.version,
        simd: caps.features.simd,
        threads: caps.features.threads,
        bulkMemory: caps.features.bulkMemory,
        referenceTypes: caps.features.referenceTypes,
      },
      device: {
        tier: caps.features.tier,
        memory: `${caps.features.memory} GB`,
        cores: caps.features.cores,
        gpu: caps.features.gpu,
        isMobile: caps.features.isMobile,
      },
      browser: {
        webgl2: caps.features.webgl2,
        audioWorklet: caps.features.audioWorklet,
        offscreenCanvas: caps.features.offscreenCanvas,
      },
      strategy: caps.strategy,
    };
  }
}

// Export a singleton instance for easy use
export const wasmDetector = new WASMCapabilityDetector();
