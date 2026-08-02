import {copyFile, mkdir} from "node:fs/promises";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDirectory, "..");
const pageCssPath = path.join(skillRoot, "assets", "templates", "page-system.css");
const fontDirectory = path.join(skillRoot, "assets", "fonts");

export const DESIGN_SYSTEM_VERSION = "ache-design-system/1.2.0";
export const MONTHLY_RENDERER_VERSION = "ache-monthly-renderer/2.0.0";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function routeLabel(route) {
  return {S: "日常", P: "照片", K: "知识", M: "会议", L: "长文"}[route] ?? route;
}

function readableDate(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/u);
  if (!match) return String(value ?? "");
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

function readableMonth(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})$/u);
  if (!match) return String(value ?? "");
  return `${match[1]}年${Number(match[2])}月`;
}

function sentences(value) {
  const normalized = String(value ?? "").replace(/[ \t]+/gu, " ").trim();
  if (!normalized) return [];
  return normalized
    .split(/(?<=[。！？!?；;])|\n+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function characterWeight(value) {
  return [...String(value ?? "")].reduce((total, character) => {
    if (/\s/u.test(character)) return total;
    return total + (/^[\x00-\x7F]$/u.test(character) ? 0.55 : 1);
  }, 0);
}

function splitLongUnit(unit, capacity) {
  if (characterWeight(unit) <= capacity) return [unit];
  const characters = [...unit];
  const parts = [];
  let current = "";
  for (const character of characters) {
    if (current && characterWeight(`${current}${character}`) > capacity) {
      parts.push(current.trim());
      current = character;
    } else {
      current += character;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function splitLongUnitExact(unit, capacity) {
  if (characterWeight(unit) <= capacity) return [unit];
  const parts = [];
  let current = "";
  for (const character of [...unit]) {
    if (current && characterWeight(`${current}${character}`) > capacity) {
      parts.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function textCapacity(route, hasVisual) {
  const base = {K: 320, M: 330, L: 340}[route] ?? 300;
  const visualCost = {K: 90, M: 100, L: 90}[route] ?? 80;
  // Sparse illustrations occupy a side column, not a full reading page. Keep
  // enough text on the same page to avoid isolated tails, then let browser QA
  // reject any viewport that would actually overflow.
  return Math.max(160, base - (hasVisual ? visualCost : 0));
}

function paginateLongform(value, firstCapacity, laterCapacity) {
  const paragraphs = String(value ?? "")
    .replaceAll("\r\n", "\n")
    .trim()
    .split(/\n{2,}/u)
    .filter((item) => item.length > 0);
  if (paragraphs.length === 0) return [""];

  const unitCapacity = Math.min(firstCapacity, laterCapacity);
  const records = paragraphs.flatMap((paragraph, paragraphIndex) => {
    const semanticPieces = paragraph.split(/(?<=[。！？!?；;])/u).filter(Boolean);
    const chunks = [];
    let current = "";
    for (const piece of semanticPieces) {
      if (characterWeight(piece) > unitCapacity) {
        if (current) chunks.push(current);
        chunks.push(...splitLongUnitExact(piece, unitCapacity));
        current = "";
      } else if (current && characterWeight(`${current}${piece}`) > unitCapacity) {
        chunks.push(current);
        current = piece;
      } else {
        current += piece;
      }
    }
    if (current) chunks.push(current);
    return chunks.map((text) => ({paragraphIndex, text}));
  });
  const serialize = (items) => {
    const groups = [];
    for (const item of items) {
      const previous = groups.at(-1);
      if (previous?.paragraphIndex === item.paragraphIndex) previous.text += item.text;
      else groups.push({...item});
    }
    return groups.map((item) => item.text).join("\n\n");
  };

  const pages = [];
  let current = [];
  for (const record of records) {
    const capacity = pages.length === 0 ? firstCapacity : laterCapacity;
    const candidate = serialize([...current, record]);
    if (current.length > 0 && characterWeight(candidate) > capacity) {
      pages.push(serialize(current));
      current = [record];
    } else {
      current.push(record);
    }
  }
  if (current.length > 0) pages.push(serialize(current));
  return pages;
}

function paginateText(value, route, bodyAssets = []) {
  const firstPageHasVisual = bodyAssets.length > 0;
  const firstCapacity = textCapacity(route, firstPageHasVisual);
  const laterCapacity = textCapacity(route, false);
  if (route === "L") return paginateLongform(value, firstCapacity, laterCapacity);
  const rawUnits = sentences(value);
  if (rawUnits.length === 0) return [""];
  const units = rawUnits.flatMap((unit) => splitLongUnit(unit, laterCapacity));
  const pages = [];
  let current = [];
  let pageIndex = 0;
  for (const unit of units) {
    const capacity = pageIndex === 0 ? firstCapacity : laterCapacity;
    const maxUnits = route === "M"
      ? (pageIndex === 0 && firstPageHasVisual ? 7 : 9)
      : Number.POSITIVE_INFINITY;
    const candidate = [...current, unit].join("\n\n");
    if (current.length > 0 && (characterWeight(candidate) > capacity || current.length >= maxUnits)) {
      pages.push(current.join("\n\n"));
      current = [unit];
      pageIndex += 1;
    } else {
      current.push(unit);
    }
  }
  if (current.length > 0) pages.push(current.join("\n\n"));

  if (pages.length > 1) {
    const last = pages.at(-1);
    const previous = pages.at(-2);
    if (characterWeight(last) < laterCapacity * 0.28) {
      const previousUnits = sentences(previous);
      const moved = previousUnits.pop();
      if (moved && characterWeight(`${moved}\n\n${last}`) <= laterCapacity) {
        pages[pages.length - 2] = previousUnits.join("\n\n");
        pages[pages.length - 1] = `${moved}\n\n${last}`;
        if (!pages[pages.length - 2].trim()) pages.splice(pages.length - 2, 1);
      }
    }
  }
  return pages;
}

function noteLines(text, count = 3) {
  const values = sentences(text);
  return values.length > 0 ? values.slice(0, count) : ["今天也被好好收进来了。"];
}

function titleClass(value) {
  const length = [...String(value ?? "").trim()].length;
  if (length >= 16) return "ache-title--long";
  if (length >= 11) return "ache-title--medium";
  return "ache-title--short";
}

function titleMarkup(value) {
  return escapeHtml(String(value ?? "").trim());
}

function imageMarkup(asset, className = "") {
  if (!asset?.src) return `<div class="ache-empty-visual">这一页的画面还在路上</div>`;
  const fit = asset.fit === "cover" && asset.allowCrop === true ? "cover" : "contain";
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(asset.src)}" alt="${escapeHtml(asset.alt ?? "")}" data-required-image data-image-fit="${fit}">`;
}

function pageHeaderMarkup(episode, {pageIndex = 0, pageCount = 1, role = "body"} = {}) {
  const continuation = pageIndex > 0 ? " ache-page-head--continuation" : "";
  const count = pageCount > 1 ? ` · ${pageIndex + 1}/${pageCount}` : "";
  return `<header class="ache-page-head${continuation}">
    <p class="ache-kicker">${escapeHtml(routeLabel(episode.route))} · ${escapeHtml(readableDate(episode.displayDate))}${count}</p>
    <h2 class="ache-title ${titleClass(episode.title)}">${titleMarkup(episode.title)}</h2>
    ${role === "cover" ? '<div class="ache-title-mark"></div>' : ""}
  </header>`;
}

function footerMarkup({episode, pageNumber, pageRole}) {
  return `<footer class="ache-footer">
    <span>${escapeHtml(pageRole)}</span>
    <span>${escapeHtml(readableDate(episode.displayDate))} · ${String(pageNumber).padStart(2, "0")}</span>
  </footer>`;
}

function coverSheet(episode, asset, pageNumber) {
  const visualState = asset ? "has-visual" : "no-visual";
  return `<div class="ache-page-shell">
    <section class="ache-page ache-cover-page ache-route-${escapeHtml(episode.route.toLowerCase())}" data-page-role="cover" data-route="${escapeHtml(episode.route)}">
      <div class="ache-page-inner">
        ${pageHeaderMarkup(episode, {role: "cover"})}
        <main class="ache-cover-content ${visualState}">
          <div class="ache-cover-visual"><div class="ache-paper-mat">${imageMarkup(asset)}</div></div>
          <span class="ache-cover-stitch" aria-hidden="true"></span>
        </main>
        ${footerMarkup({episode, pageNumber, pageRole: "章节封面"})}
      </div>
    </section>
  </div>`;
}

function visualBodySheet(episode, assets, pageNumber, notes, pageIndex, pageCount, visualLayout) {
  const safeAssets = assets.slice(0, 3);
  return `<div class="ache-page-shell">
    <section class="ache-page ache-visual-page ache-route-${escapeHtml(episode.route.toLowerCase())}" data-page-role="body" data-route="${escapeHtml(episode.route)}">
      <div class="ache-page-inner">
        ${pageHeaderMarkup(episode, {pageIndex, pageCount})}
        <main class="ache-visual-content ache-visual-layout-${escapeHtml(visualLayout)}" data-layout-zone="visual-body" data-visual-layout="${escapeHtml(visualLayout)}">
          <div class="ache-panel-stack ache-panel-count-${safeAssets.length}">
            ${safeAssets.map((asset, index) => `<figure class="ache-panel ache-panel-${index + 1}">${imageMarkup(asset)}</figure>`).join("")}
          </div>
          <div class="ache-note-strip">
            ${notes.slice(0, Math.max(1, safeAssets.length)).map((note, index) => `<p><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(note)}</p>`).join("")}
          </div>
        </main>
        ${footerMarkup({episode, pageNumber, pageRole: "正文"})}
      </div>
    </section>
  </div>`;
}

function paragraphMarkup(text, route) {
  if (route === "L") {
    return String(text ?? "")
      .split(/\n{2,}/u)
      .filter((unit) => unit.length > 0)
      .map((unit) => `<p>${escapeHtml(unit).replaceAll("\n", "<br>")}</p>`)
      .join("");
  }
  const units = sentences(text);
  if (route === "M") {
    const kind = (unit) => {
      if (/^(决议|决定|结论|通过|确认)/u.test(unit)) return "decision";
      if (/^(风险|问题|未决|待确认)/u.test(unit)) return "risk";
      if (/^(待办|负责人|下次会议|行动|期限)/u.test(unit)) return "action";
      return "context";
    };
    return `<ul>${units.map((unit) => `<li class="ache-meeting-item ache-meeting-${kind(unit)}">${escapeHtml(unit.replace(/^[-•·]\s*/u, ""))}</li>`).join("")}</ul>`;
  }
  return units.map((unit) => `<p>${escapeHtml(unit)}</p>`).join("");
}

function textBodySheet(episode, text, pageNumber, pageIndex, pageCount, asset = null) {
  const side = episode.route === "M"
    ? "决定、风险与还没解决的事"
    : episode.route === "K"
      ? "正文先读懂，图只解释关系"
      : "原文按原来的顺序留下";
  return `<div class="ache-page-shell">
    <section class="ache-page ache-text-page ache-route-${escapeHtml(episode.route.toLowerCase())} ${asset ? "ache-text-page--with-visual" : ""}" data-page-role="body" data-route="${escapeHtml(episode.route)}">
      <div class="ache-page-inner">
        ${pageHeaderMarkup(episode, {pageIndex, pageCount})}
        <main class="ache-text-layout" data-layout-zone="text-body">
          <div class="ache-text-column">${paragraphMarkup(text, episode.route)}</div>
          ${asset ? `<figure class="ache-inline-visual"><div class="ache-paper-mat">${imageMarkup(asset)}</div><figcaption>${escapeHtml(side)}</figcaption></figure>` : `<p class="ache-text-side">${escapeHtml(side)}</p>`}
        </main>
        ${footerMarkup({episode, pageNumber, pageRole: "正文"})}
      </div>
    </section>
  </div>`;
}

export function renderEpisodeSheets(episode, startPageNumber = 1) {
  const assets = episode.visualAssets ?? episode.pageAssets ?? [];
  const precomposedPages = assets.filter((asset) => asset.kind === "rendered-page");
  if (precomposedPages.length > 0) {
    return {
      html: precomposedPages.map((asset, index) => `<div class="ache-page-shell">
        <section class="ache-page ache-precomposed-page" data-page-role="${index === 0 ? "cover" : "body"}" data-route="${escapeHtml(episode.route)}">
          ${imageMarkup(asset)}
        </section>
      </div>`).join("\n"),
      pageCount: precomposedPages.length
    };
  }

  const declaredCoverAsset = assets.find((asset) => asset.role === "cover-visual") ?? null;
  const coverAsset = declaredCoverAsset ?? (episode.route === "P" ? null : assets[0] ?? null);
  const bodyAssets = assets.filter((asset) => asset !== coverAsset && asset.role !== "cover-visual");
  const pages = [coverSheet(episode, coverAsset, startPageNumber)];
  let pageNumber = startPageNumber + 1;

  if (["S", "P"].includes(episode.route)) {
    const usable = bodyAssets.length > 0
      ? bodyAssets
      : episode.route === "P" && coverAsset
        ? [coverAsset]
        : [];
    if (usable.length === 0) {
      pages.push(textBodySheet(episode, episode.text, pageNumber, 0, 1));
      return {html: pages.join("\n"), pageCount: pages.length};
    }
    const groups = [];
    for (let index = 0; index < usable.length; index += 3) groups.push(usable.slice(index, index + 3));
    const notes = noteLines(episode.text, Math.max(3, usable.length));
    groups.forEach((group, index) => {
      const visualLayout = episode.visualLayout
        ?? (group.length === 2 ? "scrapbook-pair" : group.length === 3 ? "hero-plus-two" : "vertical-relay");
      pages.push(visualBodySheet(
        episode,
        group,
        pageNumber + index,
        notes.slice(index * 3, index * 3 + 3),
        index,
        groups.length,
        visualLayout
      ));
    });
    return {html: pages.join("\n"), pageCount: pages.length};
  }

  const textChunks = paginateText(episode.text, episode.route, bodyAssets);
  textChunks.forEach((text, index) => {
    pages.push(textBodySheet(
      episode,
      text,
      pageNumber + index,
      index,
      textChunks.length,
      bodyAssets[index] ?? null
    ));
  });
  return {html: pages.join("\n"), pageCount: pages.length};
}

export function renderMonthlyDocument(book, volume) {
  let nextPageNumber = 1;
  const episodes = volume.episodes.map((episode) => {
    const rendered = renderEpisodeSheets(episode, nextPageNumber);
    nextPageNumber += rendered.pageCount;
    return `<article class="ache-episode" data-episode-id="${escapeHtml(episode.episodeId)}">
      <div class="ache-episode-label"><span>第 ${String(episode.episodeNumber).padStart(2, "0")} 章</span><span>${escapeHtml(routeLabel(episode.route))}</span></div>
      <h2 class="ache-sr-only">${escapeHtml(episode.title)}</h2>
      ${rendered.html}
      ${episode.visualStatus === "visual-pending" ? '<p class="ache-pending">画面待补，文字和页码已经留下。</p>' : ""}
    </article>`;
  }).join("\n");
  const css = readFileSync(pageCssPath, "utf8");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="ache-design-system" content="${DESIGN_SYSTEM_VERSION}">
  <meta name="ache-renderer" content="${MONTHLY_RENDERER_VERSION}">
  <title>${escapeHtml(book.title)} · ${escapeHtml(readableMonth(volume.month))}</title>
  <style>${css}</style>
</head>
<body>
  <main class="ache-volume">
    <header class="ache-volume-head"><h1>${escapeHtml(readableMonth(volume.month))}</h1><p>${escapeHtml(book.title)} · ${volume.episodes.length} 章</p></header>
    ${episodes}
  </main>
</body>
</html>`;
}

export async function installRendererAssets(editionDirectory) {
  const target = path.join(editionDirectory, "assets", "system");
  await mkdir(target, {recursive: true});
  await Promise.all([
    copyFile(path.join(fontDirectory, "LXGWWenKaiGBScreen.ttf"), path.join(target, "LXGWWenKaiGBScreen.ttf")),
    copyFile(path.join(fontDirectory, "SmileySans-Oblique.woff2"), path.join(target, "SmileySans-Oblique.woff2")),
    copyFile(path.join(fontDirectory, "FONT-LICENSES.md"), path.join(target, "FONT-LICENSES.md"))
  ]);
}
