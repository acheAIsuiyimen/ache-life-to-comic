import {copyFile, mkdir, rm, writeFile} from "node:fs/promises";
import path from "node:path";

import {appendEpisode} from "../../scripts/monthly-serial.mjs";
import {exportPortableShare} from "../../scripts/portable-export.mjs";

const projectRoot = path.resolve(".");
const reviewRoot = path.join(projectRoot, "conformance/review/portable-share");
const library = path.join(reviewRoot, "library");
const isolated = path.join(reviewRoot, "isolated");
const golden = path.join(projectRoot, "assets/presets/02-snow-pastel/golden/photo-page.png");

await rm(reviewRoot, {recursive: true, force: true});
await mkdir(isolated, {recursive: true});

for (const [id, date, title] of [
  ["portable-july", "2026-07-08T09:00:00+08:00", "七月的窗"],
  ["portable-august", "2026-08-09T09:00:00+08:00", "八月的云"],
  ["portable-september", "2026-09-10T09:00:00+08:00", "九月的雨"]
]) {
  await appendEpisode(library, {
    bookId: "portable-book",
    bookTitle: "便携分享验收书",
    idempotencyKey: id,
    episodeId: id,
    title,
    text: `${title}被好好收进来了。`,
    route: "P",
    recordedAt: date,
    pages: [{path: golden, alt: `${title}的照片手帐页`}]
  });
}

const requests = [
  {name: "chapter-light", unit: "chapter", key: "portable-july", choice: "light"},
  {name: "volume-light", unit: "volume", key: "2026-07", choice: "light"},
  {name: "part-light", unit: "part", key: "2026-Q3", choice: "light"},
  {name: "book-light", unit: "book", key: "2026", choice: "light"},
  {name: "chapter-faithful", unit: "chapter", key: "portable-august", choice: "faithful"}
];
const outputs = [];
for (const request of requests) {
  const result = await exportPortableShare(library, {
    bookId: "portable-book",
    unit: request.unit,
    key: request.key,
    choice: request.choice
  });
  const target = path.join(isolated, `${request.name}.html`);
  await copyFile(result.output, target);
  outputs.push({
    ...request,
    path: target,
    bytes: result.bytes,
    validation: result.validation
  });
}

const report = {
  status: "fixture-ready",
  outputs,
  assetsCopiedBesideHtml: false,
  externalWritesPerformed: false
};
await writeFile(
  path.join(reviewRoot, "fixture-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
