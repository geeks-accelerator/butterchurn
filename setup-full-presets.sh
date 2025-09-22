#!/bin/bash

echo "Setting up full Butterchurn preset collection..."

# Create presets directory if it doesn't exist
PRESET_DIR="presets/full-collection"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET_DIR="$PROJECT_DIR/$PRESET_DIR"

mkdir -p "$TARGET_DIR"

# Check if we already have the full collection
if [ -f "$TARGET_DIR/.downloaded" ]; then
    echo "Full preset collection already downloaded"
    echo "To re-download, run: rm -rf $TARGET_DIR"
    exit 0
fi

echo "Downloading butterchurn-presets package..."

# Create a temporary directory for npm
TEMP_DIR=$(mktemp -d)
cd "$TEMP_DIR"

# Initialize npm and install the full preset package
npm init -y > /dev/null 2>&1
npm install butterchurn-presets@2.4.7 --no-save 2>&1 | grep -v "deprecated\|warn" || true

# Copy the preset files to our project
echo "Copying preset files..."
if [ -d "node_modules/butterchurn-presets/lib" ]; then
    cp node_modules/butterchurn-presets/lib/*.js "$TARGET_DIR/"
    echo "  ✓ Copied preset JavaScript files"

    # Also copy the presets directory if it exists
    if [ -d "node_modules/butterchurn-presets/presets" ]; then
        cp -r node_modules/butterchurn-presets/presets "$TARGET_DIR/"
        echo "  ✓ Copied preset definitions"
    fi
else
    echo "Error: Preset files not found"
    exit 1
fi

# Mark as downloaded
touch "$TARGET_DIR/.downloaded"

# Clean up
cd - > /dev/null
rm -rf "$TEMP_DIR"

echo ""
echo "✓ Full preset collection installed to $PRESET_DIR"
echo ""
echo "Available preset packs:"
for file in "$TARGET_DIR"/*.js; do
    if [ -f "$file" ]; then
        size=$(ls -lh "$file" | awk '{print $5}')
        basename "$file" | sed "s/^/  - /" | sed "s/\.js$/ ($size)/"
    fi
done

echo ""
echo "Total presets available:"
echo "  - Minimal: ~29 presets (190KB)"
echo "  - Standard: ~100+ presets (653KB)"
echo "  - Extra: ~200+ presets (844KB)"
echo "  - Extra2: ~150+ presets (609KB)"
echo "  - MD1: ~60+ presets (284KB)"
echo "  - Full collection: ~500+ unique presets"
echo ""
echo "To use these presets, update your HTML to load from local files instead of CDN"