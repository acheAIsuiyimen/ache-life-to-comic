import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, readFile, stat} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  appendEpisode,
  inspectSeries,
  inspectVolume,
  readMonthlyHtml
} from "../../dist/codex/ache-life-to-comic/scripts/monthly-serial.mjs";

const skillRoot = path.resolve(
  "dist/codex/ache-life-to-comic"
);
const goldenPage = path.join(
  skillRoot,
  "assets/presets/02-snow-pastel/golden/photo-page.png"
);

async function temporaryLibrary() {
  return mkdtemp(path.join(os.tmpdir(), "ache-life-to-comic-"));
}

function episode(index, overrides = {}) {
  return {
    bookId: "my-life",
    bookTitle: "我的漫画人生",
    idempotencyKey: `entry-${index}`,
    episodeId: `episode-${index}`,
    title: `第 ${index} 次记录`,
    text: `这是第 ${index} 次记录。`,
    route: "S",
    recordedAt: `2026-07-${String(index).padStart(2, "0")}T12:00:00+08:00`,
    ...overrides
  };
}

test("ten concurrent entries append to one monthly primary file", async () => {
  const root = await temporaryLibrary();
  const results = await Promise.all(
    Array.from({length: 10}, (_, index) => appendEpisode(root, episode(index + 1)))
  );
  assert.equal(new Set(results.map((item) => item.episodeNumber)).size, 10);
  const series = await inspectSeries(root, "my-life");
  assert.equal(series.months.length, 1);
  assert.equal(series.months[0].month, "2026-07");
  assert.equal(series.months[0].episodeCount, 10);
  const volume = await inspectVolume(root, "my-life", "2026-07");
  assert.equal(volume.episodes.length, 10);
});

test("cross-month and backfill placement keep one shelf and monthly volumes", async () => {
  const root = await temporaryLibrary();
  await appendEpisode(root, episode(1));
  await appendEpisode(root, episode(2, {
    recordedAt: "2026-08-03T09:00:00+08:00"
  }));
  await appendEpisode(root, episode(3, {
    eventDate: "2026-06-09T09:00:00+08:00",
    recordedAt: "2026-08-04T09:00:00+08:00"
  }));
  await appendEpisode(root, episode(4, {
    eventDate: "2026-05-01T09:00:00+08:00",
    recordedAt: "2026-08-05T09:00:00+08:00",
    placement: "current-reflection"
  }));
  const series = await inspectSeries(root, "my-life");
  assert.deepEqual(series.months.map((item) => item.month), [
    "2026-06",
    "2026-07",
    "2026-08"
  ]);
  assert.equal((await inspectVolume(root, "my-life", "2026-08")).episodes.length, 2);
  assert.deepEqual(series.parts.map((item) => item.part), ["2026-Q2", "2026-Q3"]);
  assert.deepEqual(series.annuals.map((item) => item.year), ["2026"]);
  const partHtml = await readFile(
    path.join(root, "books/my-life/parts/2026-Q3/index.html"),
    "utf8"
  );
  assert.match(partHtml, /2026年7月/u);
  assert.match(partHtml, /2026年8月/u);
  assert.doesNotMatch(partHtml, /这是第 1 次记录/u);
});

test("idempotent retry reuses the committed episode", async () => {
  const root = await temporaryLibrary();
  const first = await appendEpisode(root, episode(1));
  const second = await appendEpisode(root, {
    ...episode(1),
    episodeId: "another-episode-id"
  });
  assert.equal(second.reused, true);
  assert.equal(second.episodeId, first.episodeId);
  assert.equal((await inspectSeries(root, "my-life")).nextEpisodeNumber, 2);
});

test("page assets are copied into the monthly continuous edition", async () => {
  const root = await temporaryLibrary();
  const result = await appendEpisode(root, episode(1, {
    pages: [{path: goldenPage, alt: "照片手帐页"}]
  }));
  const volume = await inspectVolume(root, "my-life", "2026-07");
  assert.equal(volume.episodes[0].pageAssets.length, 1);
  const copied = path.join(
    path.dirname(result.monthlyIndex),
    volume.episodes[0].pageAssets[0].src
  );
  assert.ok((await stat(copied)).size > 0);
  const html = await readMonthlyHtml(root, "my-life", "2026-07");
  assert.match(html, /data-required-image/u);
  assert.match(html, /照片手帐页/u);
});

test("visual-pending chapter remains readable", async () => {
  const root = await temporaryLibrary();
  await appendEpisode(root, episode(1, {
    visualStatus: "visual-pending",
    text: "图还没补，但正文必须先能读。"
  }));
  const html = await readMonthlyHtml(root, "my-life", "2026-07");
  assert.match(html, /图还没补，但正文必须先能读/u);
  assert.match(html, /插图待补/u);
});

test("unsafe ids and unsupported page files are rejected", async () => {
  const root = await temporaryLibrary();
  await assert.rejects(
    appendEpisode(root, episode(1, {bookId: "../escape"})),
    /safe file segment/u
  );
  const source = path.join(root, "page.txt");
  await import("node:fs/promises").then(({writeFile}) => writeFile(source, "x"));
  await assert.rejects(
    appendEpisode(root, episode(2, {pages: [source]})),
    /Unsupported page image extension/u
  );
});

test("monthly HTML contains no unresolved local absolute paths", async () => {
  const root = await temporaryLibrary();
  const result = await appendEpisode(root, episode(1, {pages: [goldenPage]}));
  const html = await readFile(result.monthlyIndex, "utf8");
  assert.doesNotMatch(html, /Users\/|private\/var\/|file:\/\//u);
});
