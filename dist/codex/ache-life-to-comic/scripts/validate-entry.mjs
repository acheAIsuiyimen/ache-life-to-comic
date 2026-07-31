import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {isDeepStrictEqual} from "node:util";

function hashText(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

async function hashFile(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function sameJson(left, right) {
  return isDeepStrictEqual(left, right);
}

export async function validateEntry({route, source = {}, output = {}}) {
  const errors = [];
  const evidence = {};

  if (route === "P") {
    const sourceImages = source.images ?? [];
    const preservedImages = output.preservedImages ?? [];
    if (sourceImages.length !== preservedImages.length) {
      errors.push("photo-count-mismatch");
    } else {
      const pairs = await Promise.all(sourceImages.map(async (sourcePath, index) => {
        const outputPath = preservedImages[index];
        return {
          sourcePath,
          outputPath,
          sourceHash: await hashFile(sourcePath),
          outputHash: await hashFile(outputPath)
        };
      }));
      evidence.photoHashes = pairs;
      if (pairs.some((pair) => pair.sourceHash !== pair.outputHash)) {
        errors.push("photo-hash-mismatch");
      }
    }
  }

  if (route === "K") {
    const facts = source.facts ?? [];
    const ledger = output.factLedger ?? [];
    const ledgerById = new Map(ledger.map((item) => [item.sourceFactId, item]));
    for (const fact of facts) {
      const entry = ledgerById.get(fact.id);
      if (!entry) {
        errors.push(`missing-fact:${fact.id}`);
        continue;
      }
      if (entry.sourceText !== fact.text) {
        errors.push(`source-fact-changed:${fact.id}`);
      }
      if (!String(entry.outputText ?? "").trim()) {
        errors.push(`missing-output-fact:${fact.id}`);
      }
    }
    evidence.factCount = facts.length;
    evidence.ledgerCount = ledger.length;
  }

  if (route === "M") {
    const required = ["speakers", "decisions", "risks", "openQuestions", "tasks"];
    for (const field of required) {
      if (!sameJson(source[field] ?? [], output[field] ?? [])) {
        errors.push(`meeting-field-mismatch:${field}`);
      }
    }
    for (const [index, task] of (output.tasks ?? []).entries()) {
      for (const field of ["owner", "due", "status"]) {
        if (!String(task[field] ?? "").trim()) {
          errors.push(`meeting-task-${index}-missing:${field}`);
        }
      }
    }
  }

  if (route === "L") {
    evidence.sourceTextHash = hashText(source.originalText);
    evidence.outputTextHash = hashText(output.originalText);
    evidence.sourceParagraphCount = source.paragraphs?.length ?? 0;
    evidence.outputParagraphCount = output.paragraphs?.length ?? 0;
    if (source.originalText !== output.originalText) {
      errors.push("longform-text-changed");
    }
    if (!sameJson(source.paragraphs ?? [], output.paragraphs ?? [])) {
      errors.push("longform-paragraph-order-changed");
    }
  }

  return {
    status: errors.length === 0 ? "PASS" : "FAIL",
    route,
    errors,
    evidence
  };
}
