import { SHAPE_KEYS, LOOK_PRESETS } from "./presets.js";

const RES = [["512", 512], ["1024", 1024], ["2048", 2048], ["4K", 4096]];
const EXPORTS = [["gif", "GIF"], ["webm", "WebM"], ["png", "PNG"], ["embed", "Get code"]];
const WAVE_DIRS = ["radial", "horizontal", "vertical", "diagonal"];
const SUBJECTS_VISIBLE = 9; // grid shows 3×3, the rest behind "Show more"

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function gbtn(text, active = false) {
  const b = document.createElement("button");
  b.className = "gbtn" + (active ? " active" : "");
  b.textContent = text;
  return b;
}

// Builds the control panel over the static markup in index.html.
// `actions` (from main.js) provides: setSubject, uploadSVG, setText, change(key),
// resetCam, changeDim, shuffle, exportFormat, showEmbed, downloadEmbed, resetAll,
// applyPreset, randomizePalette.
export function buildUI(config, actions) {
  const $ = (id) => document.getElementById(id);
  const sliders = [];

  // ---- Subject grid + show more ------------------------------------------
  const subjEls = [];
  SHAPE_KEYS.forEach((k, i) => {
    const b = gbtn(cap(k), config.subject === k);
    b.dataset.key = k;
    if (i >= SUBJECTS_VISIBLE) b.classList.add("hidden");
    b.onclick = () => {
      config.subject = k;
      subjEls.forEach((e) => e.classList.toggle("active", e.dataset.key === config.subject));
      actions.setSubject(k);
    };
    $("subject-pills").appendChild(b);
    subjEls.push(b);
  });
  const moreBtn = $("subject-more");
  const hiddenCount = Math.max(0, SHAPE_KEYS.length - SUBJECTS_VISIBLE);
  let expanded = false;
  const renderMore = () => {
    moreBtn.textContent = expanded ? "Show less" : `Show more (+${hiddenCount})`;
    moreBtn.setAttribute("aria-expanded", String(expanded));
    subjEls.forEach((e, i) => e.classList.toggle("hidden", !expanded && i >= SUBJECTS_VISIBLE));
  };
  if (hiddenCount === 0) moreBtn.classList.add("hidden");
  moreBtn.onclick = () => { expanded = !expanded; renderMore(); };
  renderMore();

  $("file-input").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) actions.uploadSVG(f);
    e.target.value = "";
  });
  const textInput = $("text-input");
  let textTimer;
  textInput.addEventListener("input", () => {
    clearTimeout(textTimer);
    textTimer = setTimeout(() => {
      if (textInput.value.trim()) actions.setText(textInput.value);
    }, 350);
  });

  // ---- Presets list --------------------------------------------------------
  const presetEls = [];
  LOOK_PRESETS.forEach((p) => {
    const row = document.createElement("button");
    row.className = "preset-row";
    row.innerHTML = `<span></span><span class="tag"></span>`;
    row.firstElementChild.textContent = p.name;
    row.lastElementChild.textContent = p.tag;
    row.onclick = () => {
      presetEls.forEach((e) => e.classList.toggle("active", e === row));
      actions.applyPreset(p.name);
    };
    $("preset-list").appendChild(row);
    presetEls.push(row);
  });
  const clearPreset = () => presetEls.forEach((e) => e.classList.remove("active"));

  // ---- sliders (data-key) — range + numeric readout + white fill -----------
  document.querySelectorAll(".slider[data-key]").forEach((wrap) => {
    const key = wrap.dataset.key;
    const min = +wrap.dataset.min, max = +wrap.dataset.max, step = +wrap.dataset.step;
    const decimals = step < 1 ? (String(step).split(".")[1]?.length ?? 2) : 0;

    wrap.innerHTML = `
      <div class="s-top">
        <span class="s-label">${wrap.dataset.label}</span>
        <input class="s-num" type="number" min="${min}" max="${max}" step="${step}"
               aria-label="${wrap.dataset.label} value" />
      </div>
      <div class="track"><div class="fill"></div></div>`;
    const num = wrap.querySelector(".s-num");
    const track = wrap.querySelector(".track");
    const fill = wrap.querySelector(".fill");

    const range = document.createElement("input");
    range.type = "range"; range.min = min; range.max = max; range.step = step;
    range.setAttribute("aria-label", wrap.dataset.label);
    track.appendChild(range);

    const paint = () => {
      const v = +config[key];
      range.value = v;
      num.value = v.toFixed(decimals);
      fill.style.width = `${((v - min) / (max - min)) * 100}%`;
    };
    paint();

    range.addEventListener("input", () => {
      config[key] = +range.value;
      paint();
      actions.change(key);
    });
    const commitNum = () => {
      const v = clamp(+num.value || 0, min, max);
      config[key] = +v.toFixed(decimals);
      paint();
      actions.change(key);
    };
    num.addEventListener("change", commitNum);
    num.addEventListener("keydown", (e) => { if (e.key === "Enter") { commitNum(); num.blur(); } });

    sliders.push({ key, paint });
  });

  // ---- toggle buttons (data-toggle) ----------------------------------------
  const toggles = [];
  document.querySelectorAll("[data-toggle]").forEach((el) => {
    const key = el.dataset.toggle;
    const set = (on) => { el.classList.toggle("active", on); el.setAttribute("aria-pressed", String(on)); };
    set(!!config[key]);
    el.onclick = () => { config[key] = !config[key]; set(config[key]); actions.change(key); };
    toggles.push({ key, set });
  });

  // ---- color swatches (data-color) ---------------------------------------
  const colors = [];
  document.querySelectorAll("[data-color]").forEach((el) => {
    const key = el.dataset.color;
    el.value = config[key];
    el.addEventListener("input", () => { config[key] = el.value; actions.change(key); });
    colors.push({ key, el });
  });

  $("randomize-palette").onclick = () => actions.randomizePalette();

  // ---- wave direction (single-select) ------------------------------------
  const dirEls = [];
  WAVE_DIRS.forEach((d) => {
    const b = gbtn(cap(d), config.waveDir === d);
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
    const b = gbtn(label, config.exportRes === value);
    b.dataset.val = value;
    b.onclick = () => {
      config.exportRes = value;
      resEls.forEach((e) => e.classList.toggle("active", +e.dataset.val === config.exportRes));
      actions.change("exportRes");
    };
    $("res-pills").appendChild(b);
    resEls.push(b);
  });
  const exportBtns = [];
  EXPORTS.forEach(([name, label]) => {
    const b = gbtn(label);
    b.onclick = () => actions.exportFormat(name);
    $("export-pills").appendChild(b);
    exportBtns.push(b);
  });

  // ---- top bar / misc ----------------------------------------------------
  $("change-dim").onclick = () => actions.changeDim();
  $("reset-cam").onclick = () => actions.resetCam();
  $("shuffle").onclick = () => actions.shuffle();
  $("reset-all").onclick = () => actions.resetAll();
  const exportModal = $("export-modal");
  $("goto-export").onclick = () => exportModal.classList.remove("hidden");
  $("export-close").onclick = () => exportModal.classList.add("hidden");
  exportModal.addEventListener("click", (e) => { if (e.target === exportModal) exportModal.classList.add("hidden"); });
  const setCamLabel = (label) => ($("cam-label").textContent = label);

  // ---- mobile drawers ----------------------------------------------------
  const left = $("panel-left"), right = $("panel-right");
  $("drawer-left").onclick = () => { right.classList.remove("open"); left.classList.toggle("open"); };
  $("drawer-right").onclick = () => { left.classList.remove("open"); right.classList.toggle("open"); };

  // ---- embed modal -------------------------------------------------------
  const modal = $("embed-modal");
  $("embed-close").onclick = () => modal.classList.add("hidden");
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!modal.classList.contains("hidden")) modal.classList.add("hidden");
    else exportModal.classList.add("hidden");
  });
  $("embed-copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText($("embed-code").value);
      $("embed-copy").textContent = "Copied ✓";
      setTimeout(() => ($("embed-copy").textContent = "Copy snippet"), 1400);
    } catch {
      toast("Couldn't access the clipboard — select the code and copy manually.", "err");
    }
  };
  $("embed-download").onclick = () => actions.downloadEmbed();

  // ---- toasts --------------------------------------------------------------
  const ICONS = { ok: "✓", err: "✕", info: "•" };
  function toast(message, type = "info", ms = 3600) {
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="t-icon">${ICONS[type] || ICONS.info}</span><span></span>`;
    t.lastElementChild.textContent = message;
    $("toasts").appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, ms);
    return t;
  }

  // ---- status / progress / busy ------------------------------------------
  const setStatus = (m) => ($("status").textContent = m);
  const progressEl = $("export-progress");
  const progressBar = progressEl.querySelector(".bar");
  const setBusy = (busy) => {
    exportBtns.forEach((b) => (b.disabled = busy));
    progressEl.classList.toggle("hidden", !busy);
    if (!busy) progressBar.style.width = "0%";
  };

  // ---- fps ------------------------------------------------------------------
  const fpsEl = $("fps");
  const setFps = (n) => (fpsEl.textContent = `${Math.round(n)} fps`);

  function sync() {
    subjEls.forEach((e) => e.classList.toggle("active", e.dataset.key === config.subject));
    sliders.forEach((s) => s.paint());
    toggles.forEach((t) => t.set(!!config[t.key]));
    colors.forEach((c) => (c.el.value = config[c.key]));
    resEls.forEach((e) => e.classList.toggle("active", +e.dataset.val === config.exportRes));
    dirEls.forEach((e) => e.classList.toggle("active", e.dataset.dir === config.waveDir));
  }

  return {
    setStatus,
    toast,
    setBusy,
    setFps,
    setCamLabel,
    clearPreset,
    showEmbed(code) { $("embed-code").value = code; modal.classList.remove("hidden"); },
    progress: (label) => (p) => {
      const pct = Math.min(100, Math.round(p * 100));
      setStatus(`${label} ${pct}%`);
      progressBar.style.width = `${pct}%`;
    },
    sync,
  };
}
