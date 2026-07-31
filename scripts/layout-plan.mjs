import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

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

function bodyTemplate(route, input) {
  if (route === "P") return photoTemplate(input.images?.length ?? 0);
  if (["K", "M", "L"].includes(route)) return "C-handwritten-archive";
  if ((input.beats?.length ?? 0) >= 2) return "E-continuous-action";
  return "A-white-object-theatre";
}

export function planLayout({route, input = {}, previousTemplates = []}) {
  const templateId = bodyTemplate(route, input);
  const previousTwo = previousTemplates.slice(-2);
  const requiresVariant = previousTwo.length === 2 &&
    previousTwo.every((value) => value === templateId);
  return {
    schemaVersion: "ache-layout-plan/1.0.0",
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
    zones: BASELINE.pageZones,
    composition: {
      oneVisualSurprise: true,
      readingDirection: "top-to-bottom",
      triangleStackForbidden: true,
      generatedImageText: "forbidden",
      materialGroupCountMax: 2
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
      rejectWarmGround: true
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
  return {
    status: failures.length === 0 ? "PASS" : "FAIL",
    failures
  };
}
