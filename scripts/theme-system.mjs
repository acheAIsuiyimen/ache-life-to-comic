export const THEME_SYSTEM_VERSION = "ache-theme-system/1.0.0";

const HEX = /^#[0-9a-f]{6}$/iu;

const STYLE_PALETTES = {
  "01-cloud-watercolor": {ink: "#20323D", soft: "#617985", primary: "#68A9B3", pale: "#DCEFF0", accent: "#E36B55"},
  "02-snow-pastel": {ink: "#202B37", soft: "#667487", primary: "#78A8DC", pale: "#DBE9F7", accent: "#C96355"},
  "03-white-pencil": {ink: "#29352D", soft: "#6F7D70", primary: "#79A477", pale: "#E1EFE0", accent: "#D56F58"},
  "04-two-color-line": {ink: "#202936", soft: "#6A7180", primary: "#2F6EDB", pale: "#DFE9FC", accent: "#F04D3F"},
  "05-ink-watercolor": {ink: "#262C2B", soft: "#6D7672", primary: "#698B7A", pale: "#E3ECE7", accent: "#B86452"}
};

function safeColor(value, fallback) {
  return HEX.test(String(value ?? "")) ? String(value).toUpperCase() : fallback;
}

export function resolveThemePalette({styleId = "02-snow-pastel", palette = null, source = null} = {}) {
  const base = STYLE_PALETTES[styleId] ?? STYLE_PALETTES["02-snow-pastel"];
  const resolved = {
    ink: safeColor(palette?.ink, base.ink),
    soft: safeColor(palette?.soft, base.soft),
    primary: safeColor(palette?.primary, base.primary),
    pale: safeColor(palette?.pale, base.pale),
    accent: safeColor(palette?.accent, base.accent),
    paper: "#FFFFFF"
  };
  return {
    version: THEME_SYSTEM_VERSION,
    styleId,
    source: source ?? (palette ? "chapter-theme" : "style-default"),
    colors: resolved
  };
}

export function themeStyleAttribute(theme) {
  const colors = theme.colors;
  return [
    `--ache-ink:${colors.ink}`,
    `--ache-ink-soft:${colors.soft}`,
    `--ache-ice:${colors.primary}`,
    `--ache-ice-pale:${colors.pale}`,
    `--ache-coral:${colors.accent}`,
    "--ache-white:#FFFFFF"
  ].join(";");
}
