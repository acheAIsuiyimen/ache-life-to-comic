import test from "node:test";
import assert from "node:assert/strict";
import {copyFile, mkdtemp, readFile, stat} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {appendEpisode} from "../../scripts/monthly-serial.mjs";
import {
  exportPortableShare,
  inspectPortableShares,
  preparePortableSharePrompt,
  validatePortableHtmlText
} from "../../scripts/portable-export.mjs";

const goldenPage = path.resolve(
  "assets/presets/02-snow-pastel/golden/photo-page.png"
);

async function fixture() {
  const library = await mkdtemp(path.join(os.tmpdir(), "ache-portable-"));
  const entries = [
    ["chapter-july", "2026-07-11T10:00:00+08:00", "七月的风"],
    ["chapter-august", "2026-08-12T10:00:00+08:00", "八月的云"],
    ["chapter-september", "2026-09-13T10:00:00+08:00", "九月的雨"]
  ];
  for (const [episodeId, recordedAt, title] of entries) {
    await appendEpisode(library, {
      bookId: "my-life",
      bookTitle: "我的漫画人生",
      idempotencyKey: episodeId,
      episodeId,
      title,
      text: `${title}被收进了这本书。`,
      route: "S",
      recordedAt,
      pages: [{path: goldenPage, alt: `${title}的漫画页`}]
    });
  }
  return library;
}

test("every appended chapter keeps canonical HTML + assets and asks one share choice", async () => {
  const library = await mkdtemp(path.join(os.tmpdir(), "ache-portable-"));
  const result = await appendEpisode(library, {
    bookId: "my-life",
    bookTitle: "我的漫画人生",
    idempotencyKey: "chapter-one",
    episodeId: "chapter-one",
    title: "窗边的一小会儿",
    text: "雨停以后，窗边亮了一点。",
    route: "P",
    recordedAt: "2026-07-11T10:00:00+08:00",
    pages: [{path: goldenPage, alt: "窗边照片手帐页"}]
  });

  assert.equal(result.portableShare.status, "choice-required");
  assert.equal(result.portableShare.unitLabel, "单章");
  assert.equal(result.portableShare.defaultValue, null);
  assert.deepEqual(
    result.portableShare.options.map((item) => item.value),
    ["light", "faithful", "skip"]
  );

  const canonical = await readFile(result.monthlyIndex, "utf8");
  assert.match(canonical, /src="assets\/chapter-one\/01\.png"/u);
  assert.ok((await stat(path.join(
    path.dirname(result.monthlyIndex),
    "assets/chapter-one/01.png"
  ))).size > 0);
});

test("chapter light export is a standalone exact chapter", async () => {
  const library = await fixture();
  const result = await exportPortableShare(library, {
    bookId: "my-life",
    unit: "chapter",
    key: "chapter-july",
    choice: "light"
  });
  assert.equal(result.status, "exported");
  assert.equal(result.validation.status, "PASS");

  const isolatedDirectory = await mkdtemp(path.join(os.tmpdir(), "ache-isolated-"));
  const isolated = path.join(isolatedDirectory, "chapter.html");
  await copyFile(result.output, isolated);
  const html = await readFile(isolated, "utf8");
  assert.match(html, /data:image\/png;base64,/u);
  assert.match(html, /七月的风/u);
  assert.doesNotMatch(html, /八月的云|九月的雨/u);
  assert.doesNotMatch(html, /@font-face/u);
  assert.equal(validatePortableHtmlText(html).status, "PASS");
});

test("volume, part and book exports preserve the correct hierarchy", async () => {
  const library = await fixture();
  const cases = [
    {unit: "volume", key: "2026-07", expected: ["七月的风"], absent: "八月的云"},
    {unit: "part", key: "2026-Q3", expected: ["七月的风", "八月的云", "九月的雨"]},
    {unit: "book", key: "2026", expected: ["七月的风", "八月的云", "九月的雨"]}
  ];

  for (const item of cases) {
    const prompt = await preparePortableSharePrompt(library, {
      bookId: "my-life",
      unit: item.unit,
      key: item.key
    });
    assert.equal(prompt.status, "choice-required");
    const exported = await exportPortableShare(library, {
      bookId: "my-life",
      unit: item.unit,
      key: item.key,
      choice: "light"
    });
    const html = await readFile(exported.output, "utf8");
    assert.match(html, new RegExp(`data-share-unit="${item.unit}"`, "u"));
    item.expected.forEach((text) => assert.match(html, new RegExp(text, "u")));
    if (item.absent) assert.doesNotMatch(html, new RegExp(item.absent, "u"));
    assert.match(html, /data:image\/png;base64,/u);
    assert.equal(validatePortableHtmlText(html).status, "PASS");
  }
});

test("concurrent hierarchy exports keep every manifest decision", async () => {
  const library = await fixture();
  const requests = [
    {bookId: "my-life", unit: "volume", key: "2026-07", choice: "light"},
    {bookId: "my-life", unit: "part", key: "2026-Q3", choice: "light"},
    {bookId: "my-life", unit: "book", key: "2026", choice: "light"}
  ];
  const results = await Promise.all(
    requests.map((request) => exportPortableShare(library, request))
  );
  assert.deepEqual(results.map((result) => result.status), ["exported", "exported", "exported"]);
  const manifest = await inspectPortableShares(library, "my-life");
  assert.equal(Object.keys(manifest.decisions).length, 3);
  for (const result of results) {
    assert.ok((await stat(result.output)).size > 0);
  }
});

test("faithful export embeds fonts and is larger than light export", async () => {
  const library = await fixture();
  const light = await exportPortableShare(library, {
    bookId: "my-life",
    unit: "chapter",
    key: "chapter-july",
    choice: "light"
  });
  const faithful = await exportPortableShare(library, {
    bookId: "my-life",
    unit: "chapter",
    key: "chapter-august",
    choice: "faithful"
  });
  const html = await readFile(faithful.output, "utf8");
  assert.match(html, /data:font\/(?:ttf|woff2);base64,/u);
  assert.ok(faithful.bytes > light.bytes);
  assert.equal(validatePortableHtmlText(html).status, "PASS");
});

test("skip suppresses repeat prompting but can be explicitly changed to export later", async () => {
  const library = await fixture();
  const skipped = await exportPortableShare(library, {
    bookId: "my-life",
    unit: "volume",
    key: "2026-08",
    choice: "skip"
  });
  assert.equal(skipped.status, "skipped");

  const prompt = await preparePortableSharePrompt(library, {
    bookId: "my-life",
    unit: "volume",
    key: "2026-08"
  });
  assert.equal(prompt.status, "already-decided");
  assert.equal(prompt.canExportLater, true);

  const later = await exportPortableShare(library, {
    bookId: "my-life",
    unit: "volume",
    key: "2026-08",
    choice: "light"
  });
  assert.equal(later.status, "exported");
  const manifest = await inspectPortableShares(library, "my-life");
  const decisions = Object.values(manifest.decisions);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].status, "exported");
});

test("portable export is idempotent per exact source revision", async () => {
  const library = await fixture();
  const request = {
    bookId: "my-life",
    unit: "book",
    key: "2026",
    choice: "light"
  };
  const first = await exportPortableShare(library, request);
  const second = await exportPortableShare(library, request);
  assert.equal(first.status, "exported");
  assert.equal(second.status, "reused");
  assert.equal(second.decision.output, path.relative(
    path.join(library, "books/my-life"),
    first.output
  ));
});

test("unsafe portable keys and unresolved resources fail validation", async () => {
  const library = await fixture();
  await assert.rejects(
    preparePortableSharePrompt(library, {
      bookId: "my-life",
      unit: "chapter",
      key: "../escape"
    }),
    /safe file segment/u
  );
  const broken = '<meta name="ache-portable-share" content="ache-portable-share/1.0.0"><img src="assets/a.png">';
  assert.deepEqual(validatePortableHtmlText(broken), {
    status: "FAIL",
    failures: ["unresolved-resource-attribute"]
  });
});
