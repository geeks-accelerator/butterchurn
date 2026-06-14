# Taxonomy Implementation Audit

**Created:** 2026-06-14
**Resolved:** 2026-06-14 (this audit)
**Status:** ✅ Resolved — but see superseding review below
**Priority:** Medium (wiring gap blocking Phase 5 runtime functionality)
**Validation Level:** N=1 (code audit + test verification)

> **Post-audit findings (2026-06-14):** A subsequent code review surfaced
> three additional runtime gaps this audit didn't catch:
> (1) the unified v2.2 fingerprint file `butterchurnPresetsAll.fingerprints.json`
> exists but isn't in `PRESET_PACK_NAMES` so the loader never loads it;
> (2) `alaskaButter.fingerprints.json` is v2.2 but missing the four new
> derived fields; (3) the selector doesn't populate `target.visualStyle` /
> `target.musicalResponsiveness`, so Stage 1 categorical filtering is a
> no-op in production even with the matcher correctly wired.
>
> Full review: [parent-repo:docs/issues/2026-06-14-butterchurn-taxonomy-implementation-review.md](../../../docs/issues/2026-06-14-butterchurn-taxonomy-implementation-review.md).
> This audit's "comprehensive" framing was too narrow; it focused on
> imports/exports/tests but not on data-layer or target-population gaps.

---

## Source Documents

| Document | Relationship |
|----------|--------------|
| [2026-06-12-butterchurn-taxonomy-improvements.md](../../../docs/plans/2026-06-12-butterchurn-taxonomy-improvements.md) | Implementation plan (parent repo) |
| [parent-repo:docs/issues/2026-06-14-butterchurn-taxonomy-implementation-review.md](../../../docs/issues/2026-06-14-butterchurn-taxonomy-implementation-review.md) | **Superseding post-implementation review** with full runtime audit |
| [intelligent-preset-selector-improvements.md](../plans/intelligent-preset-selector-improvements.md) | Related selector improvements |
| [selector-optimization-improvements.md](../plans/selector-optimization-improvements.md) | Future optimizations |

---

## Summary

A comprehensive audit was performed on the taxonomy implementation to identify:
1. Placeholders and TODO comments
2. 501 (Not Implemented) status codes
3. Incomplete component wiring

**Result:** One critical wiring gap found and fixed. Pre-existing TODOs documented for future work. Validation pipeline is complete but standalone.

**Scope note (2026-06-14, post-hoc):** "Comprehensive" was overstated. This
audit verified that taxonomy *code* is complete and wired; it did **not**
verify that the *data* the code operates on actually contains the new fields,
nor that the selector populates the target shape the matcher needs at Stage 1.
Those gaps are tracked in the superseding review linked above.

---

## Audit Scope

### Files Audited

| Category | Files |
|----------|-------|
| Taxonomy modules | `src/taxonomy/*.js` (6 files) |
| Taxonomy config | `src/config/taxonomyConfig.js` |
| Validation pipeline | `tools/validation/*.js`, `tools/validation/*.py` |
| Selector integration | `src/intelligentPresetSelector.js` |
| Test files | `test/taxonomy/*.test.js` (5 files) |

### Audit Methods

1. **Grep search** for `TODO`, `FIXME`, `XXX`, `HACK`, `placeholder`, `not implemented`, `501`
2. **Import analysis** to trace component usage
3. **Test coverage** verification
4. **Runtime flow** verification via integration tests

---

## Critical Finding: HierarchicalMatcher Wiring Gap

**Severity:** Critical (blocked Phase 5 runtime functionality)
**Status:** ✅ FIXED (2026-06-14)

### Issue Description

The `HierarchicalMatcher` class was:
- ✅ Implemented in `src/taxonomy/hierarchicalMatcher.js`
- ✅ Exported from `src/taxonomy/index.js`
- ✅ Tested with 12 unit tests in `test/taxonomy/hierarchicalMatcher.test.js`
- ❌ **NOT imported or used in `intelligentPresetSelector.js`**

The selector was still using its legacy inline scoring path (`getCandidates()` + `scorePreset()`) instead of the new two-stage filter+score matcher.

### Fix Applied

**File:** `src/intelligentPresetSelector.js`

1. **Added import** (line 26):
```javascript
import { HierarchicalMatcher } from './taxonomy/hierarchicalMatcher.js';
```

2. **Added properties** (constructor):
```javascript
this.hierarchicalMatcher = null;
this.useHierarchicalMatcher = true; // Feature flag for gradual rollout
```

3. **Added initialization method**:
```javascript
_initializeHierarchicalMatcher() {
    if (!this.db?.presets) return;
    this.hierarchicalMatcher = new HierarchicalMatcher(this.db, {
        logMatching: this.debugMode
    });
}
```

4. **Added matcher selection method**:
```javascript
_selectWithHierarchicalMatcher(features, mood = null) {
    // Stage 0: Pre-filter recent/problematic
    const eligibleHashes = allHashes.filter(h =>
        !this.recentPresets.includes(h) &&
        !this.problematicPresets.has(h) &&
        (this.currentHash ? h !== this.currentHash : true)
    );

    // Call matcher with full context
    const result = this.hierarchicalMatcher.findMatches(target, {
        candidateHashes: eligibleHashes,
        currentHash: this.currentHash,
        deviceTier: this.deviceTier,
        mood,
        detectedBpm: this.audioAnalyzer?.detectedBPM ?? null,
        limit: 30
    });

    // Weighted random selection from top 3
    // ...
}
```

5. **Updated `selectBestPresetWithLogic()`** to use matcher when available:
```javascript
selectBestPresetWithLogic(features, mood = null) {
    if (this.useHierarchicalMatcher && this.hierarchicalMatcher) {
        return this._selectWithHierarchicalMatcher(features, mood);
    }
    // Fallback to legacy path...
}
```

6. **Called initialization** in constructor and `updateFingerprintDatabase()`.

### Verification

10 integration tests added in `test/taxonomy/selectorIntegration.test.js`:
- `initializes matcher when database is provided`
- `matcher has correct database reference`
- `feature flag enables matcher by default`
- `returns result with hierarchical_matcher method`
- `includes matchDepth in logic`
- `returns valid preset hash`
- `respects mood parameter`
- `uses legacy method when flag disabled`
- `uses legacy method when matcher is null`
- `updates matcher with new database`

**Test Results:** 60/60 taxonomy tests pass (50 original + 10 integration).

---

## Pre-existing TODOs (Not Taxonomy-Related)

The following TODOs exist in the codebase but are **not related to taxonomy implementation**. They are documented here for completeness.

### TODO-1: Audio Lookahead

**File:** `src/intelligentPresetSelector.js:155`
**Status:** Open (future optimization)

```javascript
// TODO: Implement audio lookahead (~1-2 seconds) to anticipate drops/energy changes
// See: docs/plans/selector-optimization-improvements.md (Phase 1)
```

**Context:** Currently the selector is reactive (switches AFTER energy changes). Audio lookahead would allow scheduling transitions BEFORE drops hit, aligning with musical structure.

**Related Plan:** `docs/plans/selector-optimization-improvements.md` Phase 1

---

### TODO-2: Reverse Index Scaling

**File:** `src/intelligentPresetSelector.js:281`
**Status:** Open (future optimization)

```javascript
// TODO: Fix scaling issue - building reverse mapping from preset names to hash IDs
// See: docs/plans/selector-optimization-improvements.md (Phase 2)
```

**Context:** The selector builds a reverse mapping at runtime which doesn't scale well with large preset collections. Solution: pre-compute reverse index at build time.

**Related Plan:** `docs/plans/selector-optimization-improvements.md` Phase 2

---

### TODO-3: WebGL DrawArraysInstanced

**Files:** 
- `src/rendering/waves/customWaveform.js:410`
- `src/rendering/shapes/customShape.js:703`
- `src/rendering/waves/basicWaveform.js:637`

**Status:** Open (WebGL optimization)

```javascript
// TODO: use drawArraysInstanced
```

**Context:** Performance optimization for WebGL rendering. Would batch draw calls for improved GPU utilization.

---

## Validation Pipeline Status

**Status:** ✅ Complete but standalone

The Phase 8 validation pipeline is fully implemented but is a manual tool, not integrated into CI.

### Components

| File | Purpose | Status |
|------|---------|--------|
| `tools/validation/validate-taxonomy.js` | Puppeteer orchestrator | ✅ Complete |
| `tools/validation/analyze_frames.py` | Tier 1 Python/OpenCV analysis | ✅ Complete |
| `tools/validation/llm_validate.py` | Tier 2 Claude Vision validation | ✅ Complete |
| `tools/validation/test-audio.js` | Synthetic audio generator | ✅ Complete |
| `test/validation-render.html` | Headless render page | ✅ Complete |

### Usage

```bash
# Prerequisites
pip install colorthief opencv-python-headless numpy pillow anthropic
python3 -m http.server 8192  # from butterchurn root

# Run validation
node tools/validation/validate-taxonomy.js --sample 50 --llm-validate
```

### Future Work

- Consider integrating into CI for regression detection
- Add real-audio test clips (requires licensing)
- Tune motion→energyLabel thresholds based on LLM validation results

---

## Taxonomy Modules Audit

### No Placeholders Found

All taxonomy modules are complete with no TODO/FIXME comments:

| Module | Functions | Status |
|--------|-----------|--------|
| `energyLabel.js` | `deriveEnergyLabel()`, `getEnergyLabelInfo()`, `getAllEnergyLabels()` | ✅ |
| `musicalResponsiveness.js` | `deriveMusicalResponsiveness()`, `determineTargetResponsiveness()` | ✅ |
| `reliability.js` | `deriveReliabilityTier()`, `tiersAllowedForDevice()` | ✅ |
| `colorAnalysis.js` | `analyzePresetColor()`, `extractStaticColors()`, `classifyRgbColor()`, etc. | ✅ |
| `visualStyleSimilarity.js` | `getSimilarStyles()`, `areStylesSimilar()`, `getAllVisualStyles()` | ✅ |
| `hierarchicalMatcher.js` | `findMatches()`, `filterByCategoricals()`, `scoreContinuous()`, `scoreOne()` | ✅ |
| `index.js` | Re-exports all modules | ✅ |

### Taxonomy Config Complete

`src/config/taxonomyConfig.js`:
- Stage 1 categorical dimensions: `['visualStyle', 'musicalResponsiveness', 'reliabilityTier', 'dominantHue']`
- Stage 2 continuous weights: sum to 1.0, aligned with live selector weights
- All thresholds documented

---

## Test Coverage Summary

| Test Suite | Tests | Status |
|------------|-------|--------|
| `energyLabel.test.js` | 12 | ✅ Pass |
| `musicalResponsiveness.test.js` | 11 | ✅ Pass |
| `reliability.test.js` | 11 | ✅ Pass |
| `hierarchicalMatcher.test.js` | 16 | ✅ Pass |
| `selectorIntegration.test.js` | 10 | ✅ Pass |
| **Total** | **60** | **✅ All Pass** |

Visual regression tests: 6 pre-existing WASM-related failures (unrelated to taxonomy).

---

## Commits

| Repo | Commit | Description |
|------|--------|-------------|
| butterchurn | `87a4704` | `feat(selector): wire HierarchicalMatcher into intelligent preset selection` |
| marketing-studio | `c4b7c92` | `docs: update taxonomy plan — HierarchicalMatcher wired into selector` |

---

## Acceptance Criteria

### Critical (Resolved)
- [x] HierarchicalMatcher imported in selector
- [x] Matcher initialized when database loads
- [x] `selectBestPresetWithLogic()` uses matcher when available
- [x] Feature flag for gradual rollout
- [x] Legacy fallback preserved
- [x] Integration tests verify wiring

### Documentation (Resolved)
- [x] Plan updated to remove "not yet wired" limitation
- [x] Plan updated with wiring completion section
- [x] CLAUDE.md updated with integration status
- [x] This audit issue created

### Future Work (Not Blocking)
- [ ] TODO-1: Audio lookahead (Phase 1 optimization)
- [x] TODO-2: Reverse index scaling — **closed by H2 (alphabetically-sorted v2.2 indices) on `178d238`**
- [ ] TODO-3: WebGL drawArraysInstanced (rendering optimization)
- [ ] CI integration for validation pipeline

---

## Cross-references to closure work (added 2026-06-14)

This audit was superseded by a deeper review that found three runtime gaps it didn't catch ([parent-repo issue](../../../docs/issues/2026-06-14-butterchurn-taxonomy-implementation-review.md)). All 11 review items + Phase 9 follow-ups + §G2/G4/G10 + §H1–H5 pre-import readiness were closed across these commits:

- `87a4704` — wire HierarchicalMatcher into selector (this audit's original finding)
- `6e19777` — P1.1a/b, P1.2, P2.1, P2.2, P3.1, P3.2, P4.1, P4.2, P5.1, P5.2
- `0b4a95d` — Phase 9 hooks (genre.timingMultiplier, mood-shift trigger, DROP-SOURCE CONTRACT)
- `a942bc9` — §G2 mood smoothing, §G4 match-depth telemetry, §G10 logging spec
- `178d238` — §H1–H5 pre-import readiness (algorithm canonical, indices rebuilt, determinism harness, `recentPresetsMax: 100`, latency benchmark)

Test count over time: 60 → 72 → 80 → 99 → **111 taxonomy** / **256 non-visual** — all green.

---

*Created: 2026-06-14*
*Audit performed by: Claude Opus 4.5*
*Validation: Code audit + 60 passing tests (now 111 after closure work)*
