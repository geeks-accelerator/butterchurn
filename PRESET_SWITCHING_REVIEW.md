# Preset Switching Frequency Review Plan

## Quick Test Instructions

1. **Start the test server**:
   ```bash
   npm run serve:test
   ```

2. **Open test page**:
   ```
   http://localhost:8192/intelligent-selector-test.html
   ```

3. **Load a dynamic song** with clear drops/buildups (EDM, dubstep, etc.)

## Current Timing Values to Test

### A. Default Configuration (Too Fast?)
- Min interval: 2 seconds
- Max interval: 30 seconds
- Buildup trigger: 1.4 seconds (70% of min)
- Random chance: 0-30%

## Suggested Improvements to Test

### B. Conservative Timing (Better for Appreciation)
```javascript
// In intelligentPresetSelector.js, lines 37-40
this.minSwitchInterval = 8000;   // 8 seconds minimum
this.maxSwitchInterval = 45000;  // 45 seconds maximum

// In shouldSwitchPreset method, line 347
if (features.isBuildup && timeSinceSwitch > this.minSwitchInterval * 0.8) {
    // Buildup at 80% of min = 6.4 seconds

// Line 365 - reduce random chance
return Math.random() < switchChance * 0.1; // Only 10% random
```

### C. Music-Aware Timing (Genre Adaptive)
```javascript
// Add to constructor
this.genreTimings = {
    ambient: { min: 15000, max: 60000 },  // Slower for ambient
    energetic: { min: 5000, max: 30000 }, // Faster for dance
    default: { min: 8000, max: 45000 }    // Balanced default
};

// Adjust based on energy levels
const energyLevel = features.energy;
if (energyLevel < 0.3) {
    // Use ambient timings
} else if (energyLevel > 0.7) {
    // Use energetic timings
}
```

### D. Preset Complexity Aware
```javascript
// Check preset warmup time and complexity
const presetComplexity = this.fingerprintDatabase?.presets[this.currentHash]?.complexity || 0.5;
const complexityMultiplier = 0.5 + presetComplexity; // 0.5x to 1.5x

this.currentMinInterval = this.minSwitchInterval * complexityMultiplier;
```

## Testing Checklist

### 1. Timing Feel Tests
- [ ] Play 3 different genres (ambient, rock, EDM)
- [ ] Count average seconds between switches
- [ ] Note if switches feel too frequent
- [ ] Check if you get to appreciate presets

### 2. Musical Event Response
- [ ] Do drops trigger at the right time?
- [ ] Are buildups anticipated properly?
- [ ] Do calm sections get appropriate presets?

### 3. Visual Continuity
- [ ] Are there jarring transitions?
- [ ] Do presets get enough time to "warm up"?
- [ ] Is the variety sufficient or repetitive?

## Metrics to Track

1. **Average time between switches** (should be 10-20 seconds)
2. **Musical event hit rate** (drops/buildups matched)
3. **User preference** (did it feel right?)
4. **Preset diversity** (how many unique presets in 5 minutes)

## Debug Output

Enable console logging to see decision making:
```javascript
// Add to shouldSwitchPreset method
console.log(`Switch Decision: time=${timeSinceSwitch}ms, ` +
           `min=${this.minSwitchInterval}ms, ` +
           `drop=${features.isDrop}, ` +
           `buildup=${features.isBuildup}, ` +
           `energy=${features.energy.toFixed(2)}`);
```

## Recommended Configuration

Based on analysis, recommend starting with:
```javascript
// Conservative but responsive
this.minSwitchInterval = 6000;   // 6 seconds
this.maxSwitchInterval = 40000;  // 40 seconds
this.buildupThreshold = 0.75;    // 75% of min = 4.5 seconds
this.randomChance = 0.15;        // 15% random switching
```

## Files to Modify

1. **Main logic**: `src/intelligentPresetSelector.js`
   - Lines 37-40: Base intervals
   - Lines 325-366: `shouldSwitchPreset` method
   - Line 347: Buildup threshold
   - Line 365: Random chance

2. **Test configuration**: Could add UI controls to `test/intelligent-selector-test.html`
   - Add sliders for min/max intervals
   - Add toggle for random switching
   - Add energy threshold controls