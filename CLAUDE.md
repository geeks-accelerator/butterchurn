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

**Phase: Phase 2 Complete - Intelligent Selection Active**

### What's Working ✅
- Phase 1 performance improvements (25-30% faster rendering)
- Phase 2 intelligent preset selection with fingerprint database
- Separate alpha buffer blending system (fixes fade-to-black bug)
- 2048-sample audio processing with superior bass response
- Visual regression testing with deterministic RNG
- Full preset collection (395+ presets) with deduplication
- GitHub Pages CDN at https://geeks-accelerator.github.io/butterchurn/cdn/
- AlaskaButter demo site at https://alaskabutter.com

### What's Ready for Implementation 🚀
- Phase 3: Song structure recognition and energy-based preset memory
- Advanced instrumentation detection
- Preset performance tracking and learning
- Real-time spectral analysis for instrument detection

### Critical Files Status
- `src/intelligentPresetSelector.js` - ✅ Complete intelligent selection
- `fingerprints.json` - ✅ Complete database (395 unique presets)
- `setup-full-presets.sh` - ✅ Automated preset collection download
- `test/intelligent-selector-test.html` - ✅ Working demo
- `docs/cdn/` - ✅ GitHub Pages CDN distribution

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
└── intelligentPresetSelector.js # Audio-reactive preset selection
```

### Key Integration Patterns
- **Rendering**: Output canvas → WebGL2 context (no intermediate copies)
- **Audio Flow**: AudioContext → Analyser → FFT → Preset selection
- **Blending**: Separate `prevWarpColor` + `warpColor` buffers with inverted alpha
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
npm run serve:test                # Start test server on port 8192
# Then open http://localhost:8192/intelligent-selector-test.html
```

### Pre-commit Procedure
1. Run `npm run analyze` (lint + typecheck + GLSL)
2. Run `npm run test:visual` (ensure no visual regressions)
3. Test performance: `npm run build && npm run serve:test`
4. Test intelligent selection: http://localhost:8192/intelligent-selector-test.html
5. Update CDN if needed: `npm run deploy:cdn`

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
- **docs/architecture.md** - Detailed technical specifications
- **docs/bugs/** - Bug reports and regression prevention details

### Specialized Documentation
- **docs/PERFORMANCE_IMPROVEMENTS.md** - Phase 1 & 2 implementation details
- **docs/BLENDING_BUG_ANALYSIS.md** - Critical blending bug fix documentation
- **docs/MATHEMATICAL_FINGERPRINTING.md** - Preset fingerprinting algorithm
- **docs/WEBASSEMBLY_IMPLEMENTATION_PLAN.md** - WASM acceleration implementation
- **docs/PRERENDERING_IMPLEMENTATION_PLAN.md** - Advanced preset optimization plans

### Development Resources
- `test/` - Visual regression tests and demo pages
- `tools/` - Build utilities and GLSL linting
- `examples/` - Integration examples and demos