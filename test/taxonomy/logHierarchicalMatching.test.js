/**
 * §G10 — Logging spec for logHierarchicalMatching
 *
 * Pinned format (one line per selector decision):
 *   [selector] depth=N relaxed=[a,b] survivors=X top3=[h:s,h:s,h:s] picked=H
 *
 *   N        matcher matchDepth (integer; -1 if exhausted)
 *   a,b      comma-separated relaxedDimensions (or '-' if none)
 *   X        Stage 1 surviving candidate count
 *   h:s      8-char hash prefix : score.toFixed(2) (or '-' if none)
 *   H        8-char hash prefix of the picked preset
 *
 * The matcher emits a parallel `[matcher]` line covering depth/relaxed/
 * survivors/top3 when its own logMatching option is enabled.
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { HierarchicalMatcher } from '../../src/taxonomy/hierarchicalMatcher.js';

describe('§G10 logging spec', () => {
    let logSpy;

    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    test('matcher [matcher] line format when logMatching is enabled', () => {
        const db = {
            presets: {
                'aaaaaaaa11111111': { fingerprint: { energy: 0.5, bassEnergy: 0.5, trebleEnergy: 0.5, beatSync: 0.3, complexity: 0.3, visualStyle: 'fractal', musicalResponsiveness: 'spectral_analysis', reliabilityTier: 'stable', dominantHue: 'cool' } },
                'bbbbbbbb22222222': { fingerprint: { energy: 0.5, bassEnergy: 0.5, trebleEnergy: 0.5, beatSync: 0.3, complexity: 0.3, visualStyle: 'particle', musicalResponsiveness: 'beat_detection', reliabilityTier: 'stable', dominantHue: 'warm' } }
            }
        };
        const matcher = new HierarchicalMatcher(db, { logMatching: true });
        matcher.findMatches({ energy: 0.5, bassEnergy: 0.5, trebleEnergy: 0.5, beatSync: 0.3 });

        // At least one [matcher] line was emitted.
        const lines = logSpy.mock.calls.map(call => call[0]).filter(line =>
            typeof line === 'string' && line.startsWith('[matcher]')
        );
        expect(lines.length).toBeGreaterThan(0);

        // Format spec: depth=N relaxed=[...] survivors=X top3=[...]
        expect(lines[0]).toMatch(/^\[matcher\] depth=-?\d+ relaxed=\[.*\] survivors=\d+ top3=\[/);
    });

    test('matcher emits nothing when logMatching is disabled', () => {
        const db = { presets: { 'cc': { fingerprint: { energy: 0.5 } } } };
        const matcher = new HierarchicalMatcher(db, { logMatching: false });
        matcher.findMatches({ energy: 0.5 });

        const matcherLines = logSpy.mock.calls.map(call => call[0]).filter(line =>
            typeof line === 'string' && line.startsWith('[matcher]')
        );
        expect(matcherLines.length).toBe(0);
    });

    test('format spec is documented in source so future readers can find it', async () => {
        const fs = await import('node:fs/promises');
        const path = await import('node:path');
        const { fileURLToPath } = await import('node:url');
        const __dirname = path.dirname(fileURLToPath(import.meta.url));
        const src = await fs.readFile(
            path.join(__dirname, '..', '..', 'src', 'intelligentPresetSelector.js'),
            'utf8'
        );
        // Contract reference + format example must be in source.
        expect(src).toMatch(/§G10/);
        expect(src).toMatch(/\[selector\] depth=N relaxed=\[a,b\] survivors=X top3=\[h:s,h:s,h:s\] picked=H/);
    });
});
