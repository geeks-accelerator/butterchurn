#!/usr/bin/env node

/**
 * Fix Malformed Equations in butterchurnPresetsAll
 *
 * Problem: milkdrop-eel-parser produces malformed JS when EEL has
 * standalone expressions (no assignment). These expressions get
 * joined without semicolons, causing "Unexpected identifier" errors.
 *
 * Example:
 *   ((24*above(a['tg1'], 0.5))*below(a['tg1'], 0.75)) a['tg3']=...
 *   Should be:
 *   ((24*above(a['tg1'], 0.5))*below(a['tg1'], 0.75)); a['tg3']=...
 *
 * This script post-processes equations to add missing semicolons.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Pattern: closing paren followed by whitespace then 'a[' (variable access)
// This indicates a missing semicolon between statements
const MISSING_SEMICOLON_PATTERN = /\)\s+a\[/g;

// Pattern: closing bracket followed by whitespace then 'a[' (variable followed by variable)
const MISSING_SEMICOLON_PATTERN2 = /\]\s+a\[/g;

// Pattern: number followed by whitespace then 'a[' (orphan number before assignment)
const MISSING_SEMICOLON_PATTERN3 = /(\d)\s+a\[/g;

// Pattern: equation ends with incomplete statement (identifier without assignment)
const TRUNCATED_PATTERN = /a\['[^']+'\]$/;

// Pattern: ends with just a number (orphaned expression)
const ORPHANED_NUMBER_PATTERN = /\d+(\.\d+)?$/;

// Pattern: ends with orphaned expression (closing paren not part of assignment)
const ORPHANED_EXPR_PATTERN = /;\s*\([^;]+\)\s*$/;

// Pattern: ends with orphaned function call (e.g., "pow(...)")
const ORPHANED_FUNC_PATTERN = /;\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\([^;]+\)\s*$/;

// Pattern: entire equation is just a number (garbage converter output)
const JUST_NUMBER_PATTERN = /^\d+(\.\d+)?$/;

// Pattern: entire equation is just a function call without assignment (allow nested parens)
const JUST_FUNC_CALL_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*\s*\(.*\)$/;

function fixEquation(eq) {
    if (!eq) return eq;
    let fixed = eq;

    // Fix 0a: Replace equations that are just numbers with empty string
    if (JUST_NUMBER_PATTERN.test(fixed.trim())) {
        return '';
    }

    // Fix 0b: Replace equations that are just function calls (no assignment)
    if (JUST_FUNC_CALL_PATTERN.test(fixed.trim())) {
        return '';
    }

    // Fix 0c: Replace "--N" (decrement of number literal) with "- -N" (subtraction of negative)
    fixed = fixed.replace(/--(\d)/g, '- -$1');

    // Fix 0d: Replace "+-N" with "+ -N" for clarity (though valid, can confuse)
    fixed = fixed.replace(/\+-(\d)/g, '+ -$1');

    // Fix 1: Add semicolon after closing paren followed by a['...
    fixed = fixed.replace(MISSING_SEMICOLON_PATTERN, '); a[');

    // Fix 1b: Add semicolon after closing bracket followed by a['...
    fixed = fixed.replace(MISSING_SEMICOLON_PATTERN2, ']; a[');

    // Fix 1c: Remove orphan number at start of equation followed by a['...
    fixed = fixed.replace(MISSING_SEMICOLON_PATTERN3, '$1; a[');

    // Fix 2: Remove truncated trailing identifiers (e.g., "a['rot']" at end)
    if (TRUNCATED_PATTERN.test(fixed)) {
        // Find the last semicolon and truncate after it
        const lastSemi = fixed.lastIndexOf(';');
        if (lastSemi >= 0) {
            fixed = fixed.substring(0, lastSemi + 1);
        } else {
            // No semicolon at all - entire equation is just an identifier
            fixed = '';
        }
    }

    // Fix 3: Remove orphaned numbers at end
    if (ORPHANED_NUMBER_PATTERN.test(fixed.trim())) {
        const lastSemi = fixed.lastIndexOf(';');
        if (lastSemi >= 0) {
            fixed = fixed.substring(0, lastSemi + 1);
        }
    }

    // Fix 4: Remove orphaned expressions at end (e.g., "; (0.2+...)")
    if (ORPHANED_EXPR_PATTERN.test(fixed)) {
        const match = fixed.match(ORPHANED_EXPR_PATTERN);
        if (match) {
            // Remove the orphaned expression, keeping the semicolon before it
            const idx = fixed.lastIndexOf(match[0]);
            fixed = fixed.substring(0, idx + 1); // Keep the semicolon
        }
    }

    // Fix 5: Remove orphaned function calls at end (e.g., "; pow(...)")
    if (ORPHANED_FUNC_PATTERN.test(fixed)) {
        const match = fixed.match(ORPHANED_FUNC_PATTERN);
        if (match) {
            const idx = fixed.lastIndexOf(match[0]);
            fixed = fixed.substring(0, idx + 1); // Keep the semicolon
        }
    }

    return fixed;
}

function validateEquation(eq, label) {
    if (!eq || eq.length === 0) return { valid: true };
    try {
        new Function('a', eq + ' return a;');
        return { valid: true };
    } catch (e) {
        return { valid: false, error: e.message, eq: eq.substring(0, 100) };
    }
}

async function main() {
    const presetPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.json');
    const backupPath = path.join(PROJECT_ROOT, 'presets/full-collection/butterchurnPresetsAll.backup.json');

    console.log('[Fix] Loading presets...');
    const presets = JSON.parse(await fs.readFile(presetPath, 'utf-8'));

    // Count issues before fix
    let issuesBefore = 0;
    let issuesAfter = 0;
    let presetsFixed = 0;
    let presetsStillBroken = [];

    console.log('[Fix] Analyzing and fixing equations...');

    for (const [name, preset] of Object.entries(presets)) {
        let presetModified = false;

        // Check and fix main equations
        for (const key of ['init_eqs_str', 'frame_eqs_str', 'pixel_eqs_str']) {
            const before = validateEquation(preset[key], `${name}.${key}`);
            if (!before.valid) {
                issuesBefore++;
                const fixed = fixEquation(preset[key]);
                const after = validateEquation(fixed, `${name}.${key}`);

                if (after.valid) {
                    preset[key] = fixed;
                    presetModified = true;
                } else {
                    issuesAfter++;
                    presetsStillBroken.push({ name, key, error: after.error });
                }
            }
        }

        // Check and fix shape equations
        if (preset.shapes) {
            for (let i = 0; i < preset.shapes.length; i++) {
                for (const key of ['init_eqs_str', 'frame_eqs_str']) {
                    const before = validateEquation(preset.shapes[i][key], `${name}.shapes[${i}].${key}`);
                    if (!before.valid) {
                        issuesBefore++;
                        const fixed = fixEquation(preset.shapes[i][key]);
                        const after = validateEquation(fixed, `${name}.shapes[${i}].${key}`);

                        if (after.valid) {
                            preset.shapes[i][key] = fixed;
                            presetModified = true;
                        } else {
                            issuesAfter++;
                            presetsStillBroken.push({ name, key: `shapes[${i}].${key}`, error: after.error });
                        }
                    }
                }
            }
        }

        // Check and fix wave equations
        if (preset.waves) {
            for (let i = 0; i < preset.waves.length; i++) {
                for (const key of ['init_eqs_str', 'frame_eqs_str', 'point_eqs_str']) {
                    const before = validateEquation(preset.waves[i][key], `${name}.waves[${i}].${key}`);
                    if (!before.valid) {
                        issuesBefore++;
                        const fixed = fixEquation(preset.waves[i][key]);
                        const after = validateEquation(fixed, `${name}.waves[${i}].${key}`);

                        if (after.valid) {
                            preset.waves[i][key] = fixed;
                            presetModified = true;
                        } else {
                            issuesAfter++;
                            presetsStillBroken.push({ name, key: `waves[${i}].${key}`, error: after.error });
                        }
                    }
                }
            }
        }

        if (presetModified) presetsFixed++;
    }

    console.log('');
    console.log('[Fix] Results:');
    console.log(`  Issues before: ${issuesBefore}`);
    console.log(`  Issues fixed: ${issuesBefore - issuesAfter}`);
    console.log(`  Issues remaining: ${issuesAfter}`);
    console.log(`  Presets modified: ${presetsFixed}`);

    if (presetsStillBroken.length > 0) {
        console.log('');
        console.log('[Fix] Presets still broken (first 10):');
        presetsStillBroken.slice(0, 10).forEach(p => {
            console.log(`  - ${p.name.substring(0, 50)}`);
            console.log(`    ${p.key}: ${p.error}`);
        });
    }

    if (presetsFixed > 0) {
        console.log('');
        console.log('[Fix] Creating backup...');
        await fs.copyFile(presetPath, backupPath);

        console.log('[Fix] Writing fixed presets...');
        await fs.writeFile(presetPath, JSON.stringify(presets, null, 2));

        console.log('[Fix] Done!');
    } else {
        console.log('[Fix] No changes needed.');
    }
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
