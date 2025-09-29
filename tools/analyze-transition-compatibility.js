#!/usr/bin/env node

/**
 * Analyzes preset compatibility with transitions
 * Identifies presets that cause black frames due to:
 * 1. Static decay=0 in baseVals
 * 2. Dynamic decay=0 in frame equations
 * 3. NaN-producing equations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Alaska Butter presets
const presetsPath = path.join(__dirname, '..', 'presets', 'alaska-butter', 'alaskaButter.json');
const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));

console.log('=== Preset Transition Compatibility Analysis ===\n');
console.log(`Total presets: ${Object.keys(presets).length}\n`);

// Categories of problematic presets
const problematic = {
  staticDecayZero: [],
  dynamicDecayZero: [],
  nanProducers: [],
  lowDecay: [],
  alphaManipulators: []
};

// Analyze each preset
Object.entries(presets).forEach(([name, preset]) => {
  // Check for static decay=0 in baseVals
  if (preset.baseVals && preset.baseVals.decay === 0) {
    problematic.staticDecayZero.push(name);
  }

  // Check for low decay values that might cause issues
  if (preset.baseVals && preset.baseVals.decay < 0.9 && preset.baseVals.decay !== undefined) {
    problematic.lowDecay.push({ name, decay: preset.baseVals.decay });
  }

  // Check frame equations for dynamic decay=0
  if (preset.frame_eqs_str) {
    const frameEqs = preset.frame_eqs_str;
    if (/decay\s*=\s*0(?:\.|;|\s|$)/.test(frameEqs)) {
      problematic.dynamicDecayZero.push(name);
    }

    // Check for potential NaN producers (division by zero, sqrt of negative)
    const nanPatterns = [
      /\/\s*0(?:\.|;|\s|$)/,  // Division by zero
      /sqrt\s*\(\s*-/,         // Square root of negative
      /log\s*\(\s*0/,          // Log of zero
      /log\s*\(\s*-/,          // Log of negative
      /pow\s*\([^,]+,\s*-[^)]+\)/, // Negative exponent that might cause issues
      /treb\s*\/\s*treb/,      // Self-division that becomes NaN when treb=0
      /bass\s*\/\s*bass/,      // Self-division that becomes NaN when bass=0
    ];

    for (const pattern of nanPatterns) {
      if (pattern.test(frameEqs)) {
        if (!problematic.nanProducers.find(p => p.name === name)) {
          problematic.nanProducers.push({ name, pattern: pattern.toString() });
        }
      }
    }
  }

  // Check for alpha channel manipulation
  if (preset.comp_eqs_str && /alpha\s*=/.test(preset.comp_eqs_str)) {
    problematic.alphaManipulators.push(name);
  }
});

// Generate report
console.log('=== Problematic Presets for Transitions ===\n');

console.log(`1. Static decay=0 (${problematic.staticDecayZero.length} presets):`);
if (problematic.staticDecayZero.length > 0) {
  problematic.staticDecayZero.slice(0, 10).forEach(name => {
    console.log(`   - ${name}`);
  });
  if (problematic.staticDecayZero.length > 10) {
    console.log(`   ... and ${problematic.staticDecayZero.length - 10} more`);
  }
} else {
  console.log('   None found');
}

console.log(`\n2. Dynamic decay=0 in frame equations (${problematic.dynamicDecayZero.length} presets):`);
if (problematic.dynamicDecayZero.length > 0) {
  problematic.dynamicDecayZero.slice(0, 10).forEach(name => {
    console.log(`   - ${name}`);
  });
  if (problematic.dynamicDecayZero.length > 10) {
    console.log(`   ... and ${problematic.dynamicDecayZero.length - 10} more`);
  }
} else {
  console.log('   None found');
}

console.log(`\n3. Low decay values < 0.9 (${problematic.lowDecay.length} presets):`);
if (problematic.lowDecay.length > 0) {
  problematic.lowDecay.slice(0, 10).forEach(({ name, decay }) => {
    console.log(`   - ${name}: decay=${decay}`);
  });
  if (problematic.lowDecay.length > 10) {
    console.log(`   ... and ${problematic.lowDecay.length - 10} more`);
  }
} else {
  console.log('   None found');
}

console.log(`\n4. Potential NaN producers (${problematic.nanProducers.length} presets):`);
if (problematic.nanProducers.length > 0) {
  problematic.nanProducers.slice(0, 10).forEach(({ name, pattern }) => {
    console.log(`   - ${name}`);
  });
  if (problematic.nanProducers.length > 10) {
    console.log(`   ... and ${problematic.nanProducers.length - 10} more`);
  }
} else {
  console.log('   None found');
}

console.log(`\n5. Alpha channel manipulators (${problematic.alphaManipulators.length} presets):`);
if (problematic.alphaManipulators.length > 0) {
  console.log(`   ${problematic.alphaManipulators.length} presets modify alpha channel`);
} else {
  console.log('   None found');
}

// Calculate totals
const uniqueProblematic = new Set([
  ...problematic.staticDecayZero,
  ...problematic.dynamicDecayZero,
  ...problematic.nanProducers.map(p => p.name),
  ...problematic.alphaManipulators
]);

console.log('\n=== Summary ===');
console.log(`Total presets analyzed: ${Object.keys(presets).length}`);
console.log(`Potentially problematic: ${uniqueProblematic.size} (${(uniqueProblematic.size / Object.keys(presets).length * 100).toFixed(1)}%)`);
console.log(`Clean presets: ${Object.keys(presets).length - uniqueProblematic.size}`);

// Export problematic preset list for blocklist
const blocklistPath = path.join(__dirname, '..', 'presets', 'transition-incompatible.json');
const blocklist = {
  generated: new Date().toISOString(),
  totalPresets: Object.keys(presets).length,
  problematicCount: uniqueProblematic.size,
  categories: {
    staticDecayZero: problematic.staticDecayZero,
    dynamicDecayZero: problematic.dynamicDecayZero,
    nanProducers: problematic.nanProducers.map(p => p.name),
    alphaManipulators: problematic.alphaManipulators
  },
  allProblematic: Array.from(uniqueProblematic).sort()
};

fs.writeFileSync(blocklistPath, JSON.stringify(blocklist, null, 2));
console.log(`\nBlocklist saved to: ${blocklistPath}`);