/**
 * PlanSpec helpers for the plan-then-execute loop.
 * Structured steps/parameters are the source of truth; markdown is a projection.
 */

import type { AnalysisIntent } from "@/lib/workspace-index";
import type { ProjectCatalog, SupportStatus } from "./catalog/types.ts";
import { findRecord, recordsInTarget } from "./catalog/summarize.ts";
import {
  compileCapabilityDag,
  capabilitiesFromSteps,
  getCapability,
  isRegisteredCapability,
  proposeCapabilitiesFromMessage,
  stepsFromCapabilities,
  unregisteredProposal,
  validateCapabilityContracts,
  type CompiledDag,
  type ReviewDecision,
  type UserCapabilityId,
} from "./capabilities/index.ts";

export type PlanStatus = "draft" | "approved" | "executing" | "failed" | "complete";

export type PlanSteps = {
  diurnal: boolean;
  igrf: boolean;
  headingLag: boolean;
  level: boolean;
  grid: boolean;
  rtp: boolean;
  derivatives: boolean;
  lineaments: boolean;
  gis: boolean;
  gravity: boolean;
  residual: boolean;
  completeBouguer: boolean;
  ert: boolean;
  ertInvert: boolean;
  seismic: boolean;
  radiometrics: boolean;
  gpr: boolean;
};

export const EMPTY_STEPS: PlanSteps = {
  diurnal: false,
  igrf: false,
  headingLag: false,
  level: false,
  grid: false,
  rtp: false,
  derivatives: false,
  lineaments: false,
  gis: false,
  gravity: false,
  residual: false,
  completeBouguer: false,
  ert: false,
  ertInvert: false,
  seismic: false,
  radiometrics: false,
  gpr: false,
};

export type PlanIntent = AnalysisIntent | "none";

export interface PlanInput {
  catalogId: string;
  path: string;
  kind?: string;
  size?: number;
  checksum?: string;
  supportStatus?: SupportStatus;
  adapterId?: string | null;
  formatId?: string;
  columnMapping?: {
    x: string;
    y: string;
    gObs: string;
    elevation?: string;
    stationId?: string;
    datetime?: string;
    latitude?: string;
    reviewed: boolean;
    reviewedAt?: string;
  };
  elevationDatum?: string;
  units?: string;
  crs?: string;
  bbox?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  cellSizeM?: number;
}

export interface AgentPlan {
  plan: string;
  taskFolder: string;
  outputDir: string;
  productsRel?: string;
  workspaceRoot: string;
  targetFolder: string;
  projectName: string;
  intent: PlanIntent;
  steps: PlanSteps;
  parameters: {
    baseReference: "mean_base" | "median_base" | "first_sample";
    surveyDate?: string;
    density?: number;
    inclination?: number;
    declination?: number;
    inputPath?: string;
    surveyLatitude?: number;
    elevationDatum?: "orthometric" | "ellipsoidal" | string;
    gravityUnits?: "mGal" | "m/s2" | string;
    crsEpsg?: number;
    applyBullardB?: boolean;
    terrainRadiusM?: number;
    useDemExtent?: boolean;
    gravityMapping?: {
      x: string;
      y: string;
      gObs: string;
      elevation?: string;
      stationId?: string;
      datetime?: string;
      latitude?: string;
      reviewed: boolean;
      reviewedAt?: string;
    };
    columnMappingReviewed?: boolean;
  };
  workspaceBrief: string;
  rev?: number;
  notes?: string[];
  status?: PlanStatus;
  runId?: string;
  parentRunId?: string;
  planHash?: string;
  approvedAt?: string;
  inputs?: PlanInput[];
  lineage?: { products?: string[] };
  capabilities?: UserCapabilityId[];
  dag?: CompiledDag;
  reviewDecisions?: ReviewDecision[];
}

export interface PlanIssue {
  level: "blocker" | "warning" | "note";
  code: string;
  message: string;
}

export interface ParsedPlanMarkdown {
  thisRunFound: boolean;
  steps: PlanSteps;
  targetFolder?: string;
  projectName?: string;
  productsRel?: string;
  baseReference?: AgentPlan["parameters"]["baseReference"];
  surveyDate?: string;
  density?: number;
  unknownLines: string[];
}

export interface PlanValidation {
  blockers: PlanIssue[];
  warnings: PlanIssue[];
  notes: PlanIssue[];
  ok: boolean;
}

export const STEP_KEYS = [
  "diurnal",
  "igrf",
  "headingLag",
  "level",
  "grid",
  "rtp",
  "derivatives",
  "lineaments",
  "gis",
  "gravity",
  "residual",
  "completeBouguer",
  "ert",
  "ertInvert",
  "seismic",
  "radiometrics",
  "gpr",
] as const satisfies readonly (keyof PlanSteps)[];

type StepKey = (typeof STEP_KEYS)[number];

/** Nodes actually registered on MagneticPreprocessingPipeline. Keep in sync with that class. */
export const REGISTERED_MAG_NODE_IDS = [
  "file_discovery",
  "flight_path_cleaner",
  "time_synchronizer",
  "diurnal_corrector",
  "qc_engine",
  "excel_export_adapter",
  "report_export_adapter",
  "igrf_corrector",
  "heading_lag_corrector",
  "tie_line_leveler",
  "microleveller",
  "mag_gridder",
  "rtp_filter",
  "fft_derivatives",
  "lineament_extractor",
  "euler_deconvolution",
  "gis_export",
] as const;

export const MAGNETIC_STEP_KEYS = [
  "diurnal",
  "igrf",
  "headingLag",
  "level",
  "grid",
  "rtp",
  "derivatives",
  "lineaments",
  "gis",
] as const satisfies readonly StepKey[];

export const GRAVITY_STEP_KEYS = ["gravity", "residual", "completeBouguer"] as const satisfies readonly StepKey[];

export const ERT_STEP_KEYS = ["ert", "ertInvert"] as const satisfies readonly StepKey[];

export const UNSUPPORTED_STEP_KEYS = [
  "seismic",
  "radiometrics",
  "gpr",
] as const satisfies readonly StepKey[];

export const STEP_NODE_IDS: Record<StepKey, string[]> = {
  diurnal: ["file_discovery", "flight_path_cleaner", "time_synchronizer", "diurnal_corrector", "qc_engine"],
  igrf: ["igrf_corrector"],
  headingLag: ["heading_lag_corrector"],
  level: ["tie_line_leveler", "microleveller"],
  grid: ["mag_gridder"],
  rtp: ["rtp_filter"],
  derivatives: ["fft_derivatives", "euler_deconvolution"],
  lineaments: ["lineament_extractor"],
  gis: ["gis_export", "excel_export_adapter", "report_export_adapter"],
  gravity: ["gravity_ingest", "gravity_freeair", "gravity_bouguer", "grav_gridder", "grav_gis_export", "grav_interpret"],
  residual: ["regional_residual"],
  completeBouguer: ["gravity_terrain"],
  ert: ["ert_ingest", "ert_pseudosection", "ert_gis_export", "ert_interpret"],
  ertInvert: ["ert_invert"],
  seismic: ["seismic_process"],
  radiometrics: ["radiometric_correct"],
  gpr: ["gpr_process"],
};

export function magneticStepsEnabled(steps: PlanSteps): boolean {
  return MAGNETIC_STEP_KEYS.some((key) => steps[key]);
}

export function gravityStepsEnabled(steps: PlanSteps): boolean {
  return GRAVITY_STEP_KEYS.some((key) => steps[key]);
}

export function ertStepsEnabled(steps: PlanSteps): boolean {
  return ERT_STEP_KEYS.some((key) => steps[key]);
}

export function unsupportedStepsEnabled(steps: PlanSteps): boolean {
  return UNSUPPORTED_STEP_KEYS.some((key) => steps[key]);
}

export function registeredNodesForSteps(steps: PlanSteps): string[] {
  const ids = capabilitiesFromSteps(steps as unknown as Record<string, boolean>);
  return compileCapabilityDag(ids).nodes.map((node) => node.id);
}

const STEP_FALLBACK: { key: StepKey; re: RegExp }[] = [
  { key: "diurnal", re: /\b(diurnal|magarrow|gsm-?19)\b/i },
  { key: "igrf", re: /\bigrf\b|main magnetic field/i },
  { key: "headingLag", re: /\bheading\b|\blag\b/i },
  { key: "level", re: /\btie[ -]?line|\blevell?ing\b|\blevel the tie/i },
  { key: "grid", re: /\bgrid(?:ding)? the residual\b|\bminimum[ -]?curvature\b|\bmap products\b/i },
  { key: "rtp", re: /\brtp\b|reduction to (the )?pole|\bto the pole\b/i },
  { key: "derivatives", re: /\banalytic signal\b|\btilt\b|\bcontinuation\b|\bmagmap\b/i },
  { key: "lineaments", re: /\blineament/i },
  { key: "gis", re: /\bgeotiff\b|\bgeojson\b|\bgis\b/i },
  { key: "gravity", re: /\bbouguer\b|\bfree[ -]?air\b|\blatitude\b/i },
  { key: "completeBouguer", re: /\bcomplete\s+bouguer\b|\bterrain\s+correct/i },
  { key: "residual", re: /\bregional\b.*\bresidual\b|\bresidual gravity\b/i },
  { key: "ertInvert", re: /\binvert(?:ing|ed)? the ert\b|\bert inversion\b|\b2d invert/i },
  { key: "ert", re: /\bpseudosection\b|\bert\b|\bresistivity\b/i },
  { key: "seismic", re: /\bseg-?y\b|\bseismic\b/i },
  { key: "radiometrics", re: /\bradiometr/i },
  { key: "gpr", re: /\bgpr\b|ground[ -]?penetrating/i },
];

export function cloneSteps(steps: PlanSteps = EMPTY_STEPS): PlanSteps {
  return { ...EMPTY_STEPS, ...steps };
}

export function anyStepEnabled(steps: PlanSteps): boolean {
  return STEP_KEYS.some((key) => steps[key]);
}

export function enabledStepKeys(steps: PlanSteps): StepKey[] {
  return STEP_KEYS.filter((key) => steps[key]);
}

export function baseRefLabel(ref: string): string {
  if (ref === "median_base") return "median of the GSM-19 base";
  if (ref === "first_sample") return "first sample of the GSM-19";
  return "mean of the GSM-19 base";
}

export function parseBaseReference(text: string): AgentPlan["parameters"]["baseReference"] | undefined {
  const t = text.toLowerCase();
  if (/\bmedian\b/.test(t)) return "median_base";
  if (/\bfirst\s+sample\b/.test(t)) return "first_sample";
  if (/\bmean\b/.test(t)) return "mean_base";
  return undefined;
}

function workLine(key: StepKey, targetFolder: string, baseReference: string): string {
  const loc = targetFolder && targetFolder !== "(opened folder)" ? ` on ${targetFolder}` : "";
  switch (key) {
    case "diurnal":
      return `Correct MagArrow lines${loc} using the GSM-19 (${baseRefLabel(baseReference)})`;
    case "igrf":
      return "Remove the Earth's main magnetic field at each sample";
    case "headingLag":
      return "Apply heading and lag corrections";
    case "level":
      return "Level the tie lines";
    case "grid":
      return "Grid the residual and write map products";
    case "rtp":
      return "Reduce the grid to the pole";
    case "derivatives":
      return "Compute analytic signal, first vertical derivative, tilt, and continuation";
    case "lineaments":
      return "Extract lineaments from the derivative maps";
    case "gis":
      return "Write GeoTIFF, ASC, and GeoJSON products";
    case "gravity":
      return "Apply latitude, free-air, and simple Bouguer corrections";
    case "completeBouguer":
      return "Apply near-zone Nagy terrain correction (complete Bouguer only if DEM + density + radius validate)";
    case "residual":
      return "Separate regional and residual gravity";
    case "ert":
      return "Ingest ERT and build a labelled pseudosection (not a depth model)";
    case "ertInvert":
      return "Run the tested 2-D smoothness inversion (not Res2DInv, not 3-D)";
    case "seismic":
      return "Process the SEG-Y (filter, gain, spectrum)";
    case "radiometrics":
      return "Apply height, stripping, and spectral corrections to the radiometric data";
    case "gpr":
      return "Process the GPR (dewow, gain, bandpass)";
  }
}

export function workItems(steps: PlanSteps, targetFolder: string, baseReference: string): string[] {
  return enabledStepKeys(steps).map(
    (key) => `- ${workLine(key, targetFolder, baseReference)} <!-- step:${key} -->`
  );
}

export function renderImplementationPlan(opts: {
  projectName: string;
  targetFolder: string;
  taskFolder: string;
  productsRel?: string;
  steps: PlanSteps;
  baseReference: string;
  notes?: string[];
  capabilities?: UserCapabilityId[];
  inputs?: PlanInput[];
  dag?: CompiledDag;
  reviewDecisions?: ReviewDecision[];
  inclination?: number;
  declination?: number;
  density?: number;
  surveyLatitude?: number;
  elevationDatum?: string;
  applyBullardB?: boolean;
  terrainRadiusM?: number;
  useDemExtent?: boolean;
}): string {
  const target = opts.targetFolder || "(opened folder)";
  const capabilityIds = opts.capabilities?.length
    ? opts.capabilities
    : capabilitiesFromSteps(opts.steps as unknown as Record<string, boolean>);
  const dag = opts.dag || compileCapabilityDag(capabilityIds);
  const items = workItems(opts.steps, target, opts.baseReference);
  const products = opts.productsRel || `G-AID Output/${opts.taskFolder}`;
  const notes = (opts.notes || []).filter(Boolean);
  const bound = (opts.inputs || []).map((item) => `- \`${item.catalogId}\` ${item.path} (${item.adapterId || item.kind || "bound"})`);
  const artifacts = dag.requestedCapabilityIds.flatMap((id) =>
    (getCapability(id)?.expectedArtifacts || []).map((name) => `- ${name}`)
  );
  const limits = dag.requestedCapabilityIds.flatMap((id) =>
    (getCapability(id)?.interpretationLimits || []).map((line) => `- ${line}`)
  );
  const reviews = (opts.reviewDecisions || [])
    .slice(-6)
    .map((decision) => `- **${decision.status}** ${decision.capabilityId || ""}: ${decision.reason}`);
  const dagLines = dag.nodes.map((node) => `- \`${node.id}\` ${node.label}`);
  const magInputs = (opts.inputs || []).some((item) => item.adapterId === "magarrow" || item.adapterId === "gsm19");
  const gravInputs = (opts.inputs || []).some((item) => item.adapterId === "gravity-xyz" || item.adapterId === "gravity-csv");
  const mixed = magInputs && gravInputs;
  const field = [
    typeof opts.inclination === "number" ? `Inclination: ${opts.inclination}°` : "",
    typeof opts.declination === "number" ? `Declination: ${opts.declination}°` : "",
    typeof opts.density === "number" ? `Bouguer density: ${opts.density} g/cm³ (user-confirmed, not assumed)` : "",
    typeof opts.surveyLatitude === "number" ? `Survey latitude: ${opts.surveyLatitude}° (Somigliana; easting/northing is not latitude)` : "",
    opts.elevationDatum ? `Elevation datum: ${opts.elevationDatum}` : "",
    opts.applyBullardB ? "Bullard B: enabled" : gravityStepsEnabled(opts.steps) ? "Bullard B: off unless requested" : "",
    opts.steps.completeBouguer
      ? typeof opts.terrainRadiusM === "number"
        ? `Terrain radius: ${opts.terrainRadiusM} m (near-zone Nagy). Far-zone is not applied.`
        : opts.useDemExtent
          ? "Terrain radius: bound DEM extent (still near-zone only; far-zone is not applied)."
          : "Terrain radius: required before Proceed (or say use DEM extent)."
      : gravityStepsEnabled(opts.steps)
        ? "Anomaly: simple Bouguer (infinite slab). Not complete Bouguer unless grav.terrain is approved."
        : "",
  ].filter(Boolean);
  const thisRunFallback = ertStepsEnabled(opts.steps)
    ? "- Ask for a registered ERT, gravity, or magnetic method I can run. Seismic, GPR, and radiometrics are not in this release."
    : gravityStepsEnabled(opts.steps)
    ? "- Ask for a gravity or magnetic method I can run. Seismic, GPR, and radiometrics are not in this release."
    : "- Ask for a magnetic method I can run (diurnal, IGRF, grid, RTP), a gravity reduction, or ERT. Other methods are not in this release.";

  return `# Implementation Plan

**Survey:** ${opts.projectName}
**Target:** ${target}
**Products:** \`${products}/\`

## This run
${items.join("\n") || thisRunFallback}

## Bound inputs
${bound.length ? bound.join("\n") : "- No supported catalog records bound. Bind MagArrow/GSM-19, gravity-contract, dem-ascii, and/or ERT-contract catalog IDs before Proceed."}

## Parameters
- Base station reference: ${baseRefLabel(opts.baseReference)}
${field.map((line) => `- ${line}`).join("\n")}

## Compiled DAG
${dagLines.join("\n") || "- (none)"}

## Expected artifacts
${artifacts.length ? [...new Set(artifacts)].join("\n") : "- None until a registered capability is approved."}

## Assumptions and limits
${limits.length ? [...new Set(limits)].join("\n") : "- Only registered magnetic, gravity, and ERT capabilities run."}
${mixed ? "- Magnetic and gravity products may display together. Joint inversion and combined interpretation are not registered capabilities.\n" : ""}${notes.length ? notes.map((note) => `- ${note}`).join("\n") : ""}

## Review record
${reviews.length ? reviews.join("\n") : "- No review comments recorded yet."}

## After you click Proceed
Only this hash-frozen DAG runs, against the bound catalog IDs. A rerun always creates a new run folder. Unrelated nodes are not registered.
`;
}

function sectionBody(markdown: string, heading: string): string | null {
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "im");
  const match = markdown.match(re);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length;
  const rest = markdown.slice(start);
  const next = rest.search(/^##\s+/m);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

function parseStepKey(line: string): StepKey | undefined {
  const tagged = line.match(/<!--\s*step:([a-zA-Z]+)\s*-->/);
  if (tagged && STEP_KEYS.includes(tagged[1] as StepKey)) return tagged[1] as StepKey;
  const stripped = line.replace(/<!--.*?-->/g, "").replace(/^[-*]\s+(\[[ xX~!s]?\]\s*)?/, "").trim();
  if (!stripped || stripped.startsWith("Ask for a specific")) return undefined;
  for (const row of STEP_FALLBACK) {
    if (row.re.test(stripped)) return row.key;
  }
  return undefined;
}

export function parsePlanMarkdown(markdown: string): ParsedPlanMarkdown {
  const text = markdown || "";
  const steps = cloneSteps();
  const unknownLines: string[] = [];
  const thisRun = sectionBody(text, "This run");
  if (thisRun) {
    for (const raw of thisRun.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      if (!/^[-*]/.test(line)) continue;
      const key = parseStepKey(line);
      if (key) steps[key] = true;
      else unknownLines.push(line.replace(/^[-*]\s+/, ""));
    }
  }

  const survey = text.match(/\*\*Survey:\*\*\s*(.+)/i);
  const target = text.match(/\*\*Target:\*\*\s*(.+)/i);
  const products = text.match(/\*\*Products:\*\*\s*`?([^`\n]+)`?/i);
  const params = sectionBody(text, "Parameters") || "";
  const baseReference = parseBaseReference(params || text);
  const date = (params || text).match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  const dens = (params || text).match(/\b(\d(?:\.\d+)?)\s*g\s*\/?\s*c(?:c|m3)\b/i);

  let targetFolder: string | undefined;
  if (target) {
    const value = target[1].trim().replace(/^`|`$/g, "");
    if (value && value !== "(opened folder)") targetFolder = value;
  }

  return {
    thisRunFound: thisRun !== null,
    steps,
    targetFolder,
    projectName: survey?.[1]?.trim(),
    productsRel: products?.[1]?.trim().replace(/\/$/, ""),
    baseReference,
    surveyDate: date?.[1],
    density: dens ? parseFloat(dens[1]) : undefined,
    unknownLines,
  };
}

export function mergePlanMarkdown(plan: AgentPlan, markdown: string): AgentPlan {
  const parsed = parsePlanMarkdown(markdown);
  const notes = [...(plan.notes || [])];
  const next: AgentPlan = {
    ...plan,
    parameters: { ...plan.parameters },
    steps: cloneSteps(plan.steps),
    notes,
  };

  if (parsed.thisRunFound) {
    if (anyStepEnabled(parsed.steps)) {
      next.steps = parsed.steps;
    } else {
      notes.push("The editor's This run list had no recognised steps; I kept the previous checklist.");
    }
  } else if (markdown.trim()) {
    notes.push("Could not find a ## This run section in the editor; I kept the previous checklist.");
  }

  if (parsed.targetFolder) next.targetFolder = parsed.targetFolder;
  if (parsed.projectName) next.projectName = parsed.projectName;
  if (parsed.productsRel) next.productsRel = parsed.productsRel;
  if (parsed.baseReference) next.parameters.baseReference = parsed.baseReference;
  if (parsed.surveyDate) next.parameters.surveyDate = parsed.surveyDate;
  if (typeof parsed.density === "number" && Number.isFinite(parsed.density)) {
    next.parameters.density = parsed.density;
  }
  next.notes = uniqueNotes(notes);
  if (parsed.thisRunFound && anyStepEnabled(next.steps)) {
    next.capabilities = capabilitiesFromSteps(next.steps as unknown as Record<string, boolean>);
    next.dag = compileCapabilityDag(next.capabilities);
  }
  return next;
}

function uniqueNotes(notes: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const note of notes) {
    const trimmed = note.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function stripReviewPrefix(message: string): string {
  return message.replace(/^review feedback for the implementation plan:\s*/i, "").trim();
}

function deny(re: RegExp, message: string): boolean {
  return re.test(message);
}

function grant(re: RegExp, message: string): boolean {
  return re.test(message);
}

/**
 * Patch an existing plan from chat / Review text.
 * Proposals are recorded; only registered capabilities can be enabled.
 */
export function applyChatPatches(plan: AgentPlan, message: string): AgentPlan {
  const raw = stripReviewPrefix(message);
  const m = raw.toLowerCase();
  const previous = plan.capabilities?.length
    ? plan.capabilities
    : capabilitiesFromSteps(plan.steps as unknown as Record<string, boolean>);
  const proposed = proposeCapabilitiesFromMessage(raw, previous);
  const decisions: ReviewDecision[] = [...(plan.reviewDecisions || [])];
  const now = new Date().toISOString();
  const parameters = { ...plan.parameters };
  const notes = [...(plan.notes || [])];

  const ref = parseBaseReference(m);
  if (ref) parameters.baseReference = ref;
  const date = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (date) parameters.surveyDate = date[1];
  const dens = raw.match(/\b(\d(?:\.\d+)?)\s*g\s*\/?\s*c(?:c|m3)\b/i) || raw.match(/\bdensity[:\s=]+(\d(?:\.\d+)?)/i);
  if (dens) parameters.density = parseFloat(dens[1]);
  const lat = raw.match(/\bsurvey\s*lat(?:itude)?[:\s=]+(-?\d+(?:\.\d+)?)/i);
  if (lat) parameters.surveyLatitude = parseFloat(lat[1]);
  const datum = raw.match(/\belevation\s*datum[:\s=]+(orthometric|ellipsoidal)/i);
  if (datum) parameters.elevationDatum = datum[1].toLowerCase();
  const radius = raw.match(/terrain\s*radius[:\s=]+(\d+(?:\.\d+)?)\s*m/i) || raw.match(/\bradius[:\s=]+(\d+(?:\.\d+)?)\s*m\b/i);
  if (radius && /\b(terrain|complete\s+bouguer)\b/i.test(raw)) {
    parameters.terrainRadiusM = parseFloat(radius[1]);
  }
  if (/\b(use (the )?dem extent|full dem|entire dem)\b/i.test(raw)) {
    parameters.useDemExtent = true;
  }
  if (/\bbullard\s*b\b/i.test(raw) && !/\b(skip|omit|without|no)\b.{0,20}\bbullard/i.test(raw)) {
    parameters.applyBullardB = true;
  }
  if (/\b(mapping (reviewed|confirmed|accepted)|confirm(?:ed)? (?:the )?column mapping)\b/i.test(raw)) {
    parameters.columnMappingReviewed = true;
    if (parameters.gravityMapping) parameters.gravityMapping = { ...parameters.gravityMapping, reviewed: true };
  }
  const inc = raw.match(/\binclination\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i);
  const dec = raw.match(/\bdeclination\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i);
  if (inc) parameters.inclination = parseFloat(inc[1]);
  if (dec) parameters.declination = parseFloat(dec[1]);

  const previousSet = new Set(previous);
  const nextSet = new Set(proposed);

  for (const id of previous) {
    if (!nextSet.has(id)) {
      const capability = getCapability(id);
      decisions.push({
        at: now,
        message: raw,
        status: "refused",
        capabilityId: id,
        reason: capability
          ? `Removed ${capability.title} from this run. ${capability.scientificConstraints[0] || ""}`.trim()
          : `Refused ${id}.`,
      });
    }
  }
  for (const id of proposed) {
    if (!previousSet.has(id) && isRegisteredCapability(id)) {
      const capability = getCapability(id);
      const needsRtpParams =
        id === "mag.rtp" &&
        !nextSet.has("mag.igrf") &&
        !(typeof parameters.inclination === "number" && typeof parameters.declination === "number");
      const needsDensity =
        (id === "grav.bouguer" || id === "grav.terrain") &&
        !(typeof parameters.density === "number" && Number.isFinite(parameters.density));
      const needsTerrain =
        id === "grav.terrain" &&
        !parameters.useDemExtent &&
        !(typeof parameters.terrainRadiusM === "number" && Number.isFinite(parameters.terrainRadiusM));
      decisions.push({
        at: now,
        message: raw,
        status: needsRtpParams || needsDensity || needsTerrain ? "needs-data" : "accepted",
        capabilityId: id,
        reason: needsRtpParams
          ? "RTP was requested. It needs mag.igrf or explicit inclination/declination before Proceed."
          : needsDensity
            ? "Bouguer correction was requested. Supply a density in g/cm³. I will not assume 2.67."
            : needsTerrain
              ? "Near-zone complete Bouguer needs a documented DEM and a terrain radius (or use DEM extent). Far-zone is not implemented."
              : `Accepted ${capability?.title || id}. Only the registry can run it.`,
      });
    }
  }

  const unsupported = unregisteredProposal(raw);
  if (unsupported) {
    decisions.push({
      at: now,
      message: raw,
      status: "refused",
      capabilityId: unsupported,
      reason: `${unsupported} is not a registered capability in this release. I will not enable it or silently substitute magnetics.`,
    });
  }

  if (ref) {
    decisions.push({
      at: now,
      message: raw,
      status: "accepted",
      reason: `Base reference set to ${ref}.`,
    });
  }

  if (inc && dec) {
    decisions.push({
      at: now,
      message: raw,
      status: "accepted",
      capabilityId: "mag.rtp",
      reason: `Documented field parameters I=${parameters.inclination}°, D=${parameters.declination}° accepted as the RTP fallback.`,
    });
  }

  const projected = stepsFromCapabilities(proposed);
  const steps = cloneSteps({
    ...EMPTY_STEPS,
    ...projected,
    seismic: plan.steps.seismic,
    radiometrics: plan.steps.radiometrics,
    gpr: plan.steps.gpr,
  });

  const dag = compileCapabilityDag(proposed);
  return {
    ...plan,
    steps,
    parameters,
    targetFolder: plan.targetFolder,
    capabilities: proposed,
    dag,
    reviewDecisions: uniqueDecisions(decisions),
    notes: uniqueNotes(notes),
  };
}

function uniqueDecisions(decisions: ReviewDecision[]): ReviewDecision[] {
  const seen = new Set<string>();
  const out: ReviewDecision[] = [];
  for (const decision of decisions) {
    const key = `${decision.status}|${decision.capabilityId || ""}|${decision.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(decision);
  }
  return out;
}

export function normalizePlan(plan: AgentPlan): AgentPlan {
  const capabilities = plan.capabilities?.length
    ? plan.capabilities.filter(isRegisteredCapability)
    : capabilitiesFromSteps(plan.steps as unknown as Record<string, boolean>);
  const projected = stepsFromCapabilities(capabilities);
  const steps = cloneSteps({
    ...plan.steps,
    ...projected,
  });
  const notes = [...(plan.notes || [])];
  if (plan.steps.seismic || plan.steps.radiometrics || plan.steps.gpr) {
    notes.push("Unsupported methods stay listed as refused. They are not compiled into the DAG.");
  }
  if (magneticStepsEnabled(steps) && gravityStepsEnabled(steps)) {
    notes.push(
      "Magnetic and gravity products may display together. Joint inversion and combined interpretation are not registered capabilities."
    );
  }
  if (ertStepsEnabled(steps) && (magneticStepsEnabled(steps) || gravityStepsEnabled(steps))) {
    notes.push(
      "ERT products may display with magnetic or gravity maps. Joint inversion is not a registered capability."
    );
  }
  const dag = compileCapabilityDag(capabilities);
  return {
    ...plan,
    capabilities,
    dag,
    steps,
    notes: uniqueNotes(notes),
  };
}

function countFromBrief(brief: string, label: string): number | null {
  const match = brief.match(new RegExp(`${label}:\\s*(\\d+)`, "i"));
  return match ? parseInt(match[1], 10) : null;
}

function magCountsFromCatalog(plan: AgentPlan, catalog: ProjectCatalog): { magarrow: number; gsm: number } {
  const scoped = recordsInTarget(catalog, plan.targetFolder);
  return {
    magarrow: scoped.filter((record) => record.supportStatus === "supported" && record.adapterId === "magarrow").length,
    gsm: scoped.filter((record) => record.supportStatus === "supported" && record.adapterId === "gsm19").length,
  };
}

function magCountsFromInputs(plan: AgentPlan): { magarrow: number; gsm: number } | null {
  const inputs = plan.inputs || [];
  if (!inputs.length || inputs.some((item) => !item.catalogId && !item.adapterId && !item.kind)) return null;
  const magarrow = inputs.filter((item) => item.adapterId === "magarrow" || item.kind === "magarrow").length;
  const gsm = inputs.filter((item) => item.adapterId === "gsm19" || item.kind === "gsm19-base" || item.kind === "gsm19").length;
  return { magarrow, gsm };
}

export function validatePlan(plan: AgentPlan, catalog?: ProjectCatalog | null): PlanValidation {
  const blockers: PlanIssue[] = [];
  const warnings: PlanIssue[] = [];
  const notes: PlanIssue[] = (plan.notes || []).map((message) => ({
    level: "note" as const,
    code: "note",
    message,
  }));

  if (!anyStepEnabled(plan.steps)) {
    blockers.push({
      level: "blocker",
      code: "no_steps",
      message: "The plan has no processing steps. Add work under This run, or ask for a method in chat.",
    });
  }
  if (!plan.workspaceRoot?.trim()) {
    blockers.push({
      level: "blocker",
      code: "no_workspace",
      message: "Open the survey folder first (File → Open Folder).",
    });
  }

  const density = plan.parameters.density;
  if (typeof density === "number" && (density < 1.2 || density > 3.5)) {
    blockers.push({
      level: "blocker",
      code: "density_range",
      message: `Density ${density} g/cm³ is outside the physical range 1.2–3.5. Edit the plan or say a realistic density.`,
    });
  }

  const inputs = plan.inputs || [];
  const nonSupported = inputs.filter((item) => item.supportStatus && item.supportStatus !== "supported");
  if (nonSupported.length) {
    blockers.push({
      level: "blocker",
      code: "unsupported_catalog_input",
      message:
        "Recognised-unsupported and unknown files cannot be processing inputs. Bind supported MagArrow, GSM-19, gravity-contract, dem-ascii, or ERT-contract catalog records only.",
    });
  }
  if (magneticStepsEnabled(plan.steps) && inputs.length && inputs.some((item) => !item.catalogId)) {
    blockers.push({
      level: "blocker",
      code: "missing_catalog_id",
      message: "Magnetic plans must bind catalog record IDs, not raw file paths or extension searches.",
    });
  }
  if (catalog && magneticStepsEnabled(plan.steps) && inputs.length === 0) {
    blockers.push({
      level: "blocker",
      code: "missing_catalog_id",
      message: "Magnetic plans must bind catalog record IDs from the project catalog. I will not search the folder by extension.",
    });
  }
  if (catalog && inputs.length) {
    for (const item of inputs) {
      if (!item.catalogId) continue;
      const record = findRecord(catalog, item.catalogId);
      if (!record) {
        blockers.push({
          level: "blocker",
          code: "unknown_catalog_id",
          message: `Catalog record ${item.catalogId} is not in the project catalog.`,
        });
        continue;
      }
      if (record.supportStatus !== "supported") {
        blockers.push({
          level: "blocker",
          code: "unsupported_catalog_input",
          message: `${record.relativePath} is ${record.supportStatus} and cannot be a processing input.`,
        });
      }
    }
  }

  let magarrow = countFromBrief(plan.workspaceBrief || "", "MagArrow airborne");
  let gsm = countFromBrief(plan.workspaceBrief || "", "GSM-19 base station");
  if (catalog) {
    const counted = magCountsFromCatalog(plan, catalog);
    magarrow = counted.magarrow;
    gsm = counted.gsm;
  } else {
    const fromInputs = magCountsFromInputs(plan);
    if (fromInputs && (fromInputs.magarrow > 0 || fromInputs.gsm > 0 || inputs.length > 0)) {
      magarrow = fromInputs.magarrow;
      gsm = fromInputs.gsm;
    }
  }
  const magMissing = magarrow == null || magarrow === 0;
  const gsmMissing = gsm == null || gsm === 0;
  if (plan.steps.diurnal && magMissing && gsmMissing) {
    blockers.push({
      level: "blocker",
      code: "no_mag_files",
      message: "I don't see MagArrow or GSM-19 files in the target folder. Open the parent survey, or pick a different DAY.",
    });
  } else if (plan.steps.diurnal && (magMissing || gsmMissing)) {
    blockers.push({
      level: "blocker",
      code: "incomplete_mag",
      message: magMissing
        ? "Diurnal correction needs MagArrow rover files as well as the GSM-19 base. I will not run it with only a base station."
        : "Diurnal correction needs GSM-19 base-station files as well as MagArrow rover data. I will not run it with only the rover.",
    });
  }

  if (unsupportedStepsEnabled(plan.steps) && !magneticStepsEnabled(plan.steps) && !gravityStepsEnabled(plan.steps) && !ertStepsEnabled(plan.steps)) {
    blockers.push({
      level: "blocker",
      code: "unsupported_method",
      message:
        "That method is not in this release. G-AID can run MagArrow + GSM-19 magnetics, a gravity-contract pack, or the ERT pack after you click Proceed. Seismic, GPR, and radiometrics are not available yet.",
    });
  } else if (unsupportedStepsEnabled(plan.steps)) {
    warnings.push({
      level: "warning",
      code: "unsupported_method",
      message: "Extra unregistered methods in this plan will not run. Only the compiled magnetic/gravity/ERT DAG is executed.",
    });
  }

  if (gravityStepsEnabled(plan.steps)) {
    const gravityFiles = inputs.filter(
      (item) => item.adapterId === "gravity-xyz" || item.adapterId === "gravity-csv" || item.kind === "gravity-xyz" || item.kind === "gravity-csv"
    );
    if (catalog && inputs.length === 0) {
      blockers.push({
        level: "blocker",
        code: "no_gravity_files",
        message:
          "Gravity processing needs a supported gravity-contract catalog record (named X/Y/Gravity plus documented CRS and units). I will not take the first .xyz file.",
      });
    } else if (inputs.length && gravityFiles.length === 0) {
      blockers.push({
        level: "blocker",
        code: "no_gravity_files",
        message:
          "Gravity processing needs a supported gravity-xyz or gravity-csv catalog record. I will not take the first .xyz or .dat file.",
      });
    }
  }

  if (ertStepsEnabled(plan.steps)) {
    const ertFiles = inputs.filter(
      (item) =>
        item.adapterId === "ert-dat" ||
        item.adapterId === "ert-csv" ||
        item.kind === "ert-dat" ||
        item.kind === "ert-csv"
    );
    if (inputs.length === 0) {
      blockers.push({
        level: "blocker",
        code: "no_ert_files",
        message:
          "ERT processing needs a supported ERT-contract catalog record (G-AID ERT 1.0 .dat or reviewed ERT CSV). I will not take the first .dat file.",
      });
    } else if (ertFiles.length === 0) {
      blockers.push({
        level: "blocker",
        code: "no_ert_files",
        message:
          "ERT processing needs a supported ert-dat or ert-csv catalog record. An arbitrary .dat file is not ERT data.",
      });
    }
  }

  const capabilityIds = plan.capabilities?.length
    ? plan.capabilities
    : capabilitiesFromSteps(plan.steps as unknown as Record<string, boolean>);
  const contractIssues = validateCapabilityContracts({
    capabilityIds,
    inputs: plan.inputs || [],
    parameters: plan.parameters,
    catalog,
    dag: plan.dag,
  });
  for (const issue of contractIssues) {
    const already = [...blockers, ...warnings].some((item) => item.code === issue.code);
    if (already) continue;
    if (issue.level === "blocker") blockers.push({ level: "blocker", code: issue.code, message: issue.message });
    else if (issue.level === "warning") warnings.push({ level: "warning", code: issue.code, message: issue.message });
    else notes.push({ level: "note", code: issue.code, message: issue.message });
  }

  return {
    blockers,
    warnings,
    notes,
    ok: blockers.length === 0,
  };
}

export function validateEditorMarkdown(markdown: string): PlanValidation {
  const parsed = parsePlanMarkdown(markdown);
  const blockers: PlanIssue[] = [];
  const warnings: PlanIssue[] = [];
  if (!parsed.thisRunFound) {
    blockers.push({
      level: "blocker",
      code: "no_this_run",
      message: "Keep a ## This run section listing the work to execute.",
    });
  } else if (!anyStepEnabled(parsed.steps)) {
    blockers.push({
      level: "blocker",
      code: "no_steps",
      message: "The plan has no recognised processing steps under This run.",
    });
  }
  if (typeof parsed.density === "number" && (parsed.density < 1.2 || parsed.density > 3.5)) {
    blockers.push({
      level: "blocker",
      code: "density_range",
      message: `Density ${parsed.density} g/cm³ is outside 1.2–3.5.`,
    });
  }
  return { blockers, warnings, notes: [], ok: blockers.length === 0 };
}

export function applyEditorAndChat(plan: AgentPlan, editorMarkdown: string | undefined, chatMessage: string): AgentPlan {
  let next = plan;
  if (editorMarkdown && editorMarkdown.trim()) {
    next = mergePlanMarkdown(next, editorMarkdown);
  }
  if (chatMessage.trim()) {
    next = applyChatPatches(next, chatMessage);
  }
  return normalizePlan(next);
}
