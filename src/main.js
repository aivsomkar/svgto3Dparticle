import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ParticleSystem } from "./particles.js";
import { sampleSVG } from "./svgSampler.js";
import { recordWebM, exportGIF, exportPNGSequence } from "./exporters.js";
import { buildUI } from "./ui.js";
import { SHAPES, SHAPE_KEYS, textToSVG, LOOK_PRESETS } from "./presets.js";
import { buildEmbedSnippet, buildEmbedHTML } from "./embed.js";

const TWO_PI = Math.PI * 2;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rand = (lo, hi) => lo + Math.random() * (hi - lo);

// ---------------------------------------------------------------------------
// Config — defaults + persisted settings
// ---------------------------------------------------------------------------
const DEFAULTS = {
  subject: "star",
  // shape
  density: 0.55,
  depth: 0.1,
  thickness: 0.6,
  sampleRes: 600,
  useSvgColor: true,
  uniformColor: "#9fe9df",
  // look
  particleSize: 1.0,
  opacity: 0.95,
  additive: false,
  fog: true,
  background: "#0c1016",
  sparkle: false,
  starfield: true,
  // assembly (particles fly in from scattered space when a shape loads)
  assemble: true,
  assembleDuration: 1.6,
  // ambient wave
  ambientWave: false,
  waveDir: "radial",
  idleAmp: 0.12,
  idleFreq: 3.5,
  idleSpeed: 1.1,
  // rotation
  autoRotate: false,
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

const STORE_KEY = "svg-particles.settings.v1";
const MAX_PERSISTED_SVG = 300_000; // chars — skip persisting very large uploads

function loadStored() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return typeof data === "object" && data ? data : {};
  } catch {
    return {};
  }
}
const stored = loadStored();

// Only accept known keys with matching types so stale/corrupt storage can't break boot.
const config = { ...DEFAULTS };
for (const k of Object.keys(DEFAULTS)) {
  if (k in (stored.config || {}) && typeof stored.config[k] === typeof DEFAULTS[k]) {
    config[k] = stored.config[k];
  }
}
let saveTimer;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        config,
        svg: currentSVG && currentSVG.length <= MAX_PERSISTED_SVG ? currentSVG : null,
      }));
    } catch { /* storage full / disabled — persistence is best-effort */ }
  }, 400);
}

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
// Starfield — a sparse far shell of dim points that parallaxes with the orbit
// ---------------------------------------------------------------------------
const starfield = (() => {
  const COUNT = 450;
  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 16 + Math.random() * 22;
    pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i * 3 + 2] = r * Math.cos(phi);
    const b = 0.25 + Math.random() * 0.75;
    col[i * 3] = b; col[i * 3 + 1] = b; col[i * 3 + 2] = b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.06, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0.8, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
})();
scene.add(starfield);

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
  uniforms.uSparkle.value = config.sparkle ? 1 : 0;
  starfield.visible = config.starfield;
  particles.setBlending(config.additive);
  // Live view clears transparent so the CSS gradient backdrop shows through;
  // exports opt back into an opaque clear (see doWebM / offline compositing).
  renderer.setClearColor(new THREE.Color(config.background), 0);
  const root = document.documentElement.style;
  root.setProperty("--bg", config.background);
  const { a, b } = backdropTints(config.background);
  root.setProperty("--bg-a", a);
  root.setProperty("--bg-b", b);
}

// Two hue-shifted, slightly lifted tint stops derived from the background so
// the backdrop gradient always fits the chosen color. Near-grayscale
// backgrounds get a cool blue-teal cast instead of a meaningless hue.
function backdropTints(hex) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  const h = hsl.s < 0.05 ? 0.58 : hsl.h;
  const s = Math.max(hsl.s, 0.22);
  const stop = (dh, dl) => {
    const hue = Math.round((((h + dh) % 1) + 1) % 1 * 360);
    return `hsl(${hue}, ${Math.round(Math.min(1, s + 0.08) * 100)}%, ${Math.round(Math.min(0.32, hsl.l + dl) * 100)}%)`;
  };
  return { a: stop(0.07, 0.09), b: stop(-0.07, 0.05) };
}

// ---------------------------------------------------------------------------
// Shape loading — currentSVG only advances on a successful sample, so a bad
// upload never destroys the shape on screen.
// ---------------------------------------------------------------------------
let hasShape = false;
let currentSVG = typeof stored.svg === "string" && stored.svg ? stored.svg : null;

async function loadSVGText(svgText, { announce = "" } = {}) {
  const data = await sampleSVG(svgText, {
    density: config.density, depth: config.depth, thickness: config.thickness,
    sampleRes: config.sampleRes, useSvgColor: config.useSvgColor,
  });
  if (!data || !data.count) throw new Error("no drawable geometry found in the SVG");
  currentSVG = svgText;
  particles.setData(data);
  if (!config.useSvgColor) particles.setUniformColor(config.uniformColor);
  if (config.assemble) uniforms.uAssemble.value = 0; // replay the fly-in
  hasShape = true;
  ui.setStatus(`${data.count.toLocaleString()} particles`);
  if (announce) ui.toast(announce, "ok");
  saveSoon();
  return data.count;
}

// Wrapper for every user-initiated load: reports failures instead of dying silently.
async function tryLoadSVG(svgText, { announce = "", source = "SVG" } = {}) {
  try {
    await loadSVGText(svgText, { announce });
    return true;
  } catch (err) {
    console.error(err);
    ui.toast(`Couldn't read that ${source} — ${err.message || "it may be malformed"}. Keeping the current shape.`, "err");
    return false;
  }
}

// Loads that replace the subject (upload / drop / text): only clear the subject
// pill when the new shape actually loads.
async function loadAsCustom(svgText, opts) {
  const prevSubject = config.subject;
  config.subject = "";
  ui.sync();
  const ok = await tryLoadSVG(svgText, opts);
  if (!ok) { config.subject = prevSubject; ui.sync(); }
  return ok;
}
async function rebuild() { if (currentSVG) await tryLoadSVG(currentSVG); }

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
  const files = [...(e.dataTransfer?.files || [])];
  const file = files.find((f) => f.type === "image/svg+xml" || f.name.toLowerCase().endsWith(".svg"));
  if (!file) {
    if (files.length) ui.toast("That file isn't an SVG — drop a .svg file to forge it.", "info");
    return;
  }
  await loadAsCustom(await file.text(), { announce: `Forged ${file.name}`, source: "file" });
});

// ---------------------------------------------------------------------------
// Animation loop + FPS meter
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let exporting = false;
let fpsAccum = 0, fpsFrames = 0, fpsLast = performance.now();

function frame() {
  requestAnimationFrame(frame);
  if (exporting) return;
  const dt = Math.min(clock.getDelta(), 0.05);

  const now = performance.now();
  fpsAccum += now - fpsLast; fpsLast = now; fpsFrames++;
  if (fpsAccum >= 500) {
    ui.setFps((fpsFrames * 1000) / fpsAccum);
    fpsAccum = 0; fpsFrames = 0;
  }

  uniforms.uIdlePhase.value = (uniforms.uIdlePhase.value + dt * config.idleSpeed) % TWO_PI;
  uniforms.uWaveSpeed.value += dt * config.waveSpeed;
  uniforms.uTime.value += dt;
  if (uniforms.uAssemble.value < 1) {
    uniforms.uAssemble.value = Math.min(1, uniforms.uAssemble.value + dt / Math.max(0.2, config.assembleDuration));
  }

  starfield.rotation.y += dt * 0.008;

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
  const saved = {
    phase: uniforms.uIdlePhase.value, active: uniforms.uCursorActive.value,
    rotY: particles.points.rotation.y, assemble: uniforms.uAssemble.value,
    time: uniforms.uTime.value, stars: starfield.visible,
  };
  const baseRotY = saved.rotY;
  // sparkle time must sweep whole pulse periods (period π/2) to loop seamlessly
  const sparkleSpan = (Math.PI / 2) * Math.max(1, Math.round(config.exportDuration));
  starfield.visible = config.starfield && !config.exportTransparent;
  const renderFrame = (phase) => {
    uniforms.uCursorActive.value = 0;
    uniforms.uAssemble.value = 1;
    uniforms.uTime.value = phase * sparkleSpan;
    uniforms.uIdlePhase.value = config.ambientWave ? phase * TWO_PI : 0;
    const rotations = config.autoRotate ? config.exportRotations : 0;
    particles.points.rotation.y = baseRotY + phase * TWO_PI * rotations;
    particles.points.rotation.x = config.tilt;
    renderer.render(scene, activeCamera);
  };
  const restore = () => {
    uniforms.uIdlePhase.value = saved.phase;
    uniforms.uCursorActive.value = saved.active;
    uniforms.uAssemble.value = saved.assemble;
    uniforms.uTime.value = saved.time;
    particles.points.rotation.y = saved.rotY;
    starfield.visible = saved.stars;
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
// Exports — one at a time, always reported, always cleaned up
// ---------------------------------------------------------------------------
let busy = false;

async function runOfflineExport(label, exporter) {
  if (busy) return ui.toast("An export is already running — hang tight.", "info");
  busy = true;
  exporting = true;
  ui.setBusy(true);
  const { renderFrame, restore } = makeLoopRenderer();
  try {
    await withExportResolution(config.exportRes, (w, h) =>
      exporter(renderFrame, w, h));
    ui.setStatus(`${label} saved ✓`);
    ui.toast(`${label} saved to your downloads.`, "ok");
  } catch (err) {
    console.error(err);
    ui.setStatus("export failed");
    ui.toast(`${label} export failed — ${err.message || "unknown error"}.`, "err");
  } finally {
    restore();
    exporting = false;
    busy = false;
    ui.setBusy(false);
  }
}

const doGIF = () => runOfflineExport("GIF", (renderFrame, w, h) =>
  exportGIF(renderer, renderFrame, { fps: config.exportFps, duration: config.exportDuration, width: w, height: h, transparent: config.exportTransparent, bgColor: config.background, onProgress: ui.progress("GIF") }));

const doPNG = () => runOfflineExport("PNG sequence", (renderFrame, w, h) =>
  exportPNGSequence(renderer, renderFrame, { fps: config.exportFps, duration: config.exportDuration, width: w, height: h, transparent: config.exportTransparent, bgColor: config.background, onProgress: ui.progress("PNG") }));

function doWebM() {
  if (busy) return ui.toast("An export is already running — hang tight.", "info");
  if (typeof MediaRecorder === "undefined") {
    return ui.toast("WebM recording isn't supported in this browser — try Chrome, or export a GIF instead.", "err");
  }
  busy = true;
  ui.setBusy(true);
  ui.setStatus(`recording WebM… ${config.webmSeconds}s`);
  try {
    // MediaRecorder captures the canvas only — give it an opaque background
    // for the recording unless the user asked for transparency.
    if (!config.exportTransparent) renderer.setClearColor(new THREE.Color(config.background), 1);
    else starfield.visible = false; // stars don't belong in a transparent capture
    const rec = recordWebM(renderer, { fps: 60, bitrate: 40_000_000, transparent: config.exportTransparent });
    rec.done
      .then(() => { ui.setStatus("WebM saved ✓"); ui.toast("WebM saved to your downloads.", "ok"); })
      .catch((err) => { console.error(err); ui.toast(`WebM recording failed — ${err.message || "unknown error"}.`, "err"); })
      .finally(() => { busy = false; ui.setBusy(false); applyConfig(); });
    setTimeout(() => rec.stop(), config.webmSeconds * 1000);
  } catch (err) {
    console.error(err);
    busy = false;
    ui.setBusy(false);
    applyConfig();
    ui.toast(`Couldn't start the WebM recording — ${err.message || "unknown error"}.`, "err");
  }
}

// ---------------------------------------------------------------------------
// Actions wired to the UI
// ---------------------------------------------------------------------------
const actions = {
  async setSubject(key) { saveSoon(); await tryLoadSVG(SHAPES[key](), { source: "shape" }); },
  async uploadSVG(file) {
    await loadAsCustom(await file.text(), { announce: `Forged ${file.name}`, source: "file" });
  },
  async setText(text) { if (text.trim()) await loadAsCustom(textToSVG(text), { source: "text" }); },

  // unified change handler for sliders / toggles / colors
  change(key) {
    applyConfig();
    if (key === "density" || key === "depth" || key === "sampleRes" || key === "thickness") rebuild();
    else if (key === "useSvgColor") { if (config.useSvgColor) rebuild(); else particles.setUniformColor(config.uniformColor); }
    else if (key === "uniformColor") { if (!config.useSvgColor) particles.setUniformColor(config.uniformColor); }
    else if (key === "assemble" && config.assemble) uniforms.uAssemble.value = 0; // replay so the toggle shows itself
    saveSoon();
  },

  applyPreset(name) {
    const preset = LOOK_PRESETS.find((p) => p.name === name);
    if (!preset) return;
    const needsRebuild = config.useSvgColor !== preset.settings.useSvgColor;
    Object.assign(config, preset.settings);
    applyConfig();
    if (needsRebuild && config.useSvgColor) rebuild();
    else if (!config.useSvgColor) particles.setUniformColor(config.uniformColor);
    ui.sync();
    saveSoon();
  },

  randomizePalette() {
    const hue = Math.floor(Math.random() * 360);
    const particle = `hsl(${hue}, ${70 + Math.random() * 25}%, ${65 + Math.random() * 15}%)`;
    const bgHue = (hue + 180 + Math.floor(Math.random() * 60) - 30) % 360;
    // colors go through a canvas to normalize hsl() → #rrggbb for the color inputs
    const toHex = (css) => {
      const c = document.createElement("canvas").getContext("2d");
      c.fillStyle = css;
      return c.fillStyle;
    };
    config.uniformColor = toHex(particle);
    config.background = toHex(`hsl(${bgHue}, ${30 + Math.random() * 30}%, ${4 + Math.random() * 6}%)`);
    config.useSvgColor = false;
    applyConfig();
    particles.setUniformColor(config.uniformColor);
    ui.clearPreset();
    ui.sync();
    saveSoon();
  },

  resetAll() {
    try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
    Object.assign(config, DEFAULTS);
    applyConfig();
    ui.clearPreset();
    ui.sync();
    actions.setSubject(config.subject);
    ui.toast("Settings restored to defaults.", "ok");
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
    ui.setCamLabel(activeCamera === perspCam ? "Perspective" : "Orthographic");
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
    ui.clearPreset();
    ui.sync();
  },
  exportFormat(name) {
    if (name === "embed") return actions.showEmbed();
    if (!hasShape) return ui.toast("Load a shape first — pick a subject or drop an SVG.", "info");
    if (name === "webm") return doWebM();
    if (name === "gif") return doGIF();
    if (name === "png") return doPNG();
  },
  showEmbed() {
    if (!hasShape) return ui.toast("Load a shape first — pick a subject or drop an SVG.", "info");
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
// Boot — restore persisted scene, fall back to defaults on any failure
// ---------------------------------------------------------------------------
const ui = buildUI(config, actions);
applyConfig();
onResize();
frame();

(async () => {
  try {
    if (currentSVG && !config.subject) {
      await loadSVGText(currentSVG);
    } else {
      const key = SHAPES[config.subject] ? config.subject : "star";
      await loadSVGText(SHAPES[key]());
    }
  } catch (err) {
    console.error(err);
    currentSVG = null;
    await tryLoadSVG(SHAPES.star(), { source: "shape" });
  }
  ui.sync();
})();
