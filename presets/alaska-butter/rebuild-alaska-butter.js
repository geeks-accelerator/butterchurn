#!/usr/bin/env node

/**
 * Rebuild Alaska Butter JS from JSON with proper preset names
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the JSON file with proper preset names
const jsonPath = path.join(__dirname, 'alaskaButter.json');
const presets = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

console.log(`Loaded ${Object.keys(presets).length} presets from JSON`);
console.log('First 5 preset names:', Object.keys(presets).slice(0, 5));

// Create JavaScript module (UMD format) with PROPER preset names
const jsContent = `(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = global || self, global.alaskaButter = factory());
}(this, function () {
    'use strict';

    const presets = ${JSON.stringify(presets)};

    return {
        getPresets() {
            return presets;
        },
        getPresetList() {
            return Object.keys(presets);
        }
    };
}));`;

// Save the properly formatted JS file
const jsPath = path.join(__dirname, 'alaskaButter.js');
fs.writeFileSync(jsPath, jsContent);

console.log(`\n✅ Rebuilt alaskaButter.js with proper preset names`);
console.log(`File saved to: ${jsPath}`);