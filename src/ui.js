import { SHAPE_KEYS } from "./presets.js";

const RES = [["512", 512], ["1024", 1024], ["2048", 2048], ["4K", 4096]];
const EXPORTS = ["gif", "webm", "png", "embed"];
const WAVE_DIRS = ["radial", "horizontal", "vertical", "diagonal"];

function pill(text, active = false) {
  const b = document.createElement("button");
  b.className = "pill" + (active ? " active" : "");
  b.textContent = text;
  return b;
}

// Builds the control panel over the static markup in index.html.
// `actions` (from main.js) provides: setSubject, uploadSVG, setText, change(key),
// resetCam, changeDim, shuffle, regenStrip, exportFormat, showEmbed, downloadEmbed.
export function buildUI(config, actions) {
  const $ = (id) => document.getElementById(id);
  const sliders = [];

  // ---- 01 SUBJECT --------------------------------------------------------
  const subjEls = [];
  SHAPE_KEYS.forEach((k) => {
    const b = pill(k.toUpperCase(), config.subject === k);
    b.dataset.key = k;
    b.onclick = () => {
      config.subject = k;
      subjEls.forEach((e) => e.classList.toggle("active", e.dataset.key === config.subject));
      actions.setSubject(k);
    };
    $("subject-pills").appendChild(b);
    subjEls.push(b);
  });
  const clearSubject = () => subjEls.forEach((e) => e.classList.remove("active"));

  $("file-input").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) { clearSubject(); config.subject = ""; actions.uploadSVG(f); }
  });
  const textInput = $("text-input");
  let textTimer;
  textInput.addEventListener("input", () => {
    clearTimeout(textTimer);
    textTimer = setTimeout(() => {
      if (textInput.value.trim()) { clearSubject(); config.subject = ""; actions.setText(textInput.value); }
    }, 350);
  });

  // ---- sliders (data-key) ------------------------------------------------
  document.querySelectorAll(".slider[data-key]").forEach((wrap) => {
    const key = wrap.dataset.key;
    const min = +wrap.dataset.min, max = +wrap.dataset.max, step = +wrap.dataset.step;
    wrap.innerHTML = `<div class="s-top"><span class="s-label">${wrap.dataset.label}</span><span class="s-val"></span></div>`;
    const input = document.createElement("input");
    input.type = "range"; input.min = min; input.max = max; input.step = step; input.value = config[key];
    wrap.appendChild(input);
    const val = wrap.querySelector(".s-val");
    const fmt = () => (val.textContent = step < 1 ? (+config[key]).toFixed(2) : config[key]);
    fmt();
    input.addEventListener("input", () => { config[key] = +input.value; fmt(); actions.change(key); });
    sliders.push({ key, input, fmt });
  });

  // ---- toggle pills (data-toggle) ----------------------------------------
  const toggles = [];
  document.querySelectorAll("[data-toggle]").forEach((el) => {
    const key = el.dataset.toggle;
    el.classList.toggle("active", !!config[key]);
    el.onclick = () => { config[key] = !config[key]; el.classList.toggle("active", config[key]); actions.change(key); };
    toggles.push({ key, el });
  });

  // ---- color swatches (data-color) ---------------------------------------
  const colors = [];
  document.querySelectorAll("[data-color]").forEach((el) => {
    const key = el.dataset.color;
    el.value = config[key];
    el.addEventListener("input", () => { config[key] = el.value; actions.change(key); });
    colors.push({ key, el });
  });

  // ---- wave direction (single-select) ------------------------------------
  const dirEls = [];
  WAVE_DIRS.forEach((d) => {
    const b = pill(d.toUpperCase(), config.waveDir === d);
    b.dataset.dir = d;
    b.onclick = () => {
      config.waveDir = d;
      dirEls.forEach((e) => e.classList.toggle("active", e.dataset.dir === config.waveDir));
      actions.change("waveDir");
    };
    $("wavedir-pills").appendChild(b);
    dirEls.push(b);
  });

  // ---- export res + render buttons ---------------------------------------
  const resEls = [];
  RES.forEach(([label, value]) => {
    const b = pill(label, config.exportRes === value);
    b.dataset.val = value;
    b.onclick = () => { config.exportRes = value; resEls.forEach((e) => e.classList.toggle("active", +e.dataset.val === config.exportRes)); };
    $("res-pills").appendChild(b);
    resEls.push(b);
  });
  EXPORTS.forEach((name) => {
    const b = pill(name === "embed" ? "⧉ GET CODE" : name.toUpperCase());
    b.onclick = () => actions.exportFormat(name);
    $("export-pills").appendChild(b);
  });

  // ---- top bar / misc ----------------------------------------------------
  $("change-dim").onclick = () => actions.changeDim();
  $("reset-cam").onclick = () => actions.resetCam();
  $("shuffle").onclick = () => actions.shuffle();

  // ---- embed modal -------------------------------------------------------
  $("embed-close").onclick = () => $("embed-modal").classList.add("hidden");
  $("embed-copy").onclick = async () => {
    await navigator.clipboard.writeText($("embed-code").value);
    $("embed-copy").textContent = "✓ COPIED";
    setTimeout(() => ($("embed-copy").textContent = "⧉ COPY SNIPPET"), 1400);
  };
  $("embed-download").onclick = () => actions.downloadEmbed();

  // ---- status ------------------------------------------------------------
  const setStatus = (m) => ($("status").textContent = m);

  function sync() {
    subjEls.forEach((e) => e.classList.toggle("active", e.dataset.key === config.subject));
    sliders.forEach((s) => { s.input.value = config[s.key]; s.fmt(); });
    toggles.forEach((t) => t.el.classList.toggle("active", !!config[t.key]));
    colors.forEach((c) => (c.el.value = config[c.key]));
    resEls.forEach((e) => e.classList.toggle("active", +e.dataset.val === config.exportRes));
    dirEls.forEach((e) => e.classList.toggle("active", e.dataset.dir === config.waveDir));
  }

  return {
    setStatus,
    showEmbed(code) { $("embed-code").value = code; $("embed-modal").classList.remove("hidden"); },
    progress: (label) => (p) => setStatus(`${label} ${Math.min(100, Math.round(p * 100))}%`),
    sync,
  };
}
