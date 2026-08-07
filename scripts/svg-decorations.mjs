// Deterministic SVG interludes for K/M/L text pages.
// Transparent hand-drawn vignettes that breathe BETWEEN paragraphs in the
// single-column reading flow — never a sidebar, never a white card.
//
// Design language (aligned with the skill's page-grammar / validation-gates
// and the HEYTEA layout manual):
//   - 每页一个意外: one hero object + at most one tiny accent, never a pile.
//   - 材料有语义: K=archive (folder/stamp/clip), M=action (check/arrow/pin),
//     L=reading (bookmark/pencil/folded page).
//   - 克制的童真: imperfect double strokes, slight rotation, generous paper.
//   - 颜色公式: ink + pale fill + ONE content color per scene (max 3).

export const SVG_DECORATIONS_VERSION = "ache-svg-decorations/2.0.1";

// Tiny seeded PRNG (mulberry32) — keeps interludes stable per episode+page.
function createRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function jitter(rng, base, amplitude) {
  return base + (rng() - 0.5) * 2 * amplitude;
}

// Safe number formatter — always call with a NUMBER to avoid the classic
// `a + b.toFixed(1)` string-concatenation trap.
function fmt(n, digits = 1) {
  return Number(n).toFixed(digits);
}

// ——————————————————————————————————————————————
// Hand-drawn primitives
// ——————————————————————————————————————————————

// A slightly wobbling line between two points (quadratic with jittered control).
function handLine(rng, x1, y1, x2, y2, bend = 5) {
  const mx = (x1 + x2) / 2 + jitter(rng, 0, bend);
  const my = (y1 + y2) / 2 + jitter(rng, 0, bend);
  return `M ${fmt(x1)} ${fmt(y1)} Q ${fmt(mx)} ${fmt(my)} ${fmt(x2)} ${fmt(y2)}`;
}

// Double-stroke hand feel: main ink stroke + offset light echo (pencil ghost).
function handStroke(d, colors, width = 2, {echo = true, color = null, opacity = 0.72} = {}) {
  const main = `<path d="${d}" fill="none" stroke="${color ?? colors.ink}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
  if (!echo) return main;
  return main + `<path d="${d}" fill="none" stroke="${colors.soft}" stroke-width="${fmt(Math.max(0.7, width * 0.45))}" stroke-linecap="round" stroke-linejoin="round" opacity="0.26" transform="translate(1.6,2.1)"/>`;
}

// 2-3 short pseudo-writing lines (fact layer stays abstract — no real glyphs).
function writingLines(rng, x, y, widths, colors, {gap = 16, width = 1.4, color = null} = {}) {
  return widths.map((len, i) => {
    const yy = y + i * gap;
    return `<path d="${handLine(rng, x, yy, x + len, yy + jitter(rng, 0, 1.5), 2.5)}" fill="none" stroke="${color ?? colors.soft}" stroke-width="${width}" stroke-linecap="round" opacity="0.5"/>`;
  }).join("");
}

// Four-point sparkle (the "one small surprise").
function sparkleAt(cx, cy, r, color, opacity = 0.8) {
  const k = r * 0.32;
  return `<path d="M ${fmt(cx)} ${fmt(cy - r)} Q ${fmt(cx + k)} ${fmt(cy - k)} ${fmt(cx + r)} ${fmt(cy)} Q ${fmt(cx + k)} ${fmt(cy + k)} ${fmt(cx)} ${fmt(cy + r)} Q ${fmt(cx - k)} ${fmt(cy + k)} ${fmt(cx - r)} ${fmt(cy)} Q ${fmt(cx - k)} ${fmt(cy - k)} ${fmt(cx)} ${fmt(cy - r)} Z" fill="${color}" opacity="${opacity}"/>`;
}

// Rough hand-drawn circle built from jittered quadratic arcs.
function roughCircle(rng, cx, cy, r, color, width, opacity) {
  const n = 8;
  let d = "";
  for (let i = 0; i < n; i++) {
    const a1 = (i / n) * Math.PI * 2;
    const a2 = ((i + 1) / n) * Math.PI * 2;
    const am = (a1 + a2) / 2;
    const r1 = r + jitter(rng, 0, 2.2);
    const r2 = r + jitter(rng, 0, 2.2);
    const rm = r + jitter(rng, 2.5, 2.5);
    const x1 = cx + Math.cos(a1) * r1;
    const y1 = cy + Math.sin(a1) * r1;
    const x2 = cx + Math.cos(a2) * r2;
    const y2 = cy + Math.sin(a2) * r2;
    const xm = cx + Math.cos(am) * rm;
    const ym = cy + Math.sin(am) * rm;
    d += (i === 0 ? `M ${fmt(x1)} ${fmt(y1)}` : "") + ` Q ${fmt(xm)} ${fmt(ym)} ${fmt(x2)} ${fmt(y2)}`;
  }
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`;
}

// Imperfect rectangle (corners jittered, edges slightly bowed).
function roughRect(rng, x, y, w, h, color, width, opacity) {
  const j = () => jitter(rng, 0, 1.8);
  const d = `M ${fmt(x + j())} ${fmt(y + j())}`
    + ` Q ${fmt(x + w / 2)} ${fmt(y + j())} ${fmt(x + w + j())} ${fmt(y + j())}`
    + ` Q ${fmt(x + w + j())} ${fmt(y + h / 2)} ${fmt(x + w + j())} ${fmt(y + h + j())}`
    + ` Q ${fmt(x + w / 2)} ${fmt(y + h + j())} ${fmt(x + j())} ${fmt(y + h + j())}`
    + ` Q ${fmt(x + j())} ${fmt(y + h / 2)} ${fmt(x + j())} ${fmt(y + j())} Z`;
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" opacity="${opacity}"/>`;
}

// Washi tape strip pinning a paper hero's top edge. Drawn INSIDE the scene
// at a per-scene anchor, so the tape always lands exactly on the paper —
// never floats over empty canvas. Half on the hero, half on the page.
function washiTape(rng, anchor, colors) {
  const {x, y, a} = anchor;
  const w = 64;
  const h = 17;
  const j = () => jitter(rng, 0, 1.2);
  const d = `M ${fmt(-w / 2 + j())} ${fmt(-h / 2 + j())} L ${fmt(w / 2 + j())} ${fmt(-h / 2 + j())} L ${fmt(w / 2 + j())} ${fmt(h / 2 + j())} L ${fmt(-w / 2 + j())} ${fmt(h / 2 + j())} Z`;
  return `<g transform="translate(${fmt(x)} ${fmt(y)}) rotate(${fmt(a + jitter(rng, 0, 2))})" opacity="0.9">`
    + `<path d="${d}" fill="${colors.primary}" opacity="0.32"/>`
    + `<path d="${d}" fill="#FFFFFF" opacity="0.38"/>`
    + `<path d="M ${fmt(-w / 2)} ${fmt(-h / 2)} L ${fmt(-w / 2)} ${fmt(h / 2)} M ${fmt(w / 2)} ${fmt(-h / 2)} L ${fmt(w / 2)} ${fmt(h / 2)}" stroke="#FFFFFF" stroke-width="1.6" stroke-dasharray="2.5 2.5" opacity="0.85"/>`
    + `</g>`;
}

// ——————————————————————————————————————————————
// Hero scenes — K 知识 · 档案语义 (archive)
// ——————————————————————————————————————————————

// Folder card with a tab and a clip — "归档".
function folderCardScene(rng, colors, c) {
  const rot = jitter(rng, -1.6, 1.6);
  const card = `<path d="M 96 80 L 120 80 L 129 68 L 158 68 L 165 80 L 244 80 Q 252 80 252 88 L 252 158 Q 252 166 244 166 L 96 166 Q 88 166 88 158 L 88 88 Q 88 80 96 80 Z" fill="${colors.pale}" stroke="${colors.ink}" stroke-width="2" stroke-linejoin="round" opacity="0.94"/>`;
  const lines = writingLines(rng, 106, 106, [104, 122, 76], colors, {gap: 19});
  const clip = `<g transform="translate(208,48) rotate(${fmt(jitter(rng, -8, 8))})"><path d="M 12 0 Q 0 0 0 14 L 0 42 Q 0 54 12 54 Q 25 54 25 42 L 25 15 Q 25 7 17 7 Q 10 7 10 15 L 10 38" fill="none" stroke="${colors.ink}" stroke-width="2.2" stroke-linecap="round" opacity="0.68"/></g>`;
  const star = sparkleAt(232, 146, 6.5, c);
  return `<g transform="rotate(${fmt(rot)} 170 118)">${card}${lines}${star}</g>${clip}`;
}

// Round stamp with a bold check — "完成 / 已收录".
function stampScene(rng, colors, c) {
  const cx = 162, cy = 108;
  const outer = roughCircle(rng, cx, cy, 56, c, 2.6, 0.78);
  const inner = roughCircle(rng, cx, cy, 44, c, 1.2, 0.38);
  const check = handStroke(`M ${fmt(cx - 17)} ${fmt(cy + 1)} L ${fmt(cx - 3)} ${fmt(cy + 15)} L ${fmt(cx + 21)} ${fmt(cy - 17)}`, colors, 3, {echo: false, opacity: 0.78});
  const under = writingLines(rng, cx - 24, cy + 74, [48], colors, {gap: 12, width: 1.3});
  const dots = `<circle cx="${fmt(cx - 66)}" cy="${fmt(cy + 40)}" r="2.2" fill="${colors.soft}" opacity="0.4"/>
    <circle cx="${fmt(cx + 62)}" cy="${fmt(cy - 44)}" r="2.6" fill="${c}" opacity="0.5"/>`;
  return `<g transform="rotate(${fmt(jitter(rng, -5, 5))} ${cx} ${cy})">${outer}${inner}${check}</g>${under}${dots}`;
}

// Sticky note held by a paperclip — "先别在这里".
function clippedNoteScene(rng, colors, c) {
  const rot = jitter(rng, 1.5, 3);
  const note = `<rect x="88" y="70" width="148" height="102" rx="4" fill="${colors.pale}" stroke="${colors.ink}" stroke-width="2" opacity="0.95"/>`;
  const fold = `<path d="M 236 70 L 236 88 L 218 70 Z" fill="${colors.paper}" stroke="${colors.ink}" stroke-width="1.4" stroke-linejoin="round" opacity="0.7"/>`;
  const lines = writingLines(rng, 106, 104, [104, 88, 58], colors, {gap: 20});
  const clip = `<g transform="translate(146,42) rotate(${fmt(jitter(rng, -6, 6))})"><path d="M 14 0 Q 2 0 2 14 L 2 44 Q 2 58 16 58 Q 30 58 30 44 L 30 16 Q 30 8 22 8 Q 15 8 15 16 L 15 40" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" opacity="0.85"/></g>`;
  return `<g transform="rotate(${fmt(rot)} 162 122)">${note}${fold}${lines}</g>${clip}`;
}

// ——————————————————————————————————————————————
// Hero scenes — M 会议 · 行动语义 (action)
// ——————————————————————————————————————————————

// Two checkboxes, one ticked — "决定与待办".
function checklistScene(rng, colors, c) {
  const box1 = roughRect(rng, 88, 62, 27, 27, colors.ink, 2.2, 0.72);
  const box2 = roughRect(rng, 88, 116, 27, 27, colors.ink, 2.2, 0.72);
  const tick = handStroke(`M 94 76 L 100 84 L 112 66`, colors, 3, {echo: false, color: c, opacity: 0.9});
  const line1 = writingLines(rng, 132, 76, [84], colors, {gap: 14, width: 1.6});
  const line2 = writingLines(rng, 132, 130, [56], colors, {gap: 14, width: 1.6});
  const dot = `<circle cx="226" cy="76" r="3" fill="${c}" opacity="0.55"/>`;
  return `<g transform="rotate(${fmt(jitter(rng, -1.5, 1.5))} 160 108)">${box1}${box2}${tick}${line1}${line2}${dot}</g>`;
}

// Sticky note with a hand-drawn arrow — "接下来看这里".
function arrowNoteScene(rng, colors, c) {
  const rot = jitter(rng, -2.5, -1);
  const note = `<rect x="72" y="56" width="122" height="92" rx="4" fill="${colors.pale}" stroke="${colors.ink}" stroke-width="2" opacity="0.95"/>`;
  const lines = writingLines(rng, 88, 88, [86, 68], colors, {gap: 19});
  const arrowD = `M 200 128 Q ${fmt(jitter(rng, 228, 6))} ${fmt(jitter(rng, 138, 6))} ${fmt(jitter(rng, 244, 5))} ${fmt(jitter(rng, 164, 5))}`;
  const arrow = `<path d="${arrowD}" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" opacity="0.85"/>
    <path d="M 236 152 L ${fmt(246)} ${fmt(165)} L 230 168" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
  return `<g transform="rotate(${fmt(rot)} 132 102)">${note}${lines}</g>${arrow}`;
}

// Note pinned to the page — "钉住的风险".
function pinnedNoteScene(rng, colors, c) {
  const rot = jitter(rng, -3, -1.5);
  const note = `<rect x="96" y="64" width="138" height="102" rx="4" fill="${colors.pale}" stroke="${colors.ink}" stroke-width="2" opacity="0.95"/>`;
  const lines = writingLines(rng, 114, 106, [100, 82, 52], colors, {gap: 20});
  const pin = `<circle cx="165" cy="62" r="10" fill="${c}" opacity="0.85"/>
    <circle cx="162" cy="59" r="3.4" fill="${colors.paper}" opacity="0.85"/>
    <path d="${handLine(rng, 152, 74, 178, 72, 2)}" fill="none" stroke="${colors.ink}" stroke-width="1.2" stroke-linecap="round" opacity="0.4"/>`;
  return `<g transform="rotate(${fmt(rot)} 165 116)">${note}${lines}${pin}</g>`;
}

// ——————————————————————————————————————————————
// Hero scenes — L 长文 · 阅读语义 (reading)
// ——————————————————————————————————————————————

// Ribbon bookmark with a tiny star — "先读到这里".
function bookmarkScene(rng, colors, c) {
  const rot = jitter(rng, 1.5, 2.5);
  const ribbon = `<path d="M 138 46 L 192 46 L 192 152 L 165 132 L 138 152 Z" fill="${colors.pale}" stroke="${colors.ink}" stroke-width="2" stroke-linejoin="round" opacity="0.94"/>`;
  const lines = writingLines(rng, 150, 72, [30, 30], colors, {gap: 15, width: 1.4});
  const star = sparkleAt(204, 158, 7, c);
  const dots = `<circle cx="112" cy="60" r="2.4" fill="${colors.soft}" opacity="0.4"/>
    <circle cx="222" cy="84" r="2" fill="${colors.soft}" opacity="0.35"/>`;
  return `<g transform="rotate(${fmt(rot)} 165 104)">${ribbon}${lines}${star}</g>${dots}`;
}

// Pencil with a wavy underline — "这句划了重点".
function pencilScene(rng, colors, c) {
  const rot = jitter(rng, -2, 2);
  // pencil pointing down-left toward the underline
  const body = `<path d="M 128 128 L 204 52 L 220 68 L 144 144 Z" fill="${colors.pale}" stroke="${colors.ink}" stroke-width="2" stroke-linejoin="round" opacity="0.94"/>`;
  const tipWood = `<path d="M 128 128 L 144 144 L 124 152 Z" fill="${colors.paper}" stroke="${colors.ink}" stroke-width="1.8" stroke-linejoin="round" opacity="0.9"/>`;
  const lead = `<path d="M 128 128 L 124 152 L 134 142 Z" fill="${c}" opacity="0.85"/>`;
  const band = `<path d="M 204 52 L 220 68 L 226 62 L 210 46 Z" fill="${c}" stroke="${colors.ink}" stroke-width="1.4" stroke-linejoin="round" opacity="0.8"/>`;
  const underline = `<path d="${handLine(rng, 84, 184, 238, 178, 10)}" fill="none" stroke="${c}" stroke-width="2.6" stroke-linecap="round" opacity="0.8"/>`;
  const shaving = `<path d="M 104 158 q -8 6 -2 12 q 6 5 10 -2" fill="none" stroke="${colors.soft}" stroke-width="1.3" stroke-linecap="round" opacity="0.5"/>`;
  return `<g transform="rotate(${fmt(rot)} 160 110)">${body}${tipWood}${lead}${band}${underline}${shaving}</g>`;
}

// Page with a folded corner and a circled mark — "回头再看".
function foldedPageScene(rng, colors, c) {
  const rot = jitter(rng, -1.5, 1.5);
  const page = `<path d="M 104 50 L 210 50 L 210 72 L 232 94 L 232 182 Q 232 190 224 190 L 104 190 Q 96 190 96 182 L 96 58 Q 96 50 104 50 Z" fill="${colors.paper}" stroke="${colors.ink}" stroke-width="2" stroke-linejoin="round" opacity="0.95"/>`;
  const fold = `<path d="M 210 50 L 210 72 L 232 94 L 210 94 Z" fill="${colors.pale}" stroke="${colors.ink}" stroke-width="1.6" stroke-linejoin="round" opacity="0.9"/>`;
  const lines = writingLines(rng, 116, 118, [84, 96, 62], colors, {gap: 19});
  const circleMark = roughCircle(rng, 158, 104, 14, c, 1.8, 0.75);
  return `<g transform="rotate(${fmt(rot)} 164 120)">${page}${fold}${lines}${circleMark}</g>`;
}

// ——————————————————————————————————————————————
// Tiny accents (at most ONE per scene — 每页一个意外)
// ——————————————————————————————————————————————

function accentDots(rng, colors, c) {
  const spots = [[52, 58], [268, 60], [58, 172], [264, 170], [160, 34]];
  const start = Math.floor(rng() * spots.length);
  const picked = [spots[start % spots.length], spots[(start + 2) % spots.length]];
  return picked.map(([x, y], i) => `<circle cx="${fmt(x + jitter(rng, 0, 6))}" cy="${fmt(y + jitter(rng, 0, 6))}" r="${fmt(1.8 + rng() * 1.4)}" fill="${i === 0 ? colors.soft : c}" opacity="${fmt(0.35 + rng() * 0.2, 2)}"/>`).join("");
}

function accentSparkle(rng, colors, c) {
  const spots = [[54, 56], [266, 58], [56, 174], [262, 168]];
  const [x, y] = spots[Math.floor(rng() * spots.length)];
  return sparkleAt(x + jitter(rng, 0, 6), y + jitter(rng, 0, 6), 5.5 + rng() * 2, c, 0.65);
}

// Cat-paw print — the book's recurring character passing by (不抢正文).
function accentPaw(rng, colors) {
  const spots = [[58, 168], [258, 62], [60, 62], [256, 168]];
  const [x, y] = spots[Math.floor(rng() * spots.length)];
  const rot = jitter(rng, -18, 18);
  const toe = (dx, dy, rx) => `<ellipse cx="${fmt(dx)}" cy="${fmt(dy)}" rx="${fmt(rx)}" ry="${fmt(rx * 1.15)}" fill="${colors.soft}" opacity="0.38"/>`;
  return `<g transform="rotate(${fmt(rot)} ${fmt(x)} ${fmt(y)})">
    ${toe(x - 9, y - 8, 3.4)}${toe(x - 3, y - 12, 3.4)}${toe(x + 3, y - 12, 3.4)}${toe(x + 9, y - 8, 3.4)}
    <ellipse cx="${fmt(x)}" cy="${fmt(y + 3)}" rx="7.5" ry="6" fill="${colors.soft}" opacity="0.38"/>
  </g>`;
}

const ACCENTS = [accentDots, accentSparkle, accentPaw];

// ——————————————————————————————————————————————
// Scene routing — semantic materials per route
// ——————————————————————————————————————————————

const SCENES = {
  K: [folderCardScene, stampScene, clippedNoteScene],
  M: [checklistScene, arrowNoteScene, pinnedNoteScene],
  L: [bookmarkScene, pencilScene, foldedPageScene]
};

// ——————————————————————————————————————————————
// Public API
// ——————————————————————————————————————————————

/**
 * Generate a transparent inline SVG interlude that breathes between
 * paragraphs of a K/M/L text page. One hero object + at most one accent.
 *
 * @param {object} options
 * @param {string} options.episodeId - stable id for deterministic seeding
 * @param {number} options.pageIndex  - 0-based body page index
 * @param {object} options.colors    - {ink, soft, primary, pale, accent, paper}
 * @param {string} [options.density] - "sparse" | "normal" | "dense"
 * @param {string} [options.route]   - "K" | "M" | "L"
 * @returns {string} inline <svg> markup (transparent, no background rect)
 */
export function interludeSvg(options = {}) {
  const {
    episodeId = "default",
    pageIndex = 0,
    colors = {ink: "#202B37", soft: "#667487", primary: "#78A8DC", pale: "#DBE9F7", accent: "#C96355", paper: "#FFFFFF"},
    density = "normal",
    route = "L"
  } = options;

  const seed = hashString(`${episodeId}|${route}|p${pageIndex}|interlude-v2`);
  const rng = createRng(seed);

  // ONE content color per scene (颜色公式: 内容色 5–15%).
  const contentColor = rng() > 0.5 ? colors.primary : colors.accent;

  const scenePool = SCENES[route] ?? SCENES.L;
  const hero = scenePool[Math.floor(rng() * scenePool.length)];
  const heroMarkup = hero(rng, colors, contentColor);

  // sparse = hero alone; normal/dense = hero + exactly one tiny accent.
  const accent = density === "sparse"
    ? ""
    : ACCENTS[Math.floor(rng() * ACCENTS.length)](rng, colors, contentColor);

  // 320×220 horizontal vignette — sits between paragraphs at ~38% column
  // width. No background rect: the paper of the page shows through.
  return `<svg class="ache-interlude-svg" xmlns="http://www.w3.org/2000/svg" width="200" height="178" viewBox="62 26 200 178" preserveAspectRatio="xMidYMid meet" data-asset-role="decorative-component" data-background-mode="svg-vector" data-detected-format="svg" data-transparency-status="verified-transparent" data-edge-treatment="die-cut-transparent" aria-hidden="true">${heroMarkup}${accent}</svg>`;
}
