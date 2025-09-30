/**
 * Dynamic Preset Compatibility Checker
 *
 * Analyzes preset properties in real-time to determine:
 * 1. If presets can safely transition with blending
 * 2. Which transition type would work best
 * 3. Optimal transition duration
 */

export class PresetCompatibilityChecker {
    constructor(options = {}) {
        // Thresholds for detection - based on empirical testing with problematic presets
        this.thresholds = {
            // decay < 0.1: Preset fades to black too quickly for smooth blending
            // These presets will "eat" the previous preset, causing black frames
            minSafeDecay: options.minSafeDecay || 0.1,

            // decay < 0.9: Preset fades fast but not critically - reduce blend time
            // Prevents lingering ghosts from previous preset
            lowDecayWarning: options.lowDecayWarning || 0.9,

            // Alpha variance > 0.5: Preset heavily manipulates transparency
            // Can cause flickering or incorrect blending, force cut transition
            maxAlphaVariance: options.maxAlphaVariance || 0.5,

            ...options.thresholds
        };

        // Cache analyzed presets to avoid re-computation
        this.analysisCache = new Map();
        this.cacheMaxSize = options.cacheMaxSize || 100;
    }

    /**
     * Analyze a preset's compatibility with transitions
     * @returns {Object} Analysis result with recommendations
     */
    analyzePreset(preset) {
        if (!preset) {
            return {
                compatible: true,
                reason: 'No preset provided',
                recommendedTransition: 'default',
                recommendedDuration: 2.5
            };
        }

        // Check cache first
        const cacheKey = this.getPresetCacheKey(preset);
        if (this.analysisCache.has(cacheKey)) {
            return this.analysisCache.get(cacheKey);
        }

        const analysis = {
            compatible: true,
            issues: [],
            recommendedTransition: 'blend',  // default blend
            recommendedDuration: 2.5,        // default 2.5 seconds
            severity: 'safe'                 // safe, warning, incompatible
        };

        // Check 1: Static decay value in baseVals
        if (preset.baseVals) {
            const decay = preset.baseVals.decay;
            if (typeof decay === 'number') {
                if (decay === 0) {
                    analysis.compatible = false;
                    analysis.issues.push('static_decay_zero');
                    analysis.severity = 'incompatible';
                    analysis.recommendedTransition = 'cut';  // Hard cut
                    analysis.recommendedDuration = 0;
                } else if (decay < this.thresholds.minSafeDecay) {
                    // Very low decay needs monitoring but might work with high energy
                    analysis.issues.push('very_low_decay');
                    analysis.severity = 'needs_verification';
                    analysis.recommendedTransition = 'blend';
                    analysis.recommendedDuration = 0.5;  // Very short trial
                    analysis.compatible = true;  // Let it try!
                } else if (decay < this.thresholds.lowDecayWarning) {
                    analysis.issues.push('low_decay');
                    analysis.severity = 'warning';
                    analysis.recommendedDuration = 1.0;  // Shorter blend
                }
            }

            // Check for zero gammaadj which can cause alpha issues
            if (preset.baseVals.gammaadj === 0) {
                analysis.issues.push('zero_gammaadj');
                analysis.severity = 'warning';
                analysis.recommendedDuration = Math.min(analysis.recommendedDuration, 1.0);
            }

            // Check for wave_a = 0 or very low which causes transparency
            if (preset.baseVals.wave_a === 0) {
                analysis.compatible = false;
                analysis.issues.push('static_wave_a_zero');
                analysis.severity = 'incompatible';
                analysis.recommendedTransition = 'cut';
                analysis.recommendedDuration = 0;
            } else if (preset.baseVals.wave_a < 0.01) {
                // Very low wave_a (< 0.01) needs verification during transition
                // These presets often use shapes/shaders instead of waves
                analysis.issues.push('very_low_wave_a');
                analysis.severity = 'needs_verification';
                analysis.recommendedTransition = 'blend';
                analysis.recommendedDuration = 1.0;  // Short trial blend
                analysis.compatible = true;  // Give it a chance!
            }
        }

        // Check 2: Dynamic decay modifications in frame equations
        if (preset.frame_eqs_str && !analysis.issues.includes('static_decay_zero')) {
            const frameEqs = preset.frame_eqs_str;

            // Check for decay being set to 0
            if (/decay\s*=\s*0(?:\.|;|\s|$)/.test(frameEqs)) {
                analysis.compatible = false;
                analysis.issues.push('dynamic_decay_zero');
                analysis.severity = 'incompatible';
                analysis.recommendedTransition = 'cut';
                analysis.recommendedDuration = 0;
            }

            // Check for conditional decay that might become 0
            if (/decay\s*=.*\?.*:\s*0/.test(frameEqs) || /decay\s*=.*\?.*0\s*:/.test(frameEqs)) {
                analysis.compatible = false;
                analysis.issues.push('conditional_decay_zero');
                analysis.severity = 'incompatible';
                analysis.recommendedTransition = 'cut';
                analysis.recommendedDuration = 0;
            }

            // Check for wave_a being set to 0
            if (/wave_a\s*=\s*0(?:\.|;|\s|$)/.test(frameEqs)) {
                analysis.compatible = false;
                analysis.issues.push('dynamic_wave_a_zero');
                analysis.severity = 'incompatible';
                analysis.recommendedTransition = 'cut';
                analysis.recommendedDuration = 0;
            }

            // Check for NaN-producing patterns
            const nanPatterns = [
                { pattern: /\/\s*0(?:\.|;|\s|$)/, issue: 'division_by_zero' },
                { pattern: /sqrt\s*\(\s*-/, issue: 'sqrt_negative' },
                { pattern: /log\s*\(\s*0/, issue: 'log_zero' },
                { pattern: /log\s*\(\s*-/, issue: 'log_negative' },
                { pattern: /treb\s*\/\s*treb(?:\s|;|$)/, issue: 'self_division' },
                { pattern: /bass\s*\/\s*bass(?:\s|;|$)/, issue: 'self_division' }
            ];

            for (const { pattern, issue } of nanPatterns) {
                if (pattern.test(frameEqs)) {
                    analysis.issues.push(issue);
                    if (analysis.severity === 'safe') {
                        analysis.severity = 'warning';
                        analysis.recommendedDuration = Math.min(analysis.recommendedDuration, 1.5);
                    }
                }
            }
        }

        // Check 3: Alpha channel manipulation in composite equations
        if (preset.comp_eqs_str) {
            const compEqs = preset.comp_eqs_str;

            // Check for alpha being set to 0
            if (/alpha\s*=\s*0(?:\.|;|\s|$)/.test(compEqs)) {
                analysis.compatible = false;
                analysis.issues.push('alpha_zero');
                analysis.severity = 'incompatible';
                analysis.recommendedTransition = 'cut';
                analysis.recommendedDuration = 0;
            }

            // Check for any alpha manipulation
            if (/alpha\s*=/.test(compEqs)) {
                analysis.issues.push('alpha_manipulation');
                if (analysis.severity === 'safe') {
                    analysis.severity = 'warning';
                    // For alpha manipulation, prefer wipe transitions
                    analysis.recommendedTransition = 'wipe';
                    analysis.recommendedDuration = Math.min(analysis.recommendedDuration, 1.0);
                }
            }
        }

        // Check 4: Warp shader complexity
        if (preset.warp) {
            const warpComplexity = this.estimateShaderComplexity(preset.warp);
            if (warpComplexity > 100) {
                analysis.issues.push('complex_warp');
                if (analysis.severity === 'safe') {
                    analysis.severity = 'warning';
                    // Complex warps work better with plasma transitions
                    analysis.recommendedTransition = 'plasma';
                }
            }
        }

        // Determine best transition based on accumulated issues
        if (analysis.severity === 'incompatible') {
            analysis.recommendedTransition = 'cut';
            analysis.recommendedDuration = 0;
        } else if (analysis.issues.length > 2) {
            // Multiple issues - use faster transition
            analysis.recommendedDuration = Math.min(analysis.recommendedDuration, 1.0);
        }

        // Cache the analysis
        this.cacheAnalysis(cacheKey, analysis);

        return analysis;
    }

    /**
     * Check compatibility between two presets
     * @returns {Object} Transition recommendation
     */
    checkTransitionCompatibility(fromPreset, toPreset) {
        const fromAnalysis = this.analyzePreset(fromPreset);
        const toAnalysis = this.analyzePreset(toPreset);

        // If either preset is truly incompatible (not just needs_verification), use hard cut
        const fromIncompatible = !fromAnalysis.compatible && fromAnalysis.severity === 'incompatible';
        const toIncompatible = !toAnalysis.compatible && toAnalysis.severity === 'incompatible';

        if (fromIncompatible || toIncompatible) {
            return {
                type: 'cut',
                duration: 0,
                reason: [
                    ...(fromIncompatible ? [`from: ${fromAnalysis.issues.join(', ')}`] : []),
                    ...(toIncompatible ? [`to: ${toAnalysis.issues.join(', ')}`] : [])
                ].join('; ')
            };
        }

        // If either needs verification, use short blend with monitoring
        if (fromAnalysis.severity === 'needs_verification' || toAnalysis.severity === 'needs_verification') {
            const minDuration = Math.min(
                fromAnalysis.recommendedDuration || 2.5,
                toAnalysis.recommendedDuration || 2.5
            );
            return {
                type: 'blend',
                duration: minDuration,
                needsMonitoring: true,
                reason: 'Preset needs verification during transition'
            };
        }

        // Special case: If FROM preset has static_decay_zero or very low decay,
        // always use hard cut even if TO preset is safe
        if (fromAnalysis.issues.includes('static_decay_zero') ||
            fromAnalysis.issues.includes('very_low_decay') ||
            fromAnalysis.issues.includes('conditional_decay_zero')) {
            return {
                type: 'cut',
                duration: 0,
                reason: `from preset has critical issue: ${fromAnalysis.issues.join(', ')}`
            };
        }

        // Both have warnings - use shorter transition
        if (fromAnalysis.severity === 'warning' && toAnalysis.severity === 'warning') {
            return {
                type: 'blend',
                duration: 0.5,
                reason: 'Both presets have minor issues'
            };
        }

        // One has warning - use compromise
        if (fromAnalysis.severity === 'warning' || toAnalysis.severity === 'warning') {
            const warningPreset = fromAnalysis.severity === 'warning' ? fromAnalysis : toAnalysis;
            return {
                type: warningPreset.recommendedTransition,
                duration: Math.min(1.5, warningPreset.recommendedDuration),
                reason: `${fromAnalysis.severity === 'warning' ? 'From' : 'To'} preset has issues: ${warningPreset.issues.join(', ')}`
            };
        }

        // Both safe - use normal transition
        return {
            type: 'blend',
            duration: 2.5,
            reason: 'Both presets are fully compatible'
        };
    }

    /**
     * Estimate shader complexity
     */
    estimateShaderComplexity(shaderCode) {
        if (!shaderCode) return 0;

        let complexity = 0;

        // Count operations
        complexity += (shaderCode.match(/sin|cos|tan/g) || []).length * 2;
        complexity += (shaderCode.match(/sqrt|pow|exp/g) || []).length * 3;
        complexity += (shaderCode.match(/texture2D/g) || []).length * 2;
        complexity += (shaderCode.match(/for\s*\(/g) || []).length * 10;
        complexity += (shaderCode.match(/while\s*\(/g) || []).length * 15;

        return complexity;
    }

    /**
     * Generate cache key for preset
     */
    getPresetCacheKey(preset) {
        if (!preset) return 'null';

        // Use combination of properties for unique key
        const key = [
            preset.name || '',
            (preset.baseVals && preset.baseVals.decay) || 'default',
            (preset.frame_eqs_str && preset.frame_eqs_str.length) || 0,
            (preset.comp_eqs_str && preset.comp_eqs_str.length) || 0
        ].join('|');

        return key;
    }

    /**
     * Cache analysis result
     */
    cacheAnalysis(key, analysis) {
        // Limit cache size
        if (this.analysisCache.size >= this.cacheMaxSize) {
            const firstKey = this.analysisCache.keys().next().value;
            this.analysisCache.delete(firstKey);
        }

        this.analysisCache.set(key, analysis);
    }

    /**
     * Clear analysis cache
     */
    clearCache() {
        this.analysisCache.clear();
    }

    /**
     * Get statistics about analyzed presets
     */
    getStatistics() {
        const stats = {
            totalAnalyzed: this.analysisCache.size,
            incompatible: 0,
            warnings: 0,
            safe: 0,
            issueTypes: {}
        };

        for (const analysis of this.analysisCache.values()) {
            if (analysis.severity === 'incompatible') stats.incompatible++;
            else if (analysis.severity === 'warning') stats.warnings++;
            else stats.safe++;

            for (const issue of analysis.issues) {
                stats.issueTypes[issue] = (stats.issueTypes[issue] || 0) + 1;
            }
        }

        return stats;
    }
}

// Export singleton instance for easy use
export const compatibilityChecker = new PresetCompatibilityChecker();

export default PresetCompatibilityChecker;