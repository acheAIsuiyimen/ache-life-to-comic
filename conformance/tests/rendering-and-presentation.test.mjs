import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, readFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  createPresentationReceipt,
  resolvePresentationMode
} from "../../scripts/presentation.mjs";
import {
  renderMonthlyDocument
} from "../../scripts/page-renderer.mjs";
import {
  appendEpisode
} from "../../scripts/monthly-serial.mjs";
import {
  validateRenderedHtmlText
} from "../../scripts/validate-rendered-html.mjs";

const skillRoot = path.resolve(".");
const visual = path.join(
  skillRoot,
  "assets/presets/02-snow-pastel/golden/photo-page.png"
);

function sampleEpisode(overrides = {}) {
  return {
    episodeId: "sample",
    episodeNumber: 1,
    route: "S",
    title: "雨停之后",
    text: "雨停了。窗台还有一点亮。今天不急着解释。",
    displayDate: "2026-07-31T10:00:00+08:00",
    visualStatus: "ready",
    pageAssets: [
      {src: "assets/sample/01.png", alt: "雨后窗台", role: "cover-visual"},
      {src: "assets/sample/02.png", alt: "亮起来的杯子", role: "body-visual"}
    ],
    ...overrides
  };
}

test("monthly renderer owns fixed page artboards instead of generic blog HTML", () => {
  const html = renderMonthlyDocument(
    {title: "我的漫画人生"},
    {month: "2026-07", episodes: [sampleEpisode()]}
  );
  assert.equal(validateRenderedHtmlText(html).status, "PASS");
  assert.match(html, /class="ache-page ache-cover-page"/u);
  assert.match(html, /class="ache-page ache-visual-page/u);
  assert.doesNotMatch(html, /class="page-frame"|class="episode"/u);
  assert.doesNotMatch(html, /fonts\.googleapis\.com/u);
});

test("text-first routes keep cover and readable body pages with sparse illustration", () => {
  for (const route of ["K", "M", "L"]) {
    const html = renderMonthlyDocument(
      {title: "一本书"},
      {
        month: "2026-07",
        episodes: [sampleEpisode({
          route,
          title: route === "M" ? "八月续更策划会" : "预训练到底在学什么",
          text: "先留下完整正文。再把关键关系解释清楚。图片只在确实能帮助理解时出现。",
          pageAssets: [{src: "assets/sample/01.png", alt: "小插图", role: "cover-visual"}]
        })]
      }
    );
    assert.equal(validateRenderedHtmlText(html).status, "PASS");
    assert.match(html, /ache-text-page/u);
  }
});

test("presentation plan uses real declared surfaces and never invents tool names", () => {
  const assetPath = "assets/presets/style-selector.png";
  const native = resolvePresentationMode({
    capabilities: {presentation: {imageAttachment: true}},
    assetPath
  });
  assert.equal(native.mode, "native-image-attachment");
  assert.equal(native.status, "presentation-ready");
  const receipt = createPresentationReceipt({plan: native, displayed: true});
  assert.equal(receipt.status, "displayed");
  assert.equal(receipt.displayed, true);

  const blocked = resolvePresentationMode({capabilities: {}, assetPath});
  assert.equal(blocked.status, "presentation-blocked");
  assert.equal(JSON.stringify(blocked).includes("present_files"), false);
});

test("committed monthly edition installs local fonts and deterministic renderer", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ache-rendered-month-"));
  const result = await appendEpisode(root, {
    bookId: "rendered-book",
    bookTitle: "一本会长大的书",
    idempotencyKey: "rendered-entry",
    episodeId: "rendered-entry",
    title: "一页日常",
    text: "窗边有一阵雨。它被收进了七月。",
    route: "S",
    recordedAt: "2026-07-31T12:00:00+08:00",
    visuals: [
      {path: visual, alt: "窗边", role: "cover-visual"},
      {path: visual, alt: "雨后", role: "body-visual"}
    ]
  });
  const html = await readFile(result.monthlyIndex, "utf8");
  assert.equal(validateRenderedHtmlText(html).status, "PASS");
  const font = path.join(
    path.dirname(result.monthlyIndex),
    "assets/system/LXGWWenKaiGBScreen.ttf"
  );
  assert.ok((await readFile(font)).byteLength > 1_000_000);
});
