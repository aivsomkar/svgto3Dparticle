// Turn raw SVG text into a cloud of 3D particle positions.
//
// 1. Rasterize the SVG to an offscreen canvas at the resolution implied by its
//    viewBox (normalized so width/height in %/units can't break the raster).
// 2. Detect and drop a solid background matte (auto-traced/exported SVGs often
//    ship a full-canvas white rect behind the artwork).
// 3. Crop to the artwork's bounding box so the shape fills the stage.
// 4. Sample ink pixels into particles, weighting density by each pixel's
//    contrast against the background — bold marks sample dense, faint ones
//    sparse — so multicolor art segregates visually.
// 5. Use a distance-transform "thickness" map so extrusion depth and density
//    also follow how thick the shape is locally.

// --- robust SVG dimension handling ----------------------------------------
function svgDimensions(svgText) {
  let w, h;
  const vb = svgText.match(
    /viewBox\s*=\s*["']?\s*([\d.+-]+)[ ,]+([\d.+-]+)[ ,]+([\d.+-]+)[ ,]+([\d.+-]+)/i
  );
  if (vb) { w = parseFloat(vb[3]); h = parseFloat(vb[4]); }
  if (!w || !h) {
    const wm = svgText.match(/\bwidth\s*=\s*["']?\s*([\d.]+)/i);
    const hm = svgText.match(/\bheight\s*=\s*["']?\s*([\d.]+)/i);
    if (wm && hm) { w = parseFloat(wm[1]); h = parseFloat(hm[1]); }
  }
  if (!w || !h || !isFinite(w) || !isFinite(h)) { w = 512; h = 512; }
  return { w, h };
}

// Force explicit pixel width/height on the root <svg> (stripping any existing
// width/height that may be a percentage or carry units). This is what fixes
// uploads that previously rendered clipped ("only the top half showed").
function normalizeSVG(svgText, w, h) {
  return svgText.replace(/<svg([^>]*)>/i, (_m, attrs) => {
    const cleaned = attrs
      .replace(/\swidth\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, "")
      .replace(/\sheight\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, "");
    return `<svg width="${w}" height="${h}"${cleaned}>`;
  });
}

function loadImage(svgText) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not load SVG. Is the file valid?")); };
    img.src = url;
  });
}

// If most border pixels are opaque and share one color, that color is a
// background matte, not artwork. Returns the matte color or null.
function detectBackground(data, cw, ch, alphaThresh) {
  const buckets = new Map();
  let total = 0;
  const visit = (x, y) => {
    const i = (y * cw + x) * 4;
    total++;
    if (data[i + 3] <= alphaThresh) return;
    const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2];
    buckets.set(key, e);
  };
  for (let x = 0; x < cw; x++) { visit(x, 0); visit(x, ch - 1); }
  for (let y = 1; y < ch - 1; y++) { visit(0, y); visit(cw - 1, y); }
  let best = null;
  for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
  if (!best || best.n < total * 0.5) return null;
  return { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n };
}

// Chamfer distance transform over an ink mask: distance (in px) from each ink
// pixel to the nearest non-ink pixel. Used as a proxy for local thickness.
function distanceTransform(mask, cw, ch) {
  const INF = 1e9, D1 = 1, D2 = 1.4142;
  const dist = new Float32Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) dist[i] = mask[i] ? INF : 0;
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const i = y * cw + x;
      if (dist[i] === 0) continue;
      let v = dist[i];
      if (x > 0) v = Math.min(v, dist[i - 1] + D1);
      if (y > 0) v = Math.min(v, dist[i - cw] + D1);
      if (x > 0 && y > 0) v = Math.min(v, dist[i - cw - 1] + D2);
      if (x < cw - 1 && y > 0) v = Math.min(v, dist[i - cw + 1] + D2);
      dist[i] = v;
    }
  for (let y = ch - 1; y >= 0; y--)
    for (let x = cw - 1; x >= 0; x--) {
      const i = y * cw + x;
      if (dist[i] === 0) continue;
      let v = dist[i];
      if (x < cw - 1) v = Math.min(v, dist[i + 1] + D1);
      if (y < ch - 1) v = Math.min(v, dist[i + cw] + D1);
      if (x < cw - 1 && y < ch - 1) v = Math.min(v, dist[i + cw + 1] + D2);
      if (x > 0 && y < ch - 1) v = Math.min(v, dist[i + cw - 1] + D2);
      dist[i] = v;
    }
  return dist;
}

/**
 * @param {string} svgText
 * @param {object} opts
 * @param {number} opts.density      0.05..1   base fraction of ink pixels kept
 * @param {number} opts.depth        max extrusion thickness (world units)
 * @param {number} opts.thickness    0..1  how much depth/density follow local thickness
 * @param {number} opts.sampleRes    longest raster edge (detail)
 * @param {number} opts.maxParticles hard cap
 * @param {boolean} opts.useSvgColor inherit pixel colors vs. uniform white
 */
export async function sampleSVG(svgText, opts) {
  const {
    density = 0.55, depth = 0.4, thickness = 0.6,
    sampleRes = 360, maxParticles = 160000, useSvgColor = true,
  } = opts;

  const { w, h } = svgDimensions(svgText);
  const img = await loadImage(normalizeSVG(svgText, w, h));

  const scale = sampleRes / Math.max(w, h);
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);
  const data = ctx.getImageData(0, 0, cw, ch).data;

  const ALPHA = 40;
  const BG_TOL2 = 60 * 60; // squared RGB distance below which a pixel is matte

  // --- ink mask: opaque AND distinct from any background matte -------------
  const bg = detectBackground(data, cw, ch, ALPHA);
  const buildMask = (useBg) => {
    const mask = new Uint8Array(cw * ch);
    const contrast = new Float32Array(cw * ch); // squared distance from matte
    let ink = 0, opaque = 0, maxC2 = 1;
    let minX = cw, minY = ch, maxX = -1, maxY = -1;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const p = y * cw + x, i = p * 4;
        if (data[i + 3] <= ALPHA) continue;
        opaque++;
        let c2 = 0;
        if (useBg) {
          const dr = data[i] - bg.r, dg = data[i + 1] - bg.g, db = data[i + 2] - bg.b;
          c2 = (dr * dr + dg * dg + db * db) / 3;
          if (c2 <= BG_TOL2) continue;
        }
        mask[p] = 1;
        contrast[p] = c2;
        if (c2 > maxC2) maxC2 = c2;
        ink++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    return { mask, contrast, ink, opaque, maxC2, minX, minY, maxX, maxY };
  };

  let m = buildMask(!!bg);
  // Matte detection ate (almost) everything → it was artwork, not background.
  if (bg && m.ink < Math.max(20, m.opaque * 0.002)) m = buildMask(false);
  if (!m.ink) throw new Error("no drawable geometry found in the SVG");

  const dist = distanceTransform(m.mask, cw, ch);
  let maxDist = 1;
  for (let i = 0; i < dist.length; i++) if (dist[i] < 1e8 && dist[i] > maxDist) maxDist = dist[i];

  // --- crop to the artwork's bounding box so the shape fills the stage -----
  const bw = m.maxX - m.minX + 1, bh = m.maxY - m.minY + 1;
  const cx = (m.minX + m.maxX + 1) / 2, cy = (m.minY + m.maxY + 1) / 2;
  const norm = 2 / Math.max(bw, bh);

  const positions = [], colors = [], rands = [];

  const push = (x, y, t) => {
    const localDepth = depth * (1 - thickness + thickness * t);
    const jx = Math.random() - 0.5, jy = Math.random() - 0.5;
    positions.push(
      (x + jx - cx) * norm,
      -(y + jy - cy) * norm,
      (Math.random() - 0.5) * Math.max(0.04, localDepth)
    );
    const i = (y * cw + x) * 4;
    if (useSvgColor) colors.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    else colors.push(1, 1, 1);
    rands.push(Math.random());
  };

  const keepBase = Math.min(1, density);
  const weighted = !!bg; // contrast weighting only means something vs a matte
  for (let y = m.minY; y <= m.maxY; y++) {
    for (let x = m.minX; x <= m.maxX; x++) {
      const p = y * cw + x;
      if (!m.mask[p]) continue;
      // density follows contrast against the matte: bold marks sample dense,
      // faint ones sparse — multicolor art segregates by particle density
      const wColor = weighted ? 0.3 + 0.7 * Math.sqrt(m.contrast[p] / m.maxC2) : 1;
      if (Math.random() > keepBase * wColor) continue;
      if (positions.length / 3 >= maxParticles) break;

      const t = Math.min(1, dist[p] / maxDist); // 0 at edge, 1 at core
      push(x, y, t);
      // thicker regions get extra particles → density follows thickness
      if (Math.random() < thickness * t && positions.length / 3 < maxParticles) push(x, y, t);
    }
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    rands: new Float32Array(rands),
    count: positions.length / 3,
    extent: { x: (bw * norm) / 2, y: (bh * norm) / 2, z: depth / 2 },
  };
}
