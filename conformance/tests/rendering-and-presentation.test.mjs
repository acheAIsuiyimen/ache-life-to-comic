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
  planTextComposition,
  renderMonthlyDocument,
  structureKnowledgeText
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
  assert.match(html, /class="ache-page ache-cover-page ache-route-s"/u);
  assert.match(html, /class="ache-page ache-visual-page/u);
  assert.match(html, /<h2 class="ache-sr-only">雨停之后<\/h2>/u);
  assert.doesNotMatch(html, /class="page-frame"|class="episode"/u);
  assert.doesNotMatch(html, /fonts\.googleapis\.com/u);
  assert.doesNotMatch(html, /ache-text-token/u);
  assert.doesNotMatch(html, /\.ache-title[^}]*white-space:\s*nowrap/u);
  assert.match(html, /data-image-fit="contain"/u);
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
    assert.doesNotMatch(html, /ache-text-token/u);
  }
});

test("meeting renderer exposes editorial decision risk and action rhythm", () => {
  const html = renderMonthlyDocument(
    {title: "一本书"},
    {month: "2026-07", episodes: [sampleEpisode({
      route: "M",
      title: "这次会留下了什么",
      text: "背景：先核对进度。风险：接口仍不稳定。决议：周三先灰度。待办：小林周二提交清单。"
    })]}
  );
  assert.match(html, /ache-meeting-risk/u);
  assert.match(html, /ache-meeting-decision/u);
  assert.match(html, /ache-meeting-action/u);
});

test("knowledge workflow remains one semantic sequence instead of punctuation fragments", () => {
  const source = "看了一段视频，它讲的输出方法是：先口述一遍；AI 只清理，不润色；放进提词器；直接开录。这周我也试试。";
  const structure = structureKnowledgeText(source);
  assert.equal(structure.mode, "sequence");
  assert.deepEqual(structure.steps, ["先口述一遍", "AI 只清理，不润色", "放进提词器", "直接开录"]);
  const html = renderMonthlyDocument(
    {title: "一本书"},
    {month: "2026-07", episodes: [sampleEpisode({route: "K", text: source})]}
  );
  assert.equal((html.match(/class="ache-knowledge-steps"/gu) ?? []).length, 1);
  assert.equal((html.match(/ache-knowledge-steps[\s\S]*?<li>/gu) ?? []).length > 0, true);
  assert.match(html, /ache-knowledge-reflection/u);
});

test("meeting and longform preflight choose balanced text recipes before rendering", () => {
  const meeting = "背景：复盘本月进度。议题：对齐需求与排期。讨论：前端与后端各自补齐方案。风险：通知链路仍不稳定。决议：先灰度。待办：周二提交清单。".repeat(5);
  const longform = "这是一段需要保留原始顺序的正文。".repeat(42);
  const meetingPlan = planTextComposition(meeting, "M", [{}]);
  const longPlan = planTextComposition(longform, "L", []);
  assert.equal(meetingPlan.recipe, "meeting-editorial-ledger");
  assert.equal(longPlan.recipe, "longform-balanced-reading");
  assert.ok(meetingPlan.pageCount >= 2);
  assert.ok(longPlan.pageCount >= 2);
  assert.deepEqual(longPlan.preflight.targetFillRange, [0.62, 0.88]);
});

test("long text paginates instead of shrinking mobile typography", () => {
  const longText = Array.from({length: 24}, (_, index) =>
    `第${index + 1}段保留完整事实与阅读顺序，内容超出时沿语义边界进入下一页。`
  ).join("\n");
  const html = renderMonthlyDocument(
    {title: "一本书"},
    {month: "2026-07", episodes: [sampleEpisode({route: "L", text: longText})]}
  );
  assert.ok((html.match(/class="ache-page ache-text-page/gu) ?? []).length >= 2);
  assert.doesNotMatch(html, /font-size:\s*(?:9|10|11)(?:px|\.\d+px)/u);
});

test("long-form rendering preserves every source character in order", () => {
  const source = [
    "第一段保留原来的引号、顿号与句号。",
    "“第二段不会被拆成孤零零的标点。这里还有第二句。”",
    "第三段很长，".repeat(90)
  ].join("\n\n");
  const html = renderMonthlyDocument(
    {title: "一本书"},
    {month: "2026-07", episodes: [sampleEpisode({route: "L", text: source})]}
  );
  const renderedText = [...html.matchAll(/<div class="ache-text-column">([\s\S]*?)<\/div>/gu)]
    .map((match) => match[1])
    .join("")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replace(/<br>/gu, "\n")
    .replace(/<[^>]+>/gu, "")
    .replace(/\s+/gu, "");
  assert.equal(renderedText, source.replace(/\s+/gu, ""));
});

test("titles wrap naturally and photos are never crop fitted", () => {
  const html = renderMonthlyDocument(
    {title: "一本书"},
    {month: "2026-07", episodes: [sampleEpisode({
      route: "P",
      title: "这是一条需要自然换行而不是挤进图片区的长标题"
    })]}
  );
  assert.match(html, /ache-title--long/u);
  assert.doesNotMatch(html, /ache-title-line/u);
  assert.doesNotMatch(html, /data-image-fit="cover"/u);
});

test("photo route never promotes an original body photo into the cover", () => {
  const html = renderMonthlyDocument(
    {title: "一本书"},
    {month: "2026-07", episodes: [sampleEpisode({
      route: "P",
      pageAssets: [{src: "assets/original.jpg", alt: "完整原图", role: "body-photo"}]
    })]}
  );
  const cover = html.match(/ache-cover-page[\s\S]*?<\/section>/u)?.[0] ?? "";
  const body = html.match(/ache-visual-page[\s\S]*?<\/section>/u)?.[0] ?? "";
  assert.doesNotMatch(cover, /assets\/original\.jpg/u);
  assert.match(body, /assets\/original\.jpg/u);
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

test("monthly cover is a first-class 3:4 page before chapter pages", () => {
  const html = renderMonthlyDocument(
    {title: "一本会长大的书"},
    {
      month: "2026-07",
      coverAsset: {
        src: "assets/monthly-cover/2026-07.png",
        alt: "七月月封",
        role: "monthly-cover",
        aspectClass: "portrait"
      },
      episodes: [sampleEpisode()]
    }
  );
  const monthlyIndex = html.indexOf('<div class="ache-monthly-cover-wrap">');
  const chapterIndex = html.indexOf('<article class="ache-episode"');
  assert.ok(monthlyIndex > 0 && monthlyIndex < chapterIndex);
  assert.match(html, /data-asset-role="monthly-cover"/u);
});
