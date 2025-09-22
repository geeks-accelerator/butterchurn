/**
 * PresetFailureLogger - Comprehensive preset failure tracking and blocklist management
 *
 * Dual purpose:
 * 1. Real-time debugging - track failures with full context
 * 2. Permanent blocklist building - auto-block problematic presets
 *
 * All data stored as JSON in localStorage for easy debugging and sharing
 */

export class PresetFailureLogger {
  constructor() {
    this.sessionLog = {
      session_id: Date.now(),
      device: null, // Will be set during initialization
      failures: {},
      started: new Date().toISOString(),
    };

    this.aggregateLog = this.loadAggregateLog();
    this.blocklist = this.loadBlocklist();
    this.initialized = false;

    // Auto-save timer settings (timer will start after initialization)
    this.autoSaveInterval = 30000; // 30 seconds
    this.autoSaveTimer = null;
  }

  /**
   * Initialize with device detection (simplified without WASM)
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.sessionLog.device = await this.getDeviceFingerprint();
      this.initialized = true;
    } catch (error) {
      console.warn('[PresetFailureLogger] Device fingerprint failed, using fallback:', error);
      this.sessionLog.device = {
        tier: 'unknown',
        memory: 4,
        cores: 2,
        gpu: 'unknown',
        browser: navigator.userAgent,
        timestamp: Date.now(),
      };
      this.initialized = true;
    }

    // Start auto-save timer after successful initialization
    this.startAutoSave();
  }

  /**
   * Get device fingerprint for correlation (JavaScript-only version)
   */
  async getDeviceFingerprint() {
    // Simple device tier detection without WASM
    const memory = navigator.deviceMemory || 4;
    const cores = navigator.hardwareConcurrency || 2;

    let tier = 'mid_range';
    if (memory <= 2 || cores <= 2) {
      tier = 'low_end';
    } else if (memory >= 8 && cores >= 8) {
      tier = 'high_end';
    } else if (/Mobile|Android|iPhone/i.test(navigator.userAgent)) {
      tier = 'mobile';
    }

    return {
      tier,
      memory,
      cores,
      gpu: this.detectGPUInfo(),
      browser: navigator.userAgent,
      timestamp: Date.now(),
    };
  }

  /**
   * Detect GPU information for fingerprinting
   */
  detectGPUInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'unknown';

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return 'unknown';

      return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    } catch {
      return 'unknown';
    }
  }

  /**
   * Start auto-save timer
   */
  startAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    this.autoSaveTimer = setInterval(() => {
      this.saveToFile();
    }, this.autoSaveInterval);
  }

  /**
   * Load aggregate statistics from localStorage
   */
  loadAggregateLog() {
    try {
      if (typeof localStorage === 'undefined') {
        return {};
      }
      const stored = localStorage.getItem('preset-failures-aggregate.json');
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.warn('[PresetFailureLogger] Failed to load aggregate log:', e);
      return {};
    }
  }

  /**
   * Load blocklist from localStorage
   */
  loadBlocklist() {
    try {
      if (typeof localStorage === 'undefined') {
        return this.createEmptyBlocklist();
      }
      const stored = localStorage.getItem('preset-blocklist-permanent.json');
      if (!stored) {
        return this.createEmptyBlocklist();
      }

      const parsed = JSON.parse(stored);
      // Convert arrays back to Sets for efficient lookup
      parsed.permanent = new Set(parsed.permanent);
      return parsed;
    } catch (e) {
      console.warn('[PresetFailureLogger] Failed to load blocklist:', e);
      return this.createEmptyBlocklist();
    }
  }

  /**
   * Create empty blocklist structure
   */
  createEmptyBlocklist() {
    return {
      version: 1,
      permanent: new Set(),
      conditional: {
        mobile: [],
        low_memory: [],
        integrated_gpu: [],
      },
      metadata: {},
      created: new Date().toISOString(),
    };
  }

  /**
   * Log a preset failure with full context
   */
  logFailure(presetHash, reason, context) {
    // Guard against logging before initialization
    if (!this.initialized) {
      console.warn(
        '[PresetFailureLogger] Attempted to log failure before initialization. Log discarded.'
      );
      return;
    }

    // Initialize failure record if needed
    if (!this.sessionLog.failures[presetHash]) {
      this.sessionLog.failures[presetHash] = {
        count: 0,
        reasons: [],
        first_failure: Date.now(),
        last_failure: null,
      };
    }

    const failure = this.sessionLog.failures[presetHash];
    failure.count++;
    failure.last_failure = Date.now();

    // Add detailed reason with context
    failure.reasons.push({
      time: Date.now(),
      reason: reason,
      audio_playing: context.audioLevel > 0.01,
      fps: context.fps,
      memory: (typeof performance !== 'undefined' && performance.memory) ? performance.memory.usedJSHeapSize : undefined,
      frame_data: context.frameData || null,
    });

    // Update aggregate statistics
    this.updateAggregateStats(presetHash, reason);

    // Check if should auto-blocklist
    if (this.shouldBlocklist(presetHash)) {
      this.addToBlocklist(presetHash, 'high_failure_rate');
    }

    // Log to console for debugging
    console.log(`[PresetFailure] ${presetHash}: ${reason} (${failure.count} failures)`);

    // Save periodically
    if (failure.count % 10 === 0) {
      this.saveToFile();
    }
  }

  /**
   * Update aggregate statistics across all sessions
   */
  updateAggregateStats(presetHash, reason) {
    if (!this.aggregateLog[presetHash]) {
      this.aggregateLog[presetHash] = {
        first_seen: Date.now(),
        total_attempts: 0,
        total_failures: 0,
        failure_reasons: {},
        devices_failed: [],
        last_failure: null,
      };
    }

    const stats = this.aggregateLog[presetHash];
    stats.total_attempts++;
    stats.total_failures++;
    stats.last_failure = Date.now();

    // Track failure reasons
    if (!stats.failure_reasons[reason]) {
      stats.failure_reasons[reason] = 0;
    }
    stats.failure_reasons[reason]++;

    // Track unique devices
    const deviceKey = `${this.sessionLog.device.tier}_${this.sessionLog.device.memory}`;
    if (!stats.devices_failed.includes(deviceKey)) {
      stats.devices_failed.push(deviceKey);
    }

    // Calculate failure rate
    stats.failure_rate = stats.total_failures / stats.total_attempts;
  }

  /**
   * Check if preset should be auto-blocklisted
   */
  shouldBlocklist(presetHash) {
    const stats = this.aggregateLog[presetHash];
    return (
      stats &&
      (stats.failure_rate > 0.8 || // 80% failure rate
        stats.total_failures > 50) // Or 50+ total failures
    );
  }

  /**
   * Add preset to blocklist
   */
  addToBlocklist(presetHash, reason) {
    // Add to permanent blocklist
    this.blocklist.permanent.add(presetHash);

    // Add metadata
    if (!this.blocklist.metadata[presetHash]) {
      this.blocklist.metadata[presetHash] = {
        added: Date.now(),
        reasons: [],
        auto_blocked: true,
        failure_stats: { ...this.aggregateLog[presetHash] },
      };
    }

    this.blocklist.metadata[presetHash].reasons.push({
      reason: reason,
      timestamp: Date.now(),
    });

    // Add to conditional lists based on device
    const device = this.sessionLog.device;
    if (device.tier === 'mobile' && !this.blocklist.conditional.mobile.includes(presetHash)) {
      this.blocklist.conditional.mobile.push(presetHash);
    }
    if (device.memory < 4 && !this.blocklist.conditional.low_memory.includes(presetHash)) {
      this.blocklist.conditional.low_memory.push(presetHash);
    }
    if (
      device.gpu &&
      device.gpu.includes('Intel') &&
      !this.blocklist.conditional.integrated_gpu.includes(presetHash)
    ) {
      this.blocklist.conditional.integrated_gpu.push(presetHash);
    }

    console.warn(`[Blocklist] Added ${presetHash} to permanent blocklist: ${reason}`);

    // Immediate save when blocklist changes
    this.saveToFile();
  }

  /**
   * Check if preset is blocked for current device
   */
  isBlocked(presetHash, device = null) {
    device = device || this.sessionLog.device;

    // Check permanent blocklist
    if (this.blocklist.permanent.has(presetHash)) {
      return { blocked: true, reason: 'permanent' };
    }

    // Check conditional blocklists
    if (device.tier === 'mobile' && this.blocklist.conditional.mobile.includes(presetHash)) {
      return { blocked: true, reason: 'mobile_incompatible' };
    }

    if (device.memory < 4 && this.blocklist.conditional.low_memory.includes(presetHash)) {
      return { blocked: true, reason: 'insufficient_memory' };
    }

    if (
      device.gpu &&
      device.gpu.includes('Intel') &&
      this.blocklist.conditional.integrated_gpu.includes(presetHash)
    ) {
      return { blocked: true, reason: 'gpu_incompatible' };
    }

    return { blocked: false };
  }

  /**
   * Save all logs to localStorage
   */
  saveToFile() {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }
      // Session log
      localStorage.setItem(
        `preset-failures-${this.sessionLog.session_id}.json`,
        JSON.stringify(this.sessionLog)
      );

      // Aggregate log
      localStorage.setItem('preset-failures-aggregate.json', JSON.stringify(this.aggregateLog));

      // Permanent blocklist (convert Set to Array for JSON)
      localStorage.setItem(
        'preset-blocklist-permanent.json',
        JSON.stringify(this.exportBlocklist())
      );
    } catch (e) {
      console.error('[PresetFailureLogger] Failed to save logs:', e);
    }
  }

  /**
   * Export blocklist for sharing
   */
  exportBlocklist() {
    return {
      version: this.blocklist.version,
      generated: Date.now(),
      permanent: Array.from(this.blocklist.permanent),
      conditional: this.blocklist.conditional,
      metadata: this.blocklist.metadata,
      stats: {
        total_blocked: this.blocklist.permanent.size,
        mobile_blocked: this.blocklist.conditional.mobile.length,
        low_memory_blocked: this.blocklist.conditional.low_memory.length,
        integrated_gpu_blocked: this.blocklist.conditional.integrated_gpu.length,
      },
    };
  }

  /**
   * Import external blocklist
   */
  importBlocklist(externalBlocklist) {
    try {
      const external =
        typeof externalBlocklist === 'string' ? JSON.parse(externalBlocklist) : externalBlocklist;

      // Merge permanent blocklist
      external.permanent.forEach((hash) => {
        this.blocklist.permanent.add(hash);
        if (!this.blocklist.metadata[hash]) {
          this.blocklist.metadata[hash] = external.metadata[hash] || {
            added: Date.now(),
            reasons: ['imported'],
            auto_blocked: false,
          };
        }
      });

      // Merge conditional blocklists
      ['mobile', 'low_memory', 'integrated_gpu'].forEach((condition) => {
        if (external.conditional[condition]) {
          external.conditional[condition].forEach((hash) => {
            if (!this.blocklist.conditional[condition].includes(hash)) {
              this.blocklist.conditional[condition].push(hash);
            }
          });
        }
      });

      console.log(
        `[Blocklist] Imported ${external.permanent.length} permanent blocks, ` +
          `${external.stats ? external.stats.total_blocked : 'unknown'} total`
      );

      this.saveToFile();
      return true;
    } catch (e) {
      console.error('[PresetFailureLogger] Failed to import blocklist:', e);
      return false;
    }
  }

  /**
   * Get statistics for debugging
   */
  getStatistics() {
    return {
      session: {
        id: this.sessionLog.session_id,
        started: this.sessionLog.started,
        failures: Object.keys(this.sessionLog.failures).length,
        device: this.sessionLog.device,
      },
      aggregate: {
        total_presets: Object.keys(this.aggregateLog).length,
        total_failures: Object.values(this.aggregateLog).reduce(
          (sum, p) => sum + p.total_failures,
          0
        ),
      },
      blocklist: {
        permanent: this.blocklist.permanent.size,
        mobile: this.blocklist.conditional.mobile.length,
        low_memory: this.blocklist.conditional.low_memory.length,
        integrated_gpu: this.blocklist.conditional.integrated_gpu.length,
      },
    };
  }

  /**
   * Clear all logs and blocklists
   * Note: Caller is responsible for any confirmation UI
   */
  clearAllLogs() {
    // Clear localStorage if available
    if (typeof localStorage !== 'undefined') {
      Object.keys(localStorage)
        .filter((key) => key.startsWith('preset-failures-') || key.startsWith('preset-blocklist-'))
        .forEach((key) => localStorage.removeItem(key));
    }

    // Reset in-memory data
    this.sessionLog.failures = {};
    this.aggregateLog = {};
    this.blocklist = this.createEmptyBlocklist();

    console.log('[PresetFailureLogger] All logs cleared');
  }

  /**
   * Clean up on destroy
   */
  destroy() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.saveToFile();
  }
}

// Export singleton for easy use
export const presetLogger = new PresetFailureLogger();

export default PresetFailureLogger;