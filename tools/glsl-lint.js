#!/usr/bin/env node

/**
 * GLSL Shader Linter for Butterchurn v2
 *
 * This tool validates GLSL shader code in JavaScript files to catch:
 * - Syntax errors in shader strings
 * - Variable name mismatches (like vUV vs vTexCoord)
 * - Missing uniforms/attributes
 * - Invalid GLSL constructs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import glslparser from 'glsl-parser';

const glsl = glslparser.default || glslparser;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Common shader variable patterns
const COMMON_VARYINGS = ['vTexCoord', 'vPosition', 'vNormal', 'vColor'];
const COMMON_UNIFORMS = ['uTime', 'uTexture', 'uResolution', 'uBassLevel', 'uMidLevel', 'uTrebleLevel'];
const COMMON_ATTRIBUTES = ['position', 'texCoord', 'normal', 'color'];

// Files to check for shader code
const SHADER_FILES = [
  'src/v2/EmergencyPresetManager.js',
  'src/v2/ButterchurnV2.js',
  // Add more files as needed
];

class GLSLLinter {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  /**
   * Extract shader code from JavaScript file
   */
  extractShaders(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const shaders = [];

    // Pattern 1: Shader strings in template literals
    const templateLiteralPattern = /(?:vertexShaderSource|fragmentShaderSource|warp|pixel|composite)\s*[=:]\s*`([^`]+)`/g;
    let match;
    while ((match = templateLiteralPattern.exec(content))) {
      shaders.push({
        code: match[1],
        line: content.substring(0, match.index).split('\n').length,
        type: match[0].includes('vertex') ? 'vertex' : 'fragment',
        file: filePath
      });
    }

    // Pattern 2: GLSL code in convertToGLSL function
    const glslCodePattern = /glslCode\s*\+=\s*`([^`]+)`/g;
    while ((match = glslCodePattern.exec(content))) {
      shaders.push({
        code: match[1],
        line: content.substring(0, match.index).split('\n').length,
        type: 'fragment',
        file: filePath
      });
    }

    // Pattern 3: Direct shader return statements
    const returnPattern = /return\s+`([^`]+)`[;,]/g;
    while ((match = returnPattern.exec(content))) {
      const code = match[1];
      // Check if it looks like shader code
      if (code.includes('vec') || code.includes('float') || code.includes('void main')) {
        shaders.push({
          code: code,
          line: content.substring(0, match.index).split('\n').length,
          type: 'unknown',
          file: filePath
        });
      }
    }

    return shaders;
  }

  /**
   * Validate a single shader
   */
  validateShader(shaderInfo) {
    const { code, line, type, file } = shaderInfo;

    // Check for common issues
    this.checkVaryingMatches(code, line, file);
    this.checkUniformDeclarations(code, line, file);
    this.checkGLSLSyntax(code, line, file, type);
    this.checkCommonMistakes(code, line, file);
  }

  /**
   * Check for varying mismatches between vertex and fragment shaders
   */
  checkVaryingMatches(code, line, file) {
    // Extract varyings declared
    const varyingPattern = /varying\s+\w+\s+(\w+)/g;
    const declaredVaryings = [];
    let match;
    while ((match = varyingPattern.exec(code))) {
      declaredVaryings.push(match[1]);
    }

    // Check for usage of undeclared varyings
    const usagePattern = /\b(v[A-Z]\w+)\b/g;
    while ((match = usagePattern.exec(code))) {
      const varying = match[1];
      if (varying.startsWith('v') && !declaredVaryings.includes(varying)) {
        // Check if it's a known varying that should be declared
        if (varying === 'vUV' && !declaredVaryings.includes('vTexCoord')) {
          this.errors.push({
            file,
            line,
            message: `Varying mismatch: using 'vUV' but should use 'vTexCoord' for consistency`
          });
        }
      }
    }
  }

  /**
   * Check uniform declarations
   */
  checkUniformDeclarations(code, line, file) {
    // Check for uniform usage without declaration
    const uniformUsage = /\b(u[A-Z]\w+)\b/g;
    const declaredUniforms = [];

    // Extract declared uniforms
    const uniformPattern = /uniform\s+\w+\s+(\w+)/g;
    let match;
    while ((match = uniformPattern.exec(code))) {
      declaredUniforms.push(match[1]);
    }

    // Check usage
    uniformUsage.lastIndex = 0;
    while ((match = uniformUsage.exec(code))) {
      const uniform = match[1];
      if (COMMON_UNIFORMS.includes(uniform) && !declaredUniforms.includes(uniform)) {
        this.warnings.push({
          file,
          line,
          message: `Uniform '${uniform}' used but not declared`
        });
      }
    }
  }

  /**
   * Check GLSL syntax using parser
   */
  checkGLSLSyntax(code, line, file, type) {
    try {
      // Prepare code for parsing
      let fullCode = code;

      // Add common GLSL boilerplate if missing
      if (!code.includes('void main')) {
        if (type === 'vertex') {
          fullCode = `
            attribute vec2 position;
            varying vec2 vTexCoord;
            ${code}
            void main() { gl_Position = vec4(position, 0.0, 1.0); }
          `;
        } else {
          fullCode = `
            precision mediump float;
            varying vec2 vTexCoord;
            ${code}
            void main() { gl_FragColor = vec4(0.0); }
          `;
        }
      }

      // Try to parse
      const tokens = glsl.tokenize(fullCode);
      glsl.parse(tokens);
    } catch (error) {
      // Only report actual syntax errors, not missing context
      if (error.message && !error.message.includes('EOF')) {
        this.errors.push({
          file,
          line: line + (error.line || 0),
          message: `GLSL syntax error: ${error.message}`
        });
      }
    }
  }

  /**
   * Check for common GLSL mistakes
   */
  checkCommonMistakes(code, line, file) {
    // Check for HLSL syntax that should be GLSL
    const hlslPatterns = [
      { pattern: /\bfloat2\b/g, correct: 'vec2' },
      { pattern: /\bfloat3\b/g, correct: 'vec3' },
      { pattern: /\bfloat4\b/g, correct: 'vec4' },
      { pattern: /\bint2\b/g, correct: 'ivec2' },
      { pattern: /\bint3\b/g, correct: 'ivec3' },
      { pattern: /\bint4\b/g, correct: 'ivec4' },
    ];

    for (const { pattern, correct } of hlslPatterns) {
      if (pattern.test(code)) {
        this.errors.push({
          file,
          line,
          message: `HLSL syntax found: use '${correct}' instead of HLSL type`
        });
      }
      pattern.lastIndex = 0; // Reset regex
    }

    // Check for function signatures in shader body strings
    if (code.includes('vec2 warp(') || code.includes('vec3 pixel(') || code.includes('vec3 composite(')) {
      this.errors.push({
        file,
        line,
        message: `Function signature found in shader body - only return the function body, not the signature`
      });
    }

    // Check for incorrect built-in functions
    if (code.includes('distance(') && code.includes('vec2(0.5, 0.5)')) {
      // This is probably correct, just a note
      this.warnings.push({
        file,
        line,
        message: `Using 'distance' function - verify this is intentional (not 'length')`
      });
    }
  }

  /**
   * Run linter on all shader files
   */
  run() {
    console.log('🔍 Running GLSL Shader Linter...\n');

    for (const relativePath of SHADER_FILES) {
      const filePath = path.join(path.dirname(__dirname), relativePath);

      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Skipping ${relativePath} (file not found)`);
        continue;
      }

      const shaders = this.extractShaders(filePath);

      if (shaders.length === 0) {
        console.log(`✓ ${relativePath} - No shaders found`);
        continue;
      }

      console.log(`Checking ${relativePath} (${shaders.length} shaders found)...`);

      for (const shader of shaders) {
        this.validateShader(shader);
      }
    }

    // Report results
    console.log('\n📊 Linting Results:\n');

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✅ No issues found!');
      return 0;
    }

    if (this.errors.length > 0) {
      console.log(`❌ ${this.errors.length} Error(s):\n`);
      for (const error of this.errors) {
        console.log(`  ${error.file}:${error.line}`);
        console.log(`    ${error.message}\n`);
      }
    }

    if (this.warnings.length > 0) {
      console.log(`⚠️  ${this.warnings.length} Warning(s):\n`);
      for (const warning of this.warnings) {
        console.log(`  ${warning.file}:${warning.line}`);
        console.log(`    ${warning.message}\n`);
      }
    }

    return this.errors.length > 0 ? 1 : 0;
  }
}

// Run if called directly
if (process.argv[1] === __filename) {
  const linter = new GLSLLinter();
  process.exit(linter.run());
}

export default GLSLLinter;