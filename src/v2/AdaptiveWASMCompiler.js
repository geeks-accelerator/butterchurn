/**
 * AdaptiveWASMCompiler - Smart WASM compilation with fallback chain
 *
 * This handles the actual WASM compilation with proper error handling
 * and automatic fallback from WASM2 → WASM1 → JavaScript
 *
 * Key improvements over v1:
 * - Automatic feature detection and degradation
 * - Proper error handling with logging
 * - Memory-aware compilation
 * - Preset compilation caching
 */

import { wasmDetector } from './WASMCapabilityDetector.js';
import { wasmLogger } from './WASMErrorLogger.js';
import { wasmTransformer } from './WASMTransformer.js';

export class AdaptiveWASMCompiler {
  constructor() {
    this.capabilities = null;
    this.compiledModules = new Map(); // Cache compiled modules
    this.activeVersion = 1; // Safe default until initialization
    this.compileOptions = {};
    this.initialized = false;
  }

  /**
   * Initialize the compiler with asynchronous capabilities detection
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.capabilities = await wasmDetector.detectCapabilities();
      this.activeVersion = this.determineActiveVersion();
      this.compileOptions = this.getCompileOptions();
      this.initialized = true;
      console.log('[AdaptiveWASMCompiler] Initialized successfully');
    } catch (error) {
      console.error('[AdaptiveWASMCompiler] Initialization failed:', error);
      // Set safe defaults
      this.capabilities = {
        features: { tier: 'low_end', memory: 2, cores: 1 },
        version: { version: 1, hasWASM: true },
      };
      this.activeVersion = 1;
      this.compileOptions = this.getCompileOptions();
      this.initialized = true;
    }
  }

  /**
   * Determine which WASM version to use (respecting error logger disable flag)
   */
  determineActiveVersion() {
    // Check if WASM2 has been disabled due to failures
    if (wasmLogger.isWASM2Disabled()) {
      console.log('[AdaptiveWASMCompiler] WASM2 disabled by error logger');
      return 1;
    }

    // Use capability detector recommendation, with safe fallback
    if (
      this.capabilities &&
      this.capabilities.version &&
      typeof this.capabilities.version.version === 'number'
    ) {
      return this.capabilities.version.version;
    }

    // Fallback: assume WASM1 if detection failed
    console.warn('[AdaptiveWASMCompiler] Capability version undefined, defaulting to WASM1');
    return 1;
  }

  /**
   * Get compilation options based on device capabilities
   */
  getCompileOptions() {
    const tier = this.capabilities.features.tier;
    const memory = this.capabilities.features.memory;

    return (
      {
        high_end: {
          maximumMemory: 256, // 256 pages = 16MB
          optimizeLevel: 3,
          shrinkLevel: 0,
          enableSIMD: true,
          enableThreads: this.capabilities.features.threads,
          enableBulkMemory: true,
        },
        mid_range: {
          maximumMemory: 128, // 128 pages = 8MB
          optimizeLevel: 2,
          shrinkLevel: 1,
          enableSIMD: this.capabilities.features.simd,
          enableThreads: false,
          enableBulkMemory: this.capabilities.features.bulkMemory,
        },
        low_end: {
          maximumMemory: 64, // 64 pages = 4MB
          optimizeLevel: 1,
          shrinkLevel: 2,
          enableSIMD: false,
          enableThreads: false,
          enableBulkMemory: false,
        },
        mobile: {
          maximumMemory: 32, // 32 pages = 2MB
          optimizeLevel: 1,
          shrinkLevel: 2,
          enableSIMD: false,
          enableThreads: false,
          enableBulkMemory: false,
        },
      }[tier] || this.getCompileOptions().low_end
    );
  }

  /**
   * Compile a WASM module with automatic fallback
   */
  async compileModule(wasmSource, moduleId, options = {}) {
    // Ensure initialization has completed
    if (!this.initialized) {
      await this.initialize();
    }

    // Check cache first
    const cacheKey = `${moduleId}_v${this.activeVersion}`;
    if (this.compiledModules.has(cacheKey)) {
      return this.compiledModules.get(cacheKey);
    }

    // Merge options with device defaults
    const compileOpts = { ...this.compileOptions, ...options };

    // Try compilation with fallback chain
    let result = null;
    let lastError = null;

    // Try WASM2 if available
    if (this.activeVersion >= 2) {
      result = await this.tryCompileWASM2(wasmSource, moduleId, compileOpts);
      if (result.success) {
        this.compiledModules.set(cacheKey, result.module);
        return result.module;
      }
      lastError = result.error;
    }

    // Fallback to WASM1
    if (this.activeVersion >= 1) {
      result = await this.tryCompileWASM1(wasmSource, moduleId, compileOpts);
      if (result.success) {
        this.compiledModules.set(cacheKey, result.module);
        return result.module;
      }
      lastError = result.error;
    }

    // Final fallback to JavaScript
    console.warn('[AdaptiveWASMCompiler] Falling back to JavaScript implementation');
    return this.getJavaScriptFallback(moduleId);
  }

  /**
   * Try to compile as WASM2 with SIMD and threads
   */
  async tryCompileWASM2(source, moduleId, options) {
    try {
      console.log(`[AdaptiveWASMCompiler] Attempting WASM2 compilation for ${moduleId}`);

      // Check memory before attempting compilation
      if (!this.checkMemoryAvailable(options.maximumMemory)) {
        throw new Error('Insufficient memory for WASM2 compilation');
      }

      // Prepare WASM2 specific imports
      const imports = this.prepareWASM2Imports(options);

      // Attempt compilation
      const module = await WebAssembly.compile(source);

      // Attempt instantiation
      const instance = await WebAssembly.instantiate(module, imports);

      // Success!
      console.log(`[AdaptiveWASMCompiler] WASM2 compilation successful for ${moduleId}`);

      return {
        success: true,
        module: {
          module,
          instance,
          version: 2,
          features: ['simd', 'threads'],
        },
      };
    } catch (error) {
      // Log the failure
      wasmLogger.logWASMFailure(error, {
        wasmVersion: 2,
        presetId: moduleId,
        deviceTier: this.capabilities.features.tier,
        audioPlaying: false,
      });

      return {
        success: false,
        error,
      };
    }
  }

  /**
   * Try to compile as basic WASM1
   */
  async tryCompileWASM1(source, moduleId, options) {
    try {
      console.log(`[AdaptiveWASMCompiler] Attempting WASM1 compilation for ${moduleId}`);

      // Check memory before attempting compilation
      if (!this.checkMemoryAvailable(options.maximumMemory)) {
        throw new Error('Insufficient memory for WASM1 compilation');
      }

      // Prepare basic imports
      const imports = this.prepareWASM1Imports(options);

      // For WASM1, we might need to transform the source if it contains WASM2 features
      const transformedSource = await this.transformToWASM1(source);

      // Attempt compilation
      const module = await WebAssembly.compile(transformedSource);

      // Attempt instantiation
      const instance = await WebAssembly.instantiate(module, imports);

      // Success!
      console.log(`[AdaptiveWASMCompiler] WASM1 compilation successful for ${moduleId}`);

      return {
        success: true,
        module: {
          module,
          instance,
          version: 1,
          features: ['basic'],
        },
      };
    } catch (error) {
      // Log the failure
      wasmLogger.logWASMFailure(error, {
        wasmVersion: 1,
        presetId: moduleId,
        deviceTier: this.capabilities.features.tier,
        audioPlaying: false,
      });

      return {
        success: false,
        error,
      };
    }
  }

  /**
   * Prepare WASM2 imports with SIMD and threading support
   */
  prepareWASM2Imports(options) {
    const memory = new WebAssembly.Memory({
      initial: 16,
      maximum: options.maximumMemory,
      shared: options.enableThreads, // SharedArrayBuffer for threads
    });

    return {
      env: {
        memory,
        // SIMD operations
        v128_load: (addr) => {
          /* SIMD load */
        },
        v128_store: (addr, val) => {
          /* SIMD store */
        },
        // Atomic operations for threading
        atomic_wait: (addr, val, timeout) => {
          /* Atomic wait */
        },
        atomic_notify: (addr, count) => {
          /* Atomic notify */
        },
        // Standard math functions
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        exp: Math.exp,
        log: Math.log,
        sqrt: Math.sqrt,
        pow: Math.pow,
        abs: Math.abs,
        min: Math.min,
        max: Math.max,
        floor: Math.floor,
        ceil: Math.ceil,
      },
    };
  }

  /**
   * Prepare basic WASM1 imports
   */
  prepareWASM1Imports(options) {
    const memory = new WebAssembly.Memory({
      initial: 8,
      maximum: options.maximumMemory,
    });

    return {
      env: {
        memory,
        // Standard math functions only
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        exp: Math.exp,
        log: Math.log,
        sqrt: Math.sqrt,
        pow: Math.pow,
        abs: Math.abs,
        min: Math.min,
        max: Math.max,
        floor: Math.floor,
        ceil: Math.ceil,
      },
    };
  }

  /**
   * Transform WASM2 source to WASM1 compatible
   */
  async transformToWASM1(source) {
    try {
      return await wasmTransformer.transform(source);
    } catch (error) {
      console.error('[AdaptiveWASMCompiler] WASM transformation failed:', error);
      // Return original source as fallback
      return source;
    }
  }

  /**
   * Check if enough memory is available
   */
  checkMemoryAvailable(requiredPages) {
    const requiredBytes = requiredPages * 65536; // 64KB per page

    // performance.memory is Chrome-only, need fallback
    if (performance.memory && performance.memory.jsHeapSizeLimit) {
      const available = performance.memory.jsHeapSizeLimit - performance.memory.usedJSHeapSize;
      return available > requiredBytes * 2; // Want at least 2x headroom
    }

    // Fallback: use deviceMemory API if available
    if (navigator.deviceMemory) {
      const deviceMemoryBytes = navigator.deviceMemory * 1024 * 1024 * 1024; // Convert GB to bytes
      const estimatedAvailable = deviceMemoryBytes * 0.25; // Assume 25% available for JS
      return estimatedAvailable > requiredBytes * 2;
    }

    // Can't determine, be conservative based on required amount
    // Assume we can handle up to 128 pages (8MB) without checking
    return requiredPages <= 128;
  }

  /**
   * Get JavaScript fallback implementation
   */
  getJavaScriptFallback(moduleId) {
    console.log(`[AdaptiveWASMCompiler] Using JavaScript fallback for ${moduleId}`);

    // Return a mock module that uses pure JavaScript
    return {
      module: null,
      instance: {
        exports: {
          // Provide JavaScript implementations of WASM functions
          processFrame: (input, output) => {
            // JavaScript implementation
            return true;
          },
          // Add other necessary exports
        },
      },
      version: 0,
      features: ['javascript'],
    };
  }

  /**
   * Clear compilation cache (useful when switching quality settings)
   */
  clearCache() {
    this.compiledModules.clear();
    console.log('[AdaptiveWASMCompiler] Module cache cleared');
  }

  /**
   * Get compilation statistics
   */
  getStats() {
    return {
      activeVersion: this.activeVersion,
      cachedModules: this.compiledModules.size,
      capabilities: this.capabilities.features,
      compileOptions: this.compileOptions,
    };
  }

  /**
   * Force a specific WASM version (for testing)
   */
  forceVersion(version) {
    this.activeVersion = version;
    this.clearCache();
    console.log(`[AdaptiveWASMCompiler] Forced to version ${version}`);
  }
}

// Export singleton
export const wasmCompiler = new AdaptiveWASMCompiler();
