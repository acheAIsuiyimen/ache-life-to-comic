import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  validateEntry
} from "../../scripts/validate-entry.mjs";

test("P preserves every original photo byte-for-byte", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ache-validate-"));
  const source = path.join(root, "source.png");
  const copy = path.join(root, "copy.png");
  await writeFile(source, "same-bytes");
  await writeFile(copy, "same-bytes");
  assert.equal((await validateEntry({
    route: "P",
    source: {images: [source]},
    output: {preservedImages: [copy]}
  })).status, "PASS");
  await writeFile(copy, "changed");
  assert.equal((await validateEntry({
    route: "P",
    source: {images: [source]},
    output: {preservedImages: [copy]}
  })).status, "FAIL");
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
    output: {factLedger: []}
  })).status, "FAIL");
});

test("M preserves structured meeting fields and complete tasks", async () => {
  const meeting = {
    speakers: ["Felix", "Mia"],
    decisions: ["第一周重做旧素材"],
    risks: ["设计资源只有一人"],
    openQuestions: [],
    tasks: [
      {owner: "Felix", due: "2026-08-02", status: "open", text: "给出标题池"}
    ]
  };
  assert.equal((await validateEntry({
    route: "M",
    source: meeting,
    output: structuredClone(meeting)
  })).status, "PASS");
  assert.equal((await validateEntry({
    route: "M",
    source: meeting,
    output: {...meeting, tasks: [{text: "给出标题池"}]}
  })).status, "FAIL");
});

test("L preserves exact text, paragraph count and order", async () => {
  const originalText = "第一段。\n\n第二段。";
  const paragraphs = ["第一段。", "第二段。"];
  const pass = await validateEntry({
    route: "L",
    source: {originalText, paragraphs},
    output: {originalText, paragraphs}
  });
  assert.equal(pass.status, "PASS");
  assert.equal(pass.evidence.sourceTextHash, pass.evidence.outputTextHash);
  assert.equal((await validateEntry({
    route: "L",
    source: {originalText, paragraphs},
    output: {originalText: "第一段。第二段。", paragraphs: [...paragraphs].reverse()}
  })).status, "FAIL");
});
