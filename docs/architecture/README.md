# Butterchurn Architecture Documentation

## System Architecture

### Core Components

#### Visualizer Engine (`src/visualizer.js`)
The main visualization engine that coordinates all subsystems:
- WebGL2 context management with direct canvas rendering
- Audio processor integration for real-time audio analysis
- Preset loading and management with smooth transitions
- Frame timing and performance monitoring

#### Audio Processing Pipeline (`src/audio/`)
- **AudioProcessor** - 2048-sample FFT analysis with temporal smoothing
- **AudioLevels** - Audio feature extraction and normalization
- **FFT** - Fast Fourier Transform implementation for frequency analysis
- **AdvancedAudioAnalyzer** - Enhanced analysis with Meyda.js integration (see below)

#### Rendering System (`src/rendering/`)
- **Renderer** - Main rendering coordinator with separate alpha buffer management
- **Shaders** - WebGL shader programs for warp, comp, blur, and output stages
- **Waves/Shapes** - Custom waveform and shape rendering components
- **Motion Vectors** - Dynamic motion field generation

#### Equation System (`src/equations/`)
- **PresetEquationRunner** - JavaScript-based equation evaluation
- **PresetEquationRunnerWASM** - WebAssembly-accelerated math processing
- Dual-engine approach provides performance with compatibility fallback

#### Intelligent Selection (`src/intelligentPresetSelector.js`)
- Real-time audio feature analysis for preset matching
- Fingerprint-based preset database with mathematical analysis
- Audio history tracking for trend detection and smooth transitions
- **Phrase-aligned switching** - Preset changes on 16-beat boundaries
- **Pre-drop anticipation** - Switches 1.5s before detected energy buildups
- **Performance degradation tracking** - Auto-switch when quality drops 40%+
- **Mood-aware scoring** - Matches preset mood affinities to detected audio mood

#### Advanced Audio Analyzer (`src/audio/advancedAnalyzer.js`)
Enhanced audio analysis with Meyda.js integration for intelligent preset selection:

**Spectral Features (via Meyda.js):**
- MFCC (Mel-frequency cepstral coefficients)
- Spectral Centroid, Flatness, Rolloff, Sharpness
- Spectral Flux for onset detection
- Zero Crossing Rate

**Musical Intelligence:**
- **BPM Detection** - Onset-based autocorrelation (60-180 BPM range)
- **Beat Tracking** - 4-beat bars, 16-beat phrases
- **Mood Detection** - Aggressive, relaxed, happy, electronic, acoustic
- **Buildup Detection** - Rising energy trend analysis with drop ETA
- **Musical Event Detection** - Drop, Buildup, Breakdown, Ambient, Peak, Steady

### Data Flow Architecture

```
Audio Source → Web Audio API → AudioProcessor (2048 samples)
                                      ↓
Audio Features ← AudioLevels ← FFT Analysis ← Temporal Smoothing
                                      ↓
Intelligent Selector ← Fingerprint Database ← Preset Collection
                                      ↓
Visualizer ← Selected Preset ← Equation Runner (JS/WASM)
                                      ↓
Renderer ← Shader Programs ← Separate Alpha Buffers
                                      ↓
Canvas Output ← Frame Stabilizer ← WebGL2 Context
```

### Performance Optimizations

#### Direct WebGL Rendering
- Eliminates expensive Canvas 2D `drawImage()` operations
- Uses output canvas directly as WebGL2 context
- Preserves drawing buffer for streaming/capture compatibility

#### Separate Alpha Buffer System
- `prevWarpColor` buffer for old preset during transitions
- `warpColor` buffer for new preset
- Prevents fade-to-black bug with proper alpha blending

#### Frame Time Stabilization
- Accumulator-based timing system for consistent 60 FPS
- Skip frame threshold prevents excessive catch-up rendering
- Performance monitoring with render time tracking

#### Audio Buffer Optimization
- 2048-sample buffer provides 4x better frequency resolution
- Temporal smoothing (factor 0.8) reduces animation jitter
- Optimized for bass frequency response

### WebGL Resource Management

#### Buffer Management
- Vertex buffers for mesh geometry
- Color buffers with proper cleanup during transitions
- Texture buffers with anisotropic filtering support

#### Shader Program Pipeline
1. **Warp Shader** - Geometry transformation and motion effects
2. **Comp Shader** - Composite rendering with blending
3. **Blur Shader** - Multi-pass blur effects with configurable ratios
4. **Output Shader** - Final rendering with optional FXAA

#### Context Management
- WebGL2 context with optimized settings for performance
- Extension detection and fallback handling
- Resource cleanup on context loss

### Mathematical Processing

#### Equation Evaluation
- JavaScript engine for compatibility and debugging
- WebAssembly engine for performance-critical calculations
- Automatic fallback from WASM to JavaScript on errors

#### Preset Fingerprinting
- Mathematical analysis of equation complexity
- Content hashing for deduplication
- Performance estimation based on shader complexity
- See [mathematical-fingerprinting.md](mathematical-fingerprinting.md) for detailed algorithm documentation

#### Audio Feature Extraction
- FFT-based frequency analysis
- Energy level calculation across frequency bands
- Bass response detection and quantification

### Memory Management

#### Buffer Allocation
- Pre-allocated typed arrays for audio processing
- Dynamic buffer resizing on resolution changes
- Proper cleanup during preset transitions

#### Texture Management
- Framebuffer texture recycling
- Automatic texture size adjustment
- Memory usage monitoring and optimization

#### Garbage Collection Optimization
- Object pooling for frequently created objects
- Minimal allocation during render loops
- Strategic cleanup of large temporary objects

### Advanced Audio Analysis Pipeline

#### AdvancedAudioAnalyzer Architecture
```
Audio Source → AudioContext → AnalyserNode (2048 FFT)
                                    ↓
              ┌─────────────────────┴─────────────────────┐
              ↓                                           ↓
        Basic Features                              Meyda Analyzer
    (bass, mid, treble,                          (MFCC, spectral flux,
     beatStrength, ZCR)                           centroid, flatness)
              ↓                                           ↓
              └─────────────────────┬─────────────────────┘
                                    ↓
                          Feature Aggregation
                                    ↓
              ┌─────────────────────┼─────────────────────┐
              ↓                     ↓                     ↓
        BPM Detection         Mood Detection        Buildup Detection
     (onset correlation)    (spectral analysis)    (energy trending)
              ↓                     ↓                     ↓
              └─────────────────────┴─────────────────────┘
                                    ↓
                        IntelligentPresetSelector
                                    ↓
              ┌─────────────────────┼─────────────────────┐
              ↓                     ↓                     ↓
        Phrase Tracking       Preset Scoring        Performance Tracking
     (16-beat boundaries)   (mood + BPM match)    (degradation detection)
              ↓                     ↓                     ↓
              └─────────────────────┴─────────────────────┘
                                    ↓
                          Preset Switch Decision
                                    ↓
              ┌─────────────────────┼─────────────────────┐
              ↓                     ↓                     ↓
         Pre-Drop            Phrase-Aligned          Performance
     (1.5s anticipation)    (musical coherence)     (quality drop)
```

#### BPM Detection Algorithm
1. **Onset Detection**: Spectral flux threshold crossing
2. **Autocorrelation**: Find periodicity in onset times
3. **Peak Picking**: Identify dominant tempo candidate
4. **Range Clamping**: Constrain to 60-180 BPM (halve/double if outside)
5. **Confidence Scoring**: Strength of autocorrelation peak

#### Beat Phase Tracking
```javascript
// Beat hierarchy: beats → bars → phrases
const beatInfo = {
  bpm: 120,                    // Detected tempo
  beatPosition: 2,             // Current beat in bar (0-3)
  barPosition: 1,              // Current bar in phrase (0-3)
  phrasePosition: 6,           // Current beat in phrase (0-15)
  isPhraseBoundary: false,     // True when phrasePosition === 0
  timeToNextPhrase: 4200       // Milliseconds to next phrase boundary
};
```

#### Mood Detection Model
| Mood | Key Indicators |
|------|----------------|
| **Aggressive** | High bass (>0.7), high beat strength (>0.6), high sharpness |
| **Relaxed** | Low beat strength (<0.4), low spectral centroid, low sharpness |
| **Happy** | High spectral centroid, moderate energy, low flatness |
| **Electronic** | High spectral flatness (>0.5), moderate sharpness |
| **Acoustic** | Low flatness, moderate centroid, natural harmonic structure |

#### Preset Scoring Weights (v2.0)
| Factor | Weight | Description |
|--------|--------|-------------|
| Energy Match | 25% | Audio energy vs preset energy fingerprint |
| Bass Match | 15% | Bass response alignment |
| Mood Affinity | 15% | Mood detection vs preset mood affinities |
| BPM Range | 10% | Detected BPM within preset optimal range |
| Spectral Match | 10% | Spectral characteristics alignment |
| Continuity | 10% | Visual similarity to current preset |
| Performance | 10% | FPS estimate for current device |
| Variety | 5% | Penalty for recently-shown presets |

#### Priority-Based Switch Scheduling
1. **Pre-Drop** (Highest): Buildup detected, switch 1.5s before drop
2. **Phrase Boundary**: Queued switch executes on beat 1 of phrase
3. **Performance Degradation**: Quality dropped 40%+ from baseline
4. **Audio-Triggered** (Lowest): Energy/mood change detected, queue for next phrase

### Fingerprint v2.0 Schema

See [mathematical-fingerprinting.md](mathematical-fingerprinting.md#v20-schema-phase-7-enhancements---january-2025) for complete v2.0 schema documentation including:
- Mood affinities derivation
- Optimal BPM calculation
- Color profile extraction
- Motion speed classification
- CLIP visual style integration