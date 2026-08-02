import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  validateEntry
} from "../../scripts/validate-entry.mjs";

const direction = {
  coreObject: "纸页",
  emotionVerb: "展开",
  smallContrast: "一张纸留下一个转折",
  grammar: "environment-transformation"
};

test("P preserves every original photo byte-for-byte", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ache-validate-"));
  const source = path.join(root, "source.png");
  const copy = path.join(root, "copy.png");
  const cover = path.join(root, "cover.png");
  await writeFile(source, "same-bytes");
  await writeFile(copy, "same-bytes");
  await writeFile(cover, "semantic-cover-bytes");
  const coverDirection = {
    coreObject: "圆窗",
    emotionVerb: "偷看",
    smallContrast: "圆窗像月亮",
    grammar: "environment-transformation"
  };
  assert.equal((await validateEntry({
    route: "P",
    source: {images: [source]},
    output: {preservedImages: [copy], coverVisual: cover, coverDirection}
  })).status, "PASS");
  await writeFile(copy, "changed");
  assert.equal((await validateEntry({
    route: "P",
    source: {images: [source]},
    output: {preservedImages: [copy], coverVisual: cover, coverDirection}
  })).status, "FAIL");
  assert.equal((await validateEntry({
    route: "P",
    source: {images: [source]},
    output: {preservedImages: [source], coverVisual: source, coverDirection}
  })).errors.includes("photo-cover-reuses-original"), true);
});

test("K keeps a traceable fact ledger", async () => {
  const source = {
    facts: [
      {id: "f1", text: "权重会随当前处理位置变化。"},
      {id: "f2", text: "不同位置可以得到不同权重。"}
    ]
  };
  const pass = await validateEntry({
    route: "K",
    source,
    output: {
      coverDirection: direction,
      factLedger: [
        {
          sourceFactId: "f1",
          sourceText: source.facts[0].text,
          outputText: "处理位置变化时，权重也会重新分配。"
        },
        {
          sourceFactId: "f2",
          sourceText: source.facts[1].text,
          outputText: "不同位置得到的关注程度并不相同。"
        }
      ]
    }
  });
  assert.equal(pass.status, "PASS");
  assert.equal((await validateEntry({
    route: "K",
    source,
    output: {coverDirection: direction, factLedger: []}
  })).status, "FAIL");
});

test("M preserves structured meeting fields and complete tasks", async () => {
  const meeting = {
    speakers: ["Lin", "Mia"],
    decisions: ["第一周重做旧素材"],
    risks: ["设计资源只有一人"],
    openQuestions: [],
    tasks: [
      {owner: "Lin", due: "2026-08-02", status: "open", text: "给出标题池"}
    ]
  };
  assert.equal((await validateEntry({
    route: "M",
    source: meeting,
    output: {...structuredClone(meeting), coverDirection: direction}
  })).status, "PASS");
  assert.equal((await validateEntry({
    route: "M",
    source: meeting,
    output: {...meeting, coverDirection: direction, tasks: [{text: "给出标题池"}]}
  })).status, "FAIL");
});

test("L preserves exact text, paragraph count and order", async () => {
  const originalText = "第一段。\n\n第二段。";
  const paragraphs = ["第一段。", "第二段。"];
  const pass = await validateEntry({
    route: "L",
    source: {originalText, paragraphs},
    output: {originalText, paragraphs, coverDirection: direction}
  });
  assert.equal(pass.status, "PASS");
  assert.equal(pass.evidence.sourceTextHash, pass.evidence.outputTextHash);
  assert.equal((await validateEntry({
    route: "L",
    source: {originalText, paragraphs},
    output: {originalText: "第一段。第二段。", paragraphs: [...paragraphs].reverse(), coverDirection: direction}
  })).status, "FAIL");
});

test("every route fails final validation without the four-field cover director card", async () => {
  for (const route of ["S", "P", "K", "M", "L"]) {
    const result = await validateEntry({route, source: {}, output: {}});
    for (const field of ["coreObject", "emotionVerb", "smallContrast", "grammar"]) {
      assert.equal(result.errors.includes(`cover-direction-missing:${field}`), true);
    }
  }
});
