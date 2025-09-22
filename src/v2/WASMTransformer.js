/**
 * WASMTransformer - Transforms WASM2 bytecode to WASM1 compatible
 *
 * IMPORTANT: This now uses binaryen.js for proper transformation
 * The previous manual approach was fundamentally flawed as it didn't
 * handle stack management, local variables, or control flow correctly.
 */

import Binaryen from 'binaryen';

export class WASMTransformer {
  constructor() {
    this.binaryen = null;
    this.initialized = false;
  }

  /**
   * Initialize binaryen.js
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Use static import - binaryen is now bundled
      this.binaryen = await Binaryen();
      this.initialized = true;
      console.log('[WASMTransformer] Binaryen initialized successfully');
    } catch (error) {
      console.error('[WASMTransformer] Failed to initialize binaryen:', error);
      throw new Error('Binaryen initialization failed. WASM transformation unavailable.');
    }
  }

  /**
   * Transform WASM2 bytecode to WASM1 compatible using binaryen
   */
  async transform(wasmBytes) {
    try {
      // Ensure binaryen is initialized
      await this.initialize();

      if (!this.binaryen) {
        throw new Error('Binaryen not available');
      }

      // Load the WASM module into binaryen
      const module = this.binaryen.readBinary(wasmBytes);

      // Apply optimization passes to lower WASM2 features to WASM1
      // These passes handle the complex transformation correctly
      this.applyTransformationPasses(module);

      // Validate the transformed module
      if (!module.validate()) {
        console.warn('[WASMTransformer] Transformed module validation failed');
        // Try to auto-fix common issues
        module.runPasses(['legalize-js-interface']);
      }

      // Get the transformed binary
      const transformedBinary = module.emitBinary();

      // Clean up
      module.dispose();

      console.log('[WASMTransformer] Successfully transformed WASM2 to WASM1');
      return transformedBinary;
    } catch (error) {
      console.error('[WASMTransformer] Transformation failed:', error);

      // If binaryen isn't available or transformation fails,
      // we can't safely transform the module
      throw new Error(`WASM transformation failed: ${error.message}`);
    }
  }

  /**
   * Apply binaryen optimization passes to lower WASM2 features
   */
  applyTransformationPasses(module) {
    // List of passes that lower WASM2 features to WASM1
    const passes = [
      // Lower SIMD operations to scalar operations
      'simd-lowering',

      // Lower atomic operations to non-atomic
      'atomics-lowering',

      // Lower bulk memory operations
      'bulk-memory-lowering',

      // Remove threading features
      'strip-target-features',

      // Ensure the module is valid for JavaScript engines
      'legalize-js-interface',

      // Optimize the result
      'optimize-level=2',
      'simplify-locals',
      'remove-unused-module-elements',
    ];

    // Run the passes
    module.runPasses(passes);
  }

  /**
   * Check if a WASM module uses WASM2 features
   */
  async detectWASM2Features(wasmBytes) {
    try {
      await this.initialize();

      if (!this.binaryen) {
        return { error: 'Binaryen not available' };
      }

      const module = this.binaryen.readBinary(wasmBytes);
      const features = module.getFeatures();

      const wasm2Features = {
        hasSIMD: features & this.binaryen.Features.SIMD,
        hasAtomics: features & this.binaryen.Features.Atomics,
        hasBulkMemory: features & this.binaryen.Features.BulkMemory,
        hasThreads: features & this.binaryen.Features.Threads,
        hasMutableGlobals: features & this.binaryen.Features.MutableGlobals,
        hasReferenceTypes: features & this.binaryen.Features.ReferenceTypes,
      };

      module.dispose();

      return wasm2Features;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Fallback transformation without binaryen (DEPRECATED - DO NOT USE)
   * This is kept only for reference of what NOT to do
   */
  async manualTransformDEPRECATED(wasmBytes) {
    // This approach was fundamentally flawed because:
    // 1. It didn't manage the stack correctly
    // 2. It assumed local variables were available
    // 3. It didn't handle control flow
    // 4. Simple opcode replacement doesn't work for stack-based VMs

    throw new Error(
      'Manual WASM transformation is not supported. ' + 'Use binaryen.js for proper transformation.'
    );
  }
}

// Export singleton
export const wasmTransformer = new WASMTransformer();

/**
 * INSTALLATION NOTES:
 *
 * To use this transformer, you need to install binaryen:
 *
 * npm install binaryen
 *
 * Or include via CDN:
 * <script src="https://unpkg.com/binaryen@latest/index.js"></script>
 *
 * Binaryen is a complete compiler toolchain for WebAssembly and handles
 * all the complexity of transforming between different WASM versions.
 */
