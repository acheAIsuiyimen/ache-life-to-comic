import {copyFile, mkdir} from "node:fs/promises";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDirectory, "..");
const pageCssPath = path.join(skillRoot, "assets", "templates", "page-system.css");
const fontDirectory = path.join(skillRoot, "assets", "fonts");

export const DESIGN_SYSTEM_VERSION = "ache-design-system/1.1.0";
export const MONTHLY_RENDERER_VERSION = "ache-monthly-renderer/1.0.0";

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function routeLabel(route) {
  return {
    S: "日常",
    P: "照片",
    K: "知识",
    M: "会议",
    L: "长文"
  }[route] ?? route;
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
  const normalized = String(value ?? "").replace(/\s+/gu, " ").trim();
  if (!normalized) return [];
  return normalized
    .split(/(?<=[。！？!?；;])/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function chunks(value, budget = 360) {
  const units = sentences(value);
  if (units.length === 0) return [""];
  const pages = [];
  let current = "";
  for (const unit of units) {
    if (current && [...`${current}${unit}`].length > budget) {
      pages.push(current);
      current = unit;
    } else {
      current += unit;
    }
  }
  if (current) pages.push(current);
  return pages;
}

function noteLines(text, count = 3) {
  const values = sentences(text);
  if (values.length === 0) return ["今天也被好好收进来了。"];
  return values.slice(0, count);
}

function titleMarkup(value) {
  const title = String(value ?? "").trim();
  const characters = [...title];
  if (characters.length <= 9) return escapeHtml(title);
  const punctuation = new Set(["，", "。", "：", "；", "、", "！", "？", "—"]);
  const center = Math.floor(characters.length / 2);
  const candidates = characters
    .map((character, index) => ({character, index: index + 1}))
    .filter(({character, index}) =>
      punctuation.has(character)
      && index >= 4
      && characters.length - index >= 4
    )
    .sort((left, right) =>
      Math.abs(left.index - center) - Math.abs(right.index - center)
    );
  let split = candidates[0]?.index ?? center;
  if (characters.length - split < 4) split = characters.length - 4;
  if (split < 4) split = 4;
  return `<span class="ache-title-line">${escapeHtml(characters.slice(0, split).join(""))}</span>
    <span class="ache-title-line">${escapeHtml(characters.slice(split).join(""))}</span>`;
}

function imageMarkup(asset, className = "") {
  if (!asset?.src) {
    return `<div class="ache-empty-visual">这一页的画面还在路上</div>`;
  }
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(asset.src)}" alt="${escapeHtml(asset.alt ?? "")}" data-required-image>`;
}

function footerMarkup({episode, pageNumber, pageRole}) {
  return `<footer class="ache-footer">
    <span>${escapeHtml(pageRole)}</span>
    <span>${escapeHtml(readableDate(episode.displayDate))} · ${String(pageNumber).padStart(2, "0")}</span>
  </footer>`;
}

function coverSheet(episode, asset, pageNumber) {
  return `<div class="ache-page-shell">
    <section class="ache-page ache-cover-page" data-page-role="cover" data-route="${escapeHtml(episode.route)}">
      <div class="ache-page-inner">
        <p class="ache-kicker">${escapeHtml(readableDate(episode.displayDate))} · ${escapeHtml(routeLabel(episode.route))}</p>
        <h2 class="ache-title">${titleMarkup(episode.title)}</h2>
        <div class="ache-title-mark"></div>
        <div class="ache-cover-ticket" aria-hidden="true"></div>
        <div class="ache-cover-visual">${imageMarkup(asset)}</div>
        ${footerMarkup({episode, pageNumber, pageRole: "章节封面"})}
      </div>
    </section>
  </div>`;
}

function visualBodySheet(episode, assets, pageNumber, notes) {
  const [main, echo] = assets;
  const firstNote = notes[0] ?? "这一刻，先留下来。";
  const secondNote = notes.slice(1).join("") || "没有急着给它一个结论。";
  return `<div class="ache-page-shell">
    <section class="ache-page ache-visual-page ache-route-${escapeHtml(episode.route.toLowerCase())}" data-page-role="body" data-route="${escapeHtml(episode.route)}">
      <div class="ache-page-inner">
        <p class="ache-kicker">${escapeHtml(routeLabel(episode.route))} · ${escapeHtml(readableDate(episode.displayDate))}</p>
        <h2 class="ache-title">${titleMarkup(episode.title)}</h2>
        <div class="ache-body-grid">
          <figure class="ache-panel ${echo ? "ache-panel-main" : "ache-panel--single"}">${imageMarkup(main)}</figure>
          ${echo ? `<figure class="ache-panel ache-panel-echo">${imageMarkup(echo)}</figure>` : ""}
          <p class="ache-margin-note ache-margin-note--one">${escapeHtml(firstNote)}</p>
          <p class="ache-margin-note ache-margin-note--two">${escapeHtml(secondNote)}</p>
        </div>
        ${footerMarkup({episode, pageNumber, pageRole: "正文"})}
      </div>
    </section>
  </div>`;
}

function paragraphMarkup(text, route) {
  const units = sentences(text);
  if (route === "M") {
    return `<ul>${units.map((unit) => `<li>${escapeHtml(unit)}</li>`).join("")}</ul>`;
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
    <section class="ache-page ache-text-page ache-route-${escapeHtml(episode.route.toLowerCase())}" data-page-role="body" data-route="${escapeHtml(episode.route)}">
      <div class="ache-page-inner">
        <p class="ache-kicker">${escapeHtml(routeLabel(episode.route))} · ${escapeHtml(readableDate(episode.displayDate))} · ${pageIndex + 1}/${pageCount}</p>
        <h2 class="ache-title">${titleMarkup(episode.title)}</h2>
        <div class="ache-title-mark"></div>
        <div class="ache-text-column">${paragraphMarkup(text, episode.route)}</div>
        <p class="ache-text-side">${escapeHtml(side)}</p>
        ${asset ? `<figure class="ache-text-token">${imageMarkup(asset)}</figure>` : '<div class="ache-text-token" aria-hidden="true"></div>'}
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
  const coverAsset = assets.find((asset) => asset.role === "cover-visual") ?? assets[0] ?? null;
  const bodyAssets = assets.filter((asset) => asset !== coverAsset);
  const pages = [coverSheet(episode, coverAsset, startPageNumber)];
  let pageNumber = startPageNumber + 1;

  if (["S", "P"].includes(episode.route)) {
    const usable = bodyAssets.length > 0 ? bodyAssets : coverAsset ? [coverAsset] : [];
    const notes = noteLines(episode.text, 4);
    if (usable.length === 0) {
      pages.push(textBodySheet(episode, episode.text, pageNumber, 0, 1));
      return {html: pages.join("\n"), pageCount: pages.length};
    }
    for (let index = 0; index < usable.length; index += 2) {
      pages.push(visualBodySheet(
        episode,
        usable.slice(index, index + 2),
        pageNumber,
        notes.slice(index, index + 2)
      ));
      pageNumber += 1;
    }
    return {html: pages.join("\n"), pageCount: pages.length};
  }

  const budget = episode.route === "L" ? 520 : 360;
  const textChunks = chunks(episode.text, budget);
  textChunks.forEach((text, index) => {
    pages.push(textBodySheet(
      episode,
      text,
      pageNumber + index,
      index,
      textChunks.length,
      bodyAssets[index] ?? (index === textChunks.length - 1 ? coverAsset : null)
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
      <div class="ache-episode-label">
        <span>第 ${String(episode.episodeNumber).padStart(2, "0")} 章</span>
        <span>${escapeHtml(routeLabel(episode.route))}</span>
      </div>
      ${rendered.html}
      ${episode.visualStatus === "visual-pending"
        ? '<p class="ache-pending">画面待补，文字和页码已经留下。</p>'
        : ""}
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
    <header class="ache-volume-head">
      <h1>${escapeHtml(readableMonth(volume.month))}</h1>
      <p>${escapeHtml(book.title)} · ${volume.episodes.length} 章</p>
    </header>
    ${episodes}
  </main>
</body>
</html>`;
}

export async function installRendererAssets(editionDirectory) {
  const target = path.join(editionDirectory, "assets", "system");
  await mkdir(target, {recursive: true});
  await Promise.all([
    copyFile(
      path.join(fontDirectory, "LXGWWenKaiGBScreen.ttf"),
      path.join(target, "LXGWWenKaiGBScreen.ttf")
    ),
    copyFile(
      path.join(fontDirectory, "SmileySans-Oblique.woff2"),
      path.join(target, "SmileySans-Oblique.woff2")
    ),
    copyFile(
      path.join(fontDirectory, "FONT-LICENSES.md"),
      path.join(target, "FONT-LICENSES.md")
    )
  ]);
}
