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
  if (!/<meta name="ache-design-system" content="ache-design-system\/1\.4\.0">/u.test(html)) {
    failures.push("missing-design-system-meta");
  }
  if (!/<meta name="ache-renderer" content="ache-monthly-renderer\/2\.2\.0">/u.test(html)) {
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
