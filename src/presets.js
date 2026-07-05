// Built-in subject shapes as SVG strings (viewBox 0 0 200 200), plus helpers to
// turn arbitrary text into an SVG so it can run through the same sampler.

const C = "#cfe9e3"; // default fill (ORIGINAL material uses these)

function starPoints(cx, cy, R, r, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const ang = (Math.PI / n) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    pts.push(`${(cx + Math.cos(ang) * rad).toFixed(1)},${(cy + Math.sin(ang) * rad).toFixed(1)}`);
  }
  return pts.join(" ");
}

function hexPoints(cx, cy, R) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const ang = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${(cx + Math.cos(ang) * R).toFixed(1)},${(cy + Math.sin(ang) * R).toFixed(1)}`);
  }
  return pts.join(" ");
}

const wrap = (inner, vb = "0 0 200 200") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${inner}</svg>`;

export const SHAPES = {
  star: () => wrap(`<polygon points="${starPoints(100, 102, 92, 38)}" fill="${C}"/>`),
  bolt: () => wrap(`<path d="M112 16 L50 112 L96 112 L84 184 L152 76 L104 76 Z" fill="${C}"/>`),
  heart: () =>
    wrap(
      `<path d="M100 176 C30 120 18 78 44 52 C66 30 96 38 100 64 C104 38 134 30 156 52 C182 78 170 120 100 176 Z" fill="${C}"/>`
    ),
  arrow: () =>
    wrap(`<polygon points="100,20 168,100 128,100 128,180 72,180 72,100 32,100" fill="${C}"/>`),
  ring: () => wrap(`<circle cx="100" cy="100" r="74" fill="none" stroke="${C}" stroke-width="30"/>`),
  asterisk: () =>
    wrap(
      `<g stroke="${C}" stroke-width="22" stroke-linecap="round">
        <line x1="100" y1="28" x2="100" y2="172"/>
        <line x1="38" y1="64" x2="162" y2="136"/>
        <line x1="162" y1="64" x2="38" y2="136"/>
      </g>`
    ),
  hex: () => wrap(`<polygon points="${hexPoints(100, 100, 86)}" fill="${C}"/>`),
  smile: () =>
    wrap(
      `<g>
        <circle cx="100" cy="100" r="84" fill="none" stroke="${C}" stroke-width="14"/>
        <circle cx="72" cy="84" r="11" fill="${C}"/>
        <circle cx="128" cy="84" r="11" fill="${C}"/>
        <path d="M64 120 Q100 156 136 120" fill="none" stroke="${C}" stroke-width="14" stroke-linecap="round"/>
      </g>`
    ),
  drop: () =>
    wrap(`<path d="M100 18 C100 18 168 96 168 134 A68 68 0 1 1 32 134 C32 96 100 18 100 18 Z" fill="${C}"/>`),
  plus: () =>
    wrap(`<polygon points="78,30 122,30 122,78 170,78 170,122 122,122 122,170 78,170 78,122 30,122 30,78 78,78" fill="${C}"/>`),
  moon: () =>
    wrap(`<path d="M132 26 A78 78 0 1 0 132 174 A60 60 0 1 1 132 26 Z" fill="${C}"/>`),
  diamond: () =>
    wrap(`<polygon points="100,20 175,100 100,180 25,100" fill="${C}"/>`),
  flower: () =>
    wrap(
      `<g fill="${C}">
        <circle cx="100" cy="52" r="30"/><circle cx="148" cy="100" r="30"/>
        <circle cx="100" cy="148" r="30"/><circle cx="52" cy="100" r="30"/>
        <circle cx="100" cy="100" r="26" fill="#ffd27a"/>
      </g>`
    ),
  cloud: () =>
    wrap(
      `<path d="M58 138 a34 34 0 0 1 4 -68 a40 40 0 0 1 78 6 a30 30 0 0 1 2 60 Z" fill="${C}"/>`
    ),
  gear: () => {
    const teeth = [];
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      const x = 100 + Math.cos(a) * 86;
      const y = 100 + Math.sin(a) * 86;
      teeth.push(`<rect x="${(x - 12).toFixed(1)}" y="${(y - 12).toFixed(1)}" width="24" height="24" transform="rotate(${(i * 45).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`);
    }
    return wrap(
      `<g fill="${C}">${teeth.join("")}<circle cx="100" cy="100" r="62"/></g><circle cx="100" cy="100" r="24" fill="#0a0d12"/>`
    );
  },
  spade: () =>
    wrap(
      `<path d="M100 22 C100 22 30 78 30 122 a38 38 0 0 0 62 30 C88 168 80 178 70 184 L130 184 C120 178 112 168 108 152 a38 38 0 0 0 62 -30 C170 78 100 22 100 22 Z" fill="${C}"/>`
    ),
};

export const SHAPE_KEYS = Object.keys(SHAPES);

// Turn a text string into an SVG of bold type, sized to its content.
export function textToSVG(text) {
  const t = (text || "").trim() || "3D";
  const esc = t.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const w = Math.max(200, esc.length * 110 + 80);
  return wrap(
    `<text x="${w / 2}" y="148" font-family="Arial Black, Arial, sans-serif" font-size="160" font-weight="900" letter-spacing="-6" text-anchor="middle" fill="${C}">${esc}</text>`,
    `0 0 ${w} 200`
  );
}

// Look presets — palette + finish only. They deliberately never touch shape
// or motion settings, so applying one restyles the scene without resetting
// anything the user has tuned. Tag = the finish it applies.
export const LOOK_PRESETS = [
  { name: "Aurora",   tag: "glow",  settings: { useSvgColor: false, uniformColor: "#7ef0c8", background: "#050d18", additive: true,  sparkle: false } },
  { name: "Hologram", tag: "spark", settings: { useSvgColor: false, uniformColor: "#6de5ff", background: "#02111a", additive: true,  sparkle: true  } },
  { name: "Ember",    tag: "glow",  settings: { useSvgColor: false, uniformColor: "#ff7a45", background: "#0a0503", additive: true,  sparkle: false } },
  { name: "Gold",     tag: "spark", settings: { useSvgColor: false, uniformColor: "#ffd27a", background: "#100b03", additive: true,  sparkle: true  } },
  { name: "Neon",     tag: "glow",  settings: { useSvgColor: false, uniformColor: "#ff5ad8", background: "#0d0118", additive: true,  sparkle: false } },
  { name: "Acid",     tag: "bold",  settings: { useSvgColor: false, uniformColor: "#c8ff4d", background: "#0a1004", additive: false, sparkle: false } },
  { name: "Frost",    tag: "calm",  settings: { useSvgColor: false, uniformColor: "#dceaff", background: "#0b1420", additive: false, sparkle: false } },
  { name: "Sunset",   tag: "warm",  settings: { useSvgColor: false, uniformColor: "#ff9a62", background: "#170b12", additive: false, sparkle: false } },
  { name: "Matrix",   tag: "spark", settings: { useSvgColor: false, uniformColor: "#52ff8a", background: "#020a04", additive: true,  sparkle: true  } },
  { name: "Ink",      tag: "mono",  settings: { useSvgColor: false, uniformColor: "#edf2f6", background: "#0a0c0f", additive: false, sparkle: false } },
];
