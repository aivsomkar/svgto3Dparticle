# SVG → 3D Particles · forge

Turn any SVG (or typed text, or a built-in shape) into a rotating, extruded
**3D particle volume** you can disturb with your cursor — then export it as
**WebM**, **GIF**, a **PNG frame sequence**, or as **embeddable code** you can
paste into your own website. Built with Three.js + Vite.

![preview](./preview.png)

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

## Panel guide

The UI is a liquid-glass control surface in the gradient-lab idiom: two
floating frosted panels over a full-bleed stage, neutral glass buttons with
white active states, and sentence-case labels.

- **Left panel** — Subject grid (9 shapes + *Show more*), Upload SVG, text →
  3D input, and a **Presets** list (Aurora, Hologram, Ember, Gold, Neon,
  Acid, Frost, Sunset, Matrix, Ink) — palette + finish only, so applying one
  never resets your shape or motion settings.
- **Right panel** — Colors (swatches, *Use SVG colors*, *Glow*, **Randomize
  palette**), Shape sliders, Motion (ambient wave / rotation / cursor wave),
  and Export.

Every slider has an editable mono numeric readout; settings (including your
shape) persist across reloads via `localStorage`, and **Reset all settings**
restores defaults. Failures (malformed SVGs, export errors) surface as toast
notifications. A live fps meter sits in the top bar next to the camera
toggle, shuffle, and the white **Export** button. Under 1024px the panels
become slide-over drawers toggled from a bottom bar.

Notes on specific controls: *Volume from thickness* runs a distance transform
over the shape so chunky regions bulge into a deeper, denser volume while
thin strokes stay shallow (0 = uniform slab, 1 = fully volumetric). Ambient
wave direction is Radial / Horizontal / Vertical / Diagonal. Export offers
FPS, loop seconds, rotations/loop, WebM seconds, resolution (512 → 4K), and a
transparent toggle. Drag-and-drop an SVG *anywhere*.

Top bar: the camera chip toggles perspective ↔ orthographic, 🎲 shuffles the
composition, **Export** jumps to the render controls. Drag to orbit; **Reset
camera** recenters.

## Displacement is depth-only

The cursor/ambient waves only ever push particles along **Z (depth)** — never
along X/Y — so the silhouette of your original shape is always preserved (no
sideways smearing).

## Exports

| Format | How | Transparency |
|---|---|---|
| **WebM** | live `MediaRecorder`, VP9 @ 40 Mbps (captures cursor interaction) | browser-dependent (best in Chrome) |
| **GIF** | offline **seamless loop**, `gifenc` palette quantization | ✅ true alpha |
| **PNG frames** | zipped (`JSZip`), full alpha | ✅ true alpha |
| **GET CODE** | self-contained HTML/JS snippet — copy or download `.html` | ✅ |

GIF/PNG render offline at the chosen resolution and loop perfectly: the ambient
wave advances one full cycle and the turntable does N full rotations across the
frame range.

### Embed on your site

**GET CODE** produces a paste-anywhere snippet: a `<div id="svg-particles">`
plus a `<script type="module">` that loads Three.js from a CDN, re-samples your
baked SVG, and reproduces the live look (extrusion, ambient + cursor wave,
turntable). Honors the Transparent toggle. Verified to run standalone.

## Source map

| File | Role |
|---|---|
| [main.js](src/main.js) | scene, loop, motion modes, presets/material/scene wiring, export driver |
| [ui.js](src/ui.js) | builds the glass panels: sliders + numeric inputs, collapsible sections, toasts, embed modal |
| [presets.js](src/presets.js) | built-in shapes + text→SVG |
| [svgSampler.js](src/svgSampler.js) | rasterize SVG → extruded particle positions |
| [particles.js](src/particles.js) | `THREE.Points` system + shader material |
| [shaders.js](src/shaders.js) | depth-only ambient + cursor wave shaders |
| [exporters.js](src/exporters.js) | WebM / GIF / PNG-sequence encoders |
| [embed.js](src/embed.js) | self-contained embed snippet + HTML generator |
