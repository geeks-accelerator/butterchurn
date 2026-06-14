# CLAUDE.md

This file provides AI-optimized development context for Claude Code when working with this repository.

## CRITICAL PROJECT RULES

### Non-Negotiable Constraints
- **NEVER** use same buffer for blending sources (`this.prevWarpColor` vs `this.warpColor` MUST be separate)
- **ALWAYS** pass audio data to render: `visualizer.render({ audioLevels: { timeByteArray, timeByteArrayL, timeByteArrayR } })`
- **NEVER** blend from `blankPreset` - check `isComingFromBlankPreset` before enabling blending
- **MAINTAIN** direct WebGL rendering - no Canvas 2D intermediate copies
- **PRESERVE** 2048-sample audio buffer size - never revert to 512
- **KEEP** deterministic RNG context for visual regression tests
- **MAINTAIN** 1:1 preset-to-fingerprint mapping - each JS file must have matching .fingerprints.json
- **USE** equation analysis for fingerprints - never audio testing or random data

### WebGL/Performance Rules
- Use WebGL2 context directly on output canvas (`preserveDrawingBuffer: true`)
- Force GPU acceleration with `willReadFrequently: false`
- Maintain frame stabilization accumulator system
- Never guess performance bottlenecks - always profile first
- UMD build format required for browser compatibility

### Audio Processing Rules
- Audio buffer cascades affect entire pipeline - size for worst case (bass frequencies)
- Temporal smoothing factor = 0.8 prevents animation jitter
- FFT size MUST equal `numSamps * 2`
- Validate preset completeness before loading - fail fast on invalid presets

### Testing Rules
- Visual regression tests require deterministic mode with seeded RNG
- Always test visual output, not just logic - screenshots don't lie
- Clean up global RNG overrides to prevent test contamination
- Version lock WASM toolchain - minor updates break compiled output

## CURRENT PROJECT STATUS

**Phase: Taxonomy Improvements Complete - v2.2 Schema**

### What's Working ✅
- Phase 1 performance improvements (25-30% faster rendering)
- Phase 2 intelligent preset selection with equation-based fingerprinting
- **Taxonomy Improvements (v2.2 schema):**
  - v2.2 fingerprints for full-collection (495 presets with all new fields)
  - `energyLabel` - 6-level categorical label derived from energy float
  - `musicalResponsiveness` - 5-type audio responsiveness classification
  - `reliabilityTier` - 4-tier complexity-based device compatibility
  - `dominantHue`, `colorPaletteType`, `brightness`, `colorComplexity` - extended color taxonomy
  - `HierarchicalMatcher` - two-stage filter+score preset selection (wired into `intelligentPresetSelector.js`)
  - Visual style similarity map for Stage 1 relaxation
  - v2.2 indices for categorical filtering (energyLabel, visualStyle, musicalResponsiveness, reliabilityTier, dominantHue)
  - Fixed moodAffinities string-to-number encoding bug
  - 60 unit tests for taxonomy modules (50 + 10 integration)
  - **Validation pipeline** (tools/validation/): Python frame analysis, LLM vision validation, orchestrator
- **Phase 3 Intelligent Preset Selector Improvements:**
  - Meyda.js spectral audio analysis (2048-sample buffer)
  - BPM detection with iterative clamping (60-180 BPM range)
  - Genre-aware phrase tracking (16/32/64 beats depending on genre)
  - Phrase-aligned preset switching (musical coherence)
  - Pre-drop anticipation (8-bar buildup window, configurable)
  - Mood-aware selection with extended vocabulary (meditative, dreamy, hypnotic, mystical, psychedelic) — independent if-blocks let candidates compete on confidence
  - Genre detection with timing adjustments (EDM, dubstep, hiphop, rock, classical, ambient, pop)
  - Genre-confidence hysteresis on `phraseLength` updates (`genreConfidenceThreshold`, default 0.6) — prevents tracker desync on noisy frames
  - O(1) beat advancement in `trackBeatPhase` — safe under long tab suspensions (no per-beat iteration)
  - Meyda readiness signal (getter + waitForMeyda() promise)
  - Gaussian smoothing for trend calculations (reduces jitter while preserving peaks)
  - Configurable thresholds (drop bass change, trend stability, onset detection, buildup window, genre confidence)
- **Fingerprint Quality Improvements (v2.1):**
  - Expanded mood vocabulary (mystical, hypnotic, psychedelic, dreamy, meditative)
  - Fractal-specific mood profiles (0% aggressive > 0.8)
  - Enhanced complexity scaling (378 presets > 0.5, max 0.90)
  - Keyword-based visual style detection with word boundary regex
  - Improved cool color detection (60 presets, including purple/violet)
  - Organic mood caps (acoustic > electronic, aggressive ≤ 0.75)
  - BPM and energy threshold constants in selector
  - ColorProfile and visualStyle scoring in preset selection
- Alaska Butter unified collection (495 presets, 388 unique after deduplication)
- Individual preset pack support with 1:1 fingerprint mapping
- FingerprintLoader + FingerprintAdapter system for modular preset loading
- Moving Average crossover detection for scene-based preset switching
- Separate alpha buffer blending system (fixes fade-to-black bug)
- 2048-sample audio processing with superior bass response
- Visual regression testing with deterministic RNG
- Updated CDN distribution with all preset and fingerprint files
- GitHub Pages CDN at https://geeks-accelerator.github.io/butterchurn/cdn/
- AlaskaButter demo site at https://alaskabutter.com

### What's Ready for Implementation 🚀
- **Selector Optimizations** - Audio lookahead & reverse index scaling (see docs/plans/selector-optimization-improvements.md)
- Phase 4: Machine learning-enhanced preset matching
- User preference learning and personalization

### Critical Files Status
- `src/taxonomy/` - ✅ Complete taxonomy modules (energyLabel, musicalResponsiveness, reliability, colorAnalysis, visualStyleSimilarity, hierarchicalMatcher)
- `src/config/taxonomyConfig.js` - ✅ Stage 1/Stage 2 weights and categorical dimension config
- `src/intelligentPresetSelector.js` - ✅ Complete with phrase-aligned switching, pre-drop anticipation, mood scoring, HierarchicalMatcher integration
- `src/audio/advancedAnalyzer.js` - ✅ Enhanced with Meyda, BPM detection, mood/buildup detection, Gaussian smoothing
- `src/fingerprintLoader.js` - ✅ Modular fingerprint database loader
- `src/fingerprintAdapter.js` - ✅ Database format adapter for selector compatibility
- `presets/alaska-butter/` - ✅ Unified collection (388 presets + fingerprints)
- `presets/full-collection/` - ✅ Individual packs with 1:1 fingerprint mapping
- `tools/generate-fingerprints.js` - ✅ v2.2 fingerprint schema with all taxonomy fields
- `tools/classify-visual-style.py` - ✅ CLIP-based visual style classifier
- `tools/render-preset-frames.js` - ✅ Headless preset frame renderer
- `tools/validation/` - ✅ Taxonomy validation pipeline (analyze_frames.py, llm_validate.py, validate-taxonomy.js)
- `test/fingerprint-test.html` - ✅ Working demo with new system
- `test/validation-render.html` - ✅ Headless validation render page
- `docs/cdn/presets/` - ✅ Updated CDN with all preset + fingerprint files

## ARCHITECTURE ESSENTIALS

### Technology Stack
- **Core**: JavaScript ES6+ with WebGL2 rendering
- **Audio**: Web Audio API with 2048-sample FFT analysis
- **Math**: Dual-engine (JavaScript + WebAssembly via AssemblyScript)
- **Build**: Rollup with UMD output, Terser compression
- **Test**: Jest + Puppeteer visual regression, deterministic RNG

### File Organization
```
src/
├── index.js                    # Main entry point - Butterchurn class
├── visualizer.js               # Core engine - direct WebGL rendering
├── audio/audioProcessor.js     # 2048-sample audio analysis
├── rendering/renderer.js       # Separate alpha buffers for blending
├── equations/                  # JS + WASM equation evaluation
├── utils/rngContext.js         # Deterministic RNG for testing
├── intelligentPresetSelector.js # Audio-reactive preset selection with MA crossovers
├── fingerprintLoader.js        # Modular fingerprint database loading
└── fingerprintAdapter.js       # Database format compatibility layer
```

### Key Integration Patterns
- **Rendering**: Output canvas → WebGL2 context (no intermediate copies)
- **Audio Flow**: AudioContext → Analyser → FFT → MA Crossover → Preset selection
- **Blending**: Separate `prevWarpColor` + `warpColor` buffers with inverted alpha
- **Fingerprinting**: Equation analysis → Content hashing → Pack-based loading
- **Preset Loading**: Hash ID → Pack lookup → Dynamic import → Butterchurn load
- **Testing**: Seeded RNG overrides Math.random for deterministic output

### Build System
- Rollup creates 3 bundles: main (UMD), v2 (ES), isSupported (feature detect)
- Custom AssemblyScript plugin compiles TypeScript to WASM
- Terser minification only in production builds
- Source maps enabled for debugging

## DEVELOPMENT WORKFLOW

### Build Commands
```bash
npm install --legacy-peer-deps    # Required for eel-wasm compatibility
npm run build                     # Production build (UMD + minified)
npm run dev                       # Development build with watch
npm run dev:v2                    # V2 bundle development
npm run analyze                   # Lint + typecheck + GLSL validation
npm run build:cdn                 # Build and update CDN files
npm run deploy:cdn                # Deploy CDN to GitHub Pages
```

### Test Commands
```bash
npm test                          # All tests
npm run test:visual               # Visual regression (critical!)
npm run test:visual:update        # Update snapshots (verify changes first)
npm run test:visual:view          # View test diffs
python3 -m http.server 8192       # Start server from PROJECT ROOT (not test dir!)
# Then open http://localhost:8192/test/intelligent-selector-test.html
```

### Pre-commit Procedure
1. Run `npm run analyze` (lint + typecheck + GLSL)
2. Run `npm run test:visual` (ensure no visual regressions)
3. Test performance: `npm run build && python3 -m http.server 8192`
4. Test intelligent selection: http://localhost:8192/test/intelligent-selector-test.html
5. Update CDN if needed: `npm run deploy:cdn`

### TODO: Improve Linting Configuration
Current linters still miss basic undefined variable errors. Need to:
1. **Enable stricter ESLint rules:**
   ```json
   "no-use-before-define": "error",
   "no-undef": "error",
   "block-scoped-var": "error"
   ```
2. **Consider TypeScript migration** - TS type checker catches scope/flow issues that ESLint misses
3. **Add "use strict"** directive for more aggressive runtime checking
4. **Run linter in CI** - Catch issues before they reach the repo

Note: Current setup let undefined variables slip through (e.g., compatibility checker bugs), causing runtime errors that should have been caught at lint time.

### Commit Message Convention
- `feat:` new features
- `fix:` bug fixes
- `perf:` performance improvements
- `test:` testing changes
- `docs:` documentation updates

### Debugging Steps
1. **Performance issues**: Profile with browser devtools first
2. **Rendering issues**: Check alpha buffer separation in `renderer.js`
3. **Audio unresponsiveness**: Verify `audioLevels` parameter passed to render
4. **Test failures**: Enable deterministic mode, check RNG seeding
5. **Build errors**: Check WASM toolchain versions, clear node_modules

### Enabling Debug Mode
```javascript
// Method 1: Set global flag before initializing
window.BUTTERCHURN_DEBUG = true;

// Method 2: Pass debugMode in options
const visualizer = butterchurn.createVisualizer(context, canvas, {
  debugMode: true
});

// Method 3: For IntelligentSelector
selector.debugMode = true;
```

Debug mode enables:
- Detailed blending state logs in renderer
- Transition compatibility warnings
- Frame-by-frame alpha channel diagnostics
- Preset switching decision logs

## CLAUDE.MD MAINTENANCE INSTRUCTIONS

### Update Triggers
- **CRITICAL RULES**: Add new rule when bug fix creates non-negotiable constraint
- **PROJECT STATUS**: Update phase when major milestone completed
- **ARCHITECTURE**: Update when core technology/pattern changes
- **WORKFLOW**: Update when build/test commands change

### Content Guidelines
- Keep total length under 300 lines (restructure if exceeded)
- Rules section: Most critical first, specific not vague
- Status section: Current phase, working features, next priorities
- Architecture: Stack decisions, file patterns, integration points
- Workflow: Commands, procedures, debugging steps

### CLAUDE.md vs README.md vs docs/
- **CLAUDE.md**: AI development context, rules, workflow, debugging
- **README.md**: User documentation, installation, usage examples
- **docs/**: Detailed technical specs, architecture deep-dives, deployment guides

### Length Management
- When approaching 300 lines: Move detailed specs to `docs/`
- Keep only essential development context in CLAUDE.md
- Link to external docs for comprehensive information
- Prioritize rules and workflow over detailed explanations

### AI Readability
- Use bullet points and short paragraphs
- Include concrete examples and file paths
- Structure with clear headers for scanning
- Emphasize critical items with **bold** and ✅ status indicators

## DOCUMENTATION REFERENCES

### Primary Documentation
- **README.md** - User installation, usage, and examples
- **docs/architecture/** - Detailed technical specifications
- **docs/issues/** - Bug reports and regression prevention details

### Specialized Documentation
- **docs/plans/phase1-performance-optimizations.md** - Phase 1 performance implementation details
- **docs/plans/advanced-features.md** - Advanced features roadmap and status
- **docs/plans/selector-optimization-improvements.md** - Audio lookahead & reverse index scaling
- **docs/issues/blending-fade-to-black-fix.md** - Critical blending bug fix documentation
- **docs/architecture/mathematical-fingerprinting.md** - Preset fingerprinting algorithm
- **docs/guides/** - Deployment, linting, and moving average crossover guides

### Development Resources
- `test/` - Visual regression tests and demo pages
- `tools/` - Build utilities and GLSL linting
- `examples/` - Integration examples and demos