#!/bin/bash
#
# Butterchurn Enhanced Fingerprint Generator
# Phase 6: ML Visual Style Tagging
#
# This script runs the full pipeline to generate v2.0 fingerprints
# with CLIP-based visual style classification.
#
# Prerequisites:
#   - Node.js 18+
#   - Python 3.8+ with CLIP dependencies (pip install -r requirements.txt)
#   - Puppeteer (npm install puppeteer)
#
# Usage: ./generate-enhanced-fingerprints.sh [preset-pack-name]
#

set -e

# Configuration
PRESET_PACK="${1:-alaskaButter}"
OUTPUT_DIR="./fingerprint-generation"
PROJECT_ROOT="$(dirname "$0")/.."

echo "================================================"
echo "Butterchurn Enhanced Fingerprint Generator"
echo "================================================"
echo ""
echo "Preset pack: $PRESET_PACK"
echo "Output directory: $OUTPUT_DIR"
echo ""

# Create output directories
mkdir -p "$OUTPUT_DIR/frames"

# Step 1: Render preset frames
echo "=== Step 1: Render preset frames ==="
echo "This may take a while depending on the number of presets..."
echo ""

# Find preset pack file
PRESET_FILE=""
if [ -f "$PROJECT_ROOT/presets/alaska-butter/${PRESET_PACK}.json" ]; then
    PRESET_FILE="$PROJECT_ROOT/presets/alaska-butter/${PRESET_PACK}.json"
elif [ -f "$PROJECT_ROOT/presets/full-collection/${PRESET_PACK}.json" ]; then
    PRESET_FILE="$PROJECT_ROOT/presets/full-collection/${PRESET_PACK}.json"
else
    echo "Error: Could not find preset pack: $PRESET_PACK"
    echo "Looked in: presets/alaska-butter/ and presets/full-collection/"
    exit 1
fi

echo "Using preset file: $PRESET_FILE"

node "$PROJECT_ROOT/tools/render-preset-frames.js" \
    --input "$PRESET_FILE" \
    --output "$OUTPUT_DIR/frames"

echo ""
echo "Frame rendering complete!"
echo ""

# Step 2: Classify visual styles with CLIP
echo "=== Step 2: Classify visual styles with CLIP ==="
echo "Using GPU if available..."
echo ""

python "$PROJECT_ROOT/tools/classify-visual-style.py" \
    "$OUTPUT_DIR/frames" \
    "$OUTPUT_DIR/visual-styles.json"

echo ""
echo "Visual style classification complete!"
echo ""

# Step 3: Generate enhanced fingerprints
echo "=== Step 3: Generate enhanced fingerprints ==="

# Check if we have a way to inject visual styles into generate-fingerprints.js
# For now, the visual styles will need to be merged manually or via a separate script

node "$PROJECT_ROOT/tools/generate-fingerprints.js" \
    --input "$PROJECT_ROOT/presets/alaska-butter" \
    --output "$PROJECT_ROOT/presets/alaska-butter/${PRESET_PACK}.fingerprints.json" \
    --visual-styles "$OUTPUT_DIR/visual-styles.json"

echo ""
echo "Fingerprint generation complete!"
echo ""

# Step 4: Minify for CDN
echo "=== Step 4: Minify and prepare for CDN ==="

# Create minified version
if command -v npx &> /dev/null; then
    npx terser "$PROJECT_ROOT/presets/alaska-butter/${PRESET_PACK}.fingerprints.json" \
        -o "$PROJECT_ROOT/docs/cdn/presets/${PRESET_PACK}.fingerprints.min.json" \
        --mangle 2>/dev/null || cp "$PROJECT_ROOT/presets/alaska-butter/${PRESET_PACK}.fingerprints.json" \
                                   "$PROJECT_ROOT/docs/cdn/presets/${PRESET_PACK}.fingerprints.min.json"
else
    # Fallback: just copy the file
    cp "$PROJECT_ROOT/presets/alaska-butter/${PRESET_PACK}.fingerprints.json" \
       "$PROJECT_ROOT/docs/cdn/presets/${PRESET_PACK}.fingerprints.min.json"
fi

echo ""
echo "================================================"
echo "Done!"
echo "================================================"
echo ""
echo "Generated files:"
echo "  - $OUTPUT_DIR/frames/ (rendered frames)"
echo "  - $OUTPUT_DIR/visual-styles.json (CLIP classifications)"
echo "  - $PROJECT_ROOT/presets/alaska-butter/${PRESET_PACK}.fingerprints.json"
echo "  - $PROJECT_ROOT/docs/cdn/presets/${PRESET_PACK}.fingerprints.min.json"
echo ""
echo "To deploy to CDN:"
echo "  npm run deploy:cdn"
echo ""
