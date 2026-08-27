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
  GRAVITY_DEFAULT,
  isRegisteredCapability,
  proposeCapabilitiesFromMessage,
  stepsFromCapabilities,
  unregisteredProposal,
  USER_CAPABILITY_IDS,
  validateCapabilityContracts,
  type CompiledDag,
  type ReviewDecision,
  type UserCapabilityId,
} from "./capabilities/index.ts";
import { NEAR_ZONE_STATEMENTS, ZONED_PLANAR_OFFER, ZONED_PLANAR_PRODUCT_NAME, ZONED_TERRAIN_STATEMENTS, COMPLETE_BOUGUER_REFUSAL, isCompleteBouguerRequest, isZonedPlanarApproval } from "./gravity-product.ts";
import { RADIO_STATEMENTS } from "./radio-product.ts";
import { GPR_STATEMENTS, GPR_MIGRATION_BENCHMARK_PASSED, DEFAULT_DEWOW_WINDOW, DEFAULT_FILTER_ORDER, DEFAULT_SEC_POWER, gprFrozenNyquistLine } from "./gpr-product.ts";
import { BOREHOLE_STATEMENTS } from "./borehole-product.ts";
import { GIS_STATEMENTS } from "./gis-product.ts";
import { GEOCHEM_STATEMENTS } from "./geochem-product.ts";

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
  nearZoneTerrain: boolean;
  intermediateZoneTerrain: boolean;
  farZoneTerrain: boolean;
  ert: boolean;
  ertInvert: boolean;
  seismic: boolean;
  radiometrics: boolean;
  gpr: boolean;
  borehole: boolean;
  gisVector: boolean;
  geochem: boolean;
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
  nearZoneTerrain: false,
  intermediateZoneTerrain: false,
  farZoneTerrain: false,
  ert: false,
  ertInvert: false,
  seismic: false,
  radiometrics: false,
  gpr: false,
  borehole: false,
  gisVector: false,
  geochem: false,
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
  radioMapping?: {
    x: string;
    y: string;
    line: string;
    k?: string;
    eu?: string;
    eth?: string;
    tc?: string;
    reviewed: boolean;
    reviewedAt?: string;
  };
  geochemMapping?: {
    sampleId: string;
    x: string;
    y: string;
    medium?: string;
    elements: Array<{
      column: string;
      symbol: string;
      units: string;
      qualifierColumn?: string;
      detectionLimitColumn?: string;
    }>;
    qcFlag?: string;
    batch?: string;
    date?: string;
    lab?: string;
    method?: string;
    reviewed: boolean;
    reviewedAt?: string;
  };
  sampleMedium?: string;
  lab?: string;
  analyticalMethod?: string;
  radioQuantity?: string;
  correctionHistory?: string;
  acquisitionPlatform?: string;
  instrument?: string;
  cellSizeM?: number;
  dtNs?: number;
  dxM?: number;
  antennaMHz?: number;
  velocityMs?: number;
  wellId?: string;
  curves?: string[];
  curveUnits?: string[];
  nullValue?: number;
  startDepth?: number;
  stopDepth?: number;
  step?: number;
  wrap?: string;
  lasVersion?: string;
  depthIndex?: string;
  depthUnits?: string;
  collarX?: number;
  collarY?: number;
  collarZ?: number;
  coordinateKind?: "geographic" | "easting-northing" | "unknown";
  locationQuality?: "documented" | "user-confirmed" | "missing";
  collarMappable?: boolean;
  geometryTypes?: string[];
  attributeNames?: string[];
  vectorRole?: {
    role: "geology" | "structure" | "tenure" | "alteration" | "mine-feature" | "sample-location" | "generic-vector";
    reviewed: boolean;
    reviewedAt?: string;
    source: "user-assigned" | "unassigned";
  };
  geojsonContract?: "rfc7946" | "legacy-geojson" | "g-aid-custom-import";
  crsSource?: "rfc7946" | "legacy-crs" | "companion-prj" | "epsg-comment" | "user-confirmed";
  axisOrder?: "lon-lat" | "lat-lon" | "east-north" | "unknown";
  coordinateOrder?: "lon-lat" | "lat-lon" | "east-north" | "unknown";
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
    applyIntermediateZone?: boolean;
    applyFarZone?: boolean;
    intermediateRadiusM?: number;
    farRadiusM?: number;
    outerCellSizeM?: number;
    zonedPlanarOffered?: boolean;
    zonedPlanarApproved?: boolean;
    requestIntent?: string;
    productName?: string;
    velocityMs?: number;
    fLowHz?: number;
    fHighHz?: number;
    applyDewow?: boolean;
    dewowWindow?: number;
    applyTimeZero?: boolean;
    timeZeroThreshold?: number;
    applySecGain?: boolean;
    secPower?: number;
    secExp?: number;
    applyBandpass?: boolean;
    filterOrder?: number;
    selectedCurves?: string;
    collarCrsConfirmed?: boolean;
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
    radioMapping?: {
      x: string;
      y: string;
      line: string;
      k?: string;
      eu?: string;
      eth?: string;
      tc?: string;
      reviewed: boolean;
      reviewedAt?: string;
    };
    geochemMapping?: {
      sampleId: string;
      x: string;
      y: string;
      medium?: string;
      elements: Array<{
        column: string;
        symbol: string;
        units: string;
        qualifierColumn?: string;
        detectionLimitColumn?: string;
      }>;
      qcFlag?: string;
      batch?: string;
      date?: string;
      lab?: string;
      method?: string;
      reviewed: boolean;
      reviewedAt?: string;
    };
    displayTransform?: string;
    displayTransformApproved?: boolean;
    displayElement?: string;
    approved?: boolean;
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
  "nearZoneTerrain",
  "intermediateZoneTerrain",
  "farZoneTerrain",
  "ert",
  "ertInvert",
  "seismic",
  "radiometrics",
  "gpr",
  "borehole",
  "gisVector",
  "geochem",
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

export const GRAVITY_STEP_KEYS = [
  "gravity",
  "residual",
  "nearZoneTerrain",
  "intermediateZoneTerrain",
  "farZoneTerrain",
] as const satisfies readonly StepKey[];

export const ERT_STEP_KEYS = ["ert", "ertInvert"] as const satisfies readonly StepKey[];

export const RADIO_STEP_KEYS = ["radiometrics"] as const satisfies readonly StepKey[];

export const GPR_STEP_KEYS = ["gpr"] as const satisfies readonly StepKey[];

export const BOREHOLE_STEP_KEYS = ["borehole"] as const satisfies readonly StepKey[];

export const GIS_STEP_KEYS = ["gisVector"] as const satisfies readonly StepKey[];

export const GEOCHEM_STEP_KEYS = ["geochem"] as const satisfies readonly StepKey[];

export const UNSUPPORTED_STEP_KEYS = ["seismic"] as const satisfies readonly StepKey[];

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
  nearZoneTerrain: ["gravity_terrain"],
  intermediateZoneTerrain: ["gravity_terrain"],
  farZoneTerrain: ["gravity_terrain"],
  ert: ["ert_ingest", "ert_pseudosection", "ert_gis_export", "ert_interpret"],
  ertInvert: ["ert_invert"],
  seismic: ["seismic_process"],
  radiometrics: ["rad_ingest", "rad_grid", "rad_ternary", "rad_ratios", "rad_gis_export", "rad_interpret"],
  gpr: ["gpr_ingest", "gpr_process", "gpr_interpret"],
  borehole: ["las_ingest", "borehole_view", "borehole_interpret"],
  gisVector: ["vector_ingest", "vector_view", "vector_interpret"],
  geochem: ["geochem_ingest", "geochem_qc", "geochem_map_points", "geochem_summary", "geochem_interpret"],
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

export function radiometricsStepsEnabled(steps: PlanSteps): boolean {
  return RADIO_STEP_KEYS.some((key) => steps[key]);
}

export function gprStepsEnabled(steps: PlanSteps): boolean {
  return GPR_STEP_KEYS.some((key) => steps[key]);
}

export function boreholeStepsEnabled(steps: PlanSteps): boolean {
  return BOREHOLE_STEP_KEYS.some((key) => steps[key]);
}

export function gisVectorStepsEnabled(steps: PlanSteps): boolean {
  return GIS_STEP_KEYS.some((key) => steps[key]);
}

export function geochemStepsEnabled(steps: PlanSteps): boolean {
  return GEOCHEM_STEP_KEYS.some((key) => steps[key]);
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
  { key: "gis", re: /\bgeotiff\b|\bgis export\b|\bflight.?path\.geojson\b|\bwrite (?:the )?geojson\b/i },
  { key: "gravity", re: /\bbouguer\b|\bfree[ -]?air\b|\blatitude\b/i },
  { key: "farZoneTerrain", re: /\bfar[\s-]?zone\s+terrain/i },
  { key: "intermediateZoneTerrain", re: /\bintermediate[\s-]?zone\s+terrain|\bhayford|\bbowie|\b166\.?7\s*km|\b167\s*km/i },
  { key: "nearZoneTerrain", re: /\bnear[\s-]?zone\s+terrain|\bterrain[\s-]?correct(?:ed|ion)?\s+bouguer|\bterrain\s+correct|\bzoned planar terrain-corrected bouguer\b/i },
  { key: "residual", re: /\bregional\b.*\bresidual\b|\bresidual gravity\b/i },
  { key: "ertInvert", re: /\binvert(?:ing|ed)? the ert\b|\bert inversion\b|\b2d invert/i },
  { key: "ert", re: /\bpseudosection\b|\bert\b|\bresistivity\b/i },
  { key: "seismic", re: /\bseg-?y\b|\bseismic\b/i },
  { key: "radiometrics", re: /\bradiometr/i },
  { key: "gpr", re: /\bgpr\b|ground[ -]?penetrating/i },
  { key: "borehole", re: /\bborehole\b|\bwell[ -]?log\b|\blas\b|cwls/i },
  { key: "gisVector", re: /\bgeojson\b|\bshapefile\b|\bgeopackage\b|\bvector overlay\b|\bspatial overlap\b|\bgeology layer\b|\btenure layer\b/i },
  { key: "geochem", re: /\bgeochem|\bassays?\b|\bsoil samples?\b|\bstream[\s-]?sediments?\b|\brock[\s-]?chips?\b/i },
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
    case "nearZoneTerrain":
      return "Apply near-zone Nagy terrain correction on the bound DEM";
    case "intermediateZoneTerrain":
      return "Apply intermediate-zone planar Nagy terrain on the bound DEM (clipped; not Hayford–Bowie compartments)";
    case "farZoneTerrain":
      return "Apply far-zone planar Nagy terrain only if the bound DEM covers the requested radius beyond 166.7 km";
    case "residual":
      return "Separate regional and residual gravity";
    case "ert":
      return "Ingest ERT and build a labelled pseudosection (not a depth model)";
    case "ertInvert":
      return "Run the experimental 2-D invert (not production, not Res2DInv, not 3-D; off by default)";
    case "seismic":
      return "Process the SEG-Y (filter, gain, spectrum)";
    case "radiometrics":
      return "Ingest already-corrected radiometric K/eU/eTh/TC, grid, and evidence-bound maps (not height/stripping/NASVD)";
    case "gpr":
      return "Ingest G-AID GPR 1.0, dewow/time-zero/SEC/bandpass, and write a two-way-time radargram (not depth, not utilities)";
    case "borehole":
      return "Ingest CWLS LAS 2.0 WRAP.NO, view measured-depth logs, and write evidence-bound interpretation limits (not lithology or a well path)";
    case "gisVector":
      return "Ingest documented GeoJSON vectors, display source geometry, and write evidence-bound interpretation limits (not geology proof or mineral targets)";
    case "geochem":
      return "Ingest G-AID GEOCHEM 1.0 assays, QC censored below-detection values, map sample points, and write evidence-bound interpretation limits (not ore or drill targets)";
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
  applyIntermediateZone?: boolean;
  applyFarZone?: boolean;
  intermediateRadiusM?: number;
  farRadiusM?: number;
  requestIntent?: string;
  productName?: string;
  velocityMs?: number;
  fLowHz?: number;
  fHighHz?: number;
  applyDewow?: boolean;
  dewowWindow?: number;
  applyTimeZero?: boolean;
  applySecGain?: boolean;
  applyBandpass?: boolean;
  filterOrder?: number;
  secPower?: number;
}): string {
  const target = opts.targetFolder || "(opened folder)";
  const capabilityIds = opts.capabilities?.length
    ? opts.capabilities
    : capabilitiesFromSteps(opts.steps as unknown as Record<string, boolean>);
  const dag = opts.dag || compileCapabilityDag(capabilityIds);
  const items = workItems(opts.steps, target, opts.baseReference);
  const products = opts.productsRel || `G-AID Output/${opts.taskFolder}`;
  const notes = (opts.notes || []).filter(Boolean);
  if (opts.steps.nearZoneTerrain || opts.steps.intermediateZoneTerrain || opts.steps.farZoneTerrain) {
    const zoned = Boolean(opts.steps.intermediateZoneTerrain || opts.steps.farZoneTerrain);
    for (const line of zoned ? ZONED_TERRAIN_STATEMENTS : NEAR_ZONE_STATEMENTS) {
      if (!notes.includes(line)) notes.push(line);
    }
    const bullard = opts.applyBullardB
      ? "Bullard B / spherical-cap curvature: enabled (LaFehr 1991)."
      : "Bullard B / spherical-cap curvature: off unless requested.";
    if (!notes.includes(bullard)) notes.push(bullard);
  }
  if (radiometricsStepsEnabled(opts.steps)) {
    for (const line of RADIO_STATEMENTS) {
      if (!notes.includes(line)) notes.push(line);
    }
  }
  if (gprStepsEnabled(opts.steps)) {
    for (const line of GPR_STATEMENTS) {
      if (!notes.includes(line)) notes.push(line);
    }
  }
  if (boreholeStepsEnabled(opts.steps)) {
    for (const line of BOREHOLE_STATEMENTS) {
      if (!notes.includes(line)) notes.push(line);
    }
  }
  if (gisVectorStepsEnabled(opts.steps)) {
    for (const line of GIS_STATEMENTS) {
      if (!notes.includes(line)) notes.push(line);
    }
  }
  if (geochemStepsEnabled(opts.steps)) {
    for (const line of GEOCHEM_STATEMENTS) {
      if (!notes.includes(line)) notes.push(line);
    }
  }
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
  const ertInputs = (opts.inputs || []).some((item) => item.adapterId === "ert-dat" || item.adapterId === "ert-csv");
  const radioInputs = (opts.inputs || []).some(
    (item) => item.adapterId === "radiometric-csv" || item.adapterId === "radiometric-xyz"
  );
  const gprInputs = (opts.inputs || []).some((item) => item.adapterId === "gpr-csv");
  const lasInputs = (opts.inputs || []).some((item) => item.adapterId === "las-well");
  const gisInputs = (opts.inputs || []).some((item) => item.adapterId === "geojson");
  const geochemInputs = (opts.inputs || []).some((item) => item.adapterId === "geochem-csv" || item.adapterId === "geochem-xyz");
  const mixedCount = [magInputs, gravInputs, ertInputs, radioInputs, gprInputs, lasInputs, gisInputs, geochemInputs].filter(Boolean).length;
  const mixed = mixedCount > 1;
  const field = [
    typeof opts.inclination === "number" ? `Inclination: ${opts.inclination}°` : "",
    typeof opts.declination === "number" ? `Declination: ${opts.declination}°` : "",
    typeof opts.density === "number" ? `Bouguer density: ${opts.density} g/cm³ (user-confirmed, not assumed)` : "",
    typeof opts.surveyLatitude === "number" ? `Survey latitude: ${opts.surveyLatitude}° (Somigliana; easting/northing is not latitude)` : "",
    opts.elevationDatum ? `Elevation datum: ${opts.elevationDatum}` : "",
    typeof opts.velocityMs === "number" ? `GPR migration velocity: ${opts.velocityMs} m/s (user-supplied, not assumed)` : "",
    gprStepsEnabled(opts.steps)
      ? `GPR processing (frozen): dewow ${opts.applyDewow === false ? "off" : `on (window ${opts.dewowWindow ?? DEFAULT_DEWOW_WINDOW})`}; time-zero ${opts.applyTimeZero === false ? "off" : "on (stack first-break threshold)"}; SEC ${opts.applySecGain === false ? "off" : `on (n=${opts.secPower ?? DEFAULT_SEC_POWER})`}; band-pass ${opts.applyBandpass === false ? "off" : "on (Nyquist-validated Butterworth)"}; filter order ${opts.filterOrder ?? DEFAULT_FILTER_ORDER}. A visually enhanced radargram does not have improved geological certainty.`
      : "",
    gprStepsEnabled(opts.steps)
      ? gprFrozenNyquistLine({
          dtNs: (opts.inputs || []).find((item) => item.adapterId === "gpr-csv" && typeof item.dtNs === "number")?.dtNs,
          antennaMHz: (opts.inputs || []).find((item) => item.adapterId === "gpr-csv" && typeof item.antennaMHz === "number")?.antennaMHz,
          fLowHz: opts.fLowHz,
          fHighHz: opts.fHighHz,
          applyBandpass: opts.applyBandpass,
        })
        : "",
    boreholeStepsEnabled(opts.steps)
      ? "Borehole product: CWLS LAS 2.0 WRAP.NO measured-depth log. Depth is not TVD. A collar is mapped only with coordinates and CRS."
      : "",
    gisVectorStepsEnabled(opts.steps)
      ? "GIS product: documented GeoJSON source layers. Roles are user-assigned. Spatial overlap is geometric coincidence, not geological proof."
      : "",
    geochemStepsEnabled(opts.steps)
      ? "Geochemistry product: G-AID GEOCHEM 1.0 assays. Below-detection stays censored. High values are observations, not ore."
      : "",
    opts.applyBullardB ? "Bullard B: enabled" : gravityStepsEnabled(opts.steps) ? "Bullard B: off unless requested" : "",
    opts.requestIntent ? `Frozen request intent: ${opts.requestIntent}` : "",
    opts.steps.farZoneTerrain
      ? typeof opts.farRadiusM === "number"
        ? `Product: ${ZONED_PLANAR_PRODUCT_NAME}. Far radius: ${opts.farRadiusM} m, applied only if the bound DEM covers it. Atmospheric correction off.`
        : "Far-zone radius: required to attempt far-zone TC. G-AID will not download a global DEM."
      : opts.steps.intermediateZoneTerrain
        ? `Product: ${ZONED_PLANAR_PRODUCT_NAME} (planar Nagy on the bound DEM, default outer 166.7 km clipped to DEM). Hayford–Bowie compartments are not implemented.`
        : opts.steps.nearZoneTerrain
      ? typeof opts.terrainRadiusM === "number"
        ? `Product: near-zone terrain-corrected Bouguer anomaly. Terrain radius: ${opts.terrainRadiusM} m (Nagy prisms). Far-zone and intermediate-zone terrain are not applied.`
        : opts.useDemExtent
          ? "Product: near-zone terrain-corrected Bouguer anomaly. Terrain window: bound DEM extent (still near-zone only). Far-zone/intermediate-zone not applied."
          : "Near-zone terrain radius: required before Proceed (or say use DEM extent). Far-zone is skipped without a covering DEM."
      : gravityStepsEnabled(opts.steps)
        ? "Anomaly: simple Bouguer (infinite slab). Terrain correction is off unless a named terrain plan is approved."
        : "",
  ].filter(Boolean);
  const thisRunFallback = geochemStepsEnabled(opts.steps)
    ? "- Ask for a registered geochemistry, GIS vector, borehole, GPR, radiometric, ERT, gravity, or magnetic method I can run. Seismic is not in this release."
    : gisVectorStepsEnabled(opts.steps)
    ? "- Ask for a registered GIS vector, borehole, GPR, radiometric, ERT, gravity, or magnetic method I can run. Seismic is not in this release."
    : boreholeStepsEnabled(opts.steps)
    ? "- Ask for a registered borehole, GPR, radiometric, ERT, gravity, or magnetic method I can run. Seismic is not in this release."
    : gprStepsEnabled(opts.steps)
    ? "- Ask for a registered GPR, borehole, radiometric, ERT, gravity, or magnetic method I can run. Seismic is not in this release."
    : radiometricsStepsEnabled(opts.steps)
    ? "- Ask for a registered radiometric, ERT, gravity, magnetic, GPR, or borehole method I can run. Seismic is not in this release."
    : ertStepsEnabled(opts.steps)
    ? "- Ask for a registered ERT, gravity, magnetic, radiometric, GPR, or borehole method I can run. Seismic is not in this release."
    : gravityStepsEnabled(opts.steps)
    ? "- Ask for a gravity, magnetic, ERT, radiometric, GPR, or borehole method I can run. Seismic is not in this release."
    : "- Ask for a magnetic method I can run (diurnal, IGRF, grid, RTP), a gravity reduction, ERT, already-corrected radiometrics, G-AID GPR 1.0, or a CWLS LAS 2.0 well log. Seismic is not in this release.";

  return `# Implementation Plan

**Survey:** ${opts.projectName}
**Target:** ${target}
**Products:** \`${products}/\`

## This run
${items.join("\n") || thisRunFallback}

## Bound inputs
${bound.length ? bound.join("\n") : "- No supported catalog records bound. Bind MagArrow/GSM-19, gravity-contract, dem-ascii, ERT-contract, RAD-contract, GPR-contract, LAS 2.0, documented GeoJSON, and/or G-AID GEOCHEM 1.0 catalog IDs before Proceed."}

## Parameters
- Base station reference: ${baseRefLabel(opts.baseReference)}
${field.map((line) => `- ${line}`).join("\n")}

## Compiled DAG
${dagLines.join("\n") || "- (none)"}

## Expected artifacts
${artifacts.length ? [...new Set(artifacts)].join("\n") : "- None until a registered capability is approved."}

## Assumptions and limits
${limits.length ? [...new Set(limits)].join("\n") : "- Only registered magnetic, gravity, ERT, radiometric, GPR, borehole, GIS, and geochemistry capabilities run."}
${mixed ? "- Products from different methods may display together. Joint inversion and combined interpretation are not registered capabilities.\n" : ""}${mixed && geochemInputs && gisInputs ? "- Spatial association of assays with geology or other vector layers is geometric coincidence, not causal evidence.\n" : ""}${notes.length ? notes.map((note) => `- ${note}`).join("\n") : ""}

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
  if (tagged) {
    const raw = tagged[1];
    if (STEP_KEYS.includes(raw as StepKey)) return raw as StepKey;
  }
  const stripped = line.replace(/<!--.*?-->/g, "").replace(/^[-*]\s+(\[[ xX~!s]?\]\s*)?/, "").trim();
  if (!stripped || stripped.startsWith("Ask for a specific")) return undefined;
  const completeAsk = /\bcomplete\s+bouguer\b/i.test(stripped) && !/\bzoned planar terrain-corrected bouguer/i.test(stripped);
  for (const row of STEP_FALLBACK) {
    if (completeAsk && (row.key === "nearZoneTerrain" || row.key === "intermediateZoneTerrain" || row.key === "farZoneTerrain")) {
      continue;
    }
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
  let proposed = proposeCapabilitiesFromMessage(raw, previous);
  if (
    proposed.includes("borehole.ingest_las") &&
    !proposed.includes("borehole.map_collar") &&
    (plan.inputs || []).some((item) => item.adapterId === "las-well" && (item.crs || item.collarMappable))
  ) {
    proposed = [...proposed, "borehole.map_collar"];
  }
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
  const intRadius = raw.match(/intermediate(?:[\s-]?zone)?\s*radius[:\s=]+(\d+(?:\.\d+)?)\s*(km|m)\b/i);
  if (intRadius) {
    const value = parseFloat(intRadius[1]);
    parameters.intermediateRadiusM = intRadius[2].toLowerCase() === "km" ? value * 1000 : value;
  } else if (/\b(166\.7|167)\s*km\b/i.test(raw) && /\b(hayford|bowie|intermediate|complete\s+bouguer|terrain)\b/i.test(raw)) {
    parameters.intermediateRadiusM = 166700;
  }
  const farRadius = raw.match(/far(?:[\s-]?zone)?\s*radius[:\s=]+(\d+(?:\.\d+)?)\s*(km|m)\b/i);
  if (farRadius) {
    const value = parseFloat(farRadius[1]);
    parameters.farRadiusM = farRadius[2].toLowerCase() === "km" ? value * 1000 : value;
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
    if (parameters.radioMapping) parameters.radioMapping = { ...parameters.radioMapping, reviewed: true };
    if (parameters.geochemMapping) parameters.geochemMapping = { ...parameters.geochemMapping, reviewed: true };
  }
  if (/\b(approve(?:d)? (?:the )?(?:log10|log transform|display transform)|display transform approved)\b/i.test(raw)) {
    parameters.displayTransform = "log10";
    parameters.displayTransformApproved = true;
    parameters.approved = true;
  }
  const inc = raw.match(/\binclination\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i);
  const dec = raw.match(/\bdeclination\s*[:=]?\s*(-?\d+(?:\.\d+)?)/i);
  if (inc) parameters.inclination = parseFloat(inc[1]);
  if (dec) parameters.declination = parseFloat(dec[1]);
  const velMs = raw.match(/\bvelocity[:\s=]+(\d+(?:\.\d+)?)\s*m\s*\/\s*s\b/i) || raw.match(/\b(\d+(?:\.\d+)?)\s*m\s*\/\s*s\b/i);
  const velMns = raw.match(/\bvelocity[:\s=]+(\d+(?:\.\d+)?)\s*m\s*\/\s*ns\b/i) || raw.match(/\b(\d+(?:\.\d+)?)\s*m\s*\/\s*ns\b/i);
  if (velMns && /\b(gpr|migrat|radar)\b/i.test(raw)) parameters.velocityMs = parseFloat(velMns[1]) * 1e9;
  else if (velMs && /\b(gpr|migrat|radar|velocity)\b/i.test(raw)) parameters.velocityMs = parseFloat(velMs[1]);
  if (!(typeof parameters.velocityMs === "number" && parameters.velocityMs > 0)) {
    const documented = (plan.inputs || []).find((item) => typeof item.velocityMs === "number" && item.velocityMs > 0);
    if (documented?.velocityMs) parameters.velocityMs = documented.velocityMs;
  }
  const fLow = raw.match(/\bfLow(?:Hz)?[:\s=]+(\d+(?:\.\d+)?)/i);
  const fHigh = raw.match(/\bfHigh(?:Hz)?[:\s=]+(\d+(?:\.\d+)?)/i);
  if (fLow) parameters.fLowHz = parseFloat(fLow[1]);
  if (fHigh) parameters.fHighHz = parseFloat(fHigh[1]);
  if (/\b(skip|omit|without|no)\b.{0,24}\bdewow/.test(m)) parameters.applyDewow = false;
  if (/\b(skip|omit|without|no)\b.{0,24}\btime[\s-]?zero/.test(m)) parameters.applyTimeZero = false;
  if (/\b(skip|omit|without|no)\b.{0,24}\b(sec\s+)?gain\b/.test(m) && !/\bband/.test(m)) parameters.applySecGain = false;
  if (/\b(skip|omit|without|no)\b.{0,24}\b(band[\s-]?pass|bandpass|filter)\b/.test(m)) parameters.applyBandpass = false;
  const dewowWin = raw.match(/\bdewow window[:\s=]+(\d+)/i);
  if (dewowWin) parameters.dewowWindow = parseInt(dewowWin[1], 10);
  if (/\b(confirm(?:ed)? (?:the )?collar crs|collar crs confirmed|treat (?:lat|long|location).{0,40}epsg:?\s*4326)\b/i.test(raw)) {
    parameters.collarCrsConfirmed = true;
  }
  const selected = raw.match(/\bselect(?:ed)? curves?[:\s]+([A-Za-z0-9_,\s]+)/i);
  if (selected) parameters.selectedCurves = selected[1].trim();
  const ford = raw.match(/\bfilter order[:\s=]+(\d+)/i);
  if (ford) parameters.filterOrder = parseInt(ford[1], 10);
  const tzTh = raw.match(/\btime[\s-]?zero threshold[:\s=]+(\d+(?:\.\d+)?)/i);
  if (tzTh) parameters.timeZeroThreshold = parseFloat(tzTh[1]);

  const zonedOk = isZonedPlanarApproval(raw, Boolean(parameters.zonedPlanarOffered));
  if (zonedOk) {
    const granted = new Set(proposed);
    for (const id of GRAVITY_DEFAULT) granted.add(id);
    granted.add("grav.terrain_near_zone");
    granted.add("grav.terrain_intermediate_zone");
    granted.add("grav.terrain_far_zone");
    proposed = USER_CAPABILITY_IDS.filter((id) => granted.has(id));
    parameters.zonedPlanarApproved = true;
    parameters.applyIntermediateZone = true;
    parameters.applyFarZone = true;
    parameters.requestIntent = ZONED_PLANAR_PRODUCT_NAME;
    parameters.productName = ZONED_PLANAR_PRODUCT_NAME;
  } else if (isCompleteBouguerRequest(raw)) {
    const priorTerrain = new Set(previous.filter((id) => id.startsWith("grav.terrain_")));
    proposed = proposed.filter((id) => !id.startsWith("grav.terrain_") || priorTerrain.has(id));
    parameters.zonedPlanarOffered = true;
    if (!parameters.zonedPlanarApproved) parameters.zonedPlanarApproved = false;
    if (!priorTerrain.size) {
      parameters.requestIntent = "simple Bouguer";
      parameters.productName = "simple Bouguer";
    }
    decisions.push({
      at: now,
      message: raw,
      status: "refused",
      capabilityId: "complete-bouguer",
      reason: COMPLETE_BOUGUER_REFUSAL,
    });
    notes.push(ZONED_PLANAR_OFFER);
  }

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
        (id === "grav.bouguer" ||
          id === "grav.terrain_near_zone" ||
          id === "grav.terrain_intermediate_zone" ||
          id === "grav.terrain_far_zone") &&
        !(typeof parameters.density === "number" && Number.isFinite(parameters.density));
      const needsTerrain =
        id === "grav.terrain_near_zone" &&
        !parameters.useDemExtent &&
        !(typeof parameters.terrainRadiusM === "number" && Number.isFinite(parameters.terrainRadiusM));
      const needsVelocity =
        id === "gpr.migrate" &&
        GPR_MIGRATION_BENCHMARK_PASSED &&
        !(typeof parameters.velocityMs === "number" && Number.isFinite(parameters.velocityMs) && parameters.velocityMs > 0);
      const migrateBlocked = id === "gpr.migrate" && !GPR_MIGRATION_BENCHMARK_PASSED;
      decisions.push({
        at: now,
        message: raw,
        status: needsRtpParams || needsDensity || needsTerrain || needsVelocity ? "needs-data" : migrateBlocked ? "refused" : "accepted",
        capabilityId: id,
        reason: needsRtpParams
          ? "RTP was requested. It needs mag.igrf or explicit inclination/declination before Proceed."
          : needsDensity
            ? "Bouguer correction was requested. Supply a density in g/cm³. I will not assume 2.67."
            : needsTerrain
              ? "Near-zone terrain-corrected Bouguer needs a documented DEM and a terrain radius (or use DEM extent). Far-zone is skipped without a covering DEM."
              : needsVelocity
                ? "Kirchhoff time migration needs a user-supplied velocity in m/s. I will not assume 0.1 m/ns."
                : id === "grav.terrain_near_zone" && parameters.zonedPlanarApproved
                  ? `Accepted alternative implementation plan: ${ZONED_PLANAR_PRODUCT_NAME}. Frozen request intent is zoned planar terrain.`
                : id === "grav.terrain_intermediate_zone"
                  ? `Accepted intermediate-zone planar Nagy on the bound DEM (default outer 166.7 km, clipped) as part of ${ZONED_PLANAR_PRODUCT_NAME}.`
                : id === "grav.terrain_far_zone"
                  ? `Accepted far-zone planar Nagy only if the bound DEM covers farRadiusM beyond 166.7 km. Missing global DEM is not a silent pass.`
                : id === "ert.invert2d"
                  ? "Accepted experimental ert.invert2d. This is not a production inversion pack. Independent two-layer true resistivities are not recovered. Not Res2DInv. Default ERT work is ingest and pseudosection only."
                : id === "rad.ingest"
                  ? "Accepted radiometric ingest of already-corrected G-AID RAD 1.0 tables. Height correction, stripping, NASVD, dead-time, background, and concentration conversion are not live capabilities."
                : id === "gpr.ingest"
                  ? "Accepted G-AID GPR 1.0 ingest. Arbitrary DZT files stay recognised-unsupported."
                : id === "gpr.migrate"
                  ? GPR_MIGRATION_BENCHMARK_PASSED
                    ? "Accepted Kirchhoff time migration only with a user-supplied velocity after the documented diffraction benchmark passed. Velocity is not assumed from AntennaMHz."
                    : "Kirchhoff time migration is unavailable until the documented diffraction benchmark passes."
                : id === "gpr.process"
                  ? "Accepted GPR process. Dewow, time-zero, SEC, and band-pass are optional frozen parameters. Band-pass corners are validated against Nyquist from dt_ns."
                : id === "borehole.ingest_las"
                  ? "Accepted CWLS LAS 2.0 WRAP.NO ingest. LASF LiDAR, WRAP.YES, and LAS 3.0 stay recognised-unsupported. Curve meaning is not invented from mnemonics."
                : id === "borehole.view_logs"
                  ? "Accepted borehole log viewing as measured depth. This is not TVD or a well trajectory."
                : id === "borehole.map_collar"
                  ? "Accepted collar mapping only with documented or user-confirmed CRS. Vertical logs without location stay unmapped."
                : id === "borehole.interpret"
                  ? "Accepted evidence-bound borehole interpretation limits. Lithology, aquifers, mineralisation, and drill targeting are not established."
                : id === "gis.vector_ingest"
                  ? "Accepted documented GeoJSON ingest. Shapefile and GeoPackage stay recognised-unsupported. Filename geology labels are not assigned as roles."
                : id === "gis.vector_view"
                  ? "Accepted source vector viewing. Overlay is not geological proof."
                : id === "gis.spatial_overlap"
                  ? "Accepted same-CRS geometric overlap table. Coincidence is not a mineral or causal relationship."
                : id === "gis.export_vector"
                  ? "Accepted GeoJSON export. Shapefile/GeoPackage writers are not implemented."
                : id === "gis.interpret"
                  ? "Accepted evidence-bound GIS interpretation limits. Mineral targets, prospectivity, resources, and drill recommendations are not established from overlays."
                : id === "geochem.ingest"
                  ? "Accepted G-AID GEOCHEM 1.0 ingest. An arbitrary CSV with Fe/Cu/Au columns is not geochemistry. Below-detection stays censored."
                : id === "geochem.qc"
                  ? "Accepted geochemistry QC. Blanks/standards/duplicates are summarised only when those records and expected-value rules are present."
                : id === "geochem.map_points"
                  ? "Accepted sample-point mapping only with a documented CRS. High values are observations, not ore."
                : id === "geochem.summary"
                  ? "Accepted uncensored summary statistics. Mixed or unknown units block direct comparison."
                : id === "geochem.display_transform"
                  ? "Accepted display-only log10 of strictly positive uncensored values. Originals are preserved. This is not an anomaly score."
                : id === "geochem.interpret"
                  ? "Accepted evidence-bound geochemistry interpretation limits. Ore, economic grade, mineralisation, and drill targets are not established."
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
  });

  const dag = compileCapabilityDag(proposed);
  if (proposed.includes("grav.terrain_intermediate_zone")) parameters.applyIntermediateZone = true;
  if (proposed.includes("grav.terrain_far_zone")) parameters.applyFarZone = true;
  if (proposed.includes("geochem.display_transform") && parameters.displayTransformApproved) {
    parameters.displayTransform = parameters.displayTransform || "log10";
    parameters.approved = true;
  }
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
  if (plan.steps.seismic) {
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
  if (gprStepsEnabled(steps) && (magneticStepsEnabled(steps) || gravityStepsEnabled(steps) || ertStepsEnabled(steps) || radiometricsStepsEnabled(steps))) {
    notes.push(
      "GPR products may display with magnetic, gravity, ERT, or radiometric maps. Joint inversion is not a registered capability."
    );
  }
  if (boreholeStepsEnabled(steps) && (magneticStepsEnabled(steps) || gravityStepsEnabled(steps) || ertStepsEnabled(steps) || radiometricsStepsEnabled(steps) || gprStepsEnabled(steps))) {
    notes.push(
      "Borehole products may display with magnetic, gravity, ERT, radiometric, or GPR maps. A collar overlay is coincidence, not a joint interpretation."
    );
  }
  if (gisVectorStepsEnabled(steps) && (magneticStepsEnabled(steps) || gravityStepsEnabled(steps) || ertStepsEnabled(steps) || radiometricsStepsEnabled(steps) || gprStepsEnabled(steps) || boreholeStepsEnabled(steps))) {
    notes.push(
      "Vector layers may display with magnetic, gravity, ERT, radiometric, GPR, or borehole maps. Spatial overlap is geometric coincidence, not a joint geological or mineral interpretation."
    );
  }
  if (geochemStepsEnabled(steps) && (magneticStepsEnabled(steps) || gravityStepsEnabled(steps) || ertStepsEnabled(steps) || radiometricsStepsEnabled(steps) || gprStepsEnabled(steps) || boreholeStepsEnabled(steps) || gisVectorStepsEnabled(steps))) {
    notes.push(
      "Geochemical samples may display with magnetic, gravity, ERT, radiometric, GPR, borehole, or vector maps. Spatial association is coincidence, not causal evidence or mineralisation proof."
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
        "Recognised-unsupported and unknown files cannot be processing inputs. Bind supported MagArrow, GSM-19, gravity-contract, dem-ascii, ERT-contract, or RAD-contract catalog records only.",
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

  if (unsupportedStepsEnabled(plan.steps) && !magneticStepsEnabled(plan.steps) && !gravityStepsEnabled(plan.steps) && !ertStepsEnabled(plan.steps) && !radiometricsStepsEnabled(plan.steps) && !gprStepsEnabled(plan.steps) && !boreholeStepsEnabled(plan.steps) && !gisVectorStepsEnabled(plan.steps) && !geochemStepsEnabled(plan.steps)) {
    blockers.push({
      level: "blocker",
      code: "unsupported_method",
      message:
        "That method is not in this release. G-AID can run MagArrow + GSM-19 magnetics, a gravity-contract pack, supported ERT ingest and a labelled pseudosection, already-corrected radiometric ingest, G-AID GPR 1.0, CWLS LAS 2.0 well logs, documented GeoJSON vectors, or G-AID GEOCHEM 1.0 assays after you click Proceed. 2-D ERT inversion is experimental and is not a production pack. Seismic is not available yet. Height correction, stripping, NASVD, and concentration conversion are not live radiometric capabilities. Lithology classification and well trajectories are not live borehole capabilities. Shapefile/GeoPackage ingest, buffer/clip/dissolve, and mineral targeting from overlays are not live GIS capabilities. Anomaly detection, prospectivity, targeting, and resource estimation are not live geochemistry capabilities.",
    });
  } else if (unsupportedStepsEnabled(plan.steps)) {
    warnings.push({
      level: "warning",
      code: "unsupported_method",
      message: "Extra unregistered methods in this plan will not run. Only the compiled magnetic/gravity/ERT/radiometric/GPR/borehole/GIS/geochemistry DAG is executed.",
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

  if (radiometricsStepsEnabled(plan.steps)) {
    const radioFiles = inputs.filter(
      (item) =>
        item.adapterId === "radiometric-csv" ||
        item.adapterId === "radiometric-xyz" ||
        item.kind === "radiometric-csv" ||
        item.kind === "radiometric-xyz"
    );
    if (inputs.length === 0) {
      blockers.push({
        level: "blocker",
        code: "no_radio_files",
        message:
          "Radiometric processing needs a supported RAD-contract catalog record (documented already-corrected K/eU/eTh/TC with CRS, units, Line, acquisition metadata, and CorrectionHistory). I will not take a file because it has K, U, or Th columns.",
      });
    } else if (radioFiles.length === 0) {
      blockers.push({
        level: "blocker",
        code: "no_radio_files",
        message:
          "Radiometric processing needs a supported radiometric-csv or radiometric-xyz catalog record. Assay tables and raw spectrometer files are not processing inputs.",
      });
    }
  }

  if (gprStepsEnabled(plan.steps)) {
    const gprFiles = inputs.filter((item) => item.adapterId === "gpr-csv" || item.kind === "gpr-csv");
    if (inputs.length === 0) {
      blockers.push({
        level: "blocker",
        code: "no_gpr_files",
        message:
          "GPR processing needs a supported G-AID GPR 1.0 catalog record (Units, dt_ns, dx_m, AntennaMHz). I will not take the first .dzt file.",
      });
    } else if (gprFiles.length === 0) {
      blockers.push({
        level: "blocker",
        code: "no_gpr_files",
        message:
          "GPR processing needs a supported gpr-csv catalog record. An arbitrary DZT or amplitude table is not GPR data.",
      });
    }
  }

  if (boreholeStepsEnabled(plan.steps)) {
    const lasFiles = inputs.filter((item) => item.adapterId === "las-well" || item.kind === "las-well");
    if (inputs.length === 0) {
      blockers.push({
        level: "blocker",
        code: "no_las_files",
        message:
          "Borehole processing needs a supported CWLS LAS 2.0 WRAP.NO catalog record. I will not take the first .las file or a LASF point cloud.",
      });
    } else if (lasFiles.length === 0) {
      blockers.push({
        level: "blocker",
        code: "no_las_files",
        message:
          "Borehole processing needs a supported las-well catalog record. An arbitrary .las or LASF/LAZ point cloud is not a well log.",
      });
    }
  }

  if (gisVectorStepsEnabled(plan.steps)) {
    const geoFiles = inputs.filter((item) => item.adapterId === "geojson" || item.kind === "geojson");
    if (inputs.length === 0) {
      blockers.push({
        level: "blocker",
        code: "no_geojson_files",
        message:
          "GIS vector processing needs a supported GeoJSON catalog record (RFC 7946 OGC:CRS84, legacy-GeoJSON with a validated CRS mapping, or a G-AID custom import). I will not take the first .geojson, shapefile, or GeoPackage.",
      });
    } else if (geoFiles.length === 0) {
      blockers.push({
        level: "blocker",
        code: "no_geojson_files",
        message:
          "GIS vector processing needs a supported geojson catalog record. A shapefile sidecar set or GeoPackage is not a processing input.",
      });
    }
  }

  if (geochemStepsEnabled(plan.steps)) {
    const geochemFiles = inputs.filter(
      (item) => item.adapterId === "geochem-csv" || item.adapterId === "geochem-xyz" || item.kind === "geochem-csv" || item.kind === "geochem-xyz"
    );
    if (inputs.length === 0) {
      blockers.push({
        level: "blocker",
        code: "no_geochem_files",
        message:
          "Geochemistry processing needs a supported G-AID GEOCHEM 1.0 catalog record (SampleID, X, Y, Medium, documented CRS, element units). I will not take the first CSV because it has Fe or Cu columns.",
      });
    } else if (geochemFiles.length === 0) {
      blockers.push({
        level: "blocker",
        code: "no_geochem_files",
        message:
          "Geochemistry processing needs a supported geochem-csv or geochem-xyz catalog record. An arbitrary chemistry table is not assay data.",
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
