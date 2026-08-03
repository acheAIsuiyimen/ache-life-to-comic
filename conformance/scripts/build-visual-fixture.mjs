import {mkdir, rm, writeFile} from "node:fs/promises";
import path from "node:path";

import {
  appendEpisode
} from "../../scripts/monthly-serial.mjs";

const projectRoot = path.resolve(".");
const reviewRoot = path.join(projectRoot, "conformance/review/visual-fixture");
const library = path.join(reviewRoot, "library");
const golden = path.join(
  projectRoot,
  "assets/presets/02-snow-pastel/golden"
);

await rm(reviewRoot, {recursive: true, force: true});
await mkdir(reviewRoot, {recursive: true});

const photo = await appendEpisode(library, {
  bookId: "visual-book",
  bookTitle: "Ache life-to-comic skill 测试月册",
  idempotencyKey: "visual-photo",
  episodeId: "visual-photo",
  title: "雨停以后，窗边留下三件小事",
  text: "照片完整保留，漫画只在照片之外补充当时的空气。",
  route: "P",
  recordedAt: "2026-07-18T18:20:00+08:00",
  pages: [
    {
      path: path.join(golden, "cover-environment-transformation.png"),
      alt: "照片章节封面"
    },
    {
      path: path.join(golden, "photo-page.png"),
      alt: "照片手帐正文"
    }
  ]
});

const knowledge = await appendEpisode(library, {
  bookId: "visual-book",
  bookTitle: "Ache life-to-comic skill 测试月册",
  idempotencyKey: "visual-knowledge",
  episodeId: "visual-knowledge",
  title: "把复杂知识留成一页能重看的笔记",
  text: "正文先讲清楚，解释图只在关系、过程或尺度真正需要时出现。",
  route: "K",
  recordedAt: "2026-07-21T21:10:00+08:00",
  pages: [
    {
      path: path.join(golden, "cover-typography-in-scene.png"),
      alt: "知识章节封面"
    },
    {
      path: path.join(golden, "knowledge-contact-sheet.png"),
      alt: "知识正文样张"
    }
  ]
});

const pending = await appendEpisode(library, {
  bookId: "visual-book",
  bookTitle: "Ache life-to-comic skill 测试月册",
  idempotencyKey: "visual-pending",
  episodeId: "visual-pending",
  title: "先把今天留下，画面以后再补",
  text: "即使当前平台没有生图能力，这段记录也会先进入当月连载，不阻塞下一次续更。",
  route: "S",
  visualStatus: "visual-pending",
  recordedAt: "2026-07-24T23:00:00+08:00"
});

const longform = await appendEpisode(library, {
  bookId: "visual-book",
  bookTitle: "Ache life-to-comic skill 测试月册",
  idempotencyKey: "visual-longform",
  episodeId: "visual-longform",
  title: "长文应该自然往下读",
  text: [
    "第一段先把事情交代清楚。它可以稍长一些，让读者进入现场，但不能为了填满页面把段落强行拉开。这里继续保留原来的阅读顺序，也保留句子之间自然的呼吸。长文真正需要的是稳定的行宽、清楚的段落关系和可以持续往下读的节奏，而不是把每一块文字固定在某个坐标。读者应该先看见完整的背景，再自然进入下一层判断。",
    "“一句值得停一下的话，也不该漂在页面正中央。”",
    "第三段继续往下读。引语与上下文仍然属于同一篇文章，间距只负责轻微停顿，不负责制造两块巨大的空洞。页面如果真的太空，应重新平衡段落或调整分页。编辑留白必须有明确功能，例如切换语气、提示时间变化或让一个关键判断停顿片刻；没有功能的空白不能因为页面已经触底就被当成合格。最后还要在桌面、手机和原尺寸页面里分别测量，保证自然流在不同宽度下都成立。"
  ].join("\n\n"),
  route: "L",
  recordedAt: "2026-07-25T21:00:00+08:00"
});

const report = {
  status: "fixture-ready",
  monthlyIndex: photo.monthlyIndex,
  seriesIndex: photo.seriesIndex,
  episodes: [photo.episodeId, knowledge.episodeId, pending.episodeId, longform.episodeId],
  externalWritesPerformed: false
};
await writeFile(
  path.join(reviewRoot, "fixture-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
