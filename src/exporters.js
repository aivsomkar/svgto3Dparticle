import { GIFEncoder, quantize, applyPalette } from "gifenc";
import JSZip from "jszip";

// Shared helper: download a Blob.
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Read the WebGL canvas into a 2D canvas so we can getImageData / toBlob.
// `bgColor` null => keep transparency; otherwise composite onto that color.
function grabFrame(glCanvas, w, h, bgColor) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.drawImage(glCanvas, 0, 0, w, h);
  return { canvas: c, ctx };
}

/**
 * Live WebM capture via MediaRecorder. Records whatever is on screen — so the
 * user's cursor wave interaction is captured too.
 *
 * @returns {{stop: () => void, done: Promise<void>}}
 */
export function recordWebM(renderer, { fps = 60, bitrate = 40_000_000, transparent = false } = {}) {
  const stream = renderer.domElement.captureStream(fps);

  // Prefer VP9 (supports alpha); fall back gracefully.
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  const mimeType = candidates.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: bitrate,
  });

  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const done = new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      download(blob, `particles-${Date.now()}.webm`);
      resolve();
    };
  });

  recorder.start(100);
  return {
    stop: () => recorder.state !== "inactive" && recorder.stop(),
    done,
    transparent,
  };
}

/**
 * Offline seamless-loop GIF export.
 * renderFrame(phase) must set the loop state for phase in [0,1) and render.
 */
export async function exportGIF(
  renderer,
  renderFrame,
  { fps = 30, duration = 4, width, height, transparent = false, bgColor = "#05070a", onProgress } = {}
) {
  const glCanvas = renderer.domElement;
  const w = width || glCanvas.width;
  const h = height || glCanvas.height;
  const totalFrames = Math.max(1, Math.round(fps * duration));
  const delay = Math.round(1000 / fps);

  const gif = GIFEncoder();
  const format = transparent ? "rgba4444" : "rgb565";

  for (let i = 0; i < totalFrames; i++) {
    renderFrame(i / totalFrames);
    const { ctx } = grabFrame(glCanvas, w, h, transparent ? null : bgColor);
    const { data } = ctx.getImageData(0, 0, w, h);

    const palette = quantize(data, 256, { format });
    const index = applyPalette(data, palette, format);
    gif.writeFrame(index, w, h, {
      palette,
      delay,
      transparent,
      dispose: transparent ? 2 : -1,
    });

    onProgress?.((i + 1) / totalFrames);
    // yield to keep the tab responsive
    if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  gif.finish();
  download(new Blob([gif.bytesView()], { type: "image/gif" }), `particles-${Date.now()}.gif`);
}

/**
 * Offline PNG frame sequence (zipped). Honors transparency for max-quality
 * post-processing. Same seamless-loop driver as the GIF exporter.
 */
export async function exportPNGSequence(
  renderer,
  renderFrame,
  { fps = 30, duration = 4, width, height, transparent = true, bgColor = "#05070a", onProgress } = {}
) {
  const glCanvas = renderer.domElement;
  const w = width || glCanvas.width;
  const h = height || glCanvas.height;
  const totalFrames = Math.max(1, Math.round(fps * duration));

  const zip = new JSZip();
  const folder = zip.folder("frames");

  for (let i = 0; i < totalFrames; i++) {
    renderFrame(i / totalFrames);
    const { canvas } = grabFrame(glCanvas, w, h, transparent ? null : bgColor);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
    const name = `frame_${String(i).padStart(4, "0")}.png`;
    folder.file(name, blob);
    onProgress?.((i + 1) / totalFrames);
    if (i % 2 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  const out = await zip.generateAsync({ type: "blob" }, (meta) => {
    onProgress?.(0.99 + meta.percent / 10000);
  });
  download(out, `particles-frames-${Date.now()}.zip`);
}
