/**
 * PlanSpec helpers for the plan-then-execute loop.
 * Structured steps/parameters are the source of truth; markdown is a projection.
 */

import type { AnalysisIntent } from "@/lib/workspace-index";

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
  ert: false,
  ertInvert: false,
  seismic: false,
  radiometrics: false,
  gpr: false,
};

export type PlanIntent = AnalysisIntent | "none";

export interface PlanInput {
  path: string;
  kind?: string;
  size?: number;
  checksum?: string;
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

export const UNSUPPORTED_STEP_KEYS = [
  "gravity",
  "residual",
  "ert",
  "ertInvert",
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
  gravity: ["xyz_ingest", "gravity_reduce"],
  residual: ["regional_residual"],
  ert: ["ert_pseudosection"],
  ertInvert: ["ert_invert"],
  seismic: ["seismic_process"],
  radiometrics: ["radiometric_correct"],
  gpr: ["gpr_process"],
};

export function magneticStepsEnabled(steps: PlanSteps): boolean {
  return MAGNETIC_STEP_KEYS.some((key) => steps[key]);
}

export function unsupportedStepsEnabled(steps: PlanSteps): boolean {
  return UNSUPPORTED_STEP_KEYS.some((key) => steps[key]);
}

export function registeredNodesForSteps(steps: PlanSteps): string[] {
  const registered = new Set<string>(REGISTERED_MAG_NODE_IDS);
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const key of MAGNETIC_STEP_KEYS) {
    if (!steps[key]) continue;
    for (const id of STEP_NODE_IDS[key]) {
      if (!registered.has(id) || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
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
  { key: "residual", re: /\bregional\b.*\bresidual\b|\bresidual gravity\b/i },
  { key: "ertInvert", re: /\binvert(?:ing|ed)? the ert\b|\bert inversion\b/i },
  { key: "ert", re: /\bpseudosection\b|\bert\b/i },
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
      return "Apply latitude, free-air, and Bouguer corrections";
    case "residual":
      return "Separate regional and residual gravity";
    case "ert":
      return "Build an ERT pseudosection";
    case "ertInvert":
      return "Invert the ERT data";
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
}): string {
  const target = opts.targetFolder || "(opened folder)";
  const items = workItems(opts.steps, target, opts.baseReference);
  const products = opts.productsRel || `G-AID Output/${opts.taskFolder}`;
  const notes = (opts.notes || []).filter(Boolean);
  return `# Implementation Plan

**Survey:** ${opts.projectName}
**Target:** ${target}
**Products:** \`${products}/\`

## This run
${items.join("\n") || "- Ask for a magnetic method I can run (diurnal, IGRF, grid, RTP). Other methods are not in this release."}

## Parameters
- Base station reference: ${baseRefLabel(opts.baseReference)}

## Risks and limits
${notes.length ? notes.map((note) => `- ${note}`).join("\n") : "- None flagged before Proceed."}

## After you click Proceed
Products, the frozen plan, tasks, and logs are written under \`${products}/\`. A rerun always creates a new run folder. Edits in this file are what G-AID will run.
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
 * Does not rebuild a full magnetic suite unless the user clearly asked for one.
 */
export function applyChatPatches(plan: AgentPlan, message: string): AgentPlan {
  const raw = stripReviewPrefix(message);
  const m = raw.toLowerCase();
  const steps = cloneSteps(plan.steps);
  const parameters = { ...plan.parameters };
  const notes = [...(plan.notes || [])];
  let targetFolder = plan.targetFolder;

  const onlyDiurnal = /\b(only|just)\s+diurnal\b|\bdiurnal\s+only\b/.test(m);
  if (onlyDiurnal) {
    steps.diurnal = true;
    steps.igrf = false;
    steps.headingLag = false;
    steps.level = false;
    steps.grid = false;
    steps.rtp = false;
    steps.derivatives = false;
    steps.lineaments = false;
    steps.gis = false;
  }

  if (deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(rtp|reduction to (the )?pole)\b|\b(rtp|reduction to (the )?pole)\s+(off|out)\b/, m)) {
    steps.rtp = false;
  } else if (grant(/\b(also|include|add|enable|keep|with|plus)\b.{0,24}\b(rtp|reduction to (the )?pole)\b/, m) || /\bdo rtp\b/.test(m)) {
    steps.rtp = true;
    steps.grid = true;
  }

  if (deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(igrf|main field)\b/, m)) {
    steps.igrf = false;
  } else if (grant(/\b(also|include|add|enable|keep|with|plus)\b.{0,24}\bigrf\b/, m)) {
    steps.igrf = true;
  }

  if (deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(levell?ing|tie[ -]?lines?|microlevell?ing)\b/, m)) {
    steps.level = false;
  } else if (grant(/\b(also|include|add|enable|keep|with|plus)\b.{0,24}\b(levell?ing|tie[ -]?lines?)\b/, m)) {
    steps.level = true;
  }

  if (deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(heading|lag)\b/, m)) {
    steps.headingLag = false;
  }

  if (deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(grid(?:ding)?)\b/, m)) {
    steps.grid = false;
    steps.rtp = false;
    steps.derivatives = false;
    steps.lineaments = false;
    steps.gis = false;
  } else if (grant(/\b(also|include|add|enable|keep|with|plus)\b.{0,24}\bgrid/, m)) {
    steps.grid = true;
  }

  if (deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(derivative|magmap|analytic signal|lineament)\b/, m)) {
    steps.derivatives = false;
    steps.lineaments = false;
  }

  if (deny(/\b(skip|omit|without|exclude|disable|drop|no|don't|dont|do not)\b.{0,40}\b(diurnal)\b/, m) && !onlyDiurnal) {
    steps.diurnal = false;
  }

  if (/\b(also|include|add|enable|keep|with|plus)\b.{0,24}\b(gravity|bouguer)\b/.test(m) || /\bbouguer\b/.test(m) && /\b(also|add|include)\b/.test(m)) {
    steps.gravity = true;
    steps.residual = true;
    steps.gis = true;
  }
  if (deny(/\b(skip|omit|without|exclude|disable|no)\b.{0,40}\b(gravity|bouguer)\b/, m)) {
    steps.gravity = false;
    steps.residual = false;
  }

  if (/\b(also|include|add|enable|keep|with|plus)\b.{0,24}\b(ert|resistivity|pseudosection)\b/.test(m)) {
    steps.ert = true;
    if (/\binvert/.test(m)) steps.ertInvert = true;
  }
  if (/\bpseudosection only\b/.test(m)) {
    steps.ert = true;
    steps.ertInvert = false;
  }

  const ref = parseBaseReference(m);
  if (ref) parameters.baseReference = ref;

  const date = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (date) parameters.surveyDate = date[1];

  const dens = raw.match(/\b(\d(?:\.\d+)?)\s*g\s*\/?\s*c(?:c|m3)\b/i);
  if (dens) parameters.density = parseFloat(dens[1]);

  return {
    ...plan,
    steps,
    parameters,
    targetFolder,
    notes: uniqueNotes(notes),
  };
}

export function normalizePlan(plan: AgentPlan): AgentPlan {
  const steps = cloneSteps(plan.steps);
  const notes = [...(plan.notes || [])];
  const mag = steps.diurnal || steps.igrf || steps.headingLag || steps.level || steps.grid || steps.rtp || steps.derivatives;

  if (steps.rtp && !steps.grid) {
    steps.grid = true;
    notes.push("RTP needs a grid, so I kept minimum-curvature gridding.");
  }
  if (steps.rtp && !steps.igrf) {
    steps.igrf = true;
    notes.push("RTP on uncorrected TMI is not standard; I kept IGRF removal.");
  }
  if ((steps.igrf || steps.rtp || steps.grid || steps.headingLag || steps.level) && !steps.diurnal) {
    steps.diurnal = true;
    notes.push("Later magnetic products need a diurnally corrected TMI, so I kept the diurnal correction.");
  }
  if (steps.derivatives && !steps.grid) {
    steps.grid = true;
    notes.push("MAGMAP products need a grid, so I kept gridding.");
  }
  if (steps.lineaments && !steps.derivatives) {
    steps.derivatives = true;
    notes.push("Lineaments are picked from derivative maps, so I kept MAGMAP.");
  }
  if (steps.gis && mag && !steps.grid) {
    steps.grid = true;
  }
  if (steps.ertInvert && !steps.ert) {
    steps.ert = true;
  }
  if (steps.residual && !steps.gravity) {
    steps.gravity = true;
  }

  return { ...plan, steps, notes: uniqueNotes(notes) };
}

function countFromBrief(brief: string, label: string): number | null {
  const match = brief.match(new RegExp(`${label}:\\s*(\\d+)`, "i"));
  return match ? parseInt(match[1], 10) : null;
}

export function validatePlan(plan: AgentPlan): PlanValidation {
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

  const magarrow = countFromBrief(plan.workspaceBrief || "", "MagArrow airborne");
  const gsm = countFromBrief(plan.workspaceBrief || "", "GSM-19 base station");
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

  if (unsupportedStepsEnabled(plan.steps) && !magneticStepsEnabled(plan.steps)) {
    blockers.push({
      level: "blocker",
      code: "unsupported_method",
      message:
        "That method is not in this release. G-AID can run MagArrow + GSM-19 magnetics after you click Proceed. Gravity, ERT, seismic, GPR, and radiometrics are not available yet.",
    });
  } else if (unsupportedStepsEnabled(plan.steps)) {
    warnings.push({
      level: "warning",
      code: "unsupported_method",
      message: "Extra non-magnetic methods in this plan will not run. Only the magnetic checklist is executed.",
    });
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
