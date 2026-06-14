/**
 * Generate synthetic test audio for consistent validation.
 * Creates a 5-second audio buffer with known characteristics.
 *
 * Segments:
 *   0-1s: Silence (warmup period)
 *   1-2s: Low bass tone (60Hz) - tests bass response
 *   2-3s: High treble tone (8kHz) - tests treble response
 *   3-4s: Beat pattern (4 beats/sec) - tests beat sync
 *   4-5s: Full spectrum sweep - tests overall response
 */

export function generateTestAudio(audioContext) {
  const sampleRate = audioContext.sampleRate;
  const duration = 5;
  const buffer = audioContext.createBuffer(2, sampleRate * duration, sampleRate);

  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  for (let i = 0; i < buffer.length; i++) {
    const t = i / sampleRate;
    let sample = 0;

    if (t < 1) {
      // Silence (warmup period)
      sample = 0;
    } else if (t < 2) {
      // Low bass tone (60Hz)
      sample = 0.7 * Math.sin(2 * Math.PI * 60 * t);
    } else if (t < 3) {
      // High treble tone (8kHz)
      sample = 0.5 * Math.sin(2 * Math.PI * 8000 * t);
    } else if (t < 4) {
      // Beat pattern (4 beats per second)
      const beatPhase = (t * 4) % 1;
      sample = beatPhase < 0.1 ? 0.8 : 0.1;
      sample *= Math.sin(2 * Math.PI * 100 * t);
    } else {
      // Full spectrum sweep (100Hz to 4100Hz)
      const freq = 100 + (t - 4) * 4000;
      sample = 0.6 * Math.sin(2 * Math.PI * freq * t);
    }

    left[i] = sample;
    right[i] = sample;
  }

  return buffer;
}

export function createTestAudioSource(audioContext) {
  const buffer = generateTestAudio(audioContext);
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  return source;
}
