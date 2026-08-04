import test from "node:test";
import assert from "node:assert/strict";

import {resolveThemePalette, themeStyleAttribute} from "../../scripts/theme-system.mjs";
import {planLayout} from "../../scripts/layout-plan.mjs";

test("style presets keep white paper but do not collapse into one blue palette", () => {
  const snow = resolveThemePalette({styleId: "02-snow-pastel"});
  const pencil = resolveThemePalette({styleId: "03-white-pencil"});
  assert.equal(snow.colors.paper, "#FFFFFF");
  assert.equal(pencil.colors.paper, "#FFFFFF");
  assert.notEqual(snow.colors.primary, pencil.colors.primary);
});

test("a chapter theme can use purple without changing the white page ground", () => {
  const layout = planLayout({
    route: "S",
    input: {
      styleId: "custom-pixel",
      paletteSource: "reference",
      palette: {
        ink: "#1B2040",
        soft: "#665F8B",
        primary: "#6D5DDF",
        pale: "#E8E4FF",
        accent: "#E04FA3"
      },
      beats: ["周一提前到站"]
    }
  });
  assert.equal(layout.canvas.background, "#FFFFFF");
  assert.equal(layout.theme.colors.primary, "#6D5DDF");
  assert.equal(layout.theme.source, "reference");
  assert.match(themeStyleAttribute(layout.theme), /--ache-ice:#6D5DDF/u);
});

test("generation targets follow the planned panel and supporting-component geometry", () => {
  const daily = planLayout({route: "S", input: {beats: ["一", "二", "三"]}});
  assert.deepEqual(daily.imageGeometry.generationTargets.map(({width, height}) => [width, height]), [
    [720, 330], [720, 285], [720, 285]
  ]);
  const knowledge = planLayout({route: "K", input: {}});
  assert.equal(knowledge.imageGeometry.generationTargets[0].backgroundMode, "transparent-raster-or-svg");
});
