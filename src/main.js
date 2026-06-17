import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ParticleSystem } from "./particles.js";
import { sampleSVG } from "./svgSampler.js";
import { recordWebM, exportGIF, exportPNGSequence } from "./exporters.js";
import { buildUI } from "./ui.js";
import { SHAPES, SHAPE_KEYS, textToSVG } from "./presets.js";
import { buildEmbedSnippet, buildEmbedHTML } from "./embed.js";

const TWO_PI = Math.PI * 2;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// ---------------------------------------------------------------------------
// Config — the original control set
// ---------------------------------------------------------------------------
const config = {
  subject: "star",
  // shape
  density: 0.55,
  depth: 0.4,
  thickness: 0.6,
  sampleRes: 360,
  useSvgColor: true,
  uniformColor: "#9fe9df",
  // look
  particleSize: 6.0,
  opacity: 0.95,
  additive: false,
  fog: true,
  background: "#0c1016",
  // ambient wave
  ambientWave: true,
  waveDir: "radial",
  idleAmp: 0.12,
  idleFreq: 3.5,
  idleSpeed: 1.1,
  // rotation
  autoRotate: true,
  rotateSpeed: 0.35,
  tilt: 0.32,
  // cursor wave
  cursorWave: true,
  waveAmp: 0.4,
  waveFreq: 14.0,
  waveSpeed: 6.0,
  cursorRadius: 0.5,
  // export
  exportFps: 30,
  exportDuration: 4,
  exportRotations: 1,
  exportRes: 1024,
  exportTransparent: false,
  webmSeconds: 6,
  embedTransparent: false,
};

// ---------------------------------------------------------------------------
// Renderer / scene / cameras
// ---------------------------------------------------------------------------
const canvasEl = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const FRUST = 2.4;
const perspCam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
perspCam.position.set(0, 0, 5);
const orthoCam = new THREE.OrthographicCamera(-FRUST, FRUST, FRUST, -FRUST, 0.1, 100);
orthoCam.position.set(0, 0, 5);
let activeCamera = perspCam;
let controls;

function buildControls() {
  if (controls) controls.dispose();
  controls = new OrbitControls(activeCamera, canvasEl);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 2;
  controls.maxDistance = 20;
}
buildControls();

const particles = new ParticleSystem({ pixelRatio: renderer.getPixelRatio() });
scene.add(particles.points);
const uniforms = particles.uniforms;

// ---------------------------------------------------------------------------
// Cursor ripple origin
// ---------------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2(-2, -2);
let cursorTargetActive = 0;
canvasEl.addEventListener("pointermove", (e) => {
  const r = canvasEl.getBoundingClientRect();
  pointerNDC.x = ((e.clientX - r.left) / r.width) * 2 - 1;
  pointerNDC.y = -((e.clientY - r.top) / r.height) * 2 + 1;
});
canvasEl.addEventListener("pointerleave", () => (cursorTargetActive = 0));

// ---------------------------------------------------------------------------
// Push config → uniforms / renderer
// ---------------------------------------------------------------------------
function applyConfig() {
  uniforms.uSize.value = config.particleSize;
  uniforms.uOpacity.value = config.opacity;
  uniforms.uIdleAmp.value = config.ambientWave ? config.idleAmp : 0;
  uniforms.uIdleFreq.value = config.idleFreq;
  uniforms.uIdleMode.value = { radial: 0, horizontal: 1, vertical: 2, diagonal: 3 }[config.waveDir] ?? 0;
  uniforms.uWaveAmp.value = config.waveAmp;
  uniforms.uWaveFreq.value = config.waveFreq;
  uniforms.uCursorRadius.value = config.cursorRadius;
  uniforms.uUseFog.value = config.fog ? 1 : 0;
  uniforms.uFogColor.value.set(config.background);
  particles.setBlending(config.additive);
  renderer.setClearColor(new THREE.Color(config.background), config.exportTransparent ? 0 : 1);
  document.documentElement.style.setProperty("--bg", config.background);
}

// ---------------------------------------------------------------------------
// Shape loading
// ---------------------------------------------------------------------------
let hasShape = false;
let currentSVG = SHAPES.star();

async function loadSVGText(svgText) {
  currentSVG = svgText;
  const data = await sampleSVG(svgText, {
    density: config.density, depth: config.depth, thickness: config.thickness,
    sampleRes: config.sampleRes, useSvgColor: config.useSvgColor,
  });
  particles.setData(data);
  if (!config.useSvgColor) particles.setUniformColor(config.uniformColor);
  hasShape = true;
  ui.setStatus(`${data.count.toLocaleString()} particles`);
  return data.count;
}
async function rebuild() { if (currentSVG) await loadSVGText(currentSVG); }

// ---------------------------------------------------------------------------
// Drag & drop
// ---------------------------------------------------------------------------
const dropOverlay = document.getElementById("drop-overlay");
let dragDepth = 0;
window.addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; dropOverlay.classList.remove("hidden"); });
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("dragleave", (e) => { e.preventDefault(); if (--dragDepth <= 0) dropOverlay.classList.add("hidden"); });
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.add("hidden");
  const file = [...(e.dataTransfer?.files || [])].find((f) => f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg"));
  if (file) { config.subject = ""; ui.sync(); await loadSVGText(await file.text()); }
});

// ---------------------------------------------------------------------------
// Animation loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let exporting = false;

function frame() {
  requestAnimationFrame(frame);
  if (exporting) return;
  const dt = Math.min(clock.getDelta(), 0.05);

  uniforms.uIdlePhase.value = (uniforms.uIdlePhase.value + dt * config.idleSpeed) % TWO_PI;
  uniforms.uWaveSpeed.value += dt * config.waveSpeed;

  if (config.cursorWave) {
    raycaster.setFromCamera(pointerNDC, activeCamera);
    const hits = raycaster.intersectObject(particles.pickPlane, false);
    if (hits.length) { uniforms.uCursor.value.copy(particles.points.worldToLocal(hits[0].point.clone())); cursorTargetActive = 1; }
    else cursorTargetActive = 0;
  } else cursorTargetActive = 0;
  uniforms.uCursorActive.value += (cursorTargetActive - uniforms.uCursorActive.value) * Math.min(1, dt * 8);

  if (config.autoRotate) particles.points.rotation.y += dt * config.rotateSpeed;
  particles.points.rotation.x = config.tilt;

  controls.update();
  renderer.render(scene, activeCamera);
}

// ---------------------------------------------------------------------------
// Export driver (seamless loop) + resolution swap
// ---------------------------------------------------------------------------
function makeLoopRenderer() {
  const saved = { phase: uniforms.uIdlePhase.value, active: uniforms.uCursorActive.value, rotY: particles.points.rotation.y };
  const baseRotY = saved.rotY;
  const renderFrame = (phase) => {
    uniforms.uCursorActive.value = 0;
    uniforms.uIdlePhase.value = config.ambientWave ? phase * TWO_PI : 0;
    const rotations = config.autoRotate ? config.exportRotations : 0;
    particles.points.rotation.y = baseRotY + phase * TWO_PI * rotations;
    particles.points.rotation.x = config.tilt;
    renderer.render(scene, activeCamera);
  };
  const restore = () => {
    uniforms.uIdlePhase.value = saved.phase;
    uniforms.uCursorActive.value = saved.active;
    particles.points.rotation.y = saved.rotY;
  };
  return { renderFrame, restore };
}

async function withExportResolution(longEdge, fn) {
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  const sc = longEdge / Math.max(w, h);
  const tw = Math.round(w * sc), th = Math.round(h * sc);
  renderer.setPixelRatio(1);
  renderer.setSize(tw, th, false);
  setCamAspect(tw / th);
  uniforms.uPixelRatio.value = sc;
  try { return await fn(tw, th); }
  finally { onResize(); }
}

// ---------------------------------------------------------------------------
// Camera helpers
// ---------------------------------------------------------------------------
function setCamAspect(aspect) {
  perspCam.aspect = aspect; perspCam.updateProjectionMatrix();
  orthoCam.left = -FRUST * aspect; orthoCam.right = FRUST * aspect;
  orthoCam.top = FRUST; orthoCam.bottom = -FRUST; orthoCam.updateProjectionMatrix();
}
function onResize() {
  const w = canvasEl.clientWidth || window.innerWidth;
  const h = canvasEl.clientHeight || window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);
  setCamAspect(w / h);
  uniforms.uPixelRatio.value = renderer.getPixelRatio();
}
window.addEventListener("resize", onResize);

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
async function doGIF() {
  exporting = true;
  const { renderFrame, restore } = makeLoopRenderer();
  try {
    await withExportResolution(config.exportRes, (w, h) =>
      exportGIF(renderer, renderFrame, { fps: config.exportFps, duration: config.exportDuration, width: w, height: h, transparent: config.exportTransparent, bgColor: config.background, onProgress: ui.progress("GIF") }));
    ui.setStatus("GIF saved ✓");
  } finally { restore(); exporting = false; }
}
async function doPNG() {
  exporting = true;
  const { renderFrame, restore } = makeLoopRenderer();
  try {
    await withExportResolution(config.exportRes, (w, h) =>
      exportPNGSequence(renderer, renderFrame, { fps: config.exportFps, duration: config.exportDuration, width: w, height: h, transparent: config.exportTransparent, bgColor: config.background, onProgress: ui.progress("PNG") }));
    ui.setStatus("PNG zip saved ✓");
  } finally { restore(); exporting = false; }
}
function doWebM() {
  ui.setStatus("recording WebM…");
  const rec = recordWebM(renderer, { fps: 60, bitrate: 40_000_000, transparent: config.exportTransparent });
  rec.done.then(() => ui.setStatus("WebM saved ✓"));
  setTimeout(() => rec.stop(), config.webmSeconds * 1000);
}

// ---------------------------------------------------------------------------
// Actions wired to the UI
// ---------------------------------------------------------------------------
const actions = {
  async setSubject(key) { await loadSVGText(SHAPES[key]()); },
  async uploadSVG(file) { await loadSVGText(await file.text()); },
  async setText(text) { if (text.trim()) await loadSVGText(textToSVG(text)); },

  // unified change handler for sliders / toggles / colors
  change(key) {
    applyConfig();
    if (key === "density" || key === "depth" || key === "sampleRes" || key === "thickness") rebuild();
    else if (key === "useSvgColor") { if (config.useSvgColor) rebuild(); else particles.setUniformColor(config.uniformColor); }
    else if (key === "uniformColor") { if (!config.useSvgColor) particles.setUniformColor(config.uniformColor); }
  },

  resetCam() {
    activeCamera.position.set(0, 0, 5);
    particles.points.rotation.set(config.tilt, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  },
  changeDim() {
    activeCamera = activeCamera === perspCam ? orthoCam : perspCam;
    activeCamera.position.set(0, 0, 5);
    buildControls();
  },
  shuffle() {
    config.subject = pick(SHAPE_KEYS);
    config.depth = +rand(0.1, 1).toFixed(2);
    config.density = +rand(0.35, 0.8).toFixed(2);
    config.particleSize = +rand(3, 10).toFixed(1);
    config.tilt = +rand(-0.4, 0.5).toFixed(2);
    config.rotateSpeed = +rand(0.1, 0.6).toFixed(2);
    config.idleAmp = +rand(0, 0.3).toFixed(2);
    config.idleFreq = +rand(2, 7).toFixed(1);
    config.waveAmp = +rand(0.2, 0.8).toFixed(2);
    config.waveFreq = +rand(8, 24).toFixed(1);
    config.useSvgColor = true;
    config.additive = Math.random() < 0.3;
    config.background = pick(["#0c1016", "#04060a", "#000000", "#10141b"]);
    applyConfig();
    actions.setSubject(config.subject);
    ui.sync();
  },
  exportFormat(name) {
    if (name === "embed") return actions.showEmbed();
    if (!hasShape) return ui.setStatus("drop an SVG first");
    if (name === "webm") return doWebM();
    if (name === "gif") return doGIF();
    if (name === "png") return doPNG();
  },
  showEmbed() {
    config.embedTransparent = config.exportTransparent;
    ui.showEmbed(buildEmbedSnippet(currentSVG, config));
  },
  downloadEmbed() {
    const blob = new Blob([buildEmbedHTML(currentSVG, config)], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "svg-particles-embed.html";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const ui = buildUI(config, actions);
applyConfig();
onResize();
frame();

(async () => {
  await loadSVGText(SHAPES[config.subject]());
  ui.sync();
})();
