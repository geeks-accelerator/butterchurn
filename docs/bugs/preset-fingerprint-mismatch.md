# Bug Report: AlaskaButter Preset/Fingerprint Database Mismatch

## Summary

The AlaskaButter visualizer experiences a critical mismatch between its preset collection (alaskaButter.js) and its fingerprint database (alaskaButter.fingerprints.min.json), causing the IntelligentPresetSelector to fail when attempting to load certain presets.

## Error Message

```
[IntelligentSelector] Error loading preset: [CRITICAL] Preset not found in pack: "flexi - splatter effects 17 the wave, a google love story written in decay roam3-2 ".
Database/pack mismatch!
[IntelligentSelector] Failed to load preset ff52a92e, keeping current preset
```

## Root Cause

The fingerprint database and preset pack were generated from different sources or at different times, resulting in preset names that exist in the fingerprint database but not in the actual preset JavaScript file.

## Specific Example

- Fingerprint database contains: "flexi - splatter effects 17 the wave, a google love story written in decay roam3-2 " (note trailing space)
- AlaskaButter.js contains: No preset with this exact name
- Hash ID: ff52a92e

## Technical Details

### How the System Works

1. The IntelligentPresetSelector uses fingerprints to choose presets based on audio characteristics
2. Each fingerprint has a hash ID (e.g., ff52a92e) and associated preset names
3. When switching presets, the selector:
   - Chooses a hash based on audio analysis
   - Looks up the preset name from the fingerprint database
   - Attempts to load that preset from the AlaskaButter.js pack
   - FAILS because the name doesn't exist in the pack

### Current Data Structure

```javascript
// Fingerprint database structure
{
  "presets": {
    "ff52a92e": {
      "names": ["flexi - splatter effects 17 the wave, a google love story written in decay roam3-2 "],
      "fingerprint": { /* audio characteristics */ }
    }
  },
  "nameIndex": {
    "flexi - splatter effects 17 the wave, a google love story written in decay roam3-2 ": "ff52a92e"
  }
}

// But AlaskaButter.js has different preset names like:
{
  "$$ Royal - Mashup (197)": { /* preset data */ },
  "_Geiss - Artifact 01": { /* preset data */ },
  // No "flexi - splatter effects 17..." preset
}
```

## Impact

- **User Experience**: The visualizer continues to work but may not switch presets as expected
- **Console Errors**: Generates error messages that indicate system instability
- **Feature Degradation**: Intelligent preset selection is compromised as some presets cannot be loaded
- **Fallback Behavior**: System falls back to emergency presets or keeps current preset

## Why This Happened

The AlaskaButter collection claims to have 388 unique presets (now 359 after removals), deduplicated from 6 different preset packs. The fingerprint generation process likely:

1. Ran against the original source preset files
2. Used slightly different naming conventions or preprocessing
3. Included presets that were later excluded from the final AlaskaButter.js bundle
4. Had whitespace/formatting differences in preset names

## Proposed Solutions

### Solution 1: Regenerate Fingerprints (Recommended)

Generate new fingerprints directly from the actual AlaskaButter.js file to ensure perfect 1-to-1 mapping:

```bash
# In butterchurn project
node tools/generate-fingerprints.js --input presets/alaska-butter/alaskaButter.js --output alaskaButter.fingerprints.json
```

### Solution 2: Add Fuzzy Matching

Update the loadPresetByHash method in intelligentPresetSelector.js to handle name variations:

```javascript
// Try exact match first
let presetKey = Object.keys(this.presetPack).find(key => key === presetName);

// If no exact match, try normalized comparison
if (!presetKey) {
  const normalizedTarget = presetName.trim().toLowerCase();
  presetKey = Object.keys(this.presetPack).find(key =>
    key.trim().toLowerCase() === normalizedTarget
  );
}
```

### Solution 3: Validate on Build

Add a build-time validation script that ensures all fingerprinted presets exist in the pack:

```javascript
// validate-fingerprints.js
const fingerprints = require('./alaskaButter.fingerprints.json');
const presets = require('./alaskaButter.js').getPresets();

for (const [hash, data] of Object.entries(fingerprints.presets)) {
  for (const name of data.names) {
    if (!presets[name]) {
      console.error(`Missing preset: ${name} (${hash})`);
    }
  }
}
```

## Temporary Workaround

The current code includes error handling that prevents crashes, but this masks the underlying issue. The system logs an error and continues with the current preset rather than switching.

## Verification Steps

1. Load the AlaskaButter visualizer at http://localhost:5577
2. Open browser console
3. Load and play audio
4. Wait for automatic preset switching
5. Observe error messages when certain presets are selected
6. Note that preset ff52a92e and others fail to load

## Severity

**High** - While not breaking the application, this defeats the purpose of the "intelligent" preset selection system and indicates a fundamental data integrity issue between the two core data files.

## Related Issues

- Recent removal of 29 dark/aggressive presets may have exacerbated the mismatch
- The fingerprint database needs to be regenerated after any preset removal
- Build process should validate fingerprint-to-preset mapping automatically