import fs from 'fs';

const fp = JSON.parse(fs.readFileSync('./presets/alaska-butter/alaskaButter.fingerprints.json', 'utf8'));
const presets = JSON.parse(fs.readFileSync('./presets/alaska-butter/alaskaButter.json', 'utf8'));

const fpNames = Object.keys(fp.nameIndex || {});
const presetNames = Object.keys(presets);

console.log('Checking for whitespace issues...\n');

let trailingSpaces = [];
let missingPresets = [];

fpNames.forEach(fpName => {
  const trimmed = fpName.trim();

  // Check for trailing/leading spaces
  if (fpName !== trimmed) {
    if (presetNames.includes(trimmed) && !presetNames.includes(fpName)) {
      trailingSpaces.push({
        fingerprint: fpName,
        actual: trimmed
      });
    }
  }

  // Check for completely missing presets
  if (!presetNames.includes(fpName)) {
    missingPresets.push(fpName);
  }
});

console.log(`Presets with trailing/leading spaces: ${trailingSpaces.length}`);
if (trailingSpaces.length > 0) {
  trailingSpaces.slice(0, 5).forEach(item => {
    console.log(`  FP: "${item.fingerprint}"`);
    console.log(`  ->  "${item.actual}"`);
  });
}

console.log(`\nTotal missing presets: ${missingPresets.length}`);
if (missingPresets.length > 0) {
  missingPresets.slice(0, 5).forEach(name => {
    console.log(`  - "${name}"`);
  });
  if (missingPresets.length > 5) {
    console.log(`  ... and ${missingPresets.length - 5} more`);
  }
}