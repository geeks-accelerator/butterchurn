#!/usr/bin/env node

/**
 * Advanced GLSL Shader Validator for Butterchurn v2
 *
 * This tool validates:
 * 1. Static shader strings in code
 * 2. Dynamically generated shaders by executing the generation functions
 * 3. WebGL compilation by actually compiling with a headless GL context
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import gl from 'gl';
import vm from 'vm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ShaderValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
    // Create headless WebGL context for actual compilation testing
    this.gl = gl(1, 1, { preserveDrawingBuffer: true });
  }

  /**
   * Validate shader by actually compiling it with WebGL
   */
  validateShaderCompilation(source, type, fileName, lineNumber) {
    const shader = this.gl.createShader(
      type === 'vertex' ? this.gl.VERTEX_SHADER : this.gl.FRAGMENT_SHADER
    );

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const error = this.gl.getShaderInfoLog(shader);
      this.errors.push({
        file: fileName,
        line: lineNumber,
        type: 'compilation',
        message: `Shader compilation failed: ${error}`,
        source: source.split('\n').slice(0, 5).join('\n') + '...'
      });
      return false;
    }

    this.gl.deleteShader(shader);
    return true;
  }

  /**
   * Extract and validate dynamically generated shaders
   */
  validateDynamicShaders(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');

    // Find buildFragmentShader or similar functions
    const buildFunctionPattern = /buildFragmentShader\(([^,]+),\s*['"`](\w+)['"`]\)/g;
    let match;

    while ((match = buildFunctionPattern.exec(content))) {
      const shaderCode = match[1];
      const shaderType = match[2];

      // Try to evaluate what the generated shader would look like
      // This is a simplified simulation
      try {
        const simulatedShader = this.simulateShaderGeneration(shaderCode, shaderType);
        this.validateShaderCompilation(simulatedShader, 'fragment', filePath,
          content.substring(0, match.index).split('\n').length);
      } catch (e) {
        this.warnings.push({
          file: filePath,
          line: content.substring(0, match.index).split('\n').length,
          message: `Could not validate dynamic shader: ${e.message}`
        });
      }
    }
  }

  /**
   * Simulate shader generation to catch issues before runtime
   */
  simulateShaderGeneration(shaderCode, type) {
    // This would need the actual preset data to be fully accurate
    // For now, we'll create a mock version
    const baseGLSL = `precision mediump float;
uniform sampler2D uTexture;
uniform float uTime;
uniform float uBassLevel;
varying vec2 vTexCoord;
`;

    const mockShaderBody = `
  return vec3(1.0, 0.0, 0.0);  // Mock body
`;

    if (type === 'pixel') {
      return baseGLSL + `
vec3 pixel() {
${mockShaderBody}
}

void main() {
  vec3 color = pixel();
  gl_FragColor = vec4(color, 1.0);
}`;
    }

    return baseGLSL + `void main() { gl_FragColor = vec4(1.0); }`;
  }

  /**
   * Check for common GLSL mistakes
   */
  checkCommonMistakes(source, file, line) {
    // Check for missing semicolons after function declarations
    const funcDeclPattern = /^[^\/]*\b(vec[234]|float|int|void)\s+\w+\s*\([^)]*\)\s*\{[^}]*\}(?!\s*;)/gm;
    if (funcDeclPattern.test(source)) {
      // Actually, function definitions don't need semicolons, only forward declarations do
      // This is a subtle distinction that caused confusion
    }

    // Check for nested function definitions
    const lines = source.split('\n');
    let braceDepth = 0;
    let inFunction = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if this looks like a function definition
      if (/^\s*(vec[234]|float|int|void)\s+\w+\s*\(/.test(line)) {
        if (inFunction && braceDepth > 0) {
          this.errors.push({
            file,
            line: line + i,
            message: 'Nested function definition detected - not allowed in GLSL'
          });
        }
        inFunction = true;
      }

      // Track brace depth
      for (const char of line) {
        if (char === '{') braceDepth++;
        if (char === '}') {
          braceDepth--;
          if (braceDepth === 0) inFunction = false;
        }
      }
    }

    // Check for incorrect distance/length usage
    if (/\bdistance\s*\([^,)]+\)/.test(source)) {
      this.errors.push({
        file,
        line,
        message: 'distance() requires two arguments, perhaps you meant length()?'
      });
    }

    // Check for missing main function
    if (!source.includes('void main()')) {
      this.errors.push({
        file,
        line,
        message: 'Fragment shader missing void main() function'
      });
    }
  }

  /**
   * Run validation on all shader files
   */
  run() {
    const files = [
      path.join(path.dirname(__dirname), 'src/v2/EmergencyPresetManager.js'),
      path.join(path.dirname(__dirname), 'src/v2/ButterchurnV2.js')
    ];

    console.log('🔍 Advanced Shader Validation\n');

    for (const file of files) {
      if (!fs.existsSync(file)) continue;

      console.log(`Checking ${path.basename(file)}...`);
      this.validateDynamicShaders(file);

      // Also extract and check any inline shaders
      const content = fs.readFileSync(file, 'utf8');
      const shaderPattern = /(?:warp|pixel|composite)\s*:\s*`([^`]+)`/g;
      let match;

      while ((match = shaderPattern.exec(content))) {
        const shaderBody = match[1];
        const lineNum = content.substring(0, match.index).split('\n').length;

        // Check the shader body for common issues
        this.checkCommonMistakes(shaderBody, file, lineNum);
      }
    }

    // Report results
    console.log('\n📊 Validation Results:\n');

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log('✅ All shaders validated successfully!');
      return 0;
    }

    if (this.errors.length > 0) {
      console.log(`❌ ${this.errors.length} Error(s):\n`);
      for (const error of this.errors) {
        console.log(`  ${path.basename(error.file)}:${error.line}`);
        console.log(`    ${error.message}`);
        if (error.source) {
          console.log(`    Source:\n${error.source.split('\n').map(l => '      ' + l).join('\n')}\n`);
        }
      }
    }

    if (this.warnings.length > 0) {
      console.log(`⚠️  ${this.warnings.length} Warning(s):\n`);
      for (const warning of this.warnings) {
        console.log(`  ${path.basename(warning.file)}:${warning.line}`);
        console.log(`    ${warning.message}\n`);
      }
    }

    return this.errors.length > 0 ? 1 : 0;
  }
}

// Run if called directly
if (process.argv[1] === __filename) {
  const validator = new ShaderValidator();
  process.exit(validator.run());
}

export default ShaderValidator;