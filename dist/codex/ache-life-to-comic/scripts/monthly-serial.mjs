import {copyFile, mkdir, readFile, rename, rm, stat} from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {atomicWriteJson, atomicWriteText, ensureDir, readJsonIfExists} from "./io.mjs";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function monthKey(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})/u);
  if (!match) throw new Error(`Invalid ISO date: ${value}`);
  return `${match[1]}-${match[2]}`;
}

function safeSegment(value, label) {
  const segment = String(value ?? "");
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(segment)
    || segment === "."
    || segment === ".."
  ) {
    throw new Error(`${label} must be a safe file segment`);
  }
  return segment;
}

function safeImageExtension(source) {
  const extension = path.extname(source).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"].includes(extension)) {
    throw new Error(`Unsupported page image extension: ${extension || "(none)"}`);
  }
  return extension;
}

function bookPaths(root, bookId) {
  const book = path.join(root, "books", safeSegment(bookId, "bookId"));
  return {
    book,
    seriesManifest: path.join(book, "series-manifest.json"),
    seriesIndex: path.join(book, "index.html"),
    episodes: path.join(book, "episodes"),
    monthlyVolumes: path.join(book, "monthly-volumes"),
    parts: path.join(book, "parts"),
    annuals: path.join(book, "annuals"),
    locks: path.join(root, "runtime", "locks"),
    quarantine: path.join(root, "runtime", "quarantine")
  };
}

function volumePaths(root, bookId, month) {
  const base = path.join(
    root,
    "books",
    bookId,
    "monthly-volumes",
    month
  );
  return {
    base,
    manifest: path.join(base, "volume-manifest.json"),
    edition: path.join(base, "continuous-edition"),
    index: path.join(base, "continuous-edition", "index.html"),
    data: path.join(base, "continuous-edition", "book-data.json")
  };
}

async function initialize(root, bookId, title) {
  const locations = bookPaths(root, bookId);
  await Promise.all([
    ensureDir(locations.episodes),
    ensureDir(locations.monthlyVolumes),
    ensureDir(locations.parts),
    ensureDir(locations.annuals),
    ensureDir(locations.locks),
    ensureDir(locations.quarantine)
  ]);
  const existing = await readJsonIfExists(locations.seriesManifest);
  if (!existing) {
    await atomicWriteJson(locations.seriesManifest, {
      schemaVersion: "1.0.0",
      bookId,
      title,
      nextEpisodeNumber: 1,
      months: [],
      parts: [],
      annuals: [],
      idempotency: {},
      updatedAt: null
    });
  }
  return locations;
}

async function acquireLock(root, bookId, options = {}) {
  const {waitMs = 10_000, leaseMs = 15_000, pollMs = 20} = options;
  const locations = await initialize(root, bookId, "我的漫画人生");
  const lockDirectory = path.join(
    locations.locks,
    `${safeSegment(bookId, "bookId")}.lock`
  );
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
            path.join(locations.quarantine, `stale-${bookId}-${randomUUID()}`)
          );
          continue;
        }
      } catch (statError) {
        if (!["ENOENT", "EEXIST"].includes(statError?.code)) throw statError;
      }
      await wait(pollMs);
    }
  }
  throw new Error(`Timed out waiting for book lock: ${bookId}`);
}

async function releaseLock(lock) {
  const owner = await readJsonIfExists(path.join(lock.lockDirectory, "owner.json"));
  if (owner?.token === lock.token) {
    await rm(lock.lockDirectory, {recursive: true, force: true});
  }
}

function resolvePlacement(episode) {
  const recordedAt = episode.recordedAt;
  const eventDate = episode.eventDate ?? recordedAt;
  const placementDate = episode.placement === "current-reflection"
    ? recordedAt
    : eventDate;
  return {
    month: monthKey(placementDate),
    displayDate: placementDate,
    eventDate,
    recordedAt
  };
}

function sortEpisodes(episodes) {
  return [...episodes].sort((left, right) => {
    const date = left.displayDate.localeCompare(right.displayDate);
    return date || left.episodeNumber - right.episodeNumber;
  });
}

function readableDate(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/u);
  if (!match) return value;
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

function readableMonth(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})$/u);
  if (!match) return value;
  return `${match[1]}年${Number(match[2])}月`;
}

function partKey(month) {
  const match = String(month ?? "").match(/^(\d{4})-(\d{2})$/u);
  if (!match) throw new Error(`Invalid month: ${month}`);
  const quarter = Math.floor((Number(match[2]) - 1) / 3) + 1;
  return `${match[1]}-Q${quarter}`;
}

function partLabel(value) {
  const match = String(value ?? "").match(/^(\d{4})-Q([1-4])$/u);
  if (!match) return value;
  return `${match[1]}年 · 第${match[2]}部`;
}

function routeLabel(value) {
  return {
    S: "日常",
    P: "照片",
    K: "知识",
    M: "会议",
    L: "长文"
  }[value] ?? value;
}

function renderMonthlyHtml(book, volume) {
  const chapters = volume.episodes.map((episode) => `
    <article class="episode" data-episode-id="${escapeHtml(episode.episodeId)}">
      <header>
        <p class="meta">${escapeHtml(readableDate(episode.displayDate))} · ${escapeHtml(routeLabel(episode.route))}</p>
        <h2>${escapeHtml(episode.title)}</h2>
      </header>
      ${(episode.pageAssets ?? []).map((page) => `
        <figure class="page-frame">
          <img src="${escapeHtml(page.src)}" alt="${escapeHtml(page.alt)}" data-required-image>
        </figure>
      `).join("")}
      <p>${escapeHtml(episode.text)}</p>
      ${episode.visualStatus === "visual-pending" ? '<p class="visual-pending">插图待补</p>' : ""}
    </article>
  `).join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(book.title)} · ${escapeHtml(volume.month)}</title>
  <style>
    *{box-sizing:border-box}html{background:#eef4fa;color:#243140}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
    main{width:min(860px,100%);margin:auto;background:#fff;min-height:100vh;padding:8vw clamp(24px,7vw,72px)}
    h1,h2,p{overflow-wrap:anywhere}h1{font-size:clamp(34px,8vw,70px);margin:0 0 8px}
    .volume-meta,.meta{color:#6682a2}.episode{padding:64px 0;border-top:1px solid #dbe6f2}
    .episode h2{font-size:clamp(27px,5vw,44px);margin:8px 0 20px}.episode>p{font-size:20px;line-height:1.85}
    .page-frame{margin:28px 0;background:#f5f8fc}.page-frame img{display:block;width:100%;height:auto}
    .visual-pending{padding:18px;border:1px dashed #8aa9cb;color:#567493}
  </style>
</head>
<body><main>
  <header><h1>${escapeHtml(readableMonth(volume.month))}</h1><p class="volume-meta">${escapeHtml(book.title)} · 月册 · ${volume.episodes.length} 个章节</p></header>
  ${chapters}
</main></body></html>`;
}

function renderSeriesHtml(series) {
  const months = series.months.map((month) => `
    <li><a href="${escapeHtml(month.href)}">${escapeHtml(readableMonth(month.month))}</a><span>${month.episodeCount} 章</span></li>
  `).join("\n");
  const parts = (series.parts ?? []).map((part) => `
    <li><a href="${escapeHtml(part.href)}">${escapeHtml(partLabel(part.part))}</a><span>${part.months.length} 册</span></li>
  `).join("\n");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(series.title)}</title>
<style>body{margin:auto;max-width:820px;padding:8vw 24px;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#243140}h1{font-size:clamp(36px,8vw,72px)}li{display:flex;justify-content:space-between;padding:22px 0;border-bottom:1px solid #dbe6f2}a{color:#426b96;font-size:22px}</style>
</head><body><h1>${escapeHtml(series.title)}</h1><p>一本持续生长的漫画人生</p><h2>月册</h2><ol>${months}</ol><h2>部</h2><ol>${parts}</ol></body></html>`;
}

function renderCollectionHtml({title, subtitle, months}) {
  const items = months.map((month) => `
    <li><a href="../../${escapeHtml(month.href)}">${escapeHtml(readableMonth(month.month))}</a><span>${month.episodeCount} 章</span></li>
  `).join("\n");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{margin:auto;max-width:820px;padding:8vw 24px;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#243140}h1{font-size:clamp(36px,8vw,72px)}li{display:flex;justify-content:space-between;padding:22px 0;border-bottom:1px solid #dbe6f2}a{color:#426b96;font-size:22px}</style>
</head><body><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p><ol>${items}</ol></body></html>`;
}

async function updateCollectionIndexes(locations, series) {
  const parts = new Map();
  const annuals = new Map();
  for (const month of series.months) {
    const part = partKey(month.month);
    const year = month.month.slice(0, 4);
    if (!parts.has(part)) parts.set(part, []);
    if (!annuals.has(year)) annuals.set(year, []);
    parts.get(part).push(month);
    annuals.get(year).push(month);
  }

  series.parts = [];
  for (const [part, months] of [...parts].sort(([left], [right]) => left.localeCompare(right))) {
    const directory = path.join(locations.parts, part);
    await ensureDir(directory);
    await atomicWriteJson(path.join(directory, "index.json"), {
      schemaVersion: "1.0.0",
      part,
      months
    });
    await atomicWriteText(path.join(directory, "index.html"), renderCollectionHtml({
      title: partLabel(part),
      subtitle: "自然季度索引；正文仍由月册承载。",
      months
    }));
    series.parts.push({
      part,
      href: `parts/${part}/index.html`,
      months: months.map((item) => item.month)
    });
  }

  series.annuals = [];
  for (const [year, months] of [...annuals].sort(([left], [right]) => left.localeCompare(right))) {
    const directory = path.join(locations.annuals, year);
    await ensureDir(directory);
    await atomicWriteJson(path.join(directory, "index.json"), {
      schemaVersion: "1.0.0",
      year,
      months
    });
    await atomicWriteText(path.join(directory, "index.html"), renderCollectionHtml({
      title: `${year} 年度合辑`,
      subtitle: "年度索引；不复制月册正文。",
      months
    }));
    series.annuals.push({
      year,
      href: `annuals/${year}/index.html`,
      months: months.map((item) => item.month)
    });
  }
}

export async function appendEpisode(root, rawEpisode) {
  const episode = {
    bookId: rawEpisode.bookId,
    bookTitle: rawEpisode.bookTitle ?? "我的漫画人生",
    idempotencyKey: rawEpisode.idempotencyKey,
    episodeId: rawEpisode.episodeId ?? randomUUID(),
    title: rawEpisode.title ?? "今天一页",
    text: rawEpisode.text ?? "",
    route: rawEpisode.route ?? "S",
    recordedAt: rawEpisode.recordedAt,
    eventDate: rawEpisode.eventDate ?? rawEpisode.recordedAt,
    placement: rawEpisode.placement ?? "event-date",
    visualStatus: rawEpisode.visualStatus ?? "ready"
  };
  if (!episode.bookId || !episode.idempotencyKey || !episode.recordedAt) {
    throw new Error("bookId, idempotencyKey and recordedAt are required");
  }
  safeSegment(episode.bookId, "bookId");
  safeSegment(episode.episodeId, "episodeId");

  await initialize(root, episode.bookId, episode.bookTitle);
  const lock = await acquireLock(root, episode.bookId);
  try {
    const locations = await initialize(root, episode.bookId, episode.bookTitle);
    const series = await readJsonIfExists(locations.seriesManifest);
    const existingId = series.idempotency[episode.idempotencyKey];
    if (existingId) {
      return {episodeId: existingId, reused: true};
    }

    const placement = resolvePlacement(episode);
    const volumeLocations = volumePaths(root, episode.bookId, placement.month);
    await ensureDir(volumeLocations.edition);
    const pageAssets = [];
    const assetRoot = path.join(volumeLocations.edition, "assets");
    const finalAssetDirectory = path.join(assetRoot, episode.episodeId);
    const stagedAssetDirectory = path.join(
      assetRoot,
      `.staging-${episode.episodeId}-${randomUUID()}`
    );
    try {
      await ensureDir(stagedAssetDirectory);
      for (const [index, page] of (rawEpisode.pages ?? []).entries()) {
        const source = typeof page === "string" ? page : page.path;
        if (!source) throw new Error(`Missing page path at index ${index}`);
        const filename = `${String(index + 1).padStart(2, "0")}${safeImageExtension(source)}`;
        await copyFile(source, path.join(stagedAssetDirectory, filename));
        pageAssets.push({
          src: path.posix.join("assets", episode.episodeId, filename),
          alt: typeof page === "string"
            ? `${episode.title} 第 ${index + 1} 页`
            : page.alt ?? `${episode.title} 第 ${index + 1} 页`
        });
      }
      await rename(stagedAssetDirectory, finalAssetDirectory);
    } catch (error) {
      await rm(stagedAssetDirectory, {recursive: true, force: true});
      throw error;
    }

    const committed = {
      ...episode,
      ...placement,
      pageAssets,
      episodeNumber: series.nextEpisodeNumber,
      committedAt: new Date().toISOString()
    };
    await atomicWriteJson(
      path.join(locations.episodes, `${committed.episodeId}.json`),
      committed
    );

    const volume = await readJsonIfExists(volumeLocations.manifest, {
      schemaVersion: "1.0.0",
      bookId: episode.bookId,
      month: placement.month,
      episodes: []
    });
    volume.episodes = sortEpisodes([...volume.episodes, committed]);
    volume.updatedAt = committed.committedAt;
    await atomicWriteJson(volumeLocations.manifest, volume);
    await atomicWriteJson(volumeLocations.data, {
      bookId: episode.bookId,
      month: placement.month,
      episodes: volume.episodes
    });
    await atomicWriteText(
      volumeLocations.index,
      renderMonthlyHtml({title: series.title}, volume)
    );

    const monthRecord = {
      month: placement.month,
      href: `monthly-volumes/${placement.month}/continuous-edition/index.html`,
      episodeCount: volume.episodes.length
    };
    series.months = [
      ...series.months.filter((item) => item.month !== placement.month),
      monthRecord
    ].sort((left, right) => left.month.localeCompare(right.month));
    series.idempotency[episode.idempotencyKey] = committed.episodeId;
    series.nextEpisodeNumber += 1;
    series.updatedAt = committed.committedAt;
    await updateCollectionIndexes(locations, series);
    await atomicWriteJson(locations.seriesManifest, series);
    await atomicWriteText(locations.seriesIndex, renderSeriesHtml(series));
    return {
      episodeId: committed.episodeId,
      episodeNumber: committed.episodeNumber,
      month: placement.month,
      reused: false,
      monthlyIndex: volumeLocations.index,
      seriesIndex: locations.seriesIndex
    };
  } finally {
    await releaseLock(lock);
  }
}

export async function inspectSeries(root, bookId) {
  return readJsonIfExists(bookPaths(root, bookId).seriesManifest);
}

export async function inspectVolume(root, bookId, month) {
  return readJsonIfExists(volumePaths(root, bookId, month).manifest);
}

export async function readMonthlyHtml(root, bookId, month) {
  return readFile(volumePaths(root, bookId, month).index, "utf8");
}
