# Waveform Vertex Buffer Overflow Fix

**Date**: 2026-06-19  
**PR**: [#6](https://github.com/geeks-accelerator/butterchurn/pull/6)  
**Author**: Lucas Brown  

## Problem

When switching presets, the visualizer threw WebGL errors and froze:

```
GL_INVALID_OPERATION: Vertex buffer is not big enough for the draw call
```

This clustered visibly at preset transitions, blanking/freezing the effect for the host video renderer (marketing-studio).

## Root Cause

The audio processor was bumped from 512 to 2048 samples (`numSamps`) for better bass response, but `BasicWaveform` still hardcoded its vertex buffers at 512:

```javascript
// basicWaveform.js (BEFORE)
const numAudioSamples = 512;
this.positions = new Float32Array(numAudioSamples * 3);
```

When a waveform with `wave_mode` 2-5 tried to draw all `timeArrayL.length` vertices (up to 2048), it overflowed the 512-element buffer, causing `drawArrays` to fail.

This is exactly the scenario the repo's CLAUDE.md warns about:
> *"PRESERVE 2048-sample audio buffer size — never revert to 512."*

The audio buffer was bumped; the waveform shader's vertex buffers weren't.

## Solution

### 1. Plumb `numSamps` through renderer params

In `renderer.js`, add `numSamps` to the params object passed to all rendering components:

```javascript
const params = {
  // ... existing params ...
  numSamps: this.audio.numSamps,
};
```

This was added in three locations: constructor, `loadPreset()`, and `updateGlobals()`.

### 2. Size BasicWaveform buffers dynamically

In `basicWaveform.js`:

```javascript
// AFTER
const numAudioSamples = (opts && opts.numSamps) || 512;
this.numAudioSamples = numAudioSamples;
this.positions = new Float32Array(numAudioSamples * 3);
// ... all other buffers sized from numAudioSamples
```

The 512 fallback maintains backwards compatibility for upstream hosts that don't plumb `numSamps`.

### 3. Defensive clamp

Belt-and-suspenders protection so `drawArrays` can never overflow:

```javascript
// Never let vertex count exceed buffer capacity
if (this.numVert > this.numAudioSamples) this.numVert = this.numAudioSamples;
```

### 4. Gate debug logging

The WIP transition instrumentation was running every frame/preset switch in production. Gated behind `debugMode`:

- `loadPreset` description logs
- Preset compatibility check logs
- Blend-time-reduction warnings

## Files Changed

| File | Change |
|------|--------|
| `src/rendering/waves/basicWaveform.js` | Dynamic buffer sizing, defensive clamp |
| `src/rendering/renderer.js` | Plumb `numSamps`, gate debug logs |
| `docs/cdn/butterchurn.min.js` | Rebuilt bundle |

## Verification

Verified end-to-end through the host video renderer (marketing-studio):
- 5 forced preset transitions across a track at 1920x1080 with 2048-sample audio
- Zero GL errors (live `getError()` = none)
- Zero console spam

Before: 256x `Vertex buffer is not big enough` + `zeroAlpha` warnings + visual freezing.

## Prevention

When changing audio buffer sizes:
1. Grep for hardcoded buffer dimensions: `grep -r "512" src/rendering/`
2. Check all `Float32Array` allocations in wave/shape renderers
3. Verify visual regression tests pass: `npm run test:visual`
4. Test preset transitions with `debugMode: true` to catch overflow warnings

## Backwards Compatibility

Fully backwards compatible:
- 512 fallback for hosts that don't plumb `numSamps`
- No API changes
- Defensive clamp prevents overflow regardless of configuration
