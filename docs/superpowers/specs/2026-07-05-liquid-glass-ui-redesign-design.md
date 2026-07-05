# Liquid-Glass UI Redesign — SVG → 3D Particle Forge

**Date:** 2026-07-05
**Reference:** https://backgrounds.supply/gradient-lab
**Goal:** Rebuild the tool's UI in a modern liquid-glass style and raise it to
enterprise-grade robustness, without touching the proven Three.js particle /
export pipeline.

## Decision context

This spec was produced in an autonomous session (user unavailable for
mid-task questions). Decisions below follow the user's stated direction:
gradient-lab as layout/interaction reference, liquid-glass aesthetic, more
robust "enterprise" feel. All choices are reversible and flagged for review.

## Approach chosen

**Restructure within the existing vanilla JS + Vite architecture.**
Rejected: pure CSS reskin (doesn't deliver robustness) and a React rewrite
(high regression risk to the export/embed pipeline for no functional gain at
this size — ~1,400 LOC).

Files touched: `index.html`, `src/style.css` (full rewrite), `src/ui.js`
(extended), `src/main.js` (small hooks). Untouched: `particles.js`,
`shaders.js`, `svgSampler.js`, `exporters.js`, `embed.js`, `presets.js`.

## Design system — "liquid glass"

- **Surfaces:** floating glass panels — `backdrop-filter: blur(24px)
  saturate(1.6)`, translucent white fills (4–8% alpha), 1px hairline borders
  with a top-edge inner highlight, 16–20px radii, layered soft shadows.
  Panels float with a gutter (not edge-glued) like gradient-lab's cards.
- **Color:** near-black blue stage (`#07090d` family) so the glass reads;
  keep the signature orange as brand accent but refine it into a warm
  gradient (`#f1591f → #ff8a5c`) used only for active states, the primary
  export button, and slider fills. Everything else neutral glass.
- **Typography:** system stack (SF/Inter feel); spaced-uppercase micro-labels
  for sections, tabular numerals for all values.
- **Motion:** 150–200ms ease transitions on hover/collapse; respects
  `prefers-reduced-motion`.

## Layout (gradient-lab inspired)

- **Top bar:** floating glass bar — brand left; center: camera toggle +
  shuffle; right: live FPS counter chip + primary gradient **EXPORT** button
  that scrolls/highlights the export section.
- **Left glass panel:** Subject (shape grid, upload, text input), Shape,
  Look — as **collapsible sections** with chevrons; collapsed state persists.
- **Right glass panel:** Ambient Wave, Rotation, Cursor Wave, Film & Export —
  same collapsible treatment.
- **Sliders:** filled-track sliders (accent fill up to thumb) with an
  editable **numeric input** beside each label (gradient-lab's numeric
  precision pattern). Typing a value clamps to min/max and applies.
- **Stage frame:** keep the bracket/viewfinder motif but lighter; RESET CAM
  becomes a glass chip.
- **Modal / drop overlay:** glass cards with heavier blur.

## Enterprise robustness

1. **Settings persistence** — full `config` saved to `localStorage`
   (debounced) and restored on boot; "RESET ALL" control restores defaults.
   Subject/uploaded SVG text also persisted so a reload restores the scene.
2. **Toast notifications** — non-blocking toast stack (success / error /
   info) replacing silent failures; export completion and errors surface
   there as well as in the status line.
3. **Error handling** — `try/catch` around SVG parsing (upload, drop, text),
   export drivers, and clipboard; malformed SVG shows an error toast and
   keeps the previous shape. WebM recording guarded for unsupported codecs.
4. **Export UX** — export buttons disabled + progress percentage while a
   render runs; guard against concurrent exports.
5. **FPS meter** — rolling average in the top bar (gradient-lab parity).
6. **Accessibility** — keyboard-focus styles, `aria-expanded` on section
   headers, `aria-pressed` on toggles, Esc closes modal, labels tied to
   inputs, `prefers-reduced-motion` honored.
7. **Responsive** — panels become slide-over drawers under 1024px with a
   bottom toolbar toggle, instead of today's squeezed 250px columns.

## Non-goals (YAGNI)

No framework migration, no accounts/cloud, no preset marketplace, no
undo/redo history, no changes to particle math, sampling, shaders, or the
GIF/PNG/WebM/embed pipelines.

## Testing

Manual verification via dev server + Playwright screenshots: initial load,
section collapse, slider + numeric input sync, upload error path (invalid
SVG), export progress state, persistence across reload, 900px-wide viewport.
