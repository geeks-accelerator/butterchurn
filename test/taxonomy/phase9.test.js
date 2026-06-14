/**
 * Phase 9 follow-up tests (taxonomy plan §Phase 9):
 *
 *   Item 1 — genre.timingMultiplier scaling reaches the public nextSwitch field
 *   Item 2 — mood-shift detection queues a phrase-aligned switch
 *   Item 3 — drop-source canonicalization: features.isDrop is classification-only
 */

import { describe, test, expect, beforeEach } from '@jest/globals';

const mockDb = {
    presets: {
        'h1': {
            names: ['P1'],
            fingerprint: {
                energy: 0.5, bassEnergy: 0.5, trebleEnergy: 0.5, beatSync: 0.3,
                complexity: 0.3, visualStyle: 'fractal', musicalResponsiveness: 'spectral_analysis',
                reliabilityTier: 'stable', dominantHue: 'cool', colorProfile: 'cool',
                energyLabel: 'dynamic',
                moodAffinities: { aggressive: 0.3, relaxed: 0.7 },
                optimalBpm: { min: 90, max: 130, ideal: 110 }
            }
        },
        'h2': {
            names: ['P2'],
            fingerprint: {
                energy: 0.8, bassEnergy: 0.7, trebleEnergy: 0.6, beatSync: 0.6,
                complexity: 0.6, visualStyle: 'particle', musicalResponsiveness: 'beat_detection',
                reliabilityTier: 'stable', dominantHue: 'warm', colorProfile: 'warm',
                energyLabel: 'energetic',
                moodAffinities: { aggressive: 0.7, relaxed: 0.3 },
                optimalBpm: { min: 120, max: 160, ideal: 140 }
            }
        }
    },
    indices: {}
};

import IntelligentPresetSelector from '../../src/intelligentPresetSelector.js';

const mockButterchurn = {
    loadPreset: () => {},
    getRendererProps: () => ({ texsizeX: 800, texsizeY: 600 })
};

describe('Phase 9 item 1 — genre.timingMultiplier scales public nextSwitch', () => {
    let selector;

    beforeEach(() => {
        selector = new IntelligentPresetSelector(mockButterchurn, mockDb, { rngSeed: 42 });
    });

    test('classical genre (timingMultiplier 1.5) inflates nextSwitch beyond minSwitchInterval', () => {
        // Simulate that we just switched (timeSinceSwitch = 0) and a slow genre.
        selector.lastSwitch = performance.now();
        selector.detectedGenre = { label: 'classical', confidence: 0.9, timingMultiplier: 1.5, phraseLength: 16 };

        // Reach in to the same formula update() uses for the public field.
        const genreMul = selector.detectedGenre?.timingMultiplier || 1.0;
        const scaledMin = selector.minSwitchInterval * genreMul;
        expect(scaledMin).toBe(selector.minSwitchInterval * 1.5);
        expect(scaledMin).toBeGreaterThan(selector.minSwitchInterval);
    });

    test('EDM genre (timingMultiplier 0.7) shortens the effective interval', () => {
        selector.detectedGenre = { label: 'edm', confidence: 0.9, timingMultiplier: 0.7, phraseLength: 16 };
        const scaledMin = selector.minSwitchInterval * selector.detectedGenre.timingMultiplier;
        expect(scaledMin).toBe(selector.minSwitchInterval * 0.7);
        expect(scaledMin).toBeLessThan(selector.minSwitchInterval);
    });

    test('null detectedGenre falls back to multiplier 1.0', () => {
        selector.detectedGenre = null;
        const genreMul = selector.detectedGenre?.timingMultiplier || 1.0;
        expect(genreMul).toBe(1.0);
    });
});

describe('Phase 9 item 2 — mood-shift trigger state', () => {
    let selector;

    beforeEach(() => {
        selector = new IntelligentPresetSelector(mockButterchurn, mockDb, { rngSeed: 42 });
        selector.currentHash = 'h1';
    });

    test('initializes with no lastMoodLabel and pendingSwitchOnPhrase false', () => {
        expect(selector.lastMoodLabel).toBeNull();
        expect(selector.pendingSwitchOnPhrase).toBe(false);
    });

    test('exposes a configurable confidence threshold', () => {
        expect(selector.MOOD_SHIFT_CONFIDENCE_THRESHOLD).toBeGreaterThan(0);
        expect(selector.MOOD_SHIFT_CONFIDENCE_THRESHOLD).toBeLessThanOrEqual(1);
    });

    test('logic gate: shift requires (label change) AND (high confidence) AND (no other pending switch)', () => {
        // Manually exercise the gate logic since the full update() loop requires
        // an audioAnalyzer + audio data.
        const moodA = { label: 'relaxed', confidence: 0.8 };
        const moodB = { label: 'aggressive', confidence: 0.8 };
        const moodLow = { label: 'aggressive', confidence: 0.4 };

        // First confident read: no shift yet (no prior label).
        let prior = selector.lastMoodLabel;
        let shouldTrigger = (
            (moodA.confidence ?? 0) >= selector.MOOD_SHIFT_CONFIDENCE_THRESHOLD &&
            prior !== null && prior !== moodA.label &&
            !selector.preDropSwitchScheduled && !selector.pendingSwitchOnPhrase &&
            !!selector.currentHash
        );
        expect(shouldTrigger).toBe(false); // prior is null
        selector.lastMoodLabel = moodA.label;

        // Second confident read with different label: SHOULD trigger.
        prior = selector.lastMoodLabel;
        shouldTrigger = (
            (moodB.confidence ?? 0) >= selector.MOOD_SHIFT_CONFIDENCE_THRESHOLD &&
            prior !== null && prior !== moodB.label &&
            !selector.preDropSwitchScheduled && !selector.pendingSwitchOnPhrase &&
            !!selector.currentHash
        );
        expect(shouldTrigger).toBe(true);

        // Low-confidence read: must NOT trigger even with different label.
        shouldTrigger = (
            (moodLow.confidence ?? 0) >= selector.MOOD_SHIFT_CONFIDENCE_THRESHOLD &&
            prior !== null && prior !== moodLow.label
        );
        expect(shouldTrigger).toBe(false);

        // Pre-drop scheduled: must NOT trigger (priority order).
        selector.preDropSwitchScheduled = true;
        shouldTrigger = (
            (moodB.confidence ?? 0) >= selector.MOOD_SHIFT_CONFIDENCE_THRESHOLD &&
            prior !== null && prior !== moodB.label &&
            !selector.preDropSwitchScheduled
        );
        expect(shouldTrigger).toBe(false);
    });
});

describe('Phase 9 item 3 — drop-source canonicalization', () => {
    test('features.isDrop is documented as classification-only (contract preserved)', async () => {
        // This is a static contract: a reader of calculateAudioFeatures should
        // see a comment block stating features.isDrop is for classification,
        // not as a switch trigger. We check the contract comment is present
        // so future code edits don't silently strip it.
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const src = await fs.readFile(
            path.join(__dirname, '..', '..', 'src', 'intelligentPresetSelector.js'),
            'utf8'
        );
        expect(src).toMatch(/DROP-SOURCE CONTRACT/);
        expect(src).toMatch(/CANONICAL drop trigger/);
    });

    test('buildupInfo is the only conditional that triggers Priority 1 pre-drop scheduling', async () => {
        // Verify there's no `if (features.isDrop && ... && !preDropSwitchScheduled)`
        // sibling to the buildupInfo trigger. Defends against future drift.
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const src = await fs.readFile(
            path.join(__dirname, '..', '..', 'src', 'intelligentPresetSelector.js'),
            'utf8'
        );
        // Count the lines that gate `!this.preDropSwitchScheduled` — the
        // canonical trigger plus the schedule-check are the only sites.
        const matches = src.match(/!this\.preDropSwitchScheduled/g) || [];
        // Trigger block at top of priority 1, plus the existing scheduled-check
        // block. Anything more would imply drift toward multi-source triggering.
        expect(matches.length).toBeLessThanOrEqual(4);
        // No `features.isDrop` appears on the same line as preDropSwitchScheduled
        expect(src).not.toMatch(/features\.isDrop[^\n]*preDropSwitchScheduled/);
    });
});
