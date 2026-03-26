# Bug Tracking and Regression Prevention

## Critical Bug Fixes

### Fade-to-Black Blending Bug (RESOLVED)
**File**: `src/rendering/renderer.js`
**Impact**: Critical rendering issue affecting all preset transitions

**Problem**: Both old and new presets used the same `warpColor` buffer during blending, causing both to fade out simultaneously instead of crossfading.

**Solution**: Added separate `prevWarpColor` buffer for old preset with inverted alpha values.

**Prevention**: Always verify separate alpha buffers are maintained during any blending code changes.

### Non-Responsive Audio Visualizations (RESOLVED)
**File**: Multiple render functions
**Impact**: Visualizer showed default animations, completely unresponsive to music

**Problem**: `visualizer.render()` called without `audioLevels` parameter containing time domain audio data.

**Solution**: Always pass `{ audioLevels: { timeByteArray, timeByteArrayL, timeByteArrayR } }` to render method.

**Prevention**: Verify audio data flow in any render loop modifications.

### Performance Loss from Canvas 2D Copy (RESOLVED)
**File**: `src/visualizer.js`
**Impact**: 25-30% performance loss due to expensive intermediate copying

**Problem**: Intermediate Canvas 2D context used for copying WebGL output, causing significant performance overhead.

**Solution**: Use output canvas directly as WebGL2 context, eliminating copy operation.

**Prevention**: Never reintroduce Canvas 2D intermediate steps in rendering pipeline.

### Black Screen on Initial Load (RESOLVED)
**File**: `src/rendering/renderer.js`
**Impact**: First preset load showed black screen instead of visualization

**Problem**: System attempted to blend from `blankPreset` during initialization.

**Solution**: Added `isComingFromBlankPreset` check to prevent blending from empty state.

**Prevention**: Always validate source state before enabling blending transitions.

## Regression Testing Protocol

### Visual Regression Tests
**Location**: `test/visual/regression.test.js`
**Purpose**: Detect rendering changes through automated screenshot comparison

**Requirements**:
- Must use deterministic RNG mode for consistent output
- Test both seed-dependent and seed-independent presets
- Render exactly 120 frames for complete preset analysis
- Clean up global RNG overrides after tests

### Performance Testing
**Location**: `test/performance-test.html`
**Requirements**:
- Render times must average <10ms for 60 FPS target
- Memory usage should not exceed 200MB with full preset collection
- Frame drops should not occur during preset transitions

### Blending Verification
**Location**: `test/intelligent-selector-test.html`
**Requirements**:
- Smooth crossfades between all preset combinations
- No fade-to-black behavior during transitions
- Proper alpha channel separation maintained

## Known Issues and Workarounds

### Canvas Context Loss
**Impact**: Rare WebGL context loss during GPU memory pressure
**Workaround**: Implement context restoration handlers
**Status**: Low priority - affects <1% of users

### WASM Compilation Brittleness
**Impact**: Minor version updates of eel-wasm break preset compilation
**Workaround**: Version lock eel-wasm and related toolchain
**Status**: Mitigated through package.json constraints

### Large Preset Collection Memory Usage
**Impact**: ~200MB memory usage with full preset collection
**Workaround**: Lazy loading of preset packs, selective preset inclusion
**Status**: Acceptable for target hardware specifications

## Bug Report Template

When reporting bugs, please include:

### Environment Information
- Browser version and operating system
- WebGL2 support status (`isButterchurnSupported()` result)
- Available memory and GPU information
- Audio source type (file, microphone, stream)

### Reproduction Steps
1. Specific steps to reproduce the issue
2. Expected behavior vs actual behavior
3. Frequency of occurrence (always, sometimes, rare)
4. Any error messages in browser console

### Test Results
- Performance test results (`test/performance-test.html`)
- Visual regression test status (`npm run test:visual`)
- Specific presets that trigger the issue
- Audio conditions that cause problems

### Additional Context
- Screenshots or video recordings of the issue
- Minimal code example if applicable
- Workarounds discovered
- Impact on user experience