# Butterchurn Presets

## Directory Structure

### `/alaska-butter`
**Our custom combined collection** - 388 unique presets
- ✅ Committed to git (including JS files)
- Created by combining and deduplicating all preset packs
- Self-contained and ready to use

### `/full-collection`
**Analysis of npm preset packages**
- ✅ Fingerprint files committed (our analysis)
- ❌ JS files NOT committed (download from npm)
- Run `npm run download-presets` to get the JS files

## Why This Structure?

1. **Alaska Butter** is our creation, so we own and distribute it
2. **NPM packages** belong to their authors - we just analyze them
3. Fingerprints are our work (mathematical analysis)
4. Preset JS files from npm should be installed as dependencies

## Usage

### Using Alaska Butter (Recommended)
```javascript
// Everything is included
import alaskaButter from './presets/alaska-butter/alaskaButter.min.js';
const presets = alaskaButter.getPresets();
```

### Using Individual Packs
```bash
# First, download the preset packages
npm run download-presets

# Then use them
```
```javascript
import butterchurnPresets from './presets/full-collection/butterchurnPresets.min.js';
const presets = butterchurnPresets.getPresets();
```

## File Types

- `*.fingerprints.json` - Full analysis with metadata
- `*.fingerprints.min.json` - Compact analysis for production
- `*.js` - UMD module with preset code
- `*.min.js` - Minified UMD module
- `metadata.json` - Package information

## Stats

- **Alaska Butter**: 388 unique presets (no duplicates)
- **All packs combined**: 553 total (160 duplicates)
- **Fingerprint size**: ~145KB (vs 2.1MB for code)