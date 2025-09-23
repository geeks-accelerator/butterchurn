# Smart Preset Switching Based on Scene Changes

## Current Available Data Points

### 1. Real-time Audio Features (calculated every frame)
- **energy**: Overall audio energy (0-1)
- **bassEnergy**: Low frequency energy (0-1)
- **trebleEnergy**: High frequency energy (0-1)
- **energyChange**: Delta from historical average
- **bassChange**: Delta from historical average
- **trend**: 'rising' | 'falling' | 'stable'

### 2. Musical Event Detection
- **isDrop**: Bass jump > 0.3 AND bass > 0.7
- **isBuildup**: Energy increasing > 0.1
- **isChill**: Energy < 0.3 AND stable

### 3. Preset Scoring Components
- **energyMatch**: How well preset energy matches audio
- **frequencyMatch**: Bass/treble alignment
- **rhythmMatch**: Beat pattern compatibility
- **dynamicsMatch**: Change rate alignment
- **continuity**: Smooth transition potential

## Proposed: Scene-Based Switching Logic

Instead of time-based switching, detect when the musical "scene" has changed enough to warrant a new visual.

### A. Energy Delta Switching
```javascript
class IntelligentPresetSelector {
    constructor() {
        // Track energy at last switch
        this.switchEnergy = null;
        this.switchBass = null;
        this.switchTreble = null;

        // Thresholds for scene change
        this.energyChangeThreshold = 0.25;  // 25% energy change
        this.bassChangeThreshold = 0.3;     // 30% bass change
        this.sceneScoreThreshold = 0.4;     // 40% scene difference
    }

    shouldSwitchPreset(features, timeSinceSwitch) {
        // Still respect minimum time for preset warmup
        const minimumTime = Math.max(
            4000,  // 4 seconds absolute minimum
            (this.currentWarmupTime || 0) * 1000
        );

        if (timeSinceSwitch < minimumTime) {
            return false;
        }

        // Force switch if too long (but make it longer)
        if (timeSinceSwitch > 60000) {  // 1 minute max
            return true;
        }

        // Calculate scene change score
        const sceneChange = this.calculateSceneChange(features);

        // Switch if scene changed significantly
        if (sceneChange > this.sceneScoreThreshold) {
            return true;
        }

        // Musical events still trigger (but with time gate)
        if (timeSinceSwitch > 8000) {  // After 8 seconds
            if (features.isDrop) return true;
            if (features.isBuildup && features.energy > 0.6) return true;
        }

        return false;
    }

    calculateSceneChange(features) {
        if (!this.switchEnergy) {
            // First calculation, store baseline
            this.switchEnergy = features.energy;
            this.switchBass = features.bassEnergy;
            this.switchTreble = features.trebleEnergy;
            return 0;
        }

        // Calculate weighted scene change
        const energyDelta = Math.abs(features.energy - this.switchEnergy);
        const bassDelta = Math.abs(features.bassEnergy - this.switchBass);
        const trebleDelta = Math.abs(features.trebleEnergy - this.switchTreble);

        // Weight bass changes more heavily (most impactful)
        const sceneScore = (
            energyDelta * 0.3 +
            bassDelta * 0.5 +
            trebleDelta * 0.2
        );

        return sceneScore;
    }

    switchToPreset(hash) {
        // ... existing switch logic ...

        // Store audio state at switch time
        const features = this.calculateAudioFeatures();
        this.switchEnergy = features.energy;
        this.switchBass = features.bassEnergy;
        this.switchTreble = features.trebleEnergy;
    }
}
```

### B. Preset Performance Tracking
```javascript
// Track how well current preset matches the audio
class PresetPerformanceTracker {
    constructor() {
        this.currentScore = 1.0;
        this.scoreHistory = [];
        this.degradationThreshold = 0.5;  // Switch when score drops 50%
    }

    updatePerformance(features, currentPresetHash, db) {
        const preset = db.presets[currentPresetHash];
        if (!preset) return;

        // Calculate how well preset matches current audio
        const score = this.scorePresetMatch(preset, features);

        this.scoreHistory.push(score);
        if (this.scoreHistory.length > 30) {
            this.scoreHistory.shift();
        }

        // Check if performance is degrading
        const avgScore = this.scoreHistory.reduce((a,b) => a+b, 0) / this.scoreHistory.length;
        const degradation = (this.currentScore - avgScore) / this.currentScore;

        if (degradation > this.degradationThreshold) {
            return { shouldSwitch: true, reason: 'performance_degraded' };
        }

        this.currentScore = avgScore;
        return { shouldSwitch: false };
    }

    scorePresetMatch(preset, features) {
        const fp = preset.fingerprint;

        // Calculate match scores
        const energyMatch = 1 - Math.abs(fp.energy - features.energy);
        const bassMatch = 1 - Math.abs(fp.bass - features.bassEnergy);
        const complexityMatch = this.getComplexityMatch(fp.complexity, features.energy);

        return (energyMatch * 0.4 + bassMatch * 0.4 + complexityMatch * 0.2);
    }
}
```

### C. Contextual Switching Windows
```javascript
// Create "windows" where switching makes musical sense
class MusicalContextAnalyzer {
    constructor() {
        this.beatTracker = new BeatTracker();
        this.phraseLength = 16;  // Assume 16-beat phrases
    }

    isSwitchWindow(features, timeSinceSwitch) {
        // Detect musical boundaries
        const beatPosition = this.beatTracker.getBeatPosition();
        const isPhraseBoundary = beatPosition % this.phraseLength === 0;

        // Switching windows:
        // 1. Phrase boundaries (every 16 beats)
        if (isPhraseBoundary && timeSinceSwitch > 4000) {
            return { canSwitch: true, confidence: 0.9 };
        }

        // 2. Energy valleys (good transition points)
        if (features.energy < 0.3 && features.trend === 'stable') {
            return { canSwitch: true, confidence: 0.7 };
        }

        // 3. Pre-drop (anticipation)
        if (features.isBuildup && features.energy > 0.7) {
            return { canSwitch: true, confidence: 0.8 };
        }

        // 4. Post-drop (resolution)
        if (this.wasDropRecently() && features.trend === 'falling') {
            return { canSwitch: true, confidence: 0.6 };
        }

        return { canSwitch: false, confidence: 0 };
    }
}
```

## Implementation Priority

### Phase 1: Energy Delta Switching (Simplest)
- Replace time-based logic with scene change detection
- Track energy/bass/treble at switch time
- Switch when cumulative change exceeds threshold

### Phase 2: Preset Performance Tracking
- Monitor how well current preset matches audio
- Switch when match quality degrades
- Learn which presets work best for which scenes

### Phase 3: Musical Context Windows
- Detect phrase boundaries and musical sections
- Only allow switches at musically appropriate times
- Respect song structure (verse/chorus/bridge)

## Configuration Recommendations

```javascript
// Conservative but intelligent
const config = {
    // Minimum times
    absoluteMinSwitch: 4000,      // 4 seconds minimum
    warmupRespect: true,          // Wait for preset warmup

    // Scene change thresholds
    energyChangeThreshold: 0.25,  // 25% change triggers consideration
    bassChangeThreshold: 0.3,      // 30% bass change is significant
    sceneScoreThreshold: 0.35,    // 35% overall scene change

    // Performance tracking
    trackPerformance: true,
    degradationThreshold: 0.4,    // Switch at 40% degradation

    // Musical awareness
    respectPhrases: true,         // Try to switch on boundaries
    anticipateDrops: true,        // Switch before drops

    // Safety limits
    maxSwitchInterval: 60000,     // Force switch after 1 minute
    emergencyFallback: true       // Use emergency presets if needed
};
```

## Benefits Over Time-Based Switching

1. **Musical Coherence**: Presets change when the music changes, not on arbitrary timers
2. **Better Appreciation**: Presets stay during consistent sections
3. **Dramatic Impact**: Changes align with musical events
4. **Adaptive Duration**: Fast songs switch more, ambient less
5. **Quality Maintenance**: Switch away from poorly matching presets

## Testing Metrics

- Average time between switches (target: 15-30 seconds)
- Scene change correlation (% of switches at musical boundaries)
- Preset match quality over time
- User satisfaction scores
- Drop/buildup hit rate

## Next Steps

1. Implement Phase 1 (energy delta) as proof of concept
2. Add debug UI to show scene change scores in real-time
3. A/B test against time-based switching
4. Gather metrics on switching patterns
5. Refine thresholds based on genre