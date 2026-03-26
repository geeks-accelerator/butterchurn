# Butterchurn v2 Linting & Static Analysis Guide

## Overview
This comprehensive linting toolchain catches the types of bugs we've been encountering in Butterchurn v2 development, including:
- Import/export mismatches
- Undefined variables and missing exports
- GLSL shader syntax errors
- Async/sync initialization issues
- Type mismatches and incorrect function signatures

## Tools Installed

### 1. ESLint - JavaScript/TypeScript Linting
**Purpose**: Catches import/export issues, undefined variables, and code style problems

**Key Rules**:
- `import/no-unresolved` - Catches missing module exports
- `import/named` - Verifies named exports exist
- `no-undef` - Catches undefined variables
- `@typescript-eslint/no-unused-vars` - Finds unused code

**Run**:
```bash
npm run lint        # Auto-fix issues
npm run lint:check  # Just check, don't fix
```

### 2. TypeScript - Type Checking
**Purpose**: Catches type errors, missing properties, incorrect function calls

**Features**:
- JavaScript type checking with JSDoc
- Detects missing module exports
- Validates function signatures
- Catches async/sync mismatches

**Run**:
```bash
npm run typecheck
```

### 3. GLSL Shader Linter
**Purpose**: Validates WebGL shader code embedded in JavaScript

**Catches**:
- GLSL syntax errors
- Varying name mismatches (vUV vs vTexCoord)
- Missing uniform/attribute declarations
- HLSL syntax in GLSL code (float2 → vec2)
- Function signatures in shader bodies

**Run**:
```bash
npm run lint:glsl
```

### 4. Prettier - Code Formatting
**Purpose**: Consistent code formatting across the project

**Configuration**:
- Single quotes
- Semicolons required
- 100 character line width
- ES5 trailing commas

## Full Analysis Command
Run all linters and type checking:
```bash
npm run analyze
```

## Common Issues These Tools Catch

### 1. Import/Export Mismatches
**Example Bug**:
```javascript
// File A exports: frameAnalyzer
export const frameAnalyzer = new LiveFrameAnalyzer();

// File B incorrectly imports: liveAnalyzer
import { liveAnalyzer } from './LiveFrameAnalyzer.js';  // ❌ ESLint catches this
```

### 2. Race Conditions in Initialization
**Example Bug**:
```javascript
class AdaptiveWASMCompiler {
  constructor() {
    this.capabilities = wasmDetector.detectCapabilities(); // ❌ TypeScript warns: Promise not awaited
  }
}
```

### 3. GLSL Shader Errors
**Example Bug**:
```javascript
const vertexShader = `
  varying vec2 vUV;  // ❌ GLSL linter catches mismatch
`;

const fragmentShader = `
  varying vec2 vTexCoord; // Different name!
`;
```

### 4. Missing Exports
**Example Bug**:
```javascript
// index.js forgets to export presetLogger
// Other files that import it will error
import { presetLogger } from './index.js'; // ❌ ESLint catches missing export
```

## VSCode Integration

Add to `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "eslint.validate": [
    "javascript",
    "typescript"
  ],
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

## Pre-commit Hook
Add to `.git/hooks/pre-commit`:
```bash
#!/bin/sh
npm run analyze
```

## Type Definitions
Type definitions are in `src/v2/types.d.ts` for better IDE support and type checking.

## Configuration Files
- `.eslintrc.json` - ESLint rules
- `tsconfig.json` - TypeScript configuration
- `tools/glsl-lint.js` - GLSL linter script

## Benefits

These tools would have caught:
- ✅ The `liveAnalyzer` vs `frameAnalyzer` import mismatch
- ✅ The race condition in `AdaptiveWASMCompiler` initialization
- ✅ The missing `presetLogger` export from index.js
- ✅ The `vUV` vs `vTexCoord` shader varying mismatch
- ✅ HLSL syntax (float2/float3) in GLSL code
- ✅ Function signatures in shader body strings
- ✅ Malformed WebAssembly bytecode (via type checking)

## Future Improvements

Consider adding:
- `husky` for automatic pre-commit hooks
- `lint-staged` to only lint changed files
- `jest` with type checking for test files
- WebAssembly validation tools
- Performance profiling in CI/CD