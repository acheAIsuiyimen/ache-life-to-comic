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
      {
        src: "assets/sample/02.png",
        alt: "亮起来的杯子",
        role: "body-visual",
        intrinsicWidth: 720,
        intrinsicHeight: 760,
        frameContentWidth: 720,
        frameContentHeight: 760,
        frameFitStatus: "matched"
      }
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
  assert.match(html, /data-theme-source="style-default"/u);
  assert.doesNotMatch(html, /ache-cover-visual"><div class="ache-paper-mat"/u);
});

test("renderer carries matched frame geometry and chapter-specific palette tokens", () => {
  const html = renderMonthlyDocument(
    {title: "我的漫画人生"},
    {month: "2026-07", episodes: [sampleEpisode({
      styleId: "custom-pixel",
      paletteSource: "reference",
      palette: {
        ink: "#1B2040",
        soft: "#665F8B",
        primary: "#6D5DDF",
        pale: "#E8E4FF",
        accent: "#E04FA3"
      },
      pageAssets: [
        {src: "assets/sample/01.png", alt: "封面", role: "cover-visual", intrinsicWidth: 1080, intrinsicHeight: 1440},
        {
          src: "assets/sample/02.png",
          alt: "一格漫画",
          role: "body-visual",
          intrinsicWidth: 720,
          intrinsicHeight: 420,
          frameContentWidth: 720,
          frameContentHeight: 420,
          frameFitStatus: "matched",
          edgeTreatment: "paper-mat"
        }
      ]
    })]}
  );
  assert.equal(validateRenderedHtmlText(html).status, "PASS");
  assert.match(html, /--ache-ice:#6D5DDF/u);
  assert.match(html, /data-theme-source="reference"/u);
  assert.match(html, /data-frame-fit="matched"/u);
  assert.match(html, /--ache-media-ratio:720 \/ 420/u);
});

test("supporting illustrations render as transparent die-cut components without a generic paper mat", () => {
  const html = renderMonthlyDocument(
    {title: "一本书"},
    {month: "2026-07", episodes: [sampleEpisode({
      route: "K",
      text: "先理解背景，再观察关系，最后写下自己的理解。",
      pageAssets: [
        {src: "assets/sample/cover.png", alt: "封面", role: "cover-visual"},
        {
          src: "assets/sample/vignette.svg",
          alt: "关系插图",
          role: "explanatory-vignette",
          backgroundMode: "svg-vector",
          detectedFormat: "svg",
          transparencyStatus: "verified-transparent",
          edgeTreatment: "die-cut-transparent",
          intrinsicWidth: 480,
          intrinsicHeight: 480,
          frameContentWidth: 480,
          frameContentHeight: 480,
          frameFitStatus: "matched"
        }
      ]
    })]}
  );
  assert.equal(validateRenderedHtmlText(html).status, "PASS");
  assert.match(html, /ache-frame-die-cut-transparent/u);
  assert.match(html, /data-background-mode="svg-vector"/u);
  assert.doesNotMatch(html, /ache-inline-visual"><div class="ache-paper-mat"/u);
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
      text: [
        "会议主题：迭代对齐会",
        "一、讨论内容",
        "接口仍不稳定，风险点：通知链路可能抖动",
        "二、会议决议",
        "1. 周三先灰度",
        "三、待办事项",
        "1. 小林周二提交清单"
      ].join("\n")
    })]}
  );
  assert.match(html, /ache-meeting-tone-risk/u);
  assert.match(html, /ache-meeting-tone-decision/u);
  assert.match(html, /ache-meeting-tone-todo/u);
  assert.match(html, /ache-meeting-check/u);
  assert.match(html, /ache-meeting-meta/u);
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
  const renderedText = [...html.matchAll(/<div class="ache-text-full(?: [^"]*)?">([\s\S]*?)<\/div>/gu)]
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

test("long-form paragraphs keep natural flow and short quotations become intentional pull quotes", () => {
  const source = [
    "第一段自然往下阅读，不依赖强制拉伸填满页面。",
    "“这是一句需要轻轻停顿的引语。”",
    "第三段紧接着继续，不在引语上下制造巨大空洞。"
  ].join("\n\n");
  const html = renderMonthlyDocument(
    {title: "一本书"},
    {month: "2026-07", episodes: [sampleEpisode({route: "L", text: source})]}
  );
  assert.match(html, /class="ache-longform-pullquote"/u);
  assert.doesNotMatch(
    html,
    /\.ache-text-recipe-longform-balanced-reading\s+\.ache-text-column\s*\{[^}]*justify-content:\s*space-between/gu
  );
  assert.equal(validateRenderedHtmlText(html).status, "PASS");
});

test("longform illustrations rest in the whitespace zone after full-width text", () => {
  const source = [
    "第一段先把事实完整说清楚。",
    "第二段继续沿原来的顺序展开。",
    "第三段在插图之后自然接回正文。"
  ].join("\n\n");
  const html = renderMonthlyDocument(
    {title: "一本书"},
    {month: "2026-07", episodes: [sampleEpisode({
      route: "L",
      text: source,
      pageAssets: [
        {src: "assets/sample/cover.png", alt: "封面", role: "cover-visual"},
        {
          src: "assets/sample/vignette.svg",
          alt: "段间插图",
          role: "explanatory-vignette",
          backgroundMode: "svg-vector",
          detectedFormat: "svg",
          transparencyStatus: "verified-transparent",
          edgeTreatment: "die-cut-transparent",
          intrinsicWidth: 480,
          intrinsicHeight: 360,
          frameContentWidth: 480,
          frameContentHeight: 360,
          frameFitStatus: "matched"
        }
      ]
    })]}
  );
  assert.match(html, /data-supporting-visual-placement="whitespace-zone"/u);
  assert.match(html, /ache-sticker-zone[\s\S]*ache-zone-sticker/u);
  assert.doesNotMatch(html, /ache-route-l[^>]*data-supporting-visual-placement="side-column"/u);
  assert.doesNotMatch(html, /data-supporting-visual-placement="between-paragraphs"/u);
  assert.equal(validateRenderedHtmlText(html).status, "PASS");
});

test("authorized crop reaches CSS cover fitting and carries safe-subject evidence", () => {
  const html = renderMonthlyDocument(
    {title: "一本书"},
    {month: "2026-07", episodes: [sampleEpisode({
      pageAssets: [
        {src: "assets/sample/cover.png", alt: "封面", role: "cover-visual"},
        {
          src: "assets/sample/scene.png",
          alt: "安全背景边缘可裁",
          role: "scene-panel",
          allowCrop: true,
          fitPolicy: "cover-allowed",
          safeSubjectBounds: {left: .2, top: .15, right: .8, bottom: .85},
          intrinsicWidth: 720,
          intrinsicHeight: 420,
          frameContentWidth: 720,
          frameContentHeight: 420,
          frameFitStatus: "matched",
          edgeTreatment: "organic-window"
        }
      ]
    })]}
  );
  assert.match(html, /data-image-fit="cover" data-crop-safe-subject="declared"/u);
  assert.match(html, /img\[data-image-fit="cover"\][^}]*object-fit:cover/u);
  assert.equal(validateRenderedHtmlText(html).status, "PASS");
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
  assert.doesNotMatch(html, /<img\b[^>]*data-image-fit="cover"/u);
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
