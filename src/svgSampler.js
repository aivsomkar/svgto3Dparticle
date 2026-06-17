// Turn raw SVG text into a cloud of 3D particle positions.
//
// 1. Rasterize the SVG to an offscreen canvas at the resolution implied by its
//    viewBox (normalized so width/height in %/units can't break the raster).
// 2. Sample opaque pixels into particles.
// 3. Use a distance-transform "thickness" map so the extrusion depth — and the
//    number of particles — follow how thick the shape is locally: chunky areas
//    bulge into a deeper, denser volume; thin strokes stay shallow.

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

// Chamfer distance transform: distance (in px) from each opaque pixel to the
// nearest transparent pixel. Used as a proxy for local shape thickness.
function distanceTransform(data, cw, ch, thresh) {
  const INF = 1e9, D1 = 1, D2 = 1.4142;
  const dist = new Float32Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) dist[i] = data[i * 4 + 3] > thresh ? INF : 0;
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
 * @param {number} opts.density      0.05..1   base fraction of opaque pixels kept
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
  const dist = distanceTransform(data, cw, ch, ALPHA);
  let maxDist = 1;
  for (let i = 0; i < dist.length; i++) if (dist[i] < 1e8 && dist[i] > maxDist) maxDist = dist[i];

  const norm = 2 / Math.max(cw, ch);
  const positions = [], colors = [], rands = [];

  const push = (x, y, t) => {
    const localDepth = depth * (1 - thickness + thickness * t);
    const jx = Math.random() - 0.5, jy = Math.random() - 0.5;
    positions.push(
      (x + jx - cw / 2) * norm,
      -(y + jy - ch / 2) * norm,
      (Math.random() - 0.5) * Math.max(0.04, localDepth)
    );
    const i = (y * cw + x) * 4;
    if (useSvgColor) colors.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    else colors.push(1, 1, 1);
    rands.push(Math.random());
  };

  const keep = Math.min(1, density);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      if (data[i + 3] <= ALPHA) continue;
      if (Math.random() > keep) continue;
      if (positions.length / 3 >= maxParticles) break;

      const t = Math.min(1, dist[y * cw + x] / maxDist); // 0 at edge, 1 at core
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
    extent: { x: (cw * norm) / 2, y: (ch * norm) / 2, z: depth / 2 },
  };
}
