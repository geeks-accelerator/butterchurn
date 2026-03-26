# Implementation Plan: Intelligent Preset Selector Improvements

**Date:** 2026-03-25
**Status:** Draft - Review Issues Addressed (v4.0)
**Repository:** butterchurn
**Goal:** Transform preset selection from "random-feeling" to "curated"

> **Review Status**: All 16 issues from [pre-implementation review](../issues/intelligent-preset-selector-plan-review.md) have been addressed in this version.

---

## Parent Roadmap & Related Documents

This plan implements the **⚠️ PARTIALLY COMPLETED** features from the master roadmap:

| Document | Purpose | Relationship |
|----------|---------|--------------|
| **[advanced-features.md](advanced-features.md)** | Master roadmap for all Butterchurn advanced features | **PARENT** - This plan completes Phases 2-4 |
| **[../proposals/scene-based-preset-switching.md](../proposals/scene-based-preset-switching.md)** | Design proposal for intelligent switching | **INPUT** - Algorithms incorporated here |
| **[mathematical-fingerprinting.md](../architecture/mathematical-fingerprinting.md)** | Fingerprint algorithm documentation | **REFERENCE** - Existing fingerprint logic |

### Features This Plan Completes (from advanced-features.md)

- [ ] **Better Fingerprint Accuracy** (Section 1) → Phases 4-5 here
- [ ] **Smarter Candidate Selection** (Section 3) → Phase 3 here
- [ ] **Intelligent Timing System** (Section 4) → Phase 2 here
- [ ] **Predictive Switching** (Section 5) → Phase 2.4 here (pre-drop anticipation)

---

## Overview

Enhance the `IntelligentPresetSelector` to make better preset choices by:

1. **Enhanced Audio Analysis** - Add Meyda.js spectral features to `advancedAnalyzer.js`
2. **Musical Timing & Switching** - BPM detection, 16-beat phrase boundaries, pre-drop anticipation
3. **Mood-Aware Selection** - Match detected audio mood to preset characteristics
4. **Preset Performance Tracking** - Monitor match quality, switch when degraded
5. **Enhanced Fingerprints** - Add visual style, mood affinities, optimal BPM ranges
6. **Visual Style ML Tagging** - CLIP-based preset categorization

---

## Codebase Audit - Existing Code to Reuse

> **CRITICAL**: This section documents existing implementations that MUST be reused. Do NOT duplicate this functionality.

### advancedAnalyzer.js (225 lines) - Existing Features

The analyzer already provides these features that our enhancements should BUILD UPON:

| Method | What It Does | Reuse Strategy |
|--------|--------------|----------------|
| `calculateFeatures(dataArray, timeByteArray)` | Extracts beatStrength, spectralCentroid, zeroCrossingRate, dynamicRange, bass/mid/treble/subBass/highMid | **EXTEND** - add Meyda features to returned object |
| `detectMusicalEvent(features)` | Detects Drop, Buildup, Breakdown, Ambient, Peak, Steady | **ENHANCE** - use flux spike for better drop detection |
| `getTrends()` | Calculates trends for bass, energy, brightness, percussion | **REUSE** - no changes needed |
| `calculateBandEnergy(dataArray, start, end)` | Frequency band energy calculation | **REUSE** - no changes needed |
| `featureHistory` array | Maintains history for trend detection | **REUSE** - no changes needed |

**Constructor Signature Issue**: Current constructor takes `config = {}` only. Need to ADD optional `audioContext` and `source` params for Meyda initialization while maintaining backward compatibility.

### intelligentPresetSelector.js (2107 lines) - Existing Features

| Feature | Location | Reuse Strategy |
|---------|----------|----------------|
| `this.audioAnalyzer` | Line 82-93 | **REUSE** - already instantiates AdvancedAudioAnalyzer |
| `this.crossoverDetector` | Line 129-132 | **REUSE** - MultiSignalCrossover for timing decisions |
| `this.weights` object | Lines 179-198 | **EXTEND** - add new weight keys for mood, BPM, spectral |
| `scorePreset(hash, features)` | Lines 1246-1288 | **MODIFY** - add mood, BPM, spectral scoring factors |
| `shouldSwitchPreset(features, timeSinceSwitch)` | Lines 951-1036 | **MODIFY** - add bar-alignment logic |
| `selectBestPresetWithLogic(features)` | Lines 1072-1127 | **MODIFY** - pass mood to scorePreset |
| `update(audioLevels, frameData)` | Lines 594-735 | **MODIFY** - add bar-aligned pending switch execution |

**Existing Scoring Weights** (lines 179-198):
```javascript
this.weights = {
    energyMatch: 0.3,      // Keep at 0.25 (reduce from 0.3)
    frequencyMatch: 0.25,  // Remove - replaced by spectral matching
    rhythmMatch: 0.2,      // Remove - replaced by BPM matching
    dynamicsMatch: 0.15,   // Remove - folded into energy
    continuity: 0.1,       // Keep at 0.10
    bassMatch: 0.15,       // Keep at 0.15
    performance: 0.1,      // Keep at 0.10
    variety: 0.05          // Keep at 0.05
    // ADD: moodMatch: 0.15, bpmMatch: 0.10, spectralMatch: 0.10
};
```

### movingAverageCrossover.js (459 lines) - Fully Reuse

| Class | Purpose | Reuse Strategy |
|-------|---------|----------------|
| `SMA`, `EMA`, `DEMA`, `HMA` | Signal smoothing | **REUSE** - no changes |
| `MultiSignalCrossover` | Detects audio transitions | **REUSE** - no changes |

### generate-fingerprints.js (760 lines) - Existing Analysis Functions

| Function | What It Does | Reuse Strategy |
|----------|--------------|----------------|
| `generateContentHash(preset)` | SHA256 hash generation | **REUSE** - no changes |
| `analyzeEnergy(preset)` | Energy from equations | **REUSE** - no changes |
| `analyzeBassReactivity(preset)` | Bass reactivity | **REUSE** - use for `bassEnergy` |
| `analyzeTrebleReactivity(preset)` | Treble reactivity | **REUSE** - use for `trebleEnergy` |
| `analyzeBeatSync(preset)` | Beat sync detection | **REUSE** - no changes |
| `analyzeComplexity(preset)` | Visual complexity | **REUSE** - no changes |
| `estimatePerformance(preset)` | FPS estimation | **REUSE** - no changes |
| `detectVisualStyle(preset)` | Basic style detection (particle, fractal, geometric, organic) | **EXTEND** - add CLIP scores |
| `getAllEquations(preset)` | Equation extraction | **REUSE** - no changes |

### Existing Test Structure

**Current test format**: HTML-based manual tests (NOT Jest/Mocha)
- `test/intelligent-selector-test.html` (88KB) - comprehensive manual testing
- `test/fingerprint-test.html` - fingerprint testing
- `test/performance-test.html` - performance testing

**Decision**: Add Jest tests alongside HTML tests (both are valuable). Configure `jest.config.mjs` already exists.

---

## Files to Modify

| File | Purpose |
|------|---------|
| `src/audio/advancedAnalyzer.js` | **EXTEND** with Meyda.js, BPM detection, mood detection |
| `src/intelligentPresetSelector.js` | **MODIFY** scoring, add bar-aligned switching, wiring |
| `tools/generate-fingerprints.js` | **EXTEND** schema with visual style, mood, BPM |
| `tools/classify-visual-style.py` | **NEW**: CLIP-based visual style classifier |
| `tools/render-preset-frames.js` | **NEW**: Headless preset renderer for ML |
| `package.json` | Add meyda dependency |

### Test Files to Create

| File | Purpose |
|------|---------|
| `test/advancedAnalyzer.test.js` | Unit tests for Meyda, BPM, mood detection |
| `test/intelligentPresetSelector.test.js` | Unit tests for scoring, bar-aligned switching |
| `test/tools/generateFingerprints.test.js` | Unit tests for fingerprint generation |
| `test/integration/presetSelection.test.js` | End-to-end integration tests |
| `test/performance/analyzer.perf.js` | Performance benchmarks |
| `test/edgeCases.test.js` | Edge case coverage |

---

## Phase 1: Enhanced Audio Analysis

### Current State (`src/audio/advancedAnalyzer.js`)

**EXISTING CODE TO PRESERVE** (see Codebase Audit above):
- `calculateFeatures()` - returns beatStrength, spectralCentroid, zeroCrossingRate, dynamicRange, bass/mid/treble/subBass/highMid
- `detectMusicalEvent()` - returns Drop, Buildup, Breakdown, Ambient, Peak, Steady
- `getTrends()`, `calculateBandEnergy()`, `featureHistory`

### Task 1.1: Add Meyda.js as dependency

**File:** `package.json`

```json
"dependencies": {
  "meyda": "^5.6.3"
}
```

### Task 1.2: EXTEND `advancedAnalyzer.js` constructor (backward compatible)

**File:** `src/audio/advancedAnalyzer.js`

**IMPORTANT**: Modify the EXISTING constructor to accept optional audio context params while maintaining backward compatibility:

```javascript
import Meyda from 'meyda';

// EXISTING class - modify constructor signature
export class AdvancedAudioAnalyzer {
    /**
     * Initialize the audio analyzer with configurable thresholds
     * @param {Object} config - Configuration object with optional threshold values
     * @param {AudioContext} audioContext - Optional: Web Audio context for Meyda
     * @param {AudioNode} source - Optional: Audio source node for Meyda
     */
    constructor(config = {}, audioContext = null, source = null) {
        // EXISTING: History for trend detection (keep unchanged)
        this.featureHistory = [];
        this.maxHistorySize = config.maxHistorySize || 30;

        // EXISTING: Event detection thresholds (keep unchanged)
        this.dropThreshold = config.dropThreshold || 0.7;
        this.buildupThreshold = config.buildupThreshold || 0.5;
        this.breakdownThreshold = config.breakdownThreshold || 0.3;
        this.chillThreshold = config.chillThreshold || 0.3;
        this.bassWeight = config.bassWeight || 0.6;
        this.trebleWeight = config.trebleWeight || 0.3;

        // NEW: Meyda integration (only if audio context provided)
        this.meydaAnalyzer = null;
        this.audioContext = audioContext;
        this.source = source;

        if (audioContext && source) {
            try {
                // CRIT-1 FIX: Use 2048 buffer to match CLAUDE.md requirement
                // "PRESERVE 2048-sample audio buffer size - never revert to 512"
                this.meydaAnalyzer = Meyda.createMeydaAnalyzer({
                    audioContext: audioContext,
                    source: source,
                    bufferSize: 2048,  // MUST match existing pipeline (was 512)
                    featureExtractors: [
                        'rms', 'spectralCentroid', 'spectralFlux',
                        'spectralFlatness', 'spectralRolloff', 'zcr',
                        'perceptualSharpness'
                    ],
                    callback: null
                });
                this.meydaAnalyzer.start();
            } catch (e) {
                console.warn('[AdvancedAnalyzer] Meyda init failed:', e.message);
            }
        }

        // NEW: Flux history for spike detection
        this.fluxHistory = [];
        this.FLUX_HISTORY_SIZE = 30;

        // SUG-1 FIX: Make flux spike multiplier configurable
        this.fluxSpikeMultiplier = config.fluxSpikeMultiplier || 2.5;
    }
```

### Task 1.3: EXTEND `calculateFeatures()` to include Meyda data

**File:** `src/audio/advancedAnalyzer.js`

**IMPORTANT**: Add Meyda features to the EXISTING return object, don't replace it:

```javascript
    // MODIFY existing calculateFeatures method
    calculateFeatures(dataArray, timeByteArray) {
        // EXISTING: All original feature calculations (keep ALL of this unchanged)
        const features = {};

        // ... keep all existing code for beatDetected, beatStrength, spectralCentroid,
        // zeroCrossingRate, dynamicRange, subBass, bass, mid, highMid, treble ...
        // ... keep featureHistory.push() logic ...

        // NEW: Add Meyda spectral features if available
        if (this.meydaAnalyzer) {
            try {
                const meydaFeatures = this.meydaAnalyzer.get([
                    'rms', 'spectralCentroid', 'spectralFlux',
                    'spectralFlatness', 'spectralRolloff', 'zcr', 'perceptualSharpness'
                ]);

                if (meydaFeatures && meydaFeatures.spectralFlux !== undefined) {
                    this.fluxHistory.push(meydaFeatures.spectralFlux);
                    if (this.fluxHistory.length > this.FLUX_HISTORY_SIZE) {
                        this.fluxHistory.shift();
                    }
                }

                const avgFlux = this.fluxHistory.length > 0
                    ? this.fluxHistory.reduce((a, b) => a + b, 0) / this.fluxHistory.length
                    : 0;

                // ADD new 'spectral' object to existing features
                // SUG-1 FIX: Use configurable multiplier instead of magic number
                features.spectral = meydaFeatures ? {
                    rms: meydaFeatures.rms || 0,
                    centroid: meydaFeatures.spectralCentroid || 0,
                    flux: meydaFeatures.spectralFlux || 0,
                    flatness: meydaFeatures.spectralFlatness || 0,
                    rolloff: meydaFeatures.spectralRolloff || 0,
                    zcr: meydaFeatures.zcr || 0,
                    sharpness: meydaFeatures.perceptualSharpness || 0,
                    avgFlux: avgFlux,
                    isFluxSpike: meydaFeatures.spectralFlux > avgFlux * this.fluxSpikeMultiplier
                } : null;
            } catch (e) {
                features.spectral = null;
            }
        } else {
            features.spectral = null; // Graceful degradation
        }

        return features;
    }
```

### Task 1.4: ENHANCE `detectMusicalEvent()` with flux spike detection

**File:** `src/audio/advancedAnalyzer.js` - `detectMusicalEvent()`

**IMPORTANT**: Add flux spike check to the EXISTING drop detection logic, don't replace it:

```javascript
    // MODIFY existing detectMusicalEvent method
    detectMusicalEvent(features) {
        const event = {
            type: 'Steady',       // EXISTING: Keep capitalized names
            confidence: 0.5,
            details: {}
        };

        // EXISTING: Need history for trend detection (keep unchanged)
        if (this.featureHistory.length < 5) {
            return event;
        }

        // EXISTING: Get recent history (keep unchanged)
        const recent = this.featureHistory.slice(-5);
        const older = this.featureHistory.slice(0, 5);

        // EXISTING: Calculate trends (keep unchanged)
        const recentBass = recent.reduce((sum, f) => sum + (f.bass || 0), 0) / recent.length;
        const olderBass = older.reduce((sum, f) => sum + (f.bass || 0), 0) / older.length;
        const bassChange = recentBass - olderBass;

        const recentEnergy = recent.reduce((sum, f) => sum + (f.beatStrength || 0), 0) / recent.length;
        const olderEnergy = older.reduce((sum, f) => sum + (f.beatStrength || 0), 0) / older.length;
        const energyChange = recentEnergy - olderEnergy;

        // WARN-4 FIX: Combine flux spike with bass change instead of early return
        // This prevents false positives from transient sounds (hand clap, static)
        const hasFluxSpike = features.spectral?.isFluxSpike || false;
        const hasBassIncrease = bassChange > 0.2;

        // EXISTING: Detect drops - ENHANCED with flux spike as confidence booster
        if (features.bass > this.dropThreshold && hasBassIncrease && features.beatDetected) {
            event.type = 'Drop';
            event.confidence = Math.min(1.0, features.bass + bassChange);
            event.details.bassLevel = features.bass;
            event.details.impact = bassChange;

            // Flux spike boosts confidence but doesn't trigger alone
            if (hasFluxSpike) {
                event.confidence = Math.min(1.0, event.confidence + 0.2);
                event.details.fluxSpike = true;
                event.details.fluxImpact = features.spectral.flux / features.spectral.avgFlux;
            }
        }
        // ... EXISTING: rest of Buildup, Breakdown, Ambient, Peak detection (keep unchanged) ...

        return event;
    }
```

---

## Phase 2: Musical Timing & Intelligent Switching

> **Source**: Incorporates designs from [scene-based-preset-switching.md](../proposals/scene-based-preset-switching.md)

### Task 2.1: Add BPM and 16-beat phrase tracking to analyzer

**File:** `src/audio/advancedAnalyzer.js`

**Why 16 beats?** Musical phrases are typically 16 beats (4 bars). Switching on phrase boundaries creates more natural, musically coherent transitions.

```javascript
class AdvancedAudioAnalyzer {
  constructor(audioContext, source) {
    // ... existing code ...

    // BPM tracking
    this.detectedBPM = null;
    this.beatInterval = 500; // Default 120 BPM
    this.lastBeatTime = 0;
    this.beatPhase = 0;

    // Hierarchical timing: beat → bar → phrase
    this.beatPosition = 0;      // 0-3: beat within bar
    this.barPosition = 0;       // 0-3: bar within phrase
    this.phraseLength = 16;     // 16 beats = 4 bars = 1 phrase

    // Buildup tracking for pre-drop anticipation
    this.buildupHistory = [];
    this.BUILDUP_HISTORY_SIZE = 60; // ~1 second at 60fps
  }

  // CRIT-2 FIX: Implement _detectOnsets method (was missing)
  // Uses energy-based onset detection with adaptive threshold
  _detectOnsets(channelData, sampleRate) {
    const onsets = [];
    const windowSize = Math.floor(sampleRate * 0.01); // 10ms windows
    let prevEnergy = 0;
    const threshold = 1.5; // Energy must increase by 50%

    for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
      let energy = 0;
      for (let j = 0; j < windowSize; j++) {
        energy += channelData[i + j] ** 2;
      }
      energy /= windowSize;

      // Onset = significant energy increase above minimum threshold
      if (energy > prevEnergy * threshold && energy > 0.01) {
        onsets.push(i / sampleRate);
      }
      prevEnergy = energy;
    }
    return onsets;
  }

  // Detect BPM from audio buffer (call once when audio loads)
  // CRIT-2 FIX: Added graceful degradation when detection fails
  async detectBPM(audioBuffer) {
    if (!audioBuffer || audioBuffer.length === 0) {
      console.warn('[Analyzer] Empty audio buffer, BPM detection skipped');
      this.detectedBPM = null;
      return null;
    }

    try {
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;

      // Analyze onsets in 10-second chunks (or full buffer if shorter)
      const chunkSize = Math.min(sampleRate * 10, channelData.length);
      const onsets = this._detectOnsets(channelData.slice(0, chunkSize), sampleRate);

      // Need at least 4 onsets for reliable interval calculation
      if (onsets.length < 4) {
        console.warn('[Analyzer] Insufficient onsets for BPM detection, using fallback');
        this.detectedBPM = null;
        return null;
      }

      // Calculate intervals between onsets - use MEDIAN for robustness (not average)
      const intervals = [];
      for (let i = 1; i < onsets.length; i++) {
        intervals.push(onsets[i] - onsets[i-1]);
      }

      // Sort and take median (more robust than average against outliers)
      intervals.sort((a, b) => a - b);
      const medianInterval = intervals[Math.floor(intervals.length / 2)];

      this.detectedBPM = 60 / medianInterval;
      this.beatInterval = medianInterval * 1000;

      // Clamp to reasonable BPM range
      if (this.detectedBPM < 60) this.detectedBPM *= 2;
      if (this.detectedBPM > 180) this.detectedBPM /= 2;

      return this.detectedBPM;
    } catch (e) {
      console.warn('[Analyzer] BPM detection failed:', e.message);
      this.detectedBPM = null;
      return null;
    }
  }

  // Track beat, bar, and phrase position (call every frame)
  // WARN-1 FIX: Accept audioContextTime parameter for accurate sync
  trackBeatPhase(audioContextTime = null) {
    if (!this.detectedBPM) return null;

    // Prefer audioContext.currentTime (high-priority thread, no drift)
    // Fall back to performance.now() if not provided
    const now = audioContextTime !== null ?
        audioContextTime * 1000 : performance.now();
    const timeSinceLastBeat = now - this.lastBeatTime;

    if (timeSinceLastBeat >= this.beatInterval) {
      this.lastBeatTime = now - (timeSinceLastBeat % this.beatInterval);
      this.beatPosition = (this.beatPosition + 1) % 4;
      if (this.beatPosition === 0) {
        this.barPosition = (this.barPosition + 1) % 4;
      }
    }

    this.beatPhase = timeSinceLastBeat / this.beatInterval;
    const phrasePosition = (this.barPosition * 4) + this.beatPosition; // 0-15

    return {
      bpm: this.detectedBPM,
      beatPhase: this.beatPhase,
      beatPosition: this.beatPosition,        // 0-3: beat within bar
      barPosition: this.barPosition,          // 0-3: bar within phrase
      phrasePosition: phrasePosition,         // 0-15: beat within phrase
      isBarBoundary: this.beatPosition === 0 && this.beatPhase < 0.1,
      isPhraseBoundary: phrasePosition === 0 && this.beatPhase < 0.1
    };
  }
}
```

### Task 2.2: Add buildup detection for pre-drop anticipation

**File:** `src/audio/advancedAnalyzer.js`

```javascript
  // Detect if we're in a buildup leading to a drop
  detectBuildup(features) {
    this.buildupHistory.push({
      energy: features.energy || features.beatStrength || 0,
      spectralCentroid: features.spectralCentroid || 0,
      timestamp: performance.now()
    });

    if (this.buildupHistory.length > this.BUILDUP_HISTORY_SIZE) {
      this.buildupHistory.shift();
    }

    if (this.buildupHistory.length < 30) {
      return { isBuildup: false, confidence: 0, dropETA: null };
    }

    // Compare first half to second half - rising energy + brightness = buildup
    const midpoint = Math.floor(this.buildupHistory.length / 2);
    const firstHalf = this.buildupHistory.slice(0, midpoint);
    const secondHalf = this.buildupHistory.slice(midpoint);

    const firstAvgEnergy = firstHalf.reduce((s, h) => s + h.energy, 0) / firstHalf.length;
    const secondAvgEnergy = secondHalf.reduce((s, h) => s + h.energy, 0) / secondHalf.length;
    const firstAvgCentroid = firstHalf.reduce((s, h) => s + h.spectralCentroid, 0) / firstHalf.length;
    const secondAvgCentroid = secondHalf.reduce((s, h) => s + h.spectralCentroid, 0) / secondHalf.length;

    const energyRising = secondAvgEnergy > firstAvgEnergy + 0.1;
    const brightnessRising = secondAvgCentroid > firstAvgCentroid + 0.05;

    if (energyRising && brightnessRising && secondAvgEnergy > 0.5) {
      return {
        isBuildup: true,
        confidence: Math.min(1.0, (secondAvgEnergy - firstAvgEnergy) * 2),
        dropETA: this.beatInterval * 8, // ~2 bars until drop
        energyTrend: secondAvgEnergy - firstAvgEnergy
      };
    }

    return { isBuildup: false, confidence: 0, dropETA: null };
  }
```

### Task 2.3: Phrase-aligned switching in IntelligentPresetSelector

**File:** `src/intelligentPresetSelector.js`

> **CRIT-3 FIX**: Use existing method/property names from codebase:
> - `this.audioAnalyzer` (not `this.analyzer`)
> - `this.switchToPreset()` (not `_executeSwitch()`)
> - `this.shouldSwitchPreset()` (not `_shouldSwitch()`)

> **CRIT-4 FIX**: Added priority system to prevent race conditions between switch types.

```javascript
class IntelligentPresetSelector {
  // CRIT-3 FIX: Accept audioContext/audioSource for Meyda integration
  constructor(butterchurn, fingerprintDb, config = {}, audioContext = null, audioSource = null) {
    // ... existing code ...

    // CRIT-3 FIX: Store audio context for timing
    this.audioContext = audioContext;
    this.audioSource = audioSource;

    // Phrase-aligned switching (16 beats for musical coherence)
    this.pendingSwitchOnPhrase = false;
    this.pendingSwitchPreset = null;
    this.pendingSwitchHash = null;
    this.pendingSwitchReason = null;

    // Pre-drop anticipation
    this.preDropSwitchScheduled = false;
    this.preDropSwitchTime = null;
    this.PRE_DROP_LEAD_TIME = 1500; // Switch 1.5 seconds BEFORE drop
  }

  update(audioLevels) {
    // CRIT-3 FIX: Use existing property name
    const features = this.audioAnalyzer.calculateFeatures(audioLevels);

    // WARN-1 FIX: Pass audioContext.currentTime for accurate timing
    const audioTime = this.audioContext?.currentTime || null;
    const beatInfo = this.audioAnalyzer.trackBeatPhase ?
        this.audioAnalyzer.trackBeatPhase(audioTime) : null;
    const buildupInfo = this.audioAnalyzer.detectBuildup ?
        this.audioAnalyzer.detectBuildup(features) : { isBuildup: false };

    // CRIT-4 FIX: Priority-based switch handling
    // Priority 1 (HIGHEST): Pre-drop anticipation
    if (buildupInfo.isBuildup && buildupInfo.confidence > 0.7 && !this.preDropSwitchScheduled) {
      const dropTime = performance.now() + buildupInfo.dropETA;
      const switchTime = dropTime - this.PRE_DROP_LEAD_TIME;

      if (switchTime > performance.now()) {
        // Pre-drop CANCELS any pending phrase switch
        this.preDropSwitchScheduled = true;
        this.preDropSwitchTime = switchTime;
        this.pendingSwitchOnPhrase = false;  // Cancel lower priority

        const dropPreset = this._selectPresetForDrop(features);
        this.pendingSwitchPreset = dropPreset.preset;
        this.pendingSwitchHash = dropPreset.hash;
        this.pendingSwitchReason = 'pre_drop_anticipation';

        console.log(`[IPS] Pre-drop switch scheduled in ${(buildupInfo.dropETA - this.PRE_DROP_LEAD_TIME).toFixed(0)}ms`);
      }
    }

    // Priority 1 execution: Pre-drop switch at scheduled time
    if (this.preDropSwitchScheduled && performance.now() >= this.preDropSwitchTime) {
      // CRIT-3 FIX: Use existing method name
      this.switchToPreset(this.pendingSwitchHash);
      this.preDropSwitchScheduled = false;
      this.pendingSwitchOnPhrase = false;
      return { features, switched: true, reason: 'pre_drop_anticipation' };
    }

    // Priority 2: Execute pending phrase-aligned switch (16 beats)
    if (this.pendingSwitchOnPhrase && beatInfo?.isPhraseBoundary) {
      this.switchToPreset(this.pendingSwitchHash);
      this.pendingSwitchOnPhrase = false;
      return { features, switched: true, reason: this.pendingSwitchReason || 'phrase_boundary' };
    }

    // Priority 3: Performance degradation check (only if no pending switches)
    // (Integrated in Phase 4 below)

    // Priority 4 (LOWEST): Regular audio-triggered switch
    // Only queue if no higher-priority switch is pending
    if (!this.pendingSwitchOnPhrase && !this.preDropSwitchScheduled) {
      // CRIT-3 FIX: Use existing method name
      if (this.shouldSwitchPreset(features, Date.now() - this.lastSwitch)) {
        const { preset, hash, reason } = this.selectBestPresetWithLogic(features);

        if (beatInfo?.bpm) {
          // Queue for next PHRASE boundary (16 beats)
          this.pendingSwitchOnPhrase = true;
          this.pendingSwitchPreset = preset;
          this.pendingSwitchHash = hash;
          this.pendingSwitchReason = reason;

          const beatsToPhrase = 16 - beatInfo.phrasePosition;
          const msToPhrase = beatsToPhrase * this.audioAnalyzer.beatInterval;

          return {
            features,
            wantsSwitch: true,
            nextSwitch: msToPhrase,
            nextPreset: preset,
            reason: `Queued for phrase (${(msToPhrase/1000).toFixed(1)}s, beat ${beatInfo.phrasePosition + 1}/16)`
          };
        } else {
          // No BPM detected - switch immediately (graceful degradation)
          this.switchToPreset(hash);
          return { features, switched: true, newPreset: preset, reason };
        }
      }
    }

    return { features, switched: false };
  }

  // Select high-energy preset suitable for a drop
  _selectPresetForDrop(features) {
    const candidates = this.getCandidates(features);
    const dropCandidates = candidates.filter(hash => {
      const fp = this.db.presets[hash]?.fingerprint;
      return fp && fp.energy > 0.7 && (fp.bassEnergy || fp.bass) > 0.6;
    });

    if (dropCandidates.length > 0) {
      const hash = dropCandidates[Math.floor(Math.random() * dropCandidates.length)];
      return { hash, preset: this.db.presets[hash] };
    }
    return this.selectBestPresetWithLogic(features);
  }
}
```

---

## Phase 3: Mood-Aware Selection

### Task 3.1: Add mood detection to analyzer

**File:** `src/audio/advancedAnalyzer.js`

> **CRIT-5 FIX**: Use actual property names from analyzer output:
> - `treble` (not `treb`)
> - `beatStrength` (not `vol`) - volume-invariant, normalized 0-1

```javascript
detectMood(features) {
  if (!features.spectral) return { label: 'neutral', confidence: 0.5 };

  // CRIT-5 FIX: Use actual property names from calculateFeatures()
  const { bass, mid, treble, beatStrength } = features;
  const { centroid, flatness, sharpness } = features.spectral;

  // Use normalized energy (beatStrength) instead of absolute volume
  // This makes mood detection volume-invariant
  const energy = beatStrength || 0;

  let mood = { label: 'neutral', confidence: 0.5 };

  // High energy + bass = aggressive (volume-invariant)
  if (bass > 0.7 && energy > 0.6 && (sharpness || 0) > 0.5) {
    mood = { label: 'aggressive', confidence: 0.7 + (bass * 0.3) };
  }
  // Low energy + low brightness = relaxed
  else if (energy < 0.3 && centroid < 0.4 && (flatness || 0) < 0.3) {
    mood = { label: 'relaxed', confidence: 0.6 + ((1 - energy) * 0.3) };
  }
  // High brightness + mid energy = happy
  else if (centroid > 0.6 && treble > 0.5 && energy > 0.4) {
    mood = { label: 'happy', confidence: 0.6 + (centroid * 0.2) };
  }
  // High flatness = electronic
  else if ((flatness || 0) > 0.5 && bass > 0.5) {
    mood = { label: 'electronic', confidence: 0.6 + ((flatness || 0) * 0.3) };
  }
  // Low flatness + mid-focused = acoustic
  else if ((flatness || 0) < 0.25 && mid > bass && mid > treble) {
    mood = { label: 'acoustic', confidence: 0.55 };
  }

  return mood;
}
```

### Task 3.2: MODIFY existing `scorePreset()` to add mood scoring

**File:** `src/intelligentPresetSelector.js` - `scorePreset()` (lines 1246-1288)

**EXISTING CODE** (lines 1246-1288) - current scoring:
```javascript
scorePreset(hash, features) {
    // Energy match (most important)
    const energyDiff = Math.abs(fp.energy - features.energy);
    score += (1 - energyDiff) * this.weights.energyMatch;  // 0.3

    // Bass reactivity match
    if (features.bassEnergy > 0.6 && fp.bass > 0.6) {
        score += this.weights.bassMatch;  // 0.15
    }

    // Visual continuity
    if (this.currentHash) { ... }  // this.weights.continuity (0.1)

    // Performance consideration
    score += (fp.fps / 60) * this.weights.performance;  // 0.1

    // Variety bonus
    if (fp.styles && fp.styles.length > 0) { ... }  // this.weights.variety (0.05)
}
```

**MODIFY** to add mood, BPM, and spectral scoring (ADD to existing, don't replace):

```javascript
    // MODIFY: Add mood parameter to method signature
    scorePreset(hash, features, mood = null) {
        const preset = this.db.presets[hash];
        if (!preset || !preset.fingerprint) {
            return 0;
        }

        const fp = preset.fingerprint;
        let score = 0;

        // EXISTING: Energy match (REDUCE from 0.3 to 0.25)
        const energyDiff = Math.abs(fp.energy - features.energy);
        score += (1 - energyDiff) * 0.25;

        // EXISTING: Bass reactivity match (keep at 0.15)
        if (features.bassEnergy > 0.6 && (fp.bass || fp.bassEnergy) > 0.6) {
            score += 0.15;
        } else if (features.bassEnergy < 0.3 && (fp.bass || fp.bassEnergy) < 0.3) {
            score += 0.075;
        }

        // NEW: Mood affinity (15%)
        // CRIT-8 FIX: Validate moodAffinities has meaningful variation
        if (mood && mood.label && fp.moodAffinities) {
            const moodScore = fp.moodAffinities[mood.label];
            if (moodScore !== undefined) {
                // Only use if moodAffinities shows meaningful variation (not all 0.5)
                const values = Object.values(fp.moodAffinities).map(v => parseFloat(v) || 0.5);
                const variance = values.reduce((s, v) => s + (v - 0.5) ** 2, 0) / values.length;
                if (variance > 0.01) {  // Has meaningful variation
                    score += moodScore * mood.confidence * 0.15;
                }
            }
        }

        // NEW: BPM range match (10%)
        // WARN-3 FIX: Clamp at 0 to prevent negative scores
        if (this.audioAnalyzer && this.audioAnalyzer.detectedBPM && fp.optimalBpm) {
            const bpm = this.audioAnalyzer.detectedBPM;
            if (bpm >= fp.optimalBpm.min && bpm <= fp.optimalBpm.max) {
                const distFromIdeal = Math.abs(bpm - fp.optimalBpm.ideal);
                const rangeSize = (fp.optimalBpm.max - fp.optimalBpm.min) / 2;
                // WARN-3 FIX: Clamp at 0 - never subtract from score
                score += Math.max(0, 1 - distFromIdeal / rangeSize) * 0.10;
            }
            // Outside optimal range: no bonus, but don't penalize
        }

        // CRIT-7 FIX: REMOVED spectralProfile matching
        // Presets don't have intrinsic spectral profiles - they REACT to audio.
        // Instead, match audio spectral features to preset's reactive properties:
        if (features.spectral && fp.bassEnergy !== undefined) {
            // High bass audio + high bass preset = good match
            const bassMatch = 1 - Math.abs((features.bass || 0) - (fp.bassEnergy || 0));
            score += bassMatch * 0.10;
        }

        // EXISTING: Visual continuity (keep at 0.10)
        if (this.currentHash) {
            const currentFp = this.db.presets[this.currentHash]?.fingerprint;
            if (currentFp) {
                const complexityDiff = Math.abs(fp.complexity - currentFp.complexity);
                score += (1 - complexityDiff) * 0.10;
            }
        }

        // EXISTING: Performance consideration (keep at 0.10)
        score += (fp.fps / 60) * 0.10;

        // EXISTING: Variety bonus (keep at 0.05)
        if (fp.styles && fp.styles.length > 0) {
            if (features.isDrop && fp.styles.includes('particle')) {
                score += 0.05;
            } else if (features.isChill && fp.styles.includes('organic')) {
                score += 0.05;
            }
        }

        return score;
    }
```

### Task 3.3: MODIFY `selectBestPresetWithLogic()` to pass mood

**File:** `src/intelligentPresetSelector.js` - `selectBestPresetWithLogic()` (lines 1072-1127)

**MODIFY** line 1093 to detect mood and pass it to scorePreset:

```javascript
    selectBestPresetWithLogic(features) {
        // ... existing candidate selection code ...

        // NEW: Detect current mood
        const mood = this.audioAnalyzer ? this.audioAnalyzer.detectMood(features) : null;

        // MODIFY: Pass mood to scorePreset
        const scored = candidates.map(hash => ({
            hash,
            preset: this.db.presets[hash],
            score: this.scorePreset(hash, features, mood)  // ADD mood parameter
        }));

        // ... rest of existing selection logic ...
    }
```

---

## Phase 4: Preset Performance Degradation Tracking

> **Source**: Section B from [scene-based-preset-switching.md](../proposals/scene-based-preset-switching.md)

### Concept

Instead of only switching based on audio changes, also track how well the **current preset matches the ongoing audio**. If match quality degrades over time (e.g., a calm preset during high-energy audio), trigger a switch.

### Task 4.1: Add PresetPerformanceTracker class

**File:** `src/intelligentPresetSelector.js` (or new file `src/presetPerformanceTracker.js`)

> **CRIT-6 FIX**: Tracker now accepts pre-calculated scores from `scorePreset()` instead of
> having its own scoring logic. This eliminates conflicting sources of truth.
>
> **WARN-6 FIX**: Uses first 30 scores for baseline instead of single initial value.

```javascript
/**
 * Tracks how well the current preset matches ongoing audio.
 * Triggers switch when match quality degrades below threshold.
 *
 * CRIT-6 FIX: Does NOT compute its own scores - accepts scores from scorePreset()
 */
class PresetPerformanceTracker {
    constructor(config = {}) {
        this.scoreHistory = [];
        this.maxHistorySize = config.maxHistorySize || 60;  // ~1 second at 60fps
        this.degradationThreshold = config.degradationThreshold || 0.4;  // 40% drop triggers switch

        // WARN-6 FIX: Use first N scores for stable baseline (not single value)
        this.baselineScores = [];
        this.BASELINE_SIZE = 30;  // First 0.5 seconds for baseline
    }

    /**
     * Update performance tracking with score from scorePreset()
     * CRIT-6 FIX: Accepts pre-calculated score, doesn't compute its own
     *
     * @param {number} currentScore - Score from main scorePreset() function
     * @returns {Object} { shouldSwitch, degradation, reason }
     */
    update(currentScore) {
        if (currentScore === undefined || currentScore === null) {
            return { shouldSwitch: false, degradation: 0, reason: null };
        }

        // WARN-6 FIX: Build baseline from first N scores (more stable than single value)
        if (this.baselineScores.length < this.BASELINE_SIZE) {
            this.baselineScores.push(currentScore);
            return { shouldSwitch: false, degradation: 0, reason: 'building_baseline' };
        }

        // Track ongoing score history
        this.scoreHistory.push(currentScore);
        if (this.scoreHistory.length > this.maxHistorySize) {
            this.scoreHistory.shift();
        }

        // Need enough history to detect degradation
        if (this.scoreHistory.length < 30) {
            return { shouldSwitch: false, degradation: 0, reason: null };
        }

        // Calculate baseline from first N scores (stable reference point)
        const baseline = this.baselineScores.reduce((a, b) => a + b, 0) /
                         this.baselineScores.length;

        // Calculate current average score
        const current = this.scoreHistory.reduce((a, b) => a + b, 0) /
                        this.scoreHistory.length;

        // Calculate degradation from baseline
        const degradation = baseline > 0 ? (baseline - current) / baseline : 0;

        if (degradation > this.degradationThreshold) {
            return {
                shouldSwitch: true,
                degradation: degradation,
                reason: `performance_degraded_${(degradation * 100).toFixed(0)}%`,
                baseline: baseline,
                current: current
            };
        }

        return { shouldSwitch: false, degradation, baseline, current };
    }

    /**
     * Reset tracking (call when switching presets)
     */
    reset() {
        this.scoreHistory = [];
        this.baselineScores = [];
    }
}
```

### Task 4.2: Integrate performance tracking into update loop

**File:** `src/intelligentPresetSelector.js`

> **CRIT-6 FIX**: Performance tracker now uses scores from `scorePreset()`,
> not its own internal scoring. This ensures single source of truth.

```javascript
class IntelligentPresetSelector {
    constructor(butterchurn, fingerprintDb, config = {}) {
        // ... existing code ...

        // Performance degradation tracking
        this.performanceTracker = new PresetPerformanceTracker({
            maxHistorySize: 60,
            degradationThreshold: 0.4  // Switch at 40% degradation
        });

        // Track current preset's ongoing score for performance monitoring
        this.currentPresetScore = 0;
    }

    update(audioLevels) {
        // CRIT-3 FIX: Use existing property name
        const features = this.audioAnalyzer.calculateFeatures(audioLevels);

        // ... existing beatInfo, buildupInfo logic ...

        // PERFORMANCE DEGRADATION CHECK
        // CRIT-6 FIX: Use score from scorePreset(), not internal calculation
        if (this.currentHash && !this.pendingSwitchOnPhrase && !this.preDropSwitchScheduled) {
            // Calculate score using the SAME function used for selection
            const mood = this.audioAnalyzer.detectMood ?
                this.audioAnalyzer.detectMood(features) : null;
            this.currentPresetScore = this.scorePreset(this.currentHash, features, mood);

            // Pass pre-calculated score to tracker
            const perfResult = this.performanceTracker.update(this.currentPresetScore);

            if (perfResult.shouldSwitch) {
                console.log(`[IPS] Performance degraded ${(perfResult.degradation * 100).toFixed(0)}% - triggering switch`);
                console.log(`[IPS] Baseline: ${perfResult.baseline?.toFixed(3)}, Current: ${perfResult.current?.toFixed(3)}`);

                // Queue switch at next phrase boundary
                const { preset, hash } = this.selectBestPresetWithLogic(features);
                this.pendingSwitchOnPhrase = true;
                this.pendingSwitchPreset = preset;
                this.pendingSwitchHash = hash;
                this.pendingSwitchReason = perfResult.reason;
            }
        }

        // ... rest of existing update logic ...
    }

    switchToPreset(hash) {
        // ... existing switch logic ...

        // Reset performance tracking when switching
        this.performanceTracker.reset();
    }
}
```

### Task 4.3: Add performance stats to debug output

**File:** `src/intelligentPresetSelector.js` - `getDebugInfo()`

```javascript
getDebugInfo() {
    return {
        // ... existing debug info ...

        // NEW: Performance tracking
        performance: {
            currentScore: this.performanceTracker.scoreHistory.slice(-1)[0] || 0,
            initialScore: this.performanceTracker.initialScore,
            degradation: this.performanceTracker.initialScore
                ? (this.performanceTracker.initialScore -
                   (this.performanceTracker.scoreHistory.slice(-1)[0] || 0)) /
                  this.performanceTracker.initialScore
                : 0,
            historyLength: this.performanceTracker.scoreHistory.length
        }
    };
}
```

---

## Phase 5: Enhanced Fingerprints

### EXISTING Functions to Reuse (tools/generate-fingerprints.js)

| Function | Lines | Reuse Strategy |
|----------|-------|----------------|
| `generateContentHash(preset)` | 55-75 | **REUSE** - no changes |
| `analyzeEnergy(preset)` | 158-188 | **REUSE** - no changes |
| `analyzeBassReactivity(preset)` | 193-206 | **REUSE** - use as `bassEnergy` |
| `analyzeTrebleReactivity(preset)` | 211-229 | **REUSE** - use as `trebleEnergy` |
| `analyzeBeatSync(preset)` | 234-249 | **REUSE** - no changes |
| `analyzeComplexity(preset)` | 255-279 | **REUSE** - no changes |
| `estimatePerformance(preset)` | 284-311 | **REUSE** - no changes |
| `detectVisualStyle(preset)` | 316-347 | **EXTEND** - keep existing, add CLIP scores |
| `getAllEquations(preset)` | 352-362 | **REUSE** - no changes |
| `generateFingerprint(preset)` | 367-377 | **EXTEND** - add new fields |

### Extended Schema (v2.0.0)

> **CRIT-7 FIX**: Removed `spectralProfile` - presets don't have intrinsic spectral profiles.
> **CRIT-8 FIX**: Added `experimental` flag for heuristic-generated fields.
> **CRIT-9 FIX**: All v1.0 fields preserved; v2.0 fields are optional (graceful degradation).

```json
{
  "version": "2.0.0",
  "presets": {
    "abc12345": {
      "hash": "abc12345",
      "authors": ["Artist"],
      "names": ["Preset Name"],
      "fingerprint": {
        // EXISTING v1.0 fields (ALWAYS present - backward compatible):
        "energy": 0.6,
        "bassEnergy": 0.4,       // Note: existing code uses both "bass" and "bassEnergy"
        "trebleEnergy": 0.625,
        "complexity": 0.15,
        "beatSync": 1,
        "fps": 60,
        "styles": ["particle", "organic"],  // Keep for backward compat

        // NEW v2.0: Visual style (from CLIP classifier - most reliable)
        "visualStyle": "fluid_organic",
        "visualStyleScores": {
          "fluid_organic": 0.85,
          "particle": 0.45,
          "geometric": 0.20,
          "fractal": 0.15
        },

        // NEW v2.0: Color and motion (from equation analysis)
        // CRIT-8: Marked as experimental - heuristic-based
        "colorProfile": "warm",
        "motionSpeed": "medium",
        "_experimental": ["colorProfile", "motionSpeed", "moodAffinities"],

        // NEW v2.0: Mood affinities (derived from style + motion)
        // CRIT-8: Validated before use - skip if variance < 0.01
        "moodAffinities": {
          "aggressive": 0.3,
          "relaxed": 0.7,
          "happy": 0.5,
          "electronic": 0.6,
          "acoustic": 0.4
        },

        // NEW v2.0: Optimal BPM range (derived from motionSpeed + energy)
        "optimalBpm": {
          "min": 90,
          "max": 130,
          "ideal": 110
        }

        // CRIT-7 FIX: REMOVED spectralProfile
        // Presets don't have intrinsic spectral profiles - they REACT to audio.
        // Audio matching should use preset's reactive properties (bassEnergy, etc.)
      }
    }
  }
}
```

### Backward Compatibility (CRIT-9 FIX)

Scoring functions MUST handle missing v2.0 fields gracefully:

```javascript
// In scorePreset() - handle v1.0 fingerprints without v2.0 fields:
scorePreset(hash, features, mood = null) {
    const fp = this.db.presets[hash]?.fingerprint;
    if (!fp) return 0;

    let score = 0;

    // v1.0 fields (always present)
    const energyDiff = Math.abs((fp.energy || 0.5) - (features.energy || 0.5));
    score += (1 - energyDiff) * 0.25;

    // v2.0 fields (optional - graceful degradation)
    if (mood?.label && fp.moodAffinities?.[mood.label]) {
        // Validation: only use if moodAffinities has meaningful variation
        const values = Object.values(fp.moodAffinities).map(v => parseFloat(v) || 0.5);
        const variance = values.reduce((s, v) => s + (v - 0.5) ** 2, 0) / values.length;
        if (variance > 0.01) {
            score += fp.moodAffinities[mood.label] * mood.confidence * 0.15;
        }
    }

    // ... rest of scoring with optional field checks ...

    return score;
}
```

### Task 4.1: ADD new helper functions (don't modify existing)

**File:** `tools/generate-fingerprints.js` - ADD these functions after existing analysis functions:

```javascript
function extractColorProfile(preset) {
  const equations = (preset.init_eqs_eel || '') + (preset.frame_eqs_eel || '');

  const redUsage = (equations.match(/red\s*=/gi) || []).length;
  const greenUsage = (equations.match(/green\s*=/gi) || []).length;
  const blueUsage = (equations.match(/blue\s*=/gi) || []).length;

  let dominant = 'neutral';
  if (redUsage > greenUsage && redUsage > blueUsage) dominant = 'warm';
  if (blueUsage > redUsage && blueUsage > greenUsage) dominant = 'cool';
  if (greenUsage > redUsage && greenUsage > blueUsage) dominant = 'nature';

  return dominant;
}

function extractMotionSpeed(preset, energy) {
  const frameEqs = preset.frame_eqs_eel || '';
  const complexity = frameEqs.length / 1000;

  if (complexity > 5 || energy > 0.7) return 'fast';
  if (complexity > 2 || energy > 0.4) return 'medium';
  return 'slow';
}

function calculateOptimalBpm(motionSpeed, energy) {
  const ranges = {
    slow: { min: 60, max: 100, ideal: 80 },
    medium: { min: 100, max: 140, ideal: 120 },
    fast: { min: 130, max: 180, ideal: 150 }
  };

  const base = ranges[motionSpeed];
  const energyOffset = (energy - 0.5) * 20;

  return {
    min: Math.round(base.min + energyOffset),
    max: Math.round(base.max + energyOffset),
    ideal: Math.round(base.ideal + energyOffset)
  };
}

function deriveMoodAffinities(visualStyle, motionSpeed, colorProfile) {
  const affinities = {
    aggressive: 0.5,
    relaxed: 0.5,
    happy: 0.5,
    electronic: 0.5,
    acoustic: 0.5
  };

  // Style influences
  const styleBoosts = {
    fluid_organic: { relaxed: 0.3, acoustic: 0.2 },
    particle: { electronic: 0.4, happy: 0.1 },
    geometric: { electronic: 0.3, aggressive: 0.1 },
    fractal: { electronic: 0.2, relaxed: 0.1 },
    tunnel: { aggressive: 0.2, electronic: 0.3 }
  };

  if (styleBoosts[visualStyle]) {
    for (const [mood, boost] of Object.entries(styleBoosts[visualStyle])) {
      affinities[mood] = Math.min(1, affinities[mood] + boost);
    }
  }

  // Motion speed influences
  if (motionSpeed === 'fast') {
    affinities.aggressive += 0.2;
    affinities.relaxed -= 0.2;
  } else if (motionSpeed === 'slow') {
    affinities.relaxed += 0.2;
    affinities.aggressive -= 0.2;
  }

  // Normalize
  return Object.fromEntries(
    Object.entries(affinities).map(([k, v]) => [k, Math.max(0, Math.min(1, v)).toFixed(2)])
  );
}
```

### Task 4.2: EXTEND existing `generateFingerprint()` method

**File:** `tools/generate-fingerprints.js` - MODIFY `generateFingerprint()` (lines 367-377)

**EXISTING** method returns:
```javascript
generateFingerprint(preset) {
    return {
        energy: this.analyzeEnergy(preset),
        bass: this.analyzeBassReactivity(preset),      // Note: key is "bass"
        beat: this.analyzeBeatSync(preset),
        complexity: this.analyzeComplexity(preset),
        fps: this.estimatePerformance(preset),
        styles: this.detectVisualStyle(preset),
        warmupTime: this.calculateWarmupTime(preset)
    };
}
```

**MODIFY** to include new fields (keep all existing, add new):

> **CRIT-7 FIX**: Removed spectralProfile from output.
> **CRIT-8 FIX**: Added `_experimental` marker for heuristic fields.

```javascript
generateFingerprint(preset, visualStyleFromCLIP = null) {
    // EXISTING: Keep all original analysis
    const energy = this.analyzeEnergy(preset);
    const bassEnergy = this.analyzeBassReactivity(preset);  // Rename for clarity
    const trebleEnergy = this.analyzeTrebleReactivity(preset);

    // NEW: Extract additional characteristics
    const colorProfile = extractColorProfile(preset);
    const motionSpeed = extractMotionSpeed(preset, energy);
    const optimalBpm = calculateOptimalBpm(motionSpeed, energy);

    // NEW: Determine visual style (prefer CLIP result if available)
    const existingStyles = this.detectVisualStyle(preset);
    const visualStyle = visualStyleFromCLIP?.visualStyle || existingStyles[0] || 'abstract';
    const visualStyleScores = visualStyleFromCLIP?.visualStyleScores || null;

    // NEW: Derive mood affinities from characteristics
    const moodAffinities = deriveMoodAffinities(visualStyle, motionSpeed, colorProfile);

    return {
        // EXISTING v1.0 fields (keep all - backward compat):
        energy: energy,
        bassEnergy: bassEnergy,         // Changed from "bass" for clarity
        trebleEnergy: trebleEnergy,
        complexity: this.analyzeComplexity(preset),
        beatSync: this.analyzeBeatSync(preset),  // Changed from "beat"
        fps: this.estimatePerformance(preset),
        styles: existingStyles,          // Keep for backward compat
        warmupTime: this.calculateWarmupTime(preset),

        // NEW v2.0 fields:
        visualStyle: visualStyle,
        visualStyleScores: visualStyleScores,
        colorProfile: colorProfile,
        motionSpeed: motionSpeed,
        moodAffinities: moodAffinities,
        optimalBpm: optimalBpm,

        // CRIT-8 FIX: Mark heuristic-based fields as experimental
        // These should be validated before use in scoring
        _experimental: ['colorProfile', 'motionSpeed', 'moodAffinities']

        // CRIT-7 FIX: REMOVED spectralProfile
        // Presets don't have intrinsic spectral profiles - meaningless to add defaults
    };
}
```

### Task 4.3: Update database version

**File:** `tools/generate-fingerprints.js` - Update version in constructor:

```javascript
this.database = {
    version: "2.0.0",  // CHANGE from "1.0.0"
    // ... rest unchanged
};
```

---

## Phase 6: Visual Style ML Tagging

### Python Dependencies (WARN-5 FIX)

**File:** `tools/requirements.txt`

```txt
# Visual style classification dependencies
torch>=2.0.0
clip @ git+https://github.com/openai/CLIP.git
pillow>=9.0.0
tqdm>=4.64.0

# Installation:
# pip install -r tools/requirements.txt
#
# Note: CLIP requires PyTorch. For GPU support:
# pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118
```

### Task 5.1: Create preset frame renderer

**File:** `tools/render-preset-frames.js`

```javascript
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function renderPresetFrames(presetPack, outputDir) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Load butterchurn test page
  await page.goto('file://' + path.resolve('test.html'));

  const presetNames = Object.keys(presetPack);

  for (const name of presetNames) {
    // Load preset
    await page.evaluate((presetName) => {
      visualizer.loadPreset(presets[presetName], 0);
    }, name);

    // Render 5 frames over 3 seconds with test audio
    for (let t = 0; t < 5; t++) {
      await page.waitForTimeout(600);
      await page.screenshot({
        path: `${outputDir}/${name.replace(/[^a-z0-9]/gi, '_')}_${t}.png`,
        clip: { x: 0, y: 0, width: 512, height: 512 }
      });
    }
  }

  await browser.close();
}
```

### Task 5.2: Create CLIP classifier

**File:** `tools/classify-visual-style.py`

```python
import torch
import clip
from PIL import Image
import json
import os
from pathlib import Path

device = "cuda" if torch.cuda.is_available() else "cpu"
model, preprocess = clip.load("ViT-B/32", device=device)

CATEGORIES = [
    "fluid organic flowing water pattern",
    "particle sparkle dot effect",
    "geometric shapes lines triangles",
    "fractal recursive mathematical pattern",
    "abstract color field gradient",
    "kaleidoscope mirror symmetry",
    "tunnel depth perspective zoom",
    "waveform oscilloscope audio"
]

CATEGORY_KEYS = [
    "fluid_organic", "particle", "geometric", "fractal",
    "abstract", "kaleidoscope", "tunnel", "waveform"
]

def classify_preset(frame_paths):
    all_scores = {cat: [] for cat in CATEGORY_KEYS}

    for frame_path in frame_paths:
        image = preprocess(Image.open(frame_path)).unsqueeze(0).to(device)
        text = clip.tokenize(CATEGORIES).to(device)

        with torch.no_grad():
            image_features = model.encode_image(image)
            text_features = model.encode_text(text)
            similarity = (image_features @ text_features.T).softmax(dim=-1)

        for i, cat in enumerate(CATEGORY_KEYS):
            all_scores[cat].append(similarity[0][i].item())

    # Average across frames
    avg_scores = {cat: sum(scores)/len(scores) for cat, scores in all_scores.items()}
    primary = max(avg_scores, key=avg_scores.get)

    return {
        "visualStyle": primary,
        "visualStyleScores": {k: round(v, 3) for k, v in avg_scores.items()}
    }

def process_all_presets(frames_dir, output_file):
    results = {}

    # Group frames by preset
    presets = {}
    for f in Path(frames_dir).glob("*.png"):
        preset_name = "_".join(f.stem.split("_")[:-1])
        if preset_name not in presets:
            presets[preset_name] = []
        presets[preset_name].append(str(f))

    for preset_name, frames in presets.items():
        results[preset_name] = classify_preset(frames)
        print(f"Classified: {preset_name} -> {results[preset_name]['visualStyle']}")

    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    import sys
    frames_dir = sys.argv[1]
    output_file = sys.argv[2]
    process_all_presets(frames_dir, output_file)
```

### Task 5.3: Batch processing script

**File:** `tools/generate-enhanced-fingerprints.sh`

```bash
#!/bin/bash
set -e

PRESET_PACK="alaskaButter"
OUTPUT_DIR="./fingerprint-generation"

mkdir -p "$OUTPUT_DIR/frames"

echo "=== Step 1: Render preset frames ==="
node tools/render-preset-frames.js \
  --input "presets/alaska-butter/${PRESET_PACK}.json" \
  --output "$OUTPUT_DIR/frames"

echo "=== Step 2: Classify visual styles with CLIP ==="
python tools/classify-visual-style.py \
  "$OUTPUT_DIR/frames" \
  "$OUTPUT_DIR/visual-styles.json"

echo "=== Step 3: Generate enhanced fingerprints ==="
node tools/generate-fingerprints.js \
  --input "presets/alaska-butter/${PRESET_PACK}.json" \
  --visual-styles "$OUTPUT_DIR/visual-styles.json" \
  --output "presets/alaska-butter/${PRESET_PACK}.fingerprints.json" \
  --version "2.0.0"

echo "=== Step 4: Minify and deploy to CDN ==="
npx terser "presets/alaska-butter/${PRESET_PACK}.fingerprints.json" \
  -o "docs/cdn/presets/${PRESET_PACK}.fingerprints.min.json"

echo "=== Done! ==="
```

---

## Phase 7: Documentation Update

### Task 6.1: Update CLAUDE.md

**File:** `CLAUDE.md`

Add to "Current Features" section:
- Enhanced audio analysis with Meyda.js spectral features
- BPM detection and bar-aligned preset switching
- Mood-aware preset selection
- ML-based visual style fingerprinting

### Task 6.2: Update Mathematical Fingerprinting Docs

**File:** `docs/architecture/mathematical-fingerprinting.md`

Add documentation for new fingerprint fields:
- `visualStyle` - CLIP-classified visual category
- `visualStyleScores` - Confidence scores for each category
- `moodAffinities` - Preset-mood compatibility scores
- `optimalBpm` - Recommended BPM range (min, max, ideal)
- `spectralProfile` - Expected spectral characteristics
- `colorProfile` - Dominant color temperature
- `motionSpeed` - Visual motion speed (slow/medium/fast)

### Task 6.3: Update Architecture Docs

**File:** `docs/architecture/README.md`

Document:
- Meyda.js integration in audio pipeline
- BPM tracking and bar boundary detection
- Mood detection algorithm
- Enhanced scoring formula with new weights

### Task 6.4: Update README.md

**File:** `README.md`

Add to features:
- "BPM-synced preset switching for musical transitions"
- "Mood-aware selection matches audio energy to visuals"
- "ML-classified visual styles for better matching"

### Task 6.5: Update Advanced Features Plan

**File:** `docs/plans/advanced-features.md`

Mark completed items:
- [x] Enhanced audio analysis (Meyda.js)
- [x] BPM detection
- [x] Mood-aware selection
- [x] Enhanced fingerprints v2.0
- [x] Visual style ML tagging

---

## Implementation Order

1. **Phase 1** - Enhanced Audio Analysis (Meyda.js integration)
2. **Phase 2** - Musical Timing & Switching (16-beat phrases, pre-drop anticipation)
3. **Phase 3** - Mood-Aware Selection (mood detection, scoring weights)
4. **Phase 4** - Preset Performance Tracking (degradation detection)
5. **Phase 5** - Enhanced Fingerprints (v2.0 schema, new fields)
6. **Phase 6** - Visual Style ML Tagging (CLIP classifier)
7. **Phase 7** - Documentation Update
8. **Build & Deploy** - `npm run build:cdn`

---

## Wiring Requirements

### Critical Integration Points

> **CRIT-3 FIX**: All wiring uses existing property/method names from codebase.

These connections must be explicitly implemented - the code snippets above don't show all wiring:

#### 1. Meyda Initialization Wiring

**File:** `src/intelligentPresetSelector.js` - constructor

```javascript
// CRIT-3 FIX: Use existing property name (audioAnalyzer) and accept audio context
constructor(butterchurn, fingerprintDb, config = {}, audioContext = null, audioSource = null) {
  // ... existing code ...

  // Store audio context for timing and Meyda
  this.audioContext = audioContext;
  this.audioSource = audioSource;

  // Initialize enhanced analyzer with Meyda (if audio context provided)
  // CRIT-3 FIX: Use existing property name
  if (AdvancedAudioAnalyzer && audioContext && audioSource) {
    this.audioAnalyzer = new AdvancedAudioAnalyzer(analyzerConfig, audioContext, audioSource);
  }
}
```

#### 2. BPM Detection Trigger

**File:** `src/intelligentPresetSelector.js` - needs new method

```javascript
// Call this when audio file loads (from client code)
// CRIT-3 FIX: Use existing property name (audioAnalyzer)
async onAudioLoaded(audioBuffer) {
  if (this.audioAnalyzer && audioBuffer) {
    try {
      const bpm = await this.audioAnalyzer.detectBPM(audioBuffer);
      console.log(`[IPS] Detected BPM: ${bpm}`);
    } catch (e) {
      console.warn('[IPS] BPM detection failed, using immediate switching');
      // Graceful degradation: phrase-aligned switching disabled, immediate switching used
    }
  }
}
```

**Client wiring (alaska-butter test.html):**
```javascript
// When audio file is loaded
audioElement.addEventListener('loadeddata', async () => {
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  presetSelector.onAudioLoaded(audioBuffer);
});
```

#### 3. Mood Detection Wiring

**File:** `src/intelligentPresetSelector.js` - update() method

```javascript
// CRIT-3 FIX: Use existing property names throughout
update(audioLevels) {
  const features = this.audioAnalyzer.calculateFeatures(audioLevels);

  // WARN-1 FIX: Pass audioContext.currentTime for accurate timing
  const audioTime = this.audioContext?.currentTime || null;
  const beatInfo = this.audioAnalyzer.trackBeatPhase ?
      this.audioAnalyzer.trackBeatPhase(audioTime) : null;

  // NEW: Get current mood for scoring
  const mood = this.audioAnalyzer.detectMood ?
      this.audioAnalyzer.detectMood(features) : null;

  // ... existing switch logic ...

  // CRIT-3 FIX: Use existing method name
  if (this.shouldSwitchPreset(features, Date.now() - this.lastSwitch)) {
    // Pass mood to scoring
    const { preset, hash, reason } = this.selectBestPresetWithLogic(features, mood);
    // ...
  }
}

// Update selectBestPresetWithLogic to accept mood
selectBestPresetWithLogic(features, mood) {
  const candidates = this.getCandidates(features);

  // Score each candidate with mood
  const scored = candidates.map(hash => ({
    hash,
    score: this.scorePreset(hash, features, mood)  // Pass mood here
  }));

  // ... rest of selection logic ...
}
```

#### 4. Meyda Cleanup

**File:** `src/audio/advancedAnalyzer.js`

```javascript
destroy() {
  if (this.meydaAnalyzer) {
    this.meydaAnalyzer.stop();
    this.meydaAnalyzer = null;
  }
  this.fluxHistory = [];
  this.buildupHistory = [];
}
```

**File:** `src/intelligentPresetSelector.js`

```javascript
// CRIT-3 FIX: Use existing property name
destroy() {
  if (this.audioAnalyzer?.destroy) {
    this.audioAnalyzer.destroy();
  }
  if (this.performanceTracker) {
    this.performanceTracker.reset();
  }
  // ... existing cleanup ...
}
```

#### 5. Enhanced Fingerprint Loading

**File:** Client code (alaska-butter)

```javascript
// Update CDN URL to fetch v2.0 fingerprints
const fingerprintUrl = 'https://geeks-accelerator.github.io/butterchurn/cdn/presets/alaskaButter.fingerprints.min.json';

// Fingerprint schema version check
fetch(fingerprintUrl)
  .then(r => r.json())
  .then(db => {
    if (db.version !== '2.0.0') {
      console.warn('Fingerprint schema version mismatch');
    }
    presetSelector = new IntelligentPresetSelector(visualizer, db);
  });
```

---

## Testing

### Unit Tests

**File:** `test/advancedAnalyzer.test.js`

```javascript
describe('AdvancedAudioAnalyzer', () => {
  describe('Meyda Integration', () => {
    it('should initialize Meyda analyzer with correct features', () => {
      const analyzer = new AdvancedAudioAnalyzer(mockAudioContext, mockSource);
      expect(analyzer.meydaAnalyzer).toBeDefined();
    });

    it('should return spectral features from calculateFeatures()', () => {
      const features = analyzer.calculateFeatures(mockFreqData, mockTimeData);
      expect(features.spectral).toBeDefined();
      expect(features.spectral.centroid).toBeGreaterThanOrEqual(0);
      expect(features.spectral.flux).toBeGreaterThanOrEqual(0);
    });

    it('should detect flux spikes correctly', () => {
      // Simulate steady flux then spike
      for (let i = 0; i < 30; i++) {
        analyzer.calculateFeatures(steadyData, timeData);
      }
      const spikeFeatures = analyzer.calculateFeatures(spikeData, timeData);
      expect(spikeFeatures.spectral.isFluxSpike).toBe(true);
    });

    it('should handle Meyda initialization failure gracefully', () => {
      const analyzer = new AdvancedAudioAnalyzer(null, null);
      const features = analyzer.calculateFeatures(mockFreqData, mockTimeData);
      expect(features.spectral).toBeNull();
    });

    it('should cleanup Meyda on destroy()', () => {
      analyzer.destroy();
      expect(analyzer.meydaAnalyzer).toBeNull();
    });
  });

  describe('BPM Detection', () => {
    it('should detect BPM from audio buffer', async () => {
      const bpm = await analyzer.detectBPM(mock120BpmBuffer);
      expect(bpm).toBeGreaterThan(115);
      expect(bpm).toBeLessThan(125);
    });

    it('should clamp BPM to reasonable range', async () => {
      const bpm = await analyzer.detectBPM(mockVeryFastBuffer);
      expect(bpm).toBeLessThanOrEqual(180);
    });

    it('should handle empty audio buffer', async () => {
      const bpm = await analyzer.detectBPM(emptyBuffer);
      expect(bpm).toBeNull();
    });

    it('should track beat phase correctly', () => {
      analyzer.detectedBPM = 120;
      analyzer.beatInterval = 500;

      const beatInfo = analyzer.trackBeatPhase();
      expect(beatInfo.bpm).toBe(120);
      expect(beatInfo.barPosition).toBeGreaterThanOrEqual(0);
      expect(beatInfo.barPosition).toBeLessThan(4);
    });

    it('should identify bar boundaries', () => {
      analyzer.detectedBPM = 120;
      analyzer.beatInterval = 500;
      analyzer.barPosition = 3;
      analyzer.lastBeatTime = performance.now() - 500;

      const beatInfo = analyzer.trackBeatPhase();
      expect(beatInfo.isBarBoundary).toBe(true);
    });
  });

  describe('Mood Detection', () => {
    // CRIT-5 FIX: Use actual property names (beatStrength, treble)
    it('should detect aggressive mood for high bass + energy', () => {
      const features = { bass: 0.8, beatStrength: 0.7, spectral: { sharpness: 0.6 } };
      const mood = analyzer.detectMood(features);
      expect(mood.label).toBe('aggressive');
      expect(mood.confidence).toBeGreaterThan(0.7);
    });

    it('should detect relaxed mood for low energy', () => {
      const features = { beatStrength: 0.2, spectral: { centroid: 0.3, flatness: 0.2 } };
      const mood = analyzer.detectMood(features);
      expect(mood.label).toBe('relaxed');
    });

    it('should return neutral when no spectral data', () => {
      const mood = analyzer.detectMood({ bass: 0.5 });
      expect(mood.label).toBe('neutral');
      expect(mood.confidence).toBe(0.5);
    });
  });
});
```

**File:** `test/intelligentPresetSelector.test.js`

```javascript
describe('IntelligentPresetSelector', () => {
  describe('Enhanced Scoring', () => {
    it('should include mood in score calculation', () => {
      const mood = { label: 'aggressive', confidence: 0.9 };
      const features = { energy: 0.7, bass: 0.8, spectral: { centroid: 0.5 } };

      // Preset with high aggressive affinity
      const score1 = selector.scorePreset('aggressivePreset', features, mood);

      // Preset with low aggressive affinity
      const score2 = selector.scorePreset('relaxedPreset', features, mood);

      expect(score1).toBeGreaterThan(score2);
    });

    it('should include BPM match in score', () => {
      selector.analyzer.detectedBPM = 128;
      const features = { energy: 0.5 };

      // Preset optimal for 120-140 BPM
      const score = selector.scorePreset('fastPreset', features, null);
      expect(score).toBeGreaterThan(0);
    });

    it('should include spectral match in score', () => {
      const features = {
        energy: 0.5,
        spectral: { centroid: 0.5, flatness: 0.3 }
      };

      const score = selector.scorePreset('matchingSpectral', features, null);
      expect(score).toBeGreaterThan(0);
    });

    it('should handle missing fingerprint fields gracefully', () => {
      // Old v1.0 fingerprint without new fields
      const score = selector.scorePreset('oldPreset', features, mood);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Bar-Aligned Switching', () => {
    it('should queue switch for bar boundary when BPM detected', () => {
      selector.analyzer.detectedBPM = 120;
      selector.analyzer.barPosition = 2;

      const result = selector.update(audioLevels);

      expect(result.wantsSwitch).toBe(true);
      expect(selector.pendingSwitchOnBar).toBe(true);
      expect(result.nextSwitch).toBeGreaterThan(0);
    });

    it('should execute queued switch on bar boundary', () => {
      selector.pendingSwitchOnBar = true;
      selector.pendingSwitchPreset = mockPreset;
      selector.analyzer.barPosition = 0;
      selector.analyzer.beatPhase = 0.05;

      const result = selector.update(audioLevels);

      expect(result.switched).toBe(true);
      expect(selector.pendingSwitchOnBar).toBe(false);
    });

    it('should switch immediately when no BPM detected', () => {
      selector.analyzer.detectedBPM = null;

      const result = selector.update(highEnergyLevels);

      expect(result.switched).toBe(true);
    });
  });

  describe('Wiring Integration', () => {
    it('should call detectMood and pass to scorePreset', () => {
      const detectMoodSpy = jest.spyOn(selector.analyzer, 'detectMood');
      const scorePresetSpy = jest.spyOn(selector, 'scorePreset');

      selector.update(audioLevels);

      expect(detectMoodSpy).toHaveBeenCalled();
      expect(scorePresetSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ label: expect.any(String) })
      );
    });

    it('should call trackBeatPhase every update', () => {
      const spy = jest.spyOn(selector.analyzer, 'trackBeatPhase');

      selector.update(audioLevels);
      selector.update(audioLevels);
      selector.update(audioLevels);

      expect(spy).toHaveBeenCalledTimes(3);
    });
  });
});
```

### Tool Tests

**File:** `test/tools/generateFingerprints.test.js`

```javascript
describe('Fingerprint Generation', () => {
  describe('extractColorProfile', () => {
    it('should detect warm color profile', () => {
      const preset = { frame_eqs_eel: 'red=1; red=0.5; green=0.2' };
      expect(extractColorProfile(preset)).toBe('warm');
    });

    it('should detect cool color profile', () => {
      const preset = { frame_eqs_eel: 'blue=1; blue=0.8; red=0.1' };
      expect(extractColorProfile(preset)).toBe('cool');
    });
  });

  describe('calculateOptimalBpm', () => {
    it('should return fast BPM range for fast motion', () => {
      const range = calculateOptimalBpm('fast', 0.8);
      expect(range.min).toBeGreaterThanOrEqual(130);
      expect(range.max).toBeLessThanOrEqual(200);
    });

    it('should adjust for energy level', () => {
      const highEnergy = calculateOptimalBpm('medium', 0.9);
      const lowEnergy = calculateOptimalBpm('medium', 0.1);
      expect(highEnergy.ideal).toBeGreaterThan(lowEnergy.ideal);
    });
  });

  describe('deriveMoodAffinities', () => {
    it('should boost electronic for particle style', () => {
      const affinities = deriveMoodAffinities('particle', 'medium', 'neutral');
      expect(parseFloat(affinities.electronic)).toBeGreaterThan(0.5);
    });

    it('should boost relaxed for slow motion', () => {
      const affinities = deriveMoodAffinities('fluid_organic', 'slow', 'neutral');
      expect(parseFloat(affinities.relaxed)).toBeGreaterThan(0.5);
    });
  });

  describe('Enhanced fingerprint schema', () => {
    it('should generate all v2.0 fields', () => {
      const fingerprint = generateFingerprint(testPreset, visualStyles);

      expect(fingerprint.visualStyle).toBeDefined();
      expect(fingerprint.visualStyleScores).toBeDefined();
      expect(fingerprint.moodAffinities).toBeDefined();
      expect(fingerprint.optimalBpm).toBeDefined();
      expect(fingerprint.spectralProfile).toBeDefined();
      expect(fingerprint.colorProfile).toBeDefined();
      expect(fingerprint.motionSpeed).toBeDefined();
    });
  });
});
```

### Integration Tests

**File:** `test/integration/presetSelection.test.js`

```javascript
describe('End-to-End Preset Selection', () => {
  let visualizer, selector, audioContext;

  beforeEach(async () => {
    audioContext = new AudioContext();
    visualizer = await createTestVisualizer();
    selector = new IntelligentPresetSelector(visualizer, v2Fingerprints);
  });

  it('should complete full selection cycle with all new features', async () => {
    // Load audio and detect BPM
    const audioBuffer = await loadTestAudio('120bpm-electronic.wav');
    await selector.onAudioLoaded(audioBuffer);

    expect(selector.analyzer.detectedBPM).toBeCloseTo(120, 5);

    // Simulate playback frames
    for (let i = 0; i < 100; i++) {
      const levels = generateAudioLevels(i);
      const result = selector.update(levels);

      // Verify spectral features are present
      expect(result.features.spectral).toBeDefined();
    }
  });

  it('should select appropriate presets for different genres', async () => {
    const genres = [
      { file: 'aggressive-metal.wav', expectedMood: 'aggressive' },
      { file: 'ambient-pad.wav', expectedMood: 'relaxed' },
      { file: 'edm-drop.wav', expectedMood: 'electronic' }
    ];

    for (const genre of genres) {
      const buffer = await loadTestAudio(genre.file);
      await selector.onAudioLoaded(buffer);

      // Play for a few seconds
      const levels = await captureAudioLevels(buffer, 3);
      const result = selector.update(levels);

      // Selected preset should have high affinity for expected mood
      const selectedFp = v2Fingerprints.presets[result.currentHash].fingerprint;
      expect(selectedFp.moodAffinities[genre.expectedMood]).toBeGreaterThan(0.5);
    }
  });

  it('should switch on bar boundaries for BPM-detected audio', async () => {
    const buffer = await loadTestAudio('120bpm-steady.wav');
    await selector.onAudioLoaded(buffer);

    const switchTimes = [];
    const startTime = performance.now();

    // Simulate 10 seconds of playback
    for (let frame = 0; frame < 600; frame++) {
      const result = selector.update(generateLevels());
      if (result.switched) {
        switchTimes.push(performance.now() - startTime);
      }
    }

    // Switches should occur near bar boundaries (every 2 seconds at 120 BPM)
    for (const time of switchTimes) {
      const barTime = 2000; // 4 beats at 120 BPM
      const distanceToBar = time % barTime;
      expect(Math.min(distanceToBar, barTime - distanceToBar)).toBeLessThan(200);
    }
  });
});
```

### Performance Tests

**File:** `test/performance/analyzer.perf.js`

```javascript
describe('Performance', () => {
  it('should maintain <2ms per calculateFeatures() call', () => {
    const iterations = 1000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      analyzer.calculateFeatures(freqData, timeData);
    }

    const avgTime = (performance.now() - start) / iterations;
    expect(avgTime).toBeLessThan(2);
  });

  it('should not leak memory with flux history', () => {
    const initialMemory = process.memoryUsage().heapUsed;

    for (let i = 0; i < 10000; i++) {
      analyzer.calculateFeatures(freqData, timeData);
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const growth = (finalMemory - initialMemory) / 1024 / 1024;

    // Should not grow more than 5MB
    expect(growth).toBeLessThan(5);
  });

  it('should detect BPM in <500ms', async () => {
    const start = performance.now();
    await analyzer.detectBPM(audioBuffer);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
  });
});
```

### Edge Case Tests

**File:** `test/edgeCases.test.js`

```javascript
describe('Edge Cases', () => {
  describe('Microphone Input (no buffer)', () => {
    it('should work without BPM detection for live input', () => {
      selector.analyzer.detectedBPM = null;

      const result = selector.update(micLevels);

      // Should still switch, just immediately
      expect(result.features).toBeDefined();
    });
  });

  describe('Very Short Audio', () => {
    it('should handle audio shorter than BPM analysis window', async () => {
      const shortBuffer = createBuffer(0.5); // 0.5 second
      const bpm = await analyzer.detectBPM(shortBuffer);

      // Should return null or fallback BPM
      expect(bpm === null || bpm === 120).toBe(true);
    });
  });

  describe('Extreme BPM', () => {
    it('should clamp very slow BPM', async () => {
      const slowBuffer = createBpmBuffer(40);
      const bpm = await analyzer.detectBPM(slowBuffer);
      expect(bpm).toBeGreaterThanOrEqual(60);
    });

    it('should clamp very fast BPM', async () => {
      const fastBuffer = createBpmBuffer(220);
      const bpm = await analyzer.detectBPM(fastBuffer);
      expect(bpm).toBeLessThanOrEqual(180);
    });
  });

  describe('Fingerprint Compatibility', () => {
    it('should work with v1.0 fingerprints (missing new fields)', () => {
      const v1Fingerprints = { version: '1.0.0', presets: { /* old format */ } };
      const selector = new IntelligentPresetSelector(visualizer, v1Fingerprints);

      const result = selector.update(audioLevels);
      expect(result.features).toBeDefined();
    });

    it('should gracefully degrade without visualStyle field', () => {
      const score = selector.scorePreset('noVisualStyle', features, mood);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Audio Context Issues', () => {
    it('should handle suspended audio context', () => {
      audioContext.state = 'suspended';
      const features = analyzer.calculateFeatures(freqData, timeData);

      // Should return features without crashing
      expect(features).toBeDefined();
    });

    it('should recover from Meyda analyzer error', () => {
      analyzer.meydaAnalyzer = null;

      const features = analyzer.calculateFeatures(freqData, timeData);
      expect(features.spectral).toBeNull();
      // Other features should still work
      expect(features.bass).toBeDefined();
    });
  });
});
```

### Manual Testing Commands

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --grep "AdvancedAudioAnalyzer"
npm test -- --grep "IntelligentPresetSelector"
npm test -- --grep "Performance"

# Run with coverage
npm test -- --coverage

# Visual testing in browser
npm run build:cdn
cd ../alaska-butter && npm start
# Open http://localhost:5577/test
# - Load different genre audio files
# - Verify BPM display updates
# - Verify mood indicator changes
# - Verify preset switches align with beats
# - Check console for enhanced scoring output
```

### Verification Checklist

**Phase 1 - Audio Analysis:**
- [ ] Meyda uses 2048 buffer size (CRIT-1)
- [ ] Meyda spectral features appear in selector debug output
- [ ] Flux spike detection combines with bass change (WARN-4)
- [ ] Flux spike multiplier is configurable (SUG-1)

**Phase 2 - Musical Timing:**
- [ ] `_detectOnsets()` implemented and working (CRIT-2)
- [ ] BPM detection gracefully handles failures (CRIT-2)
- [ ] Beat tracking uses `audioContext.currentTime` when available (WARN-1)
- [ ] Preset switches happen on **phrase boundaries (every 16 beats)**
- [ ] Pre-drop anticipation cancels lower-priority switches (CRIT-4)
- [ ] Console shows "Queued for phrase (Xs, beat N/16)"

**Phase 3 - Mood Detection:**
- [ ] Uses `beatStrength` not `vol` for volume-invariant detection (CRIT-5)
- [ ] Uses `treble` not `treb` (CRIT-5)
- [ ] BPM scoring clamped at 0 (WARN-3)
- [ ] moodAffinities validated before use (CRIT-8)

**Phase 4 - Performance Tracking:**
- [ ] Tracker uses scores from `scorePreset()` (CRIT-6)
- [ ] Baseline built from first 30 scores (WARN-6)
- [ ] Console shows "Performance degraded X% - triggering switch"
- [ ] `performanceTracker.reset()` called on preset switch

**Phase 5-6 - Fingerprints & ML:**
- [ ] No `spectralProfile` in schema (CRIT-7)
- [ ] `_experimental` field marks heuristic data (CRIT-8)
- [ ] v1.0 fingerprints work with graceful degradation (CRIT-9)
- [ ] Python requirements.txt exists (WARN-5)
- [ ] CLIP classifier generates visualStyleScores

**Wiring (CRIT-3 Fixes):**
- [ ] Uses `this.audioAnalyzer` (not `this.analyzer`)
- [ ] Uses `this.switchToPreset()` (not `_executeSwitch()`)
- [ ] Uses `this.shouldSwitchPreset()` (not `_shouldSwitch()`)
- [ ] Constructor accepts `audioContext`, `audioSource` params
- [ ] `onAudioLoaded()` calls `audioAnalyzer.detectBPM()`
- [ ] Meyda analyzer cleaned up on destroy

**Documentation:**
- [ ] CLAUDE.md updated with new features
- [ ] mathematical-fingerprinting.md documents new fingerprint fields
- [ ] architecture.md documents new audio pipeline components
- [ ] README.md lists new intelligent selection features
- [ ] advanced-features.md marked complete

**Tests Pass:**
- [ ] Unit tests for AdvancedAudioAnalyzer (Meyda, BPM, buildup)
- [ ] Unit tests for IntelligentPresetSelector (phrases, pre-drop)
- [ ] Unit tests for PresetPerformanceTracker (external scores)
- [ ] Unit tests for fingerprint generation tools
- [ ] Integration tests for full selection cycle
- [ ] Performance tests meet thresholds
- [ ] Edge case tests pass (v1.0 fingerprints, no BPM, etc.)

---

## Client-Side Changes (alaska-butter)

After butterchurn is updated, minimal changes in alaska-butter:

1. Update butterchurn CDN URL (if versioned)
2. Optionally add UI to display BPM, mood, spectral features

The core intelligence improvements are all in butterchurn.

---

*Plan Version: 4.0 | Created: 2026-03-25 | Updated: 2026-03-25*

**Changelog:**
- v1.0: Initial plan
- v1.1: Added documentation phase
- v1.2: Added wiring & tests
- v2.0: Codebase audit - reuse existing code
- v3.0: Added parent roadmap reference, 16-beat phrases, pre-drop anticipation, performance degradation tracking
- v4.0: **Addressed all 16 review issues** from [pre-implementation code review](../issues/intelligent-preset-selector-plan-review.md):
  - CRIT-1: Meyda buffer 512 → 2048
  - CRIT-2: Implemented `_detectOnsets()`, added graceful degradation
  - CRIT-3: Fixed all property/method names (`audioAnalyzer`, `switchToPreset`, etc.)
  - CRIT-4: Added priority system for switch scheduling
  - CRIT-5: Fixed mood detection property names (`treble`, `beatStrength`)
  - CRIT-6: Refactored performance tracker to use external scores
  - CRIT-7: Removed `spectralProfile` from schema
  - CRIT-8: Added validation for heuristic-generated fields
  - CRIT-9: Added backward-compatible field handling
  - WARN-1: Use `audioContext.currentTime` for beat tracking
  - WARN-3: Clamp BPM scoring at 0
  - WARN-4: Combine flux + bass signals (no early return)
  - WARN-5: Added Python requirements.txt
  - SUG-1: Made flux spike multiplier configurable
