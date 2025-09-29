#!/bin/bash

# Generate fingerprints for each preset JSON file
cd "$(dirname "$0")/.."

echo "=== Generating Fingerprints for Each Preset Pack ==="
echo

# Process each JSON file
for json_file in presets/full-collection/*.json; do
    # Skip if it contains "fingerprints" in the filename
    if [[ "$json_file" =~ fingerprints ]]; then
        continue
    fi

    # Only process butterchurnPresets*.json files
    if [[ ! "$json_file" =~ butterchurnPresets[^/]*\.json$ ]]; then
        continue
    fi

    # Get base name without extension
    base_name=$(basename "$json_file" .json)
    fingerprint_file="presets/full-collection/${base_name}.fingerprints.json"

    echo "Processing: $base_name"
    echo "  Input:  $json_file"
    echo "  Output: $fingerprint_file"

    # Generate fingerprints for this file
    node tools/generate-fingerprints.js --input "$json_file" --output "$fingerprint_file"

    if [ $? -eq 0 ]; then
        echo "  ✓ Success"
    else
        echo "  ✗ Failed"
    fi
    echo
done

echo "=== Fingerprint Generation Complete ==="
echo
echo "Each preset pack now has its own fingerprint file:"
ls -la presets/full-collection/*.fingerprints.json 2>/dev/null || echo "No fingerprint files found"

echo
echo "=== Creating Alaska Butter Collection ==="
echo
echo "Step 1: Combining all presets into Alaska Butter..."
node tools/create-alaska-butter.js

if [ $? -eq 0 ]; then
    echo "  ✓ Alaska Butter collection created"
    echo
    echo "Step 2: Generating fingerprints for Alaska Butter..."
    node tools/generate-fingerprints.js \
        --input presets/alaska-butter/alaskaButter.json \
        --output presets/alaska-butter/alaskaButter.fingerprints.json

    if [ $? -eq 0 ]; then
        echo "  ✓ Alaska Butter fingerprints generated"
        echo
        echo "Alaska Butter files:"
        ls -la presets/alaska-butter/alaskaButter*.json presets/alaska-butter/alaskaButter*.js 2>/dev/null
    else
        echo "  ✗ Failed to generate Alaska Butter fingerprints"
    fi
else
    echo "  ✗ Failed to create Alaska Butter collection"
fi

echo
echo "=== All Processing Complete ==="