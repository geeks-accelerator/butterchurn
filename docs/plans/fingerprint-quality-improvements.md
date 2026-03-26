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

## Phase 5: Regeneration & Validation

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

## Phase 6: Documentation Updates

**Estimated Effort:** 1-2 hours
**Dependencies:** Phase 5 complete
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

### Phase 5: Finalization
- [ ] Regenerate all fingerprints
- [ ] Run validation analysis
- [ ] Update version numbers
- [ ] Commit changes

### Phase 6: Documentation
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
