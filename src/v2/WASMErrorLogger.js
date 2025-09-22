/**
 * WASMErrorLogger - Comprehensive error logging for WebAssembly failures
 *
 * Key improvements over v1:
 * - Explicit error handling (no silent failures)
 * - 3-strike rule for WASM2 before disabling
 * - Clear distinction between expected constraints and unexpected failures
 * - All logs in simple JSON format to localStorage
 * - Stack trace capture for debugging
 */

export class WASMErrorLogger {
  constructor() {
    this.logFile = this.loadExistingLog() || this.createNewLog();

    // User notification management
    this.notificationShown = false;
    this.notificationQueue = [];
  }

  /**
   * Create a new log structure
   */
  createNewLog() {
    return {
      session_id: Date.now(),
      wasm_failures: [],
      failure_count: 0,
      wasm2_disabled: false,
      max_failures: 3, // 3-strike rule
      browser_info: this.getBrowserInfo(),
      start_time: new Date().toISOString(),
    };
  }

  /**
   * Load existing log from localStorage
   */
  loadExistingLog() {
    try {
      const existing = localStorage.getItem('wasm-errors.json');
      if (!existing) return null;

      const parsed = JSON.parse(existing);

      // Reset failure count for new session but keep history
      parsed.failure_count = 0;
      parsed.session_id = Date.now();

      return parsed;
    } catch (e) {
      console.warn('[WASMErrorLogger] Failed to load existing log:', e);
      return null;
    }
  }

  /**
   * Log a WASM failure with full context
   */
  logWASMFailure(error, context) {
    const entry = {
      timestamp: Date.now(),
      iso_time: new Date().toISOString(),
      error_type: this.classifyError(error, context),
      wasm_version: context.wasmVersion || 1,
      message: error.message,
      stack: error.stack,
      preset: context.presetId,
      device_memory: navigator.deviceMemory || 'unknown',
      device_tier: context.deviceTier,
      heap_usage: this.getMemoryUsage(),
      audio_playing: context.audioPlaying || false,
    };

    // Add to log
    this.logFile.wasm_failures.push(entry);

    // Handle based on error type
    this.handleErrorByType(entry, error, context);

    // Save to localStorage
    this.saveLog();
  }

  /**
   * Classify the error type for proper handling
   */
  classifyError(error, context) {
    // Use error.name for more specific classification
    const errorName = error.name || '';
    const message = error.message || '';
    const lowerMessage = message.toLowerCase();

    // Check error.name first for specific error types
    if (errorName === 'RangeError' && /memory|heap/i.test(message)) {
      return 'MEMORY_CONSTRAINT';
    }

    if (errorName === 'TypeError' && /SharedArrayBuffer/i.test(message)) {
      return 'BROWSER_CONSTRAINT';
    }

    // Memory-related errors (expected constraints)
    if (/out of memory|oom|heap.*limit|allocation.*fail/i.test(message)) {
      return 'MEMORY_CONSTRAINT';
    }

    // Browser constraints
    if (/cross.origin|coop|coep|sharedarraybuffer.*not.*defined/i.test(message)) {
      return 'BROWSER_CONSTRAINT';
    }

    // WASM2 specific failures
    if (context.wasmVersion === 2) {
      if (/simd|v128|vector/i.test(message)) {
        return 'WASM2_SIMD_FAILURE';
      }
      if (/thread|atomic|shared.*memory|wait|notify/i.test(message)) {
        return 'WASM2_THREAD_FAILURE';
      }
      if (/bulk.*memory|memory\.(copy|fill)/i.test(message)) {
        return 'WASM2_BULK_MEMORY_FAILURE';
      }
      return 'WASM2_GENERAL_FAILURE';
    }

    // Compilation failures
    if (errorName === 'CompileError' || /compile.*error|invalid.*module/i.test(message)) {
      return 'WASM_COMPILATION_FAILURE';
    }

    // Instantiation failures
    if (errorName === 'LinkError' || /link.*error|import.*not.*found/i.test(message)) {
      return 'WASM_LINK_FAILURE';
    }

    // Runtime failures
    if (errorName === 'RuntimeError' || /unreachable|trap|assert/i.test(message)) {
      return 'WASM_RUNTIME_FAILURE';
    }

    return 'UNEXPECTED_FAILURE';
  }

  /**
   * Handle errors based on their type
   */
  handleErrorByType(entry, error, context) {
    const isExpectedConstraint = ['MEMORY_CONSTRAINT', 'BROWSER_CONSTRAINT'].includes(
      entry.error_type
    );

    const isWASM2Failure = entry.error_type.startsWith('WASM2_');
    const isUnexpected = entry.error_type === 'UNEXPECTED_FAILURE';

    // Expected constraints - silent fallback
    if (isExpectedConstraint) {
      console.log(
        `[WASMErrorLogger] Expected constraint: ${entry.error_type}, falling back gracefully`
      );
      return;
    }

    // WASM2 failures - track for 3-strike rule
    if (isWASM2Failure) {
      this.logFile.failure_count++;

      if (this.logFile.failure_count >= this.logFile.max_failures) {
        this.logFile.wasm2_disabled = true;
        console.error('[WASMErrorLogger] WASM2 disabled after repeated failures');
        this.notifyUser(
          'WASM2 features disabled due to compatibility issues. Using WASM1 fallback.'
        );
      } else {
        console.warn(
          `[WASMErrorLogger] WASM2 failure ${this.logFile.failure_count}/${this.logFile.max_failures}`
        );
      }
    }

    // Unexpected failures - loud notification
    if (isUnexpected) {
      console.error('[WASMErrorLogger] Unexpected failure:', error);
      this.notifyUser(`Visualization engine encountered an unexpected error: ${entry.message}`);

      // Also log to console with full context for debugging
      console.group('🔴 Unexpected WASM Failure');
      console.error('Error:', error);
      console.table({
        'Error Type': entry.error_type,
        'WASM Version': entry.wasm_version,
        'Device Tier': entry.device_tier,
        Memory: entry.device_memory,
        Preset: entry.preset,
      });
      console.groupEnd();
    }
  }

  /**
   * Notify user about critical errors
   */
  notifyUser(message) {
    // Prevent notification spam
    if (this.notificationShown) {
      this.notificationQueue.push(message);
      return;
    }

    this.notificationShown = true;

    // Try to use a notification system if available
    if (typeof window !== 'undefined' && window.butterchurnNotify) {
      window.butterchurnNotify(message);
    } else {
      // Fallback to console with prominent formatting
      console.warn(
        `%c⚠️ ${message}`,
        'background: #ff6b6b; color: white; padding: 10px; font-size: 14px; border-radius: 5px;'
      );
    }

    // Reset notification flag after delay
    setTimeout(() => {
      this.notificationShown = false;
      if (this.notificationQueue.length > 0) {
        this.notifyUser(this.notificationQueue.shift());
      }
    }, 5000);
  }

  /**
   * Get current memory usage
   */
  getMemoryUsage() {
    if (performance.memory) {
      return {
        used: Math.round(performance.memory.usedJSHeapSize / 1048576), // MB
        total: Math.round(performance.memory.totalJSHeapSize / 1048576), // MB
        limit: Math.round(performance.memory.jsHeapSizeLimit / 1048576), // MB
      };
    }
    return null;
  }

  /**
   * Get browser information for debugging
   */
  getBrowserInfo() {
    return {
      user_agent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      cookies_enabled: navigator.cookieEnabled,
      online: navigator.onLine,
      cores: navigator.hardwareConcurrency,
      memory: navigator.deviceMemory,
    };
  }

  /**
   * Save log to localStorage with robust overflow protection
   */
  saveLog() {
    try {
      // First, check the size of the data
      let logData = JSON.stringify(this.logFile);
      const MAX_SIZE = 2 * 1024 * 1024; // 2MB limit (safe for 5MB localStorage quota)

      // If too large, progressively trim
      while (logData.length > MAX_SIZE && this.logFile.wasm_failures.length > 10) {
        // Remove oldest 25% of entries
        const removeCount = Math.max(1, Math.floor(this.logFile.wasm_failures.length * 0.25));
        this.logFile.wasm_failures = this.logFile.wasm_failures.slice(removeCount);
        logData = JSON.stringify(this.logFile);
      }

      // If still too large after trimming, truncate stack traces
      if (logData.length > MAX_SIZE) {
        this.logFile.wasm_failures = this.logFile.wasm_failures.map((failure) => ({
          ...failure,
          stack: failure.stack ? failure.stack.substring(0, 200) + '...' : undefined,
        }));
        logData = JSON.stringify(this.logFile);
      }

      // Attempt to save
      localStorage.setItem('wasm-errors.json', logData);
    } catch (e) {
      // If quota exceeded, clear old data and retry
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.warn('[WASMErrorLogger] localStorage quota exceeded, clearing old logs');

        // Clear old session logs first
        const keys = Object.keys(localStorage);
        keys
          .filter((k) => k.startsWith('preset-failures-'))
          .forEach((k) => {
            localStorage.removeItem(k);
          });

        // Trim current log aggressively
        this.logFile.wasm_failures = this.logFile.wasm_failures.slice(-10);

        // Try one more time
        try {
          localStorage.setItem('wasm-errors.json', JSON.stringify(this.logFile));
        } catch (e2) {
          console.error('[WASMErrorLogger] Failed to save even after cleanup:', e2);
        }
      } else {
        console.warn('[WASMErrorLogger] Failed to save log:', e);
      }
    }
  }

  /**
   * Check if WASM2 should be disabled
   */
  isWASM2Disabled() {
    return this.logFile.wasm2_disabled;
  }

  /**
   * Reset the current session (useful for testing)
   */
  resetSession() {
    this.logFile = this.createNewLog();
    this.saveLog();
    console.log('[WASMErrorLogger] Session reset');
  }

  /**
   * Get error statistics for debugging
   */
  getErrorStats() {
    const stats = {
      total_errors: this.logFile.wasm_failures.length,
      wasm2_failures: this.logFile.failure_count,
      wasm2_disabled: this.logFile.wasm2_disabled,
      by_type: {},
      by_preset: {},
      memory_issues: 0,
    };

    // Analyze failures
    this.logFile.wasm_failures.forEach((failure) => {
      // By type
      stats.by_type[failure.error_type] = (stats.by_type[failure.error_type] || 0) + 1;

      // By preset
      if (failure.preset) {
        stats.by_preset[failure.preset] = (stats.by_preset[failure.preset] || 0) + 1;
      }

      // Memory issues
      if (failure.error_type === 'MEMORY_CONSTRAINT') {
        stats.memory_issues++;
      }
    });

    return stats;
  }

  /**
   * Export log for bug reports
   */
  exportLog() {
    const exportData = {
      ...this.logFile,
      exported_at: new Date().toISOString(),
      stats: this.getErrorStats(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wasm-errors-${this.logFile.session_id}.json`;
    a.click();
    URL.revokeObjectURL(url);

    return exportData;
  }

  /**
   * Clear old logs (keep last 7 days)
   */
  cleanupOldLogs() {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    this.logFile.wasm_failures = this.logFile.wasm_failures.filter(
      (failure) => failure.timestamp > sevenDaysAgo
    );

    this.saveLog();
    console.log('[WASMErrorLogger] Cleaned up old logs');
  }
}

// Export singleton for easy access
export const wasmLogger = new WASMErrorLogger();
