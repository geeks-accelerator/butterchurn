#!/usr/bin/env node

/**
 * Butterchurn Preset Fingerprint Generator
 *
 * This script analyzes preset equations to generate deterministic fingerprints
 * without any audio testing. It creates 8-character content hashes and
 * deduplicates presets based on their actual mathematics.
 *
 * Usage: node generate-fingerprints.js [--input ./presets] [--output ./fingerprints.json]
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Phase 1+: Taxonomy modules
import { deriveEnergyLabel } from '../src/taxonomy/energyLabel.js';
import { deriveMusicalResponsiveness } from '../src/taxonomy/musicalResponsiveness.js';
import { deriveReliabilityTier } from '../src/taxonomy/reliability.js';
import { analyzePresetColor } from '../src/taxonomy/colorAnalysis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// SUGG-2 FIX: Named constants for complexity analysis
// These coefficients were tuned for good distribution across the preset collection
const COMPLEXITY_WEIGHTS = {
    // Shape/wave contributions
    activeShape: 0.18,       // Contribution per enabled shape
    activeWave: 0.18,        // Contribution per enabled wave

    // Equation length contributions (with max caps)
    pixelEq: {
        minLength: 30,       // Minimum length to consider
        maxContribution: 0.35,
        divisor: 400
    },
    warpEq: {
        minLength: 30,
        maxContribution: 0.30,
        divisor: 500
    },
    compEq: {
        minLength: 30,
        maxContribution: 0.25,
        divisor: 600
    },
    frameEq: {
        minLength: 50,
        maxContribution: 0.20,
        divisor: 700
    },

    // Math operation contributions
    complexOp: {
        contribution: 0.03,  // Per operation
        maxContribution: 0.4
    },

    // Fractal pattern boosts
    fractalBoost: {
        strong: 0.30,        // Zoom + rot + (high decay OR trig in pixel)
        weak: 0.15           // Just zoom + rot
    },

    // Overall cap
    maxComplexity: 1.0
};

class PresetFingerprintGenerator {
    constructor() {
        this.baseDir = null;  // Store base directory for relative path conversion
        this.stats = {
            totalFiles: 0,
            uniquePresets: 0,
            duplicatesFound: 0,
            authorsIdentified: new Set(),
            failedFiles: []
        };

        this.database = {
            // Phase 0: Bump to v2.2.0 to match alaska-butter schema
            // Includes all v2.0+ fields: visualStyle, colorProfile, moodAffinities, optimalBpm
            version: "2.2.0",
            generated: new Date().toISOString(),
            presets: {},
            indices: {
                // Legacy keys (kept for backward compat with existing selector code)
                high: [],
                bass: [],
                calm: [],
                particle: [],
                fractal: [],
                geometric: [],
                organic: [],

                // Phase 6: New v2.2+ index keys for Stage 1 categorical filtering
                energyLabel: {
                    calm: [], flowing: [], dynamic: [], energetic: [], intense: [], explosive: []
                },
                visualStyle: {
                    fluid_organic: [], particle: [], geometric: [], fractal: [],
                    abstract: [], kaleidoscope: [], tunnel: [], waveform: []
                },
                musicalResponsiveness: {
                    spectral_analysis: [], beat_detection: [], volume_reactive: [],
                    time_only: [], basic_audio: []
                },
                reliabilityTier: {
                    rock_solid: [], stable: [], finicky: [], experimental: []
                },
                dominantHue: {
                    warm: [], cool: [], natural: [], neutral: [], rainbow: []
                }
            },
            authorIndex: {},
            nameIndex: {}
        };
    }

    /**
     * Generate content-based hash from preset equations
     * This ensures identical presets get the same hash regardless of name/author
     */
    generateContentHash(preset) {
        // Collect all equation strings - handle both _eel and _str formats
        const equations = [
            preset.init_eqs_str || preset.init_eqs_eel || '',
            preset.frame_eqs_str || preset.frame_eqs_eel || '',
            preset.pixel_eqs_str || preset.pixel_eqs_eel || '',
            preset.warp_eqs_str || preset.warp?.eel || '',
            preset.comp_eqs_str || preset.comp?.eel || '',
            // Include base values that affect rendering
            JSON.stringify(this.sortObject(preset.baseVals || {})),
            // Include shapes and waves configuration
            JSON.stringify((preset.shapes || []).map(s => this.sortObject(s))),
            JSON.stringify((preset.waves || []).map(w => this.sortObject(w)))
        ].join('|');

        // Generate SHA256 hash and take first 8 characters
        return crypto.createHash('sha256')
            .update(equations)
            .digest('hex')
            .substring(0, 8);
    }

    /**
     * Sort object keys for consistent hashing
     */
    sortObject(obj) {
        if (!obj || typeof obj !== 'object') return obj;

        return Object.keys(obj)
            .sort()
            .reduce((sorted, key) => {
                sorted[key] = obj[key];
                return sorted;
            }, {});
    }

    /**
     * Extract author from preset name using common patterns
     */
    extractAuthor(presetName) {
        if (!presetName) return 'unknown';

        // Common patterns in MilkDrop preset names
        const patterns = [
            /^([^-+]+?)\s*[-+]/,           // "Author - Title" or "Author + Title"
            /^(\w+\.\w+\.?\w*)/,           // "Eo.S." style
            /^\[([^\]]+)\]/,               // "[Author] Title"
            /^([^_]+?)_/,                  // "Author_Title"
            /^(\$+\s*\w+)/,                // "$$$ Royal" style
        ];

        for (const pattern of patterns) {
            const match = presetName.match(pattern);
            if (match) {
                return match[1].trim();
            }
        }

        // If no pattern matches, try to extract first word
        const firstWord = presetName.split(/[\s\-_+]/)[0];
        return firstWord || 'unknown';
    }

    /**
     * Calculate warmup time needed for preset to become visible
     */
    calculateWarmupTime(preset) {
        let warmupSeconds = 0;

        // High decay = needs time to build up trails
        if (preset.baseVals?.decay) {
            if (preset.baseVals.decay > 0.98) warmupSeconds += 3;
            else if (preset.baseVals.decay > 0.96) warmupSeconds += 2;
            else if (preset.baseVals.decay > 0.94) warmupSeconds += 1;
        }

        // Echo effects need time to propagate
        if (preset.baseVals?.echo_alpha && preset.baseVals.echo_alpha > 0.5) {
            warmupSeconds += 2;
        }

        // Invert effects often start from black
        if (preset.baseVals?.invert && preset.baseVals.invert > 0) {
            warmupSeconds += 1;
        }

        // Check for accumulation patterns in equations
        const allEqs = this.getAllEquations(preset);
        if (allEqs.includes('old_') || allEqs.includes('prev_')) {
            warmupSeconds += 2; // Uses previous frame data
        }

        // Gamma/brightness adjustments might start dark
        if (preset.baseVals?.gamma && preset.baseVals.gamma < 0.5) {
            warmupSeconds += 2;
        }

        return warmupSeconds;
    }

    /**
     * Analyze energy level from equations
     */
    analyzeEnergy(preset) {
        let score = 0.5; // Start neutral

        // Check decay rate (higher = more trails/energy)
        if (preset.baseVals?.decay) {
            if (preset.baseVals.decay > 0.98) score += 0.2;
            else if (preset.baseVals.decay > 0.96) score += 0.1;
            else if (preset.baseVals.decay < 0.94) score -= 0.2;
        }

        // Check for zoom effects (indicates motion)
        const allEqs = this.getAllEquations(preset);
        if (allEqs.includes('zoom')) {
            const zoomCount = (allEqs.match(/zoom/g) || []).length;
            score += Math.min(0.2, zoomCount * 0.05);
        }

        // Check for rotation (indicates spinning/movement)
        if (allEqs.includes('rot')) {
            const rotCount = (allEqs.match(/rot/g) || []).length;
            score += Math.min(0.2, rotCount * 0.05);
        }

        // Check wave amplitude
        if (preset.baseVals?.wave_a) {
            if (preset.baseVals.wave_a > 0.8) score += 0.15;
            else if (preset.baseVals.wave_a < 0.3) score -= 0.15;
        }

        return Math.max(0, Math.min(1, score));
    }

    /**
     * Analyze bass/audio reactivity from variable usage
     */
    analyzeBassReactivity(preset) {
        const audioVars = ['bass', 'bass_att', 'treb', 'treb_att', 'mid', 'mid_att'];
        const allEqs = this.getAllEquations(preset);

        let totalCount = 0;
        for (const varName of audioVars) {
            const regex = new RegExp(`\\b${varName}\\b`, 'g');
            const matches = allEqs.match(regex) || [];
            totalCount += matches.length;
        }

        // Normalize to 0-1 range (10+ mentions = highly reactive)
        return Math.min(1, totalCount / 10);
    }

    /**
     * Analyze treble/high frequency reactivity
     */
    analyzeTrebleReactivity(preset) {
        const trebleVars = ['treb', 'high', 'treble', 'treb_att'];
        const allEqs = this.getAllEquations(preset);

        let totalCount = 0;
        for (const varName of trebleVars) {
            const regex = new RegExp(varName, 'g');
            const matches = allEqs.match(regex) || [];
            totalCount += matches.length;
        }

        // Check for high-frequency responsive patterns
        if (allEqs.includes('treb') && allEqs.includes('zoom')) totalCount += 2;
        if (allEqs.includes('treb') && allEqs.includes('rot')) totalCount += 2;
        if (allEqs.includes('treb_att')) totalCount += 3; // Attenuated treble is more sophisticated

        // Normalize to 0-1 range (8+ mentions = highly reactive)
        return Math.min(1, totalCount / 8);
    }

    /**
     * Detect beat synchronization patterns
     */
    analyzeBeatSync(preset) {
        const beatVars = ['beat', 'is_beat', 'bnot'];
        const allEqs = this.getAllEquations(preset);

        let beatScore = 0;
        for (const varName of beatVars) {
            if (allEqs.includes(varName)) {
                beatScore += 0.3;
            }
        }

        // Check for beat-triggered effects
        if (allEqs.includes('beat') && allEqs.includes('zoom')) beatScore += 0.2;
        if (allEqs.includes('beat') && allEqs.includes('rot')) beatScore += 0.2;

        return Math.min(1, beatScore);
    }

    /**
     * Analyze visual complexity
     * EXT-2/FRC-3: Enhanced scaling to allow complexity > 0.5 threshold
     * SUGG-2 FIX: Uses COMPLEXITY_WEIGHTS constants for tunable values
     */
    analyzeComplexity(preset) {
        let complexity = 0;

        // TWIN-11/EXT-2: Shape and wave contributions
        const activeShapes = (preset.shapes || []).filter(s => s.enabled).length;
        complexity += activeShapes * COMPLEXITY_WEIGHTS.activeShape;

        const activeWaves = (preset.waves || []).filter(w => w.enabled).length;
        complexity += activeWaves * COMPLEXITY_WEIGHTS.activeWave;

        // Equation length contributes more granularly
        const pixelEqs = preset.pixel_eqs_str || '';
        const warpEqs = preset.warp_eqs_str || '';
        const compEqs = preset.comp_eqs_str || '';
        const frameEqs = preset.frame_eqs_str || preset.frame_eqs_eel || '';

        // EXT-2: Equation length contributions with configurable weights
        if (pixelEqs.length > COMPLEXITY_WEIGHTS.pixelEq.minLength) {
            complexity += Math.min(
                COMPLEXITY_WEIGHTS.pixelEq.maxContribution,
                pixelEqs.length / COMPLEXITY_WEIGHTS.pixelEq.divisor
            );
        }
        if (warpEqs.length > COMPLEXITY_WEIGHTS.warpEq.minLength) {
            complexity += Math.min(
                COMPLEXITY_WEIGHTS.warpEq.maxContribution,
                warpEqs.length / COMPLEXITY_WEIGHTS.warpEq.divisor
            );
        }
        if (compEqs.length > COMPLEXITY_WEIGHTS.compEq.minLength) {
            complexity += Math.min(
                COMPLEXITY_WEIGHTS.compEq.maxContribution,
                compEqs.length / COMPLEXITY_WEIGHTS.compEq.divisor
            );
        }
        if (frameEqs.length > COMPLEXITY_WEIGHTS.frameEq.minLength) {
            complexity += Math.min(
                COMPLEXITY_WEIGHTS.frameEq.maxContribution,
                frameEqs.length / COMPLEXITY_WEIGHTS.frameEq.divisor
            );
        }

        // Check for complex mathematical operations - count occurrences
        const allEqs = this.getAllEquations(preset);
        const complexOps = ['sin', 'cos', 'tan', 'atan', 'sqrt', 'pow', 'exp', 'log', 'abs'];
        let opCount = 0;
        for (const op of complexOps) {
            const matches = allEqs.match(new RegExp(op, 'g'));
            if (matches) opCount += matches.length;
        }
        // More ops = more complexity, with diminishing returns
        complexity += Math.min(
            COMPLEXITY_WEIGHTS.complexOp.maxContribution,
            opCount * COMPLEXITY_WEIGHTS.complexOp.contribution
        );

        // PRE-8 ENHANCEMENT: More specific fractal detection
        const baseVals = preset.baseVals || {};

        // Fractal-like patterns: zoom + rot + (high decay OR trig functions in pixel eqs)
        const hasZoomRot = allEqs.includes('zoom') && allEqs.includes('rot');
        const hasHighDecay = (baseVals.decay || 0) > 0.95;
        const hasTrigInPixel = /\b(sin|cos|tan)\b/.test(pixelEqs);

        if (hasZoomRot && (hasHighDecay || hasTrigInPixel)) {
            complexity += COMPLEXITY_WEIGHTS.fractalBoost.strong;  // FRC-3: Strong fractal boost
        } else if (hasZoomRot) {
            complexity += COMPLEXITY_WEIGHTS.fractalBoost.weak;    // Weak fractal boost
        }

        return Math.min(COMPLEXITY_WEIGHTS.maxComplexity, complexity);
    }

    /**
     * Estimate performance based on equation complexity
     */
    estimatePerformance(preset) {
        let cost = 0;

        // Pixel shaders are expensive
        if (preset.pixel_eqs_str) {
            cost += preset.pixel_eqs_str.length / 10;
        }

        // Warp effects are expensive
        if (preset.warp_eqs_str) {
            cost += preset.warp_eqs_str.length / 15;
            if (preset.warp_eqs_str.includes('sin') || preset.warp_eqs_str.includes('cos')) {
                cost += 10;
            }
        }

        // Multiple shapes with additive blending
        const shapes = preset.shapes || [];
        cost += shapes.filter(s => s.enabled && s.additive).length * 5;

        // Spectrum analysis costs more than waveform
        const waves = preset.waves || [];
        cost += waves.filter(w => w.enabled && w.spectrum).length * 3;

        // Convert cost to estimated FPS (lower cost = higher FPS)
        const estimatedFPS = Math.max(20, Math.min(60, 60 - cost));
        return estimatedFPS;
    }

    /**
     * Detect visual style from patterns
     * TWIN-10 FIX: Updated signature to accept presetName as explicit parameter
     * ABS-2: Enhanced with keyword-based detection
     */
    detectVisualStyle(preset, presetName = '') {
        const styles = [];
        const allEqs = this.getAllEquations(preset);
        // TWIN-10: Use passed presetName or fallback to preset.name
        const name = (presetName || preset.name || '').toLowerCase();

        // ABS-2: Keyword-based detection (checked first for better classification)
        // PRE-6 FIX: Use word boundary regex to avoid false positives
        const fractalKeywords = ['fractal', 'spiral', 'mandala', 'zoom', 'iteration'];
        const particleKeywords = ['particle', 'spark', 'star', 'dot', 'pixel', 'sperm'];
        const organicKeywords = ['plasma', 'liquid', 'fluid', 'flow', 'wave', 'ocean'];

        const matchesKeyword = (keywords) =>
            keywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(name));

        if (matchesKeyword(fractalKeywords)) {
            styles.push('fractal');
        }
        if (matchesKeyword(particleKeywords)) {
            styles.push('particle');
        }
        if (matchesKeyword(organicKeywords)) {
            styles.push('organic');
        }

        // Particle system detection (equation-based)
        const shapes = preset.shapes || [];
        if (!styles.includes('particle') &&
            shapes.filter(s => s.enabled && s.additive && s.rad < 0.2).length >= 2) {
            styles.push('particle');
        }

        // Fractal detection (equation-based)
        if (!styles.includes('fractal') &&
            allEqs.includes('zoom') && allEqs.includes('rot') &&
            (allEqs.includes('sin') || allEqs.includes('cos'))) {
            if (preset.baseVals?.decay > 0.96) {
                styles.push('fractal');
            }
        }

        // Geometric detection
        if (shapes.filter(s => s.enabled && s.sides > 3).length > 0) {
            styles.push('geometric');
        }

        // Organic/fluid detection (equation-based)
        if (!styles.includes('organic') &&
            (allEqs.includes('warp') || allEqs.includes('dx') || allEqs.includes('dy'))) {
            if (!styles.includes('geometric')) {
                styles.push('organic');
            }
        }

        return styles;
    }

    /**
     * Get all equations as a single lowercase string for analysis
     * DOC-2 FIX: Added complete JSDoc documentation
     *
     * Concatenates all equation types from a preset into a single string
     * for pattern matching and keyword detection.
     *
     * @param {Object} preset - Butterchurn preset object
     * @param {string} [preset.init_eqs_str] - Initialization equations (string format)
     * @param {string} [preset.init_eqs_eel] - Initialization equations (EEL format)
     * @param {string} [preset.frame_eqs_str] - Per-frame equations (string format)
     * @param {string} [preset.frame_eqs_eel] - Per-frame equations (EEL format)
     * @param {string} [preset.pixel_eqs_str] - Per-pixel equations (string format)
     * @param {string} [preset.pixel_eqs_eel] - Per-pixel equations (EEL format)
     * @param {Object} [preset.warp] - Warp shader configuration
     * @param {Object} [preset.comp] - Composite shader configuration
     * @param {Array} [preset.shapes] - Shape definitions with their equations
     * @returns {string} All equations joined and lowercased for analysis
     */
    getAllEquations(preset) {
        return [
            preset.init_eqs_str || preset.init_eqs_eel || '',
            preset.frame_eqs_str || preset.frame_eqs_eel || '',
            preset.pixel_eqs_str || preset.pixel_eqs_eel || '',
            preset.warp_eqs_str || preset.warp?.eel || '',
            preset.comp_eqs_str || preset.comp?.eel || '',
            // Also include shape equations
            ...(preset.shapes || []).map(s => s.frame_eqs_str || s.frame_eqs_eel || '')
        ].join(' ').toLowerCase();
    }

    // ============================================
    // NEW v2.0 Helper Functions (Phase 5)
    // ============================================

    /**
     * Extract dominant color profile from preset equations and baseVals
     */
    extractColorProfile(preset) {
        const allEqs = this.getAllEquations(preset);
        const baseVals = preset.baseVals || {};

        // Scoring for each color temperature
        let warmScore = 0;
        let coolScore = 0;
        let natureScore = 0;
        let vividScore = 0;

        // Check wave colors (wave_r, wave_g, wave_b)
        const waveR = baseVals.wave_r ?? 0.5;
        const waveG = baseVals.wave_g ?? 0.5;
        const waveB = baseVals.wave_b ?? 0.5;

        if (waveR > 0.6 && waveR > waveG && waveR > waveB) warmScore += 2;
        // CLR-1: Lower threshold for cool detection (was > 0.6)
        if (waveB > 0.45 && waveB > waveR) coolScore += 2;  // Blue dominates red = cool
        if (waveB > 0.5 && waveB > waveG) coolScore += 1;  // Extra for blue > green
        if (waveG > 0.6 && waveG > waveR && waveG > waveB) natureScore += 2;

        // CLR-2: Add purple/violet detection (maps to cool)
        if (waveB > 0.4 && waveR > 0.3 && waveG < 0.4) coolScore += 2;  // Purple/violet

        // Check for high saturation patterns (vivid colors)
        const colorRange = Math.max(waveR, waveG, waveB) - Math.min(waveR, waveG, waveB);
        if (colorRange > 0.4) vividScore += 2;

        // Analyze shape colors
        (preset.shapes || []).forEach(shape => {
            if (!shape.enabled) return;
            const r = shape.r ?? 0.5;
            const g = shape.g ?? 0.5;
            const b = shape.b ?? 0.5;

            if (r > 0.6 && r > g && r > b) warmScore += 1;
            if (b > 0.6 && b > r && b > g) coolScore += 1;
            if (g > 0.6 && g > r && g > b) natureScore += 1;

            // Check for orange/yellow (warm)
            if (r > 0.7 && g > 0.4 && g < 0.8 && b < 0.4) warmScore += 1;
            // Check for cyan/teal (cool)
            if (b > 0.5 && g > 0.5 && r < 0.4) coolScore += 1;
        });

        // Check equations for color manipulation patterns
        // CLR-3: Add yellow/gold to warm detection
        if (allEqs.includes('red') || allEqs.includes('orange') || allEqs.includes('fire') ||
            allEqs.includes('gold') || allEqs.includes('yellow') || allEqs.includes('sun')) warmScore += 1;
        // CLR-2: Add purple/violet to cool detection
        if (allEqs.includes('blue') || allEqs.includes('ice') || allEqs.includes('cold') ||
            allEqs.includes('purple') || allEqs.includes('violet')) coolScore += 1;
        if (allEqs.includes('green') || allEqs.includes('nature') || allEqs.includes('forest')) natureScore += 1;
        if (allEqs.includes('rainbow') || allEqs.includes('hue') || allEqs.includes('hsv')) vividScore += 1;

        // Check gamma and brightness for dark/light profiles
        const gamma = baseVals.gamma ?? 1;
        const brightness = baseVals.brightness ?? 1;
        let isDark = gamma < 0.8 || brightness < 0.8;
        let isBright = gamma > 1.2 || brightness > 1.2;

        // Determine dominant profile
        const scores = { warm: warmScore, cool: coolScore, nature: natureScore, vivid: vividScore };
        const maxScore = Math.max(...Object.values(scores));

        // ABS-1: Lower threshold to reduce neutral dominance (was < 2)
        if (maxScore < 1.5) {
            // No strong color preference
            if (isDark) return 'dark';
            if (isBright) return 'bright';
            return 'neutral';
        }

        // Return the highest scoring profile
        const dominant = Object.entries(scores).find(([_, v]) => v === maxScore)?.[0] || 'neutral';
        return dominant;
    }

    /**
     * Extract motion speed from preset complexity and energy
     */
    extractMotionSpeed(preset, energy) {
        const frameEqs = preset.frame_eqs_eel || preset.frame_eqs_str || '';
        const complexity = frameEqs.length / 1000;

        if (complexity > 5 || energy > 0.7) return 'fast';
        if (complexity > 2 || energy > 0.4) return 'medium';
        return 'slow';
    }

    /**
     * Calculate optimal BPM range based on motion speed and energy
     */
    calculateOptimalBpm(motionSpeed, energy) {
        const ranges = {
            slow: { min: 60, max: 100, ideal: 80 },
            medium: { min: 100, max: 140, ideal: 120 },
            fast: { min: 130, max: 180, ideal: 150 }
        };

        const base = ranges[motionSpeed] || ranges.medium;
        const energyOffset = (energy - 0.5) * 20;

        return {
            min: Math.round(base.min + energyOffset),
            max: Math.round(base.max + energyOffset),
            ideal: Math.round(base.ideal + energyOffset)
        };
    }

    /**
     * Derive mood affinities from visual style, motion, color, and energy
     */
    deriveMoodAffinities(visualStyle, motionSpeed, colorProfile, energy = 0.5, beatSync = 0.5) {
        const affinities = {
            aggressive: 0.5,
            relaxed: 0.5,
            happy: 0.5,
            electronic: 0.5,
            acoustic: 0.5,
            // FRC-1: New v2.1 moods for expanded vocabulary
            // PRE-4: Forward-compatible - runtime detection is future work
            mystical: 0.5,
            hypnotic: 0.5,
            psychedelic: 0.5,
            dreamy: 0.5,
            meditative: 0.5
        };

        // Style influences
        // FRC-2: Updated fractal boosts to reduce aggressive and add new mood types
        const styleBoosts = {
            fluid_organic: { relaxed: 0.3, acoustic: 0.2, dreamy: 0.2 },
            organic: { relaxed: 0.25, acoustic: 0.2, happy: 0.1, meditative: 0.15 },
            particle: { electronic: 0.4, happy: 0.2, psychedelic: 0.15 },
            geometric: { electronic: 0.3, aggressive: 0.1, hypnotic: 0.1 },
            fractal: {
                // FRC-2: Fractal-specific mood profile
                hypnotic: 0.4,
                mystical: 0.3,
                aggressive: -0.3,  // REDUCE aggressive for fractals
                relaxed: 0.2,
                meditative: 0.2
            },
            tunnel: { aggressive: 0.2, electronic: 0.3, hypnotic: 0.25 },
            abstract: { electronic: 0.15, psychedelic: 0.1 }
        };

        // Apply style-based boosts for primary style
        const primaryStyle = Array.isArray(visualStyle) ? visualStyle[0] : visualStyle;
        if (primaryStyle && styleBoosts[primaryStyle]) {
            for (const [mood, boost] of Object.entries(styleBoosts[primaryStyle])) {
                // TWIN-4 FIX: Add floor check to handle negative boosts
                affinities[mood] = Math.max(0, Math.min(1, affinities[mood] + boost));
            }
        }

        // Motion speed influences
        if (motionSpeed === 'fast') {
            affinities.aggressive += 0.2;
            affinities.relaxed -= 0.2;
            affinities.happy += 0.1;  // Fast motion can be energizing/happy
            affinities.electronic += 0.1;
            affinities.psychedelic += 0.1;  // Fast motion can feel trippy
        } else if (motionSpeed === 'slow') {
            affinities.relaxed += 0.2;
            affinities.aggressive -= 0.2;
            affinities.acoustic += 0.15;
            affinities.dreamy += 0.2;  // Slow motion feels dreamlike
            affinities.meditative += 0.15;
        } else if (motionSpeed === 'medium') {
            affinities.happy += 0.1;  // Medium pace is often pleasant
            affinities.hypnotic += 0.1;  // Steady rhythm
        }

        // Color influences (expanded with new moods)
        switch (colorProfile) {
            case 'warm':
                affinities.aggressive += 0.1;
                affinities.happy += 0.2;  // Warm colors feel happier
                break;
            case 'cool':
                affinities.relaxed += 0.15;
                affinities.electronic += 0.15;
                affinities.mystical += 0.2;  // Cool colors feel mystical
                affinities.dreamy += 0.15;
                break;
            case 'nature':
                affinities.relaxed += 0.2;
                affinities.acoustic += 0.2;
                affinities.happy += 0.15;  // Nature colors feel pleasant
                affinities.meditative += 0.15;
                break;
            case 'vivid':
                affinities.happy += 0.25;  // Vivid/rainbow is inherently happy
                affinities.electronic += 0.15;
                affinities.psychedelic += 0.3;  // Vivid colors are psychedelic
                break;
            case 'bright':
                affinities.happy += 0.2;
                affinities.relaxed += 0.1;
                affinities.dreamy += 0.1;
                break;
            case 'dark':
                affinities.aggressive += 0.15;
                affinities.relaxed -= 0.1;
                affinities.acoustic += 0.1;  // Dark can be intimate
                affinities.mystical += 0.25;  // Dark feels mystical
                affinities.hypnotic += 0.15;
                break;
        }

        // Energy-based adjustments
        if (energy > 0.7) {
            affinities.aggressive += 0.15;
            affinities.electronic += 0.1;
            affinities.happy += 0.1;
            affinities.psychedelic += 0.1;
        } else if (energy < 0.3) {
            affinities.relaxed += 0.2;
            affinities.acoustic += 0.15;
            affinities.dreamy += 0.2;
            affinities.meditative += 0.2;
        }

        // Beat sync influences (strong beat = more electronic/aggressive)
        if (beatSync > 0.7) {
            affinities.electronic += 0.15;
            affinities.aggressive += 0.1;
            affinities.hypnotic += 0.15;  // Strong beat can be hypnotic
        } else if (beatSync < 0.3) {
            affinities.acoustic += 0.1;
            affinities.relaxed += 0.1;
            affinities.dreamy += 0.15;
            affinities.meditative += 0.1;
        }

        // MOD-1: Energy-relaxed cross-validation
        // High energy should reduce relaxed mood
        if (energy > 0.6) {
            affinities.relaxed -= 0.15;
        }

        // Prevent contradictions: aggressive + relaxed both > 0.7
        if (affinities.aggressive > 0.7 && affinities.relaxed > 0.7) {
            if (energy > 0.5) {
                affinities.relaxed -= 0.25;
            } else {
                affinities.aggressive -= 0.25;
            }
        }

        // ABS-3: Add more variation to abstract presets
        // Use energy to create mood variation for abstract style
        // Note: primaryStyle is already defined above (line 571)
        if (primaryStyle === 'abstract') {
            // Use energy deviation from 0.5 to add variation
            const variation = (energy - 0.5) * 0.2;
            affinities.happy += variation;
            affinities.electronic += variation;
            affinities.psychedelic += Math.abs(variation);  // Always add some psychedelic for abstract
        }

        // ORG-1/ORG-3: Style-aware mood caps for organic presets
        // Check if primary style is organic-like
        if (primaryStyle === 'organic' || primaryStyle === 'fluid_organic') {
            // PRE-7 FIX: Directly enforce acoustic > electronic relationship
            if (affinities.electronic > affinities.acoustic) {
                const avg = (affinities.electronic + affinities.acoustic) / 2;
                affinities.acoustic = Math.min(1, avg + 0.1);
                affinities.electronic = Math.max(0, avg - 0.1);
            }
            // ORG-3: Cap aggressive at 0.75 for organic
            affinities.aggressive = Math.min(affinities.aggressive, 0.75);
            // Ensure relaxed floor for organic
            affinities.relaxed = Math.max(affinities.relaxed, 0.5);
        }

        // Normalize to 2 decimal places
        // Phase 0.1 FIX: Emit numbers, not strings — parseFloat undoes toFixed's string output
        return Object.fromEntries(
            Object.entries(affinities).map(([k, v]) => [k, Number(Math.max(0, Math.min(1, v)).toFixed(2))])
        );
    }

    /**
     * Generate complete fingerprint for a preset
     * Enhanced with v2.0 fields (Phase 5)
     * @param {Object} preset - The preset object
     * @param {string} presetName - The preset name (for keyword detection)
     * @param {Object} visualStyleFromCLIP - Optional CLIP classification results
     */
    generateFingerprint(preset, presetName = '', visualStyleFromCLIP = null) {
        // EXISTING: Keep all original analysis
        const energy = this.analyzeEnergy(preset);
        const bassEnergy = this.analyzeBassReactivity(preset);
        const trebleEnergy = this.analyzeTrebleReactivity ? this.analyzeTrebleReactivity(preset) : 0.5;

        // NEW: Extract additional characteristics
        const colorProfile = this.extractColorProfile(preset);
        const motionSpeed = this.extractMotionSpeed(preset, energy);
        const optimalBpm = this.calculateOptimalBpm(motionSpeed, energy);

        // Determine visual style (prefer CLIP result if available)
        // TWIN-10: Pass presetName for keyword-based detection
        const existingStyles = this.detectVisualStyle(preset, presetName);

        // ORG-4: Add psychedelic style for vivid + high energy presets
        if (colorProfile === 'vivid' && energy > 0.7 && !existingStyles.includes('psychedelic')) {
            existingStyles.push('psychedelic');
        }

        const visualStyle = visualStyleFromCLIP?.visualStyle || existingStyles[0] || 'abstract';
        const visualStyleScores = visualStyleFromCLIP?.visualStyleScores || null;

        // Analyze beat sync for mood derivation
        const beatSync = this.analyzeBeatSync(preset);

        // Derive mood affinities from characteristics (pass all relevant factors)
        const moodAffinities = this.deriveMoodAffinities(visualStyle, motionSpeed, colorProfile, energy, beatSync);

        // Phase 3: Compute complexity and warmup for reliability tier
        const complexity = this.analyzeComplexity(preset);
        const warmupTime = this.calculateWarmupTime(preset);
        const reliabilityTier = deriveReliabilityTier({ complexity, warmupTime }, preset);

        return {
            // EXISTING v1.0 fields (keep all - backward compat):
            energy: energy,
            bassEnergy: bassEnergy,         // Changed from "bass" for clarity
            bass: bassEnergy,               // Keep "bass" for backward compat
            trebleEnergy: trebleEnergy,
            complexity: complexity,
            beatSync: beatSync,
            beat: beatSync,  // Keep "beat" for backward compat
            fps: this.estimatePerformance(preset),
            styles: existingStyles,          // Keep for backward compat
            warmupTime: warmupTime,

            // NEW v2.0 fields:
            visualStyle: visualStyle,
            visualStyleScores: visualStyleScores,
            colorProfile: colorProfile,
            motionSpeed: motionSpeed,
            moodAffinities: moodAffinities,
            optimalBpm: optimalBpm,

            // Phase 1: Derived energy label for indexing/UI (float is source of truth)
            energyLabel: deriveEnergyLabel(energy),

            // Phase 2: Musical responsiveness derived from audio reactivity fields
            musicalResponsiveness: deriveMusicalResponsiveness({ bassEnergy, trebleEnergy, beatSync }),

            // Phase 3: Reliability tier from complexity heuristics (not fps)
            reliabilityTier: reliabilityTier,

            // Phase 7: Extended color taxonomy (4 flat fields)
            // Supplements existing colorProfile with finer granularity
            ...analyzePresetColor(preset),

            // CRIT-8 FIX: Mark heuristic-based fields as experimental
            // These should be validated before use in scoring
            _experimental: [
                'colorProfile', 'motionSpeed', 'moodAffinities',
                'energyLabel', 'musicalResponsiveness', 'reliabilityTier',
                'colorPaletteType', 'dominantHue', 'brightness', 'colorComplexity'
            ]

            // CRIT-7 FIX: REMOVED spectralProfile
            // Presets don't have intrinsic spectral profiles - meaningless to add defaults
        };
    }

    /**
     * Convert absolute path to relative path from base directory
     */
    getRelativePath(filePath) {
        if (!this.baseDir) {
            return filePath; // Fallback to absolute if no base dir set
        }
        return path.relative(this.baseDir, filePath);
    }

    /**
     * Process a single preset file
     */
    async processPresetFile(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const preset = JSON.parse(content);

            // Get preset name from file or internal name
            const fileName = path.basename(filePath, path.extname(filePath));
            const presetName = preset.name || fileName;

            // Generate content hash
            const hash = this.generateContentHash(preset);
            const author = this.extractAuthor(presetName);

            this.stats.totalFiles++;
            this.stats.authorsIdentified.add(author);

            // Check if we've seen this hash before (duplicate detection)
            if (!this.database.presets[hash]) {
                // New unique preset
                this.database.presets[hash] = {
                    hash: hash,
                    authors: [author],
                    names: [presetName],
                    firstSeen: author,
                    // TWIN-10: Pass presetName for keyword-based visual style detection
                    fingerprint: this.generateFingerprint(preset, presetName),
                    files: [this.getRelativePath(filePath)]
                };

                this.stats.uniquePresets++;

                // Add to name index
                this.database.nameIndex[presetName] = hash;

                console.log(`✅ ${hash} - ${presetName.substring(0, 50)}${presetName.length > 50 ? '...' : ''}`);
            } else {
                // Duplicate found!
                const existing = this.database.presets[hash];

                if (!existing.authors.includes(author)) {
                    existing.authors.push(author);
                }

                if (!existing.names.includes(presetName)) {
                    existing.names.push(presetName);
                    this.database.nameIndex[presetName] = hash;
                }

                existing.files.push(this.getRelativePath(filePath));
                this.stats.duplicatesFound++;

                console.log(`♻️  ${hash} - Duplicate of "${existing.names[0].substring(0, 30)}..."`);
            }

            // Update author index
            if (!this.database.authorIndex[author]) {
                this.database.authorIndex[author] = [];
            }
            if (!this.database.authorIndex[author].includes(hash)) {
                this.database.authorIndex[author].push(hash);
            }

        } catch (error) {
            console.error(`❌ Failed to process ${filePath}:`, error.message);
            this.stats.failedFiles.push(filePath);
        }
    }

    /**
     * Build category indices based on fingerprints
     * Phase 6: Extended with v2.2+ index keys for Stage 1 categorical filtering
     */
    buildIndices() {
        for (const [hash, data] of Object.entries(this.database.presets)) {
            const fp = data.fingerprint;

            // Legacy indices (backward compat)
            if (fp.energy > 0.7) this.database.indices.high.push(hash);
            else if (fp.energy < 0.3) this.database.indices.calm.push(hash);

            if ((fp.bass || fp.bassEnergy || 0) > 0.6) this.database.indices.bass.push(hash);

            if (fp.styles) {
                if (fp.styles.includes('particle')) this.database.indices.particle.push(hash);
                if (fp.styles.includes('fractal')) this.database.indices.fractal.push(hash);
                if (fp.styles.includes('geometric')) this.database.indices.geometric.push(hash);
                if (fp.styles.includes('organic')) this.database.indices.organic.push(hash);
            }

            // Phase 6: v2.2+ categorical indices
            // energyLabel index
            if (fp.energyLabel && this.database.indices.energyLabel[fp.energyLabel]) {
                this.database.indices.energyLabel[fp.energyLabel].push(hash);
            }

            // visualStyle index
            if (fp.visualStyle && this.database.indices.visualStyle[fp.visualStyle]) {
                this.database.indices.visualStyle[fp.visualStyle].push(hash);
            }

            // musicalResponsiveness index
            if (fp.musicalResponsiveness && this.database.indices.musicalResponsiveness[fp.musicalResponsiveness]) {
                this.database.indices.musicalResponsiveness[fp.musicalResponsiveness].push(hash);
            }

            // reliabilityTier index
            if (fp.reliabilityTier && this.database.indices.reliabilityTier[fp.reliabilityTier]) {
                this.database.indices.reliabilityTier[fp.reliabilityTier].push(hash);
            }

            // dominantHue index
            if (fp.dominantHue && this.database.indices.dominantHue[fp.dominantHue]) {
                this.database.indices.dominantHue[fp.dominantHue].push(hash);
            }
        }
    }

    /**
     * Find all preset files recursively
     */
    async findPresetFiles(dir) {
        const files = [];
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                // Recurse into subdirectories
                const subFiles = await this.findPresetFiles(fullPath);
                files.push(...subFiles);
            } else if (entry.name.endsWith('.json') || entry.name.endsWith('.milk')) {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Generate fingerprints for all presets in a JSON file
     */
    async generateForJSONFile(jsonFile, options = {}) {
        console.log(`\n🔍 Processing JSON file: ${jsonFile}\n`);

        // Read the JSON file
        const jsonContent = await fs.readFile(jsonFile, 'utf8');
        const presets = JSON.parse(jsonContent);

        console.log(`📁 Found ${Object.keys(presets).length} presets in JSON file\n`);

        // Process each preset
        for (const [presetName, presetContent] of Object.entries(presets)) {
            try {
                // Parse the preset content if it's a string
                const presetData = typeof presetContent === 'string'
                    ? JSON.parse(presetContent)
                    : presetContent;

                // Generate hash
                const hash = this.generateContentHash(presetData);

                // Extract author from name
                const author = this.extractAuthor(presetName);
                this.stats.authorsIdentified.add(author);

                // Check if we've seen this hash before
                if (this.database.presets[hash]) {
                    // It's a duplicate
                    this.stats.duplicatesFound++;

                    // Add this as an alternate name
                    if (!this.database.presets[hash].names.includes(presetName)) {
                        this.database.presets[hash].names.push(presetName);
                        // Add to name index for this duplicate name too
                        this.database.nameIndex[presetName] = hash;
                    }

                    // Add author if not already included
                    if (!this.database.presets[hash].authors.includes(author)) {
                        this.database.presets[hash].authors.push(author);
                    }
                } else {
                    // New unique preset
                    this.stats.uniquePresets++;

                    // Phase 0 FIX: Use full generateFingerprint() with v2.0+ fields
                    // Previously used a simplified fingerprint missing visualStyle, colorProfile, etc.
                    const fingerprint = this.generateFingerprint(presetData, presetName);

                    // Store in database
                    this.database.presets[hash] = {
                        hash: hash,  // Include hash in preset object for consistency with directory mode
                        authors: [author],
                        names: [presetName],
                        firstSeen: author,
                        fingerprint,
                        pack: path.basename(jsonFile, '.json')
                    };

                    // Add to name index
                    this.database.nameIndex[presetName] = hash;

                    // Add to author index
                    if (!this.database.authorIndex[author]) {
                        this.database.authorIndex[author] = [];
                    }
                    if (!this.database.authorIndex[author].includes(hash)) {
                        this.database.authorIndex[author].push(hash);
                    }
                }

                this.stats.totalFiles++;

                // Progress indicator
                if (this.stats.totalFiles % 100 === 0) {
                    process.stdout.write('.');
                }
            } catch (error) {
                console.error(`\n⚠️ Failed to process preset: ${presetName}`);
                console.error(`   Error: ${error.message}`);
                this.stats.failedFiles.push(presetName);
            }
        }

        // Build category indices
        this.buildIndices();

        // Update stats
        this.database.stats = {
            totalFiles: this.stats.totalFiles,
            uniquePresets: this.stats.uniquePresets,
            duplicatesFound: this.stats.duplicatesFound,
            authorsCount: this.stats.authorsIdentified.size,
            failedFiles: this.stats.failedFiles.length
        };

        return this.database;
    }

    /**
     * Generate fingerprints for all presets in a directory
     */
    async generateForDirectory(inputDir, options = {}) {
        console.log(`\n🔍 Scanning for presets in: ${inputDir}\n`);

        // Store base directory for relative path conversion
        this.baseDir = path.resolve(inputDir);

        let presetFiles = await this.findPresetFiles(inputDir);
        console.log(`📁 Found ${presetFiles.length} preset files\n`);

        // Apply limit if specified
        if (options.limit && options.limit > 0) {
            presetFiles = presetFiles.slice(0, options.limit);
            console.log(`📊 Limiting to first ${options.limit} presets\n`);
        }

        // Process each preset
        for (const file of presetFiles) {
            await this.processPresetFile(file);
        }

        // Build category indices
        this.buildIndices();

        // Update stats
        this.database.stats = {
            totalFiles: this.stats.totalFiles,
            uniquePresets: this.stats.uniquePresets,
            duplicatesFound: this.stats.duplicatesFound,
            authorsCount: this.stats.authorsIdentified.size,
            failedFiles: this.stats.failedFiles.length
        };

        return this.database;
    }

    /**
     * Print summary statistics
     */
    printSummary() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 FINGERPRINT GENERATION COMPLETE');
        console.log('='.repeat(60));
        console.log(`Total files processed:  ${this.stats.totalFiles}`);
        console.log(`Unique presets found:   ${this.stats.uniquePresets}`);
        console.log(`Duplicates detected:    ${this.stats.duplicatesFound}`);
        console.log(`Authors identified:     ${this.stats.authorsIdentified.size}`);
        console.log(`Failed files:          ${this.stats.failedFiles.length}`);
        console.log('\n📈 Category Distribution:');
        console.log(`  High Energy:   ${this.database.indices.high.length}`);
        console.log(`  Bass Reactive: ${this.database.indices.bass.length}`);
        console.log(`  Calm:          ${this.database.indices.calm.length}`);
        console.log(`  Particles:     ${this.database.indices.particle.length}`);
        console.log(`  Fractals:      ${this.database.indices.fractal.length}`);
        console.log(`  Geometric:     ${this.database.indices.geometric.length}`);
        console.log(`  Organic:       ${this.database.indices.organic.length}`);

        if (this.stats.duplicatesFound > 0) {
            const dedupePercent = ((this.stats.duplicatesFound / this.stats.totalFiles) * 100).toFixed(1);
            console.log(`\n♻️  Deduplication saved ${dedupePercent}% (${this.stats.duplicatesFound} duplicates)`);
        }
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    let inputDir = '../node_modules/butterchurn-presets/presets';
    let outputFile = '../fingerprints.json';
    let limit = null;

    console.log('Starting fingerprint generator...');
    console.log('Arguments:', args);

    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--input' && args[i + 1]) {
            inputDir = args[i + 1];
            i++;
        } else if (args[i] === '--output' && args[i + 1]) {
            outputFile = args[i + 1];
            i++;
        } else if (args[i] === '--limit' && args[i + 1]) {
            limit = parseInt(args[i + 1], 10);
            i++;
        } else if (args[i] === '--help') {
            console.log('Usage: node generate-fingerprints.js [options]');
            console.log('\nOptions:');
            console.log('  --input <dir>   Input directory containing presets (default: ../node_modules/butterchurn-presets/presets)');
            console.log('  --output <file> Output file for fingerprint database (default: ../fingerprints.json)');
            console.log('  --limit <n>     Process only first N presets (for testing)');
            console.log('  --help          Show this help message');
            process.exit(0);
        }
    }

    // Resolve paths - if relative, resolve from current working directory, not __dirname
    if (!path.isAbsolute(inputDir)) {
        inputDir = path.resolve(process.cwd(), inputDir);
    }
    if (!path.isAbsolute(outputFile)) {
        outputFile = path.resolve(process.cwd(), outputFile);
    }

    // Check if input exists
    try {
        await fs.access(inputDir);
    } catch (error) {
        console.error(`❌ Input not found: ${inputDir}`);
        console.error('Please install butterchurn-presets or specify a valid preset directory or JSON file');
        console.error('Run: npm install butterchurn-presets');
        process.exit(1);
    }

    // Generate fingerprints
    const generator = new PresetFingerprintGenerator();
    let database;

    // Check if input is a JSON file or directory
    const inputStats = await fs.stat(inputDir);
    if (inputStats.isFile() && inputDir.endsWith('.json')) {
        database = await generator.generateForJSONFile(inputDir, { limit });
    } else if (inputStats.isDirectory()) {
        database = await generator.generateForDirectory(inputDir, { limit });
    } else {
        console.error(`❌ Input must be a directory or JSON file: ${inputDir}`);
        process.exit(1);
    }

    // Save database
    await fs.writeFile(outputFile, JSON.stringify(database, null, 2));
    console.log(`\n✅ Fingerprint database saved to: ${outputFile}`);

    // Save compact version for production
    const compactFile = outputFile.replace('.json', '.min.json');
    await fs.writeFile(compactFile, JSON.stringify(database));
    console.log(`✅ Compact database saved to: ${compactFile}`);

    // Print summary
    generator.printSummary();
}

// PRE-2 FIX: Only run CLI when executed directly, not when imported for tests
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}
// TWIN-2 FIX: No additional export needed - default export already exists below.
// Tests should use: import PresetFingerprintGenerator from '../tools/generate-fingerprints.js'

export default PresetFingerprintGenerator;