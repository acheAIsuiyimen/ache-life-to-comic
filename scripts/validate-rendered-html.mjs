import {readFile} from "node:fs/promises";
import {DESIGN_SYSTEM_VERSION, MONTHLY_RENDERER_VERSION} from "./page-renderer.mjs";

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const FORBIDDEN_SIGNATURES = [
  ["raw-tool-result", "mcp_call_tool_result"],
  ["invented-present-files", "present_files"],
  ["remote-google-font", "fonts.googleapis.com"],
  ["generic-blog-page-frame", 'class="page-frame"'],
  ["generic-blog-episode", 'class="episode"']
];

export function validateRenderedHtmlText(html) {
  const failures = [];
  const designMetaRe = new RegExp(`<meta name="ache-design-system" content="${escapeRe(DESIGN_SYSTEM_VERSION)}">`, "u");
  const rendererMetaRe = new RegExp(`<meta name="ache-renderer" content="${escapeRe(MONTHLY_RENDERER_VERSION)}">`, "u");
  if (!designMetaRe.test(html)) {
    failures.push("missing-design-system-meta");
  }
  if (!rendererMetaRe.test(html)) {
    failures.push("missing-renderer-meta");
  }
  if (!html.includes('class="ache-page ')) failures.push("missing-page-artboards");
  if (!/aspect-ratio:\s*3\s*\/\s*4/u.test(html)) failures.push("missing-3x4-contract");
  if (!/(?:background|--ache-white):\s*(?:var\(--ache-white\)|#fff(?:fff)?)(?:[;}])/u.test(html)) {
    failures.push("missing-white-page-ground");
  }
  if (/\.ache-title(?:[^{}]|\{[^}]*\})*\{[^}]*white-space:\s*nowrap/gu.test(html)) {
    failures.push("forced-title-nowrap");
  }
  if (html.includes("ache-text-token")) failures.push("tiny-decoration-token-regression");
  if (!html.includes('data-theme-source="')) failures.push("missing-theme-contract");
  if (!html.includes('data-ache-layout-guard="1"')) failures.push("missing-runtime-layout-guard");
  if (/<[^>]+data-frame-fit="mismatch"[^>]*>/gu.test(html)) failures.push("frame-image-ratio-mismatch");
  if (/<[^>]+data-frame-fit="unknown"[^>]*>/gu.test(html)) failures.push("frame-image-ratio-unmeasured");
  const supportingComponents = html.match(/<img\b[^>]*data-asset-role="(?:explanatory-vignette|decorative-component)"[^>]*>/gu) ?? [];
  for (const component of supportingComponents) {
    if (!/data-background-mode="(?:transparent-raster|svg-vector)"/u.test(component)) {
      failures.push("supporting-component-background-not-transparent");
    }
    if (!/data-transparency-status="verified-transparent"/u.test(component)) {
      failures.push("supporting-component-transparency-unverified");
    }
    if (/data-background-mode="svg-vector"/u.test(component) && !/data-detected-format="svg"/u.test(component)) {
      failures.push("supporting-component-format-mismatch");
    }
  }
  if (/<img\b[^>]*data-image-fit="cover"(?![^>]*data-crop-safe-subject="declared")[^>]*>/gu.test(html)) {
    failures.push("unsafe-crop-rendered");
  }
  // 留白区贴纸契约：K/M/L 文字页的装饰只能以 whitespace-zone 方式出现
  // （正文之后的真实排版空间），旧的浮贴/侧栏形态一律视为回归。
  if (html.includes("ache-float-sticker") || html.includes("ache-text-page--with-float-stickers")) {
    failures.push("legacy-float-sticker-regression");
  }
  // 会议页不做"附件大卡"：重要内容一律排版成文字，图片只是小贴纸
  if (html.includes("ache-attachment") || html.includes("zone-attachment")) {
    failures.push("legacy-attachment-card-regression");
  }
  const zoneStickerPages = html.match(/<section\b[^>]*class="[^"]*ache-text-page--with-zone-sticker[^"]*"[^>]*>/gu) ?? [];
  if (zoneStickerPages.some((tag) => !tag.includes('data-supporting-visual-placement="whitespace-zone"'))) {
    failures.push("zone-sticker-placement-mismatch");
  }
  if (/class="ache-zone-sticker/gu.test(html) && !html.includes("ache-sticker-zone")) {
    failures.push("zone-sticker-outside-zone");
  }
  if (/\.ache-text-recipe-longform-balanced-reading\s+\.ache-text-column\s*\{[^}]*justify-content:\s*space-between/gu.test(html)) {
    failures.push("longform-forced-space-between");
  }
  for (const [failure, signature] of FORBIDDEN_SIGNATURES) {
    if (html.includes(signature)) failures.push(failure);
  }
  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    failures
  };
}

export async function validateRenderedHtml(filePath) {
  return validateRenderedHtmlText(await readFile(filePath, "utf8"));
}
