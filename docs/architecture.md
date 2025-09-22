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