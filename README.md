# Butterchurn - Intelligent WebGL Music Visualizer

[![Butterchurn Preview](preview.png)](https://butterchurnviz.com)

🎵 **[Live Demo: AlaskaButter.com](https://alaskabutter.com)** - Experience intelligent music visualization in your browser!

## PROJECT OVERVIEW

Butterchurn is an intelligent WebGL implementation of the Milkdrop Visualizer with advanced audio-reactive preset selection. This fork transforms the original random preset system into an intelligent music-aware visualization engine.

### Core Philosophy
- **Analyze mathematics, not music** - Preset selection based on equation fingerprints, not audio testing
- **Autonomous operation** - Runs independently once started, requiring minimal backend coordination
- **Performance first** - Direct WebGL rendering with frame stabilization for consistent 60 FPS
- **Community-driven** - Built on the extensive Milkdrop preset ecosystem with attribution preservation

### Key Capabilities
- **388+ Unique Presets** - Alaska Butter collection combines 6 preset libraries with mathematical deduplication
- **Individual Pack Support** - Access full-collection packs with 1:1 fingerprint mapping for targeted selection
- **Intelligent Selection** - Real-time audio analysis drives preset switching using equation-based fingerprints
- **Smooth Transitions** - Fixed blending system provides seamless crossfades (no more fade-to-black)
- **Enhanced Audio Processing** - 2048-sample FFT buffer for superior bass response and frequency resolution
- **Scene-Based Switching** - Moving Average crossover detection for musical scene transitions
- **Visual Regression Testing** - Deterministic rendering for reliable automated testing

### Intelligent Preset Selection (v4.1)
- **Meyda.js Spectral Analysis** - Advanced audio features including MFCC, spectral centroid, flatness, rolloff, and sharpness
- **BPM Detection & Beat Tracking** - Onset-based BPM detection with 4-beat bars and 16-beat phrase tracking
- **Phrase-Aligned Switching** - Preset changes synchronized to musical phrase boundaries (every 16 beats)
- **Pre-Drop Anticipation** - Detects energy buildups and switches 1.5 seconds before the drop
- **Mood-Aware Selection** - Real-time mood classification (aggressive, relaxed, happy, electronic, acoustic)
- **Genre Detection** - Automatic genre classification (EDM, dubstep, hip-hop, rock, classical, ambient, pop) with timing adjustments
- **Performance Degradation Tracking** - Automatic preset switching when match quality drops 40%+ from baseline
- **v2.0 Fingerprint Schema** - Enhanced fingerprints with mood affinities, optimal BPM ranges, and visual styles
- **CLIP Visual Classification** - ML-based preset categorization into 8 visual style categories
- **Adaptive FFT Recommendations** - Device-aware FFT size optimization suggestions

### Performance Improvements
- **25-30% faster rendering** through direct WebGL output (no Canvas 2D intermediate)
- **40% better frequency resolution** with 4x larger audio buffers
- **Consistent 60 FPS** via frame stabilization system
- **Memory efficient** with proper buffer cleanup during preset transitions

## INSTALLATION & SETUP

### System Requirements
- Modern browser with WebGL2 support (Chrome 58+, Firefox 51+, Safari 15+)
- Web Audio API support for audio analysis
- Minimum 2GB RAM recommended for full preset collection

### Browser Compatibility Check
```javascript
import isButterchurnSupported from "butterchurn/lib/isSupported.min";

if (isButterchurnSupported()) {
  // Initialize Butterchurn
} else {
  // Show fallback or upgrade message
}
```

## LIVE DEMO

### 🌐 AlaskaButter.com - Try It Now!

Experience Butterchurn's intelligent music visualization at **[alaskabutter.com](https://alaskabutter.com)**:

- 🎵 **Load any audio file** or use the built-in demo song
- 🤖 **AI-driven preset selection** that matches your music's energy
- 📱 **Works on any device** - desktop, laptop, tablet, or mobile
- 🧪 **Advanced test interface** at [alaskabutter.com/test.html](https://alaskabutter.com/test.html)

No installation required - just open your browser and start visualizing!

### Node.js Development Setup
```bash
# Clone repository (Enhanced Fork)
git clone https://github.com/geeks-accelerator/butterchurn.git
cd butterchurn

# Install dependencies (legacy flag required for eel-wasm)
npm install --legacy-peer-deps

# Download preset source files (optional, needed for fingerprint regeneration)
./setup-full-presets.sh

# Build for production
npm run build

# Run development server with watch mode
npm run dev

# Start local test server on port 8192
# (8192 = 2^13, a power of 2 matching audio buffer sizes)
npm run serve:test

# Then open http://localhost:8192/intelligent-selector-test.html
```

### CDN Installation

#### Enhanced Fork CDN (GitHub Pages)
```html
<!-- Core Butterchurn library (Enhanced Fork) -->
<script src="https://geeks-accelerator.github.io/butterchurn/cdn/butterchurn.min.js"></script>

<!-- Alaska Butter - Unified preset collection (388 unique presets) -->
<script src="https://geeks-accelerator.github.io/butterchurn/cdn/presets/alaskaButter.min.js"></script>

<!-- Or load individual preset packs -->
<script src="https://geeks-accelerator.github.io/butterchurn/cdn/presets/butterchurnPresets.min.js"></script>
<script src="https://geeks-accelerator.github.io/butterchurn/cdn/presets/butterchurnPresetsExtra.min.js"></script>

<!-- Fingerprint databases for intelligent selection -->
<script type="module">
  // Load fingerprint loader
  import FingerprintLoader from './src/fingerprintLoader.js';

  const loader = new FingerprintLoader();
  await loader.loadAllFingerprints('/cdn/presets/');
  console.log(`Loaded ${loader.getStats().totalPresets} preset fingerprints`);
</script>
```

#### Original NPM CDN
```html
<!-- Core Butterchurn library -->
<script src="https://unpkg.com/butterchurn@latest/dist/butterchurn.min.js"></script>

<!-- Preset collections -->
<script src="https://unpkg.com/butterchurn-presets@latest/dist/butterchurn-presets.min.js"></script>

<!-- Feature detection -->
<script src="https://unpkg.com/butterchurn@latest/dist/isSupported.min.js"></script>
```

### Package Manager Installation
```bash
# Using npm
npm install butterchurn butterchurn-presets

# Using yarn
yarn add butterchurn butterchurn-presets

# Using pnpm
pnpm add butterchurn butterchurn-presets
```

## USAGE

### Basic Setup
```javascript
import butterchurn from 'butterchurn';
import butterchurnPresets from 'butterchurn-presets';

// Initialize Web Audio
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const canvas = document.getElementById('canvas');

// Create visualizer
const visualizer = butterchurn.createVisualizer(audioContext, canvas, {
  width: 800,
  height: 600,
  pixelRatio: window.devicePixelRatio || 1
});

// Connect audio source
const audio = document.getElementById('audio');
const source = audioContext.createMediaElementSource(audio);
visualizer.connectAudio(source);

// Load and start preset
const presets = butterchurnPresets.getPresets();
const presetKeys = Object.keys(presets);
visualizer.loadPreset(presets[presetKeys[0]], 0.0);
```

### Intelligent Preset Selection with Alaska Butter
```javascript
// Load intelligent selector with new fingerprint system
import IntelligentPresetSelector from './src/intelligentPresetSelector.js';

// Create intelligent selector with optional audio context for advanced features
const selector = new IntelligentPresetSelector(visualizer, {
  // Configuration options
  energyMatch: 0.25,      // Energy matching weight
  moodMatch: 0.15,        // Mood affinity weight
  bpmMatch: 0.10,         // BPM range matching weight
  spectralMatch: 0.10     // Spectral similarity weight
}, audioContext, audioSource);  // Optional: for Meyda.js integration

// Initialize with Alaska Butter preset collection
await selector.initialize({
  basePath: '/presets/',  // Location of preset and fingerprint files
  autoLoadPacks: true     // Automatically load all preset JS files
});

// Trigger BPM detection when audio is loaded
audioElement.addEventListener('canplay', async () => {
  const audioBuffer = await audioContext.decodeAudioData(audioData);
  await selector.onAudioLoaded(audioBuffer);
  console.log('Detected BPM:', selector.audioAnalyzer.detectedBPM);
});

// Render loop with intelligent selection
function animate() {
  const audioLevels = {
    timeByteArray: new Uint8Array(visualizer.audio.timeByteArray),
    timeByteArrayL: new Uint8Array(visualizer.audio.timeByteArrayL),
    timeByteArrayR: new Uint8Array(visualizer.audio.timeByteArrayR)
  };

  // Intelligent preset selection with phrase-aligned switching
  const result = selector.update(audioLevels);

  // Access detected features
  if (result.features) {
    console.log('Current mood:', result.features.mood?.label);
    console.log('Beat phase:', result.features.beatInfo?.phrasePosition, '/ 16');
  }

  // Render with audio data
  visualizer.render({ audioLevels });

  requestAnimationFrame(animate);
}
animate();
```

### Advanced Intelligent Selection Features
```javascript
// Access real-time audio analysis
const analyzer = selector.audioAnalyzer;

// Get current beat information
const beatInfo = analyzer.trackBeatPhase();
if (beatInfo) {
  console.log(`BPM: ${beatInfo.bpm}`);
  console.log(`Beat: ${beatInfo.beatPosition + 1}/4`);
  console.log(`Bar: ${beatInfo.barPosition + 1}/4`);
  console.log(`Phrase: ${beatInfo.phrasePosition + 1}/16`);
  console.log(`Is phrase boundary: ${beatInfo.isPhraseBoundary}`);
}

// Get mood detection
const features = analyzer.calculateFeatures(freqData, timeData);
const mood = analyzer.detectMood(features);
console.log(`Mood: ${mood.label} (${(mood.confidence * 100).toFixed(0)}% confidence)`);

// Detect buildups (for pre-drop anticipation)
const buildup = analyzer.detectBuildup(features);
if (buildup.isBuildup) {
  console.log(`Buildup detected! Drop ETA: ${buildup.dropETA}ms`);
}

// Manual preset selection with mood/BPM matching
const mood = { label: 'electronic', confidence: 0.8 };
const bestPreset = selector.selectBestPreset(features, mood);
```

### Manual Preset Loading by Hash
```javascript
// Load specific preset using 8-character hash ID
const presetHash = 'a3f7b2c9';  // Content-based hash
await selector.loadPresetByHash(presetHash, 2.0);  // 2-second crossfade

// Get preset info by hash
const preset = await selector.getPresetByHash(presetHash);
console.log('Loaded:', preset.name, 'by', preset.author);
```

### Advanced Configuration
```javascript
const visualizer = butterchurn.createVisualizer(audioContext, canvas, {
  width: 1920,
  height: 1080,
  pixelRatio: 2,              // High DPI support
  textureRatio: 1,            // Texture resolution multiplier
  meshWidth: 48,              // Warp mesh resolution
  meshHeight: 36,
  targetFPS: 60,              // Frame stabilization target
  outputFXAA: true,           // Anti-aliasing
  deterministic: false,       // Enable for testing
  testMode: false             // Deterministic with seeded RNG
});
```

### Manual Preset Management
```javascript
// Load specific preset with blend time
const presetName = 'Flexi - mindblob mix';
const preset = presets[presetName];
visualizer.loadPreset(preset, 2.0); // 2-second crossfade

// Resize visualizer
visualizer.setRendererSize(1600, 1200);

// Connect different audio sources
const micSource = await navigator.mediaDevices.getUserMedia({ audio: true });
const micSourceNode = audioContext.createMediaStreamSource(micSource);
visualizer.connectAudio(micSourceNode);
```

## TECHNICAL DETAILS

### High-Level Architecture
```
Audio Input → Web Audio API → 2048-sample FFT → Audio Analysis
                                     ↓
Preset Database ← Intelligent Selector ← Audio Features
                                     ↓
    WebGL2 Renderer ← Butterchurn Core ← Selected Preset
                                     ↓
         Canvas Output (60 FPS) ← Frame Stabilizer
```

### Performance Characteristics
- **Render Time**: 8-10ms average (target <10ms for 60 FPS)
- **Memory Usage**: ~200MB with full preset collection
- **Audio Latency**: ~20ms from audio to visual response
- **Preset Switch Time**: 2-5 seconds with smooth crossfades
- **CPU Usage**: 15-25% on modern hardware
- **GPU Usage**: Moderate (optimized shaders, minimal state changes)

### Supported Formats
- **Audio Sources**: MediaElement, MediaStream, AudioBuffer, external AudioNode
- **Preset Formats**: Original .milk files, JavaScript preset objects
- **Output**: Direct WebGL2 rendering to canvas
- **Browsers**: Chrome 58+, Firefox 51+, Safari 15+, Edge 79+

### Mathematical Fingerprinting System
Each preset is analyzed by its mathematical equations to generate:

**v1.0 Fields (Core):**
- **Content Hash**: 8-character SHA256-based unique identifier for deduplication
- **Energy Score**: Complexity based on equation analysis and variable usage
- **Bass Reactivity**: Frequency of bass-related variables (bass, bass_att, etc.)
- **Treble Reactivity**: Usage of treble frequency variables (treb, high, etc.)
- **Performance Estimate**: Shader complexity scoring for FPS estimation
- **Pack Attribution**: Source pack tracking with author and name preservation

**v2.0 Fields (Intelligent Selection):**
- **Mood Affinities**: Compatibility scores for aggressive, relaxed, happy, electronic, acoustic
- **Optimal BPM Range**: Min/max/ideal BPM for best visual synchronization
- **Color Profile**: Dominant color temperature (warm, cool, nature, neutral)
- **Motion Speed**: Visual motion category (slow, medium, fast)
- **Visual Style**: Primary visual category from ML classification
- **Visual Style Scores**: CLIP confidence scores across 8 visual categories

### Preset Collections
- **Alaska Butter**: 388 unique presets (deduplicated from all 6 packs)
- **Full Collection**: Individual packs with 1:1 fingerprint mapping
- **Total Available**: 553 presets before deduplication (160 duplicates removed)

### Troubleshooting Guide

#### Visualizer Not Responding to Audio
- Verify `audioLevels` parameter passed to `render()` method
- Check Web Audio API permissions (microphone/media access)
- Ensure audio source is properly connected to visualizer
- Test with different audio sources to isolate issue

#### Black Screen or No Visual Output
- Check WebGL2 support: `isButterchurnSupported()`
- Verify canvas element exists and has proper dimensions
- Check browser console for WebGL context errors
- Test with minimal preset first before complex ones

#### Poor Performance/Low FPS
- Reduce canvas resolution or `pixelRatio`
- Disable `outputFXAA` anti-aliasing
- Close other GPU-intensive browser tabs
- Check performance with `test/performance-test.html`

#### Preset Switching Issues
- Verify fingerprint database loaded correctly
- Check preset pack contains valid preset objects
- Test intelligent selector pause/resume functionality
- Validate preset completeness before loading

#### Build/Development Issues
- Use `npm install --legacy-peer-deps` for eel-wasm compatibility
- Clear `node_modules` and reinstall if WASM errors occur
- Check Node.js version compatibility (14+ recommended)
- Verify TypeScript and AssemblyScript toolchain versions

### Integration Examples
- **[Webamp](https://github.com/captbaritone/webamp)** - Winamp 2.9 reimplementation
- **[Butterchurn Extension](https://chrome.google.com/webstore/detail/butterchurn-music-visuali/jfdmelgfepjcmlljpdeajbiiibkehnih)** - Browser extension for any audio
- **[Nightride FM](https://nightride.fm)** - Live DJ streaming with visualizations
- **[mStream](http://mstream.io/)** - Personal music streaming server

## Contributing

### Development Workflow
1. Fork repository and create feature branch
2. Install dependencies: `npm install --legacy-peer-deps`
3. Make changes following code style (ESLint + Prettier)
4. Run tests: `npm run analyze && npm run test:visual`
5. Test performance: `npm run build && open test/performance-test.html`
6. Submit pull request with clear description

### Code Quality Tools

This project enforces code quality through multiple linters and validators:

#### Linting Commands
```bash
# Run all code quality checks
npm run analyze

# Individual linters
npm run lint:check      # ESLint - JavaScript code style
npm run typecheck       # TypeScript - Type checking (no emit)
npm run lint:glsl       # GLSL - Shader code validation

# Auto-fix linting issues
npm run lint            # ESLint with --fix flag

# Pre-commit check (runs all analyzers)
npm run precommit
```

#### Configured Linters
- **ESLint**: JavaScript/TypeScript code style and best practices
  - Parser: `@typescript-eslint/parser`
  - Plugins: `import`, `jsdoc`, `prettier`
  - Extends: `eslint-config-prettier` for Prettier integration

- **TypeScript**: Static type checking with `tsconfig.json`
  - Strict mode enabled
  - No implicit any
  - ES2020 target with ES modules

- **GLSL Linter**: Custom shader validation (`tools/glsl-lint.js`)
  - Validates WebGL shader syntax
  - Checks for common GLSL errors
  - Ensures shader compatibility

- **Prettier**: Code formatting
  - Integrated with ESLint
  - Consistent code style across the project
  - Auto-formats on lint --fix

### Visual Regression Testing
Critical for preventing rendering bugs:
```bash
npm run test:visual              # Run visual tests
npm run test:visual:update       # Update snapshots (verify first!)
npm run test:visual:view         # View test differences
```

### Bug Reports
Please include:
- Browser version and operating system
- Steps to reproduce
- Expected vs actual behavior
- Console errors or warnings
- Minimal example if possible

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Ryan Geiss** for creating the original [MilkDrop](http://www.geisswerks.com/about_milkdrop.html)
- **Nullsoft** for [Winamp](http://www.winamp.com/) and the visualization ecosystem
- **Jordan Berg** for the original [Butterchurn](https://github.com/jberg/butterchurn) WebGL implementation
- **Preset creators** including Flexi, Geiss, Martin, Rovastar, and hundreds of community contributors
- **Performance optimization** insights from production streaming applications