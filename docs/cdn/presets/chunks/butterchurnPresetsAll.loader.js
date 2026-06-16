/**
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
                return script.src.replace(/butterchurnPresetsAll\.loader\.js.*$/, '');
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
