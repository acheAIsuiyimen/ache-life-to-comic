export const MEASURED_LAYOUT_VERSION = "ache-measured-layout/1.0.0";

export function correctionForOverflow(overflowPx = 0) {
  if (overflowPx <= 0) return "none";
  if (overflowPx <= 40) return "nudge-local-spacing";
  if (overflowPx <= 90) return "compact-local-zone";
  if (overflowPx <= 160) return "adjust-title-or-paragraph-rhythm";
  return "switch-layout-recipe-or-paginate";
}

export function evaluateMeasuredPage(measurement) {
  const overflowPx = Math.max(
    0,
    Number(measurement.scrollHeight ?? 0) - Number(measurement.clientHeight ?? 0),
    Number(measurement.scrollWidth ?? 0) - Number(measurement.clientWidth ?? 0)
  );
  const activeCompositionRatio = Number(measurement.activeCompositionRatio ?? 1);
  const failures = [];
  if (overflowPx > 0) failures.push("page-overflow");
  if (measurement.unexplainedBottomBand === true) failures.push("unexplained-bottom-empty-band");
  if (activeCompositionRatio < .75 && measurement.whitespaceIntent !== "editorial") {
    failures.push("active-composition-below-75-percent");
  }
  return {
    version: MEASURED_LAYOUT_VERSION,
    status: failures.length > 0 ? "REPLAN" : "PASS",
    failures,
    overflowPx,
    correction: correctionForOverflow(overflowPx),
    bodyTextShrinkAllowed: false
  };
}
