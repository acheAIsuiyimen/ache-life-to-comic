const ROUTES = new Set(["S", "P", "K", "M", "L"]);
const NO_IMAGE_CHOICES = new Set(["enable", "light", "pending"]);

function boolean(value) {
  return value === true;
}

export function normalizeCapabilities(raw = {}) {
  const image = raw.image ?? {};
  const runtime = raw.runtime ?? {};
  const presentation = raw.presentation ?? {};
  return {
    schemaVersion: "1.0.0",
    image: {
      generate: boolean(image.generate),
      reference: boolean(image.reference),
      edit: boolean(image.edit),
      exactSize: boolean(image.exactSize),
      transparent: boolean(image.transparent),
      seed: boolean(image.seed),
      batchLimit: Number.isInteger(image.batchLimit) && image.batchLimit > 0
        ? image.batchLimit
        : 1
    },
    runtime: {
      fileWrite: boolean(runtime.fileWrite),
      browserRender: boolean(runtime.browserRender),
      persistentStorage: boolean(runtime.persistentStorage)
    },
    presentation: {
      imageAttachment: boolean(presentation.imageAttachment),
      filePreview: boolean(presentation.filePreview),
      htmlArtifact: boolean(presentation.htmlArtifact),
      openLocalPreview: boolean(presentation.openLocalPreview),
      interactiveChoices: boolean(presentation.interactiveChoices)
    }
  };
}

export function createVisualJob({
  jobId,
  route,
  purpose,
  styleId,
  beats = [],
  referencePaths = [],
  target = {width: 1080, height: 1440},
  constraints = []
}) {
  if (!jobId) throw new Error("jobId is required");
  if (!ROUTES.has(route)) throw new Error(`Unsupported route: ${route}`);
  return {
    schemaVersion: "1.0.0",
    jobId,
    route,
    purpose,
    styleId,
    beats,
    referencePaths,
    target,
    constraints: [
      "textless-visual",
      "deterministic-text-overlay-later",
      ...constraints
    ]
  };
}

export function resolveVisualMode({
  capabilities,
  route,
  noImageChoice = null,
  acceptLightForDaily = false
}) {
  if (!ROUTES.has(route)) throw new Error(`Unsupported route: ${route}`);
  const normalized = normalizeCapabilities(capabilities);
  if (normalized.image.generate) {
    return {
      status: "ready",
      mode: "native-image",
      requiresUserChoice: false,
      finalEligible: true
    };
  }

  if (noImageChoice === null) {
    return {
      status: "choice-required",
      mode: null,
      requiresUserChoice: true,
      finalEligible: false,
      options: ["enable", "light", "pending"]
    };
  }
  if (!NO_IMAGE_CHOICES.has(noImageChoice)) {
    throw new Error(`Unsupported no-image choice: ${noImageChoice}`);
  }
  if (noImageChoice === "enable") {
    return {
      status: "setup-required",
      mode: "enable-capability",
      requiresUserChoice: false,
      finalEligible: false
    };
  }
  if (noImageChoice === "pending") {
    return {
      status: "ready",
      mode: "visual-pending",
      requiresUserChoice: false,
      finalEligible: false
    };
  }

  const dailyFinal = route !== "S" || acceptLightForDaily;
  return {
    status: "ready",
    mode: dailyFinal ? "light-illustration" : "visual-pending",
    requiresUserChoice: false,
    finalEligible: dailyFinal
  };
}

export function createVisualReceipt({
  job,
  result,
  exposed = {}
}) {
  if (!job?.jobId) throw new Error("visual job is required");
  return {
    schemaVersion: "1.0.0",
    jobId: job.jobId,
    status: result.status,
    files: result.files ?? [],
    actualDimensions: result.actualDimensions ?? [],
    model: exposed.model ?? "not_exposed",
    revision: exposed.revision ?? "not_exposed",
    seed: exposed.seed ?? "not_exposed",
    cost: exposed.cost ?? "not_exposed",
    warnings: result.warnings ?? []
  };
}
