import test from "node:test";
import assert from "node:assert/strict";

import {
  aspectClass,
  normalizeAsset,
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

test("intrinsic aspect classes drive recipe selection", () => {
  assert.equal(aspectClass(1080, 1440), "portrait-soft");
  assert.equal(aspectClass(1600, 900), "landscape-wide");
  assert.equal(aspectClass(1000, 1000), "square");
});
