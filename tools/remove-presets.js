#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of preset names to remove
const presetsToRemove = [
  "flexi + fishbrain - witchcraft [complex terraforming - fiddling twists in the fabric of space]",
  "flexi + fishbrain - witchcraft [complex terraforming]",
  "flexi + fishbrain - warpcraft [random mashup]",
  "flexi + fishbrain - neon mindblob grafitti",
  "fishbrain + flexi - stitchcraft",
  "martin, flexi, fishbrain + sto - enterstate [random mashup]",
  "martin, fishbrain + flexi - mandelbox explorer v1 Eo.S. optimize [bipolar witchcraft mix]",
  "fiShbRaiN + Flexi - witchcraft 2.0",
  "fiShbRaiN + flexi - witchcraft 2.0 - mash0000 - no one cares about mi, the note (major third)",
  "fiShbRaiN + geiss - witchcraft (Grow Mix 3)",
  "fiShbRaiN - witchcraft (necromancer remix)_phat_edit_v3",
  "martin - witchcraft reloaded"
];

console.log(`Removing ${presetsToRemove.length} presets from source files...`);

// Remove from Alaska Butter JSON (source)
const alaskaJsonPath = path.join(__dirname, '../presets/alaska-butter/alaskaButter.json');
if (fs.existsSync(alaskaJsonPath)) {
  const data = JSON.parse(fs.readFileSync(alaskaJsonPath, 'utf8'));
  let removed = 0;

  presetsToRemove.forEach(name => {
    if (data[name]) {
      delete data[name];
      removed++;
      console.log(`Removed: ${name}`);
    }
  });

  fs.writeFileSync(alaskaJsonPath, JSON.stringify(data, null, 2));
  console.log(`\nRemoved ${removed} presets from alaskaButter.json`);
  console.log(`Remaining presets: ${Object.keys(data).length}`);
}

// Remove from other source preset JSON files
const otherPresetFiles = [
  'presets/full-collection/butterchurnPresetsExtra.json',
  'presets/full-collection/butterchurnPresetsExtra2.json',
  'presets/full-collection/butterchurnPresets.json',
  'presets/full-collection/butterchurnPresetsMinimal.json'
];

otherPresetFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let removed = 0;

    presetsToRemove.forEach(name => {
      if (data[name]) {
        delete data[name];
        removed++;
      }
    });

    if (removed > 0) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      console.log(`Removed ${removed} presets from ${file}`);
    }
  }
});

console.log('\nDone removing from source files!');
console.log('\nNow run these commands to rebuild everything:');
console.log('1. cd presets/alaska-butter && npm run build');
console.log('2. cd ../full-collection && npm run build');
console.log('3. cd ../.. && npm run generate:all-fingerprints');
console.log('4. npm run build:cdn');