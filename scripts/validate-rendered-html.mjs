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
  if (!/<meta name="ache-design-system" content="ache-design-system\/1\.5\.0">/u.test(html)) {
    failures.push("missing-design-system-meta");
  }
  if (!/<meta name="ache-renderer" content="ache-monthly-renderer\/2\.3\.0">/u.test(html)) {
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
  if (/<[^>]+data-asset-role="(?:explanatory-vignette|decorative-component)"[^>]*data-background-mode="(?:opaque|unknown)"[^>]*>/gu.test(html)) {
    failures.push("supporting-component-background-not-transparent");
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
