import {createHash, randomUUID} from "node:crypto";
import {mkdir, readFile, rename, rm, stat} from "node:fs/promises";
import path from "node:path";

import {
  atomicWriteJson,
  atomicWriteText,
  ensureDir,
  readJsonIfExists
} from "./io.mjs";

export const PORTABLE_SHARE_VERSION = "ache-portable-share/1.0.0";

const UNIT_META = {
  chapter: {
    label: "单章",
    subject: "这一章",
    filename: "chapter"
  },
  volume: {
    label: "单册",
    subject: "这一册",
    filename: "volume"
  },
  part: {
    label: "单部",
    subject: "这一部",
    filename: "part"
  },
  book: {
    label: "单本",
    subject: "这一本",
    filename: "book"
  }
};

const MIME_TYPES = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function safeSegment(value, label) {
  const segment = String(value ?? "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(segment)) {
    throw new Error(`${label} must be a safe file segment`);
  }
  return segment;
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function replaceAsync(value, expression, replacer) {
  const matches = [...value.matchAll(expression)];
  if (matches.length === 0) return Promise.resolve(value);
  return Promise.all(matches.map((match) => replacer(...match))).then((replacements) => {
    let cursor = 0;
    let output = "";
    matches.forEach((match, index) => {
      output += value.slice(cursor, match.index) + replacements[index];
      cursor = match.index + match[0].length;
    });
    return output + value.slice(cursor);
  });
}

function isEmbeddedOrExternal(value) {
  return /^(?:data:|https?:|blob:|#|mailto:|tel:)/iu.test(String(value).trim());
}

function fileMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[extension];
  if (!mime) throw new Error(`Unsupported portable asset: ${extension || "(none)"}`);
  return mime;
}

function isFont(filePath) {
  return [".ttf", ".woff", ".woff2"].includes(path.extname(filePath).toLowerCase());
}

function absoluteAsset(baseDirectory, reference) {
  const normalized = String(reference).trim().replace(/^\.\//u, "");
  const resolved = path.resolve(baseDirectory, normalized);
  const relative = path.relative(baseDirectory, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Portable asset escapes source directory: ${reference}`);
  }
  return resolved;
}

async function dataUri(filePath) {
  const bytes = await readFile(filePath);
  return `data:${fileMimeType(filePath)};base64,${bytes.toString("base64")}`;
}

function removeFontFaces(html) {
  return html.replace(/@font-face\s*\{[\s\S]*?\}/giu, "");
}

async function inlineDocument(html, baseDirectory, mode) {
  let output = mode === "light" ? removeFontFaces(html) : html;
  output = await replaceAsync(
    output,
    /url\(\s*(["']?)([^"')]+)\1\s*\)/giu,
    async (whole, quote, reference) => {
      if (isEmbeddedOrExternal(reference)) return whole;
      const filePath = absoluteAsset(baseDirectory, reference);
      if (mode === "light" && isFont(filePath)) return whole;
      return `url("${await dataUri(filePath)}")`;
    }
  );
  output = await replaceAsync(
    output,
    /\bsrc=(['"])([^'"]+)\1/giu,
    async (whole, quote, reference) => {
      if (isEmbeddedOrExternal(reference)) return whole;
      return `src=${quote}${await dataUri(absoluteAsset(baseDirectory, reference))}${quote}`;
    }
  );
  const meta = `<meta name="ache-portable-share" content="${PORTABLE_SHARE_VERSION}">\n  <meta name="ache-portable-font-mode" content="${mode}">`;
  if (!output.includes('name="ache-portable-share"')) {
    output = output.replace(/<\/head>/iu, `  ${meta}\n</head>`);
  }
  return output;
}

function extractHead(html) {
  const match = html.match(/<head>([\s\S]*?)<\/head>/iu);
  if (!match) throw new Error("Portable source is missing <head>");
  return match[1];
}

function extractMain(html) {
  const match = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/iu);
  if (!match) throw new Error("Portable source is missing <main>");
  return match[0];
}

function extractEpisode(html, episodeId) {
  const escaped = episodeId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const expression = new RegExp(
    `<article class="ache-episode" data-episode-id="${escaped}">([\\s\\S]*?)<\\/article>`,
    "u"
  );
  const match = html.match(expression);
  if (!match) throw new Error(`Episode not found in monthly HTML: ${episodeId}`);
  return match[0];
}

function replaceTitle(head, title) {
  const safeTitle = escapeHtml(title);
  return /<title>[\s\S]*?<\/title>/iu.test(head)
    ? head.replace(/<title>[\s\S]*?<\/title>/iu, `<title>${safeTitle}</title>`)
    : `${head}\n<title>${safeTitle}</title>`;
}

function wrapDocument({head, title, body, unit}) {
  return `<!doctype html>
<html lang="zh-CN" data-share-unit="${escapeHtml(unit)}">
<head>${replaceTitle(head, title)}</head>
<body>${body}</body>
</html>`;
}

function markShareUnit(html, unit) {
  if (/\bdata-share-unit=/iu.test(html)) return html;
  return html.replace(
    /<html\b([^>]*)>/iu,
    `<html$1 data-share-unit="${escapeHtml(unit)}">`
  );
}

function bookRoot(library, bookId) {
  return path.join(library, "books", safeSegment(bookId, "bookId"));
}

function monthEdition(bookDirectory, month) {
  return path.join(
    bookDirectory,
    "monthly-volumes",
    safeSegment(month, "month"),
    "continuous-edition"
  );
}

async function loadContext(library, {bookId, unit, key}) {
  const meta = UNIT_META[unit];
  if (!meta) throw new Error(`Unsupported portable unit: ${unit}`);
  const safeBookId = safeSegment(bookId, "bookId");
  const safeKey = safeSegment(key, `${unit} key`);
  const directory = bookRoot(library, safeBookId);
  const series = await readJsonIfExists(path.join(directory, "series-manifest.json"));
  if (!series) throw new Error(`Book not found: ${safeBookId}`);

  if (unit === "chapter") {
    const episode = await readJsonIfExists(path.join(directory, "episodes", `${safeKey}.json`));
    if (!episode) throw new Error(`Chapter not found: ${safeKey}`);
    const edition = monthEdition(directory, episode.month);
    const monthlyHtml = await readFile(path.join(edition, "index.html"), "utf8");
    const raw = wrapDocument({
      head: extractHead(monthlyHtml),
      title: `${episode.title} · ${series.title}`,
      unit,
      body: `<main class="ache-volume ache-portable-chapter">
        <header class="ache-volume-head"><h1>${escapeHtml(episode.title)}</h1><p>${meta.label}</p></header>
        ${extractEpisode(monthlyHtml, safeKey)}
      </main>`
    });
    return {unit, key: safeKey, title: episode.title, sources: [{html: raw, baseDirectory: edition}]};
  }

  let months;
  let title;
  if (unit === "volume") {
    const record = series.months.find((item) => item.month === safeKey);
    if (!record) throw new Error(`Volume not found: ${safeKey}`);
    months = [safeKey];
    title = `${safeKey} 月册`;
  } else if (unit === "part") {
    const record = series.parts.find((item) => item.part === safeKey);
    if (!record) throw new Error(`Part not found: ${safeKey}`);
    months = record.months;
    title = `${safeKey} · 漫画人生`;
  } else {
    const record = series.annuals.find((item) => item.year === safeKey);
    if (!record) throw new Error(`Book not found for year: ${safeKey}`);
    months = record.months;
    title = `${safeKey} 年度漫画人生`;
  }
  const sources = [];
  for (const month of months) {
    const edition = monthEdition(directory, month);
    sources.push({
      month,
      baseDirectory: edition,
      html: await readFile(path.join(edition, "index.html"), "utf8")
    });
  }
  return {unit, key: safeKey, title, sources};
}

async function buildFromContext(context, mode) {
  if (!context.sources.length) throw new Error("Portable unit has no source documents");
  if (context.sources.length === 1) {
    const source = context.sources[0];
    const inlined = await inlineDocument(source.html, source.baseDirectory, mode);
    if (context.unit === "volume" || context.unit === "chapter") {
      return markShareUnit(inlined, context.unit);
    }
  }

  const first = context.sources[0];
  const firstInlined = await inlineDocument(first.html, first.baseDirectory, mode);
  const mains = [extractMain(firstInlined)];
  for (const source of context.sources.slice(1)) {
    const inlined = await inlineDocument(source.html, source.baseDirectory, "light");
    mains.push(extractMain(inlined));
  }
  return wrapDocument({
    head: extractHead(firstInlined),
    title: context.title,
    unit: context.unit,
    body: `<main class="ache-portable-collection">
      <header class="ache-volume-head"><h1>${escapeHtml(context.title)}</h1><p>${escapeHtml(UNIT_META[context.unit].label)}</p></header>
      ${mains.map((main, index) => `<section class="ache-portable-unit" data-unit-index="${index + 1}">${main}</section>`).join("\n")}
    </main>`
  });
}

function localReferences(html, baseDirectory, includeFonts) {
  const references = new Set();
  for (const match of html.matchAll(/\bsrc=(['"])([^'"]+)\1/giu)) {
    if (!isEmbeddedOrExternal(match[2])) references.add(absoluteAsset(baseDirectory, match[2]));
  }
  for (const match of html.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/giu)) {
    if (isEmbeddedOrExternal(match[2])) continue;
    const filePath = absoluteAsset(baseDirectory, match[2]);
    if (includeFonts || !isFont(filePath)) references.add(filePath);
  }
  return references;
}

async function estimateContext(context, mode) {
  const files = new Set();
  let htmlBytes = 0;
  for (const source of context.sources) {
    htmlBytes += Buffer.byteLength(source.html);
    for (const file of localReferences(source.html, source.baseDirectory, mode === "faithful")) {
      files.add(file);
    }
  }
  let encodedBytes = 0;
  for (const file of files) {
    const info = await stat(file);
    encodedBytes += 4 * Math.ceil(info.size / 3);
  }
  return htmlBytes + encodedBytes;
}

function formatBytes(value) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.ceil(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function contextDigest(context) {
  const hash = createHash("sha256");
  hash.update(PORTABLE_SHARE_VERSION);
  hash.update(context.unit);
  hash.update(context.key);
  context.sources.forEach((source) => hash.update(source.html));
  return hash.digest("hex");
}

function manifestPath(library, bookId) {
  return path.join(bookRoot(library, bookId), "share-exports", "manifest.json");
}

async function readManifest(library, bookId) {
  return readJsonIfExists(manifestPath(library, bookId), {
    schemaVersion: PORTABLE_SHARE_VERSION,
    decisions: {}
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function acquireManifestLock(library, bookId, options = {}) {
  const {waitMs = 10_000, leaseMs = 15_000, pollMs = 20} = options;
  const exportDirectory = path.dirname(manifestPath(library, bookId));
  await ensureDir(exportDirectory);
  const lockDirectory = path.join(exportDirectory, ".manifest.lock");
  const token = randomUUID();
  const startedAt = Date.now();

  while (Date.now() - startedAt <= waitMs) {
    try {
      await mkdir(lockDirectory, {recursive: false});
      await atomicWriteJson(path.join(lockDirectory, "owner.json"), {
        token,
        createdAt: new Date().toISOString()
      });
      return {lockDirectory, token};
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const info = await stat(lockDirectory);
        if (Date.now() - info.mtimeMs > leaseMs) {
          await rename(
            lockDirectory,
            `${lockDirectory}.stale-${randomUUID()}`
          );
          continue;
        }
      } catch (statError) {
        if (!['ENOENT', 'EEXIST'].includes(statError?.code)) throw statError;
      }
      await wait(pollMs);
    }
  }
  throw new Error(`Timed out waiting for portable manifest lock: ${bookId}`);
}

async function releaseManifestLock(lock) {
  const owner = await readJsonIfExists(path.join(lock.lockDirectory, "owner.json"));
  if (owner?.token === lock.token) {
    await rm(lock.lockDirectory, {recursive: true, force: true});
  }
}

function decisionKey(context, digest) {
  return `${context.unit}:${context.key}:${digest}`;
}

export async function preparePortableSharePrompt(library, request) {
  const context = await loadContext(library, request);
  const digest = contextDigest(context);
  const manifest = await readManifest(library, request.bookId);
  const existing = manifest.decisions[decisionKey(context, digest)] ?? null;
  if (existing) {
    return {
      schemaVersion: PORTABLE_SHARE_VERSION,
      status: "already-decided",
      unit: context.unit,
      key: context.key,
      decision: existing,
      canExportLater: existing.status === "skipped"
    };
  }
  const [lightBytes, faithfulBytes] = await Promise.all([
    estimateContext(context, "light"),
    estimateContext(context, "faithful")
  ]);
  return {
    schemaVersion: PORTABLE_SHARE_VERSION,
    status: "choice-required",
    unit: context.unit,
    unitLabel: UNIT_META[context.unit].label,
    key: context.key,
    prompt: `${UNIT_META[context.unit].subject}已经收好。要不要导出一个可以单独发送、断网也能打开的便携分享版？`,
    options: [
      {
        value: "light",
        label: `轻量分享版（推荐，约 ${formatBytes(lightBytes)}）`,
        description: "图片与版式完整内嵌，字体使用接收设备的中文字体。"
      },
      {
        value: "faithful",
        label: `完整保真版（约 ${formatBytes(faithfulBytes)}）`,
        description: "连字体一起内嵌，文件更大但最接近原版。"
      },
      {
        value: "skip",
        label: "暂不导出",
        description: "保留默认 HTML + assets 主版本，以后仍可导出。"
      }
    ],
    defaultValue: null
  };
}

export function validatePortableHtmlText(html) {
  const failures = [];
  if (!html.includes(`name="ache-portable-share" content="${PORTABLE_SHARE_VERSION}"`)) {
    failures.push("missing-portable-meta");
  }
  if (/\b(?:src|href)=(['"])(?!data:|#|mailto:|tel:)[^'"]+\1/iu.test(html)) {
    failures.push("unresolved-resource-attribute");
  }
  if (/url\(\s*(["']?)(?!data:)[^"')]+\1\s*\)/iu.test(html)) {
    failures.push("unresolved-css-resource");
  }
  if (/file:\/\/|\/Users\/|\/private\/var\/|\/var\/folders\//iu.test(html)) {
    failures.push("local-absolute-path");
  }
  return {status: failures.length === 0 ? "PASS" : "FAIL", failures};
}

export async function exportPortableShare(library, request) {
  const choice = request.choice;
  if (!["light", "faithful", "skip"].includes(choice)) {
    throw new Error("choice must be light, faithful, or skip");
  }
  const context = await loadContext(library, request);
  const digest = contextDigest(context);
  const key = decisionKey(context, digest);
  const html = choice === "skip" ? null : await buildFromContext(context, choice);
  const validation = html ? validatePortableHtmlText(html) : null;
  if (validation?.status === "FAIL") {
    throw new Error(`Portable HTML failed validation: ${validation.failures.join(", ")}`);
  }

  const lock = await acquireManifestLock(library, request.bookId);
  try {
    const manifest = await readManifest(library, request.bookId);
    const existing = manifest.decisions[key];
    if (existing?.status === "exported") {
      return {status: "reused", unit: context.unit, key: context.key, decision: existing};
    }
    if (existing?.status === "skipped" && choice === "skip") {
      return {status: "reused", unit: context.unit, key: context.key, decision: existing};
    }
    if (choice === "skip") {
      manifest.decisions[key] = {
        choice,
        status: "skipped",
        decidedAt: new Date().toISOString()
      };
      await atomicWriteJson(manifestPath(library, request.bookId), manifest);
      return {status: "skipped", unit: context.unit, key: context.key};
    }

    const exportDirectory = path.join(bookRoot(library, request.bookId), "share-exports");
    const filename = `${UNIT_META[context.unit].filename}-${context.key}-${choice}-${digest.slice(0, 10)}.html`;
    const output = path.join(exportDirectory, filename);
    await atomicWriteText(output, html);
    const bytes = Buffer.byteLength(html);
    manifest.decisions[key] = {
      choice,
      status: "exported",
      output: path.relative(bookRoot(library, request.bookId), output),
      bytes,
      sourceDigest: digest,
      exportedAt: new Date().toISOString()
    };
    await atomicWriteJson(manifestPath(library, request.bookId), manifest);
    return {
      status: "exported",
      unit: context.unit,
      key: context.key,
      mode: choice,
      output,
      bytes,
      size: formatBytes(bytes),
      validation
    };
  } finally {
    await releaseManifestLock(lock);
  }
}

export async function inspectPortableShares(library, bookId) {
  return readManifest(library, safeSegment(bookId, "bookId"));
}
