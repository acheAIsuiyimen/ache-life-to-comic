import test from "node:test";
import assert from "node:assert/strict";

import {
  createVisualJob,
  createVisualReceipt,
  normalizeCapabilities,
  resolveVisualMode
} from "../../scripts/runtime-capabilities.mjs";
import {
  resolvePublicationTarget
} from "../../scripts/publication-target.mjs";

test("capability probe never guesses support", () => {
  assert.deepEqual(normalizeCapabilities({}), {
    schemaVersion: "1.0.0",
    image: {
      generate: false,
      reference: false,
      edit: false,
      exactSize: false,
      transparent: false,
      seed: false,
      batchLimit: 1
    },
    runtime: {
      fileWrite: false,
      browserRender: false,
      persistentStorage: false
    },
    presentation: {
      imageAttachment: false,
      filePreview: false,
      htmlArtifact: false,
      openLocalPreview: false,
      interactiveChoices: false
    }
  });
});

test("native image capability produces provider-neutral ready mode", () => {
  const result = resolveVisualMode({
    capabilities: {image: {generate: true}},
    route: "S"
  });
  assert.equal(result.mode, "native-image");
  assert.equal(result.finalEligible, true);
});

test("missing image capability offers choices instead of rejecting", () => {
  const result = resolveVisualMode({capabilities: {}, route: "S"});
  assert.equal(result.status, "choice-required");
  assert.deepEqual(result.options, ["enable", "light", "pending"]);
});

test("light illustration is final for P K M L and opt-in for S", () => {
  for (const route of ["P", "K", "M", "L"]) {
    const result = resolveVisualMode({
      capabilities: {},
      route,
      noImageChoice: "light"
    });
    assert.equal(result.mode, "light-illustration");
    assert.equal(result.finalEligible, true);
  }
  assert.equal(resolveVisualMode({
    capabilities: {},
    route: "S",
    noImageChoice: "light"
  }).mode, "visual-pending");
  assert.equal(resolveVisualMode({
    capabilities: {},
    route: "S",
    noImageChoice: "light",
    acceptLightForDaily: true
  }).mode, "light-illustration");
});

test("visual job and receipt do not bind or invent a provider", () => {
  const job = createVisualJob({
    jobId: "job-001",
    route: "K",
    purpose: "supporting-illustration",
    styleId: "02-snow-pastel"
  });
  assert.equal(job.constraints[0], "textless-visual");
  const receipt = createVisualReceipt({
    job,
    result: {status: "ready", files: ["page.png"]}
  });
  assert.equal(receipt.model, "not_exposed");
  assert.equal(receipt.seed, "not_exposed");
  assert.equal(receipt.cost, "not_exposed");
});

test("local and local-then-sync never perform external writes", () => {
  for (const target of ["local-html", "local-then-sync"]) {
    const result = resolvePublicationTarget({target});
    assert.equal(result.status, "ready");
    assert.equal(result.externalWrite, false);
  }
});

test("Feishu is blocked unless a verified personal account is authorized", () => {
  for (const connection of [
    null,
    {personal: false, verified: true, write: true},
    {personal: true, verified: false, write: true}
  ]) {
    const result = resolvePublicationTarget({
      target: "feishu",
      connection,
      externalWriteAuthorized: true
    });
    assert.equal(result.status, "identity-confirmation-required");
    assert.equal(result.externalWrite, false);
  }

  assert.equal(resolvePublicationTarget({
    target: "feishu",
    connection: {personal: true, verified: true, write: true},
    externalWriteAuthorized: false
  }).status, "authorization-required");

  const ready = resolvePublicationTarget({
    target: "feishu",
    connection: {personal: true, verified: true, write: true},
    externalWriteAuthorized: true
  });
  assert.equal(ready.status, "ready");
  assert.equal(ready.externalWrite, true);
  assert.equal(ready.renderMode, "continuous-page-images");
  assert.equal(ready.imageEditionVersion, "feishu-image-edition/1.0.0");
});

test("GitHub without verified authorization falls back to local package", () => {
  const result = resolvePublicationTarget({target: "github"});
  assert.equal(result.status, "authorization-required");
  assert.equal(result.fallback, "prepare-local-publish-package");
});
