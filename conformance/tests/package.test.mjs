import test from "node:test";
import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";
import path from "node:path";

const skillRoot = path.resolve(".");
const skillDirectories = ["agents", "assets", "references", "scripts"];

async function skillFiles() {
  const files = [path.join(skillRoot, "SKILL.md")];
  for (const directory of skillDirectories) {
    files.push(...await walk(path.join(skillRoot, directory)));
  }
  return files;
}

async function walk(directory) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

test("SKILL frontmatter is minimal and body stays under 500 lines", async () => {
  const text = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const lines = text.split(/\r?\n/u);
  assert.ok(lines.length < 500);
  const end = lines.indexOf("---", 1);
  const keys = lines.slice(1, end)
    .filter((line) => line.includes(":"))
    .map((line) => line.split(":")[0]);
  assert.deepEqual(keys, ["name", "description"]);
  assert.match(text, /name: ache-life-to-comic-skill/u);
});

test("all first-level references named by SKILL exist", async () => {
  const text = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const references = [...text.matchAll(/`(references\/[^`]+\.md)`/gu)]
    .map((match) => match[1]);
  assert.ok(references.length >= 10);
  for (const reference of references) {
    await readFile(path.join(skillRoot, reference), "utf8");
    assert.equal(reference.split("/").length, 2);
  }
});

test("package has five presets, with only 02 marked validated", async () => {
  const catalog = JSON.parse(await readFile(
    path.join(skillRoot, "assets/presets/style-catalog.json"),
    "utf8"
  ));
  assert.equal(catalog.routes.length, 5);
  assert.deepEqual(catalog.meta.active_routes, [
    "01-cloud-gouache",
    "02-snow-pastel",
    "03-white-pencil",
    "04-two-color-line",
    "05-ink-watercolor"
  ]);
  assert.equal(
    catalog.meta.runtime_lifecycle["02-snow-pastel"],
    "validated_preset"
  );
  assert.equal(
    Object.values(catalog.meta.runtime_lifecycle)
      .filter((value) => value === "validated_preset").length,
    1
  );
  for (const id of catalog.meta.active_routes) {
    await readFile(
      path.join(skillRoot, "assets/presets", id, "preset.yaml"),
      "utf8"
    );
  }
});

test("canonical design baseline is versioned and referenced by the skill", async () => {
  const skill = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const baseline = JSON.parse(await readFile(
    path.join(skillRoot, "assets/layout-system/design-baseline.json"),
    "utf8"
  ));
  assert.equal(baseline.schemaVersion, "ache-design-system/1.4.0");
  assert.equal(baseline.canvas.background, "#FFFFFF");
  assert.deepEqual(baseline.canvas.whiteAreaRatio, [0.7, 0.85]);
  assert.equal(baseline.typography.body.handwritingForbidden, true);
  assert.match(skill, /references\/design-system\.md/u);
  assert.match(skill, /references\/interaction-voice\.md/u);
  assert.equal(baseline.implementation.freehandPlatformHtmlForbidden, true);
});

test("skill contains no specific image provider or secret-bearing file", async () => {
  const files = await skillFiles();
  const textFiles = files.filter((file) => /\.(md|mjs|json|ya?ml)$/iu.test(file));
  const forbiddenProviders = [
    "midjourney",
    "ideogram",
    "stability ai"
  ];
  for (const file of textFiles) {
    const text = (await readFile(file, "utf8")).toLowerCase();
    for (const provider of forbiddenProviders) {
      assert.equal(text.includes(provider), false, `${provider} found in ${file}`);
    }
    assert.doesNotMatch(text, /(api[_-]?key|secret|private[_-]?key)\s*[:=]\s*\S+/iu);
  }
  assert.equal(files.some((file) => /(^|\/)\.env($|\.)/u.test(file)), false);
});

test("openai interface metadata names the skill in the default prompt", async () => {
  const text = await readFile(path.join(skillRoot, "agents/openai.yaml"), "utf8");
  assert.match(text, /display_name: "Ache life-to-comic skill"/u);
  assert.match(text, /\$ache-life-to-comic-skill/u);
});

test("no README or installation guide is embedded in the skill package", async () => {
  const names = (await skillFiles()).map((file) => path.basename(file).toLowerCase());
  assert.equal(names.includes("readme.md"), false);
  assert.equal(names.includes("install.md"), false);
  assert.equal(names.includes("changelog.md"), false);
});
