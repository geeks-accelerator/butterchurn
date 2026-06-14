/**
 * Hierarchical Matcher
 *
 * Implements two-stage filter+score preset selection:
 * - Stage 1: Categorical filter with progressive relaxation
 * - Stage 2: Continuous scoring for ranking survivors
 *
 * Categorical filter narrows the candidate pool; continuous-feature
 * scoring ranks the survivors. Returns a ranked list for the caller
 * to sample (weighted random, top-1, etc.).
 */

import { tiersAllowedForDevice } from './reliability.js';
import { VISUAL_STYLE_SIMILARITY } from './visualStyleSimilarity.js';
import defaultConfig from '../config/taxonomyConfig.js';

// Default weights sum to 1.0
const DEFAULT_WEIGHTS = {
  energy: 0.18,
  bass: 0.12,
  treble: 0.04,
  beat: 0.08,
  mood: 0.18,
  bpm: 0.12,
  complexity: 0.10,
  visualContinuity: 0.08,
  styleContinuity: 0.05,
  colorSynergy: 0.05
};

export class HierarchicalMatcher {
  /**
   * @param {Object} database - Fingerprint database with presets property
   * @param {Object} options - Configuration options
   */
  constructor(database, options = {}) {
    this.db = database;
    this.categoricalDims = options.categoricalDims || defaultConfig.categoricalDims;
    this.minCandidates = options.minCandidates || defaultConfig.minCandidatesBeforeRelax;
    this.weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
    this.logMatching = options.logMatching || defaultConfig.logHierarchicalMatching;
  }

  /**
   * Find matching presets using two-stage filter+score
   * @param {Object} target - Target features (selector-translated, post-calculateAudioFeatures)
   * @param {Object} options - Match options
   * @returns {Object} Match result with matches, scores, matchDepth, relaxedDimensions
   */
  findMatches(target, options = {}) {
    const {
      limit = 30,
      deviceTier = 'mid_range',
      mood = null,
      detectedBpm = null,
      candidateHashes = null,
      currentHash = null
    } = options;

    let candidates = candidateHashes ?? Object.keys(this.db.presets);
    const currentFp = currentHash ? this.fp(currentHash) : null;

    // Hard constraint: device reliability gate (always applied first, cannot be relaxed)
    const allowedTiers = tiersAllowedForDevice(deviceTier);
    candidates = candidates.filter(hash => {
      const tier = this.fp(hash)?.reliabilityTier;
      // Untagged: assume 'stable' (safe default for legacy v1.0 presets)
      return allowedTiers.includes(tier ?? 'stable');
    });

    // Stage 1: progressive categorical relaxation
    let matchDepth = this.categoricalDims.length;
    let surviving = candidates;

    for (; matchDepth >= 0; matchDepth--) {
      const activeDims = this.categoricalDims.slice(0, matchDepth);
      surviving = this.filterByCategoricals(candidates, target, activeDims);
      if (surviving.length >= this.minCandidates) break;
    }

    // Stage 2: continuous scoring over Stage 1 survivors
    const scored = surviving.map(hash => ({
      hash,
      score: this.scoreContinuous(this.fp(hash), target, mood, detectedBpm, currentFp)
    }));
    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, limit);

    if (this.logMatching) {
      console.log(`[matcher] depth=${matchDepth} relaxed=[${this.categoricalDims.slice(matchDepth).join(',')}] survivors=${surviving.length} top3=[${top.slice(0, 3).map(s => `${s.hash}:${s.score.toFixed(2)}`).join(', ')}]`);
    }

    return {
      matches: top.map(s => s.hash),
      scores: Object.fromEntries(top.map(s => [s.hash, s.score])),
      matchDepth,
      relaxedDimensions: this.categoricalDims.slice(matchDepth),
      stage1Survivors: surviving.length
    };
  }

  /**
   * Filter candidates by categorical dimensions
   * @param {string[]} candidates - Candidate hashes
   * @param {Object} target - Target features
   * @param {string[]} dims - Active categorical dimensions
   * @returns {string[]} Filtered candidates
   */
  filterByCategoricals(candidates, target, dims) {
    if (dims.length === 0) return candidates;

    return candidates.filter(hash => {
      const fp = this.fp(hash);
      if (!fp) return false;

      for (const dim of dims) {
        const targetVal = target[dim];
        if (!targetVal) continue; // no target → don't constrain on this dim

        const presetVal = fp[dim];
        if (presetVal == null) return false; // EXCLUDE untagged from active categoricals

        if (presetVal === targetVal) continue;

        // Soft match for visualStyle (CLIP-grounded similarity)
        if (dim === 'visualStyle') {
          const similar = VISUAL_STYLE_SIMILARITY[targetVal] || [];
          if (!similar.includes(presetVal)) return false;
        } else {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Score preset against target using continuous features
   * @param {Object} fp - Preset fingerprint
   * @param {Object} target - Target features (selector-translated)
   * @param {Object|null} mood - Mood {label, confidence}
   * @param {number|null} detectedBpm - Detected BPM
   * @param {Object|null} currentFp - Current preset fingerprint (for continuity)
   * @returns {number} Combined score in [0, 1]
   */
  scoreContinuous(fp, target, mood = null, detectedBpm = null, currentFp = null) {
    if (!fp) return 0;

    // Defensive bass-field read: fingerprints have BOTH fp.bass and fp.bassEnergy
    const fpBass = fp.bassEnergy ?? fp.bass ?? 0.5;
    const fpBeat = fp.beatSync ?? fp.beat ?? 0;

    const energyScore = 1 - Math.abs((fp.energy ?? 0.5) - (target.energy ?? 0.5));
    const bassScore = 1 - Math.abs(fpBass - (target.bassEnergy ?? 0.5));
    const trebleScore = 1 - Math.abs((fp.trebleEnergy ?? 0.5) - (target.trebleEnergy ?? 0.5));
    const beatScore = 1 - Math.abs(fpBeat - (target.beatSync ?? 0));

    // Mood scoring — single-label × confidence (matches live selector pattern)
    let moodScore = 0;
    if (mood?.label && fp.moodAffinities) {
      const raw = fp.moodAffinities[mood.label];
      if (raw !== undefined) {
        const values = Object.values(fp.moodAffinities).map(v => parseFloat(v) || 0.5);
        const variance = values.reduce((s, v) => s + (v - 0.5) ** 2, 0) / values.length;
        // Variance gate: skip if moodAffinities don't vary meaningfully
        if (variance > 0.01) {
          moodScore = parseFloat(raw) * (mood.confidence ?? 0);
        }
      }
    }

    // BPM match — uses fp.optimalBpm range
    let bpmScore = 0;
    if (detectedBpm && fp.optimalBpm) {
      const { min, max, ideal } = fp.optimalBpm;
      if (detectedBpm >= min && detectedBpm <= max) {
        const halfRange = Math.max(1, (max - min) / 2);
        bpmScore = Math.max(0, 1 - Math.abs(detectedBpm - ideal) / halfRange);
      }
    }

    // Complexity vs device: prefer presets that won't strain the device
    const complexityScore = 1 - Math.min(1, (fp.complexity ?? 0.5));

    // D3 — Visual continuity: small complexity jumps = smoother transitions
    let visualContinuityScore = 0;
    if (currentFp) {
      const dC = Math.abs((fp.complexity ?? 0.5) - (currentFp.complexity ?? 0.5));
      visualContinuityScore = 1 - dC;
    }

    // D4 — Visual style continuity: same style or compatible style
    let styleContinuityScore = 0;
    if (currentFp?.visualStyle && fp.visualStyle) {
      if (fp.visualStyle === currentFp.visualStyle) {
        styleContinuityScore = 1.0;
      } else {
        const compatible = VISUAL_STYLE_SIMILARITY[currentFp.visualStyle] || [];
        if (compatible.includes(fp.visualStyle)) styleContinuityScore = 0.5;
      }
    }

    // D5 — Color-mood synergy: expert-tuned combinations
    let colorSynergyScore = 0;
    if (fp.colorProfile && mood?.label) {
      const cp = fp.colorProfile;
      const m = mood.label;
      if (cp === 'warm' && (m === 'happy' || m === 'aggressive')) {
        colorSynergyScore = 1.0;
      } else if (cp === 'cool' && ['relaxed', 'electronic', 'meditative', 'dreamy', 'mystical', 'hypnotic'].includes(m)) {
        colorSynergyScore = 1.0;
      } else if (cp === 'vivid' && (m === 'psychedelic' || (target.beatStrength ?? 0) > 0.7)) {
        colorSynergyScore = 1.0;
      }
    }

    const w = this.weights;
    return (
      w.energy * energyScore +
      w.bass * bassScore +
      w.treble * trebleScore +
      w.beat * beatScore +
      w.mood * moodScore +
      w.bpm * bpmScore +
      w.complexity * complexityScore +
      w.visualContinuity * visualContinuityScore +
      w.styleContinuity * styleContinuityScore +
      w.colorSynergy * colorSynergyScore
    );
  }

  /**
   * Get fingerprint for a hash
   * @param {string} hash - Preset hash
   * @returns {Object|null} Fingerprint or null
   */
  fp(hash) {
    return this.db.presets[hash]?.fingerprint ?? null;
  }

  /**
   * Score a single preset against current target without running Stage 1.
   * Used by the live selector to compute currentPresetScore.
   * @param {string} hash - Preset hash
   * @param {Object} target - Target features
   * @param {Object} options - Score options
   * @returns {number} Composite score
   */
  scoreOne(hash, target, options = {}) {
    const { mood = null, detectedBpm = null, currentHash = null } = options;
    const currentFp = currentHash ? this.fp(currentHash) : null;
    return this.scoreContinuous(this.fp(hash), target, mood, detectedBpm, currentFp);
  }
}

export default HierarchicalMatcher;
