# Butterchurn V2 Performance Optimizations

## Future Performance Improvements

This document tracks potential performance optimizations identified during code review that can be implemented in future iterations.

## 1. Vertex Buffer Optimization (Minor Impact)

### Current Implementation
The `drawFullScreenQuad()` function re-binds the vertex buffer and sets the vertex attribute pointer on every single draw call for every shader layer:

```javascript
drawFullScreenQuad() {
  const gl = this.gl;

  // This happens 3x per frame (pixel, warp, composite layers)
  gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
```

### Proposed Optimization
Set up vertex attributes once per frame or use a Vertex Array Object (VAO) for WebGL2:

```javascript
// Option 1: Setup once per frame
initializeFrame() {
  gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
}

// Option 2: Use VAO (WebGL2 only)
createVAO() {
  this.vao = gl.createVertexArray();
  gl.bindVertexArray(this.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
  gl.bindVertexArray(null);
}

drawFullScreenQuadOptimized() {
  gl.bindVertexArray(this.vao);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
}
```

### Expected Impact
- **Performance Gain**: 1-2% improvement in render time
- **Complexity**: Low
- **Risk**: Minimal

## 2. Shader Uniform Caching (Minor Impact)

### Current Implementation
Uniform locations are looked up every frame:

```javascript
const timeLocation = gl.getUniformLocation(programs.pixel, 'uTime');
if (timeLocation !== null) {
  gl.uniform1f(timeLocation, currentTime);
}
```

### Proposed Optimization
Cache uniform locations when compiling shaders:

```javascript
// During shader compilation
this.uniformLocations[presetId] = {
  pixel: {
    uTime: gl.getUniformLocation(programs.pixel, 'uTime'),
    uBassLevel: gl.getUniformLocation(programs.pixel, 'uBassLevel'),
    // ... etc
  }
};

// During rendering
const locs = this.uniformLocations[presetId].pixel;
if (locs.uTime !== null) {
  gl.uniform1f(locs.uTime, currentTime);
}
```

### Expected Impact
- **Performance Gain**: 0.5-1% improvement
- **Complexity**: Low
- **Risk**: Minimal

## 3. Texture State Management (Minor Impact)

### Current Implementation
Texture parameters are set every time textures are created:

```javascript
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
```

### Proposed Optimization
Create a texture wrapper that caches state:

```javascript
class ManagedTexture {
  constructor(gl, width, height) {
    this.texture = gl.createTexture();
    this.setupOnce(gl, width, height);
  }

  setupOnce(gl, width, height) {
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
}
```

### Expected Impact
- **Performance Gain**: 0.2-0.5% improvement
- **Complexity**: Low
- **Risk**: Minimal

## 4. Audio Processing Optimization (Moderate Impact)

### Current Implementation
Audio data is processed every frame with multiple passes:

```javascript
for (let i = 0; i < fftSize / 2; i++) {
  if (i < bassEnd) bassSum += audioData[i];
  else if (i < midEnd) midSum += audioData[i];
  else trebleSum += audioData[i];
}
```

### Proposed Optimization
Use SIMD operations or Web Workers for audio processing:

```javascript
// Option 1: Batch processing with typed arrays
const bass = audioData.subarray(0, bassEnd);
const bassLevel = bass.reduce((a, b) => a + b, 0) / bass.length / 255;

// Option 2: Web Worker for audio processing
this.audioWorker.postMessage({ audioData });
```

### Expected Impact
- **Performance Gain**: 2-5% improvement
- **Complexity**: Medium
- **Risk**: Low

## 5. Frame Buffer Pool (Moderate Impact)

### Current Implementation
Framebuffers are created on-demand and never reused:

```javascript
if (!this.pixelFramebuffer) {
  this.pixelFramebuffer = gl.createFramebuffer();
  // ... setup
}
```

### Proposed Optimization
Implement a framebuffer pool for reuse:

```javascript
class FramebufferPool {
  constructor(gl) {
    this.gl = gl;
    this.pool = [];
    this.inUse = new Set();
  }

  acquire(width, height) {
    const fb = this.pool.pop() || this.create(width, height);
    this.inUse.add(fb);
    return fb;
  }

  release(fb) {
    this.inUse.delete(fb);
    this.pool.push(fb);
  }
}
```

### Expected Impact
- **Performance Gain**: 1-3% improvement
- **Complexity**: Medium
- **Risk**: Low

## Implementation Priority

1. **High Priority** (Easy wins)
   - Vertex Buffer Optimization
   - Shader Uniform Caching

2. **Medium Priority** (Moderate effort, good impact)
   - Audio Processing Optimization
   - Frame Buffer Pool

3. **Low Priority** (Minimal impact)
   - Texture State Management

## Benchmarking Recommendations

Before implementing any optimization:

1. **Establish Baseline**: Record current performance metrics
   ```javascript
   performance.mark('render-start');
   // ... rendering code
   performance.mark('render-end');
   performance.measure('render', 'render-start', 'render-end');
   ```

2. **Profile Bottlenecks**: Use Chrome DevTools Performance tab

3. **A/B Testing**: Toggle optimizations with feature flags

4. **Measure Impact**: Compare before/after metrics

## Notes from Code Review

As identified by Gemini's code review (January 2025):
- The system is already well-optimized with 73% performance improvements
- Most remaining optimizations offer minor gains (1-5%)
- The codebase prioritizes stability over micro-optimizations
- Current performance is sufficient for 60 FPS at 1280x720

## Conclusion

The Butterchurn V2 system is already highly performant. These optimizations represent incremental improvements rather than critical performance fixes. Implementation should be prioritized based on ease of implementation and measurable impact on user experience.