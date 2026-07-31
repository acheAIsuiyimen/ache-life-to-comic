const TARGETS = new Set([
  "local-html",
  "feishu",
  "github",
  "local-then-sync"
]);

export function resolvePublicationTarget({
  target = "local-html",
  connection = null,
  externalWriteAuthorized = false
} = {}) {
  if (!TARGETS.has(target)) throw new Error(`Unsupported target: ${target}`);

  if (target === "local-html") {
    return {
      status: "ready",
      target,
      primary: "local-html",
      externalWrite: false,
      monthlyUnit: true
    };
  }

  if (target === "local-then-sync") {
    return {
      status: "ready",
      target,
      primary: "local-html",
      mirrors: [],
      externalWrite: false,
      monthlyUnit: true
    };
  }

  if (target === "feishu") {
    const identity = String(connection?.identity ?? "").trim().toLowerCase();
    const verified = connection?.verified === true;
    const writable = connection?.write === true;
    if (!verified || identity !== "felix") {
      return {
        status: "identity-confirmation-required",
        target,
        externalWrite: false,
        monthlyUnit: true,
        reason: "personal-felix-required"
      };
    }
    if (!writable || !externalWriteAuthorized) {
      return {
        status: "authorization-required",
        target,
        externalWrite: false,
        monthlyUnit: true
      };
    }
    return {
      status: "ready",
      target,
      primary: "feishu",
      externalWrite: true,
      monthlyUnit: true
    };
  }

  const verified = connection?.verified === true;
  const writable = connection?.write === true;
  if (!verified || !writable || !externalWriteAuthorized) {
    return {
      status: "authorization-required",
      target,
      externalWrite: false,
      monthlyUnit: true,
      fallback: "prepare-local-publish-package"
    };
  }
  return {
    status: "ready",
    target,
    primary: "github",
    externalWrite: true,
    monthlyUnit: true,
    publishSource: "sanitized-public-copy"
  };
}
