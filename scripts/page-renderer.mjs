import {copyFile, mkdir} from "node:fs/promises";
import {readFileSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {resolveThemePalette, themeStyleAttribute} from "./theme-system.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDirectory, "..");
const pageCssPath = path.join(skillRoot, "assets", "templates", "page-system.css");
const fontDirectory = path.join(skillRoot, "assets", "fonts");

export const DESIGN_SYSTEM_VERSION = "ache-design-system/1.5.0";
export const MONTHLY_RENDERER_VERSION = "ache-monthly-renderer/2.3.0";

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
  // Capacities are calibrated against the narrowest supported 390px viewport.
  // Meeting bullets consume more vertical rhythm than prose, so they must not
  // reuse long-form character capacity.
  const base = {K: 300, M: 345, L: 460}[route] ?? 290;
  const visualCost = {K: 36, M: 28, L: 42}[route] ?? 36;
  // Sparse illustrations occupy a side column, not a full reading page. Keep
  // enough text on the same page to avoid isolated tails, then let browser QA
  // reject any viewport that would actually overflow.
  return Math.max(160, base - (hasVisual ? visualCost : 0));
}

function trimTerminal(value) {
  return String(value ?? "").trim().replace(/[；;。！？!?]+$/u, "").trim();
}

export function structureKnowledgeText(value) {
  const source = String(value ?? "").replace(/[ \t]+/gu, " ").trim();
  if (!source) return {mode: "prose", intro: "", steps: [], reflection: ""};
  const colon = source.search(/[：:]/u);
  if (colon < 0) return {mode: "prose", intro: source, steps: [], reflection: ""};

  const intro = trimTerminal(source.slice(0, colon));
  const tail = source.slice(colon + 1).trim();
  const firstStop = tail.search(/[。！？!?]/u);
  const sequence = firstStop >= 0 ? tail.slice(0, firstStop) : tail;
  const reflection = firstStop >= 0 ? tail.slice(firstStop + 1).trim() : "";
  const steps = sequence.split(/[；;]/u).map(trimTerminal).filter(Boolean);
  if (steps.length < 2) return {mode: "prose", intro: source, steps: [], reflection: ""};
  return {mode: "sequence", intro, steps, reflection: trimTerminal(reflection)};
}

export function planTextComposition(value, route, bodyAssets = []) {
  const chunks = paginateText(value, route, bodyAssets);
  const knowledge = route === "K" ? structureKnowledgeText(value) : null;
  return {
    route,
    recipe: route === "K" && knowledge?.mode === "sequence"
      ? "knowledge-sequence-journal"
      : route === "M"
        ? "meeting-editorial-ledger"
        : route === "L"
          ? "longform-balanced-reading"
          : "text-journal",
    pageCount: chunks.length,
    chunks,
    knowledge,
    preflight: {
      semanticUnitsIntact: route !== "K" || knowledge?.mode !== "sequence" || knowledge.steps.length >= 2,
      targetFillRange: [0.62, 0.88],
      bottomDeadZoneMaximum: 0.25,
      illustrationGroupsMaximum: Math.ceil(Math.max(1, chunks.length) / 3)
    }
  };
}

function paginateLongform(value, firstCapacity, laterCapacity) {
  const paragraphs = String(value ?? "")
    .replaceAll("\r\n", "\n")
    .trim()
    .split(/\n{2,}/u)
    .filter((item) => item.length > 0);
  if (paragraphs.length === 0) return [""];

  // A semantic unit must stay substantially smaller than a page. Otherwise a
  // single long paragraph becomes one almost-page-sized record and strands a
  // short opening paragraph on an empty page.
  const unitCapacity = Math.min(150, firstCapacity, laterCapacity);
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
    const maxUnits = Number.POSITIVE_INFINITY;
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
  if (route === "M" && pages.length > 1) {
    for (let index = 0; index < pages.length - 1; index += 1) {
      const left = sentences(pages[index]);
      const right = sentences(pages[index + 1]);
      while (left.length > 1 && characterWeight(left.join("\n\n")) > characterWeight(right.join("\n\n")) * 1.12) {
        const moved = left.at(-1);
        const nextRight = [moved, ...right];
        if (characterWeight(nextRight.join("\n\n")) > laterCapacity * 1.08) break;
        left.pop();
        right.unshift(moved);
      }
      pages[index] = left.join("\n\n");
      pages[index + 1] = right.join("\n\n");
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
  const ratio = asset.aspectClass ?? "unknown";
  const width = Number(asset.intrinsicWidth ?? asset.targetWidth ?? 0);
  const height = Number(asset.intrinsicHeight ?? asset.targetHeight ?? 0);
  const dimensions = width && height ? ` width="${width}" height="${height}"` : "";
  return `<img class="${escapeHtml(className)} ache-image-${escapeHtml(ratio)}" src="${escapeHtml(asset.src)}" alt="${escapeHtml(asset.alt ?? "")}"${dimensions} data-required-image data-image-fit="${fit}" data-asset-role="${escapeHtml(asset.role ?? "body-visual")}" data-aspect-class="${escapeHtml(ratio)}" data-background-mode="${escapeHtml(asset.backgroundMode ?? "opaque")}">`;
}

function assetFrameAttributes(asset = {}) {
  const width = Number(asset.frameContentWidth ?? asset.targetWidth ?? asset.intrinsicWidth ?? 0);
  const height = Number(asset.frameContentHeight ?? asset.targetHeight ?? asset.intrinsicHeight ?? 0);
  const edge = asset.edgeTreatment ?? (asset.role === "body-photo" ? "torn-paper-frame" : "flush");
  const ratio = width && height ? `${width} / ${height}` : "auto";
  const matched = asset.frameFitStatus ?? (width && height ? "matched" : "unknown");
  return {
    className: `ache-frame ache-frame-${edge}`,
    attributes: `data-edge-treatment="${escapeHtml(edge)}" data-frame-fit="${escapeHtml(matched)}" style="--ache-media-ratio:${escapeHtml(ratio)}"`
  };
}

function framedAssetMarkup(asset, {inline = false} = {}) {
  const frame = assetFrameAttributes(asset);
  const isTransparent = ["transparent-raster", "svg-vector"].includes(asset?.backgroundMode);
  const classes = `${frame.className}${inline ? " ache-frame-inline" : ""}${isTransparent ? " ache-frame-transparent" : ""}`;
  return `<div class="${classes}" ${frame.attributes}>${imageMarkup(asset)}</div>`;
}

function themeAttributes(subject = {}) {
  const theme = resolveThemePalette({
    styleId: subject.styleId ?? subject.style?.id ?? "02-snow-pastel",
    palette: subject.palette ?? null,
    source: subject.paletteSource ?? null
  });
  return `data-theme-source="${escapeHtml(theme.source)}" data-style-id="${escapeHtml(theme.styleId)}" style="${escapeHtml(themeStyleAttribute(theme))}"`;
}

function densityClass(text, route, hasVisual = false) {
  const weight = characterWeight(text);
  const denominator = textCapacity(route, hasVisual);
  const ratio = denominator > 0 ? weight / denominator : 0;
  if (ratio < 0.34) return "ache-density-short";
  if (ratio > 0.78) return "ache-density-dense";
  return "ache-density-regular";
}

function adaptiveVisualLayout(route, assets, requested) {
  if (requested && requested !== "auto") return requested;
  if (route === "S") return assets.length === 3 ? "vertical-relay" : assets.length === 2 ? "cinematic-pair" : "single-scene";
  if (assets.length === 1) return "single-journal";
  const ratios = assets.map((asset) => asset.aspectClass ?? "unknown");
  const landscapeCount = ratios.filter((value) => value.startsWith("landscape")).length;
  const portraitCount = ratios.filter((value) => value.startsWith("portrait")).length;
  if (assets.length === 2) return landscapeCount === 2 ? "cinematic-pair" : "scrapbook-pair";
  if (assets.length === 3) {
    if (landscapeCount >= 2) return "vertical-relay";
    if (portraitCount >= 2) return "journal-columns";
    return "journal-stagger";
  }
  return "evidence-strip";
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
    <section class="ache-page ache-cover-page ache-route-${escapeHtml(episode.route.toLowerCase())}" data-page-role="cover" data-route="${escapeHtml(episode.route)}" ${themeAttributes(episode)}>
      <div class="ache-page-inner">
        ${pageHeaderMarkup(episode, {role: "cover"})}
        <main class="ache-cover-content ${visualState}" data-layout-zone="cover-background">
          <div class="ache-cover-visual">${imageMarkup(asset)}</div>
          <span class="ache-cover-stitch" aria-hidden="true"></span>
        </main>
        ${footerMarkup({episode, pageNumber, pageRole: "章节封面"})}
      </div>
    </section>
  </div>`;
}

function visualBodySheet(episode, assets, pageNumber, notes, pageIndex, pageCount, visualLayout) {
  const safeAssets = assets.slice(0, 3);
  const resolvedLayout = adaptiveVisualLayout(episode.route, safeAssets, visualLayout);
  return `<div class="ache-page-shell">
    <section class="ache-page ache-visual-page ache-route-${escapeHtml(episode.route.toLowerCase())}" data-page-role="body" data-route="${escapeHtml(episode.route)}" ${themeAttributes(episode)}>
      <div class="ache-page-inner">
        ${pageHeaderMarkup(episode, {pageIndex, pageCount})}
        <main class="ache-visual-content ache-visual-layout-${escapeHtml(resolvedLayout)}" data-layout-zone="visual-body" data-visual-layout="${escapeHtml(resolvedLayout)}">
          <div class="ache-panel-stack ache-panel-count-${safeAssets.length}">
            ${safeAssets.map((asset, index) => {
              const frame = assetFrameAttributes(asset);
              return `<figure class="ache-panel ache-panel-${index + 1} ${frame.className}" ${frame.attributes}>${imageMarkup(asset)}</figure>`;
            }).join("")}
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
  if (route === "K") {
    const structured = structureKnowledgeText(text);
    if (structured.mode === "sequence") {
      return `<div class="ache-knowledge-intro"><span>看见的方法</span><p>${escapeHtml(structured.intro)}。</p></div>
        <ol class="ache-knowledge-steps">${structured.steps.map((step, index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(step)}</p></li>`).join("")}</ol>
        ${structured.reflection ? `<p class="ache-knowledge-reflection">${escapeHtml(structured.reflection)}。</p>` : ""}`;
    }
  }
  if (route === "L") {
    return String(text ?? "")
      .split(/\n{2,}/u)
      .filter((unit) => unit.length > 0)
      .map((unit) => {
        const trimmed = unit.trim();
        const isPullquote = [...trimmed].length <= 64 && /^(?:[“"'‘]).*(?:[”"'’])$/su.test(trimmed);
        const className = isPullquote ? ' class="ache-longform-pullquote"' : "";
        return `<p${className}>${escapeHtml(unit).replaceAll("\n", "<br>")}</p>`;
      })
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
    <section class="ache-page ache-text-page ache-route-${escapeHtml(episode.route.toLowerCase())} ${asset ? "ache-text-page--with-visual" : ""} ${densityClass(text, episode.route, Boolean(asset))}" data-page-role="body" data-route="${escapeHtml(episode.route)}" data-density="${densityClass(text, episode.route, Boolean(asset)).replace("ache-density-", "")}" ${themeAttributes(episode)}>
      <div class="ache-page-inner">
        ${pageHeaderMarkup(episode, {pageIndex, pageCount})}
        <main class="ache-text-layout ache-text-recipe-${escapeHtml(planTextComposition(episode.text, episode.route, episode.visualAssets ?? []).recipe)}" data-layout-zone="text-body" data-layout-content>
          <div class="ache-text-column">${paragraphMarkup(text, episode.route)}</div>
          ${asset ? `<figure class="ache-inline-visual">${framedAssetMarkup(asset, {inline: true})}<figcaption>${escapeHtml(side)}</figcaption></figure>` : `<p class="ache-text-side">${escapeHtml(side)}</p>`}
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
        <section class="ache-page ache-precomposed-page" data-page-role="${index === 0 ? "cover" : "body"}" data-route="${escapeHtml(episode.route)}" ${themeAttributes(episode)}>
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
      const visualLayout = episode.visualLayout ?? "auto";
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

  const textPlan = planTextComposition(episode.text, episode.route, bodyAssets);
  const textChunks = textPlan.chunks;
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
  let nextPageNumber = volume.coverAsset ? 2 : 1;
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
  const monthlyCover = volume.coverAsset ? `<div class="ache-monthly-cover-wrap">
    <section class="ache-page ache-monthly-cover-page" data-page-role="monthly-cover" ${themeAttributes(volume)}>
      <div class="ache-monthly-cover-image">${imageMarkup(volume.coverAsset)}</div>
      <div class="ache-monthly-cover-type"><p>${escapeHtml(book.title)}</p><h1>${escapeHtml(readableMonth(volume.month))}</h1><span>${volume.episodes.length} 章 · 持续生长中</span></div>
    </section>
  </div>` : "";
  const runtimeGuard = `<script data-ache-layout-guard="1">
  (() => {
    const inspect = () => {
      const failures = [];
      document.querySelectorAll('.ache-page').forEach((page, index) => {
        if (page.scrollWidth > page.clientWidth + 1 || page.scrollHeight > page.clientHeight + 1) failures.push('overflow:' + (index + 1));
      });
      if (document.querySelector('[data-frame-fit="mismatch"],[data-frame-fit="unknown"]')) failures.push('frame-fit');
      if (document.querySelector('[data-asset-role="explanatory-vignette"][data-background-mode="opaque"],[data-asset-role="decorative-component"][data-background-mode="opaque"]')) failures.push('opaque-component');
      document.documentElement.dataset.acheLayoutStatus = failures.length ? 'FAIL' : 'PASS';
      document.documentElement.dataset.acheLayoutFailures = failures.join(',');
      if (failures.length) console.error('[ache-layout-guard]', failures.join(','));
    };
    if (document.readyState === 'complete') requestAnimationFrame(inspect);
    else window.addEventListener('load', () => requestAnimationFrame(inspect), {once: true});
  })();
  </script>`;
  return `<!doctype html>
<html lang="zh-CN" data-ache-layout-status="PENDING">
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
    ${monthlyCover}
    ${episodes}
  </main>
  ${runtimeGuard}
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
