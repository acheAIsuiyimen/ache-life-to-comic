import test from "node:test";
import assert from "node:assert/strict";
import {readFile, stat} from "node:fs/promises";
import path from "node:path";

import {
  answerOnboarding,
  profileFromOnboarding,
  startOnboarding
} from "../../scripts/onboarding.mjs";
import {
  buildContextPack
} from "../../scripts/context-pack.mjs";
import {
  planLayout,
  validateLayoutPlan
} from "../../scripts/layout-plan.mjs";

const skillRoot = path.resolve(".");

test("onboarding asks exactly one human-sized question at a time", () => {
  let result = startOnboarding();
  assert.equal(result.view.status, "question");
  assert.equal(result.view.progress, "1/4");
  assert.match(result.view.question, /挑一种呼吸感/u);
  assert.equal(result.view.options.length, 6);
  assert.ok(result.view.selector.endsWith("style-selector.png"));
  assert.equal(result.view.selectorRequired, true);

  const expected = [
    ["02-snow-pastel", "2/4", /角色/u],
    ["none", "3/4", /放在哪里/u],
    ["local-html", "4/4", /名字/u]
  ];
  for (const [answer, progress, pattern] of expected) {
    result = answerOnboarding(result.state, answer);
    assert.equal(result.view.progress, progress);
    assert.match(result.view.question, pattern);
  }
  result = answerOnboarding(result.state, "default");
  assert.equal(result.view.status, "complete");
  const profile = profileFromOnboarding(result.state, {bookId: "life"});
  assert.equal(profile.style.id, "02-snow-pastel");
  assert.equal(profile.publication.primary, "local-html");
  assert.equal(profile.designSystemVersion, "ache-design-system/1.1.0");
});

test("onboarding never exposes production jargon in the visible prompts", () => {
  let result = startOnboarding();
  const visible = [];
  for (const answer of ["02-snow-pastel", "none", "local-html", "default"]) {
    visible.push(JSON.stringify(result.view));
    result = answerOnboarding(result.state, answer);
  }
  visible.push(JSON.stringify(result.view));
  assert.doesNotMatch(
    visible.join("\n"),
    /路由|校准稿|确定性排版|UUID|幂等键|视觉调用|Skill/u
  );
});

test("one year of records still produces a bounded context pack", () => {
  const records = Array.from({length: 365}, (_, index) => ({
    id: `day-${index + 1}`,
    title: `第 ${index + 1} 天`,
    summary: "这是一条用于压力测试的短摘要，历史规模不应该增加每次响应负担。",
    tags: ["日常", `month-${Math.floor(index / 30) + 1}`],
    recordedAt: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`
  }));
  const pack = buildContextPack({
    profile: {
      bookId: "year-book",
      title: "一年",
      style: {id: "02-snow-pastel"},
      character: {mode: "none"}
    },
    recentSummaries: records.toReversed(),
    relevantRecords: records,
    pinned: records.slice(0, 30),
    pendingTasks: records.slice(0, 20)
  });
  assert.equal(pack.fullHistoryLoaded, false);
  assert.ok(pack.charCount <= 12000);
  assert.equal(pack.recentSummaries.length, 5);
  assert.equal(pack.relevantRecords.length, 3);
  assert.equal(pack.pinned.length, 20);
  assert.equal(pack.pendingTasks.length, 10);
  assert.ok(pack.omissions.recentSummaries >= 360);
});

test("layout planner hard-locks white ground and known typography roles", () => {
  for (const route of ["S", "P", "K", "M", "L"]) {
    const layout = planLayout({
      route,
      input: route === "P"
        ? {images: ["a", "b", "c"]}
        : route === "S"
          ? {beats: ["a", "b", "c"]}
          : {}
    });
    assert.equal(layout.canvas.background, "#FFFFFF");
    assert.deepEqual(layout.canvas.whiteAreaRatio, [0.7, 0.85]);
    assert.equal(layout.typography.body.handwritingForbidden, true);
    assert.equal(validateLayoutPlan(layout).status, "PASS");
    assert.match(layout.promptConstraints.join(" "), /no beige/u);
  }
});

test("three photos use a top-to-bottom relay, never a triangle", () => {
  const layout = planLayout({
    route: "P",
    input: {images: ["a", "b", "c"]}
  });
  assert.equal(layout.templateId, "B-photo-window-vertical-relay");
  assert.equal(layout.composition.readingDirection, "top-to-bottom");
  assert.equal(layout.composition.triangleStackForbidden, true);
});

test("five preset covers and the single selector board are packaged", async () => {
  const ids = [
    "01-cloud-gouache",
    "02-snow-pastel",
    "03-white-pencil",
    "04-two-color-line",
    "05-ink-watercolor"
  ];
  for (const id of ids) {
    const cover = path.join(skillRoot, "assets/presets", id, "cover.png");
    assert.ok((await stat(cover)).size > 20_000, cover);
    const preset = await readFile(
      path.join(skillRoot, "assets/presets", id, "preset.yaml"),
      "utf8"
    );
    assert.match(preset, /background: "#FFFFFF"/u);
    assert.match(preset, /selector_cover: "cover.png"/u);
  }
  assert.ok((await stat(
    path.join(skillRoot, "assets/presets/style-selector.png")
  )).size > 50_000);
});
