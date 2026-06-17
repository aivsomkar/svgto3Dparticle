// Vertex + fragment shaders for the particle system.
//
// Two motion sources are combined in the vertex shader:
//   1. An ambient "idle" wave that ripples across the whole shape. Its temporal
//      term is driven by uIdlePhase so that, when uIdlePhase sweeps 0..2π, the
//      animation is perfectly seamless — this is what makes exported loops tile.
//   2. A cursor ripple: a sine wave radiating from uCursor with a gaussian
//      falloff, plus a small outward push. uCursorActive fades it in/out.

export const vertexShader = /* glsl */ `
  uniform float uIdlePhase;     // 0..2π, loops seamlessly
  uniform float uIdleAmp;
  uniform float uIdleFreq;

  uniform vec3  uCursor;        // cursor position in mesh-local space
  uniform float uCursorActive;  // 0..1
  uniform float uWaveAmp;
  uniform float uWaveFreq;
  uniform float uWaveSpeed;     // continuous time for cursor ripple
  uniform float uCursorRadius;

  uniform float uSize;
  uniform float uPixelRatio;

  attribute vec3  aColor;
  attribute float aRand;

  varying vec3  vColor;
  varying float vDepth;

  void main() {
    vec3 pos = position;

    // --- ambient idle wave (seamless over uIdlePhase 0..2π) ---
    float idle =
        sin(pos.x * uIdleFreq + uIdlePhase + aRand * 6.2831)
      + sin(pos.y * uIdleFreq * 0.9 - uIdlePhase);
    pos.z += idle * uIdleAmp * 0.5;

    // --- cursor ripple (depth only — never displaces along XY, so the
    //     silhouette of the original shape is preserved) ---
    vec2 d = pos.xy - uCursor.xy;
    float dist = length(d);
    float falloff = exp(-(dist * dist) / (uCursorRadius * uCursorRadius));
    float ripple = sin(dist * uWaveFreq - uWaveSpeed);
    pos.z += ripple * falloff * uWaveAmp * uCursorActive;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // perspective size attenuation
    gl_PointSize = uSize * uPixelRatio * (8.0 / -mvPosition.z);
    gl_PointSize *= (0.7 + 0.6 * aRand);

    vColor = aColor;
    vDepth = -mvPosition.z;
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uOpacity;
  uniform vec3  uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uUseFog;

  varying vec3  vColor;
  varying float vDepth;

  void main() {
    // round, soft-edged point
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;
    float alpha = smoothstep(0.5, 0.18, r) * uOpacity;

    vec3 color = vColor;

    // optional depth fog so the back of the volume reads as further away
    if (uUseFog > 0.5) {
      float f = clamp((vDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
      color = mix(color, uFogColor, f * 0.85);
      alpha *= (1.0 - f * 0.45);
    }

    gl_FragColor = vec4(color, alpha);
  }
`;
