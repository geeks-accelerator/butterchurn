/**
 * Color Taxonomy Analysis Module
 *
 * Extracts 4 flat color fields from preset analysis:
 * - colorPaletteType: How colors behave (static/dynamic)
 * - dominantHue: Color temperature family
 * - brightness: Dark/bright/balanced
 * - colorComplexity: Number of distinct colors
 *
 * Note: Static analysis cannot predict final rendered colors for presets
 * with complex shaders. Use the _experimental flag and Phase 8 validation.
 */

// Palette types — how colors behave
export const PALETTE_TYPES = {
  static_monochrome: 'Single color, no dynamic changes',
  static_multicolor: 'Multiple fixed colors',
  audio_reactive:    'Colors change with bass/treble',
  time_cycling:      'Colors animate over time',
  shader_driven:     'Complex shader color manipulation'
};

// Dominant hue families
export const HUE_FAMILIES = {
  warm:    'Red, orange, yellow',
  cool:    'Blue, cyan, purple',
  natural: 'Green, teal',
  neutral: 'White, gray, black',
  rainbow: 'Multiple hue families'
};

// Brightness profiles
export const BRIGHTNESS_PROFILES = {
  dark:     'Low gamma, high decay, darken enabled',
  bright:   'High gamma, brighten enabled',
  inverted: 'Invert/solarize effects',
  balanced: 'Normal settings'
};

// Color complexity levels
export const COMPLEXITY_LEVELS = {
  simple:   '1-2 unique hues',
  moderate: '3-4 hues or some dynamic color',
  complex:  '5+ hues or heavy shader color ops'
};

/**
 * Extract static colors from preset shapes and waves
 * @param {Object} preset - Butterchurn preset
 * @returns {Array} Array of color objects {r, g, b, a}
 */
export function extractStaticColors(preset) {
  const colors = [];

  // Shapes
  (preset.shapes || []).forEach(s => {
    if (s.baseVals?.enabled || s.enabled) {
      const bv = s.baseVals || s;
      colors.push({
        r: bv.r ?? 0, g: bv.g ?? 0, b: bv.b ?? 0, a: bv.a ?? 1
      });
      if (bv.r2 !== undefined) {
        colors.push({
          r: bv.r2 ?? 0, g: bv.g2 ?? 0, b: bv.b2 ?? 0, a: bv.a2 ?? 1
        });
      }
    }
  });

  // Waves
  (preset.waves || []).forEach(w => {
    if (w.baseVals?.enabled || w.enabled) {
      const bv = w.baseVals || w;
      colors.push({
        r: bv.r ?? 0, g: bv.g ?? 0, b: bv.b ?? 0, a: bv.a ?? 1
      });
    }
  });

  // Base wave color
  const bv = preset.baseVals || {};
  colors.push({
    r: bv.wave_r ?? 1, g: bv.wave_g ?? 1, b: bv.wave_b ?? 1, a: 1
  });

  return colors.filter(c => c.a > 0.1);
}

/**
 * Classify RGB color into named color
 * @param {number} r - Red (0-1)
 * @param {number} g - Green (0-1)
 * @param {number} b - Blue (0-1)
 * @returns {string} Color name
 */
export function classifyRgbColor(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : (l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min));

  if (s < 0.1) {
    if (l < 0.15) return 'BLACK';
    if (l > 0.85) return 'WHITE';
    return 'GRAY';
  }

  let h = 0;
  if (max !== min) {
    if (max === r) h = (g - b) / (max - min) + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / (max - min) + 2;
    else h = (r - g) / (max - min) + 4;
    h *= 60;
  }

  if (h < 30 || h >= 330) return 'RED';
  if (h < 60) return 'ORANGE';
  if (h < 90) return 'YELLOW';
  if (h < 150) return 'GREEN';
  if (h < 210) return 'CYAN';
  if (h < 270) return 'BLUE';
  if (h < 330) return 'PURPLE';
  return 'RED';
}

/**
 * Classify dominant hue family from colors
 * @param {Array} colors - Array of color objects
 * @returns {string} Hue family (warm/cool/natural/neutral/rainbow)
 */
export function classifyDominantHue(colors) {
  const families = { warm: 0, cool: 0, natural: 0, neutral: 0 };
  const warmColors = ['RED', 'ORANGE', 'YELLOW'];
  const coolColors = ['BLUE', 'CYAN', 'PURPLE'];
  const naturalColors = ['GREEN'];
  const neutralColors = ['WHITE', 'GRAY', 'BLACK'];

  colors.forEach(c => {
    const name = classifyRgbColor(c.r, c.g, c.b);
    const weight = c.a || 1;
    if (warmColors.includes(name)) families.warm += weight;
    else if (coolColors.includes(name)) families.cool += weight;
    else if (naturalColors.includes(name)) families.natural += weight;
    else families.neutral += weight;
  });

  const sorted = Object.entries(families).sort((a, b) => b[1] - a[1]);
  const nonZero = sorted.filter(([_, v]) => v > 0);

  if (nonZero.length >= 3) return 'rainbow';
  return sorted[0][0];
}

/**
 * Detect dynamic color manipulation in equations
 * @param {Object} preset - Butterchurn preset
 * @returns {Object} Dynamic color detection results
 */
export function detectDynamicColor(preset) {
  const allEqs = [
    preset.comp_eqs_str || '',
    preset.pixel_eqs_str || '',
    preset.frame_eqs_str || '',
    ...(preset.shapes || []).map(s => s.frame_eqs_str || '')
  ].join(' ').toLowerCase();

  const hasDirectColor = ['ret.r', 'ret.g', 'ret.b', '.rgb'].some(op => allEqs.includes(op));
  const hasAudioColor = /bass.*\br|treb.*\bb|mid.*color/i.test(allEqs);
  const hasTimeCycling = /time.*\br|sin.*color/i.test(allEqs);

  return {
    hasDynamicColor: hasDirectColor || hasAudioColor || hasTimeCycling,
    hasAudioColor,
    hasTimeCycling
  };
}

/**
 * Classify brightness profile from base values
 * @param {Object} baseVals - Preset baseVals
 * @returns {string} Brightness profile
 */
export function classifyBrightness(baseVals) {
  const gamma = baseVals.gammaadj ?? baseVals.gamma ?? 1;
  if (baseVals.invert > 0 || baseVals.solarize > 0) return 'inverted';
  if (gamma < 0.8 || baseVals.darken > 0 || (baseVals.decay ?? 0) > 0.98) return 'dark';
  if (gamma > 1.5 || baseVals.brighten > 0) return 'bright';
  return 'balanced';
}

/**
 * Analyze preset color and return all 4 flat fields
 * @param {Object} preset - Butterchurn preset
 * @returns {Object} Color taxonomy fields
 */
export function analyzePresetColor(preset) {
  const colors = extractStaticColors(preset);
  const dynamic = detectDynamicColor(preset);
  const uniqueHues = new Set(colors.map(c => classifyRgbColor(c.r, c.g, c.b))).size;

  let paletteType = 'static_monochrome';
  if (dynamic.hasAudioColor) paletteType = 'audio_reactive';
  else if (dynamic.hasTimeCycling) paletteType = 'time_cycling';
  else if (dynamic.hasDynamicColor) paletteType = 'shader_driven';
  else if (uniqueHues >= 2) paletteType = 'static_multicolor';

  const complexity = uniqueHues >= 5 || dynamic.hasDynamicColor
    ? 'complex'
    : uniqueHues >= 3
      ? 'moderate'
      : 'simple';

  return {
    colorPaletteType: paletteType,
    dominantHue: classifyDominantHue(colors),
    brightness: classifyBrightness(preset.baseVals || {}),
    colorComplexity: complexity
  };
}
