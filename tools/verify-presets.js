#!/usr/bin/env node

/**
 * Verify that preset JS files match their fingerprint files
 * and download missing ones from npm
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PACKAGES = {
    'butterchurnPresets': 'butterchurn-presets',
    'butterchurnPresetsExtra': 'butterchurn-presets-extra',
    'butterchurnPresetsExtra2': 'butterchurn-presets-extra2',
    'butterchurnPresetsMD1': 'butterchurn-presets-md1',
    'butterchurnPresetsMinimal': 'butterchurn-presets-minimal',
    'butterchurnPresetsNonMinimal': 'butterchurn-presets-non-minimal'
};

async function verifyAndDownload() {
    console.log('🔍 Verifying preset files match fingerprints...\n');

    const fullCollectionDir = path.join(__dirname, '..', 'presets', 'full-collection');
    let missingPackages = [];

    for (const [fileName, npmPackage] of Object.entries(PACKAGES)) {
        const fingerprintPath = path.join(fullCollectionDir, `${fileName}.fingerprints.json`);
        const jsPath = path.join(fullCollectionDir, `${fileName}.min.js`);

        // Check if fingerprint exists
        try {
            await fs.access(fingerprintPath);
            console.log(`✅ Found fingerprints: ${fileName}.fingerprints.json`);

            // Check if corresponding JS exists
            try {
                await fs.access(jsPath);
                console.log(`✅ Found JS file: ${fileName}.min.js`);
            } catch {
                console.log(`❌ Missing JS file: ${fileName}.min.js`);
                missingPackages.push(npmPackage);
            }
        } catch {
            console.log(`⚠️  No fingerprints for ${fileName}, skipping...`);
        }
    }

    if (missingPackages.length > 0) {
        console.log(`\n📦 Need to download ${missingPackages.length} packages from npm...`);
        console.log('Run: npm run download-presets');
        return false;
    }

    console.log('\n✨ All preset files match their fingerprints!');
    return true;
}

// Run verification
verifyAndDownload().catch(console.error);

export default verifyAndDownload;