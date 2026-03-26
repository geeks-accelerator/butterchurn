# Intelligent Preset Selector Integration Guide

**Created:** 2026-03-26
**Status:** Active

This guide explains how to integrate the Intelligent Preset Selector into your Butterchurn visualization project.

---

## Overview

The `IntelligentPresetSelector` automatically selects presets based on real-time audio analysis. It uses:

- **Fingerprint database** - Pre-computed preset characteristics (energy, mood, BPM ranges)
- **Audio analysis** - Real-time spectral features via Meyda.js
- **Musical timing** - 16-beat phrase alignment for natural transitions
- **Performance tracking** - Detects degraded match quality and switches accordingly

---

## Quick Start

### 1. Basic Setup (No Audio Context)

```javascript
import butterchurn from 'butterchurn';
import { IntelligentPresetSelector } from 'butterchurn/intelligentPresetSelector';

// Load fingerprint database
const response = await fetch('/path/to/fingerprints.json');
const fingerprintDb = await response.json();

// Create selector
const selector = new IntelligentPresetSelector(
    butterchurn,     // Butterchurn instance
    fingerprintDb,   // Fingerprint database
    {}               // Config options (optional)
);

// In your render loop
function render(audioLevels) {
    selector.update(audioLevels);
    butterchurn.render();
}
```

### 2. Enhanced Setup (With Audio Context)

For advanced features (BPM detection, mood analysis, pre-drop anticipation):

```javascript
import butterchurn from 'butterchurn';
import { IntelligentPresetSelector } from 'butterchurn/intelligentPresetSelector';

// Audio setup
const audioContext = new AudioContext();
const audioElement = document.getElementById('audio');
const source = audioContext.createMediaElementSource(audioElement);
const analyser = audioContext.createAnalyser();
source.connect(analyser);
analyser.connect(audioContext.destination);

// Create selector with audio context
const selector = new IntelligentPresetSelector(
    butterchurn,
    fingerprintDb,
    {},              // Config
    audioContext,    // For Meyda spectral features
    source           // Audio source node
);

// When audio file loads, enable BPM detection
audioElement.addEventListener('loadeddata', async () => {
    const buffer = await audioContext.decodeAudioData(audioData);
    selector.onAudioLoaded(buffer);
});
```

---

## Configuration Options

Pass config as the third constructor parameter:

```javascript
const config = {
    // Timing
    minSwitchInterval: 8000,      // Minimum ms between switches (default: 8000)
    maxSwitchInterval: 30000,     // Maximum ms before forcing switch (default: 30000)

    // Scoring weights (0.0 - 1.0)
    weights: {
        energyMatch: 0.25,        // Match preset energy to audio energy
        bassMatch: 0.15,          // Match bass reactivity
        moodMatch: 0.15,          // Match detected mood
        bpmMatch: 0.10,           // Match optimal BPM range
        spectralMatch: 0.10,      // Match spectral characteristics
        continuity: 0.10,         // Prefer smooth transitions
        performance: 0.10,        // Consider render performance
        variety: 0.05             // Introduce variety
    },

    // Thresholds
    performanceDegradationThreshold: 0.4,  // Switch at 40% match degradation
    preDropLeadTime: 1500,                 // Anticipate drops 1.5s early

    // Debug
    debugMode: false,             // Enable console logging
    rngSeed: null                 // Seed for deterministic behavior (testing)
};

const selector = new IntelligentPresetSelector(
    butterchurn,
    fingerprintDb,
    config
);
```

---

## Runtime Methods

### Updating Audio Data

```javascript
// Call every frame with current audio levels
selector.update({
    timeByteArray: analyser.getByteTimeDomainData(),
    timeByteArrayL: leftChannelData,   // Optional: stereo
    timeByteArrayR: rightChannelData   // Optional: stereo
});
```

### Manual Preset Control

```javascript
// Force switch to specific preset
selector.switchToPreset(presetHash);

// Get current preset info
const current = selector.getCurrentPreset();

// Check if preset is problematic
const isProblematic = selector.isProblematic(hash);

// Mark preset as problematic (won't be selected)
selector.markProblematic(hash, 'reason');
```

### Configuration Updates

```javascript
// Update scoring weights at runtime
selector.setWeights({
    energyMatch: 0.3,
    moodMatch: 0.2
});

// Update scene change thresholds
selector.setSceneThresholds({
    sensitivity: 0.8,
    cooldown: 5000
});
```

### Debug Mode

```javascript
// Enable debug logging
selector.setDebugMode(true);

// Enable scene change logging
selector.setDebugSceneChange(true);
```

---

## Fingerprint Database Format

The selector expects a fingerprint database in this format:

```json
{
  "version": "2.1.0",
  "generated": "2026-03-26T00:00:00.000Z",
  "presets": {
    "d4dd9551": {
      "hash": "d4dd9551",
      "names": ["Preset Name"],
      "authors": ["Author Name"],
      "fingerprint": {
        "energy": 0.75,
        "bassEnergy": 0.8,
        "trebleEnergy": 0.6,
        "complexity": 0.65,
        "beatSync": 0.9,
        "visualStyle": "particle",
        "colorProfile": "warm",
        "optimalBpm": { "min": 120, "max": 140 },
        "moodAffinities": {
          "aggressive": 0.8,
          "relaxed": 0.2,
          "electronic": 0.9,
          "hypnotic": 0.6
        }
      }
    }
  }
}
```

Generate fingerprints using:

```bash
node tools/generate-fingerprints.js --input /path/to/presets --output fingerprints.json
```

---

## Audio Flow Diagram

```
┌─────────────┐    ┌─────────────┐    ┌──────────────────────┐
│ AudioContext│───▶│   Meyda     │───▶│ AdvancedAudioAnalyzer│
└─────────────┘    │  (spectral) │    │ - BPM detection      │
                   └─────────────┘    │ - Mood detection     │
                                      │ - Genre detection    │
                                      └──────────┬───────────┘
                                                 │
                                                 ▼
┌─────────────┐    ┌─────────────────────────────────────────┐
│ Fingerprint │───▶│       IntelligentPresetSelector        │
│  Database   │    │ - Score presets against audio features │
│             │    │ - 16-beat phrase alignment             │
│             │    │ - Pre-drop anticipation                │
│             │    │ - Performance degradation tracking     │
└─────────────┘    └──────────────────┬──────────────────────┘
                                      │
                                      ▼
                   ┌──────────────────────────────────────────┐
                   │              Butterchurn                 │
                   │         (WebGL Visualizer)               │
                   └──────────────────────────────────────────┘
```

---

## Mood Types

The selector recognizes 10 mood types:

| Mood | Description | Audio Triggers |
|------|-------------|----------------|
| aggressive | High energy, intense | High bass, loud, fast |
| relaxed | Calm, peaceful | Low energy, smooth |
| happy | Upbeat, positive | Major tonality, bright |
| electronic | Synthetic, digital | High flatness, processed |
| acoustic | Natural, organic | Low flatness, dynamic |
| mystical | Ethereal, mysterious | High rolloff, soft |
| hypnotic | Repetitive, trance-like | Steady rhythm, moderate energy |
| psychedelic | Dynamic, vivid | High flux, wide range |
| dreamy | Soft, airy | High centroid, low energy |
| meditative | Very calm, ambient | Very low energy, slow |

---

## Troubleshooting

### Presets not switching
- Check that `update()` is called every frame with audio data
- Verify fingerprint database loaded correctly
- Enable debug mode: `selector.setDebugMode(true)`

### BPM detection not working
- Ensure AudioContext and source are passed to constructor
- Call `onAudioLoaded(buffer)` when audio file loads
- Check browser supports Web Audio API

### Black frames or solid colors
- These presets are automatically marked problematic
- Check `selector.isProblematic(hash)` for specific presets
- Problematic presets are persisted to localStorage

### Mood detection always neutral
- Verify Meyda loaded (check console for errors)
- Ensure AudioContext not suspended (user interaction required)
- Check audio data is non-silent

---

## Related Documentation

- [Mathematical Fingerprinting](../architecture/mathematical-fingerprinting.md) - How fingerprints are generated
- [Moving Average Crossover](moving-average-crossover.md) - Scene detection algorithm
- [Advanced Features Roadmap](../plans/advanced-features.md) - Full feature roadmap

---

*DOC-1: Created as part of post-implementation twin review fixes*
