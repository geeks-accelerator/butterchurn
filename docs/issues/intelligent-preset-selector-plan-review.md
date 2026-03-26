# Pre-Implementation Review Issues: Intelligent Preset Selector Improvements

**Created**: 2026-03-25
**Status**: Resolved - All Issues Addressed in Plan v4.0
**Type**: Pre-Implementation Plan Review Findings
**Resolution**: [Plan v4.0](../plans/intelligent-preset-selector-improvements.md) incorporates all fixes

---

## Cross-References

| Document | Purpose |
|----------|---------|
| **[docs/plans/intelligent-preset-selector-improvements.md](../plans/intelligent-preset-selector-improvements.md)** | Plan under review |
| **[docs/reviews/2026-03-25-intelligent-preset-selector-improvements-codex.md](../reviews/2026-03-25-intelligent-preset-selector-improvements-codex.md)** | Codex review (6 issues) |
| **[docs/reviews/2026-03-25-intelligent-preset-selector-improvements-gemini.md](../reviews/2026-03-25-intelligent-preset-selector-improvements-gemini.md)** | Gemini review (13 issues) |

---

## Summary

| Severity | N=2 (Both) | N=1 (Single) | Total |
|----------|------------|--------------|-------|
| **CRITICAL** | 7 | 2 | 9 |
| **WARNING** | 3 | 3 | 6 |
| **SUGGESTION** | 0 | 1 | 1 |
| **Total** | 10 | 6 | 16 |

**Note**: This is a greenfield system. Backward compatibility concerns are noted but not blocking.

---

## CRITICAL Issues (Must Fix Before Implementation)

### CRIT-1: Meyda Buffer Size Violates 2048-Sample Rule [N=2]

**Reviewers**: Codex (#1), Claude (verified)
**Location**: Task 1.2, lines 168-203

**Problem**: Plan configures Meyda with `bufferSize: 512`, directly violating CLAUDE.md rule:
> "PRESERVE 2048-sample audio buffer size - never revert to 512"

**Impact**: Reduced frequency resolution, degraded bass response.

**Fix**: Use Meyda's `bufferSize: 2048` or drive Meyda from existing analyzer buffer:

```javascript
this.meydaAnalyzer = Meyda.createMeydaAnalyzer({
    audioContext: audioContext,
    source: source,
    bufferSize: 2048,  // Match existing pipeline
    // ...
});
```

---

### CRIT-2: BPM Detection Missing Implementation [N=2]

**Reviewers**: Codex (#2), Gemini (Critical #1)
**Location**: Task 2.1, lines 369-387

**Problem**:
1. `detectBPM()` calls `this._detectOnsets()` which is never defined
2. One-time detection from first 10 seconds using naive averaging is brittle
3. BPM clamp logic doubles/halves BPM which can compound errors

**Impact**: BPM detection will fail at runtime; phrase-aligned switching unusable.

**Fix**: Use an existing onset detection library or implement a robust algorithm:

```javascript
// Option 1: Use web-audio-beat-detector (npm package)
import { analyze } from 'web-audio-beat-detector';

async detectBPM(audioBuffer) {
    try {
        const { bpm } = await analyze(audioBuffer);
        this.detectedBPM = bpm;
        this.beatInterval = 60000 / bpm;
        return bpm;
    } catch (e) {
        console.warn('[Analyzer] BPM detection failed, using fallback');
        this.detectedBPM = null;
        return null;
    }
}

// Option 2: Simple autocorrelation-based detection
_detectOnsets(channelData, sampleRate) {
    const onsets = [];
    const windowSize = Math.floor(sampleRate * 0.01); // 10ms windows
    let prevEnergy = 0;

    for (let i = 0; i < channelData.length - windowSize; i += windowSize) {
        let energy = 0;
        for (let j = 0; j < windowSize; j++) {
            energy += channelData[i + j] ** 2;
        }
        energy /= windowSize;

        // Onset = significant energy increase
        if (energy > prevEnergy * 1.5 && energy > 0.01) {
            onsets.push(i / sampleRate);
        }
        prevEnergy = energy;
    }
    return onsets;
}
```

**Graceful Degradation**: If BPM detection fails, fall back to immediate switching (existing behavior).

---

### CRIT-3: Analyzer Instance Naming Mismatch [N=2]

**Reviewers**: Codex (#3), Claude (verified)
**Location**: Task 2.3 lines 494-520, Wiring lines 1423-1495

**Problem**:
- Plan uses `this.analyzer` but existing code uses `this.audioAnalyzer` (line 81)
- Plan calls `_executeSwitch()` / `_shouldSwitch()` but code has `switchToPreset()` / `shouldSwitchPreset()`
- Plan references `this.audioContext` / `this.audioSource` which aren't defined on selector

**Impact**: Runtime errors; existing feature extraction broken.

**Fix**: Use existing method names consistently:

```javascript
// In plan, change all occurrences:
this.analyzer → this.audioAnalyzer
_executeSwitch() → this.switchToPreset()
_shouldSwitch() → this.shouldSwitchPreset()

// For audioContext/audioSource, add to constructor params:
constructor(butterchurn, fingerprintDatabase, audioContext = null, audioSource = null) {
    // ... existing code ...
    this.audioContext = audioContext;
    this.audioSource = audioSource;

    // Then pass to analyzer
    if (AdvancedAudioAnalyzer && audioContext && audioSource) {
        this.audioAnalyzer = new AdvancedAudioAnalyzer(config, audioContext, audioSource);
    }
}
```

---

### CRIT-4: Phrase-Aligned Switching Race Condition [N=2]

**Reviewers**: Codex (#3 partial), Gemini (Critical #2)
**Location**: Task 2.3, lines 494-520

**Problem**: No priority system between:
- Pre-drop anticipation switches
- Standard phrase-aligned switches
- Performance degradation switches

Last one to set `pendingSwitchPreset` wins, causing unpredictable behavior.

**Impact**: Carefully selected presets overwritten by less optimal choices.

**Fix**: Implement priority system in `update()`:

```javascript
update(audioLevels) {
    const features = this.audioAnalyzer.calculateFeatures(audioLevels);
    const beatInfo = this.audioAnalyzer.trackBeatPhase ?
        this.audioAnalyzer.trackBeatPhase() : null;

    // Priority 1: Pre-drop anticipation (highest priority)
    const buildupInfo = this.audioAnalyzer.detectBuildup ?
        this.audioAnalyzer.detectBuildup(features) : { isBuildup: false };

    if (buildupInfo.isBuildup && buildupInfo.confidence > 0.7) {
        this._schedulePreDropSwitch(features, buildupInfo);
        return { features, scheduled: 'pre_drop' };
    }

    // Priority 2: Execute pending switches on phrase boundary
    if (this.pendingSwitchOnPhrase && beatInfo?.isPhraseBoundary) {
        this._executeSwitch(this.pendingSwitchPreset, this.pendingSwitchHash);
        this.pendingSwitchOnPhrase = false;
        return { features, switched: true, reason: this.pendingSwitchReason };
    }

    // Priority 3: Performance degradation (only if no pending switch)
    if (!this.pendingSwitchOnPhrase) {
        const perfResult = this.performanceTracker?.update(this.currentPreset, features);
        if (perfResult?.shouldSwitch) {
            this._queuePhraseSwitch(features, 'performance_degraded');
        }
    }

    // Priority 4: Regular audio-triggered switches
    if (!this.pendingSwitchOnPhrase && this.shouldSwitchPreset(features)) {
        this._queuePhraseSwitch(features, 'audio_change');
    }

    return { features, switched: false };
}
```

---

### CRIT-5: Mood Detection Property Mismatch [N=2]

**Reviewers**: Codex (#5), Gemini (Critical #3), Claude (verified)
**Location**: Task 3.1, lines 589-618

**Problem**:
1. `detectMood()` uses `mid`, `treb`, `vol` but analyzer produces `mid`, `treble`, `beatStrength`
2. Uses absolute volume which changes with user volume adjustments
3. Hardcoded thresholds without evidence basis

**Impact**: Mood detection returns undefined/NaN values.

**Fix**: Use actual property names and volume-invariant features:

```javascript
detectMood(features) {
    if (!features.spectral) return { label: 'neutral', confidence: 0.5 };

    // Use actual property names from analyzer
    const { bass, mid, treble, beatStrength } = features;
    const { centroid, flatness, sharpness } = features.spectral;

    // Use normalized energy instead of absolute volume
    const energy = beatStrength;  // Already 0-1 normalized

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

    return mood;
}
```

---

### CRIT-6: Performance Tracker Dual Scoring [N=2]

**Reviewers**: Gemini (Critical #4), Claude (verified)
**Location**: Task 4.1, lines 759-867

**Problem**: `PresetPerformanceTracker._calculateMatchScore()` duplicates scoring logic that differs from `scorePreset()`. Two sources of truth for preset quality.

**Impact**: Tracker may flag a preset as degraded while main selector considers it a good match.

**Fix**: Tracker should accept pre-calculated scores, not compute its own:

```javascript
class PresetPerformanceTracker {
    constructor(config = {}) {
        this.scoreHistory = [];
        this.maxHistorySize = config.maxHistorySize || 60;
        this.degradationThreshold = config.degradationThreshold || 0.4;
        this.baselineScores = [];  // First N scores for baseline
        this.BASELINE_SIZE = 30;
    }

    /**
     * Update with score calculated by scorePreset()
     * @param {number} currentScore - Score from main scoring function
     */
    update(currentScore) {
        // Build baseline from first N scores (more stable than single value)
        if (this.baselineScores.length < this.BASELINE_SIZE) {
            this.baselineScores.push(currentScore);
            return { shouldSwitch: false, degradation: 0 };
        }

        this.scoreHistory.push(currentScore);
        if (this.scoreHistory.length > this.maxHistorySize) {
            this.scoreHistory.shift();
        }

        const baseline = this.baselineScores.reduce((a, b) => a + b, 0) /
                         this.baselineScores.length;
        const current = this.scoreHistory.reduce((a, b) => a + b, 0) /
                        this.scoreHistory.length;
        const degradation = (baseline - current) / baseline;

        return {
            shouldSwitch: degradation > this.degradationThreshold,
            degradation,
            baseline,
            current
        };
    }

    reset() {
        this.scoreHistory = [];
        this.baselineScores = [];
    }
}
```

---

### CRIT-7: Spectral Profile Conceptual Error [N=2]

**Reviewers**: Gemini (Critical #6), Claude (verified)
**Location**: Task 5.2, lines 1163-1171

**Problem**: Adding static default `spectralProfile` to fingerprints is conceptually wrong. A preset doesn't have an intrinsic spectral profile - it *reacts* to audio.

**Impact**: Spectral matching compares live audio to meaningless constant values.

**Fix**: Remove `spectralProfile` from fingerprint schema and scoring:

```javascript
// In generateFingerprint() - REMOVE:
// spectralProfile: { centroid: 0.5, flatness: 0.5 }

// In scorePreset() - REMOVE spectral profile matching
// KEEP: Match audio spectral features to preset reactive properties:
if (features.spectral && fp.bassEnergy) {
    // High bass audio + high bass preset = good match
    const bassMatch = 1 - Math.abs(features.bass - fp.bassEnergy);
    score += bassMatch * 0.10;
}
```

---

### CRIT-8: Fingerprint Helper Heuristics Are Naive [N=1 Gemini]

**Reviewers**: Gemini (Critical #5)
**Location**: Task 5.1, lines 1027-1106

**Problem**: Functions like `extractColorProfile()` count string occurrences (`red=`, `blue=`), and `deriveMoodAffinities()` chains multiple flawed heuristics together.

**Impact**: Fingerprint data may be meaningless "garbage in, garbage out".

**Mitigating Factors**:
- This is greenfield; can iterate quickly
- Plan includes CLIP ML tagging (Phase 6) as the real solution
- Heuristics are placeholder until ML is ready

**Recommended Approach**:
1. Implement Phase 6 (CLIP tagging) first for `visualStyle`
2. Keep simple heuristics for `colorProfile` / `motionSpeed` as v1
3. Mark fingerprint fields as "experimental" in schema
4. Add validation that skips mood scoring if `moodAffinities` looks invalid

```javascript
// In scorePreset() - validate before using:
if (mood && mood.label && fp.moodAffinities) {
    const moodScore = fp.moodAffinities[mood.label];
    // Only use if moodAffinities looks valid (not all 0.5)
    const values = Object.values(fp.moodAffinities);
    const variance = values.reduce((s, v) => s + (v - 0.5) ** 2, 0) / values.length;
    if (variance > 0.01) {  // Has meaningful variation
        score += moodScore * mood.confidence * 0.15;
    }
}
```

---

### CRIT-9: Fingerprint v2.0 Migration Gap [N=1 Codex]

**Reviewers**: Codex (#4)
**Location**: Phase 5 schema lines 942-1085, client wiring lines 2058-2064

**Problem**: Schema bumps to v2.0 with no migration strategy for existing v1.0 files or adapters.

**Mitigating Factors**:
- Greenfield system - no production deployments
- Can regenerate all fingerprints

**Fix**: Add backward-compatible field handling:

```javascript
// In scorePreset() - handle missing v2.0 fields gracefully:
scorePreset(hash, features, mood = null) {
    const fp = this.db.presets[hash]?.fingerprint;
    if (!fp) return 0;

    let score = 0;

    // v1.0 fields (always present)
    const energyDiff = Math.abs((fp.energy || 0.5) - (features.energy || 0.5));
    score += (1 - energyDiff) * 0.25;

    // v2.0 fields (optional - graceful degradation)
    if (mood?.label && fp.moodAffinities?.[mood.label]) {
        score += fp.moodAffinities[mood.label] * mood.confidence * 0.15;
    }

    if (this.audioAnalyzer?.detectedBPM && fp.optimalBpm) {
        // ... BPM scoring only if field exists
    }

    return score;
}
```

---

## WARNING Issues (Should Fix)

### WARN-1: Beat Tracking Uses performance.now() [N=1 Gemini]

**Reviewers**: Gemini (Warning)
**Location**: Task 2.1, `trackBeatPhase()`

**Problem**: `performance.now()` can drift if main thread is blocked. `audioContext.currentTime` runs on separate high-priority thread.

**Fix**:

```javascript
trackBeatPhase(audioContextTime = null) {
    if (!this.detectedBPM) return null;

    // Prefer audioContext.currentTime, fallback to performance.now()
    const now = audioContextTime !== null ?
        audioContextTime * 1000 : performance.now();
    // ... rest unchanged
}
```

---

### WARN-2: Pre-Drop ETA Uses Fixed Timing [N=1 Gemini]

**Reviewers**: Gemini (Warning)
**Location**: Task 2.2, `detectBuildup()`

**Problem**: Fixed `dropETA = beatInterval * 8` doesn't reflect variable buildup lengths.

**Recommended Approach**: For greenfield v1, this is acceptable. Track as future improvement:
- Detect buildup trend duration
- Estimate drop at next phrase boundary

---

### WARN-3: BPM Scoring Can Go Negative [N=1 Gemini]

**Reviewers**: Gemini (Warning)
**Location**: Task 3.2, lines 680-686

**Problem**: `(1 - distFromIdeal / rangeSize)` can be negative if BPM is outside range.

**Fix**:

```javascript
if (bpm >= fp.optimalBpm.min && bpm <= fp.optimalBpm.max) {
    const distFromIdeal = Math.abs(bpm - fp.optimalBpm.ideal);
    const rangeSize = (fp.optimalBpm.max - fp.optimalBpm.min) / 2;
    score += Math.max(0, 1 - distFromIdeal / rangeSize) * 0.10;  // Clamp at 0
}
```

---

### WARN-4: Flux Spike Early Return Bypasses Existing Detection [N=1 Gemini]

**Reviewers**: Gemini (Warning)
**Location**: Task 1.4, lines 314-321

**Problem**: New flux-based drop detection returns early, bypassing the existing bass-change validation.

**Fix**: Combine signals instead of early return:

```javascript
// INSTEAD OF early return, add flux as additional signal:
const hasFluxSpike = features.spectral?.isFluxSpike;
const hasBassIncrease = bassChange > 0.2;

// Both signals together = higher confidence
if (features.bass > this.dropThreshold && hasBassIncrease && features.beatDetected) {
    event.type = 'Drop';
    event.confidence = Math.min(1.0, features.bass + bassChange);
    if (hasFluxSpike) {
        event.confidence = Math.min(1.0, event.confidence + 0.2);  // Boost confidence
    }
}
```

---

### WARN-5: Python/ML Dependencies Undocumented [N=1 Codex]

**Reviewers**: Codex (#6)
**Location**: Task 6, lines 119-128

**Problem**: `classify-visual-style.py` requires CLIP/PyTorch but dependencies not documented.

**Fix**: Add to plan:

```bash
# tools/requirements.txt
torch>=2.0.0
clip @ git+https://github.com/openai/CLIP.git
pillow>=9.0.0

# Installation:
pip install -r tools/requirements.txt
```

---

### WARN-6: Performance Tracker Baseline from Single Frame [N=1 Gemini]

**Reviewers**: Gemini (Warning)
**Location**: Task 4.1, line 796

**Problem**: `initialScore` from first frame is noisy.

**Fix**: Already addressed in CRIT-6 fix (use first 30 scores for baseline).

---

## SUGGESTION Issues

### SUG-1: Flux Spike Multiplier is Magic Number [N=1 Gemini]

**Reviewers**: Gemini (Suggestion)
**Location**: Task 1.3, lines 267-268

**Problem**: `isFluxSpike: spectralFlux > avgFlux * 2.5` - why 2.5?

**Fix**: Make configurable:

```javascript
constructor(config = {}) {
    // ... existing ...
    this.fluxSpikeMultiplier = config.fluxSpikeMultiplier || 2.5;
}

// In calculateFeatures:
isFluxSpike: meydaFeatures.spectralFlux > avgFlux * this.fluxSpikeMultiplier
```

---

## Implementation Checklist

Before starting implementation, resolve:

- [ ] **CRIT-1**: Change Meyda buffer to 2048
- [ ] **CRIT-2**: Implement `_detectOnsets()` or use library
- [ ] **CRIT-3**: Fix property/method names to match existing code
- [ ] **CRIT-4**: Add priority system for switch scheduling
- [ ] **CRIT-5**: Fix mood detection property names
- [ ] **CRIT-6**: Refactor performance tracker to use external scores
- [ ] **CRIT-7**: Remove spectralProfile from schema
- [ ] **CRIT-8**: Add validation for heuristic-generated fields
- [ ] **CRIT-9**: Add backward-compatible field handling

Should fix:
- [ ] **WARN-1**: Use audioContext.currentTime for beat tracking
- [ ] **WARN-3**: Clamp BPM scoring at 0
- [ ] **WARN-4**: Combine flux + bass signals
- [ ] **WARN-5**: Add Python requirements.txt

Can defer:
- [ ] **WARN-2**: Variable buildup ETA (future improvement)
- [ ] **SUG-1**: Make flux multiplier configurable

---

## Reviewer Recommendations

### From Codex
> Consider implementing Phase 5 (fingerprints) before Phase 1-4 to ensure the schema is stable and backward-compatible before adding features that depend on it.

### From Gemini
> Prioritize algorithm robustness over features. Several proposed features lack the mathematical soundness to be useful. Implement graceful degradation - all new features should fall back to existing behavior when they cannot produce reliable results.

### Combined Recommendation
1. Fix all CRITICAL issues in the plan document first
2. Implement Phase 1-4 with graceful degradation
3. Treat Phase 5 fingerprint heuristics as "experimental v1"
4. Phase 6 (CLIP ML) provides the robust solution for visual classification
5. This is greenfield - iterate quickly, validate with real audio

---

## Resolution Summary

All 16 issues have been addressed in [Plan v4.0](../plans/intelligent-preset-selector-improvements.md):

| Issue | Resolution |
|-------|------------|
| **CRIT-1** | Changed Meyda `bufferSize: 512` → `bufferSize: 2048` in Task 1.2 |
| **CRIT-2** | Implemented `_detectOnsets()` with energy-based detection, added graceful degradation |
| **CRIT-3** | All references updated: `audioAnalyzer`, `switchToPreset()`, `shouldSwitchPreset()` |
| **CRIT-4** | Added priority system: pre-drop (P1) > phrase (P2) > degradation (P3) > regular (P4) |
| **CRIT-5** | Fixed property names: `treble` not `treb`, `beatStrength` not `vol` |
| **CRIT-6** | Refactored `PresetPerformanceTracker` to accept external scores from `scorePreset()` |
| **CRIT-7** | Removed `spectralProfile` from schema and scoring |
| **CRIT-8** | Added `_experimental` marker, validation for moodAffinities variance |
| **CRIT-9** | Added graceful degradation for missing v2.0 fields |
| **WARN-1** | `trackBeatPhase()` accepts `audioContextTime` parameter |
| **WARN-3** | Added `Math.max(0, ...)` to BPM scoring |
| **WARN-4** | Flux spike boosts confidence but doesn't trigger alone |
| **WARN-5** | Added `tools/requirements.txt` with PyTorch/CLIP deps |
| **WARN-6** | Baseline built from first 30 scores (not single initial value) |
| **SUG-1** | Added `config.fluxSpikeMultiplier` option |

---

*Issue created from dual-reviewer (N=2) code review process*
*Codex + Gemini reviews + Claude verification*
*Resolved: 2026-03-25*
