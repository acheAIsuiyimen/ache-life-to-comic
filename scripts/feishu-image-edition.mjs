export const FEISHU_IMAGE_EDITION_VERSION = "feishu-image-edition/1.0.0";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function validateFeishuImageEdition({
  pages,
  expectedNames,
  sourceQa,
  width = 1080,
  height = 1440,
  maxFileBytes = 20 * 1024 * 1024
}) {
  const issues = [];
  const digests = new Map();

  if (!Array.isArray(pages) || pages.length !== expectedNames.length) {
    issues.push({ code: "page-count", expected: expectedNames.length, actual: pages?.length ?? 0 });
  }

  for (let index = 0; index < (pages ?? []).length; index += 1) {
    const page = pages[index];
    if (page.name !== expectedNames[index]) {
      issues.push({ code: "page-order", index, expected: expectedNames[index], actual: page.name });
    }
    if (page.width !== width || page.height !== height) {
      issues.push({ code: "wrong-canvas", index, expected: `${width}x${height}`, actual: `${page.width}x${page.height}` });
    }
    if (!page.token) issues.push({ code: "missing-token", index });
    if (!page.digest) issues.push({ code: "missing-digest", index });
    if (page.bytes > maxFileBytes) issues.push({ code: "oversize-page", index, bytes: page.bytes });
    if (page.digest && digests.has(page.digest)) {
      issues.push({ code: "duplicate-page", index, duplicateOf: digests.get(page.digest) });
    } else if (page.digest) {
      digests.set(page.digest, index);
    }
  }

  if (sourceQa?.status !== "PASS" || sourceQa?.desktop !== true || sourceQa?.mobile !== true) {
    issues.push({ code: "source-qa-failed" });
  }

  return { pass: issues.length === 0, version: FEISHU_IMAGE_EDITION_VERSION, issues };
}

export function buildFeishuImageEditionXml({ title, subtitle, pages, expectedNames, sourceQa }) {
  if (!Array.isArray(expectedNames) || expectedNames.length === 0) {
    throw new Error("expectedNames is required: XML must be built against the canonical monthly page order");
  }
  const validation = validateFeishuImageEdition({
    pages,
    expectedNames,
    sourceQa
  });
  if (!validation.pass) throw new Error(`Invalid Feishu image edition: ${JSON.stringify(validation.issues)}`);

  return [
    `<title>${escapeXml(title)}</title>`,
    `<p>${escapeXml(subtitle)}</p>`,
    ...pages.map((page) => `<img src="${escapeXml(page.token)}" width="720" height="960" name="${escapeXml(page.name)}"/>`)
  ].join("\n");
}
