// Turn raw SVG text into a cloud of 3D particle positions.
//
// Strategy: rasterize the SVG to an offscreen canvas, scan its pixels, and emit
// a particle wherever the alpha is above a threshold. Each 2D sample is then
// "extruded" by assigning it a random Z within ±depth/2, producing a solid
// slab of points that reads as a 3D volume when rotated.

function loadSvgImage(svgText) {
  return new Promise((resolve, reject) => {
    // Ensure the SVG has a usable intrinsic size. Many icons only declare a
    // viewBox; give the <svg> explicit width/height derived from it so the
    // browser rasterizes at a known resolution.
    let text = svgText;
    if (!/\bwidth\s*=/.test(text) || !/\bheight\s*=/.test(text)) {
      const vb = text.match(/viewBox\s*=\s*["']\s*[\d.+-]+\s+[\d.+-]+\s+([\d.+-]+)\s+([\d.+-]+)/);
      if (vb) {
        const w = Math.round(parseFloat(vb[1]));
        const h = Math.round(parseFloat(vb[2]));
        text = text.replace(/<svg/i, `<svg width="${w}" height="${h}"`);
      }
    }

    const blob = new Blob([text], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load SVG. Is the file valid?"));
    };
    img.src = url;
  });
}

/**
 * @param {string} svgText
 * @param {object} opts
 * @param {number} opts.density      0.05..1   fraction of opaque pixels sampled
 * @param {number} opts.depth        extrusion thickness in world units
 * @param {number} opts.sampleRes    longest raster edge in px (detail)
 * @param {number} opts.maxParticles hard cap
 * @param {boolean} opts.useSvgColor inherit pixel colors vs. uniform
 */
export async function sampleSVG(svgText, opts) {
  const {
    density = 0.5,
    depth = 0.35,
    sampleRes = 360,
    maxParticles = 120000,
    useSvgColor = true,
  } = opts;

  const img = await loadSvgImage(svgText);
  let w = img.naturalWidth || img.width || 512;
  let h = img.naturalHeight || img.height || 512;

  const scale = sampleRes / Math.max(w, h);
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);
  const data = ctx.getImageData(0, 0, cw, ch).data;

  // world-space normalization: longest edge spans 2 units, centered on origin
  const norm = 2 / Math.max(cw, ch);

  const positions = [];
  const colors = [];
  const rands = [];

  // First pass: collect every opaque pixel, then thin by density so the result
  // is uniform regardless of how filled the shape is.
  const candidates = [];
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      if (data[i + 3] > 40) candidates.push(i);
    }
  }

  const keepProb = Math.min(1, density);
  for (let k = 0; k < candidates.length; k++) {
    if (Math.random() > keepProb) continue;
    if (positions.length / 3 >= maxParticles) break;

    const i = candidates[k];
    const px = i / 4;
    const x = px % cw;
    const y = Math.floor(px / cw);

    const jx = (Math.random() - 0.5);
    const jy = (Math.random() - 0.5);
    const wx = (x + jx - cw / 2) * norm;
    const wy = -(y + jy - ch / 2) * norm; // flip Y (canvas is top-down)
    const wz = (Math.random() - 0.5) * depth;
    positions.push(wx, wy, wz);

    if (useSvgColor) {
      colors.push(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255);
    } else {
      colors.push(1, 1, 1);
    }
    rands.push(Math.random());
  }

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    rands: new Float32Array(rands),
    count: positions.length / 3,
    aspect: cw / ch,
    extent: { x: (cw * norm) / 2, y: (ch * norm) / 2, z: depth / 2 },
  };
}
