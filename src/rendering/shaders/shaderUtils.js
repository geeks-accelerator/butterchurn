const lineMatcher = /uniform sampler2D sampler_(?:.+?);/g;
const samplerMatcher = /uniform sampler2D sampler_(.+?);/;

export default class ShaderUtils {
  /**
   * Validate a freshly-built program: check each shader's COMPILE_STATUS and the
   * program's LINK_STATUS. On failure, log LOUD (always — these are rare, real
   * failures, NOT per-frame spam) with the GLSL info logs so a broken preset is
   * never a silent failure. Returns true if the program linked OK. The caller
   * (renderer.loadPreset) knows the preset and names it on top of this.
   */
  static validateProgram(gl, program, shaders, label) {
    const errs = [];
    for (const { shader, name } of shaders) {
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        errs.push(`${label} ${name} compile: ${gl.getShaderInfoLog(shader)}`);
      }
    }
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      errs.push(`${label} link: ${gl.getProgramInfoLog(program)}`);
    }
    const err = errs.join("\n");
    // window.__BC_SILENT_VALIDATE lets a bulk sweep read the returned error off
    // the shader instances without flooding the console 2000x.
    if (err && !(typeof window !== "undefined" && window.__BC_SILENT_VALIDATE)) {
      // eslint-disable-next-line no-console
      console.error(`[butterchurn] ${err}`);
    }
    return err; // "" when the program compiled + linked cleanly
  }

  /**
   * Repair the preset converter's illegal `bvecN(X) && bvecN(Y)` / `|| ` output.
   * Milkdrop's HLSL allows logical `&&`/`||` on vectors (component-wise); the
   * Milkdrop→GLSL step wrapped both operands in `bvecN(...)` and kept `&&`, but
   * GLSL ES 3.00 only allows `&&`/`||` on SCALAR bool — so 16% of the curated
   * catalog failed to compile on real GPUs (SwiftShader wrongly accepted it).
   *
   * Rewrite component-wise on the 0/1 float cast (faithful to HLSL bool→float):
   *   bvecN(X) && bvecN(Y)  →  (vecN(bvecN(X)) * vecN(bvecN(Y)))      // AND
   *   bvecN(X) || bvecN(Y)  →  max(vecN(bvecN(X)), vecN(bvecN(Y)))    // OR
   * Scalar `bool(X) && bool(Y)` is valid GLSL and left untouched. Operands carry
   * nested parens and chain (up to ~14/line), so this is a balanced-paren scan
   * applied repeatedly until no illegal pair remains — not a regex.
   */
  static fixVectorLogical(src) {
    if (!src || src.indexOf("bvec") === -1) return src;
    // A logical operand is a vector iff it begins (modulo wrapping parens) with a
    // bvecN cast — that's the converter's signature for the broken case. Scalar
    // `bool(X) && bool(Y)` starts with `bool` and is valid GLSL, so it's skipped.
    const vecStart = /^\(*\s*bvec([234])/;
    const isWs = (c) => c === " " || c === "\n" || c === "\t" || c === "\r";
    const isOp = (c) => "=+-*/%<>!?:,;{}[]".indexOf(c) !== -1;
    // Operand boundaries: the maximal balanced expression beside the operator,
    // stopping at a depth-0 operator / paren / comma — handles nesting + chains.
    const rightSpan = (s, from) => {
      let i = from;
      while (i < s.length && isWs(s[i])) i += 1;
      const start = i;
      let depth = 0;
      while (i < s.length) {
        const c = s[i];
        if (c === "(") depth += 1;
        else if (c === ")") { if (depth === 0) break; depth -= 1; }
        else if (depth === 0) {
          if (isOp(c)) break;
          if ((c === "&" && s[i + 1] === "&") || (c === "|" && s[i + 1] === "|")) break;
        }
        i += 1;
      }
      return { start, end: i };
    };
    const leftSpan = (s, to) => {
      let i = to - 1;
      while (i >= 0 && isWs(s[i])) i -= 1;
      const end = i + 1;
      let depth = 0;
      while (i >= 0) {
        const c = s[i];
        if (c === ")") depth += 1;
        else if (c === "(") { if (depth === 0) break; depth -= 1; }
        else if (depth === 0) {
          if (isOp(c)) break;
          if ((c === "&" && s[i - 1] === "&") || (c === "|" && s[i - 1] === "|")) break;
        }
        i -= 1;
      }
      return { start: i + 1, end };
    };
    let out = src;
    let guard = 0;
    for (;;) {
      if ((guard += 1) > 200000) break;
      let did = false;
      for (let i = 0; i + 1 < out.length; i += 1) {
        const and = out[i] === "&" && out[i + 1] === "&";
        const or = out[i] === "|" && out[i + 1] === "|";
        if (!and && !or) continue;
        const L = leftSpan(out, i);
        const R = rightSpan(out, i + 2);
        const lt = out.slice(L.start, L.end).trim();
        const rt = out.slice(R.start, R.end).trim();
        const lm = vecStart.exec(lt);
        const rm = vecStart.exec(rt);
        if (!lm || !rm || lm[1] !== rm[1]) continue; // both sides same-size bvec
        const n = lm[1];
        const repl = and
          ? `(vec${n}(${lt}) * vec${n}(${rt}))`
          : `max(vec${n}(${lt}), vec${n}(${rt}))`;
        out = out.slice(0, L.start) + repl + out.slice(R.end);
        did = true;
        break; // indices shifted — restart the scan
      }
      if (!did) break;
    }
    return out;
  }

  /**
   * The converter declares preset user textures as bare `sampler2D sampler_NAME;`
   * — illegal in GLSL ES (samplers must be `uniform`), and `getUserSamplers` (which
   * matches `uniform sampler2D sampler_…`) misses them too. Add the qualifier so the
   * shader compiles AND the sampler is registered as a user texture (unbound → black,
   * which is fine — we don't have the source image anyway). Idempotent.
   */
  static fixSamplerDecls(src) {
    if (!src || src.indexOf("sampler2D") === -1) return src;
    return src
      .replace(/\bsampler2D\s+(sampler_\w+)\s*;/g, "uniform sampler2D $1;")
      .replace(/\buniform\s+uniform\s+/g, "uniform ");
  }

  static getShaderParts(t) {
    const sbIndex = t.indexOf("shader_body");
    if (t && sbIndex > -1) {
      const beforeShaderBody = t.substring(0, sbIndex);
      const afterShaderBody = t.substring(sbIndex);
      const firstCurly = afterShaderBody.indexOf("{");
      const lastCurly = afterShaderBody.lastIndexOf("}");
      const shaderBody = afterShaderBody.substring(firstCurly + 1, lastCurly);
      return [beforeShaderBody, shaderBody];
    }

    return ["", t];
  }

  static getFragmentFloatPrecision(gl) {
    if (
      gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision >
      0
    ) {
      return "highp";
    } else if (
      gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT)
        .precision > 0
    ) {
      return "mediump";
    }
    return "lowp";
  }

  static getUserSamplers(text) {
    const samplers = [];
    const lineMatches = text.match(lineMatcher);
    if (lineMatches && lineMatches.length > 0) {
      for (let i = 0; i < lineMatches.length; i++) {
        const samplerMatches = lineMatches[i].match(samplerMatcher);
        if (samplerMatches && samplerMatches.length > 0) {
          const sampler = samplerMatches[1];
          samplers.push({ sampler });
        }
      }
    }
    return samplers;
  }
}
