import {createHash} from "node:crypto";
import {planLayout} from "./layout-plan.mjs";
import {planTextComposition} from "./page-renderer.mjs";

const ROUTE_BY_KIND = {
  daily: "S",
  idea: "S",
  reflection: "S",
  photo: "P",
  knowledge: "K",
  reading: "K",
  meeting: "M",
  longform: "L"
};

const ROUTE_CONTRACTS = {
  S: {
    coverSource: "one-real-moment-or-emotion",
    bodyMode: "one-to-three-top-to-bottom-comic-panels",
    imagePolicy: "isolated-cells-or-independent-assets-only",
    preservation: "source-beat-order"
  },
  P: {
    coverSource: "semantic-recomposition-from-visible-evidence",
    bodyMode: "complete-original-photos-in-journal-layout",
    imagePolicy: "independent-cover-plus-byte-identical-originals",
    preservation: "original-photo-bytes-and-complete-visible-frame"
  },
  K: {
    coverSource: "one-core-process-or-relation",
    bodyMode: "readable-text-with-sparse-explanatory-visual",
    imagePolicy: "one-visual-breathing-point-per-one-to-three-pages",
    preservation: "facts-and-source-traceability"
  },
  M: {
    coverSource: "meeting-topic-decision-tension-or-next-action",
    bodyMode: "structured-notes-with-light-illustration",
    imagePolicy: "no-panel-count-derived-from-field-count",
    preservation: "speakers-decisions-risks-open-questions-and-tasks"
  },
  L: {
    coverSource: "single-metaphor-from-the-whole-text",
    bodyMode: "exact-longform-reading-with-margin-illustration",
    imagePolicy: "at-most-one-light-visual-per-one-to-three-pages",
    preservation: "exact-text-paragraphs-and-order"
  }
};

function countText(text = "") {
  return Array.from(String(text).trim()).length;
}

function coverGrammar(idempotencyKey = "", recent = []) {
  const digest = createHash("sha256").update(idempotencyKey).digest();
  const initial = digest[0] % 2 === 0
    ? "environment-transformation"
    : "typography-in-scene";
  const previous = recent.at(-1);
  if (previous !== initial) return initial;
  return initial === "environment-transformation"
    ? "typography-in-scene"
    : "environment-transformation";
}

function routeFor(input) {
  if (input.route) return input.route;
  if (input.preserveOriginal === true) return "L";
  if ((input.meetingFields?.length ?? 0) > 0) return "M";
  if ((input.knowledgePoints?.length ?? 0) > 0) return "K";
  if ((input.images?.length ?? 0) > 0) return "P";
  return ROUTE_BY_KIND[input.kind] ?? "S";
}

function beatIds(input) {
  const beats = Array.isArray(input.beats) ? input.beats : [];
  if (beats.length > 8) {
    throw new Error("S route supports at most 8 normalized beats");
  }
  return beats.map((beat, index) => {
    if (beat && typeof beat === "object" && beat.id) return String(beat.id);
    return `beat-${String(index + 1).padStart(2, "0")}`;
  });
}

function validateRequestedSPageCount(requested, beatCount) {
  const minimum = Math.max(1, Math.ceil(beatCount / 3));
  const maximum = Math.max(1, beatCount);
  if (requested < minimum || requested > maximum) {
    throw new Error(
      `requestedBodyPages for S must be between ${minimum} and ${maximum}`
    );
  }
}

function bodyPages(input, route) {
  if (Number.isInteger(input.requestedBodyPages) && input.requestedBodyPages > 0) {
    if (route === "S") {
      const count = beatIds(input).length;
      validateRequestedSPageCount(input.requestedBodyPages, count);
    }
    return input.requestedBodyPages;
  }
  if (route === "P") {
    const count = input.images?.length ?? 0;
    if (count <= 4) return 1;
    if (count <= 8) return 2;
    return 3;
  }
  if (route === "K") {
    if (String(input.text ?? "").trim()) {
      return planTextComposition(input.text, route, input.bodyVisualCount > 0 ? [{}] : []).pageCount;
    }
    const points = input.knowledgePoints?.length ?? 0;
    if (points <= 3) return 1;
    if (points <= 8) return 2;
    return 3;
  }
  if (route === "M") {
    if (String(input.text ?? "").trim()) {
      return planTextComposition(input.text, route, input.bodyVisualCount > 0 ? [{}] : []).pageCount;
    }
    const fields = input.meetingFields?.length ?? 0;
    if (fields <= 8) return 1;
    if (fields <= 18) return 2;
    return 3;
  }
  if (route === "L") {
    if (String(input.text ?? "").trim()) return planTextComposition(input.text, route, []).pageCount;
    return 1;
  }

  const count = beatIds(input).length;
  return Math.max(1, Math.ceil(count / 3));
}

function compositionPlan(input, route, bodyPageCount, panelPlanValue, layout) {
  const shared = {
    lockedBeforeVisualGeneration: true,
    bodyPageCount,
    targetFillRange: [0.62, 0.88],
    bottomDeadZoneMaximum: 0.25,
    whiteBackgroundRequired: true,
    journalReadingFlowRequired: true,
    genericBlogOrCardLayoutForbidden: true
  };
  if (route === "S") return {
    ...shared,
    recipe: panelPlanValue?.pages?.some((page) => page.panelCount > 1) ? "top-to-bottom-comic-beats" : "single-moment-object-theatre",
    contentDuties: ["real-beats", "state-or-camera-change", "source-order"],
    visualDuties: ["complete-subjects", "unequal-editorial-panels", "one-main-surprise"]
  };
  if (route === "P") return {
    ...shared,
    recipe: layout.templateId,
    contentDuties: ["independent-semantic-cover", "byte-identical-original-photos", "nearby-captions"],
    visualDuties: ["complete-photo-frame", "journal-paper-window", "top-to-bottom-reading"]
  };
  const textPlan = String(input.text ?? "").trim()
    ? planTextComposition(input.text, route, input.bodyVisualCount > 0 ? [{}] : [])
    : null;
  return {
    ...shared,
    recipe: textPlan?.recipe ?? layout.templateId,
    semanticPlan: textPlan?.knowledge ?? null,
    contentDuties: route === "K"
      ? ["context", "complete-relation-or-sequence", "facts", "user-reflection"]
      : route === "M"
        ? ["context-and-agenda", "discussion", "decision-and-risk", "actions-and-next-meeting"]
        : ["exact-original-text", "paragraph-order", "balanced-natural-breaks"],
    visualDuties: route === "K"
      ? ["text-first", "one-independent-explanatory-breathing-point"]
      : route === "M"
        ? ["editorial-ledger-not-ui-cards", "zero-or-one-independent-vignette"]
        : ["long-reading-rhythm", "zero-or-one-margin-vignette-per-one-to-three-pages"]
  };
}

function balancedPanelCounts(beatCount, pageCount) {
  if (beatCount === 0) return [1];
  const base = Math.floor(beatCount / pageCount);
  const remainder = beatCount % pageCount;
  return Array.from({length: pageCount}, (_, index) => {
    const receivesExtra = index >= pageCount - remainder;
    return base + (receivesExtra ? 1 : 0);
  });
}

function panelPurpose(panelCount) {
  if (panelCount === 1) return "single-moment";
  if (panelCount === 2) return "before-after";
  return "start-change-after";
}

function panelPlan(input, route, bodyPageCount) {
  if (route !== "S") return null;
  const ids = beatIds(input);
  const counts = balancedPanelCounts(ids.length, bodyPageCount);
  let cursor = 0;
  const pages = counts.map((panelCount, index) => {
    const sourceBeatIds = ids.slice(cursor, cursor + panelCount);
    const sourceBeatIndexes = sourceBeatIds.map((_, localIndex) => cursor + localIndex);
    cursor += panelCount;
    return {
      bodyPageNumber: index + 1,
      panelCount,
      sourceBeatIndexes,
      sourceBeatIds,
      purpose: ids.length === 0 ? "single-moment-from-text" : panelPurpose(panelCount)
    };
  });
  return {
    readingDirection: "top-to-bottom",
    layout: "unequal-editorial",
    generationStrategy: "isolated-cells-or-independent-assets",
    totalPanels: counts.reduce((sum, count) => sum + count, 0),
    pages,
    constraints: [
      "same-event-continuity",
      "preserve-beat-order",
      "no-triangle-stack",
      "no-unrelated-illustrations",
      "vary-camera-or-state"
      ,"complete-subject-inside-each-cell"
      ,"safe-gutter-between-cells"
      ,"arbitrary-fraction-crop-forbidden"
    ]
  };
}

function imageBudget(route, bodyPageCount) {
  if (route === "S") return Math.min(3, 1 + bodyPageCount);
  return 1;
}

function generationBudget(route, bodyPageCount) {
  const base = imageBudget(route, bodyPageCount);
  return {
    baseCalls: base,
    aestheticRecoveryCallsMax: 2,
    recoveryReasons: [
      "subject-integrity-failure",
      "cover-semantic-mismatch",
      "layout-density-failure",
      "character-anchor-drift"
    ]
  };
}

function visualLayout(route, input) {
  const count = route === "P"
    ? (input.images?.length ?? 0)
    : (input.beats?.length ?? 0);
  if (route === "S") return count === 2 ? "cinematic-pair" : count === 3 ? "vertical-relay" : "single-scene";
  return "auto";
}

export function planEntry(input, profile = {}) {
  if (!input?.idempotencyKey) throw new Error("idempotencyKey is required");
  const route = routeFor(input);
  if (!["S", "P", "K", "M", "L"].includes(route)) {
    throw new Error(`Unsupported route: ${route}`);
  }
  const bodyPageCount = bodyPages(input, route);
  const layout = planLayout({
    route,
    input,
    previousTemplates: profile.recentTemplates ?? []
  });
  const coverSemantics = input.coverDirection ?? input.coverSemantics ?? null;
  const panelPlanValue = panelPlan(input, route, bodyPageCount);
  return {
    schemaVersion: "1.1.0",
    ruleVersion: "ache-route-1.4.0",
    designSystemVersion: layout.designSystemVersion,
    route,
    routeContract: ROUTE_CONTRACTS[route],
    cover: {
      required: true,
      grammar: coverGrammar(input.idempotencyKey, profile.recentCoverGrammars ?? []),
      targetAspectRatio: "3:4",
      independentAssetRequired: true,
      bodyAssetReuseForbidden: true,
      directionRequired: true,
      semantics: coverSemantics,
      requiredSemanticFields: ["coreObject", "emotionVerb", "smallContrast", "grammar"],
      photoSemanticCoverRequired: route === "P",
      photoRestyleForbidden: route === "P"
    },
    bodyPageCount,
    totalPageCount: bodyPageCount + 1,
    requiresLayoutMeasure: route === "L",
    imageBudget: imageBudget(route, bodyPageCount),
    generationBudget: generationBudget(route, bodyPageCount),
    layout,
    visualLayout: input.visualLayout ?? visualLayout(route, input),
    panelPlan: panelPlanValue,
    compositionPlan: compositionPlan(input, route, bodyPageCount, panelPlanValue, layout),
    characterMode: input.characterMode ?? profile.character?.mode ?? "none",
    style: profile.style ?? {
      id: "02-snow-pastel",
      lifecycle: "validated_preset"
    },
    preservation: {
      originalPhoto: route === "P",
      factsAndSources: route === "K",
      meetingFields: route === "M",
      exactOriginalText: route === "L"
    },
    metrics: {
      textLength: countText(input.text),
      imageCount: input.images?.length ?? 0,
      knowledgePointCount: input.knowledgePoints?.length ?? 0,
      meetingFieldCount: input.meetingFields?.length ?? 0,
      beatCount: input.beats?.length ?? 0
    }
  };
}

export function resolveCompoundInput(units = []) {
  const groups = new Map();
  for (const [index, unit] of units.entries()) {
    const key = unit.relationKey || `independent-${index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(unit);
  }
  return [...groups.entries()].map(([relationKey, items]) => ({
    relationKey,
    sourceUnitIds: items.map((item) => item.sourceUnitId),
    outputIntentOnly: items.every((item) => item.outputIntent === true),
    units: items
  }));
}
