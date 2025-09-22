# Butterchurn Deployment Guide

## Production Build

### Build Process
```bash
# Install dependencies
npm install --legacy-peer-deps

# Run quality checks
npm run analyze

# Create production build
npm run build

# Verify build output
ls -la dist/
# Should contain: butterchurn.min.js, butterchurn-v2.min.js, isSupported.min.js
```

### Build Verification
```bash
# Test performance
npm run build && open test/performance-test.html
# Target: <10ms render times, stable 60 FPS

# Test visual regression
npm run test:visual
# Should pass without snapshot updates

# Test blending system
open test/intelligent-selector-test.html
# Verify smooth crossfades, no black screens
```

## CDN Deployment

### File Structure
```
dist/
├── butterchurn.min.js          # Main UMD bundle (~800KB)
├── butterchurn-v2.min.js       # Next-gen ES module (~850KB)
├── isSupported.min.js          # Feature detection (~2KB)
└── butterchurn.min.js.map      # Source map for debugging
```

### CDN Configuration
```html
<!-- Core library -->
<script src="https://cdn.jsdelivr.net/npm/butterchurn@3.0.0-beta.5/dist/butterchurn.min.js"></script>

<!-- Preset collections -->
<script src="https://cdn.jsdelivr.net/npm/butterchurn-presets@3.0.0-beta.4/dist/butterchurn-presets.min.js"></script>

<!-- Feature detection -->
<script src="https://cdn.jsdelivr.net/npm/butterchurn@3.0.0-beta.5/dist/isSupported.min.js"></script>
```

### Cache Headers
```
butterchurn.min.js: Cache-Control: public, max-age=31536000, immutable
isSupported.min.js: Cache-Control: public, max-age=31536000, immutable
butterchurn-presets.min.js: Cache-Control: public, max-age=31536000, immutable
```

## Web Application Integration

### Basic Integration
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Butterchurn Visualizer</title>
    <style>
        #canvas { width: 100vw; height: 100vh; }
    </style>
</head>
<body>
    <canvas id="canvas"></canvas>

    <script src="dist/butterchurn.min.js"></script>
    <script src="butterchurn-presets.min.js"></script>
    <script>
        // Feature detection
        if (butterchurnIsSupported()) {
            initVisualizer();
        } else {
            showFallback();
        }

        async function initVisualizer() {
            const audioContext = new AudioContext();
            const canvas = document.getElementById('canvas');

            const visualizer = butterchurn.createVisualizer(audioContext, canvas, {
                width: window.innerWidth,
                height: window.innerHeight,
                pixelRatio: window.devicePixelRatio || 1
            });

            // Connect audio source
            const audio = document.getElementById('audio-element');
            const source = audioContext.createMediaElementSource(audio);
            visualizer.connectAudio(source);

            // Load preset and start rendering
            const presets = butterchurnPresets.getPresets();
            const presetKeys = Object.keys(presets);
            visualizer.loadPreset(presets[presetKeys[0]], 0.0);

            function render() {
                visualizer.render();
                requestAnimationFrame(render);
            }
            render();
        }
    </script>
</body>
</html>
```

### Advanced Integration with Intelligent Selection
```javascript
class ButterchurnVisualizer {
    constructor(canvas, audioElement) {
        this.canvas = canvas;
        this.audioElement = audioElement;
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.visualizer = null;
        this.selector = null;
        this.isRunning = false;
    }

    async initialize() {
        // Create visualizer
        this.visualizer = butterchurn.createVisualizer(this.audioContext, this.canvas, {
            width: this.canvas.clientWidth,
            height: this.canvas.clientHeight,
            pixelRatio: window.devicePixelRatio || 1,
            targetFPS: 60
        });

        // Connect audio
        const source = this.audioContext.createMediaElementSource(this.audioElement);
        this.visualizer.connectAudio(source);

        // Load intelligent selector
        const fingerprintResponse = await fetch('fingerprints.json');
        const fingerprintDatabase = await fingerprintResponse.json();

        this.selector = new IntelligentPresetSelector(this.visualizer, fingerprintDatabase);

        // Load preset collections
        const allPresets = {
            ...butterchurnPresets.getPresets(),
            // Add additional preset packs as needed
        };
        this.selector.setPresetPack(allPresets);
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.render();
    }

    stop() {
        this.isRunning = false;
    }

    render() {
        if (!this.isRunning) return;

        const audioLevels = {
            timeByteArray: new Uint8Array(this.visualizer.audio.timeByteArray),
            timeByteArrayL: new Uint8Array(this.visualizer.audio.timeByteArrayL),
            timeByteArrayR: new Uint8Array(this.visualizer.audio.timeByteArrayR)
        };

        // Intelligent preset selection
        this.selector.update(audioLevels);

        // Render with audio data
        this.visualizer.render({ audioLevels });

        requestAnimationFrame(() => this.render());
    }

    resize(width, height) {
        this.visualizer.setRendererSize(width, height);
    }
}

// Usage
const canvas = document.getElementById('canvas');
const audio = document.getElementById('audio');
const viz = new ButterchurnVisualizer(canvas, audio);

viz.initialize().then(() => {
    viz.start();
});
```

## Server-Side Deployment

### Node.js Environment
```javascript
// Not typically used server-side, but for testing/rendering:
const { JSDOM } = require('jsdom');
const { createCanvas } = require('canvas');

// Setup DOM environment for testing
const dom = new JSDOM();
global.window = dom.window;
global.document = dom.window.document;

// Canvas polyfill for Node.js testing
const canvas = createCanvas(800, 600);
// Note: WebGL not available in Node.js - use for unit tests only
```

### Docker Container
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copy source and build
COPY . .
RUN npm run build

# Serve static files
RUN npm install -g serve
EXPOSE 3000

CMD ["serve", "-s", ".", "-l", "3000"]
```

## Performance Optimization

### Bundle Analysis
```bash
# Analyze bundle size
npx rollup-plugin-analyzer

# Check for unused dependencies
npx depcheck

# Profile build performance
npm run build -- --profile
```

### Loading Optimization
```html
<!-- Preload critical resources -->
<link rel="preload" href="butterchurn.min.js" as="script">
<link rel="preload" href="fingerprints.json" as="fetch" crossorigin>

<!-- Non-critical preset packs can load later -->
<script async src="butterchurn-presets-extra.min.js"></script>
```

### Memory Management
```javascript
// Cleanup when switching visualizers
function cleanup() {
    if (visualizer) {
        visualizer.cleanup(); // If available
        visualizer = null;
    }

    if (audioContext.state !== 'closed') {
        audioContext.close();
    }

    // Force garbage collection
    if (window.gc) {
        window.gc();
    }
}
```

## Monitoring and Analytics

### Performance Monitoring
```javascript
class PerformanceMonitor {
    constructor() {
        this.renderTimes = [];
        this.frameCount = 0;
        this.lastTime = performance.now();
    }

    recordFrame() {
        const now = performance.now();
        const frameTime = now - this.lastTime;
        this.renderTimes.push(frameTime);
        this.frameCount++;
        this.lastTime = now;

        // Report every 60 frames
        if (this.frameCount % 60 === 0) {
            this.report();
        }
    }

    report() {
        const avgFrameTime = this.renderTimes.reduce((a, b) => a + b, 0) / this.renderTimes.length;
        const fps = 1000 / avgFrameTime;

        console.log(`FPS: ${fps.toFixed(1)}, Avg Frame Time: ${avgFrameTime.toFixed(1)}ms`);

        // Send to analytics
        if (window.gtag) {
            gtag('event', 'performance', {
                fps: fps,
                frame_time: avgFrameTime,
                preset_count: this.presetCount
            });
        }

        // Reset
        this.renderTimes = [];
    }
}
```

### Error Tracking
```javascript
window.addEventListener('error', (event) => {
    if (event.filename.includes('butterchurn')) {
        console.error('Butterchurn Error:', event.error);

        // Send to error tracking service
        if (window.Sentry) {
            Sentry.captureException(event.error);
        }
    }
});

// WebGL context loss handling
canvas.addEventListener('webglcontextlost', (event) => {
    console.warn('WebGL context lost');
    event.preventDefault();

    // Attempt to restore
    setTimeout(() => {
        initVisualizer();
    }, 1000);
});
```