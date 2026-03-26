# Fingerprint Quality Improvements Plan

**Created:** 2026-03-25
**Status:** Draft
**Priority:** High
**Review Reference:** [fingerprint-quality-review-2026-03-25.md](../reviews/fingerprint-quality-review-2026-03-25.md)

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

## Phase 1: Critical Fixes

**Estimated Effort:** 4-6 hours
**Dependencies:** None
**Files:** `tools/generate-fingerprints.js`

### 1.1 Fix Fractal Mood System (FRC-1, FRC-2)

**Issue:** All 95 fractal presets have identical aggressive mood structure.

**Solution:** Expand mood vocabulary and add fractal-specific mood derivation.

```javascript
// In deriveMoodAffinities(), add new moods:
const affinities = {
    aggressive: 0.5,
    relaxed: 0.5,
    happy: 0.5,
    electronic: 0.5,
    acoustic: 0.5,
    // NEW v2.1 moods:
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

    // Fractal patterns are inherently complex
    const allEqs = this.getAllEquations(preset);
    if (allEqs.includes('zoom') && allEqs.includes('rot')) {
        complexity += 0.25;  // Fractal boost
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
    const fractalKeywords = ['fractal', 'spiral', 'mandala', 'zoom', 'iteration'];
    const particleKeywords = ['particle', 'spark', 'star', 'dot', 'pixel', 'sperm'];
    const organicKeywords = ['plasma', 'liquid', 'fluid', 'flow', 'wave', 'ocean'];

    if (fractalKeywords.some(k => presetName.includes(k))) {
        styles.push('fractal');
    }
    if (particleKeywords.some(k => presetName.includes(k))) {
        styles.push('particle');
    }
    if (organicKeywords.some(k => presetName.includes(k))) {
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
    // Organic should be more acoustic/relaxed
    affinities.acoustic = Math.max(affinities.acoustic, affinities.electronic + 0.1);
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

**Issue:** 80% of abstract presets have neutral colorProfile.

**Solution:** Make color detection more sensitive.

```javascript
// Lower thresholds for all color categories
if (maxScore >= 1.5) {  // Was >= 2
    const dominant = Object.entries(scores).find(([_, v]) => v === maxScore)?.[0];
    return dominant;
}
```

### 3.2 Adjust BPM Thresholds (EXT-3)

**Issue:** BPM extremes (>160, <70) never triggered.

**Solution:** Update threshold constants.

```javascript
// In intelligentPresetSelector.js or fingerprint matching:
const BPM_THRESHOLDS = {
    veryLow: 80,    // Was 70
    low: 100,       // Was 90
    high: 140,      // Was 150
    veryHigh: 160   // Was 170
};
```

### 3.3 Adjust Low Energy Threshold (EXT-1)

**Issue:** Only 4.4% of presets below 0.2 energy threshold.

**Solution:** Raise threshold to 0.35.

```javascript
// In preset matching/filtering:
const ENERGY_THRESHOLDS = {
    low: 0.35,      // Was 0.2
    medium: 0.6,
    high: 0.8
};
```

### 3.4 Add Energy Penalty for Relaxed (MOD-1)

**Issue:** 1 preset with energy 0.65 has relaxed: 1.0.

**Solution:** Add cross-validation.

```javascript
// After mood derivation:
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

---

## Phase 6: Regeneration & Validation

**Estimated Effort:** 1-2 hours
**Dependencies:** Phase 5 tests passing

**Estimated Effort:** 1-2 hours
**Dependencies:** All phases complete

### 5.1 Regenerate All Fingerprints

```bash
# Regenerate from source
node tools/generate-fingerprints.js \
    --input node_modules/butterchurn-presets/presets/converted \
    --output presets/alaska-butter/alaskaButter.fingerprints.json

# Copy to CDN
cp presets/alaska-butter/alaskaButter.fingerprints.json docs/cdn/presets/
cp presets/alaska-butter/alaskaButter.fingerprints.min.json docs/cdn/presets/
```

### 5.2 Run Validation Analysis

```bash
# Re-run the same 6-agent review to verify improvements
node -e "
const fp = require('./presets/alaska-butter/alaskaButter.fingerprints.json');
// ... validation script
"
```

### 5.3 Update Version

- Bump fingerprint schema to v2.1.0

---

## Phase 7: Documentation Updates

**Estimated Effort:** 1-2 hours
**Dependencies:** Phase 6 complete
**Files:** Various documentation files

### 6.1 Update CLAUDE.md

- Update project status section with new fingerprint version
- Add any new critical rules discovered during implementation
- Update file organization if new files added

### 6.2 Update README.md

- Document new mood types if added (mystical, hypnotic, etc.)
- Update fingerprint schema version reference
- Add any new usage examples for enhanced features

### 6.3 Update Architecture Documentation

- `docs/architecture/mathematical-fingerprinting.md` - Document v2.1 schema changes
- `docs/architecture/README.md` - Update mood detection model if changed

### 6.4 Update Review Document

- Mark resolved issues in [fingerprint-quality-review-2026-03-25.md](../reviews/fingerprint-quality-review-2026-03-25.md)
- Add "Resolution" column to issue tracker
- Document validation results

### 6.5 Close Out Plan

- Update this plan with completion status
- Add "Completed" date and summary
- Document any deferred items for future work

---

## Implementation Checklist

### Phase 1: Critical (Must Do)
- [ ] FRC-1: Expand mood vocabulary
- [ ] FRC-2: Add fractal mood overrides
- [ ] EXT-2: Fix complexity scaling
- [ ] FRC-3: Add fractal complexity boost
- [ ] ABS-2: Add keyword-based style detection

### Phase 2: High Priority
- [ ] ORG-1: Add style-aware mood caps
- [ ] ORG-3: Cap organic aggressive at 0.75
- [ ] CLR-1: Lower cool detection threshold
- [ ] CLR-2: Add purple/violet detection

### Phase 3: Medium Priority
- [ ] ABS-1: Lower color detection thresholds
- [ ] EXT-3: Adjust BPM thresholds
- [ ] EXT-1: Raise low energy threshold
- [ ] MOD-1: Add energy-relaxed cross-validation

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
- [ ] Add integration tests for fingerprint file quality
- [ ] Add selector integration tests for new fields
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
