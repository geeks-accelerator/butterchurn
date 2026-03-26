# Intelligent Preset Selector - Twin Review Issues

**Created**: 2026-03-25
**Status**: Resolved
**Review Type**: Pre-Implementation Twin Review
**Plan Document**: `docs/plans/intelligent-preset-selector-improvements.md` (v4.0)
**Context**: Greenfield system (not production)

---

## Review Sources

| Reviewer | File | Issues |
|----------|------|--------|
| Twin Technical | `docs/reviews/2026-03-25-intelligent-preset-selector-twin-technical.md` | 2 CRIT, 6 WARN, 5 SUG |
| Twin Creative | `docs/reviews/2026-03-25-intelligent-preset-selector-twin-creative.md` | 0 CRIT, 3 WARN, 5 SUG |

---

## Summary

| Severity | N=2 Verified | Total |
|----------|--------------|-------|
| CRITICAL | 2 | 2 |
| WARNING | 4 | 7 |
| SUGGESTION | 0 | 10 |

---

## CRITICAL Issues (N=2 Verified)

### TWIN-CRIT-1: Meyda callback:null + No AudioContext State Check

**Source**: Twin Technical (CRIT-NEW-1)
**N=2 Verification**: Confirmed at plan lines 212, 248 - `callback: null` with no state check before `get()`

**Location**: Lines 203-213, 246-251

**Problem**: The Meyda analyzer is configured with `callback: null`:
```javascript
this.meydaAnalyzer = Meyda.createMeydaAnalyzer({
    // ...
    callback: null  // line 212
});
```

When `callback` is null, Meyda operates in "get mode" where you must call `get()` manually. However, `get()` returns stale/undefined data when:
1. AudioContext is suspended (mobile browsers auto-suspend)
2. `calculateFeatures()` is called at a different rate than audio frames

The code at line 248 calls `this.meydaAnalyzer.get()` without checking AudioContext state.

**Impact**: Spectral features may be undefined or stale on mobile devices, causing mood detection to fail silently.

**Fix**: Add AudioContext state check before calling `get()`:
```javascript
// In calculateFeatures(), before calling meydaAnalyzer.get()
if (this.meydaAnalyzer && this.audioContext?.state === 'running') {
    const meydaFeatures = this.meydaAnalyzer.get([...]);
    // ... rest of processing
} else {
    // Use graceful fallback values
    features.spectral = this._getDefaultSpectralFeatures();
}
```

---

### TWIN-CRIT-2: Timing Source Mixing Creates Drift

**Source**: Twin Technical (CRIT-NEW-2)
**N=2 Verification**: Confirmed at plan lines 459-460 (audioContextTime), 497 (performance.now())

**Location**: Lines 454-469, 493-498

**Problem**: The plan mixes two timing sources without calibration:

```javascript
// Line 459-460 - trackBeatPhase()
const now = audioContextTime !== null ?
    audioContextTime * 1000 : performance.now();

// Line 497 - detectBuildup()
timestamp: performance.now()  // Always uses performance.now()
```

`audioContext.currentTime` and `performance.now()` can drift by 100-500ms over a session. When beat tracking uses `audioContext.currentTime` but buildup detection uses `performance.now()`, the systems become desynchronized.

**Impact**: Pre-drop anticipation may misalign with actual drops, causing jarring transitions.

**Fix**: Consistently use `audioContext.currentTime` for all timing:
```javascript
// In detectBuildup()
detectBuildup(features, audioContextTime = null) {
    const timestamp = audioContextTime !== null ?
        audioContextTime * 1000 : performance.now();
    this.buildupHistory.push({
        energy: features.energy || features.beatStrength || 0,
        spectralCentroid: features.spectralCentroid || 0,
        timestamp: timestamp
    });
    // ...
}
```

And pass `audioContextTime` from the caller.

---

## WARNING Issues

### TWIN-WARN-1: Math.random() Violates Deterministic RNG Rule (N=2)

**Source**: Twin Technical (WARN-NEW-1)
**N=2 Verification**: Confirmed at plan line 662, violates CLAUDE.md line 13

**Location**: Line 662

**Problem**:
```javascript
const hash = dropCandidates[Math.floor(Math.random() * dropCandidates.length)];
```

CLAUDE.md states: "KEEP deterministic RNG context for visual regression tests"

**Fix**:
```javascript
const hash = dropCandidates[Math.floor(this.rng() * dropCandidates.length)];
```

Where `this.rng` is the deterministic RNG context from `utils/rngContext.js`.

---

### TWIN-WARN-2: spectralProfile in Documentation (N=2)

**Source**: Twin Technical (WARN-NEW-5) + Twin Creative (WARNING-1)
**N=2 Verification**: Both twins independently found this

**Location**: Line 1531

**Problem**: Task 6.2 documentation list includes `spectralProfile`:
```
- `spectralProfile` - Expected spectral characteristics
```

But CRIT-7 explicitly removed `spectralProfile` from the schema (lines 1066, 1120, 1268, 1314).

**Fix**: Remove the `spectralProfile` line from the documentation task.

---

### TWIN-WARN-3: spectralProfile in Test Assertion (N=2)

**Source**: Twin Technical (WARN-NEW-6) + Twin Creative (WARNING-2)
**N=2 Verification**: Both twins independently found this

**Location**: Line 1992

**Problem**:
```javascript
expect(fingerprint.spectralProfile).toBeDefined();
```

This field was removed by CRIT-7 fix.

**Fix**: Remove this assertion from the test file.

---

### TWIN-WARN-4: Inconsistent bar/phrase Terminology (N=2)

**Source**: Twin Technical (WARN-NEW-2) + Twin Creative (WARNING-3)
**N=2 Verification**: Both twins independently found this

**Location**: Lines 1887, 1892, 1900

**Problem**: Test file uses `pendingSwitchOnBar`:
```javascript
expect(selector.pendingSwitchOnBar).toBe(true);  // line 1887
selector.pendingSwitchOnBar = true;              // line 1892
expect(selector.pendingSwitchOnBar).toBe(false); // line 1900
```

But implementation uses `pendingSwitchOnPhrase` (line 556). The system uses 16-beat phrases, not 4-beat bars.

**Fix**: Update test variables to `pendingSwitchOnPhrase`.

---

### TWIN-WARN-5: No Mutex on Pending Switch State (N=1)

**Source**: Twin Technical (WARN-NEW-3)
**N=1 Note**: Technical concern, lower priority for greenfield

**Location**: Lines 556-566, 579-648

**Problem**: Multiple async paths can modify `pendingSwitchOnPhrase`, `preDropSwitchScheduled` without synchronization. Race conditions could cause double-switches.

**Fix** (optional for greenfield):
```javascript
if (this.switchLock) return;
this.switchLock = true;
try { /* switch logic */ } finally { this.switchLock = false; }
```

---

### TWIN-WARN-6: BPM Detection Sets State Without Confidence Check (N=1)

**Source**: Twin Technical (WARN-NEW-4)
**N=1 Note**: Algorithm improvement, lower priority for greenfield

**Location**: Lines 405-449

**Problem**: BPM detection sets `this.detectedBPM` even when the value might be unreliable (few onsets, noisy data).

**Fix** (optional enhancement):
```javascript
const confidence = this._calculateBpmConfidence(intervals);
if (confidence > 0.7) {
    this.detectedBPM = bpm;
    this.bpmConfidence = confidence;
}
```

---

### TWIN-WARN-7: No AudioContext Suspension Test Coverage (N=1)

**Source**: Twin Technical (Testing Recommendations)
**N=1 Note**: Test gap

**Problem**: No tests for behavior when `audioContext.state === 'suspended'` (common on mobile).

**Fix**: Add test fixture:
```javascript
const mockSuspendedContext = { state: 'suspended', currentTime: 0 };
// Test that features gracefully degrade
```

---

## SUGGESTION Issues

### From Twin Technical (N=1)

| ID | Description | Priority |
|----|-------------|----------|
| TWIN-SUG-T1 | Reduce Meyda features (spectralRolloff, zcr unused) | Low |
| TWIN-SUG-T2 | Add BPM detection retry with exponential backoff | Low |
| TWIN-SUG-T3 | Add JSDoc comments to new methods | Low |
| TWIN-SUG-T4 | Use EMA for performance tracker baseline | Low |
| TWIN-SUG-T5 | Make visual style categories configurable | Low |

### From Twin Creative (N=1)

| ID | Description | Priority |
|----|-------------|----------|
| TWIN-SUG-C1 | Add debug overlay showing BPM/mood/switch timing | Medium |
| TWIN-SUG-C2 | Document Phase 6 (ML) as optional enhancement | Low |
| TWIN-SUG-C3 | Document memory management for long sessions | Low |
| TWIN-SUG-C4 | Add error recovery code examples | Low |
| TWIN-SUG-C5 | Make PRE_DROP_LEAD_TIME > blend duration | Medium |

---

## Resolution Plan

### Must Fix Before Implementation (CRITICAL + N=2 WARNING)

1. **TWIN-CRIT-1**: Add AudioContext state check before Meyda `get()`
2. **TWIN-CRIT-2**: Use `audioContext.currentTime` consistently for all timing
3. **TWIN-WARN-1**: Replace `Math.random()` with `this.rng()` in drop selection
4. **TWIN-WARN-2**: Remove `spectralProfile` from Task 6.2 documentation
5. **TWIN-WARN-3**: Remove `spectralProfile` assertion from test
6. **TWIN-WARN-4**: Change `pendingSwitchOnBar` to `pendingSwitchOnPhrase` in tests

### Optional for Greenfield (N=1 WARNING + SUGGESTION)

- TWIN-WARN-5, TWIN-WARN-6, TWIN-WARN-7: Can be addressed during implementation
- All SUGGESTION items: Nice-to-have improvements

---

## Cross-References

- **Plan Document**: `docs/plans/intelligent-preset-selector-improvements.md`
- **Twin Technical Review**: `docs/reviews/2026-03-25-intelligent-preset-selector-twin-technical.md`
- **Twin Creative Review**: `docs/reviews/2026-03-25-intelligent-preset-selector-twin-creative.md`
- **Previous Review Issue**: `docs/issues/intelligent-preset-selector-plan-review.md` (Codex + Gemini)
- **CLAUDE.md Rules**: Lines 13, 31 (deterministic RNG requirement)

---

## Verification Checklist

All fixes applied in plan v4.1:

- [x] AudioContext state checked before Meyda `get()` (TWIN-CRIT-1) - line 248
- [x] All timing uses `audioContext.currentTime` (TWIN-CRIT-2) - line 497
- [x] No `Math.random()` in `_selectPresetForDrop()` (TWIN-WARN-1) - line 665
- [x] No `spectralProfile` in Task 6.2 docs (TWIN-WARN-2) - line 1531
- [x] No `spectralProfile` assertion in tests (TWIN-WARN-3) - line 1995
- [x] Tests use `pendingSwitchOnPhrase` not `pendingSwitchOnBar` (TWIN-WARN-4) - lines 1883-1904

---

## Resolution Summary

| Issue | Fix Applied | Plan Line |
|-------|-------------|-----------|
| TWIN-CRIT-1 | Added `this.audioContext?.state === 'running'` check | 248 |
| TWIN-CRIT-2 | `detectBuildup()` now accepts `audioContextTime` parameter | 497 |
| TWIN-WARN-1 | Changed `Math.random()` to `this.rng()` | 665 |
| TWIN-WARN-2 | Removed `spectralProfile` from documentation list | 1531 |
| TWIN-WARN-3 | Removed `spectralProfile` assertion from test | 1995 |
| TWIN-WARN-4 | Changed all `pendingSwitchOnBar` to `pendingSwitchOnPhrase` | 1883-1904 |

**Plan updated to v4.1** - All 6 must-fix items resolved.

---

*Issue created from twin review workflow on 2026-03-25*
*Issue resolved: 2026-03-25*
