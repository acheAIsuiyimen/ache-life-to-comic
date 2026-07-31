import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, readFile, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {spawnSync} from "node:child_process";

const cli = path.resolve("scripts/cli.mjs");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8"
  });
}

test("CLI initializes one persistent book profile with 02 and 66 大王", async () => {
  const library = await mkdtemp(path.join(os.tmpdir(), "ache-cli-"));
  const result = run([
    "init-book",
    "--library", library,
    "--book-id", "ache-life",
    "--title", "我的漫画人生",
    "--style", "02-snow-pastel",
    "--character", "66-dawang",
    "--target", "local-html"
  ]);
  assert.equal(result.status, 0, result.stderr);
  const profile = JSON.parse(result.stdout).profile;
  assert.equal(profile.style.lifecycle, "validated_preset");
  assert.deepEqual(profile.character, {
    mode: "recurring",
    ids: ["66-dawang"]
  });
  assert.equal(profile.publication.primary, "local-html");
});

test("CLI plans and appends to a monthly volume", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ache-cli-"));
  const library = path.join(root, "library");
  const inputPath = path.join(root, "input.json");
  await writeFile(inputPath, JSON.stringify({
    bookId: "ache-life",
    idempotencyKey: "cli-entry-001",
    episodeId: "cli-entry-001",
    kind: "knowledge",
    title: "预训练是在做什么",
    text: "根据已经出现的内容，继续预测下一个位置。",
    knowledgePoints: ["切分", "预测", "误差"],
    recordedAt: "2026-07-30T12:00:00+08:00"
  }));
  assert.equal(run([
    "init-book",
    "--library", library,
    "--book-id", "ache-life"
  ]).status, 0);
  const plan = run(["plan", "--input", inputPath]);
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).route, "K");
  const append = run(["append", "--library", library, "--input", inputPath]);
  assert.equal(append.status, 0, append.stderr);
  assert.equal(JSON.parse(append.stdout).month, "2026-07");
  const html = await readFile(
    path.join(
      library,
      "books/ache-life/monthly-volumes/2026-07/continuous-edition/index.html"
    ),
    "utf8"
  );
  assert.match(html, /2026年7月/u);
  assert.match(html, /预训练是在做什么/u);
});

test("CLI rejects path-traversal book ids", async () => {
  const library = await mkdtemp(path.join(os.tmpdir(), "ache-cli-"));
  const result = run([
    "init-book",
    "--library", library,
    "--book-id", "../escape"
  ]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /safe file segment/u);
});
