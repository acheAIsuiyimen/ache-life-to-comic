import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  aspectClass,
  inspectImageAsset,
  normalizeAsset,
  readImageSize,
  validateAssetContract
} from "../../scripts/asset-contract.mjs";

test("cover and original-photo contracts protect complete independent visuals", () => {
  const cover = normalizeAsset({
    role: "cover-visual",
    intrinsicWidth: 1080,
    intrinsicHeight: 1440
  });
  assert.deepEqual(validateAssetContract(cover), []);
  assert.equal(cover.independent, true);
  assert.equal(cover.fitPolicy, "contain-complete");

  const photo = normalizeAsset({role: "body-photo", allowCrop: true});
  assert.equal(photo.allowCrop, false);
});

test("arbitrary crops and unsafe sheet cells are blocked before layout", () => {
  assert.ok(validateAssetContract({
    role: "body-visual",
    generationMode: "fraction-crop"
  }).includes("arbitrary-fraction-crop-forbidden"));
  assert.ok(validateAssetContract({
    role: "scene-panel",
    generationMode: "sheet-crop"
  }).includes("sheet-crop-not-isolated"));
});

test("supporting illustrations are whole independent components, never sheet crops", () => {
  const component = normalizeAsset({
    role: "explanatory-vignette",
    intrinsicWidth: 1080,
    intrinsicHeight: 1440,
    backgroundMode: "transparent-raster",
    detectedFormat: "png",
    transparencyStatus: "verified-transparent"
  });
  assert.equal(component.independent, true);
  assert.equal(component.generationMode, "independent");
  assert.deepEqual(validateAssetContract(component), []);

  const croppedComponent = normalizeAsset({
    role: "explanatory-vignette",
    generationMode: "sheet-crop",
    sheetLayout: "isolated-cells",
    cellBounds: {left: 20, top: 20, width: 400, height: 300},
    safeGutter: 80,
    independent: false
  });
  const failures = validateAssetContract(croppedComponent);
  assert.ok(failures.includes("supporting-component-not-independent"));
  assert.ok(failures.includes("supporting-component-crop-forbidden"));
  assert.ok(failures.includes("supporting-component-background-not-transparent"));
});

test("frames are derived from the image ratio instead of acting as generic boxes", () => {
  const matched = normalizeAsset({
    role: "scene-panel",
    intrinsicWidth: 720,
    intrinsicHeight: 420,
    targetWidth: 720,
    targetHeight: 420,
    frameContentWidth: 720,
    frameContentHeight: 420,
    edgeTreatment: "paper-mat"
  });
  assert.equal(matched.frameFitStatus, "matched");
  assert.deepEqual(validateAssetContract(matched), []);

  const hardPasted = normalizeAsset({
    role: "scene-panel",
    intrinsicWidth: 720,
    intrinsicHeight: 420,
    frameContentWidth: 500,
    frameContentHeight: 700,
    edgeTreatment: "paper-mat"
  });
  assert.equal(hardPasted.frameFitStatus, "mismatch");
  assert.ok(validateAssetContract(hardPasted).includes("frame-image-ratio-mismatch"));
});

test("irregular windows protect originals and require a declared safe subject", () => {
  const original = normalizeAsset({
    role: "body-photo",
    intrinsicWidth: 1200,
    intrinsicHeight: 800,
    edgeTreatment: "organic-window"
  });
  assert.ok(validateAssetContract(original).includes("original-photo-mask-forbidden"));

  const unsafeGenerated = normalizeAsset({
    role: "scene-panel",
    intrinsicWidth: 720,
    intrinsicHeight: 420,
    edgeTreatment: "organic-window"
  });
  assert.ok(validateAssetContract(unsafeGenerated).includes("irregular-window-safe-subject-missing"));

  const safeGenerated = normalizeAsset({
    role: "scene-panel",
    intrinsicWidth: 720,
    intrinsicHeight: 420,
    edgeTreatment: "organic-window",
    safeSubjectBounds: {left: 0.08, top: 0.08, right: 0.92, bottom: 0.92}
  });
  assert.deepEqual(validateAssetContract(safeGenerated), []);
});

test("intrinsic aspect classes drive recipe selection", () => {
  assert.equal(aspectClass(1080, 1440), "portrait-soft");
  assert.equal(aspectClass(1600, 900), "landscape-wide");
  assert.equal(aspectClass(1000, 1000), "square");
});

test("transparent SVG components expose deterministic intrinsic geometry", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ache-svg-size-"));
  const file = path.join(directory, "vignette.svg");
  await writeFile(file, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360"><path d="M0 0h1v1z"/></svg>');
  assert.deepEqual(await readImageSize(file), {width: 480, height: 360});
  assert.equal((await inspectImageAsset(file)).transparencyStatus, "verified-transparent");
});

test("declared SVG transparency cannot hide an actual full-canvas background", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ache-svg-background-"));
  const file = path.join(directory, "opaque.svg");
  await writeFile(file, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360"><rect width="480" height="360" fill="#fff"/><path d="M0 0h1v1z"/></svg>');
  const inspected = await inspectImageAsset(file);
  const component = normalizeAsset({
    role: "explanatory-vignette",
    backgroundMode: "svg-vector",
    detectedFormat: inspected.format,
    transparencyStatus: inspected.transparencyStatus
  }, inspected);
  assert.equal(inspected.transparencyStatus, "opaque");
  assert.ok(validateAssetContract(component).includes("supporting-component-actual-background-opaque"));
});

test("crop opt-in requires safe subject bounds", () => {
  const unsafe = normalizeAsset({
    role: "scene-panel",
    intrinsicWidth: 720,
    intrinsicHeight: 420,
    allowCrop: true
  });
  assert.ok(validateAssetContract(unsafe).includes("crop-safe-subject-missing"));
});
