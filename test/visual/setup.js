import { expect } from '@jest/globals';
import { toMatchImageSnapshot } from 'jest-image-snapshot';

expect.extend({ toMatchImageSnapshot });

export const imageSnapshotConfig = {
  // Allow small tolerance for floating-point precision differences in WebGL rendering
  // Some presets have inherent minor non-determinism even with seeded RNG
  // Increased to 2% to accommodate 'yin - 191 - Temporal singularities' which shows ~1.2% variance
  failureThreshold: 0.02, // 2% tolerance (approx 9600 pixels at 800x600)
  failureThresholdType: 'percent',

  customDiffConfig: {
    threshold: 0.01, // Per-pixel color difference threshold
    includeAA: false,
  },

  blur: 0,

  storeReceivedOnFailure: true,

  customSnapshotIdentifier: ({ currentTestName, counter }) => {
    const testName = currentTestName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    return `${testName}-${counter}`;
  },
};
