import {readFile} from "node:fs/promises";

const FORBIDDEN_SIGNATURES = [
  ["raw-tool-result", "mcp_call_tool_result"],
  ["invented-present-files", "present_files"],
  ["remote-google-font", "fonts.googleapis.com"],
  ["generic-blog-page-frame", 'class="page-frame"'],
  ["generic-blog-episode", 'class="episode"']
];

export function validateRenderedHtmlText(html) {
  const failures = [];
  if (!/<meta name="ache-design-system" content="ache-design-system\/1\.6\.0">/u.test(html)) {
    failures.push("missing-design-system-meta");
  }
  if (!/<meta name="ache-renderer" content="ache-monthly-renderer\/2\.4\.0">/u.test(html)) {
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
  const longformVisualPages = html.match(/<section\b[^>]*class="[^"]*ache-route-l[^"]*ache-text-page--with-visual[^"]*"[^>]*>/gu) ?? [];
  if (longformVisualPages.some((tag) => !tag.includes('data-supporting-visual-placement="between-paragraphs"'))) {
    failures.push("longform-visual-not-in-paragraph-flow");
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
