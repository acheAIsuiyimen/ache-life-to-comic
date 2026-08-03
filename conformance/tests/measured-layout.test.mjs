import test from "node:test";
import assert from "node:assert/strict";

import {correctionForOverflow, evaluateMeasuredPage} from "../../scripts/measured-layout.mjs";

test("measured correction ladder changes recipe before shrinking body text", () => {
  assert.equal(correctionForOverflow(20), "nudge-local-spacing");
  assert.equal(correctionForOverflow(70), "compact-local-zone");
  assert.equal(correctionForOverflow(120), "adjust-title-or-paragraph-rhythm");
  assert.equal(correctionForOverflow(180), "switch-layout-recipe-or-paginate");
  assert.equal(evaluateMeasuredPage({clientHeight: 1000, scrollHeight: 1180}).bodyTextShrinkAllowed, false);
});

test("intentional editorial whitespace is distinct from unexplained empty bands", () => {
  assert.equal(evaluateMeasuredPage({
    clientHeight: 1000,
    scrollHeight: 1000,
    activeCompositionRatio: .52,
    whitespaceIntent: "editorial"
  }).status, "PASS");
  assert.equal(evaluateMeasuredPage({
    clientHeight: 1000,
    scrollHeight: 1000,
    activeCompositionRatio: .52,
    whitespaceIntent: "none",
    unexplainedBottomBand: true
  }).status, "REPLAN");
});
