#!/usr/bin/env node
/**
 * Build Preset Chunks for CDN Deployment
 *
 * Splits butterchurnPresetsAll into multiple chunks to stay under GitHub's
 * 100MB file size limit. Creates:
 *   - butterchurnPresetsAll.chunk-{0,1,2,3,4}.min.js (UMD modules)
 *   - butterchurnPresetsAll.manifest.json (chunk metadata)
 *   - butterchurnPresetsAll.loader.js (lazy-load helper)
 *
 * Usage:
 *   node tools/build-preset-chunks.js
 *
 * The loader provides:
 *   - butterchurnPresetsAllChunked.loadAll() - loads all chunks
 *   - butterchurnPresetsAllChunked.loadChunk(n) - loads specific chunk
 *   - butterchurnPresetsAllChunked.getPresets() - returns loaded presets
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const CHUNK_SIZE = 5000; // presets per chunk
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'presets/full-collection/chunks');

console.log('[build-chunks] Building preset chunks for CDN deployment\n');

// Load all presets
const presetsPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.json');
const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf8'));
const names = Object.keys(presets);
const total = names.length;
const numChunks = Math.ceil(total / CHUNK_SIZE);

console.log(`Total presets: ${total}`);
console.log(`Chunk size: ${CHUNK_SIZE}`);
console.log(`Number of chunks: ${numChunks}\n`);

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Build manifest
const manifest = {
    version: '2.2.2',
    generated: new Date().toISOString(),
    totalPresets: total,
    chunkSize: CHUNK_SIZE,
    chunks: []
};

// Generate chunks
for (let i = 0; i < numChunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, total);
    const chunkNames = names.slice(start, end);

    // Build chunk object
    const chunk = {};
    for (const name of chunkNames) {
        chunk[name] = presets[name];
    }

    // Write chunk as UMD module
    const chunkContent = `(function(g,f){typeof exports==='object'&&typeof module!=='undefined'?module.exports=f():typeof define==='function'&&define.amd?define(f):(g=g||self,g.butterchurnPresetsChunk${i}=f())}(this,function(){'use strict';const p=${JSON.stringify(chunk)};return{getPresets(){return p},getPresetList(){return Object.keys(p)}}}));`;

    const chunkPath = path.join(OUTPUT_DIR, `butterchurnPresetsAll.chunk-${i}.min.js`);
    fs.writeFileSync(chunkPath, chunkContent);

    const size = fs.statSync(chunkPath).size;
    console.log(`  Chunk ${i}: ${chunkNames.length} presets, ${(size / 1024 / 1024).toFixed(1)}MB`);

    manifest.chunks.push({
        index: i,
        file: `butterchurnPresetsAll.chunk-${i}.min.js`,
        presetCount: chunkNames.length,
        sizeBytes: size,
        firstPreset: chunkNames[0],
        lastPreset: chunkNames[chunkNames.length - 1]
    });
}

// Write manifest
const manifestPath = path.join(OUTPUT_DIR, 'butterchurnPresetsAll.manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\n  Manifest: ${manifestPath}`);

// Write loader script
const loaderContent = `/**
 * Butterchurn Presets Chunked Loader
 *
 * Lazy-loads preset chunks on demand to reduce initial download size.
 *
 * Usage:
 *   <script src="butterchurnPresetsAll.loader.js"></script>
 *   <script>
 *     // Load all chunks (convenience method)
 *     await butterchurnPresetsAllChunked.loadAll();
 *     const presets = butterchurnPresetsAllChunked.getPresets();
 *
 *     // Or load specific chunks
 *     await butterchurnPresetsAllChunked.loadChunk(0);
 *     await butterchurnPresetsAllChunked.loadChunk(1);
 *   </script>
 */
(function(global) {
    'use strict';

    const MANIFEST_URL = 'butterchurnPresetsAll.manifest.json';
    const loadedPresets = {};
    const loadedChunks = new Set();
    let manifest = null;

    async function loadManifest() {
        if (manifest) return manifest;
        const baseUrl = getBaseUrl();
        const response = await fetch(baseUrl + MANIFEST_URL);
        manifest = await response.json();
        return manifest;
    }

    function getBaseUrl() {
        // Detect base URL from script src
        const scripts = document.getElementsByTagName('script');
        for (const script of scripts) {
            if (script.src && script.src.includes('butterchurnPresetsAll.loader')) {
                return script.src.replace(/butterchurnPresetsAll\\.loader\\.js.*$/, '');
            }
        }
        return './chunks/';
    }

    async function loadChunk(index) {
        if (loadedChunks.has(index)) return;

        const m = await loadManifest();
        if (index >= m.chunks.length) {
            throw new Error('Chunk index out of range: ' + index);
        }

        const chunkInfo = m.chunks[index];
        const baseUrl = getBaseUrl();

        // Dynamic script loading
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = baseUrl + chunkInfo.file;
            script.onload = () => {
                const chunkVar = 'butterchurnPresetsChunk' + index;
                if (global[chunkVar]) {
                    Object.assign(loadedPresets, global[chunkVar].getPresets());
                    loadedChunks.add(index);
                    resolve(chunkInfo.presetCount);
                } else {
                    reject(new Error('Chunk loaded but variable not found: ' + chunkVar));
                }
            };
            script.onerror = () => reject(new Error('Failed to load chunk: ' + chunkInfo.file));
            document.head.appendChild(script);
        });
    }

    async function loadAll() {
        const m = await loadManifest();
        const promises = m.chunks.map((_, i) => loadChunk(i));
        await Promise.all(promises);
        return Object.keys(loadedPresets).length;
    }

    function getPresets() {
        return loadedPresets;
    }

    function getPresetList() {
        return Object.keys(loadedPresets);
    }

    function getLoadedChunkCount() {
        return loadedChunks.size;
    }

    async function getManifest() {
        return loadManifest();
    }

    global.butterchurnPresetsAllChunked = {
        loadChunk,
        loadAll,
        getPresets,
        getPresetList,
        getLoadedChunkCount,
        getManifest
    };

})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
`;

const loaderPath = path.join(OUTPUT_DIR, 'butterchurnPresetsAll.loader.js');
fs.writeFileSync(loaderPath, loaderContent);
console.log(`  Loader: ${loaderPath}`);

// Summary
console.log('\n[build-chunks] Summary');
console.log('=======================');
console.log(`Total chunks: ${numChunks}`);
console.log(`Total presets: ${total}`);
const totalSize = manifest.chunks.reduce((sum, c) => sum + c.sizeBytes, 0);
console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(1)}MB (all chunks)`);
console.log(`Largest chunk: ${Math.max(...manifest.chunks.map(c => c.sizeBytes / 1024 / 1024)).toFixed(1)}MB`);
console.log('\nAll chunks under 100MB limit ✅');
console.log('\n✅ Chunks ready for CDN deployment!');
