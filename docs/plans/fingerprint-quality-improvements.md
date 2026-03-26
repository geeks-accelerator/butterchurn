# Fingerprint Quality Improvements Plan

**Created:** 2026-03-25
**Status:** Draft - All PRE-1 through PRE-9 fixes applied
**Priority:** High
**Depends On:** [intelligent-preset-selector-improvements.md](intelligent-preset-selector-improvements.md) Phase 5
**Review Reference:** [fingerprint-quality-review-2026-03-25.md](../reviews/fingerprint-quality-review-2026-03-25.md)
**Pre-Implementation Review:** [2026-03-25-fingerprint-plan-review-findings.md](../issues/2026-03-25-fingerprint-plan-review-findings.md)

---

## Overview

This plan addresses all issues identified in the fingerprint quality review. The implementation is organized into phases by priority and dependency.

### Impact Summary
- **Affected Presets:** 495 (entire Alaska Butter collection)
- **Critical Issues:** 3 (fractal moods, complexity threshold, misclassifications)
- **High Priority:** 2
- **Medium Priority:** 6
- **Low Priority:** 6

### Success Criteria
- Fractal presets have appropriate mystical/hypnotic moods (0% aggressive > 0.8)
- Complexity threshold reachable (>50 presets above threshold)
- Abstract misclassification rate < 10%
- Color profile distribution more balanced (cool > 20 presets)

---

## Codebase Audit

**Date:** 2026-03-25

### Architecture Overview

The system uses **two complementary analysis approaches** - NOT duplicates:

| Analysis Type | File | Purpose | When Executed |
|--------------|------|---------|---------------|
| **Static (Fingerprints)** | `tools/generate-fingerprints.js` | Analyze preset equations | Build time |
| **Dynamic (Audio)** | `src/audio/advancedAnalyzer.js` | Analyze live audio | Runtime |
| **Matching** | `src/intelligentPresetSelector.js` | Combine both for scoring | Runtime |

### Implementation Locations

| Feature | Static (Fingerprint) | Dynamic (Audio) | Selection |
|---------|---------------------|-----------------|-----------|
| Mood | `deriveMoodAffinities()` | `detectMood()` | `scorePreset()` |
| Energy | `analyzeEnergy()` | `calculateFeatures()` | `scorePreset()` |
| Complexity | `analyzeComplexity()` | - | `scorePreset()` |
| Visual Style | `detectVisualStyle()` | - | **NOT USED** → Wire in Phase 3.5 |
| Color Profile | `extractColorProfile()` | - | **NOT USED** → Wire in Phase 3.5 |
| Beat Sync | `analyzeBeatSync()` | - | Minimal use |
| Genre | - | `detectGenre()` | `shouldSwitchPreset()` |
| BPM | `calculateOptimalBpm()` | `detectBPM()` | `scorePreset():1608-1617` (PRE-3: already wired) |
| Buildup | - | `detectBuildup()` | `shouldSwitchPreset()` |

### Findings: No True Duplication

**Confirmed:** The following are **complementary**, not duplicates:
- `deriveMoodAffinities()` (static) vs `detectMood()` (live) - Different inputs/outputs
- `analyzeEnergy()` (static) vs energy in `calculateFeatures()` (live) - Different data sources

### Findings: Underutilized Features (Wiring Gaps)

These fingerprint fields are **generated but NOT fully used** in preset selection:

| Field | Generated In | Current Status | Action Required |
|-------|-------------|----------------|-----------------|
| `colorProfile` | `generate-fingerprints.js:371` | **NOT WIRED** | Wire to scoring in Phase 3.5 |
| `visualStyle` | `generate-fingerprints.js:316` | **NOT WIRED** | Wire to scoring in Phase 3.5 |
| `optimalBpm` | `generate-fingerprints.js:448` | **ALREADY WIRED** (lines 1608-1617) | PRE-3: No action needed |

**Recommendation:** Phase 3.5 wires `colorProfile` and `visualStyle` only. BPM is already implemented.

### Findings: Test File Wiring Gap

**Issue:** `test/tools/generateFingerprints.test.js` contains **inline implementations** that are OUT OF SYNC with actual code.

```javascript
// TEST FILE (lines 18-32) - STALE COPY:
function extractColorProfile(preset) {
    const equations = (preset.init_eqs_eel || '');
    const redUsage = (equations.match(/red\s*=/gi) || []).length;
    // OLD logic - doesn't match current implementation!
}

// ACTUAL CODE (lines 371-437) - CURRENT:
extractColorProfile(preset) {
    const allEqs = this.getAllEquations(preset);
    const baseVals = preset.baseVals || {};
    // Wave colors, shape colors, keywords, gamma/brightness...
}
```

**Resolution:** Phase 5 addresses this - export functions and import in tests.

### Code Reuse Opportunities

When implementing fixes, **reuse existing code**:

| New Feature | Reuse From | How |
|-------------|-----------|-----|
| New mood types (mystical, etc.) | `deriveMoodAffinities()` | Extend existing styleBoosts object |
| Fractal complexity boost | `analyzeComplexity()` | Add condition, don't create new function |
| Keyword detection | `detectVisualStyle()` | Add to existing function, don't duplicate |
| Organic mood caps | `deriveMoodAffinities()` | Add post-processing in existing function |

### Files to Modify (Single Source of Truth)

All fingerprint generation changes should be made in **ONE file**:
- **`tools/generate-fingerprints.js`** - Single source for all static analysis

Do NOT create new files for:
- Mood vocabulary expansion
- Complexity scaling
- Visual style keyword detection
- Color profile improvements

### Selector Wiring (New Work Required)

The following **new wiring** is needed in `src/intelligentPresetSelector.js`:

```javascript
// Currently NOT implemented - needs to be added:

// 1. Color profile matching
scoreForColorProfile(preset, currentMood) {
    // Use preset.fingerprint.colorProfile
}

// 2. Visual style continuity
scoreForVisualStyle(currentPreset, candidatePreset) {
    // Use preset.fingerprint.visualStyle
}

// 3. BPM matching
scoreForBpmMatch(preset, detectedBpm) {
    // Use preset.fingerprint.optimalBpm
}
```

---

## Phase 0: Prerequisites (PRE-2)

**Estimated Effort:** 15 minutes
**Dependencies:** None
**Files:** `tools/generate-fingerprints.js`

### 0.1 Add Import Guard for Test Compatibility

**Issue (PRE-2):** The file executes `main()` unconditionally at line 1005. Importing for tests would trigger CLI execution.

**Solution:** Add import guard before `main()` call.

```javascript
// At end of tools/generate-fingerprints.js, replace:
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

// With:
// PRE-2 FIX: Only run CLI when executed directly, not when imported
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

// Export for testing
export { PresetFingerprintGenerator };
```

**Acceptance Criteria:**
- [ ] Generator can be imported in tests without side effects
- [ ] CLI still works when run directly: `node tools/generate-fingerprints.js`

---

## Phase 1: Critical Fixes

**Estimated Effort:** 4-6 hours
**Dependencies:** Phase 0 complete
**Files:** `tools/generate-fingerprints.js`

### 1.1 Fix Fractal Mood System (FRC-1, FRC-2)

**Issue:** All 95 fractal presets have identical aggressive mood structure.

**Solution:** Expand mood vocabulary and add fractal-specific mood derivation.

> **PRE-4 NOTE (Forward Compatibility):** The new mood types (mystical, hypnotic, psychedelic, dreamy, meditative) are generated in fingerprints but NOT yet matched at runtime. The `detectMood()` function in `advancedAnalyzer.js` only returns 5 labels (aggressive, relaxed, happy, electronic, acoustic).
>
> **Decision:** Accept as forward-compatible. These moods improve fingerprint diversity and enable future runtime detection enhancements without regenerating fingerprints.
>
> **Future Work:** Add runtime detection for new mood types in `src/audio/advancedAnalyzer.js:detectMood()`.

```javascript
// In deriveMoodAffinities(), add new moods:
const affinities = {
    aggressive: 0.5,
    relaxed: 0.5,
    happy: 0.5,
    electronic: 0.5,
    acoustic: 0.5,
    // NEW v2.1 moods (PRE-4: forward-compatible, runtime detection is future work):
    mystical: 0.5,
    hypnotic: 0.5,
    psychedelic: 0.5,
    dreamy: 0.5,
    meditative: 0.5
};

// Add fractal-specific overrides:
const styleBoosts = {
    fractal: {
        hypnotic: 0.4,
        mystical: 0.3,
        aggressive: -0.3,  // REDUCE aggressive
        relaxed: 0.2
    },
    // ... existing styles
};
```

**Acceptance Criteria:**
- [ ] 0% of fractals have aggressive > 0.8
- [ ] 80%+ of fractals have hypnotic > 0.6
- [ ] Unique mood combinations > 50 (currently 1)
- [ ] PRE-4: New moods stored in fingerprints (runtime matching is future work)

### 1.2 Fix Complexity Scaling (EXT-2, FRC-3)

**Issue:** Max complexity is 0.35, threshold is 0.5 (unreachable).

**Solution:** Normalize complexity to 0-1 range and add visual-style-specific boosts.

```javascript
// In analyzeComplexity(), add normalization:
analyzeComplexity(preset) {
    let complexity = 0;

    // Existing calculations...
    const activeShapes = (preset.shapes || []).filter(s => s.enabled).length;
    complexity += activeShapes * 0.15;  // Increased from 0.1

    const activeWaves = (preset.waves || []).filter(w => w.enabled).length;
    complexity += activeWaves * 0.15;   // Increased from 0.1

    // Equation length contributes more
    if (preset.pixel_eqs_str && preset.pixel_eqs_str.length > 50) {
        complexity += Math.min(0.3, preset.pixel_eqs_str.length / 500);
    }

    // PRE-8 ENHANCEMENT: More specific fractal detection
    // Simple zoom+rot check can misidentify non-fractals
    const allEqs = this.getAllEquations(preset);
    const baseVals = preset.baseVals || {};
    const pixelEqs = preset.pixel_eqs_str || '';

    // Fractal-like patterns: zoom + rot + (high decay OR trig functions)
    const hasZoomRot = allEqs.includes('zoom') && allEqs.includes('rot');
    const hasHighDecay = (baseVals.decay || 0) > 0.95;
    const hasTrigFunctions = /\b(sin|cos|tan)\b/.test(pixelEqs);

    if (hasZoomRot && (hasHighDecay || hasTrigFunctions)) {
        complexity += 0.30;  // Strong fractal boost
    } else if (hasZoomRot) {
        complexity += 0.15;  // Weak fractal boost (might be simple zoom effect)
    }

    // Normalize to 0-1 (cap removed, use actual range)
    return Math.min(1, complexity);
}
```

**Acceptance Criteria:**
- [ ] Complexity range spans 0-0.8+
- [ ] Fractal presets average complexity > 0.5
- [ ] 50+ presets above complexity threshold 0.5

### 1.3 Fix Abstract Misclassifications (ABS-2)

**Issue:** 25 presets (22%) classified as abstract but should be fractal/particle/organic.

**Solution:** Enhance visual style detection with name/keyword analysis.

```javascript
// In detectVisualStyle(), add keyword detection:
detectVisualStyle(preset) {
    const styles = [];
    const allEqs = this.getAllEquations(preset);
    const presetName = (preset.name || '').toLowerCase();

    // Keyword-based detection (NEW)
    // PRE-6 FIX: Use word boundary regex to avoid false positives
    // e.g., "not a fractal" should NOT match "fractal"
    const fractalKeywords = ['fractal', 'spiral', 'mandala', 'zoom', 'iteration'];
    const particleKeywords = ['particle', 'spark', 'star', 'dot', 'pixel', 'sperm'];
    const organicKeywords = ['plasma', 'liquid', 'fluid', 'flow', 'wave', 'ocean'];

    // PRE-6 FIX: Use word boundary regex instead of includes()
    const matchesKeyword = (keywords) =>
        keywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(presetName));

    if (matchesKeyword(fractalKeywords)) {
        styles.push('fractal');
    }
    if (matchesKeyword(particleKeywords)) {
        styles.push('particle');
    }
    if (matchesKeyword(organicKeywords)) {
        styles.push('organic');
    }

    // Existing equation-based detection...
    // ...

    return styles;
}
```

**Acceptance Criteria:**
- [ ] Misclassification rate < 10%
- [ ] "fractal" keyword presets → fractal style
- [ ] "particle/spark/star" presets → particle style

---

## Phase 2: High Priority Fixes

**Estimated Effort:** 2-3 hours
**Dependencies:** Phase 1 complete
**Files:** `tools/generate-fingerprints.js`

### 2.1 Fix Organic Electronic Bias (ORG-1, ORG-3)

**Issue:** 29 organic presets have electronic > acoustic; 9 have aggressive > 0.9.

**Solution:** Add style-aware mood modifiers.

```javascript
// After initial mood derivation, apply style-specific caps:
if (visualStyle === 'organic' || existingStyles.includes('organic')) {
    // PRE-7 FIX: Directly enforce acoustic > electronic relationship
    // Old formula Math.max(acoustic, electronic + 0.1) didn't work when electronic was high
    if (affinities.electronic > affinities.acoustic) {
        const avg = (affinities.electronic + affinities.acoustic) / 2;
        affinities.acoustic = Math.min(1, avg + 0.1);
        affinities.electronic = Math.max(0, avg - 0.1);
    }
    affinities.aggressive = Math.min(affinities.aggressive, 0.75);  // Cap
    affinities.relaxed = Math.max(affinities.relaxed, 0.5);  // Floor
}
```

**Acceptance Criteria:**
- [ ] <15% of organic presets have aggressive > 0.75 (currently 25.7%)
- [ ] <10% of organic presets have electronic > acoustic

### 2.2 Expand Cool Color Detection (CLR-1)

**Issue:** Only 7 presets tagged as cool (vs 48 vivid).

**Solution:** Lower threshold and add purple/violet detection.

```javascript
// In extractColorProfile(), expand cool detection:

// Check for purple/violet (maps to cool)
if (waveB > 0.5 && waveR > 0.4 && waveG < 0.4) coolScore += 2;  // Purple

// Lower threshold for cool
if (waveB > 0.5 && waveB > waveR && waveB > waveG) coolScore += 2;  // Was > 0.6

// Add equation keyword detection
if (allEqs.includes('purple') || allEqs.includes('violet')) coolScore += 1;
```

**Acceptance Criteria:**
- [ ] Cool category > 20 presets (currently 7)
- [ ] Purple-themed presets detected as cool

---

## Phase 3: Medium Priority Fixes

**Estimated Effort:** 2-3 hours
**Dependencies:** Phase 2 complete
**Files:** `tools/generate-fingerprints.js`, `src/intelligentPresetSelector.js`

### 3.1 Reduce Neutral Color Dominance (ABS-1)

> **PRE-9 NOTE (Consolidation):** This task is tightly coupled with Phase 2.2 (Cool Color Detection). Both modify `extractColorProfile()` and affect the same thresholds. **Recommendation:** Implement 3.1 immediately after 2.2 in a single editing session for coherent tuning.

**Issue:** 80% of abstract presets have neutral colorProfile.

**Solution:** Make color detection more sensitive.

```javascript
// Lower thresholds for all color categories
// PRE-9: Implement alongside Phase 2.2 for holistic tuning
if (maxScore >= 1.5) {  // Was >= 2
    const dominant = Object.entries(scores).find(([_, v]) => v === maxScore)?.[0];
    return dominant;
}
```

### 3.2 Adjust BPM Thresholds (EXT-3)

**Issue:** BPM extremes (>160, <70) never triggered.

**Solution:** Add threshold constants and wire into existing code.

> **PRE-5 FIX:** These constants don't exist in the codebase yet. Add them and wire into the usage locations below.

```javascript
// ADD to src/intelligentPresetSelector.js at top of file (after imports):
const BPM_THRESHOLDS = {
    veryLow: 80,    // Was 70
    low: 100,       // Was 90
    high: 140,      // Was 150
    veryHigh: 160   // Was 170
};

// USAGE LOCATION 1: In shouldSwitchPreset() genre-based timing
// Replace hardcoded BPM checks with:
if (this.audioAnalyzer?.detectedBPM > BPM_THRESHOLDS.high) {
    // Fast music - more frequent switches
}

// USAGE LOCATION 2: In scorePreset() for BPM-based scoring
// The existing code at lines 1608-1617 already handles optimalBpm matching.
// These thresholds are for FILTERING candidates, not scoring.

// USAGE LOCATION 3: In selectBestPresetWithLogic() for candidate filtering
const bpm = this.audioAnalyzer?.detectedBPM;
if (bpm && bpm > BPM_THRESHOLDS.veryHigh) {
    // Filter to only high-energy presets for very fast music
    candidates = candidates.filter(c =>
        this.db.presets[c]?.fingerprint?.energy > 0.6
    );
}
```

### 3.3 Adjust Low Energy Threshold (EXT-1)

**Issue:** Only 4.4% of presets below 0.2 energy threshold.

**Solution:** Add threshold constants and wire into existing code.

> **PRE-5 FIX:** These constants don't exist in the codebase yet. Add them and wire into the usage locations below.

```javascript
// ADD to src/intelligentPresetSelector.js at top of file (after BPM_THRESHOLDS):
const ENERGY_THRESHOLDS = {
    low: 0.35,      // Was 0.2
    medium: 0.6,
    high: 0.8
};

// USAGE LOCATION 1: In selectBestPresetWithLogic() for energy-based filtering
const audioEnergy = features.beatStrength || 0;
if (audioEnergy < ENERGY_THRESHOLDS.low) {
    // Low energy audio - prefer calm presets
    candidates = candidates.filter(c =>
        this.db.presets[c]?.fingerprint?.energy < ENERGY_THRESHOLDS.medium
    );
}

// USAGE LOCATION 2: In scorePreset() to boost energy-appropriate presets
const presetEnergy = fp.energy || 0.5;
if (audioEnergy > ENERGY_THRESHOLDS.high && presetEnergy > ENERGY_THRESHOLDS.high) {
    score += 0.05;  // Bonus for high-energy match
}
```

### 3.4 Add Energy Penalty for Relaxed (MOD-1)

**Issue:** 1 preset with energy 0.65 has relaxed: 1.0.

**Solution:** Add cross-validation in `deriveMoodAffinities()` (reuse existing function).

```javascript
// After mood derivation in deriveMoodAffinities():
if (energy > 0.6) {
    affinities.relaxed -= 0.15;
}

// Prevent contradictions
if (affinities.aggressive > 0.7 && affinities.relaxed > 0.7) {
    if (energy > 0.5) {
        affinities.relaxed -= 0.25;
    } else {
        affinities.aggressive -= 0.25;
    }
}
```

### 3.5 Wire Underutilized Fingerprint Fields (WIRE-1)

**Issue:** Several fingerprint fields are generated but NOT used in preset selection.

**Audit Finding:** See "Codebase Audit > Underutilized Features" section above.

**Solution:** Add scoring functions in `src/intelligentPresetSelector.js` that use existing fingerprint data.

```javascript
// PRE-1 FIX: Add to scorePreset() (not calculateMatchScore - that function doesn't exist)
// In intelligentPresetSelector.js scorePreset() method, add these scoring components:

// 1. Color profile matching (uses existing fingerprint.colorProfile)
// Add to scorePreset() after existing mood scoring:
if (fp.colorProfile) {
    const colorProfile = fp.colorProfile;
    // Warm colors match happy/aggressive moods
    if (colorProfile === 'warm' && (mood?.label === 'happy' || mood?.label === 'aggressive')) {
        score += 0.05;
    }
    // Cool colors match relaxed/electronic moods
    if (colorProfile === 'cool' && (mood?.label === 'relaxed' || mood?.label === 'electronic')) {
        score += 0.05;
    }
    // Vivid matches high energy
    if (colorProfile === 'vivid' && (features.beatStrength || 0) > 0.7) {
        score += 0.05;
    }
}

// 2. Visual style continuity (uses existing fingerprint.visualStyle)
// Add to scorePreset() after color profile scoring:
if (this.currentHash && fp.visualStyle) {
    const currentFp = this.db.presets[this.currentHash]?.fingerprint;
    const currentStyle = currentFp?.visualStyle;
    const candidateStyle = fp.visualStyle;

    if (currentStyle && candidateStyle) {
        // Same style = smooth transition
        if (currentStyle === candidateStyle) {
            score += 0.05;
        } else {
            // Compatible styles
            const compatible = {
                organic: ['fractal', 'abstract'],
                fractal: ['organic', 'geometric'],
                particle: ['geometric', 'abstract'],
                geometric: ['particle', 'fractal']
            };
            if (compatible[currentStyle]?.includes(candidateStyle)) {
                score += 0.02;
            }
        }
    }
}

// PRE-3 FIX: BPM scoring ALREADY EXISTS at lines 1608-1617
// Do NOT add duplicate BPM scoring - it's already wired in scorePreset()
```

**Reuse:** These additions use EXISTING fingerprint fields - no changes to `generate-fingerprints.js` needed.

**Acceptance Criteria:**
- [ ] Color profile scoring added to `scorePreset()`
- [ ] Visual style continuity scoring added to `scorePreset()`
- [ ] PRE-3: Verify existing BPM scoring at lines 1608-1617 (already wired, no changes needed)

---

## Phase 4: Low Priority Enhancements

**Estimated Effort:** 1-2 hours
**Dependencies:** None (can be done anytime)
**Files:** `tools/generate-fingerprints.js`

### 4.1 Add Yellow/Gold Detection (CLR-3)

```javascript
// Check for yellow/gold (warm)
if (waveR > 0.7 && waveG > 0.6 && waveB < 0.3) warmScore += 2;
if (allEqs.includes('gold') || allEqs.includes('yellow') || allEqs.includes('sun')) {
    warmScore += 1;
}
```

### 4.2 Add Psychedelic Visual Style (ORG-4)

```javascript
// New style for vivid + high energy presets
if (colorProfile === 'vivid' && energy > 0.7) {
    styles.push('psychedelic');
}
```

### 4.3 Increase Mood Variation for Abstract (ABS-3)

```javascript
// Add more variation to abstract presets
if (visualStyle === 'abstract') {
    // Apply random-ish variation based on preset characteristics
    const variation = (complexity - 0.5) * 0.2;
    affinities.happy += variation;
    affinities.electronic += variation;
}
```

### 4.4 Manual Review of Edge Cases

- Review `e49e4736` (GreatWho - Lasershow) - organic with cool color
- Review all presets with vivid + aggressive > 0.85

---

## Phase 5: Test Coverage

**Estimated Effort:** 3-4 hours
**Dependencies:** Phase 1-4 implementation complete
**Files:** `test/tools/generateFingerprints.test.js`, `test/intelligentPresetSelector.test.js`

### 5.1 Fix Wiring Gap: Inline Test Implementations

**Issue:** Current tests in `test/tools/generateFingerprints.test.js` use inline function implementations that are **out of sync** with `tools/generate-fingerprints.js`.

**Current State (BROKEN):**
```javascript
// Test file has OLD implementation:
function extractColorProfile(preset) {
    const equations = (preset.init_eqs_eel || '');
    const redUsage = (equations.match(/red\s*=/gi) || []).length;
    // ... OLD logic that doesn't match actual code
}
```

**Solution:** Export functions from generator and import in tests.

```javascript
// In tools/generate-fingerprints.js, add exports:
export {
    PresetFingerprintGenerator,
    // Or export individual methods for unit testing
};

// In test/tools/generateFingerprints.test.js:
import PresetFingerprintGenerator from '../../tools/generate-fingerprints.js';

const generator = new PresetFingerprintGenerator();
// Use generator.extractColorProfile() instead of inline copy
```

**Acceptance Criteria:**
- [ ] Tests import actual implementation, no inline copies
- [ ] Tests fail when implementation changes (proper wiring)

### 5.2 Unit Tests for New Features

Add tests for all new functionality:

```javascript
describe('Phase 1: Critical Fixes', () => {
    describe('FRC-1/FRC-2: Expanded Mood Vocabulary', () => {
        it('should include new mood types', () => {
            const affinities = generator.deriveMoodAffinities('fractal', 'medium', 'neutral');
            expect(affinities).toHaveProperty('mystical');
            expect(affinities).toHaveProperty('hypnotic');
            expect(affinities).toHaveProperty('psychedelic');
            expect(affinities).toHaveProperty('dreamy');
            expect(affinities).toHaveProperty('meditative');
        });

        it('should reduce aggressive for fractal style', () => {
            const affinities = generator.deriveMoodAffinities('fractal', 'medium', 'neutral');
            expect(parseFloat(affinities.aggressive)).toBeLessThan(0.5);
        });

        it('should boost hypnotic for fractal style', () => {
            const affinities = generator.deriveMoodAffinities('fractal', 'medium', 'neutral');
            expect(parseFloat(affinities.hypnotic)).toBeGreaterThan(0.7);
        });
    });

    describe('EXT-2/FRC-3: Complexity Scaling', () => {
        it('should allow complexity > 0.5', () => {
            const preset = {
                shapes: [{ enabled: true }, { enabled: true }, { enabled: true }],
                waves: [{ enabled: true }, { enabled: true }],
                pixel_eqs_str: 'x'.repeat(500),
                frame_eqs_eel: 'zoom=1.1;rot=0.01;'
            };
            const complexity = generator.analyzeComplexity(preset);
            expect(complexity).toBeGreaterThan(0.5);
        });

        it('should boost complexity for fractal patterns', () => {
            const fractalPreset = {
                frame_eqs_eel: 'zoom=1.1;rot=0.05;'
            };
            const normalPreset = {
                frame_eqs_eel: 'wave=1;'
            };
            const fractalComplexity = generator.analyzeComplexity(fractalPreset);
            const normalComplexity = generator.analyzeComplexity(normalPreset);
            expect(fractalComplexity).toBeGreaterThan(normalComplexity);
        });
    });

    describe('ABS-2: Keyword-Based Style Detection', () => {
        it('should detect fractal from preset name', () => {
            const styles = generator.detectVisualStyle({
                name: 'Flexi - smashing fractals 2.0'
            });
            expect(styles).toContain('fractal');
        });

        it('should detect particle from preset name', () => {
            const styles = generator.detectVisualStyle({
                name: 'martin - sparky particles'
            });
            expect(styles).toContain('particle');
        });

        it('should detect organic from preset name', () => {
            const styles = generator.detectVisualStyle({
                name: 'Waltra - Ice Plasma'
            });
            expect(styles).toContain('organic');
        });
    });
});

describe('Phase 2: High Priority', () => {
    describe('ORG-1/ORG-3: Organic Style Caps', () => {
        it('should cap aggressive at 0.75 for organic', () => {
            // High energy preset that would normally be very aggressive
            const affinities = generator.deriveMoodAffinities('organic', 'fast', 'warm');
            expect(parseFloat(affinities.aggressive)).toBeLessThanOrEqual(0.75);
        });

        it('should ensure acoustic >= electronic for organic', () => {
            const affinities = generator.deriveMoodAffinities('organic', 'medium', 'neutral');
            expect(parseFloat(affinities.acoustic)).toBeGreaterThanOrEqual(
                parseFloat(affinities.electronic)
            );
        });
    });

    describe('CLR-1/CLR-2: Cool Color Detection', () => {
        it('should detect purple as cool', () => {
            const preset = {
                baseVals: { wave_r: 0.6, wave_g: 0.2, wave_b: 0.8 }
            };
            expect(generator.extractColorProfile(preset)).toBe('cool');
        });

        it('should have lower threshold for cool detection', () => {
            const preset = {
                baseVals: { wave_r: 0.3, wave_g: 0.3, wave_b: 0.55 }
            };
            expect(generator.extractColorProfile(preset)).toBe('cool');
        });
    });
});

describe('Phase 3: Medium Priority', () => {
    describe('MOD-1: Energy-Relaxed Cross-Validation', () => {
        it('should reduce relaxed when energy > 0.6', () => {
            // Simulate high energy preset
            const highEnergyAffinities = generator.deriveMoodAffinities(
                'organic', 'fast', 'neutral', 0.8, 0.5
            );
            const lowEnergyAffinities = generator.deriveMoodAffinities(
                'organic', 'slow', 'neutral', 0.3, 0.5
            );
            expect(parseFloat(highEnergyAffinities.relaxed)).toBeLessThan(
                parseFloat(lowEnergyAffinities.relaxed)
            );
        });

        it('should prevent aggressive + relaxed both > 0.7', () => {
            // Any preset should not have both aggressive and relaxed > 0.7
            const affinities = generator.deriveMoodAffinities('particle', 'fast', 'warm', 0.9, 0.9);
            const aggressive = parseFloat(affinities.aggressive);
            const relaxed = parseFloat(affinities.relaxed);
            expect(aggressive > 0.7 && relaxed > 0.7).toBe(false);
        });
    });
});
```

**Acceptance Criteria:**
- [ ] All Phase 1-4 features have corresponding unit tests
- [ ] Tests verify acceptance criteria from each issue

### 5.3 Integration Tests: Fingerprint File Validation

Test the actual generated fingerprint file meets quality criteria:

```javascript
describe('Integration: Fingerprint File Quality', () => {
    let fingerprints;

    beforeAll(() => {
        fingerprints = require('../../presets/alaska-butter/alaskaButter.fingerprints.json');
    });

    describe('Fractal Presets (FRC-1, FRC-2)', () => {
        it('should have 0% fractals with aggressive > 0.8', () => {
            const fractals = Object.values(fingerprints.presets)
                .filter(p => p.fingerprint.visualStyle === 'fractal');
            const highAggressive = fractals.filter(
                p => parseFloat(p.fingerprint.moodAffinities.aggressive) > 0.8
            );
            expect(highAggressive.length).toBe(0);
        });

        it('should have 80%+ fractals with hypnotic > 0.6', () => {
            const fractals = Object.values(fingerprints.presets)
                .filter(p => p.fingerprint.visualStyle === 'fractal');
            const highHypnotic = fractals.filter(
                p => parseFloat(p.fingerprint.moodAffinities.hypnotic) > 0.6
            );
            expect(highHypnotic.length / fractals.length).toBeGreaterThanOrEqual(0.8);
        });

        it('should have > 50 unique mood combinations', () => {
            const fractals = Object.values(fingerprints.presets)
                .filter(p => p.fingerprint.visualStyle === 'fractal');
            const uniqueMoods = new Set(
                fractals.map(p => JSON.stringify(p.fingerprint.moodAffinities))
            );
            expect(uniqueMoods.size).toBeGreaterThan(50);
        });
    });

    describe('Complexity (EXT-2)', () => {
        it('should have > 50 presets above complexity 0.5', () => {
            const highComplexity = Object.values(fingerprints.presets)
                .filter(p => p.fingerprint.complexity > 0.5);
            expect(highComplexity.length).toBeGreaterThan(50);
        });

        it('should have complexity range reaching 0.8+', () => {
            const maxComplexity = Math.max(
                ...Object.values(fingerprints.presets).map(p => p.fingerprint.complexity)
            );
            expect(maxComplexity).toBeGreaterThanOrEqual(0.8);
        });
    });

    describe('Abstract Misclassification (ABS-2)', () => {
        it('should have < 10% misclassification rate', () => {
            const abstracts = Object.values(fingerprints.presets)
                .filter(p => p.fingerprint.visualStyle === 'abstract');
            const misclassified = abstracts.filter(p => {
                const name = (p.names[0] || '').toLowerCase();
                return name.includes('fractal') || name.includes('particle') ||
                       name.includes('spiral') || name.includes('spark');
            });
            expect(misclassified.length / abstracts.length).toBeLessThan(0.1);
        });
    });

    describe('Color Profile Distribution (CLR-1)', () => {
        it('should have > 20 cool presets', () => {
            const cool = Object.values(fingerprints.presets)
                .filter(p => p.fingerprint.colorProfile === 'cool');
            expect(cool.length).toBeGreaterThan(20);
        });
    });

    describe('Organic Moods (ORG-1, ORG-3)', () => {
        it('should have < 15% organic presets with aggressive > 0.75', () => {
            const organics = Object.values(fingerprints.presets)
                .filter(p => p.fingerprint.visualStyle === 'organic');
            const highAggressive = organics.filter(
                p => parseFloat(p.fingerprint.moodAffinities.aggressive) > 0.75
            );
            expect(highAggressive.length / organics.length).toBeLessThan(0.15);
        });
    });
});
```

### 5.4 Selector Integration Tests

Test that IntelligentPresetSelector correctly uses new fingerprint fields:

```javascript
// In test/intelligentPresetSelector.test.js, add:

describe('Integration: Selector with v2.1 Fingerprints', () => {
    describe('New Mood Type Support', () => {
        it('should match mystical presets for ambient music', () => {
            // Verify selector can filter by mystical mood
        });

        it('should match hypnotic presets for trance music', () => {
            // Verify selector can filter by hypnotic mood
        });
    });

    describe('Threshold Updates', () => {
        it('should use lowEnergy threshold of 0.35', () => {
            // Verify EXT-1 threshold change
        });

        it('should use highBpm threshold of 140', () => {
            // Verify EXT-3 threshold change
        });
    });

    describe('WIRE-1: Underutilized Field Wiring', () => {
        it('should score colorProfile matching for warm/happy', () => {
            const preset = { fingerprint: { colorProfile: 'warm' } };
            const score = selector.scoreForColorProfile(preset, 'happy');
            expect(score).toBeGreaterThan(0);
        });

        it('should score colorProfile matching for cool/relaxed', () => {
            const preset = { fingerprint: { colorProfile: 'cool' } };
            const score = selector.scoreForColorProfile(preset, 'relaxed');
            expect(score).toBeGreaterThan(0);
        });

        it('should score visualStyle continuity for same style', () => {
            const current = { fingerprint: { visualStyle: 'organic' } };
            const candidate = { fingerprint: { visualStyle: 'organic' } };
            const score = selector.scoreForVisualStyleContinuity(current, candidate);
            expect(score).toBeGreaterThan(0);
        });

        it('should penalize incompatible visualStyle transitions', () => {
            const current = { fingerprint: { visualStyle: 'particle' } };
            const candidate = { fingerprint: { visualStyle: 'organic' } };
            const score = selector.scoreForVisualStyleContinuity(current, candidate);
            expect(score).toBeLessThan(0);
        });

        it('should score BPM match for preset within optimal range', () => {
            const preset = { fingerprint: { optimalBpm: { min: 100, max: 140, ideal: 120 } } };
            const score = selector.scoreForBpmMatch(preset, 120);
            expect(score).toBeGreaterThan(0.1);
        });

        it('should penalize BPM mismatch outside optimal range', () => {
            const preset = { fingerprint: { optimalBpm: { min: 100, max: 140, ideal: 120 } } };
            const score = selector.scoreForBpmMatch(preset, 80);
            expect(score).toBeLessThan(0);
        });
    });
});
```

### 5.5 Test Coverage Checklist

| Issue | Unit Test | Integration Test | Status |
|-------|-----------|------------------|--------|
| FRC-1 | Mood vocabulary expansion | Fractal mood diversity | |
| FRC-2 | Fractal aggressive reduction | 0% aggressive > 0.8 | |
| FRC-3 | Fractal complexity boost | Avg complexity > 0.5 | |
| EXT-2 | Complexity normalization | Range reaches 0.8+ | |
| ABS-2 | Keyword detection | < 10% misclassified | |
| ORG-1 | Acoustic >= electronic | Organic mood balance | |
| ORG-3 | Aggressive cap at 0.75 | < 15% high aggressive | |
| CLR-1 | Cool threshold lowered | > 20 cool presets | |
| CLR-2 | Purple detection | Purple → cool | |
| MOD-1 | Energy-relaxed penalty | No contradictions | |
| WIRE-1 | scoreForColorProfile() | Color-mood matching | |
| WIRE-1 | scoreForVisualStyleContinuity() | Style transition scoring | |
| WIRE-1 | scoreForBpmMatch() | BPM range matching | |

---

## Phase 6: Regeneration & Validation

**Estimated Effort:** 1-2 hours
**Dependencies:** Phase 5 tests passing

### 6.1 Regenerate All Fingerprints

```bash
# Regenerate from source
node tools/generate-fingerprints.js \
    --input node_modules/butterchurn-presets/presets/converted \
    --output presets/alaska-butter/alaskaButter.fingerprints.json

# Copy to CDN
cp presets/alaska-butter/alaskaButter.fingerprints.json docs/cdn/presets/
cp presets/alaska-butter/alaskaButter.fingerprints.min.json docs/cdn/presets/
```

### 6.2 Run Validation Analysis

```bash
# Re-run the same 6-agent review to verify improvements
node -e "
const fp = require('./presets/alaska-butter/alaskaButter.fingerprints.json');
// ... validation script
"
```

### 6.3 Update Version

- Bump fingerprint schema to v2.1.0

---

## Phase 7: Documentation Updates

**Estimated Effort:** 1-2 hours
**Dependencies:** Phase 6 complete
**Files:** Various documentation files

### 7.1 Update CLAUDE.md

- Update project status section with new fingerprint version
- Add any new critical rules discovered during implementation
- Update file organization if new files added

### 7.2 Update README.md

- Document new mood types if added (mystical, hypnotic, etc.)
- Update fingerprint schema version reference
- Add any new usage examples for enhanced features

### 7.3 Update Architecture Documentation

- `docs/architecture/mathematical-fingerprinting.md` - Document v2.1 schema changes
- `docs/architecture/README.md` - Update mood detection model if changed

### 7.4 Update Review Document

- Mark resolved issues in [fingerprint-quality-review-2026-03-25.md](../reviews/fingerprint-quality-review-2026-03-25.md)
- Add "Resolution" column to issue tracker
- Document validation results

### 7.5 Close Out Plan

- Update this plan with completion status
- Add "Completed" date and summary
- Document any deferred items for future work

---

## Implementation Checklist

### Phase 0: Prerequisites
- [ ] PRE-2: Add import guard to `tools/generate-fingerprints.js`
- [ ] PRE-2: Add export for `PresetFingerprintGenerator`
- [ ] PRE-2: Verify CLI still works after changes

### Phase 1: Critical (Must Do)
- [ ] FRC-1: Expand mood vocabulary
- [ ] FRC-2: Add fractal mood overrides
- [ ] EXT-2: Fix complexity scaling
- [ ] FRC-3: Add fractal complexity boost (PRE-8: use decay/trig detection)
- [ ] ABS-2: Add keyword-based style detection (PRE-6: use word boundary regex)

### Phase 2: High Priority
- [ ] ORG-1: Add style-aware mood caps (PRE-7: enforce acoustic > electronic directly)
- [ ] ORG-3: Cap organic aggressive at 0.75
- [ ] CLR-1: Lower cool detection threshold
- [ ] CLR-2: Add purple/violet detection

### Phase 3: Medium Priority
- [ ] ABS-1: Lower color detection thresholds
- [ ] EXT-3: Adjust BPM thresholds
- [ ] EXT-1: Raise low energy threshold
- [ ] MOD-1: Add energy-relaxed cross-validation
- [ ] WIRE-1: Wire colorProfile to selector scoring
- [ ] WIRE-1: Wire visualStyle to selector scoring
- [x] PRE-3: optimalBpm already wired at lines 1608-1617 (no action needed)

### Phase 4: Low Priority (Optional)
- [ ] CLR-3: Add yellow/gold detection
- [ ] ORG-4: Add psychedelic style
- [ ] ABS-3: Increase abstract mood variation
- [ ] Manual edge case review

### Phase 5: Test Coverage
- [ ] Fix wiring gap: export functions from generator
- [ ] Update test imports to use actual implementation
- [ ] Add unit tests for expanded mood vocabulary (FRC-1/FRC-2)
- [ ] Add unit tests for complexity scaling (EXT-2/FRC-3)
- [ ] Add unit tests for keyword detection (ABS-2)
- [ ] Add unit tests for organic mood caps (ORG-1/ORG-3)
- [ ] Add unit tests for cool color detection (CLR-1/CLR-2)
- [ ] Add unit tests for energy-relaxed validation (MOD-1)
- [ ] Add unit tests for selector scoring functions (WIRE-1)
- [ ] Add integration tests for fingerprint file quality
- [ ] Add selector integration tests for new fields
- [ ] Add tests for colorProfile/visualStyle/BPM wiring
- [ ] Verify all tests pass

### Phase 6: Regeneration
- [ ] Regenerate all fingerprints
- [ ] Run validation analysis
- [ ] Verify integration tests pass with new fingerprints
- [ ] Update version numbers
- [ ] Commit changes

### Phase 7: Documentation
- [ ] Update CLAUDE.md with new status
- [ ] Update README.md with new features
- [ ] Update architecture docs (mathematical-fingerprinting.md)
- [ ] Mark issues resolved in review document
- [ ] Close out this plan with completion summary
- [ ] Final commit and push

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Mood changes break existing matches | Medium | High | Version bump, backward compat |
| Over-correction causes new issues | Low | Medium | Validate with same review agents |
| Performance impact from new checks | Low | Low | Fingerprints computed offline |

---

## Dependencies

### External
- None

### Internal
- `tools/generate-fingerprints.js` - Primary file to modify
- `src/intelligentPresetSelector.js` - Threshold updates
- `presets/alaska-butter/` - Regenerated output

---

## Notes

- All changes are to the fingerprint generation algorithm, not runtime code
- Fingerprints are computed offline, so performance is not a concern
- New moods (mystical, hypnotic, etc.) require selector updates to use them
- Consider A/B testing with subset before full regeneration

---

*Implementation plan created based on [fingerprint-quality-review-2026-03-25.md](../reviews/fingerprint-quality-review-2026-03-25.md)*
