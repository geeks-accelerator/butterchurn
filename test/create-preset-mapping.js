import presets from '../node_modules/butterchurn-presets-js/lib/butterchurnPresetsMinimal.min.js';
import fs from 'fs';

// Load fingerprint database
const fingerprintDb = JSON.parse(fs.readFileSync('fingerprints.json', 'utf8'));

// Get available presets
const availablePresets = presets.getPresets();
const availableNames = Object.keys(availablePresets);

console.log(`Available presets: ${availableNames.length}`);
console.log(`Fingerprint database: ${Object.keys(fingerprintDb.presets).length} entries`);

// Create mapping from fingerprint hash to available preset
const mapping = {};
const unmapped = [];

// Try to match fingerprint entries to available presets
for (const [hash, fpData] of Object.entries(fingerprintDb.presets)) {
    let found = false;

    // Try each name variant in the fingerprint data
    for (const fpName of fpData.names) {
        // Try to find a matching preset
        const match = availableNames.find(availName => {
            // Exact match
            if (availName === fpName) return true;

            // Partial matches
            if (availName.includes(fpName) || fpName.includes(availName)) return true;

            // Match by author and title parts
            const fpParts = fpName.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
            const availParts = availName.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);

            // Check if significant parts match
            const commonParts = fpParts.filter(part => availParts.includes(part));
            return commonParts.length >= 2; // At least 2 words in common
        });

        if (match) {
            mapping[hash] = match;
            console.log(`✓ Mapped ${hash} -> ${match}`);
            found = true;
            break;
        }
    }

    if (!found) {
        unmapped.push({ hash, names: fpData.names });
    }
}

console.log(`\nMapping complete:`);
console.log(`  Mapped: ${Object.keys(mapping).length}`);
console.log(`  Unmapped: ${unmapped.length}`);

// Create an enhanced fingerprint database that includes the mapping
const enhancedDb = {
    ...fingerprintDb,
    mapping: mapping,
    availableHashes: Object.keys(mapping)
};

// Save the enhanced database
fs.writeFileSync('fingerprints-mapped.json', JSON.stringify(enhancedDb, null, 2));
console.log(`\nSaved enhanced database to fingerprints-mapped.json`);

// Show some unmapped examples
if (unmapped.length > 0) {
    console.log(`\nExamples of unmapped presets:`);
    unmapped.slice(0, 5).forEach(({ hash, names }) => {
        console.log(`  ${hash}: ${names[0]}`);
    });
}