/**
 * Intelligent Preset Selector for Butterchurn
 *
 * Selects presets based on real-time audio features using
 * pre-generated fingerprint database with 8-character hashes
 */

class IntelligentPresetSelector {
    constructor(butterchurn, fingerprintDatabase) {
        this.butterchurn = butterchurn;
        this.db = fingerprintDatabase;

        // Selection state
        this.currentHash = null;
        this.currentPreset = null;
        this.lastSwitch = 0;
        this.minSwitchInterval = 5000; // Don't switch too often (5 seconds)
        this.maxSwitchInterval = 30000; // Force switch after 30 seconds
        this.currentWarmupTime = 0; // Track warmup requirement for current preset

        // Direct preset pack support (for testing without fingerprint database)
        this.presetPack = null;

        // Problematic presets that show only a single solid color
        // These are identified through testing and should be skipped
        this.problematicPresets = new Set([
            // Add hashes of presets that consistently show solid color
            // These will be populated based on testing
        ])

        // Enable automatic solid color detection
        this.detectSolidColor = true;
        this.solidColorChecks = new Map(); // Track detection attempts

        // Audio history for trend detection
        this.audioHistory = [];
        this.historySize = 30; // Keep 30 frames (~0.5 sec at 60fps)

        // Transition scoring weights
        this.weights = {
            energyMatch: 0.3,
            bassMatch: 0.25,
            continuity: 0.2,
            performance: 0.15,
            variety: 0.1
        };

        // Recently used presets (avoid repetition)
        this.recentPresets = [];
        this.recentPresetsMax = 10;
    }

    /**
     * Set preset pack for direct testing (alternative to fingerprint database)
     */
    setPresetPack(presets) {
        this.presetPack = presets;

        console.log('Preset pack loaded with', Object.keys(presets).length, 'presets');
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
     * Initialize with fingerprint database
     */
    async initialize() {
        if (typeof this.db === 'string') {
            // Load from URL
            const response = await fetch(this.db);
            this.db = await response.json();
        }

        if (this.db) {
            console.log(`Intelligent selector initialized with ${Object.keys(this.db.presets).length} unique presets`);

            // Validate database structure
            if (!this.db.presets || !this.db.indices) {
                throw new Error('Invalid fingerprint database structure');
            }
        }

        // Load previously detected problematic presets from localStorage
        if (typeof localStorage !== 'undefined') {
            try {
                const stored = localStorage.getItem('problematicPresets');
                if (stored) {
                    const problematic = JSON.parse(stored);
                    problematic.forEach(hash => this.problematicPresets.add(hash));
                    console.log(`Loaded ${problematic.length} previously detected problematic presets`);
                }
            } catch (error) {
                console.error('Error loading problematic presets:', error);
            }
        }
    }

    /**
     * Update with current audio levels and potentially switch presets
     */
    update(audioLevels) {
        // Don't update if paused
        if (this.isPaused) {
            return null;
        }

        const now = performance.now();

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

        // Check if we should switch
        const timeSinceSwitch = now - this.lastSwitch;
        const shouldSwitch = this.shouldSwitchPreset(features, timeSinceSwitch);

        // Debug logging for first few updates
        if (this.updateCount === undefined) this.updateCount = 0;
        this.updateCount++;
        if (this.updateCount <= 5) {
            console.log(`[Update ${this.updateCount}] timeSinceSwitch: ${timeSinceSwitch}ms, shouldSwitch: ${shouldSwitch}, currentPreset: ${this.currentPreset}`);
        }

        let selectionLogic = null;
        if (shouldSwitch) {
            // Use fingerprint database selection with transparency
            const selectionResult = this.selectBestPresetWithLogic(features);
            if (selectionResult && selectionResult.bestHash !== this.currentHash) {
                this.switchToPreset(selectionResult.bestHash);
                selectionLogic = selectionResult.logic;
            }
        }

        return {
            currentPreset: this.currentHash,
            features: features,
            nextSwitch: Math.max(0, this.minSwitchInterval - timeSinceSwitch),
            selectionLogic: selectionLogic
        };
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
     * Calculate audio features from history
     */
    calculateAudioFeatures() {
        if (this.audioHistory.length === 0) {
            return {
                energy: 0.5,
                bassEnergy: 0.5,
                trebleEnergy: 0.5,
                isDrop: false,
                isBuildup: false,
                trend: 'stable'
            };
        }

        const recent = this.audioHistory.slice(-10);
        const older = this.audioHistory.slice(0, 10);

        // Current levels (average of recent)
        const currentBass = recent.reduce((sum, h) => sum + (h.bass || 0), 0) / recent.length;
        const currentMid = recent.reduce((sum, h) => sum + (h.mid || 0), 0) / recent.length;
        const currentTreb = recent.reduce((sum, h) => sum + (h.treb || 0), 0) / recent.length;
        const currentEnergy = (currentBass + currentMid + currentTreb) / 3;

        // Historical levels (for trend detection)
        const oldBass = older.length > 0 ?
            older.reduce((sum, h) => sum + (h.bass || 0), 0) / older.length : currentBass;
        const oldEnergy = older.length > 0 ?
            older.reduce((sum, h) => sum + (h.bass + h.mid + h.treb || 0), 0) / (older.length * 3) : currentEnergy;

        // Detect drops and buildups
        const energyChange = currentEnergy - oldEnergy;
        const bassChange = currentBass - oldBass;

        return {
            energy: currentEnergy,
            bassEnergy: currentBass,
            trebleEnergy: currentTreb,
            isDrop: bassChange > 0.3 && currentBass > 0.7,
            isBuildup: energyChange > 0.1 && currentEnergy > oldEnergy,
            isChill: currentEnergy < 0.3 && Math.abs(energyChange) < 0.1,
            trend: energyChange > 0.1 ? 'rising' : energyChange < -0.1 ? 'falling' : 'stable'
        };
    }

    /**
     * Determine if we should switch presets
     */
    shouldSwitchPreset(features, timeSinceSwitch) {
        // Respect warmup time - don't switch until preset has had time to build
        const minimumTime = Math.max(
            this.minSwitchInterval,
            (this.currentWarmupTime || 0) * 1000 + 2000 // Add 2 sec buffer after warmup
        );

        // Force switch if too long
        if (timeSinceSwitch > this.maxSwitchInterval) {
            return true;
        }

        // Don't switch before minimum time (including warmup)
        if (timeSinceSwitch < minimumTime) {
            return false;
        }

        // Switch on musical events
        if (features.isDrop) {
            return true; // Always switch on drops for impact
        }

        if (features.isBuildup && timeSinceSwitch > this.minSwitchInterval * 0.7) {
            return true; // Switch during buildups for anticipation
        }

        // Switch if energy changed significantly
        if (this.currentHash) {
            const currentFp = this.db.presets[this.currentHash]?.fingerprint;
            if (currentFp) {
                const energyMismatch = Math.abs(currentFp.energy - features.energy);
                if (energyMismatch > 0.5) {
                    return true;
                }
            }
        }

        // Random switch chance increases over time
        const switchChance = (timeSinceSwitch - this.minSwitchInterval) /
                           (this.maxSwitchInterval - this.minSwitchInterval);
        return Math.random() < switchChance * 0.3;
    }

    /**
     * Select best preset with transparency into selection logic
     */
    selectBestPresetWithLogic(features) {
        const logic = {
            targetEnergy: features.energy,
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

        // Score each candidate
        const scores = candidates.map(hash => ({
            hash,
            score: this.scorePreset(hash, features)
        }));

        // Sort by score
        scores.sort((a, b) => b.score - a.score);
        logic.topScores = scores.slice(0, 3).map(s =>
            `${s.hash.substring(0, 8)}: ${s.score.toFixed(2)}`
        );

        // Determine selection reason based on features
        if (features.isDrop || features.energy > 0.8) {
            logic.reason = '🔥 Drop detected - high energy';
        } else if (features.isChill || features.energy < 0.3) {
            logic.reason = '🌊 Chill mode - calm visuals';
        } else if (features.bassEnergy > 0.7) {
            logic.reason = '🎸 Bass heavy - reactive presets';
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
     */
    selectBestPreset(features) {
        // Get candidate presets based on features
        const candidates = this.getCandidates(features);

        if (candidates.length === 0) {
            console.warn('No suitable preset candidates found');
            return null;
        }

        // Score each candidate
        const scores = candidates.map(hash => ({
            hash,
            score: this.scorePreset(hash, features)
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

        // Select primary category based on features
        if (features.isDrop || features.energy > 0.8) {
            // High energy for drops
            candidates = [...this.db.indices.high];
        } else if (features.isChill || features.energy < 0.3) {
            // Calm presets for chill moments
            candidates = [...this.db.indices.calm];
        } else if (features.bassEnergy > 0.7) {
            // Bass-reactive for bass-heavy sections
            candidates = [...this.db.indices.bass];
        } else {
            // Mix of different categories for variety
            candidates = [
                ...this.pickRandom(this.db.indices.high, 5),
                ...this.pickRandom(this.db.indices.bass, 5),
                ...this.pickRandom(this.db.indices.particle, 5),
                ...this.pickRandom(this.db.indices.fractal, 5),
                ...this.pickRandom(this.db.indices.organic, 5)
            ];
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
     */
    scorePreset(hash, features) {
        const preset = this.db.presets[hash];
        if (!preset || !preset.fingerprint) {
            return 0;
        }

        const fp = preset.fingerprint;
        let score = 0;

        // Energy match (most important)
        const energyDiff = Math.abs(fp.energy - features.energy);
        score += (1 - energyDiff) * this.weights.energyMatch;

        // Bass reactivity match
        if (features.bassEnergy > 0.6 && fp.bass > 0.6) {
            score += this.weights.bassMatch;
        } else if (features.bassEnergy < 0.3 && fp.bass < 0.3) {
            score += this.weights.bassMatch * 0.5;
        }

        // Visual continuity (if we have a current preset)
        if (this.currentHash) {
            const currentFp = this.db.presets[this.currentHash]?.fingerprint;
            if (currentFp) {
                const complexityDiff = Math.abs(fp.complexity - currentFp.complexity);
                score += (1 - complexityDiff) * this.weights.continuity;
            }
        }

        // Performance consideration (prefer high FPS presets)
        score += (fp.fps / 60) * this.weights.performance;

        // Variety bonus (prefer different styles)
        if (fp.styles && fp.styles.length > 0) {
            if (features.isDrop && fp.styles.includes('particle')) {
                score += this.weights.variety;
            } else if (features.isChill && fp.styles.includes('organic')) {
                score += this.weights.variety;
            }
        }

        return score;
    }

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

        // Get warmup time from fingerprint
        this.currentWarmupTime = presetData.fingerprint.warmupTime || 0;

        console.log(`Switching to preset ${hash}: ${presetName.substring(0, 40)}...`);
        console.log(`  Energy: ${presetData.fingerprint.energy.toFixed(2)}, Bass: ${presetData.fingerprint.bass.toFixed(2)}, FPS: ${presetData.fingerprint.fps}`);
        if (this.currentWarmupTime > 0) {
            console.log(`  Warmup time: ${this.currentWarmupTime}s (will display for at least ${this.currentWarmupTime + 2}s)`);
        }

        // Schedule solid color detection after warmup
        if (this.detectSolidColor && !this.solidColorChecks.has(hash)) {
            setTimeout(() => {
                this.checkForSolidColor(hash);
            }, (this.currentWarmupTime + 1) * 1000);
        }

        // Load the preset (this needs to be connected to actual Butterchurn loading)
        if (this.butterchurn && this.butterchurn.loadPreset) {
            // This would need the actual preset data, not just the name
            // You'd need to implement preset loading from the hash
            await this.loadPresetByHash(hash);
        }

        // Update state
        this.currentHash = hash;
        this.currentPreset = presetData;
        this.lastSwitch = performance.now();

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
                this.checkForSolidColorPack(presetName);
            }, (this.currentWarmupTime + 1) * 1000);
        }

        // Log blending state for debugging
        setTimeout(() => {
            if (this.butterchurn && this.butterchurn.renderer) {
                console.log('Blending state (FIXED):', {
                    blending: this.butterchurn.renderer.blending,
                    blendProgress: this.butterchurn.renderer.blendProgress,
                    blendDuration: this.butterchurn.renderer.blendDuration,
                    hasFixedAlphaBuffers: !!this.butterchurn.renderer.prevWarpColor
                });
            }
        }, 100);

        this.currentPreset = presetName;
        this.lastSwitch = performance.now();

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
     * Check if preset is problematic
     */
    isProblematic(hash) {
        return this.problematicPresets.has(hash);
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
                    const bestHash = this.selectBestPreset(features);
                    if (bestHash && bestHash !== hash) {
                        this.switchToPreset(bestHash);
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
     * Load preset data by hash (needs implementation based on your preset storage)
     */
    async loadPresetByHash(hash) {
        // This is where you'd load the actual preset data
        // For now, it's a placeholder that would need to be connected
        // to your preset loading system

        // Option 1: Load from a preset pack using the name
        const presetData = this.db.presets[hash];
        const presetName = presetData.names[0];

        // Option 2: Store preset data in the fingerprint database
        // (would make the database larger but more self-contained)

        // Option 3: Have a separate mapping from hash to preset location

        console.log(`Loading preset: ${presetName}`);

        // Actually load the preset
        if (this.butterchurn && typeof this.butterchurn.loadPreset === 'function' && this.presetPack) {
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

            // If no match, try to pick a random preset as fallback
            if (!presetKey) {
                const availablePresets = Object.keys(this.presetPack);
                if (availablePresets.length > 0) {
                    console.warn('[IntelligentSelector] Could not find preset, using random fallback:', presetName);
                    presetKey = availablePresets[Math.floor(Math.random() * availablePresets.length)];
                }
            }

            if (presetKey && this.presetPack[presetKey]) {
                const presetObj = this.presetPack[presetKey];

                // Basic validation - ensure it's not a completely empty object
                if (!presetObj || typeof presetObj !== 'object') {
                    console.error('[IntelligentSelector] Invalid preset object:', presetKey);
                    return;
                }

                console.log('[IntelligentSelector] Actually loading preset:', presetKey);
                this.butterchurn.loadPreset(presetObj, 2.0); // 2 second blend
                // Update current preset tracking
                this.currentPreset = presetKey;
                this.lastSwitch = performance.now();
            } else {
                console.warn('[IntelligentSelector] Could not find preset in collection:', presetName);
            }
        } else {
            console.warn('[IntelligentSelector] Cannot load - missing butterchurn or presetPack');
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
        return {
            currentPreset: this.currentHash,
            presetName: this.currentPreset?.names[0],
            timeSinceSwitch: performance.now() - this.lastSwitch,
            recentPresets: this.recentPresets,
            audioHistorySize: this.audioHistory.length
        };
    }

    /**
     * Manual preset switch (for user interaction)
     */
    nextPreset() {
        const features = this.calculateAudioFeatures();
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
}

// Export for both ES6, CommonJS, and browser global
if (typeof module !== 'undefined' && module.exports) {
    module.exports = IntelligentPresetSelector;
} else if (typeof window !== 'undefined') {
    window.IntelligentPresetSelector = IntelligentPresetSelector;
}