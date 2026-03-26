/**
 * Intelligent Preset Selector for Butterchurn
 *
 * Selects presets based on real-time audio features using
 * pre-generated fingerprint database with 8-character hashes
 *
 * Enhanced with:
 * - Live frame analysis for problematic preset detection
 * - Preset failure logging and automatic blocklist management
 * - Emergency preset fallback system
 * - Configuration-driven thresholds and behavior
 *
 * Note: Advanced features (frame analysis, blocklist, emergency presets)
 * require importing the respective modules. When used as a standalone script,
 * these features will be disabled but core functionality will work.
 */

// Import working modules only
import FingerprintLoader from './fingerprintLoader.js';
import FingerprintAdapter from './fingerprintAdapter.js';
import PresetCompatibilityChecker from './utils/presetCompatibilityChecker.js';

/**
 * PresetPerformanceTracker
 * Tracks how well the current preset matches ongoing audio.
 * Triggers switch when match quality degrades below threshold.
 *
 * CRIT-6 FIX: Does NOT compute its own scores - accepts scores from scorePreset()
 */
class PresetPerformanceTracker {
    constructor(config = {}) {
        this.scoreHistory = [];
        this.maxHistorySize = config.maxHistorySize || 60;  // ~1 second at 60fps
        this.degradationThreshold = config.degradationThreshold || 0.4;  // 40% drop triggers switch

        // WARN-6 FIX: Use first N scores for stable baseline (not single value)
        this.baselineScores = [];
        this.BASELINE_SIZE = 30;  // First 0.5 seconds for baseline
    }

    /**
     * Update performance tracking with score from scorePreset()
     * CRIT-6 FIX: Accepts pre-calculated score, doesn't compute its own
     *
     * @param {number} currentScore - Score from main scorePreset() function
     * @returns {Object} { shouldSwitch, degradation, reason }
     */
    update(currentScore) {
        if (currentScore === undefined || currentScore === null) {
            return { shouldSwitch: false, degradation: 0, reason: null };
        }

        // WARN-6 FIX: Build baseline from first N scores (more stable than single value)
        if (this.baselineScores.length < this.BASELINE_SIZE) {
            this.baselineScores.push(currentScore);
            return { shouldSwitch: false, degradation: 0, reason: 'building_baseline' };
        }

        // Track ongoing score history
        this.scoreHistory.push(currentScore);
        if (this.scoreHistory.length > this.maxHistorySize) {
            this.scoreHistory.shift();
        }

        // Need enough history to detect degradation
        if (this.scoreHistory.length < 30) {
            return { shouldSwitch: false, degradation: 0, reason: null };
        }

        // Calculate baseline from first N scores (stable reference point)
        const baseline = this.baselineScores.reduce((a, b) => a + b, 0) /
                         this.baselineScores.length;

        // Calculate current average score
        const current = this.scoreHistory.reduce((a, b) => a + b, 0) /
                        this.scoreHistory.length;

        // Calculate degradation from baseline
        const degradation = baseline > 0 ? (baseline - current) / baseline : 0;

        if (degradation > this.degradationThreshold) {
            return {
                shouldSwitch: true,
                degradation: degradation,
                reason: `performance_degraded_${(degradation * 100).toFixed(0)}%`,
                baseline: baseline,
                current: current
            };
        }

        return { shouldSwitch: false, degradation, baseline, current };
    }

    /**
     * Reset tracking (call when switching presets)
     */
    reset() {
        this.scoreHistory = [];
        this.baselineScores = [];
    }
}

// Advanced modules (optional - will be disabled if not available)
let frameAnalyzer, presetLogger, emergencyManager, blocklistManager, config, AdvancedAudioAnalyzer, MultiSignalCrossover;

// Load advanced modules asynchronously without blocking the main thread
const loadAdvancedModules = async () => {
    try {
        const modules = await Promise.all([
            import('./analysis/liveFrameAnalyzer.js').catch(() => null),
            import('./analysis/presetFailureLogger.js').catch(() => null),
            import('./presets/emergencyPresetManager.js').catch(() => null),
            import('./blocklist/blocklistManager.js').catch(() => null),
            import('./config/config.js').catch(() => null),
            import('./audio/advancedAnalyzer.js').catch(() => null),
            import('./audio/movingAverageCrossover.js').catch(() => null)
        ]);
        [frameAnalyzer, presetLogger, emergencyManager, blocklistManager, config, AdvancedAudioAnalyzer, MultiSignalCrossover] = modules.map((m, i) => {
            // Special handling for presetFailureLogger - we want the named export 'presetLogger'
            if (i === 1 && m) { // presetFailureLogger is at index 1
                return m.presetLogger || m.default || m;
            }
            return m?.default || m;
        });
        console.log('[IntelligentSelector] Advanced modules loaded:', {
            frameAnalyzer: !!frameAnalyzer,
            presetLogger: !!presetLogger,
            emergencyManager: !!emergencyManager,
            blocklistManager: !!blocklistManager,
            config: !!config,
            AdvancedAudioAnalyzer: !!AdvancedAudioAnalyzer,
            MultiSignalCrossover: !!MultiSignalCrossover
        });
    } catch (e) {
        console.log('[IntelligentSelector] Advanced modules not available, using fallback mode');
    }
};

// Start loading modules but don't block
loadAdvancedModules();

class IntelligentPresetSelector {
    /**
     * Create an intelligent preset selector
     * CRIT-3 FIX: Accept audioContext/audioSource for Meyda integration
     * @param {Object} butterchurn - Butterchurn visualizer instance
     * @param {Object} fingerprintDatabase - Fingerprint database
     * @param {Object} selectorConfig - Optional configuration
     * @param {AudioContext} audioContext - Optional: Web Audio context for Meyda
     * @param {AudioNode} audioSource - Optional: Audio source node for Meyda
     */
    constructor(butterchurn, fingerprintDatabase, selectorConfig = {}, audioContext = null, audioSource = null) {
        this.butterchurn = butterchurn;
        this.db = fingerprintDatabase;

        // CRIT-3 FIX: Store audio context for timing and Meyda
        this.audioContext = audioContext;
        this.audioSource = audioSource;

        // Preset loading system
        this.loader = null;
        this.adapter = null;
        this.presetCache = {};
        this.loadedPacks = new Set();
        this.isInitialized = false;

        // Selection state
        this.currentHash = null;
        this.currentPreset = null;
        this.lastSwitch = 0;
        this.currentWarmupTime = 0; // Track warmup requirement for current preset

        // Initialize audio analyzer with config (optional)
        // CRIT-3 FIX: Pass audioContext and audioSource for Meyda integration
        this.audioAnalyzer = null;
        if (AdvancedAudioAnalyzer) {
            const analyzerConfig = (typeof config !== 'undefined' && config?.get) ? {
                dropThreshold: config.get('audioAnalysis.dropThreshold', 0.7),
                buildupThreshold: config.get('audioAnalysis.buildupThreshold', 0.5),
                breakdownThreshold: config.get('audioAnalysis.breakdownThreshold', 0.3),
                chillThreshold: config.get('audioAnalysis.chillThreshold', 0.3),
                bassWeight: config.get('audioAnalysis.bassWeight', 0.6),
                trebleWeight: config.get('audioAnalysis.trebleWeight', 0.3),
                maxHistorySize: config.get('audioAnalysis.maxHistorySize', 30)
            } : {};
            this.audioAnalyzer = new AdvancedAudioAnalyzer(analyzerConfig, audioContext, audioSource);
        }

        // NEW: Phrase-aligned switching (16 beats for musical coherence)
        this.pendingSwitchOnPhrase = false;
        this.pendingSwitchPreset = null;
        this.pendingSwitchHash = null;
        this.pendingSwitchReason = null;

        // NEW: Pre-drop anticipation
        this.preDropSwitchScheduled = false;
        this.preDropSwitchTime = null;
        this.PRE_DROP_LEAD_TIME = 1500; // Switch 1.5 seconds BEFORE drop

        // NEW: Performance degradation tracking
        this.performanceTracker = new PresetPerformanceTracker({
            maxHistorySize: 60,
            degradationThreshold: 0.4  // Switch at 40% degradation
        });
        this.currentPresetScore = 0;

        // TWIN-WARN-1 FIX: Deterministic RNG for visual regression tests
        // CLAUDE.md: "KEEP deterministic RNG context for visual regression tests"
        this.rngSeed = selectorConfig.rngSeed || null;
        this.rng = this.rngSeed !== null ? this._createSeededRng(this.rngSeed) : Math.random.bind(Math);

        // Load timing configuration (config is optional - use defaults if not available)
        this.minSwitchInterval = (typeof config !== 'undefined' && config?.get) ?
            config.get('presetSelection.minSwitchInterval', 4000) : 4000;  // 4 seconds minimum
        this.maxSwitchInterval = (typeof config !== 'undefined' && config?.get) ?
            config.get('presetSelection.maxSwitchInterval', 60000) : 60000;  // 60 seconds max

        // Genre-based timing adjustments (Phase 3 feature)
        this.detectedGenre = { label: 'unknown', confidence: 0.5, timingMultiplier: 1.0, phraseLength: 16 };
        this.genreUpdateInterval = 60; // Update genre detection every N frames
        this.genreUpdateCounter = 0;

        // TODO: Implement audio lookahead (~1 second) to anticipate drops/energy changes
        // Currently we're reactive, switching AFTER energy changes happen, which can cause
        // awkward transitions in the middle of drops. We should analyze upcoming audio
        // to schedule transitions BEFORE the drop hits, aligning preset changes with
        // musical structure rather than reacting to it.
        // Potential approach:
        // 1. Buffer 1-2 seconds of future audio data
        // 2. Analyze for sudden energy changes (drops, buildups)
        // 3. Schedule preset switches to complete just before the drop
        // 4. This would make transitions feel intentional, not reactive

        // Initialize MA Crossover system for intelligent switching
        const crossoverConfig = (typeof config !== 'undefined' && config?.get) ? {
            energyFast: config.get('crossover.energyFast', 5),
            energySlow: config.get('crossover.energySlow', 20),
            energyWeight: config.get('crossover.energyWeight', 0.5),
            bassFast: config.get('crossover.bassFast', 3),
            bassSlow: config.get('crossover.bassSlow', 15),
            bassWeight: config.get('crossover.bassWeight', 0.3),
            trebleFast: config.get('crossover.trebleFast', 7),
            trebleSlow: config.get('crossover.trebleSlow', 25),
            trebleWeight: config.get('crossover.trebleWeight', 0.2),
            minCrossoverGap: config.get('crossover.minCrossoverGap', 2000),
            signalThreshold: config.get('crossover.signalThreshold', 0.2),  // Changed from 0.4 to 0.2
            consensusRequired: config.get('crossover.consensusRequired', 2)
        } : {};

        // Initialize crossover detector if available
        this.crossoverDetector = null;
        if (MultiSignalCrossover) {
            this.crossoverDetector = new MultiSignalCrossover(crossoverConfig);
        }

        // Fallback thresholds (kept for compatibility, but MA crossover is primary)
        this.energyChangeThreshold = 0.25;  // Now just a fallback
        this.bassChangeThreshold = 0.3;     // Now just a fallback
        this.sceneScoreThreshold = 0.2;     // Now just a fallback - increased from 0.1
        this.debugSceneChange = false;  // Enable debug output for scene change logic
        this.debugMode = false;  // Enable debug mode to throw errors instead of swallowing them

        // Initialize analysis systems from imported modules (may be null initially)
        this.frameAnalyzer = frameAnalyzer || null;
        this.presetLogger = presetLogger || null;
        this.emergencyManager = emergencyManager || null;
        this.blocklistManager = blocklistManager || null;

        // Set up a check to initialize modules when they become available
        this.setupModuleInitialization();

        // Device detection for performance optimization
        this.deviceTier = this.detectDeviceTier();
        console.log('[IntelligentSelector] frameAnalyzer available:', !!this.frameAnalyzer);
        console.log('[IntelligentSelector] adjustForDevice available:', this.frameAnalyzer && typeof this.frameAnalyzer.adjustForDevice === 'function');
        if (this.frameAnalyzer && typeof this.frameAnalyzer.adjustForDevice === 'function') {
            this.frameAnalyzer.adjustForDevice(this.deviceTier);
        }

        // Emergency mode tracking
        this.isEmergencyMode = false;
        this.emergencyStartTime = 0

        // Direct preset pack support (for testing without fingerprint database)
        this.presetPack = null;

        // Problematic presets now managed by PresetFailureLogger
        this.problematicPresets = new Set();

        // Enable automatic problematic detection
        this.detectProblematic = (typeof config !== 'undefined' && config?.get) ?
            config.get('userPreferences.skipProblematicPresets', true) : true;
        this.frameCheckInterval = 100; // Check frame every 100ms
        this.lastFrameCheck = 0

        // Audio history for trend detection
        this.audioHistory = [];
        this.historySize = 30; // Keep 30 frames (~0.5 sec at 60fps)

        // Load scoring weights from config
        this.weights = (typeof config !== 'undefined' && config?.get) ?
            config.get('presetSelection.scoringWeights', {
                energyMatch: 0.3,
                frequencyMatch: 0.25,
                rhythmMatch: 0.2,
                dynamicsMatch: 0.15,
                continuity: 0.1,
                bassMatch: 0.15,
                performance: 0.1,
                variety: 0.05
            }) : {
            energyMatch: 0.3,
            frequencyMatch: 0.25,
            rhythmMatch: 0.2,
            dynamicsMatch: 0.15,
            continuity: 0.1,
            bassMatch: 0.15,
            performance: 0.1,
            variety: 0.05
        };

        // Recently used presets (avoid repetition)
        this.recentPresets = [];
        this.recentPresetsMax = 10;

        // Initialize compatibility checker for transition analysis
        this.compatibilityChecker = new PresetCompatibilityChecker({
            minSafeDecay: 0.1,
            lowDecayWarning: 0.9,
            maxAlphaVariance: 0.5
        });

        // Throttle switch checking to reduce log spam
        this.lastSwitchCheck = 0;
        this.switchCheckInterval = 100; // Only check for switches every 100ms (10fps)

        // Transition state tracking
        this.isTransitioning = false;
        this.transitionStartTime = 0;
    }

    /**
     * Set up module initialization when async modules become available
     */
    setupModuleInitialization() {
        // TODO: Fix scaling issue - building reverse mapping from preset names to hash IDs
        // Currently the intelligent selector needs to build a reverse mapping from preset names
        // to hash IDs which doesn't scale well with large preset collections. Consider:
        // 1. Pre-computing the reverse mapping at build time
        // 2. Using a more efficient data structure (Map vs Object)
        // 3. Caching the mapping in localStorage for faster subsequent loads
        // 4. Loading mappings on-demand rather than all at once

        // Check periodically if modules have loaded
        const checkModules = () => {
            if (frameAnalyzer && !this.frameAnalyzer) {
                // frameAnalyzer is already an instance (singleton), not a class
                this.frameAnalyzer = frameAnalyzer;
                if (typeof this.frameAnalyzer.adjustForDevice === 'function') {
                    this.frameAnalyzer.adjustForDevice(this.deviceTier);
                }
                console.log('[IntelligentSelector] Frame analyzer initialized');
            }
            if (presetLogger && !this.presetLogger) {
                // presetLogger is already an instance (singleton), not a class
                this.presetLogger = presetLogger;
                console.log('[IntelligentSelector] Preset logger initialized');
            }
            if (emergencyManager && !this.emergencyManager) {
                try {
                    // EmergencyPresetManager is a class, needs instantiation
                    this.emergencyManager = new emergencyManager();
                    console.log('[IntelligentSelector] Emergency manager initialized');
                    console.log('[IntelligentSelector] Emergency presets available:', Object.keys(this.emergencyManager.emergencyPresets || {}));
                } catch (e) {
                    console.error('[IntelligentSelector] Failed to initialize emergency manager:', e);
                }
            }
            if (blocklistManager && !this.blocklistManager) {
                // BlocklistManager is a class, needs instantiation
                this.blocklistManager = new blocklistManager();
                console.log('[IntelligentSelector] Blocklist manager initialized');
            }
        };

        // Check immediately and then periodically
        checkModules();
        const moduleCheckInterval = setInterval(() => {
            checkModules();
            // Stop checking once all modules are loaded or after 10 seconds
            if ((frameAnalyzer && presetLogger && emergencyManager && blocklistManager) ||
                Date.now() - this.startTime > 10000) {
                clearInterval(moduleCheckInterval);
            }
        }, 100);

        this.startTime = Date.now();
    }

    /**
     * Create a seeded random number generator for deterministic testing
     * TWIN-WARN-1 FIX: Use deterministic RNG for visual regression tests
     * @private
     */
    _createSeededRng(seed) {
        let state = seed;
        return () => {
            // Mulberry32 PRNG - fast and good enough for our purposes
            state |= 0;
            state = (state + 0x6D2B79F5) | 0;
            let t = Math.imul(state ^ (state >>> 15), 1 | state);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /**
     * Called when audio file loads (from client code)
     * Triggers BPM detection for phrase-aligned switching
     * CRIT-3 FIX: Use existing property name (audioAnalyzer)
     */
    async onAudioLoaded(audioBuffer) {
        if (this.audioAnalyzer && audioBuffer) {
            try {
                const bpm = await this.audioAnalyzer.detectBPM(audioBuffer);
                if (bpm) {
                    console.log(`[IPS] Detected BPM: ${bpm.toFixed(1)}`);
                } else {
                    console.log('[IPS] BPM detection returned null, using immediate switching');
                }
            } catch (e) {
                console.warn('[IPS] BPM detection failed, using immediate switching:', e.message);
                // Graceful degradation: phrase-aligned switching disabled, immediate switching used
            }
        }
    }

    /**
     * Set preset pack for direct testing (alternative to fingerprint database)
     */
    setPresetPack(presets) {
        this.presetPack = presets;

        console.log('Preset pack loaded with', Object.keys(presets).length, 'presets');
    }

    /**
     * Update the fingerprint database (e.g., when switching preset packs)
     * @param {Object} newFingerprintDb - The new fingerprint database
     */
    updateFingerprintDatabase(newFingerprintDb) {
        if (!newFingerprintDb) {
            console.warn('[IntelligentSelector] No fingerprint database provided');
            return;
        }

        // Update the main database reference
        this.db = newFingerprintDb;
        console.log(`[IntelligentSelector] Updated database with ${Object.keys(newFingerprintDb.presets || {}).length} presets`);

        // Update the fingerprint loader if it exists
        if (this.fingerprintLoader) {
            this.fingerprintLoader.database = newFingerprintDb;
        }

        // Update the fingerprint adapter if it exists
        if (this.adapter) {
            this.adapter = new FingerprintAdapter(newFingerprintDb);
            // Rebuild the adapted database
            if (this.adapter.buildDatabase) {
                this.adapter.buildDatabase().then(db => {
                    this.db = db;
                    console.log('[IntelligentSelector] Rebuilt adapted database');
                });
            }
        }

        // Clear any cached fingerprint data
        this.fingerprintCache = {};

        // Reset current preset tracking to force re-evaluation
        if (this.currentHash && newFingerprintDb.presets) {
            // Check if current preset exists in new database
            const currentExists = Object.values(newFingerprintDb.presets).some(p =>
                p.hash === this.currentHash || p.id === this.currentHash
            );

            if (!currentExists) {
                console.log('[IntelligentSelector] Current preset not in new fingerprint database, will switch on next update');
                this.currentHash = null;
                this.currentPreset = null;
            }
        }

        console.log('[IntelligentSelector] Fingerprint database updated successfully');
    }

    /**
     * Load all preset pack JS files
     */
    async loadAllPresetPacks() {
        const packNames = [
            'butterchurnPresets',
            'butterchurnPresetsExtra',
            'butterchurnPresetsExtra2',
            'butterchurnPresetsMD1',
            'butterchurnPresetsMinimal',
            'butterchurnPresetsNonMinimal'
        ];

        console.log('[IntelligentSelector] Loading preset packs...');

        for (const packName of packNames) {
            try {
                await this.loadPresetPack(packName);
            } catch (error) {
                console.error(`[IntelligentSelector] Failed to load pack ${packName}:`, error);
            }
        }
    }

    /**
     * Load a specific preset pack
     */
    async loadPresetPack(packName) {
        if (this.loadedPacks.has(packName)) {
            return this.presetCache[packName];
        }

        try {
            // Check if it's already loaded globally (from script tags)
            if (typeof window !== 'undefined' && window[packName]) {
                const presets = window[packName].getPresets();
                this.presetCache[packName] = presets;
                this.loadedPacks.add(packName);
                console.log(`[IntelligentSelector] Loaded ${packName} from global (${Object.keys(presets).length} presets)`);
                return presets;
            }

            // Try dynamic import
            const packUrl = `/presets/full-collection/${packName}.js`;
            const module = await import(packUrl);

            let presets;
            if (module.default && typeof module.default.getPresets === 'function') {
                presets = module.default.getPresets();
            } else if (module[packName] && typeof module[packName].getPresets === 'function') {
                presets = module[packName].getPresets();
            } else {
                throw new Error(`Could not find getPresets function in ${packName}`);
            }

            this.presetCache[packName] = presets;
            this.loadedPacks.add(packName);
            console.log(`[IntelligentSelector] Loaded ${packName} via import (${Object.keys(presets).length} presets)`);

            return presets;

        } catch (error) {
            console.error(`[IntelligentSelector] Error loading pack ${packName}:`, error);
            throw error;
        }
    }

    /**
     * Get a preset by hash
     */
    async getPresetByHash(hash) {
        const fingerprint = this.loader.getPresetFingerprint(hash);
        if (!fingerprint) {
            throw new Error(`No fingerprint found for hash: ${hash}`);
        }

        const packName = fingerprint.pack;
        const presetName = fingerprint.names?.[0];

        if (!presetName) {
            throw new Error(`No preset name found for hash: ${hash}`);
        }

        // Ensure pack is loaded
        if (!this.loadedPacks.has(packName)) {
            await this.loadPresetPack(packName);
        }

        const pack = this.presetCache[packName];
        if (!pack) {
            throw new Error(`Pack not loaded: ${packName}`);
        }

        const preset = pack[presetName];
        if (!preset) {
            throw new Error(`Preset not found: ${presetName} in ${packName}`);
        }

        // Parse if string
        let presetObj = typeof preset === 'string' ? JSON.parse(preset) : preset;

        // IMPORTANT: Always return a fresh copy to prevent cache corruption
        // This ensures the cached version stays pristine with _str fields intact
        presetObj = JSON.parse(JSON.stringify(presetObj));

        // Add the preset name so compatibility checker can identify it
        if (!presetObj.name && !presetObj.desc) {
            presetObj.name = presetName;
        }

        return presetObj;
    }

    /**
     * Load a preset into Butterchurn by hash
     */
    async loadPresetByHash(hash, transitionTime = 0.5) {
        try {
            const preset = await this.getPresetByHash(hash);

            // Check compatibility and adjust transition if needed
            const currentPreset = this.butterchurn.getCurrentPreset ? this.butterchurn.getCurrentPreset() : null;
            const compatibility = this.compatibilityChecker.checkTransitionCompatibility(currentPreset, preset);

            if (compatibility.type === 'cut') {
                // Force cut transition for incompatible presets
                transitionTime = 0;
                if (this.debugMode) {
                    console.warn('[IntelligentSelector] Forcing cut transition:', compatibility.reason);
                }
            } else if (compatibility.duration !== undefined) {
                // Use recommended duration from compatibility checker
                transitionTime = compatibility.duration;
                if (this.debugMode) {
                    console.log('[IntelligentSelector] Using blend duration:', transitionTime, 'reason:', compatibility.reason);
                }
            }

            this.butterchurn.loadPreset(preset, transitionTime);

            const fingerprint = this.loader.getPresetFingerprint(hash);
            console.log(`[IntelligentSelector] Loaded preset: ${fingerprint.names?.[0]} (${hash})`);

            return preset;
        } catch (error) {
            console.error(`[IntelligentSelector] Error loading preset ${hash}:`, error);
            throw error;
        }
    }

    /**
     * Pause the selector (stop switching presets)
     */
    pause() {
        this.isPaused = true;
        console.log('[IntelligentSelector] Paused - no more preset switches');
    }

    /**
     * Resume the selector
     */
    resume() {
        this.isPaused = false;
        this.lastSwitch = performance.now(); // Reset timer to prevent immediate switch
        console.log('[IntelligentSelector] Resumed');
    }

    /**
     * Detect device tier for optimization
     */
    detectDeviceTier() {
        const memory = navigator.deviceMemory || 4;
        const cores = navigator.hardwareConcurrency || 2;
        const isMobile = /Mobile|Android|iPhone/i.test(navigator.userAgent);

        if (isMobile) return 'mobile';
        if (memory >= 8 && cores >= 4) return 'high_end';
        if (memory <= 4 && cores <= 2) return 'low_end';
        return 'mid_range';
    }

    /**
     * Initialize with fingerprint database
     */
    async initialize(options = {}) {
        const {
            basePath = '/presets/full-collection/',
            autoLoadPacks = true
        } = options;

        console.log('[IntelligentSelector] Initializing...');

        // Initialize loader and adapter (required modules)
        if (!FingerprintLoader) {
            throw new Error('[IntelligentSelector] FingerprintLoader is required but not available');
        }
        if (!FingerprintAdapter) {
            throw new Error('[IntelligentSelector] FingerprintAdapter is required but not available');
        }
        if (!PresetCompatibilityChecker) {
            throw new Error('[IntelligentSelector] PresetCompatibilityChecker is required but not available');
        }

        this.loader = new FingerprintLoader();
        this.adapter = new FingerprintAdapter(this.loader);

        // Load all fingerprints
        await this.loader.loadAllFingerprints(basePath);

        // Build database if not provided
        if (!this.db) {
            this.db = await this.adapter.buildDatabase();
            console.log('[IntelligentSelector] Built database from fingerprints');
        }

        // Initialize the preset failure logger if available
        if (this.presetLogger) {
            await this.presetLogger.initialize();
        }

        // Legacy support: Load from URL if string
        if (typeof this.db === 'string') {
            const response = await fetch(this.db);
            this.db = await response.json();
        }

        if (this.db) {
            console.log(`Intelligent selector initialized with ${Object.keys(this.db.presets).length} unique presets`);

            // Auto-load preset packs if requested
            if (autoLoadPacks) {
                await this.loadAllPresetPacks();
            }

            // Validate database structure
            if (!this.db.presets || !this.db.indices) {
                throw new Error('Invalid fingerprint database structure');
            }
        }

        // Load blocklist from PresetFailureLogger if available
        if (this.presetLogger) {
            const stats = this.presetLogger.getStatistics();
            console.log(`[IntelligentSelector] Loaded blocklist with ${stats.blocklist.permanent} permanent blocks`);
        }

        this.isInitialized = true;
        console.log('[IntelligentSelector] Initialization complete');
    }

    /**
     * Update with current audio levels and potentially switch presets
     * @param {Object} audioLevels - Current audio levels (bass, mid, treb)
     * @param {Object} frameData - Optional frame data for analysis
     * @returns {Object|null} Update result with current state and features
     */
    update(audioLevels, frameData = null) {
        // Add recursion check
        if (this._updateInProgress) {
            console.error('[Update] RECURSION DETECTED! Already in update()');
            return { error: 'Recursion detected' };
        }
        this._updateInProgress = true;

        let finalResult = null;
        try {
            // Don't update if paused
            if (this.isPaused) {
                console.log('[Update] Paused - returning null');
                this._updateInProgress = false;  // MUST clear flag before early return!
                return null;
            }

            const now = performance.now();

        // Check current frame for problems if we have frame data
        if (frameData && this.detectProblematic && now - this.lastFrameCheck > this.frameCheckInterval) {
            this.checkFrameForProblems(frameData);
            this.lastFrameCheck = now;
        }

        // Add to history
        this.audioHistory.push({
            ...audioLevels,
            timestamp: now
        });

        // Maintain history size
        if (this.audioHistory.length > this.historySize) {
            this.audioHistory.shift();
        }

        // Calculate audio features
        const features = this.calculateAudioFeatures();

        // Initialize update count
        if (this.updateCount === undefined) this.updateCount = 0;
        this.updateCount++;

        // Debug: Log features structure for first few updates
        if (this.updateCount <= 3) {
            console.log(`[calculateAudioFeatures] Features:`, {
                hasEnergy: typeof features?.energy !== 'undefined',
                hasBassEnergy: typeof features?.bassEnergy !== 'undefined',
                hasTrebleEnergy: typeof features?.trebleEnergy !== 'undefined',
                features: features
            });
        }

        // If no features available, return early
        if (!features) {
            if (this.updateCount > 5 && this.updateCount < 10) {
                console.log('[Update] No features available - returning early');
            }
            this._updateInProgress = false;  // MUST clear flag before early return!
            return {
                currentPreset: this.currentHash,
                features: null,
                nextSwitch: 0,
                selectionLogic: null,
                isEmergencyMode: this.isEmergencyMode,
                deviceTier: this.deviceTier,
                noAudioData: true
            };
        }

        // NEW: Get beat/phrase timing information
        // WARN-1 FIX: Pass audioContext.currentTime for accurate timing
        const audioTime = this.audioContext?.currentTime || null;
        const beatInfo = this.audioAnalyzer?.trackBeatPhase ?
            this.audioAnalyzer.trackBeatPhase(audioTime) : null;
        const buildupInfo = this.audioAnalyzer?.detectBuildup ?
            this.audioAnalyzer.detectBuildup(features, audioTime) : { isBuildup: false };

        // Get current mood for scoring
        const mood = this.audioAnalyzer?.detectMood ?
            this.audioAnalyzer.detectMood(features) : null;

        // Update genre detection periodically (not every frame for performance)
        this.genreUpdateCounter++;
        if (this.genreUpdateCounter >= this.genreUpdateInterval && this.audioAnalyzer?.detectGenre) {
            this.detectedGenre = this.audioAnalyzer.detectGenre(features);
            this.genreUpdateCounter = 0;

            if (this.debugMode && this.detectedGenre.label !== 'unknown') {
                console.log(`[IPS] Genre detected: ${this.detectedGenre.label} (${(this.detectedGenre.confidence * 100).toFixed(0)}% confidence, timing x${this.detectedGenre.timingMultiplier})`);
            }
        }

        // Throttle switch checking to reduce CPU usage and log spam
        const timeSinceLastCheck = now - this.lastSwitchCheck;
        const timeSinceSwitch = now - this.lastSwitch;

        let shouldSwitch = false;
        let selectionLogic = null;
        let switched = false;

        // CRIT-4 FIX: Priority-based switch handling
        // Priority 1 (HIGHEST): Pre-drop anticipation
        if (buildupInfo.isBuildup && buildupInfo.confidence > 0.7 && !this.preDropSwitchScheduled) {
            const dropTime = now + buildupInfo.dropETA;
            const switchTime = dropTime - this.PRE_DROP_LEAD_TIME;

            if (switchTime > now) {
                // Pre-drop CANCELS any pending phrase switch
                this.preDropSwitchScheduled = true;
                this.preDropSwitchTime = switchTime;
                this.pendingSwitchOnPhrase = false;  // Cancel lower priority

                const dropResult = this._selectPresetForDrop(features, mood);
                if (dropResult) {
                    this.pendingSwitchPreset = dropResult.preset;
                    this.pendingSwitchHash = dropResult.hash;
                    this.pendingSwitchReason = 'pre_drop_anticipation';

                    console.log(`[IPS] Pre-drop switch scheduled in ${(buildupInfo.dropETA - this.PRE_DROP_LEAD_TIME).toFixed(0)}ms`);
                }
            }
        }

        // Priority 1 execution: Pre-drop switch at scheduled time
        if (this.preDropSwitchScheduled && now >= this.preDropSwitchTime) {
            if (this.pendingSwitchHash) {
                this.switchToPreset(this.pendingSwitchHash);
                switched = true;
                selectionLogic = { reason: 'pre_drop_anticipation' };
            }
            this.preDropSwitchScheduled = false;
            this.pendingSwitchOnPhrase = false;
        }

        // Priority 2: Execute pending phrase-aligned switch (16 beats)
        if (!switched && this.pendingSwitchOnPhrase && beatInfo?.isPhraseBoundary) {
            if (this.pendingSwitchHash) {
                this.switchToPreset(this.pendingSwitchHash);
                switched = true;
                selectionLogic = { reason: this.pendingSwitchReason || 'phrase_boundary' };
            }
            this.pendingSwitchOnPhrase = false;
        }

        // Priority 3: Performance degradation check (only if no pending switches)
        if (!switched && this.currentHash && !this.pendingSwitchOnPhrase && !this.preDropSwitchScheduled) {
            // Calculate score using the SAME function used for selection
            this.currentPresetScore = this.scorePreset(this.currentHash, features, mood);

            // Pass pre-calculated score to tracker
            const perfResult = this.performanceTracker.update(this.currentPresetScore);

            if (perfResult.shouldSwitch) {
                console.log(`[IPS] Performance degraded ${(perfResult.degradation * 100).toFixed(0)}% - triggering switch`);
                console.log(`[IPS] Baseline: ${perfResult.baseline?.toFixed(3)}, Current: ${perfResult.current?.toFixed(3)}`);

                // Queue switch at next phrase boundary (if BPM detected)
                const selectionResult = this.selectBestPresetWithLogic(features, mood);
                if (selectionResult && selectionResult.bestHash) {
                    if (beatInfo?.bpm) {
                        this.pendingSwitchOnPhrase = true;
                        this.pendingSwitchPreset = this.db.presets[selectionResult.bestHash];
                        this.pendingSwitchHash = selectionResult.bestHash;
                        this.pendingSwitchReason = perfResult.reason;
                    } else {
                        // No BPM detected - switch immediately
                        this.switchToPreset(selectionResult.bestHash);
                        switched = true;
                        selectionLogic = { reason: perfResult.reason };
                    }
                }
            }
        }

        // Priority 4 (LOWEST): Regular audio-triggered switch
        // Only check if no higher-priority switch is pending and not already switched
        if (!switched && !this.pendingSwitchOnPhrase && !this.preDropSwitchScheduled) {
            if (timeSinceLastCheck >= this.switchCheckInterval) {
                this.lastSwitchCheck = now;
                shouldSwitch = this.shouldSwitchPreset(features, timeSinceSwitch);
            }
        }

        // Debug logging
        if (this.updateCount <= 10) {
            const phraseInfo = beatInfo ? ` phrase: ${beatInfo.phrasePosition + 1}/16` : '';
            console.log(`[Update ${this.updateCount}] timeSinceSwitch: ${timeSinceSwitch}ms, shouldSwitch: ${shouldSwitch}${phraseInfo}`);
        } else if (this.updateCount === 11) {
            console.log('[Update] Continuing past 10 updates...');
        }

        if (shouldSwitch && !switched) {
            // Check if this is an emergency bypass situation
            const isEmergencyBypass = this.checkForEmergencyBypass();
            if (isEmergencyBypass && this.currentHash) {
                console.warn(`[EMERGENCY] Marking current preset ${this.currentHash} as problematic due to black frames`);
                this.markProblematic(this.currentHash);
            }

            // Check if we're in emergency mode
            if (this.isEmergencyMode) {
                const emergencyDuration = now - this.emergencyStartTime;
                const maxEmergencyTime = (typeof config !== 'undefined' && config?.get) ?
                    config.get('emergencyPresets.maxEmergencyTime', 10000) : 10000;

                if (emergencyDuration > maxEmergencyTime) {
                    // Try to exit emergency mode
                    this.exitEmergencyMode();
                }
            }

            if (!this.isEmergencyMode) {
                // Use fingerprint database selection with transparency
                const selectionResult = this.selectBestPresetWithLogic(features, mood);
                if (selectionResult && selectionResult.bestHash !== this.currentHash) {
                    // Check if preset is blocked
                    const blockStatus = (this.presetLogger && typeof this.presetLogger.isBlocked === 'function')
                        ? this.presetLogger.isBlocked(selectionResult.bestHash)
                        : { blocked: false };

                    if (!blockStatus.blocked) {
                        // Queue for phrase boundary if BPM detected
                        if (beatInfo?.bpm) {
                            this.pendingSwitchOnPhrase = true;
                            this.pendingSwitchPreset = this.db.presets[selectionResult.bestHash];
                            this.pendingSwitchHash = selectionResult.bestHash;
                            this.pendingSwitchReason = selectionResult.logic?.reason || 'audio_triggered';
                            selectionLogic = selectionResult.logic;

                            const beatsToPhrase = 16 - beatInfo.phrasePosition;
                            const msToPhrase = beatsToPhrase * (this.audioAnalyzer?.beatInterval || 500);

                            console.log(`[IPS] Queued for phrase (${(msToPhrase/1000).toFixed(1)}s, beat ${beatInfo.phrasePosition + 1}/16)`);
                        } else {
                            // No BPM - switch immediately
                            this.switchToPreset(selectionResult.bestHash);
                            switched = true;
                            selectionLogic = selectionResult.logic;
                        }
                    } else {
                        console.log(`[IntelligentSelector] Preset ${selectionResult.bestHash} is blocked: ${blockStatus.reason}`);
                        // Try next best preset
                        this.selectAlternativePreset(features);
                    }
                }
            }
        }

        // Build result object
        const resultObject = {
            currentPreset: this.currentHash,
            features: features,
            nextSwitch: Math.max(0, this.minSwitchInterval - timeSinceSwitch),
            selectionLogic: selectionLogic,
            isEmergencyMode: this.isEmergencyMode,
            deviceTier: this.deviceTier
        };
        // console.log('[Update] Result object created:', resultObject);
        // console.log('[Update] About to return from update() method');
        // console.log('[Update] Type of resultObject:', typeof resultObject);
        // console.log('[Update] Keys of resultObject:', Object.keys(resultObject));

        // Store result to return after try-catch
        finalResult = resultObject;
        // console.log('[Update] Stored result for return after try-catch');

        } catch (error) {
            console.error('[Update] Exception caught:', error);

            // In debug mode, re-throw the error to surface problems
            if (this.debugMode) {
                console.error('[Update] DEBUG MODE - Re-throwing error to surface the problem');
                throw error;
            }

            return {
                currentPreset: this.currentHash,
                features: null,
                nextSwitch: 0,
                selectionLogic: null,
                isEmergencyMode: this.isEmergencyMode,
                deviceTier: this.deviceTier,
                error: error.message
            };
        }

        // Return the stored result after try-catch completes
        // console.log('[Update] After try-catch, returning finalResult');
        this._updateInProgress = false;  // Clear the flag before returning
        const returnValue = finalResult || { error: 'No result to return' };
        // console.log('[Update] Actually returning now with value:', returnValue);
        return returnValue;
    }

    /**
     * Select high-energy preset suitable for a drop
     * TWIN-WARN-1 FIX: Use deterministic RNG for visual regression tests
     * @private
     */
    _selectPresetForDrop(features, mood = null) {
        const candidates = this.getCandidates(features);
        const dropCandidates = candidates.filter(hash => {
            const fp = this.db.presets[hash]?.fingerprint;
            return fp && fp.energy > 0.7 && (fp.bassEnergy || fp.bass) > 0.6;
        });

        if (dropCandidates.length > 0) {
            // TWIN-WARN-1 FIX: Use deterministic RNG for visual regression tests
            // CLAUDE.md: "KEEP deterministic RNG context for visual regression tests"
            const hash = dropCandidates[Math.floor(this.rng() * dropCandidates.length)];
            return { hash, preset: this.db.presets[hash] };
        }

        // Fallback to best scoring preset
        const selectionResult = this.selectBestPresetWithLogic(features, mood);
        if (selectionResult && selectionResult.bestHash) {
            return { hash: selectionResult.bestHash, preset: this.db.presets[selectionResult.bestHash] };
        }

        return null;
    }

    /**
     * Select random preset from preset pack (for direct testing mode)
     */
    selectRandomPreset() {
        console.log(`[selectRandomPreset] Called - currentPreset: ${this.currentPreset}, recentPresets: ${this.recentPresets.length}`);

        if (!this.presetPack) return;

        const presetNames = Object.keys(this.presetPack);
        const filteredNames = presetNames.filter(name =>
            !this.recentPresets.includes(name) && !this.isProblematic(name)
        );

        if (filteredNames.length > 0) {
            const randomIndex = Math.floor(Math.random() * filteredNames.length);
            const presetName = filteredNames[randomIndex];

            this.switchToPresetPack(presetName);
        }
    }

    /**
     * Calculate audio features using AdvancedAudioAnalyzer
     */
    calculateAudioFeatures() {
        // Get the butterchurn audio instance
        const audio = this.butterchurn?.audio;
        if (!audio || !audio.freqArray || !audio.timeArray) {
            // Return null to indicate no audio data available
            if (this.debugSceneChange) {
                console.log('[calculateAudioFeatures] No audio data available:',
                    { hasAudio: !!audio, hasFreqArray: !!audio?.freqArray, hasTimeArray: !!audio?.timeArray });
            }
            return null;
        }

        // Use AdvancedAudioAnalyzer for feature extraction (if available)
        let features, musicalEvent;
        if (this.audioAnalyzer) {
            features = this.audioAnalyzer.calculateFeatures(
                audio.freqArray,
                audio.timeArray
            );

            // Debug: Log what AdvancedAudioAnalyzer returns
            if (this.updateCount <= 10) {
                console.log('[AdvancedAudioAnalyzer] Raw features:', features);
                console.log('[Audio Data] freqArray sample:', Array.from(audio.freqArray.slice(0, 10)));
                console.log('[Audio Data] timeArray sample:', Array.from(audio.timeArray.slice(0, 10)));
            }

            // Detect musical events
            musicalEvent = this.audioAnalyzer.detectMusicalEvent(features);
        } else {
            // Fallback: Simple feature extraction from basic audio data
            features = {
                bass: audio.bass || 0,
                mid: audio.mid || 0,
                treble: audio.treb || 0,
                energy: (audio.bass + audio.mid + audio.treb) / 3 || 0
            };
            musicalEvent = { type: 'none', intensity: 0 };
        }

        // Map to expected format while maintaining compatibility
        // Calculate overall energy from available bands
        const energy = (features.bass + features.mid + features.treble) / 3;

        return {
            energy: energy,
            bassEnergy: features.bass,
            trebleEnergy: features.treble,
            isDrop: musicalEvent === 'drop',
            isBuildup: musicalEvent === 'buildup',
            isChill: musicalEvent === 'chill',
            isBreakdown: musicalEvent === 'breakdown',
            trend: features.dynamicRange > 0.1 ? 'changing' : 'stable',
            // Include raw features for advanced processing
            rawFeatures: features,
            musicalEvent: musicalEvent
        };
    }

    /**
     * Calculate scene change based on SUDDEN changes, not accumulated drift
     * Detects drops, buildups, verse changes - actual musical transitions
     */
    calculateSceneChange(features) {
        // Add current features to history
        this.recentFeatures.push({
            energy: features.energy,
            bass: features.bassEnergy,
            treble: features.trebleEnergy,
            timestamp: performance.now()
        });

        // Maintain rolling window
        if (this.recentFeatures.length > this.historySize) {
            this.recentFeatures.shift();
        }

        // Need enough history to detect changes
        const minHistoryFrames = (typeof config !== 'undefined' && config?.get) ?
            config.get('presetSelection.minHistoryFrames', 10) : 10;
        if (this.recentFeatures.length < minHistoryFrames) {
            if (this.updateCount <= 15) {
                console.log(`[calculateSceneChange] Not enough history: ${this.recentFeatures.length} < ${minHistoryFrames}`);
            }
            return 0;
        }

        // Compare current to recent past (5-10 frames ago, ~0.1-0.2 sec)
        const lookbackFrames = (typeof config !== 'undefined' && config?.get) ?
            config.get('presetSelection.lookbackFrames', 10) : 10;
        const recentPast = this.recentFeatures[Math.max(0, this.recentFeatures.length - lookbackFrames)];
        const current = features;

        // Validate we have valid data to compare
        if (!recentPast || typeof recentPast.energy === 'undefined' ||
            typeof recentPast.bass === 'undefined' || typeof recentPast.treble === 'undefined') {
            if (this.updateCount <= 15) {
                console.log(`[calculateSceneChange] Invalid data:`, {
                    hasRecentPast: !!recentPast,
                    hasEnergy: typeof recentPast?.energy !== 'undefined',
                    hasBass: typeof recentPast?.bass !== 'undefined',
                    hasTreble: typeof recentPast?.treble !== 'undefined'
                });
            }
            return 0; // Not enough history yet
        }

        // Calculate rate of change (sudden changes)
        const energyChange = Math.abs(current.energy - recentPast.energy);
        const bassChange = Math.abs(current.bassEnergy - recentPast.bass);
        const trebleChange = Math.abs(current.trebleEnergy - recentPast.treble);

        // Also check for direction changes (e.g., drop = high to low)
        // More lenient thresholds to catch real musical events
        const energyDrop = recentPast.energy > 0.5 && current.energy < 0.35;
        const bassDropIn = current.bassEnergy > 0.6 && recentPast.bass < 0.45;
        const energyRise = current.energy > 0.5 && recentPast.energy < 0.35;
        const significantChange = energyChange > 0.2 || bassChange > 0.25;

        // Use custom weights if set
        const weights = this.sceneWeights || {
            energy: 0.5,
            bass: 0.25,
            treble: 0.25
        };

        // Calculate sudden change score
        let sceneScore = (
            energyChange * weights.energy +
            bassChange * weights.bass +
            trebleChange * weights.treble
        );

        // Boost score for specific musical events
        if (energyDrop || bassDropIn || energyRise || significantChange) {
            sceneScore *= 2.0;  // Double the score for clear transitions
        }

        // Debug output
        if (this.debugSceneChange && !isNaN(sceneScore)) {
            const presetName = this.currentPreset?.name || this.currentPreset || 'Unknown';
            console.log(`[Scene Change] Preset: "${presetName}" | Score: ${sceneScore.toFixed(3)} | ` +
                       `Energy Δ: ${energyChange.toFixed(3)} | ` +
                       `Bass Δ: ${bassChange.toFixed(3)} | ` +
                       `Treble Δ: ${trebleChange.toFixed(3)}` +
                       (energyDrop ? ' [DROP!]' : '') +
                       (bassDropIn ? ' [BASS IN!]' : '') +
                       (energyRise ? ' [BUILD!]' : '') +
                       (significantChange ? ' [BIG CHANGE!]' : ''));
        }

        return sceneScore;
    }

    /**
     * Determine if we should switch presets (scene-based logic)
     */
    shouldSwitchPreset(features, timeSinceSwitch) {
        // Minimum time acts as a debounce - prevent flicker
        // Genre timing multiplier adjusts switch frequency based on music style
        const genreMultiplier = this.detectedGenre?.timingMultiplier || 1.0;
        const minimumTime = Math.max(
            this.minSwitchInterval * genreMultiplier,
            (this.currentWarmupTime || 0) * 1000 + 2000 // Add 2 sec buffer after warmup
        );

        // Don't switch if currently transitioning
        if (this.isTransitioning) {
            const transitionTime = performance.now() - this.transitionStartTime;
            if (transitionTime < 3000) { // Allow 3 seconds for transitions
                if (this.debugSceneChange && Math.random() < 0.01) { // Only log 1% of the time to reduce spam
                    console.log(`[Switch Decision] Transitioning: ${transitionTime.toFixed(0)}ms elapsed`);
                }
                // Still update the detector to track state, but don't act on it (if available)
                if (this.crossoverDetector) {
                    this.crossoverDetector.update(features);
                }
                return false;
            } else {
                // Transition complete
                this.isTransitioning = false;
            }
        }

        // EMERGENCY BYPASS: Allow immediate switch if black frames detected
        const isEmergencyBypass = this.checkForEmergencyBypass();

        // Don't switch before minimum time (safety rail) UNLESS emergency
        // IMPORTANT: Check timing BEFORE updating crossover detector to prevent false triggers
        if (timeSinceSwitch < minimumTime && !isEmergencyBypass) {
            if (this.debugSceneChange && Math.random() < 0.02) { // Only log 2% of the time to reduce spam
                console.log(`[Switch Decision] Too soon: ${timeSinceSwitch}ms < ${minimumTime}ms minimum`);
            }
            // Still update the detector to track state, but don't act on it (if available)
            if (this.crossoverDetector) {
                this.crossoverDetector.update(features);
            }
            return false;
        }

        // If emergency bypass triggered, log it
        if (isEmergencyBypass) {
            console.warn(`[EMERGENCY BYPASS] Black frames detected - forcing immediate switch after ${timeSinceSwitch.toFixed(0)}ms`);
        }

        // Update MA crossover detector with latest audio features (if available)
        let crossoverResult = { shouldSwitch: false, reason: 'no_crossover_detector' };
        if (this.crossoverDetector) {
            crossoverResult = this.crossoverDetector.update(features);
        }

        // EMERGENCY: Force switch if black frames detected (highest priority)
        if (isEmergencyBypass) {
            console.warn(`[EMERGENCY] Forcing switch due to black frames - bypassing all other conditions`);
            return true;
        }

        // MA Crossover is the primary decision maker
        if (crossoverResult.shouldSwitch) {
            if (this.debugSceneChange) {
                console.log(`[MA Crossover] Switch triggered: ${crossoverResult.switchReason}`);
                console.log(`[MA Crossover] Blended score: ${crossoverResult.blended.score.toFixed(3)}, Direction: ${crossoverResult.blended.direction}`);
                if (this.crossoverDetector) {
                    console.log(`[MA Crossover] Energy: ${this.crossoverDetector.energy.status}, Bass: ${this.crossoverDetector.bass.status}, Treble: ${this.crossoverDetector.treble.status}`);
                }
            }
            return true;
        }

        // Force switch if too long (watchdog timer - prevents boredom)
        // Apply genre multiplier to max interval as well
        const adjustedMaxInterval = this.maxSwitchInterval * genreMultiplier;
        if (timeSinceSwitch > adjustedMaxInterval) {
            if (this.debugSceneChange) {
                console.log(`[Switch Decision] Max time exceeded: ${timeSinceSwitch}ms > ${adjustedMaxInterval}ms (genre: ${this.detectedGenre?.label || 'unknown'})`);
            }
            return true;
        }

        // Debug output for MA crossover state (first few updates)
        if (this.updateCount <= 15 && this.debugSceneChange && this.crossoverDetector) {
            const state = this.crossoverDetector.getDebugState();
            console.log(`[MA Debug ${this.updateCount}] Energy: ${state.energy}, Bass: ${state.bass}, Treble: ${state.treble}`);
        }

        return false;
    }

    /**
     * Check if emergency bypass should be triggered due to black frames
     */
    checkForEmergencyBypass() {
        // Check if frame analyzer has detected black frames recently
        if (this.frameAnalyzer && typeof this.frameAnalyzer.getState === 'function') {
            try {
                const frameState = this.frameAnalyzer.getState();
                const lastAnalysis = frameState.lastAnalysis;

                if (lastAnalysis && lastAnalysis.isProblematic) {
                    // Check if the black frame detection is recent (within last 500ms)
                    const timeSinceDetection = performance.now() - (lastAnalysis.timestamp || 0);
                    if (timeSinceDetection < 500 && lastAnalysis.reason.includes('black_frame')) {
                        return true;
                    }
                }
            } catch (e) {
                // Frame analyzer not ready yet
                console.log('[IntelligentSelector] Frame analyzer not ready:', e.message);
            }
        }

        // Check local problematic preset tracking
        if (this.currentHash && this.problematicPresets.has(this.currentHash)) {
            return true;
        }

        return false;
    }

    /**
     * Select best preset with transparency into selection logic
     * Enhanced to accept and use mood for scoring (Phase 3)
     * @param {Object} features - Audio features
     * @param {Object} mood - Optional mood detection result { label, confidence }
     */
    selectBestPresetWithLogic(features, mood = null) {
        const logic = {
            targetEnergy: features.energy,
            mood: mood?.label || null,
            candidates: [],
            topScores: [],
            reason: ''
        };

        // Get candidate presets based on features
        const candidates = this.getCandidates(features);

        if (!candidates || candidates.length === 0) {
            logic.reason = 'No suitable candidates';
            return { bestHash: null, logic };
        }

        logic.candidates = candidates.slice(0, 5).map(h => h.substring(0, 8));

        // Score each candidate (pass mood for enhanced scoring)
        const scores = candidates.map(hash => ({
            hash,
            score: this.scorePreset(hash, features, mood)
        }));

        // Sort by score
        scores.sort((a, b) => b.score - a.score);
        logic.topScores = scores.slice(0, 3).map(s =>
            `${s.hash.substring(0, 8)}: ${s.score.toFixed(2)}`
        );

        // Determine selection reason based on features and mood
        if (features.isDrop || features.energy > 0.8) {
            logic.reason = '🔥 Drop detected - high energy';
        } else if (features.isChill || features.energy < 0.3) {
            logic.reason = '🌊 Chill mode - calm visuals';
        } else if (features.bassEnergy > 0.7) {
            logic.reason = '🎸 Bass heavy - reactive presets';
        } else if (mood?.label) {
            logic.reason = `🎭 Mood: ${mood.label}`;
        } else {
            logic.reason = '➡️ Balanced - mixed selection';
        }

        // Add some randomness to top choices
        const topChoices = scores.slice(0, 3);
        if (topChoices.length > 0) {
            const weights = topChoices.map(c => c.score);
            const selected = this.weightedRandom(topChoices, weights);
            logic.reason += ` → ${selected.hash.substring(0, 8)}`;
            return { bestHash: selected.hash, logic };
        }

        const bestHash = scores[0].hash;
        logic.reason += ` → ${bestHash.substring(0, 8)}`;
        return { bestHash, logic };
    }

    /**
     * Select best preset based on audio features
     * Enhanced to detect and use mood for scoring (Phase 3)
     * @param {Object} features - Audio features
     */
    selectBestPreset(features) {
        // Get candidate presets based on features
        const candidates = this.getCandidates(features);

        if (candidates.length === 0) {
            console.warn('No suitable preset candidates found');
            return null;
        }

        // Detect mood for enhanced scoring
        const mood = this.audioAnalyzer?.detectMood ?
            this.audioAnalyzer.detectMood(features) : null;

        // Score each candidate (pass mood for enhanced scoring)
        const scores = candidates.map(hash => ({
            hash,
            score: this.scorePreset(hash, features, mood)
        }));

        // Sort by score
        scores.sort((a, b) => b.score - a.score);

        // Add some randomness to top choices (avoid being too predictable)
        const topChoices = scores.slice(0, 3);
        if (topChoices.length > 0) {
            const weights = topChoices.map(c => c.score);
            const selected = this.weightedRandom(topChoices, weights);
            return selected.hash;
        }

        return scores[0].hash;
    }

    /**
     * Get candidate presets based on audio features
     */
    getCandidates(features, limit = 30) {
        let candidates = [];

        // Debug: Check database structure
        if (this.updateCount <= 2) {
            console.log('[getCandidates] Database structure:', {
                hasIndices: !!this.db?.indices,
                indicesKeys: this.db?.indices ? Object.keys(this.db.indices) : 'none',
                hasPresets: !!this.db?.presets,
                presetsCount: this.db?.presets ? Object.keys(this.db.presets).length : 0,
                hasNameMapping: !!this.db?.namesToHashes,
                nameMappingCount: this.db?.namesToHashes ? Object.keys(this.db.namesToHashes).length : 0
            });
        }

        // FALLBACK: If no indices, use all preset hashes from database
        if (!this.db?.indices) {
            if (this.db?.presets) {
                // Use preset hashes directly from presets object
                const allHashes = Object.keys(this.db.presets);
                console.log(`[getCandidates] No indices found, using all ${allHashes.length} preset hashes`);
                candidates = [...allHashes];
            } else if (this.db?.namesToHashes) {
                // Use hashes from name mapping
                const allHashes = Object.values(this.db.namesToHashes);
                console.log(`[getCandidates] No presets object, using ${allHashes.length} hashes from name mapping`);
                candidates = [...allHashes];
            } else {
                console.warn('[getCandidates] No usable database structure found');
                return [];
            }
        } else {
            // Use MA crossover signals for smarter preset selection (if available)
            let crossoverState = { energy: 'none', bass: 'none', treble: 'none' };
            if (this.crossoverDetector) {
                crossoverState = this.crossoverDetector.getDebugState();
            }

            // Prioritize based on crossover signals
            if (crossoverState.energy === 'golden' || features.energy > 0.8) {
                // High energy state - use high energy presets
                candidates = [...this.db.indices.high];
            } else if (crossoverState.energy === 'death' || features.energy < 0.3) {
                // Low energy state - use calm presets
                candidates = [...this.db.indices.calm];
            } else if (crossoverState.bass === 'golden' || features.bassEnergy > 0.7) {
                // Bass-heavy state - use bass-reactive presets
                candidates = [...this.db.indices.bass];
            } else if (crossoverState.treble === 'golden') {
                // Treble/melodic state - use fractal/organic presets
                candidates = [
                    ...this.pickRandom(this.db.indices.fractal, 10),
                    ...this.pickRandom(this.db.indices.organic, 10)
                ];
            } else {
                // Mixed state - variety of presets
                candidates = [
                    ...this.pickRandom(this.db.indices.high, 5),
                    ...this.pickRandom(this.db.indices.bass, 5),
                    ...this.pickRandom(this.db.indices.particle, 5),
                    ...this.pickRandom(this.db.indices.fractal, 5),
                    ...this.pickRandom(this.db.indices.organic, 5)
                ];
            }
        }

        // Filter out recently used presets
        candidates = candidates.filter(hash => !this.recentPresets.includes(hash));

        // Filter out current preset
        if (this.currentHash) {
            candidates = candidates.filter(hash => hash !== this.currentHash);
        }

        // Filter out problematic presets that don't render properly
        candidates = candidates.filter(hash => !this.problematicPresets.has(hash))

        // Shuffle and limit
        return this.shuffle(candidates).slice(0, limit);
    }

    /**
     * Score a preset based on how well it matches current audio
     * Enhanced with mood, BPM, and spectral scoring (Phase 3)
     * @param {string} hash - Preset hash
     * @param {Object} features - Current audio features
     * @param {Object} mood - Optional mood detection result { label, confidence }
     */
    scorePreset(hash, features, mood = null) {
        const preset = this.db.presets[hash];
        if (!preset || !preset.fingerprint) {
            return 0;
        }

        const fp = preset.fingerprint;
        let score = 0;

        // EXISTING: Energy match (REDUCE from 0.3 to 0.25)
        const energyDiff = Math.abs((fp.energy || 0.5) - (features.energy || 0.5));
        score += (1 - energyDiff) * 0.25;

        // EXISTING: Bass reactivity match (keep at 0.15)
        const fpBass = fp.bass !== undefined ? fp.bass : fp.bassEnergy;
        if (features.bassEnergy > 0.6 && fpBass > 0.6) {
            score += 0.15;
        } else if (features.bassEnergy < 0.3 && fpBass < 0.3) {
            score += 0.075;
        }

        // NEW: Mood affinity (15%)
        // CRIT-8 FIX: Validate moodAffinities has meaningful variation
        if (mood && mood.label && fp.moodAffinities) {
            const moodScore = fp.moodAffinities[mood.label];
            if (moodScore !== undefined) {
                // Only use if moodAffinities shows meaningful variation (not all 0.5)
                const values = Object.values(fp.moodAffinities).map(v => parseFloat(v) || 0.5);
                const variance = values.reduce((s, v) => s + (v - 0.5) ** 2, 0) / values.length;
                if (variance > 0.01) {  // Has meaningful variation
                    score += moodScore * mood.confidence * 0.15;
                }
            }
        }

        // NEW: BPM range match (10%)
        // WARN-3 FIX: Clamp at 0 to prevent negative scores
        if (this.audioAnalyzer && this.audioAnalyzer.detectedBPM && fp.optimalBpm) {
            const bpm = this.audioAnalyzer.detectedBPM;
            if (bpm >= fp.optimalBpm.min && bpm <= fp.optimalBpm.max) {
                const distFromIdeal = Math.abs(bpm - fp.optimalBpm.ideal);
                const rangeSize = (fp.optimalBpm.max - fp.optimalBpm.min) / 2;
                // WARN-3 FIX: Clamp at 0 - never subtract from score
                score += Math.max(0, 1 - distFromIdeal / rangeSize) * 0.10;
            }
            // Outside optimal range: no bonus, but don't penalize
        }

        // CRIT-7 FIX: REMOVED spectralProfile matching
        // Presets don't have intrinsic spectral profiles - they REACT to audio.
        // Instead, match audio spectral features to preset's reactive properties:
        if (features.spectral && (fp.bassEnergy !== undefined || fp.bass !== undefined)) {
            // High bass audio + high bass preset = good match
            const presetBass = fp.bassEnergy !== undefined ? fp.bassEnergy : fp.bass;
            const bassMatch = 1 - Math.abs((features.bass || 0) - (presetBass || 0));
            score += bassMatch * 0.10;
        }

        // EXISTING: Visual continuity (keep at 0.10)
        if (this.currentHash) {
            const currentFp = this.db.presets[this.currentHash]?.fingerprint;
            if (currentFp) {
                const complexityDiff = Math.abs((fp.complexity || 0.5) - (currentFp.complexity || 0.5));
                score += (1 - complexityDiff) * 0.10;
            }
        }

        // EXISTING: Performance consideration (keep at 0.10)
        score += ((fp.fps || 60) / 60) * 0.10;

        // EXISTING: Variety bonus (keep at 0.05)
        if (fp.styles && fp.styles.length > 0) {
            if (features.isDrop && fp.styles.includes('particle')) {
                score += 0.05;
            } else if (features.isChill && fp.styles.includes('organic')) {
                score += 0.05;
            }
        }

        return score;
    }

    /**
     * AUDIO TRANSITION FIX: Ensure both presets get live audio during blending
     *
     * Problem identified: New presets were initialized with whatever audio was playing
     * when loadPreset() was called, but this could be different from the live audio
     * during the actual transition blending.
     *
     * Solution implemented in renderer.js lines 830-843:
     * - During blending, force refresh of audio variables in the new preset's base state
     * - This ensures both old and new presets use current live audio data
     * - Eliminates black frames caused by stale initialization-time audio values
     *
     * The renderer now properly splits live audio to both presets during transitions.
     */

    /**
     * Switch to a new preset
     */
    async switchToPreset(hash) {
        const presetData = this.db.presets[hash];
        if (!presetData) {
            console.error(`Preset ${hash} not found in database`);
            return;
        }

        // Get the actual preset data (this would need to be implemented based on your preset loading)
        // For now, we'll use the first name as the preset identifier
        const presetName = presetData.names[0];

        // Mark transition start to prevent rapid switching
        this.isTransitioning = true;
        this.transitionStartTime = performance.now();

        // Mark transition start for aggressive black frame detection
        if (this.frameAnalyzer && this.frameAnalyzer.markTransitionStart) {
            this.frameAnalyzer.markTransitionStart();
        }

        // Get warmup time from fingerprint
        this.currentWarmupTime = presetData.fingerprint.warmupTime || 0;

        console.log(`Switching to preset ${hash}: ${presetName.substring(0, 40)}...`);
        // Check for both naming conventions (bass vs bassEnergy)
        const bassValue = presetData.fingerprint.bass !== undefined ?
            presetData.fingerprint.bass : presetData.fingerprint.bassEnergy;

        if (presetData.fingerprint.energy !== undefined && bassValue !== undefined) {
            console.log(`  Energy: ${presetData.fingerprint.energy.toFixed(2)}, Bass: ${bassValue.toFixed(2)}, FPS: ${presetData.fingerprint.fps}`);
        } else {
            console.log(`  No fingerprint data available for this preset`);
        }
        if (this.currentWarmupTime > 0) {
            console.log(`  Warmup time: ${this.currentWarmupTime}s (will display for at least ${this.currentWarmupTime + 2}s)`);
        }

        // Schedule transition end notification (after blend completes)
        setTimeout(() => {
            if (this.frameAnalyzer && this.frameAnalyzer.markTransitionEnd) {
                this.frameAnalyzer.markTransitionEnd();
            }
        }, 2500); // 2.5 seconds to cover most blend times

        // Schedule solid color detection after warmup
        if (this.detectSolidColor && !this.solidColorChecks.has(hash)) {
            setTimeout(() => {
                this.checkForSolidColor(hash, false);
            }, (this.currentWarmupTime + 1) * 1000);
        }

        // Load the preset with error handling
        if (this.butterchurn && this.butterchurn.loadPreset) {
            const loadSuccess = await this.loadPresetByHash(hash, 2.0); // Standard blend time
            if (!loadSuccess) {
                console.error(`[IntelligentSelector] Failed to load preset ${hash}, keeping current preset`);
                // Clear transition state on failure
                this.isTransitioning = false;
                return; // Don't update state if load failed
            }
        }

        // Update state
        this.currentHash = hash;
        this.currentPreset = presetData;
        this.lastSwitch = performance.now();

        // Clear recent features history after switch to avoid false positives
        this.recentFeatures = [];

        // Reset performance tracking for new preset
        if (this.performanceTracker) {
            this.performanceTracker.reset();
        }

        // Clear pending phrase switches
        this.pendingSwitchOnPhrase = false;
        this.pendingSwitchPreset = null;
        this.pendingSwitchHash = null;
        this.pendingSwitchReason = null;
        this.preDropSwitchScheduled = false;
        this.preDropSwitchTime = null;

        // Store audio state at switch time (for reference, though we now use rate-of-change)
        const features = this.calculateAudioFeatures();
        if (features) {
            this.switchEnergy = features.energy;
            this.switchBass = features.bassEnergy;
            this.switchTreble = features.trebleEnergy;
        } else {
            // Use defaults if no audio available
            this.switchEnergy = 0.5;
            this.switchBass = 0.5;
            this.switchTreble = 0.5;
        }

        // Debug output
        if (this.debugSceneChange) {
            console.log(`[Switch] Storing scene state after successful switch - Energy: ${this.switchEnergy.toFixed(3)}, ` +
                       `Bass: ${this.switchBass.toFixed(3)}, Treble: ${this.switchTreble.toFixed(3)}`);
        }

        // Add to recent presets
        this.recentPresets.push(hash);
        if (this.recentPresets.length > this.recentPresetsMax) {
            this.recentPresets.shift();
        }
    }

    /**
     * Switch to preset from preset pack (for direct testing mode)
     */
    switchToPresetPack(presetName) {
        if (!this.presetPack || !this.presetPack[presetName]) return;

        // Mark transition start to prevent rapid switching
        this.isTransitioning = true;
        this.transitionStartTime = performance.now();

        // Get warmup time from fingerprint database if available
        if (this.db && this.db.nameIndex && this.db.nameIndex[presetName]) {
            const hash = this.db.nameIndex[presetName];
            const presetData = this.db.presets[hash];
            if (presetData && presetData.fingerprint) {
                this.currentWarmupTime = presetData.fingerprint.warmupTime || 0;
                if (this.currentWarmupTime > 0) {
                    console.log(`Preset needs ${this.currentWarmupTime}s warmup, will display for at least ${this.currentWarmupTime + 2}s`);
                }
            }
        } else {
            this.currentWarmupTime = 0;
        }

        console.log('Switching to preset:', presetName);

        // Determine blend time based on warmup and preset count
        let blendTime = 2.0; // Default blend time

        if (this.recentPresets.length < 2) {
            // No blending for first few presets to avoid black screen
            blendTime = 0;
        } else if (this.currentWarmupTime > 0) {
            // For presets with warmup, use shorter blend to give more time for warmup
            blendTime = Math.min(1.0, 2.0 - this.currentWarmupTime * 0.5);
        }

        console.log(`Loading preset with ${blendTime}s blend time (warmup: ${this.currentWarmupTime}s)`);
        this.butterchurn.loadPreset(this.presetPack[presetName], blendTime);

        // Schedule solid color detection after warmup
        if (this.detectSolidColor && !this.solidColorChecks.has(presetName)) {
            setTimeout(() => {
                this.checkForSolidColor(presetName, true);
            }, (this.currentWarmupTime + 1) * 1000);
        }

        this.currentPreset = presetName;
        this.lastSwitch = performance.now();

        // Clear recent features history after switch to avoid false positives
        this.recentFeatures = [];

        // Store audio state at switch time (for reference, though we now use rate-of-change)
        const features = this.calculateAudioFeatures();
        if (features) {
            this.switchEnergy = features.energy;
            this.switchBass = features.bassEnergy;
            this.switchTreble = features.trebleEnergy;
        } else {
            // Use defaults if no audio available
            this.switchEnergy = 0.5;
            this.switchBass = 0.5;
            this.switchTreble = 0.5;
        }

        // Debug output
        if (this.debugSceneChange) {
            console.log(`[Switch Pack] Storing scene state after successful switch - Energy: ${this.switchEnergy.toFixed(3)}, ` +
                       `Bass: ${this.switchBass.toFixed(3)}, Treble: ${this.switchTreble.toFixed(3)}`);
        }

        // Add to recent presets
        this.recentPresets.push(presetName);
        if (this.recentPresets.length > this.recentPresetsMax) {
            this.recentPresets.shift();
        }
    }

    /**
     * Add preset to problematic list (for presets that don't render)
     */
    markProblematic(hash) {
        this.problematicPresets.add(hash);
        console.warn(`Marked preset ${hash} as problematic due to rendering issues`);

        // Save to persistent storage if available
        if (typeof localStorage !== 'undefined') {
            const problematic = Array.from(this.problematicPresets);
            localStorage.setItem('problematicPresets', JSON.stringify(problematic));
        }
    }

    /**
     * Check current frame for problems using LiveFrameAnalyzer
     */
    checkFrameForProblems(frameData) {
        if (!frameData || !this.currentHash) return;

        const width = this.butterchurn?.canvas?.width || 800;
        const height = this.butterchurn?.canvas?.height || 600;

        if (!this.frameAnalyzer) return;

        const analysis = this.frameAnalyzer.analyzeFrame(frameData, width, height);

        if (analysis.isProblematic) {
            const context = {
                audioLevel: this.audioHistory[this.audioHistory.length - 1]?.energy || 0,
                fps: this.butterchurn?.fps || 60,
                frameData: analysis,
                previousHash: this.currentHash // Pass the problematic preset hash
            };

            // Log the failure
            if (this.presetLogger) {
                this.presetLogger.logFailure(this.currentHash, analysis.reason, context);
            }

            // Check if we should enter emergency mode
            // Be more aggressive during transitions
            const confidenceThreshold = analysis.reason === 'black_frame_during_transition' ? 0.5 : 0.8;
            if (analysis.confidence > confidenceThreshold) {
                console.warn(`[IntelligentSelector] Detected ${analysis.reason} - entering emergency mode`);
                this.enterEmergencyMode(context);
            }
        }
    }

    /**
     * Enter emergency mode with a fallback preset
     */
    enterEmergencyMode(context) {
        if (!this.emergencyManager) {
            console.warn('[IntelligentSelector] Emergency manager not available');
            return;
        }

        const emergency = this.emergencyManager.getEmergencyPreset({
            deviceTier: this.deviceTier,
            audioLevel: context.audioLevel || 0
        });

        if (emergency && emergency.preset) {
            console.log(`[IntelligentSelector] EMERGENCY: Switching to emergency preset: ${emergency.key}`);
            this.isEmergencyMode = true;
            this.emergencyStartTime = performance.now();

            // Load the emergency preset directly with IMMEDIATE transition
            if (this.butterchurn && typeof this.butterchurn.loadPreset === 'function') {
                this.butterchurn.loadPreset(emergency.preset, 0.1); // Near-instant 0.1s transition
                this.currentHash = emergency.preset.id;
                this.currentPreset = emergency.preset.name;
                // CRITICAL: Force update lastSwitch to bypass timing constraints
                // Set it to a time that makes it appear we switched long ago
                this.lastSwitch = performance.now() - this.minSwitchInterval - 1000;
                console.log('[IntelligentSelector] Forced timing bypass for emergency switch');
            }

            // Block the problematic preset if we have the hash
            const problematicHash = context.previousHash || this.currentHash;
            if (problematicHash && this.presetLogger && typeof this.presetLogger.blockPreset === 'function') {
                this.presetLogger.blockPreset(problematicHash, 'black_frame_emergency', context);
                console.log(`[IntelligentSelector] Blocked preset ${problematicHash} due to black frames`);
            }
        }
    }

    /**
     * Exit emergency mode and return to normal selection
     */
    exitEmergencyMode() {
        console.log('[IntelligentSelector] Exiting emergency mode');
        this.isEmergencyMode = false;
        this.emergencyStartTime = 0;

        // Force a new preset selection
        const features = this.calculateAudioFeatures();
        if (!features) {
            console.warn('[IntelligentSelector] Cannot force switch - no audio features available');
            return;
        }
        const bestHash = this.selectBestPreset(features);
        if (bestHash) {
            this.switchToPreset(bestHash);
        }
    }

    /**
     * Select an alternative preset when the first choice is blocked
     */
    selectAlternativePreset(features) {
        const candidates = this.getCandidates(features, 50); // Get more candidates

        for (const hash of candidates) {
            const blockStatus = (this.presetLogger && typeof this.presetLogger.isBlocked === 'function')
                ? this.presetLogger.isBlocked(hash)
                : { blocked: false };
            if (!blockStatus.blocked) {
                console.log(`[IntelligentSelector] Using alternative preset: ${hash}`);
                this.switchToPreset(hash);
                return;
            }
        }

        // If all candidates are blocked, use emergency preset
        console.warn('[IntelligentSelector] All candidates blocked - using emergency preset');
        this.enterEmergencyMode({ audioLevel: features.energy });
    }

    /**
     * Check if preset is problematic
     */
    isProblematic(hash) {
        // Check blocklist first
        if (this.presetLogger && typeof this.presetLogger.isBlocked === 'function') {
            const blockStatus = this.presetLogger.isBlocked(hash);
            if (blockStatus && blockStatus.blocked) {
                return true;
            }
        }

        // Check local problematic list
        return this.problematicPresets.has(hash);
    }

    /**
     * Mark preset as problematic (fingerprint mode)
     */
    markProblematic(hash) {
        this.problematicPresets.add(hash);

        // Also add to failure logger for permanent tracking
        const context = {
            audioLevel: this.audioHistory[this.audioHistory.length - 1]?.energy || 0,
            fps: this.butterchurn?.fps || 60
        };

        if (this.presetLogger) {
            this.presetLogger.logFailure(hash, 'solid_color_detected', context);
        }
        console.warn(`[IntelligentSelector] Marked preset ${hash} as problematic`);
    }

    /**
     * Add preset to problematic list (preset pack mode)
     */
    markProblematicPack(presetName) {
        this.problematicPresets.add(presetName);
        console.warn(`Marked preset "${presetName}" as problematic due to rendering issues`);

        // Save to persistent storage if available
        if (typeof localStorage !== 'undefined') {
            const problematic = Array.from(this.problematicPresets);
            localStorage.setItem('problematicPresets', JSON.stringify(problematic));
        }
    }

    /**
     * Check for solid color frames after warmup period
     */
    checkForSolidColor(hash) {
        // Only check if this is still the current preset
        if (this.currentHash !== hash) return;

        // Mark that we've checked this preset
        this.solidColorChecks.set(hash, true);

        // Get canvas element to check pixels
        const canvas = this.butterchurn?.canvas || document.querySelector('canvas');
        if (!canvas) return;

        try {
            const ctx = canvas.getContext('2d') || canvas.getContext('webgl');
            if (!ctx) return;

            let isSolidColor = false;

            if (ctx instanceof WebGLRenderingContext || ctx instanceof WebGL2RenderingContext) {
                // WebGL context - read pixels from framebuffer
                const pixels = new Uint8Array(4 * 100); // Sample 100 pixels
                const step = Math.floor(canvas.width * canvas.height / 100);

                for (let i = 0; i < 100; i++) {
                    const x = (i * step) % canvas.width;
                    const y = Math.floor((i * step) / canvas.width);
                    ctx.readPixels(x, y, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels.subarray(i * 4, i * 4 + 4));
                }

                // Check color variance
                isSolidColor = this.checkPixelVariance(pixels);

            } else {
                // 2D context - use getImageData
                const imageData = ctx.getImageData(0, 0, Math.min(100, canvas.width), Math.min(100, canvas.height));
                const data = imageData.data;

                // Check color variance
                isSolidColor = this.checkPixelVariance(data);
            }

            if (isSolidColor) {
                console.warn(`🚫 Detected solid color for preset ${hash} - marking as problematic`);
                this.markProblematic(hash);

                // Switch to a different preset immediately
                setTimeout(() => {
                    const features = this.calculateAudioFeatures();
                    if (features) {
                        const bestHash = this.selectBestPreset(features);
                        if (bestHash && bestHash !== hash) {
                            this.switchToPreset(bestHash);
                        }
                    }
                }, 500);
            } else {
                console.log(`✅ Preset ${hash} rendering correctly with color variation`);
            }

        } catch (error) {
            console.error('Error checking for solid color:', error);
        }
    }

    /**
     * Check for solid color frames after warmup period (preset pack mode)
     */
    checkForSolidColorPack(presetName) {
        // Only check if this is still the current preset
        if (this.currentPreset !== presetName) return;

        // Mark that we've checked this preset
        this.solidColorChecks.set(presetName, true);

        // Get canvas element to check pixels
        const canvas = document.querySelector('canvas');
        if (!canvas) return;

        try {
            const ctx = canvas.getContext('2d') || canvas.getContext('webgl');
            if (!ctx) return;

            let isSolidColor = false;

            if (ctx instanceof WebGLRenderingContext || ctx instanceof WebGL2RenderingContext) {
                // WebGL context - read pixels from framebuffer
                const pixels = new Uint8Array(4 * 100); // Sample 100 pixels
                const step = Math.floor(canvas.width * canvas.height / 100);

                for (let i = 0; i < 100; i++) {
                    const x = (i * step) % canvas.width;
                    const y = Math.floor((i * step) / canvas.width);
                    ctx.readPixels(x, y, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixels.subarray(i * 4, i * 4 + 4));
                }

                // Check color variance
                isSolidColor = this.checkPixelVariance(pixels);

            } else {
                // 2D context - use getImageData
                const imageData = ctx.getImageData(0, 0, Math.min(100, canvas.width), Math.min(100, canvas.height));
                const data = imageData.data;

                // Check color variance
                isSolidColor = this.checkPixelVariance(data);
            }

            if (isSolidColor) {
                console.warn(`🚫 Detected solid color for preset "${presetName}" - marking as problematic`);
                this.markProblematicPack(presetName);

                // Switch to a different preset immediately
                setTimeout(() => {
                    this.selectRandomPreset();
                }, 500);
            } else {
                console.log(`✅ Preset "${presetName}" rendering correctly with color variation`);
            }

        } catch (error) {
            console.error('Error checking for solid color:', error);
        }
    }

    /**
     * Check if pixels show only a solid color (no variation)
     * Returns true if all pixels are within a small threshold of each other
     */
    checkPixelVariance(pixels) {
        if (pixels.length < 4) return true;

        // Calculate min/max for each channel
        let minR = 255, maxR = 0;
        let minG = 255, maxG = 0;
        let minB = 255, maxB = 0;

        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];

            minR = Math.min(minR, r);
            maxR = Math.max(maxR, r);
            minG = Math.min(minG, g);
            maxG = Math.max(maxG, g);
            minB = Math.min(minB, b);
            maxB = Math.max(maxB, b);
        }

        // Calculate variance for each channel
        const varR = maxR - minR;
        const varG = maxG - minG;
        const varB = maxB - minB;

        // Total variance across all channels
        const totalVariance = varR + varG + varB;

        // If variance is very low, it's essentially a solid color
        const isSolid = totalVariance < 30;

        if (isSolid) {
            const avgR = Math.floor((minR + maxR) / 2);
            const avgG = Math.floor((minG + maxG) / 2);
            const avgB = Math.floor((minB + maxB) / 2);
            console.log(`Solid color detected: RGB(${avgR}, ${avgG}, ${avgB}), variance: ${totalVariance}`);
        }

        return isSolid;
    }

    /**
     * Load preset data by hash with proper error handling
     */
    async loadPresetByHash(hash) {
        try {
            // Validate hash exists in database
            if (!this.db || !this.db.presets || !this.db.presets[hash]) {
                throw new Error(`Preset hash ${hash} not found in database`);
            }

            const presetData = this.db.presets[hash];
            const presetName = presetData.names[0];

            if (!presetName) {
                throw new Error(`No preset name found for hash ${hash}`);
            }

            console.log(`Loading preset: ${presetName}`);

            // Check if we have a butterchurn instance and preset pack
            if (!this.butterchurn || typeof this.butterchurn.loadPreset !== 'function') {
                throw new Error('Butterchurn instance not available or loadPreset method not found');
            }

            if (!this.presetPack) {
                throw new Error('Preset pack not loaded');
            }

            // Search for preset by name in the presets object
            // Try different matching strategies since names may vary between database and pack
            let presetKey = Object.keys(this.presetPack).find(key => {
                // Exact match
                if (key === presetName) return true;
                // Key contains preset name
                if (key.includes(presetName)) return true;
                // Preset name contains key (in case DB has longer name)
                if (presetName.includes(key)) return true;
                // Try matching just the author and title part (before any brackets/parens)
                const simplifiedKey = key.split(/[\[\(]/)[0].trim().toLowerCase();
                const simplifiedName = presetName.split(/[\[\(]/)[0].trim().toLowerCase();
                return simplifiedKey === simplifiedName;
            });

            // If no match, check if we should fail fast (debug mode) or use fallback
            if (!presetKey) {
                // In debug mode or test environment, fail immediately
                if (this.debugMode) {
                    throw new Error(`[CRITICAL] Preset not found in pack: "${presetName}". Database/pack mismatch!`);
                }

                // Production mode: try to use a fallback
                const availablePresets = Object.keys(this.presetPack);
                if (availablePresets.length > 0) {
                    console.error('[IntelligentSelector] ERROR: Could not find preset:', presetName);
                    console.error('[IntelligentSelector] This indicates a database/pack mismatch!');

                    // Use emergency preset if available instead of random
                    if (this.emergencyManager) {
                        const emergency = this.emergencyManager.getEmergencyPreset({
                            deviceTier: this.deviceTier,
                            audioLevel: 0.5
                        });
                        if (emergency && emergency.preset) {
                            console.log('[IntelligentSelector] Using emergency preset instead');
                            this.butterchurn.loadPreset(emergency.preset, 1.0);
                            return true;
                        }
                    }

                    // Last resort: random preset
                    presetKey = availablePresets[Math.floor(Math.random() * availablePresets.length)];
                    console.warn('[IntelligentSelector] Using random fallback:', presetKey);
                } else {
                    throw new Error('No presets available in preset pack');
                }
            }

            if (!presetKey || !this.presetPack[presetKey]) {
                throw new Error(`Could not find preset in collection: ${presetName}`);
            }

            const presetObj = this.presetPack[presetKey];

            // Basic validation - ensure it's not a completely empty object
            if (!presetObj || typeof presetObj !== 'object') {
                throw new Error(`Invalid preset object for key: ${presetKey}`);
            }

            console.log('[IntelligentSelector] Actually loading preset:', presetKey);
            this.butterchurn.loadPreset(presetObj, 2.0); // 2 second blend

            // Update current preset tracking
            this.currentPreset = presetKey;
            this.lastSwitch = performance.now();

            return true; // Success

        } catch (error) {
            console.error('[IntelligentSelector] Error loading preset:', error.message);

            // Attempt recovery with emergency presets if available
            if (this.isEmergencyMode && emergencyManager) {
                console.warn('[IntelligentSelector] Attempting emergency preset fallback');
                try {
                    const emergencyPreset = emergencyManager.getRandomEmergencyPreset();
                    if (emergencyPreset) {
                        this.butterchurn.loadPreset(emergencyPreset, 1.0);
                        return true;
                    }
                } catch (emergencyError) {
                    console.error('[IntelligentSelector] Emergency preset also failed:', emergencyError.message);
                }
            }

            // Return false to indicate failure
            return false;
        }
    }

    /**
     * Utility: Pick random elements from array
     */
    pickRandom(array, count) {
        const shuffled = this.shuffle([...array]);
        return shuffled.slice(0, count);
    }

    /**
     * Utility: Shuffle array
     */
    shuffle(array) {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    /**
     * Utility: Weighted random selection
     */
    weightedRandom(choices, weights) {
        const total = weights.reduce((sum, w) => sum + w, 0);
        const random = Math.random() * total;

        let cumulative = 0;
        for (let i = 0; i < choices.length; i++) {
            cumulative += weights[i];
            if (random <= cumulative) {
                return choices[i];
            }
        }

        return choices[choices.length - 1];
    }

    /**
     * Get current state for debugging
     */
    getState() {
        const stats = this.presetLogger?.getStatistics();
        const frameState = this.frameAnalyzer?.getState();

        return {
            currentPreset: this.currentHash,
            presetName: this.db?.presets[this.currentHash]?.names?.[0] || this.currentPreset,
            timeSinceSwitch: performance.now() - this.lastSwitch,
            recentPresets: this.recentPresets,
            audioHistorySize: this.audioHistory.length,
            isEmergencyMode: this.isEmergencyMode,
            deviceTier: this.deviceTier,
            blocklist: stats?.blocklist || {},
            frameAnalysis: frameState?.lastAnalysis || null,
            problematicDetected: this.problematicPresets.size
        };
    }

    /**
     * Manual preset switch (for user interaction)
     */
    nextPreset() {
        const features = this.calculateAudioFeatures();
        if (!features) {
            console.warn('[IntelligentSelector] Cannot select next preset - no audio features available');
            return;
        }
        const bestHash = this.selectBestPreset(features);
        if (bestHash) {
            this.switchToPreset(bestHash);
        }
    }

    /**
     * Set preference weights (for customization)
     */
    setWeights(weights) {
        this.weights = { ...this.weights, ...weights };
    }

    /**
     * Enable/disable scene change debug output
     */
    setDebugSceneChange(enabled) {
        this.debugSceneChange = enabled;
        if (enabled) {
            console.log('[Scene Debug] Enabled - will log scene change scores and switch decisions');
            console.log(`[Scene Debug] Thresholds - Scene: ${this.sceneScoreThreshold}, ` +
                       `Energy: ${this.energyChangeThreshold}, Bass: ${this.bassChangeThreshold}`);
        }
    }

    /**
     * Enable/disable debug mode (throws errors instead of swallowing them)
     * CRITICAL: Use this on test pages to prevent silent error handling
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
        if (enabled) {
            console.warn('🚨 [DEBUG MODE] ENABLED - Errors will be thrown instead of handled silently');
            console.warn('🚨 This should ONLY be used in development/testing environments');
        } else {
            console.log('[DEBUG MODE] Disabled - Errors will be handled gracefully');
        }
    }

    /**
     * Manually initialize emergency manager for testing
     */
    initializeEmergencyManager() {
        try {
            // Try to import and instantiate directly
            import('./presets/emergencyPresetManager.js').then(module => {
                const EmergencyPresetManager = module.default || module.EmergencyPresetManager;
                if (EmergencyPresetManager) {
                    this.emergencyManager = new EmergencyPresetManager();
                    console.log('[IntelligentSelector] Emergency manager manually initialized');
                    console.log('[IntelligentSelector] Emergency presets available:', Object.keys(this.emergencyManager.emergencyPresets || {}));
                }
            }).catch(e => {
                console.error('[IntelligentSelector] Failed to manually load emergency manager:', e);
            });
        } catch (e) {
            console.error('[IntelligentSelector] Error initializing emergency manager:', e);
        }
    }

    /**
     * Update scene change thresholds
     */
    setSceneThresholds(thresholds) {
        if (thresholds.sceneScore !== undefined) {
            this.sceneScoreThreshold = thresholds.sceneScore;
        }
        if (thresholds.energyChange !== undefined) {
            this.energyChangeThreshold = thresholds.energyChange;
        }
        if (thresholds.bassChange !== undefined) {
            this.bassChangeThreshold = thresholds.bassChange;
        }

        if (this.debugSceneChange) {
            console.log(`[Scene Debug] Updated thresholds - Scene: ${this.sceneScoreThreshold}, ` +
                       `Energy: ${this.energyChangeThreshold}, Bass: ${this.bassChangeThreshold}`);
        }
    }

    /**
     * Clean up resources (Meyda analyzer, performance tracker, etc.)
     * CRIT-3 FIX: Use existing property name (audioAnalyzer)
     */
    destroy() {
        // Clean up audio analyzer (includes Meyda cleanup)
        if (this.audioAnalyzer?.destroy) {
            this.audioAnalyzer.destroy();
        }

        // Reset performance tracker
        if (this.performanceTracker) {
            this.performanceTracker.reset();
        }

        // Clear pending switches
        this.pendingSwitchOnPhrase = false;
        this.pendingSwitchPreset = null;
        this.pendingSwitchHash = null;
        this.pendingSwitchReason = null;
        this.preDropSwitchScheduled = false;
        this.preDropSwitchTime = null;

        // Clear history
        this.audioHistory = [];
        this.recentPresets = [];
        this.featureHistory = [];

        console.log('[IntelligentSelector] Destroyed and cleaned up resources');
    }
}

// Export as ES6 module
export default IntelligentPresetSelector;

// Also export for browser global if needed
if (typeof window !== 'undefined') {
    window.IntelligentPresetSelector = IntelligentPresetSelector;
}