# Implementation Plan: Selector Optimization Improvements

**Date:** 2026-03-25
**Status:** 🔜 Ready for Implementation
**Repository:** butterchurn
**Goal:** Optimize preset selector with audio lookahead and efficient preset indexing

> **Note (2026-06-13):** This plan builds on the completed audio analysis improvements. Prerequisite work is done:
> - ✅ BPM detection with iterative clamping + correct `beatInterval` derivation
> - ✅ Genre-aware phrase tracking (16/32/64 beats, properly wired with confidence hysteresis)
> - ✅ Pre-drop anticipation with 8-bar buildup window (configurable)
> - ✅ Gaussian smoothing for stable trend detection
> - ✅ Meyda.js spectral analysis with readiness signal (`meydaReady` getter + `waitForMeyda()`)
> - ✅ `features.energy` properly set (selector branches now live)
> - ✅ Beat skip handling for long pauses — O(1) arithmetic, safe for hour-long tab suspensions
> - ✅ Genre-flap hysteresis (`genreConfidenceThreshold`, default 0.6) prevents phrase tracker desync on noisy frames
>
> Post-implementation review (two rounds) fixed all known bugs and design gaps. Audio analysis foundation is solid. Full audit: [`../../../docs/issues/2026-06-13-butterchurn-audio-analyzer-review-followups.md`](../../../docs/issues/2026-06-13-butterchurn-audio-analyzer-review-followups.md). Audio lookahead (Phase 1) and reverse index scaling (Phase 2) can now proceed.

---

## Overview

This plan addresses two optimization opportunities identified during the fingerprint quality audit:

1. **Audio Lookahead** - Anticipate musical changes ~1-2 seconds ahead to schedule transitions proactively
2. **Reverse Index Scaling** - Improve preset name → hash ID lookup efficiency for large collections

Both optimizations enhance the intelligent preset selector without changing its core functionality.

---

## Parent Roadmap & Related Documents

| Document | Purpose | Relationship |
|----------|---------|--------------|
| **[intelligent-preset-selector-improvements.md](intelligent-preset-selector-improvements.md)** | Core selector implementation | **PARENT** - These are optimizations on top |
| **[fingerprint-quality-improvements.md](fingerprint-quality-improvements.md)** | Fingerprint v2.1 implementation | **SIBLING** - Audit that identified these TODOs |
| **[../architecture/mathematical-fingerprinting.md](../architecture/mathematical-fingerprinting.md)** | Fingerprint algorithm docs | **REFERENCE** - Hash ID system |
| **[marketing-studio:2025-10-02-audio-analysis-improvements.md](../../../docs/plans/2025-10-02-butterchurn-audio-analysis-improvements.md)** | Audio analysis enhancements | **PREREQUISITE** - Completed (Meyda, BPM, smoothing) |

---

## Phase 1: Audio Lookahead (~1-2 Second Anticipation)

### Problem Statement

**Location:** `src/intelligentPresetSelector.js` lines 238-247

Currently the selector is **reactive** - it switches presets AFTER detecting energy changes (drops, buildups). This causes awkward mid-drop transitions where the visual preset changes during the most impactful musical moment, breaking the flow.

**Current Behavior:**
```
Time:        -------|DROP|-------
Energy:      low low HIGH HIGH HIGH
Detection:          ^--- detected here
Switch:                  ^--- switch happens here (too late!)
```

**Desired Behavior:**
```
Time:        -------|DROP|-------
Energy:      low low HIGH HIGH HIGH
Detection:     ^--- predicted from lookahead
Switch:        ^--- switch completes before drop
```

### Technical Approach

#### Option A: Web Audio Buffer Lookahead (Recommended)
Use Web Audio API's `AudioBufferSourceNode` with scheduled playback to peek ahead.

**Pros:**
- Native API, no external dependencies
- Precise timing with AudioContext clock
- Works with MediaElementSource

**Cons:**
- Requires buffering audio data (memory overhead)
- More complex AudioContext management

#### Option B: Beat Prediction from BPM
Use detected BPM and phrase position to predict upcoming drop timing.

**Pros:**
- No additional buffering needed
- Works with existing BPM detection

**Cons:**
- Less accurate for irregular music
- Can't predict energy changes, only beat positions

### Implementation Steps

#### Step 1.1: Add Lookahead Buffer System
Create a circular buffer that holds 1-2 seconds of upcoming audio features.

```javascript
// New class: src/audio/audioLookahead.js
export class AudioLookahead {
    constructor(options = {}) {
        this.lookaheadMs = options.lookaheadMs || 1500;    // 1.5 seconds
        this.analysisIntervalMs = options.analysisIntervalMs || 50;  // 50ms chunks
        this.buffer = new CircularBuffer(this.lookaheadMs / this.analysisIntervalMs);
        this.predictions = {
            dropIn: null,       // ms until predicted drop
            buildupIn: null,    // ms until predicted buildup
            breakdownIn: null,  // ms until predicted breakdown
            peakIn: null        // ms until predicted peak
        };
    }

    /**
     * Add audio features for a future time slice
     * @param {Object} features - Audio features from advancedAnalyzer
     * @param {number} futureMs - How far ahead this data represents
     */
    addFutureFrame(features, futureMs) {
        this.buffer.push({ features, timestamp: futureMs });
        this.analyzePredictions();
    }

    /**
     * Analyze buffered data for upcoming musical events
     */
    analyzePredictions() {
        const frames = this.buffer.toArray();

        // Look for sudden energy increases (drops)
        for (let i = 1; i < frames.length; i++) {
            const prevEnergy = frames[i-1].features.beatStrength || 0;
            const currEnergy = frames[i].features.beatStrength || 0;
            const energyJump = currEnergy - prevEnergy;

            // Drop detection: >0.3 energy jump with high bass
            if (energyJump > 0.3 && (frames[i].features.bass || 0) > 0.6) {
                this.predictions.dropIn = frames[i].timestamp;
                break;
            }
        }

        // Similar logic for buildup, breakdown, peak...
    }

    /**
     * Get predictions for upcoming events
     * @returns {Object} Predicted events with timing
     */
    getPredictions() {
        return { ...this.predictions };
    }
}
```

#### Step 1.2: Integrate with AdvancedAudioAnalyzer
Modify `advancedAnalyzer.js` to support lookahead mode.

```javascript
// In advancedAnalyzer.js - add method:
/**
 * Analyze audio data for future timestamps
 * Used by lookahead system to predict upcoming events
 * @param {AudioBuffer} buffer - Audio buffer to analyze
 * @param {number} startOffset - Start position in samples
 * @param {number} windowSize - Analysis window in samples
 */
analyzeBufferSlice(buffer, startOffset, windowSize) {
    // Extract slice from buffer
    const channelData = buffer.getChannelData(0);
    const slice = channelData.slice(startOffset, startOffset + windowSize);

    // Convert to frequency domain using offline FFT
    const fftData = this.offlineFFT(slice);

    // Return features without storing in history
    return this.calculateFeaturesFromFFT(fftData);
}
```

#### Step 1.3: Modify Selector for Proactive Switching
Update `intelligentPresetSelector.js` to use predictions.

```javascript
// In shouldSwitchPreset() - add prediction-based switching:
shouldSwitchPreset(features, timeSinceSwitch) {
    // ... existing reactive logic ...

    // NEW: Proactive switching based on lookahead
    if (this.audioLookahead) {
        const predictions = this.audioLookahead.getPredictions();

        // If drop coming in 1-2 seconds, schedule switch NOW
        if (predictions.dropIn !== null &&
            predictions.dropIn > 500 &&
            predictions.dropIn < 2000) {

            // Find a high-energy preset that will match the drop
            const dropFeatures = { ...features, beatStrength: 0.9, bass: 0.8 };
            const dropPreset = this.selectBestPresetWithLogic(dropFeatures);

            return {
                shouldSwitch: true,
                reason: 'proactive_drop_anticipation',
                targetPreset: dropPreset,
                delayMs: predictions.dropIn - 500  // Complete switch 500ms before drop
            };
        }
    }

    // Fall back to reactive switching
    return this.reactiveSwitch(features, timeSinceSwitch);
}
```

### Testing Strategy

1. **Unit Tests** - Mock audio buffers with known drop patterns
2. **Integration Tests** - Use test audio files with clear drop structures
3. **Visual Regression** - Ensure lookahead doesn't break existing visuals
4. **A/B Testing** - Compare user perception of reactive vs proactive switching

### Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Transitions during drops | ~40% | <10% |
| Perceived transition quality | N/A | User surveys |
| Memory overhead | 0 MB | <5 MB |
| Prediction accuracy (drops) | 0% | >70% |

---

## Phase 2: Reverse Index Scaling Optimization

### Problem Statement

**Location:** `src/intelligentPresetSelector.js` lines 361-367

The current implementation builds a reverse mapping from preset names to hash IDs at runtime. This creates O(n) startup time and O(n) memory usage where n = number of presets. For the full Alaska Butter collection (495 presets), this is manageable, but won't scale to thousands of presets.

**Current Flow:**
```
Startup → Load fingerprints → Build reverse map (O(n)) → Ready
         495 presets        ~50-100ms
```

**Issues:**
1. Blocking startup time increases linearly with preset count
2. Memory stores duplicate data (forward + reverse maps)
3. No caching between page loads

### Technical Approach

#### Option A: Build-Time Index Generation (Recommended)
Generate reverse index during `npm run build:cdn` and ship as separate file.

**Pros:**
- Zero runtime overhead
- Index can be cached by browser
- Single source of truth

**Cons:**
- Additional build step
- Larger download size (though separate file)

#### Option B: On-Demand Loading with Map
Use `Map` instead of `Object` and load mappings lazily.

**Pros:**
- Faster lookups with Map
- Load only what's needed

**Cons:**
- Still O(n) for full scans
- More complex loading logic

#### Option C: LocalStorage Caching
Cache the computed reverse map in localStorage.

**Pros:**
- Compute once per browser
- Works with existing code

**Cons:**
- Storage limits (~5-10MB)
- Cache invalidation complexity

### Implementation Steps

#### Step 2.1: Generate Reverse Index at Build Time
Add to `tools/generate-fingerprints.js`:

```javascript
/**
 * Generate reverse index mapping preset names to hash IDs
 * Called during build process, outputs to CDN
 */
function generateReverseIndex(fingerprints, outputPath) {
    const reverseIndex = {};

    for (const [hashId, fp] of Object.entries(fingerprints)) {
        if (fp.name) {
            // Normalize name for lookup
            const normalizedName = fp.name.toLowerCase().trim();
            reverseIndex[normalizedName] = hashId;

            // Also index without pack prefix
            const shortName = fp.name.replace(/^\[.*?\]\s*/, '');
            if (shortName !== fp.name) {
                reverseIndex[shortName.toLowerCase().trim()] = hashId;
            }
        }
    }

    const output = {
        version: '1.0',
        generated: new Date().toISOString(),
        count: Object.keys(reverseIndex).length,
        index: reverseIndex
    };

    fs.writeFileSync(
        outputPath,
        JSON.stringify(output, null, 2)
    );

    console.log(`Generated reverse index: ${Object.keys(reverseIndex).length} entries`);
}
```

#### Step 2.2: Update FingerprintLoader
Modify `src/fingerprintLoader.js` to load pre-built index:

```javascript
// Add to FingerprintLoader class
async loadReverseIndex() {
    if (this.reverseIndex) return this.reverseIndex;

    try {
        const response = await fetch(`${this.cdnBase}/presets/reverse-index.json`);
        if (response.ok) {
            const data = await response.json();
            this.reverseIndex = new Map(Object.entries(data.index));
            console.log(`[FingerprintLoader] Loaded reverse index: ${this.reverseIndex.size} entries`);
            return this.reverseIndex;
        }
    } catch (e) {
        console.warn('[FingerprintLoader] Reverse index not available, falling back to runtime generation');
    }

    // Fallback: build at runtime (existing behavior)
    return this.buildReverseIndexRuntime();
}

/**
 * Fast lookup: preset name → hash ID
 * O(1) with pre-built index
 */
getHashIdByName(presetName) {
    if (!this.reverseIndex) {
        console.warn('[FingerprintLoader] Reverse index not loaded');
        return null;
    }

    const normalized = presetName.toLowerCase().trim();
    return this.reverseIndex.get(normalized) || null;
}
```

#### Step 2.3: Update Selector to Use New Index
Modify `src/intelligentPresetSelector.js`:

```javascript
// In setupModuleInitialization() - replace manual index building
async initializePresetIndex() {
    // Try to load pre-built index first
    if (this.fingerprintLoader) {
        const index = await this.fingerprintLoader.loadReverseIndex();
        if (index) {
            this.presetNameToHash = index;
            console.log('[IntelligentSelector] Using pre-built reverse index');
            return;
        }
    }

    // Fallback: build manually (existing code)
    this.buildReverseIndexManually();
}
```

#### Step 2.4: Update Build Process
Add to `package.json` scripts:

```json
{
  "scripts": {
    "build:cdn": "node tools/build-cdn.js && node tools/generate-reverse-index.js"
  }
}
```

### Testing Strategy

1. **Performance Tests** - Measure startup time with 100, 500, 1000+ presets
2. **Lookup Tests** - Verify all preset names resolve to correct hash IDs
3. **Fallback Tests** - Ensure runtime generation still works if index unavailable
4. **Cache Tests** - Verify browser caching of index file

### Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Index build time (runtime) | ~50-100ms | 0ms (pre-built) |
| Memory for reverse map | ~100KB | Shared with browser cache |
| Lookup time per preset | O(n) scan | O(1) Map lookup |
| Startup with 1000 presets | ~200ms | <50ms |

---

## Implementation Order

| Phase | Feature | Priority | Effort | Dependencies |
|-------|---------|----------|--------|--------------|
| 2.1 | Build-time reverse index | High | 2 hours | None |
| 2.2 | FingerprintLoader index support | High | 1 hour | 2.1 |
| 2.3 | Selector integration | High | 1 hour | 2.2 |
| 1.1 | Lookahead buffer system | Medium | 4 hours | None |
| 1.2 | AdvancedAnalyzer integration | Medium | 2 hours | 1.1 |
| 1.3 | Proactive switching | Medium | 3 hours | 1.2 |

**Recommended Order:** Phase 2 first (simpler, immediate benefit), then Phase 1.

---

## Risk Assessment

### Phase 1 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Memory overhead too high | Medium | High | Configurable buffer size, disable by default |
| Prediction accuracy poor | Medium | Low | Keep reactive fallback, A/B test |
| Audio API compatibility | Low | Medium | Feature detection, graceful degradation |

### Phase 2 Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Build step fails | Low | Medium | CI validation, fallback to runtime |
| Index out of sync | Medium | High | Version checking, auto-rebuild |
| Storage quota limits | Low | Low | Compress index, prune old entries |

---

## Appendix: Code Location Reference

| File | Lines | Current Code | Phase |
|------|-------|--------------|-------|
| `src/intelligentPresetSelector.js` | 238-247 | Audio lookahead TODO | 1 |
| `src/intelligentPresetSelector.js` | 361-367 | Reverse index TODO | 2 |
| `src/audio/advancedAnalyzer.js` | - | Add buffer analysis | 1 |
| `src/fingerprintLoader.js` | - | Add index loading | 2 |
| `tools/generate-fingerprints.js` | - | Add index generation | 2 |

---

*Document created: 2026-03-25*
*Last updated: 2026-03-25*
