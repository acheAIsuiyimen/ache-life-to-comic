import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolveThemePalette} from "./theme-system.mjs";

const baselinePath = fileURLToPath(new URL(
  "../assets/layout-system/design-baseline.json",
  import.meta.url
));
const BASELINE = JSON.parse(readFileSync(baselinePath, "utf8"));

function photoTemplate(count) {
  if (count <= 0) return null;
  if (count === 1) return "B-photo-window";
  if (count === 2) return "B-photo-window-main-plus-echo";
  if (count === 3) return "B-photo-window-vertical-relay";
  if (count <= 5) return "B-photo-window-main-plus-evidence-strip";
  if (count <= 9) return "B-photo-window-multi-page";
  return "group-before-layout";
}

function imageAspect(value) {
  if (!value || typeof value === "string") return "unknown";
  if (value.aspectClass) return value.aspectClass;
  const width = Number(value.width ?? value.intrinsicWidth ?? 0);
  const height = Number(value.height ?? value.intrinsicHeight ?? 0);
  if (!width || !height) return "unknown";
  const ratio = width / height;
  if (ratio < .9) return "portrait";
  if (ratio <= 1.12) return "square";
  if (ratio <= 1.62) return "landscape";
  return "landscape-wide";
}

function bodyTemplate(route, input) {
  if (route === "P") return photoTemplate(input.images?.length ?? 0);
  if (["K", "M", "L"].includes(route)) return "C-handwritten-archive";
  if ((input.beats?.length ?? 0) >= 2) return "E-continuous-action";
  return "A-white-object-theatre";
}

function visualTargets(route, input) {
  if (route === "P") return [];
  if (["K", "M", "L"].includes(route)) {
    return [{role: "explanatory-vignette", width: 480, height: 480, backgroundMode: "transparent-raster-or-svg"}];
  }
  const panelCount = Math.min(3, Math.max(1, input.imageCount ?? input.beats?.length ?? input.images?.length ?? 1));
  const sizes = panelCount === 1
    ? [[720, 760]]
    : panelCount === 2
      ? [[720, 420], [720, 340]]
      : [[720, 330], [720, 285], [720, 285]];
  return sizes.map(([width, height], index) => ({
    role: "scene-panel",
    panel: index + 1,
    width,
    height,
    backgroundMode: "opaque-or-transparent",
    edgeTreatment: "flush-or-matched-paper-frame"
  }));
}

export function planLayout({route, input = {}, previousTemplates = []}) {
  const templateId = bodyTemplate(route, input);
  const previousTwo = previousTemplates.slice(-2);
  const requiresVariant = previousTwo.length === 2 &&
    previousTwo.every((value) => value === templateId);
  const theme = resolveThemePalette({
    styleId: input.styleId ?? input.style?.id ?? "02-snow-pastel",
    palette: input.palette ?? null,
    source: input.paletteSource ?? null
  });
  return {
    schemaVersion: "ache-layout-plan/1.1.0",
    designSystemVersion: BASELINE.schemaVersion,
    templateId,
    variantPolicy: requiresVariant
      ? "move-main-visual-or-switch-compatible-template"
      : "standard",
    canvas: {
      ...BASELINE.canvas,
      background: "#FFFFFF"
    },
    typography: BASELINE.typography,
    theme,
    zones: BASELINE.pageZones,
    composition: {
      oneVisualSurprise: true,
      readingDirection: "top-to-bottom",
      triangleStackForbidden: true,
      generatedImageText: "forbidden",
      materialGroupCountMax: 2
    },
    imageGeometry: {
      aspectClasses: (input.images ?? []).map(imageAspect),
      preserveCompleteFrame: route === "P",
      selectRecipeFromIntrinsicRatio: true,
      arbitraryFractionCropForbidden: true,
      isolatedSheetCellsRequireSafeGutter: true,
      generationTargets: visualTargets(route, input),
      frameContentMustMatchImageRatioWithin: 0.025,
      framePaddingRatioMaximum: 0.07,
      irregularEdgesRequireSafeSubjectArea: true,
      supportingComponentsRequireTransparentRasterOrSvg: true
    },
    promptConstraints: [
      "dominant crisp pure white #FFFFFF page ground",
      "white page area must occupy 70 to 85 percent",
      "paper texture is subtle 2 to 6 percent opacity",
      "no beige, kraft, parchment, cream, ivory or warm yellow full-page ground",
      "no readable text inside generated images"
    ],
    validation: {
      requiredViewports: BASELINE.quality.requiredViewports,
      forbiddenLooks: BASELINE.quality.forbiddenLooks,
      rejectWarmGround: true,
      measuredDensityBands: 4,
      activeCompositionRatioMin: .75,
      correctionLadder: ["nudge", "local-compaction", "rhythm-adjustment", "switch-recipe-or-paginate"],
      shrinkBodyTextFirst: false
    }
  };
}

export function validateLayoutPlan(plan) {
  const failures = [];
  if (plan.canvas?.background !== "#FFFFFF") failures.push("background-not-white");
  if (plan.typography?.body?.handwritingForbidden !== true) {
    failures.push("body-handwriting-not-forbidden");
  }
  if (plan.composition?.triangleStackForbidden !== true) {
    failures.push("triangle-stack-not-forbidden");
  }
  if (!plan.designSystemVersion) failures.push("missing-design-system-version");
  if (plan.theme?.colors?.paper !== "#FFFFFF") failures.push("theme-paper-not-white");
  if (plan.imageGeometry?.frameContentMustMatchImageRatioWithin !== 0.025) {
    failures.push("frame-ratio-contract-missing");
  }
  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    failures
  };
}
