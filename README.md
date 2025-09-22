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
- **500+ Unique Presets** - Curated from 5 preset libraries with mathematical deduplication
- **Intelligent Selection** - Real-time audio analysis drives preset switching based on energy, bass, and complexity
- **Smooth Transitions** - Fixed blending system provides seamless crossfades (no more fade-to-black)
- **Enhanced Audio Processing** - 2048-sample FFT buffer for superior bass response and frequency resolution
- **Visual Regression Testing** - Deterministic rendering for reliable automated testing

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

# Download full preset collection (optional, ~3MB)
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

<!-- Preset collections -->
<script src="https://geeks-accelerator.github.io/butterchurn/cdn/presets/butterchurnPresets.min.js"></script>
<script src="https://geeks-accelerator.github.io/butterchurn/cdn/presets/butterchurnPresetsExtra.min.js"></script>

<!-- Fingerprint database for intelligent selection -->
<script>
  fetch('https://geeks-accelerator.github.io/butterchurn/cdn/fingerprints.json')
    .then(r => r.json())
    .then(db => console.log(`Loaded ${Object.keys(db.presets).length} preset fingerprints`));
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

### Intelligent Preset Selection
```javascript
// Load intelligent selector with fingerprint database
import { IntelligentPresetSelector } from './src/intelligentPresetSelector.js';

// Load fingerprint database (495 unique presets analyzed)
const response = await fetch('fingerprints.json');
const fingerprintDatabase = await response.json();

// Create intelligent selector
const selector = new IntelligentPresetSelector(visualizer, fingerprintDatabase);

// Set preset collection
const allPresets = {
  ...butterchurnPresets.getPresets(),
  // Add additional preset packs as needed
};
selector.setPresetPack(allPresets);

// Render loop with intelligent selection
function animate() {
  const audioLevels = {
    timeByteArray: new Uint8Array(visualizer.audio.timeByteArray),
    timeByteArrayL: new Uint8Array(visualizer.audio.timeByteArrayL),
    timeByteArrayR: new Uint8Array(visualizer.audio.timeByteArrayR)
  };

  // Intelligent preset selection based on audio features
  selector.update(audioLevels);

  // Render with audio data
  visualizer.render({ audioLevels });

  requestAnimationFrame(animate);
}
animate();
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
- **Energy Score**: Complexity of motion and transformation equations
- **Bass Responsiveness**: Usage of bass frequency variables (bass, bass_att, etc.)
- **Performance Rating**: Estimated FPS based on shader complexity
- **Content Hash**: 8-character unique identifier for deduplication

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