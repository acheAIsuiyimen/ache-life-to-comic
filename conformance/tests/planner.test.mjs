import test from "node:test";
import assert from "node:assert/strict";

import {
  planEntry,
  resolveCompoundInput
} from "../../scripts/plan-entry.mjs";

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
  assert.equal(first.designSystemVersion, "ache-design-system/1.4.1");
  assert.equal(first.layout.canvas.background, "#FFFFFF");
  assert.equal(first.compositionPlan.lockedBeforeVisualGeneration, true);
  assert.deepEqual(first.compositionPlan.targetFillRange, [0.62, 0.88]);
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
  assert.equal(daily.routeContract.preservation, "source-beat-order");

  const photo = planEntry({
    idempotencyKey: "p",
    kind: "photo",
    images: ["a", "b", "c"],
    coverSemantics: {
      coreObject: "圆窗",
      emotionVerb: "偷看",
      smallContrast: "圆窗像月亮",
      grammar: "environment-transformation"
    }
  });
  assert.equal(photo.route, "P");
  assert.equal(photo.bodyPageCount, 1);
  assert.equal(photo.preservation.originalPhoto, true);
  assert.equal(photo.layout.templateId, "B-photo-window-vertical-relay");
  assert.equal(photo.visualLayout, "auto");
  assert.equal(photo.cover.photoSemanticCoverRequired, true);
  assert.equal(photo.cover.photoRestyleForbidden, true);
  assert.equal(photo.cover.semantics.coreObject, "圆窗");
  assert.equal(photo.routeContract.coverSource, "semantic-recomposition-from-visible-evidence");
  assert.deepEqual(photo.compositionPlan.contentDuties, ["independent-semantic-cover", "byte-identical-original-photos", "nearby-captions"]);

  const knowledge = planEntry({
    idempotencyKey: "k",
    kind: "knowledge",
    knowledgePoints: ["a", "b", "c", "d"]
  });
  assert.equal(knowledge.route, "K");
  assert.equal(knowledge.bodyPageCount, 2);
  assert.equal(knowledge.imageBudget, 1);
  assert.equal(knowledge.layout.templateId, "C-handwritten-archive");
  assert.equal(knowledge.routeContract.imagePolicy, "one-visual-breathing-point-per-one-to-three-pages");
  assert.equal(knowledge.compositionPlan.genericBlogOrCardLayoutForbidden, true);

  const meeting = planEntry({
    idempotencyKey: "m",
    kind: "meeting",
    meetingFields: Array.from({length: 9}, (_, index) => `f-${index}`)
  });
  assert.equal(meeting.route, "M");
  assert.equal(meeting.bodyPageCount, 2);
  assert.equal(meeting.imageBudget, 1);
  assert.equal(meeting.routeContract.bodyMode, "structured-notes-with-light-illustration");
  assert.match(meeting.compositionPlan.recipe, /handwritten|meeting/u);

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
  assert.equal(longform.routeContract.preservation, "exact-text-paragraphs-and-order");
  assert.equal(longform.compositionPlan.recipe, "longform-balanced-reading");
});

test("all five routes expose the same mandatory cover director card", () => {
  for (const route of ["S", "P", "K", "M", "L"]) {
    const coverDirection = {
      coreObject: `${route}-object`,
      emotionVerb: `${route}-verb`,
      smallContrast: `${route}-contrast`,
      grammar: "environment-transformation"
    };
    const plan = planEntry({
      idempotencyKey: `director-${route}`,
      route,
      coverDirection,
      images: route === "P" ? ["photo.jpg"] : [],
      knowledgePoints: route === "K" ? ["fact"] : [],
      meetingFields: route === "M" ? ["decision"] : [],
      preserveOriginal: route === "L"
    });
    assert.deepEqual(plan.cover.requiredSemanticFields, [
      "coreObject",
      "emotionVerb",
      "smallContrast",
      "grammar"
    ]);
    assert.deepEqual(plan.cover.semantics, coverDirection);
    assert.ok(plan.routeContract);
  }
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
      "isolated-cells-or-independent-assets"
    );
  }
});

test("cover grammar never repeats the immediately previous grammar", () => {
  const first = planEntry({idempotencyKey: "cover-sequence", kind: "daily"});
  const second = planEntry(
    {idempotencyKey: "cover-sequence", kind: "daily"},
    {recentCoverGrammars: [first.cover.grammar]}
  );
  assert.notEqual(first.cover.grammar, second.cover.grammar);
  assert.equal(second.cover.targetAspectRatio, "3:4");
  assert.equal(second.cover.independentAssetRequired, true);
  assert.equal(second.generationBudget.aestheticRecoveryCallsMax, 2);
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
