/**
 * TypeScript type definitions for Butterchurn v2
 * These help catch type-related bugs during development
 */

// Device capability types
export interface DeviceCapabilities {
  basic: boolean;
  simd: boolean;
  threads: boolean;
  bulkMemory: boolean;
  referenceTypes: boolean;
  memory: number;
  cores: number;
  gpu: 'discrete' | 'integrated' | 'mobile' | 'unknown';
  isMobile: boolean;
  tier: 'high_end' | 'mid_range' | 'low_end' | 'mobile';
  webgl2: boolean;
  audioWorklet: boolean;
  offscreenCanvas: boolean;
}

export interface WASMVersion {
  version: number;
  reason: string;
  features?: string[];
  fallback?: string;
}

export interface RenderingStrategy {
  wasmVersion: string;
  engine: string;
  resolution: number;
  fftSize: number;
  targetFPS: number;
  candidates: number;
  features: string[];
}

// Preset types
export interface EmergencyPreset {
  id: string;
  name: string;
  description: string;
  warp?: string;
  pixel?: string;
  composite?: string;
  settings: PresetSettings;
}

export interface PresetSettings {
  fps: number;
  meshSize: number;
  aspectRatio: number;
  enableComposite: boolean;
  enableWarp: boolean;
  enableEcho?: boolean;
  echoAlpha?: number;
  echoZoom?: number;
}

// Logger types
export interface SessionLog {
  session_id: number;
  device: DeviceFingerprint | null;
  failures: Record<string, FailureRecord>;
  started: string;
}

export interface DeviceFingerprint {
  tier: string;
  memory: number;
  cores: number;
  gpu: string;
  browser: string;
  timestamp: number;
}

export interface FailureRecord {
  count: number;
  reasons: FailureReason[];
  first_failure: number;
  last_failure: number | null;
}

export interface FailureReason {
  time: number;
  reason: string;
  audio_playing: boolean;
  fps: number;
  memory?: number;
  frame_data?: any;
}

// WebGL types
export interface ShaderProgram {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  attributes: Record<string, number>;
}

export interface CompiledPreset {
  ready: boolean;
  compiledAt: number;
  shaders: Record<string, any> | null;
  programs: Record<string, ShaderProgram> | null;
  original: EmergencyPreset;
  error?: string;
}

// Audio types
export interface AudioData {
  timeByteArray: Uint8Array;
  timeByteArrayL: Uint8Array;
  timeByteArrayR: Uint8Array;
  fftSize: number;
}

export interface AudioFeatures {
  bassLevel: number;
  midLevel: number;
  trebleLevel: number;
  audioLevel: number;
  energy: number;
  beatDetected: boolean;
}

// Main visualizer types
export interface VisualizerOptions {
  width?: number;
  height?: number;
  pixelRatio?: number;
  textureRatio?: number;
  outputFXAA?: boolean;
  targetFPS?: number;
  butterchurnOpts?: any;
}

export interface VisualizerContext {
  deviceTier: string;
  audioLevel: number;
  fps: number;
  frameCount: number;
  lastPresetSwitch: number;
}

// Module exports
export interface ButterchurnV2Module {
  ButterchurnV2: typeof ButterchurnV2;
  createVisualizer: (canvas: HTMLCanvasElement, options?: VisualizerOptions) => Promise<ButterchurnV2>;
  detectCapabilities: () => Promise<DeviceCapabilities>;
  emergencyManager: EmergencyPresetManager;
  presetLogger: PresetFailureLogger;
  wasmDetector: WASMCapabilityDetector;
  wasmCompiler: AdaptiveWASMCompiler;
  frameAnalyzer: LiveFrameAnalyzer;
}

// Class declarations
export declare class ButterchurnV2 {
  constructor(canvas: HTMLCanvasElement, width: number, height: number, options?: VisualizerOptions);
  initialize(): Promise<void>;
  loadPreset(preset: any, blendTime?: number): void;
  render(audioData: AudioData): void;
  resize(width: number, height: number): void;
  setOutputAA(useAA: boolean): void;
  toDataURL(): string;
  launchSongTitleAnim(text: string): void;
}

export declare class WASMCapabilityDetector {
  detectCapabilities(): Promise<{ version: WASMVersion; features: DeviceCapabilities; strategy: RenderingStrategy }>;
  getDetailedReport(): any;
}

export declare class EmergencyPresetManager {
  getEmergencyPreset(context?: VisualizerContext): {
    preset: EmergencyPreset;
    compiled: CompiledPreset | undefined;
    key: string;
    isEmergency: boolean;
  };
  precompileAll(): Promise<void>;
  isEmergencyPreset(presetId: string): boolean;
}

export declare class PresetFailureLogger {
  initialize(): Promise<void>;
  logFailure(presetHash: string, reason: string, context: VisualizerContext): void;
  isBlocked(presetHash: string, device?: DeviceFingerprint | null): { blocked: boolean; reason?: string };
  exportBlocklist(): any;
  importBlocklist(externalBlocklist: string | any): { success: boolean; imported?: number; error?: string };
  getFailureReport(): any;
}

export declare class AdaptiveWASMCompiler {
  initialize(): Promise<void>;
  compileShader(code: string, type: string): Promise<any>;
  getVersion(): string;
  getCompileOptions(): any;
}

export declare class LiveFrameAnalyzer {
  analyzeFrame(imageData: ImageData): void;
  detectBlackFrame(): boolean;
  getColorHistogram(): any;
  getSpatialComplexity(): number;
  isStaticFrame(): boolean;
  getFrameReport(): any;
}