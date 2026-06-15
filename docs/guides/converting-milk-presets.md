# Converting Milkdrop Presets to Butterchurn

This guide covers the process of converting `.milk` Milkdrop preset files to Butterchurn JSON format.

## Prerequisites

The milkdrop-preset-converter is already installed in `tools/milkdrop-preset-converter/`. If you need to rebuild it:

```bash
cd tools/milkdrop-preset-converter
npm install --legacy-peer-deps
npm run build
```

## Tools

### batch-convert-milk.js

Batch converts a directory of `.milk` files to Butterchurn JSON format.

```bash
node tools/batch-convert-milk.js \
  --input ./presets-cream-of-the-crop/ \
  --output ./presets/imports/cream-of-the-crop.json \
  --workers 4
```

**Features:**
- Recursive directory scanning for `.milk` files
- Parallel conversion (configurable workers)
- Progress reporting with ETA
- Resume capability via checkpoint file
- Automatic minified output generation

**Output:**
- `<output>.json` - Pretty-printed JSON
- `<output>.min.json` - Minified JSON
- `<output>.errors.json` - Error log (if any failures)
- `<output>.checkpoint.json` - Resume checkpoint (deleted on success)

### validate-converted-presets.js

Validates converted presets for Butterchurn compatibility.

```bash
node tools/validate-converted-presets.js --input ./converted.json [--strict]
```

**Validation checks:**
- Required fields: `baseVals`, `shapes`, `waves`
- Optional fields: `init_eqs_str`, `frame_eqs_str`, `pixel_eqs_str`, `warp`, `comp`
- Equation syntax: balanced brackets, valid JavaScript patterns
- baseVals: `decay` required, `zoom`/`rot`/etc recommended
- Shapes/waves: valid array structure

**Exit codes:**
- `0` - All presets valid
- `1` - Some presets have errors

## Conversion Process

### Step 1: Clone the preset source

```bash
git clone --depth 1 https://github.com/projectM-visualizer/presets-cream-of-the-crop.git
```

### Step 2: Batch convert

```bash
node tools/batch-convert-milk.js \
  --input presets-cream-of-the-crop/ \
  --output presets/imports/cream-of-the-crop-raw.json
```

### Step 3: Validate

```bash
node tools/validate-converted-presets.js --input presets/imports/cream-of-the-crop-raw.json
```

### Step 4: Deduplicate against existing presets

```bash
node tools/deduplicate-presets.js \
  --input presets/imports/cream-of-the-crop-raw.json \
  --existing presets/full-collection/butterchurnPresetsAll.fingerprints.json \
  --output presets/imports/cream-of-the-crop.json
```

### Step 5: Generate fingerprints

```bash
node tools/generate-fingerprints.js \
  --input presets/imports/cream-of-the-crop.json \
  --output presets/imports/cream-of-the-crop.fingerprints.json
```

## Output Format

Converted presets have this structure:

```javascript
{
  "Preset Name": {
    "baseVals": {
      "decay": 0.5,
      "wave_mode": 2,
      "zoom": 1.0,
      // ... other rendering parameters
    },
    "shapes": [
      {
        "baseVals": { "enabled": 0 },
        "init_eqs_str": "...",
        "frame_eqs_str": "..."
      },
      // ... up to 4 shapes
    ],
    "waves": [
      {
        "baseVals": { "enabled": 0 },
        "init_eqs_str": "...",
        "frame_eqs_str": "...",
        "point_eqs_str": "..."
      },
      // ... up to 4 waves
    ],
    "init_eqs_str": "a['var'] = 0; ...",
    "frame_eqs_str": "a['var'] = Math.sin(a['time']); ...",
    "pixel_eqs_str": "...",
    "warp": "// GLSL shader code",
    "comp": "// GLSL shader code"
  }
}
```

## Edge Cases

### Milkdrop 1 vs Milkdrop 2 Presets

- **Milkdrop 1** presets have no `warp`/`comp` shaders (empty strings)
- **Milkdrop 2** presets have GLSL shader code
- Both render correctly in Butterchurn

### Texture-Dependent Presets

Some presets reference external texture files. These will:
- Convert successfully (no error)
- Render with missing/black texture areas

**Options:**
1. Skip texture-dependent presets during import
2. Bundle textures separately (advanced)
3. Accept degraded rendering (simple)

### Common Conversion Warnings

- `tex3D no overloaded function matched` - Shader uses 3D textures not supported in WebGL
- `Missing baseVals.decay` - Will use default value (0.5)
- `Missing recommended baseVals.cx` - Will use default value (0.5)

These warnings don't prevent the preset from rendering.

## Troubleshooting

### Conversion Fails Completely

Check the error log (`<output>.errors.json`) for specific failures:

```bash
cat presets/imports/output.errors.json | jq '.[] | {file: .file, error: .error}'
```

### Preset Renders Blank

1. Check if preset has `decay` close to 1.0 (fades to black quickly)
2. Check if preset requires textures
3. Try with `wave_mode: 0` to see basic waveform

### Resume Interrupted Conversion

The batch converter automatically creates checkpoints. Just re-run the same command to resume:

```bash
node tools/batch-convert-milk.js --input ./large-collection --output ./output.json
# Interrupted...
node tools/batch-convert-milk.js --input ./large-collection --output ./output.json
# Resumes from checkpoint
```
