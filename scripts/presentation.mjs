import path from "node:path";

const PRESENTATION_MODES = [
  ["imageAttachment", "native-image-attachment"],
  ["filePreview", "native-file-preview"],
  ["htmlArtifact", "html-artifact"],
  ["openLocalPreview", "local-preview"]
];

export function normalizePresentationCapabilities(raw = {}) {
  const presentation = raw.presentation ?? {};
  return {
    imageAttachment: presentation.imageAttachment === true,
    filePreview: presentation.filePreview === true,
    htmlArtifact: presentation.htmlArtifact === true,
    openLocalPreview: presentation.openLocalPreview === true,
    interactiveChoices: presentation.interactiveChoices === true
  };
}

export function resolvePresentationMode({capabilities = {}, assetPath}) {
  if (!assetPath) throw new Error("assetPath is required");
  const normalized = normalizePresentationCapabilities(capabilities);
  const extension = path.extname(assetPath).toLowerCase();
  const isImage = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"].includes(extension);

  for (const [capability, mode] of PRESENTATION_MODES) {
    if (capability === "imageAttachment" && !isImage) continue;
    if (normalized[capability]) {
      return {
        status: "presentation-ready",
        mode,
        assetPath,
        interactiveChoices: normalized.interactiveChoices,
        requiresAdapterBinding: true
      };
    }
  }

  return {
    status: "presentation-blocked",
    mode: null,
    assetPath,
    interactiveChoices: normalized.interactiveChoices,
    requiresAdapterBinding: true,
    reason: "no-supported-presentation-surface"
  };
}

export function createPresentationReceipt({
  plan,
  displayed = false,
  adapter = "not_exposed",
  warning = null
}) {
  if (!plan?.assetPath) throw new Error("presentation plan is required");
  return {
    schemaVersion: "1.0.0",
    assetPath: plan.assetPath,
    mode: plan.mode,
    status: displayed ? "displayed" : plan.status,
    displayed,
    adapter,
    warnings: warning ? [warning] : []
  };
}

export function assertDisplayed(receipt) {
  if (receipt?.displayed !== true || receipt.status !== "displayed") {
    throw new Error("Required visual was not displayed");
  }
  return true;
}
