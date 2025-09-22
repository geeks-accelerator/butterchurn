/**
 * LiveFrameAnalyzer - Real-time detection of problematic frames
 *
 * Detects:
 * - Black frames (60-frame validation)
 * - Stuck frames (120-frame threshold)
 * - Solid color frames (180-frame patience)
 *
 * Multi-frame validation prevents false positives from strobes/flashes
 */

export class LiveFrameAnalyzer {
  constructor(options = {}) {
    // Thresholds for detection (in frames)
    this.thresholds = {
      blackFrame: options.blackFrameThreshold || 60, // 1 second at 60fps
      stuckFrame: options.stuckFrameThreshold || 120, // 2 seconds at 60fps
      solidColor: options.solidColorThreshold || 180, // 3 seconds at 60fps
      ...options.thresholds,
    };

    // Detection sensitivity
    this.sensitivity = {
      blackThreshold: options.blackThreshold || 0.95, // 95% of pixels must be black
      colorVariance: options.colorVariance || 10, // Max variance for solid color
      frameChangeThreshold: options.changeThreshold || 0.01, // 1% change minimum
      ...options.sensitivity,
    };

    // Frame history for multi-frame validation
    this.frameHistory = [];
    this.maxHistorySize = Math.max(...Object.values(this.thresholds));

    // Analysis state
    this.state = {
      frameCount: 0,
      lastFrameHash: null,
      identicalFrameCount: 0,
      blackFrameCount: 0,
      solidColorCount: 0,
      lastAnalysis: null,
    };

    // Performance optimization - sample pixels instead of checking all
    this.sampleSize = options.sampleSize || 1000; // Sample 1000 pixels per frame
    this.sampleIndices = null;
  }

  /**
   * Analyze a frame and return problematic status
   */
  analyzeFrame(frameData, width, height) {
    this.state.frameCount++;

    // Initialize sample indices on first frame
    if (!this.sampleIndices) {
      this.sampleIndices = this.generateSampleIndices(width * height);
    }

    // Calculate frame metrics
    const metrics = this.calculateFrameMetrics(frameData);

    // Update frame history
    this.updateFrameHistory(metrics);

    // Check for problems with multi-frame validation
    const analysis = {
      frameNumber: this.state.frameCount,
      isProblematic: false,
      reason: null,
      confidence: 0,
      metrics: metrics,
      details: {},
    };

    // Check for black frames
    if (this.isBlackFrame(metrics)) {
      this.state.blackFrameCount++;
      if (this.state.blackFrameCount >= this.thresholds.blackFrame) {
        analysis.isProblematic = true;
        analysis.reason = 'black_frame';
        analysis.confidence = this.state.blackFrameCount / this.thresholds.blackFrame;
        analysis.details.blackFrameCount = this.state.blackFrameCount;
      }
    } else {
      this.state.blackFrameCount = 0; // Reset counter if not black
    }

    // Check for stuck frames
    if (this.isStuckFrame(metrics)) {
      this.state.identicalFrameCount++;
      if (this.state.identicalFrameCount >= this.thresholds.stuckFrame) {
        analysis.isProblematic = true;
        analysis.reason = 'stuck_frame';
        analysis.confidence = this.state.identicalFrameCount / this.thresholds.stuckFrame;
        analysis.details.identicalFrameCount = this.state.identicalFrameCount;
      }
    } else {
      this.state.identicalFrameCount = 0; // Reset counter if changed
    }

    // Check for solid color frames
    if (this.isSolidColorFrame(metrics)) {
      this.state.solidColorCount++;
      if (this.state.solidColorCount >= this.thresholds.solidColor) {
        analysis.isProblematic = true;
        analysis.reason = 'solid_color';
        analysis.confidence = this.state.solidColorCount / this.thresholds.solidColor;
        analysis.details.solidColorCount = this.state.solidColorCount;
        analysis.details.dominantColor = metrics.dominantColor;
      }
    } else {
      this.state.solidColorCount = 0; // Reset counter if not solid
    }

    // Store analysis result
    this.state.lastAnalysis = analysis;

    return analysis;
  }

  /**
   * Calculate metrics for a frame
   */
  calculateFrameMetrics(frameData) {
    const metrics = {
      hash: 0,
      brightness: 0,
      blackPixelRatio: 0,
      colorVariance: { r: 0, g: 0, b: 0 },
      dominantColor: { r: 0, g: 0, b: 0 },
      isEmpty: false,
      hasChanged: true,
    };

    // Use sampled pixels for performance
    const samples = this.samplePixels(frameData);

    // Calculate average color and brightness
    let sumR = 0,
      sumG = 0,
      sumB = 0;
    let blackPixels = 0;

    samples.forEach((pixel) => {
      sumR += pixel.r;
      sumG += pixel.g;
      sumB += pixel.b;

      // Check for black pixels
      const brightness = (pixel.r + pixel.g + pixel.b) / 3;
      if (brightness < 10) {
        blackPixels++;
      }
    });

    // Use FNV-1a hash for better distribution and fewer collisions
    const hash = this.calculateFNVHash(samples);

    const sampleCount = samples.length;
    metrics.dominantColor.r = Math.round(sumR / sampleCount);
    metrics.dominantColor.g = Math.round(sumG / sampleCount);
    metrics.dominantColor.b = Math.round(sumB / sampleCount);
    metrics.brightness =
      (metrics.dominantColor.r + metrics.dominantColor.g + metrics.dominantColor.b) / 3;
    metrics.blackPixelRatio = blackPixels / sampleCount;
    metrics.hash = hash;

    // Calculate color variance
    let varR = 0,
      varG = 0,
      varB = 0;
    samples.forEach((pixel) => {
      varR += Math.pow(pixel.r - metrics.dominantColor.r, 2);
      varG += Math.pow(pixel.g - metrics.dominantColor.g, 2);
      varB += Math.pow(pixel.b - metrics.dominantColor.b, 2);
    });

    metrics.colorVariance.r = Math.sqrt(varR / sampleCount);
    metrics.colorVariance.g = Math.sqrt(varG / sampleCount);
    metrics.colorVariance.b = Math.sqrt(varB / sampleCount);

    // Check if frame is empty
    metrics.isEmpty = metrics.blackPixelRatio > 0.99;

    // Check if frame has changed from last frame
    if (this.state.lastFrameHash !== null) {
      metrics.hasChanged = Math.abs(metrics.hash - this.state.lastFrameHash) > 100;
    }
    this.state.lastFrameHash = metrics.hash;

    return metrics;
  }

  /**
   * Calculate FNV-1a hash for better frame comparison
   * FNV (Fowler-Noll-Vo) hash provides better distribution than simple additive hash
   */
  calculateFNVHash(samples) {
    // FNV-1a 32-bit constants
    const FNV_PRIME = 0x01000193;
    const FNV_OFFSET_BASIS = 0x811c9dc5;

    let hash = FNV_OFFSET_BASIS;

    // Process each sampled pixel (already sampled in samplePixels)
    for (let i = 0; i < samples.length; i++) {
      const pixel = samples[i];

      // Mix in RGB values
      hash ^= pixel.r;
      hash = Math.imul(hash, FNV_PRIME);
      hash ^= pixel.g;
      hash = Math.imul(hash, FNV_PRIME);
      hash ^= pixel.b;
      hash = Math.imul(hash, FNV_PRIME);
    }

    // Ensure 32-bit integer
    return hash >>> 0;
  }

  /**
   * Sample pixels from frame data for performance
   */
  samplePixels(frameData) {
    const samples = [];
    const pixelCount = frameData.length / 4; // RGBA = 4 bytes per pixel

    for (let i = 0; i < this.sampleSize && i < pixelCount; i++) {
      const index = this.sampleIndices[i] * 4;
      samples.push({
        r: frameData[index],
        g: frameData[index + 1],
        b: frameData[index + 2],
        a: frameData[index + 3],
      });
    }

    return samples;
  }

  /**
   * Generate random sample indices for consistent sampling
   */
  generateSampleIndices(totalPixels) {
    const indices = [];
    const step = Math.floor(totalPixels / this.sampleSize);

    for (let i = 0; i < this.sampleSize; i++) {
      // Stratified sampling - divide frame into regions
      const regionStart = i * step;
      const regionEnd = Math.min((i + 1) * step, totalPixels);
      const index = regionStart + Math.floor(Math.random() * (regionEnd - regionStart));
      indices.push(Math.min(index, totalPixels - 1));
    }

    return indices;
  }

  /**
   * Update frame history for trend analysis
   */
  updateFrameHistory(metrics) {
    this.frameHistory.push({
      timestamp: Date.now(),
      metrics: metrics,
    });

    // Keep history size manageable
    if (this.frameHistory.length > this.maxHistorySize) {
      this.frameHistory.shift();
    }
  }

  /**
   * Check if frame is predominantly black
   */
  isBlackFrame(metrics) {
    return metrics.blackPixelRatio > this.sensitivity.blackThreshold || metrics.brightness < 5;
  }

  /**
   * Check if frame is stuck (not changing)
   */
  isStuckFrame(metrics) {
    return !metrics.hasChanged && !metrics.isEmpty;
  }

  /**
   * Check if frame is solid color (low variance)
   */
  isSolidColorFrame(metrics) {
    const avgVariance =
      (metrics.colorVariance.r + metrics.colorVariance.g + metrics.colorVariance.b) / 3;

    return (
      avgVariance < this.sensitivity.colorVariance &&
      metrics.brightness > 10 && // Not black
      metrics.brightness < 245
    ); // Not white
  }

  /**
   * Get current analysis state
   */
  getState() {
    return {
      ...this.state,
      historySize: this.frameHistory.length,
      thresholds: this.thresholds,
      sensitivity: this.sensitivity,
    };
  }

  /**
   * Reset analyzer state
   */
  reset() {
    this.state = {
      frameCount: 0,
      lastFrameHash: null,
      identicalFrameCount: 0,
      blackFrameCount: 0,
      solidColorCount: 0,
      lastAnalysis: null,
    };
    this.frameHistory = [];
    console.log('[LiveFrameAnalyzer] State reset');
  }

  /**
   * Analyze frame history for patterns (debugging)
   */
  analyzeHistory() {
    if (this.frameHistory.length < 10) {
      return { message: 'Not enough history for analysis' };
    }

    const recent = this.frameHistory.slice(-60); // Last second at 60fps
    const analysis = {
      avgBrightness: 0,
      avgBlackRatio: 0,
      changeFrequency: 0,
      dominantIssue: null,
    };

    let changes = 0;
    let lastHash = null;

    recent.forEach((frame) => {
      analysis.avgBrightness += frame.metrics.brightness;
      analysis.avgBlackRatio += frame.metrics.blackPixelRatio;

      if (lastHash !== null && frame.metrics.hash !== lastHash) {
        changes++;
      }
      lastHash = frame.metrics.hash;
    });

    analysis.avgBrightness /= recent.length;
    analysis.avgBlackRatio /= recent.length;
    analysis.changeFrequency = changes / recent.length;

    // Determine dominant issue
    if (analysis.avgBlackRatio > 0.8) {
      analysis.dominantIssue = 'mostly_black';
    } else if (analysis.changeFrequency < 0.1) {
      analysis.dominantIssue = 'low_activity';
    } else if (analysis.avgBrightness < 20) {
      analysis.dominantIssue = 'too_dark';
    } else if (analysis.avgBrightness > 235) {
      analysis.dominantIssue = 'too_bright';
    }

    return analysis;
  }

  /**
   * Adjust sensitivity based on device tier
   */
  adjustForDevice(deviceTier) {
    switch (deviceTier) {
      case 'mobile':
        // More lenient on mobile
        this.thresholds.blackFrame = 90; // 1.5 seconds
        this.thresholds.stuckFrame = 180; // 3 seconds
        this.thresholds.solidColor = 240; // 4 seconds
        break;

      case 'low_end':
        // Slightly more lenient
        this.thresholds.blackFrame = 75; // 1.25 seconds
        this.thresholds.stuckFrame = 150; // 2.5 seconds
        this.thresholds.solidColor = 210; // 3.5 seconds
        break;

      case 'high_end':
        // Stricter for high-end
        this.thresholds.blackFrame = 30; // 0.5 seconds
        this.thresholds.stuckFrame = 60; // 1 second
        this.thresholds.solidColor = 120; // 2 seconds
        break;

      default:
        // Keep defaults for mid-range
        break;
    }

    console.log(`[LiveFrameAnalyzer] Adjusted thresholds for ${deviceTier} device`);
  }
}

// Export singleton for easy use
export const frameAnalyzer = new LiveFrameAnalyzer();

export default LiveFrameAnalyzer;