import fs from 'fs';

const presets = JSON.parse(fs.readFileSync('./alaskaButter.json', 'utf8'));
const keys = Object.keys(presets);
const numericKeys = keys.filter(k => /^[0-9]+$/.test(k));
const namedKeys = keys.filter(k => !/^[0-9]+$/.test(k));

console.log('Total presets:', keys.length);
console.log('Numeric keys:', numericKeys.length);
console.log('  Examples:', numericKeys.slice(0, 5));
console.log('Named keys:', namedKeys.length);
console.log('  Examples:', namedKeys.slice(0, 5));

// Check if flexi preset is there
const flexiPresets = namedKeys.filter(k => k.toLowerCase().includes('flexi'));
console.log('\nFlexi presets:', flexiPresets.length);
console.log('  Searching for: flexi - splatter effects 17');
const found = flexiPresets.find(k => k.includes('splatter effects 17'));
console.log('  Found:', found || 'NOT FOUND');