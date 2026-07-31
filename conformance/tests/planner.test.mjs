import test from "node:test";
import assert from "node:assert/strict";

import {
  planEntry,
  resolveCompoundInput
} from "../../dist/codex/ache-life-to-comic/scripts/plan-entry.mjs";

test("every recordable entry receives one stable content-derived cover", () => {
  const input = {
    idempotencyKey: "entry-001",
    kind: "daily",
    text: "风把窗帘吹起来了。"
  };
  const first = planEntry(input);
  const second = planEntry(input);
  assert.equal(first.cover.required, true);
  assert.equal(first.cover.grammar, second.cover.grammar);
  assert.equal(first.totalPageCount, first.bodyPageCount + 1);
  assert.equal(first.designSystemVersion, "ache-design-system/1.0.0");
  assert.equal(first.layout.canvas.background, "#FFFFFF");
});

test("route and density heuristics cover S P K M L", () => {
  const daily = planEntry({
    idempotencyKey: "s",
    kind: "daily",
    beats: ["看见", "停下", "记住"]
  });
  assert.equal(daily.route, "S");
  assert.deepEqual(daily.panelPlan.pages.map((page) => page.panelCount), [3]);
  assert.equal(daily.imageBudget, 2);

  const photo = planEntry({
    idempotencyKey: "p",
    kind: "photo",
    images: ["a", "b", "c"]
  });
  assert.equal(photo.route, "P");
  assert.equal(photo.bodyPageCount, 1);
  assert.equal(photo.preservation.originalPhoto, true);
  assert.equal(photo.layout.templateId, "B-photo-window-vertical-relay");

  const knowledge = planEntry({
    idempotencyKey: "k",
    kind: "knowledge",
    knowledgePoints: ["a", "b", "c", "d"]
  });
  assert.equal(knowledge.route, "K");
  assert.equal(knowledge.bodyPageCount, 2);
  assert.equal(knowledge.imageBudget, 1);
  assert.equal(knowledge.layout.templateId, "C-handwritten-archive");

  const meeting = planEntry({
    idempotencyKey: "m",
    kind: "meeting",
    meetingFields: Array.from({length: 9}, (_, index) => `f-${index}`)
  });
  assert.equal(meeting.route, "M");
  assert.equal(meeting.bodyPageCount, 2);
  assert.equal(meeting.imageBudget, 1);

  const longform = planEntry({
    idempotencyKey: "l",
    kind: "longform",
    preserveOriginal: true,
    text: "原文"
  });
  assert.equal(longform.route, "L");
  assert.equal(longform.requiresLayoutMeasure, true);
  assert.equal(longform.preservation.exactOriginalText, true);
  assert.equal(longform.panelPlan, null);
});

test("compound inputs merge only by explicit relation key", () => {
  const result = resolveCompoundInput([
    {sourceUnitId: "post", relationKey: "same-day"},
    {sourceUnitId: "knowledge", relationKey: "same-day"},
    {sourceUnitId: "meeting"}
  ]);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].sourceUnitIds, ["post", "knowledge"]);
  assert.deepEqual(result[1].sourceUnitIds, ["meeting"]);
});

test("02 is default and candidate choice stays book-local", () => {
  assert.deepEqual(planEntry({
    idempotencyKey: "default",
    kind: "daily"
  }).style, {
    id: "02-snow-pastel",
    lifecycle: "validated_preset"
  });
  assert.deepEqual(planEntry({
    idempotencyKey: "candidate",
    kind: "daily"
  }, {
    style: {id: "03-white-pencil", lifecycle: "optional_candidate"}
  }).style, {
    id: "03-white-pencil",
    lifecycle: "optional_candidate"
  });
});

test("S panel plan deterministically balances zero to eight beats", () => {
  const expected = new Map([
    [0, [1]],
    [1, [1]],
    [2, [2]],
    [3, [3]],
    [4, [2, 2]],
    [5, [2, 3]],
    [6, [3, 3]],
    [7, [2, 2, 3]],
    [8, [2, 3, 3]]
  ]);
  for (const [count, panelCounts] of expected) {
    const plan = planEntry({
      idempotencyKey: `s-${count}`,
      kind: "daily",
      text: count === 0 ? "只留下一个瞬间。" : "",
      beats: Array.from({length: count}, (_, index) => ({
        id: `source-${index + 1}`,
        text: `节拍 ${index + 1}`
      }))
    });
    assert.deepEqual(
      plan.panelPlan.pages.map((page) => page.panelCount),
      panelCounts
    );
    assert.equal(plan.bodyPageCount, panelCounts.length);
    assert.equal(plan.panelPlan.readingDirection, "top-to-bottom");
    assert.equal(
      plan.panelPlan.generationStrategy,
      "one-composite-visual-per-body-page"
    );
  }
});

test("S panel plan preserves source beat order without multiplying image calls", () => {
  const plan = planEntry({
    idempotencyKey: "s-order",
    kind: "daily",
    beats: [
      {id: "open", text: "门打开"},
      {id: "arrive", text: "到楼下"},
      {id: "rain", text: "雨变轻"}
    ]
  });
  assert.deepEqual(plan.panelPlan.pages[0].sourceBeatIds, [
    "open",
    "arrive",
    "rain"
  ]);
  assert.equal(plan.panelPlan.totalPanels, 3);
  assert.equal(plan.imageBudget, 2);
});

test("S panel plan rejects overlong or impossible page requests", () => {
  assert.throws(() => planEntry({
    idempotencyKey: "s-nine",
    kind: "daily",
    beats: Array.from({length: 9}, (_, index) => `节拍 ${index + 1}`)
  }), /at most 8/);

  assert.throws(() => planEntry({
    idempotencyKey: "s-empty-two-pages",
    kind: "daily",
    text: "一个瞬间",
    requestedBodyPages: 2
  }), /between 1 and 1/);
});
