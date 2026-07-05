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
  uniform float uIdleMode;      // 0 radial · 1 horizontal · 2 vertical · 3 diagonal

  uniform vec3  uCursor;        // cursor position in mesh-local space
  uniform float uCursorActive;  // 0..1
  uniform float uWaveAmp;
  uniform float uWaveFreq;
  uniform float uWaveSpeed;     // continuous time for cursor ripple
  uniform float uCursorRadius;

  uniform float uSize;
  uniform float uPixelRatio;

  uniform float uAssemble;      // 0..1 — particles fly from aScatter to their spot
  uniform float uSparkle;       // 0/1 — twinkle on/off
  uniform float uTime;          // continuous time for the sparkle pulse

  attribute vec3  aColor;
  attribute float aRand;
  attribute vec3  aScatter;     // random shell position the particle assembles from

  varying vec3  vColor;
  varying float vDepth;
  varying float vFade;          // assembly fade-in
  varying float vSpark;         // sparkle brightness boost

  void main() {
    // --- assembly: staggered per particle by aRand, eased ---
    float t = clamp(uAssemble * 1.45 - aRand * 0.45, 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);
    vec3 pos = mix(aScatter, position, t);
    vFade = mix(0.35, 1.0, t);

    // --- ambient idle wave (seamless over uIdlePhase 0..2π) ---
    // The wave travels along a chosen direction; displacement stays on Z.
    float coord;
    if (uIdleMode < 0.5)      coord = length(pos.xy);             // radial ripple
    else if (uIdleMode < 1.5) coord = pos.x;                      // horizontal
    else if (uIdleMode < 2.5) coord = pos.y;                      // vertical
    else                      coord = (pos.x + pos.y) * 0.70710678; // diagonal
    float idle = sin(coord * uIdleFreq + uIdlePhase);
    pos.z += idle * uIdleAmp;

    // --- cursor ripple (depth only — never displaces along XY, so the
    //     silhouette of the original shape is preserved) ---
    vec2 d = pos.xy - uCursor.xy;
    float dist = length(d);
    float falloff = exp(-(dist * dist) / (uCursorRadius * uCursorRadius));
    float ripple = sin(dist * uWaveFreq - uWaveSpeed);
    pos.z += ripple * falloff * uWaveAmp * uCursorActive;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // --- sparkle: a sharp, per-particle twinkle pulse ---
    float pulse = pow(0.5 + 0.5 * sin(uTime * 4.0 + aRand * 40.0), 10.0);
    vSpark = uSparkle * pulse;

    // perspective size attenuation
    gl_PointSize = uSize * uPixelRatio * (8.0 / -mvPosition.z);
    gl_PointSize *= (0.7 + 0.6 * aRand);
    gl_PointSize *= 1.0 + vSpark * 0.6;

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
  varying float vFade;
  varying float vSpark;

  void main() {
    // round, soft-edged point
    vec2 uv = gl_PointCoord - 0.5;
    float r = length(uv);
    if (r > 0.5) discard;
    float alpha = smoothstep(0.5, 0.18, r) * uOpacity * vFade;

    vec3 color = vColor * (1.0 + vSpark * 1.4);

    // optional depth fog so the back of the volume reads as further away
    if (uUseFog > 0.5) {
      float f = clamp((vDepth - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
      color = mix(color, uFogColor, f * 0.85);
      alpha *= (1.0 - f * 0.45);
    }

    gl_FragColor = vec4(color, alpha);
  }
`;
