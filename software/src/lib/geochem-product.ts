export const GEOCHEM_PRODUCT_NAME = "G-AID documented geochemical sample table";
export const GEOCHEM_SUPPORTED_FORMAT = "G-AID GEOCHEM 1.0 CSV/XYZ (SampleID, X, Y, Medium, documented CRS, element columns with units)";

export const GEOCHEM_STATEMENTS = [
  "Product: G-AID documented geochemical sample table. Assay values are observations, not ore, economic grade, mineralisation confirmation, or drill targets.",
  "G-AID GEOCHEM 1.0 is the only supported assay ingest. An arbitrary CSV is not geochemistry because it contains Fe, Cu, Au, K, U, or Th column names.",
  "Below-detection and qualified values are censored data. They are never replaced with zero, imputed, or silently log-transformed.",
  "QA/QC summaries for blanks, standards, field duplicates, and lab duplicates run only when those records and expected-value rules are explicitly present.",
  "Display transforms (log10 of strictly positive uncensored values) require explicit user approval. Original values and parameters are preserved.",
  "Unknown or mixed units block direct element comparison. Units are never assumed from the numbers.",
  "Spatial association with faults, geology, gravity, magnetics, radiometrics, or other layers is geometric coincidence, not causal evidence.",
  "Anomaly detection, prospectivity scoring, mineral targeting, resource estimation, and machine-learning classification are not registered capabilities.",
];

export function geochemLayerHeading(element?: string, units?: string): string {
  if (element && units && units !== "unknown" && units !== "mixed") {
    return `Geochemical samples (${element} ${units}; observation, not ore)`;
  }
  if (element) return `Geochemical samples (${element}; units undocumented — comparison blocked)`;
  return "Geochemical sample locations (observation, not mineralisation)";
}

export function geochemProductWarnings(opts: {
  path?: string;
  element?: string;
  units?: string;
  mixedUnits?: boolean;
  censored?: boolean;
  medium?: string;
  crs?: string;
  qualifierVisible?: boolean;
}): string[] {
  const warnings = [
    "Assay values are observations. High values are not ore, economic grade, mineralisation confirmation, or drill targets.",
    "Below-detection values are censored. They were not replaced with zero.",
  ];
  if (opts.medium) {
    warnings.push(`Sample medium is ${opts.medium}. Medium and coverage bias are not removed.`);
  }
  if (!opts.crs) {
    warnings.push("CRS is undocumented. Sample points are not mapped.");
  }
  if (opts.mixedUnits || opts.units === "mixed" || opts.units === "unknown" || !opts.units) {
    warnings.push("Unknown or mixed units block direct element comparison.");
  }
  if (opts.qualifierVisible) {
    warnings.push("Qualifiers and detection limits remain on the map legend. They are not display-only cosmetics.");
  }
  if (opts.element) {
    warnings.push(`Displayed element ${opts.element} is a selected observation column, not an anomaly score.`);
  }
  return warnings;
}

export function comparisonBlocked(leftUnits?: string, rightUnits?: string): { blocked: boolean; reason: string } {
  const left = (leftUnits || "").trim().toLowerCase();
  const right = (rightUnits || "").trim().toLowerCase();
  if (!left || !right || left === "unknown" || right === "unknown" || left === "mixed" || right === "mixed") {
    return { blocked: true, reason: "Unknown units block direct comparison." };
  }
  if (left !== right) {
    return { blocked: true, reason: `Mixed units (${leftUnits} vs ${rightUnits}) block direct comparison.` };
  }
  return { blocked: false, reason: "Documented same-unit observation pair. Not a mineralisation index." };
}
