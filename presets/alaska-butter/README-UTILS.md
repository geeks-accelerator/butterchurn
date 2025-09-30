# Alaska Butter Utility Scripts

This directory contains utility scripts for debugging and maintaining the Alaska Butter preset collection.

## analyze-keys.js
**Purpose**: Analyzes the preset keys in alaskaButter.json to identify numeric vs named presets

**Usage**: `node analyze-keys.js`

**When to use**:
- To check if preset names are being preserved correctly
- To identify which presets have numeric vs text names
- To verify the JSON source structure

## rebuild-alaska-butter.js
**Purpose**: Rebuilds alaskaButter.js from alaskaButter.json source

**Usage**: `node rebuild-alaska-butter.js`

**When to use**:
- After modifying alaskaButter.json directly
- To ensure JS file matches JSON source
- To regenerate the UMD module wrapper

**Note**: This won't "fix" numeric preset names - some presets legitimately have numeric names like "11", "158", "444" from the original MilkDrop collections.

## check-whitespace.js
**Location**: Project root directory (not in presets/alaska-butter/)
**Purpose**: Checks for whitespace mismatches between fingerprints and preset names

**Usage**: `node check-whitespace.js` (from project root)

**When to use**:
- When debugging preset loading failures
- To verify fingerprint database matches preset names exactly
- To identify trailing space issues

## Background
These utilities were created while debugging what appeared to be a preset/fingerprint mismatch issue.
The investigation revealed that:
1. Some presets legitimately have numeric names ("11", "158", "444")
2. These come from the original butterchurnPresetsExtra2 collection
3. The fingerprints need to be regenerated after any preset changes

Keep these utilities for future debugging - they're useful for understanding the preset structure.