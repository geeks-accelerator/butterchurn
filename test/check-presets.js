import presets from '../node_modules/butterchurn-presets-js/lib/butterchurnPresetsMinimal.min.js';

const p = presets.getPresets();
const allNames = Object.keys(p);

console.log('Total presets in minimal pack:', allNames.length);

// Check for invalid presets
const invalid = [];
const valid = [];

for (const [name, preset] of Object.entries(p)) {
    if (!preset || typeof preset !== 'object') {
        invalid.push({ name, reason: 'not an object' });
    } else if (!preset.baseVals) {
        invalid.push({ name, reason: 'missing baseVals' });
    } else if (!preset.frame_eqs_str) {
        invalid.push({ name, reason: 'missing frame_eqs_str' });
    } else {
        valid.push(name);
    }
}

console.log('Valid presets:', valid.length);
console.log('Invalid presets:', invalid.length);

if (invalid.length > 0) {
    console.log('\nFirst 5 invalid presets:');
    invalid.slice(0, 5).forEach(({ name, reason }) => {
        console.log(`  - "${name}": ${reason}`);
    });
}

// Check if names match what's in the fingerprint database
console.log('\nSample valid preset names:');
valid.slice(0, 5).forEach(name => {
    console.log(`  - "${name}"`);
});