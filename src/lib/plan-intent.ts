import { detectAnalysisIntent, type AnalysisIntent, type WorkspaceIndex } from "./workspace-index.ts";
import { EMPTY_STEPS, type PlanInput, type PlanSteps } from "./plan-spec.ts";
import type { ProjectCatalog } from "./catalog/types.ts";
import { supportedProcessingRecords } from "./catalog/summarize.ts";

function magSuite(enabled: boolean): Pick<
  PlanSteps,
  "igrf" | "headingLag" | "level" | "grid" | "derivatives" | "lineaments" | "gis"
> {
  return {
    igrf: enabled,
    headingLag: enabled,
    level: enabled,
    grid: enabled,
    derivatives: enabled,
    lineaments: enabled,
    gis: enabled,
  };
}

export function intentToSteps(
  intent: AnalysisIntent | "none" | null,
  message: string,
  previous?: PlanSteps
): PlanSteps {
  const m = message.toLowerCase();
  const onlyDiurnal =
    /\b(only|just)\s+diurnal\b|\bdiurnal\s+only\b/.test(m) ||
    (intent === "diurnal" && !/\brtp\b|\bigrf\b|\bgrid\b|\bfull\s+(mag|magnetic)\b/.test(m));
  const next: PlanSteps = { ...(previous ?? EMPTY_STEPS) };

  if (intent === "gravity" || /\bbouguer\b|\bfree[\s-]?air\b/.test(m)) {
    next.gravity = true;
    next.residual = true;
  }
  const completeBouguer = /\bcomplete\s+bouguer\b/.test(m);
  const zonedPlanar = /\bzoned planar terrain-corrected bouguer(?: anomaly)?\b/.test(m);
  if (!completeBouguer && (/\bterrain\s+correct|\bnear[\s-]?zone\s+terrain/.test(m) || zonedPlanar)) {
    next.gravity = true;
    next.nearZoneTerrain = true;
  }
  if (
    zonedPlanar ||
    (!completeBouguer && /\bintermediate[\s-]?zone\s+terrain|\bhayford|\bbowie|\b166\.?7\s*km|\b167\s*km/.test(m))
  ) {
    next.gravity = true;
    next.nearZoneTerrain = true;
    next.intermediateZoneTerrain = true;
  }
  if (zonedPlanar || (!completeBouguer && /\bfar[\s-]?zone\s+terrain/.test(m))) {
    next.gravity = true;
    next.nearZoneTerrain = true;
    next.intermediateZoneTerrain = true;
    next.farZoneTerrain = true;
  }
  if (intent === "resistivity" || /\bert\b|\bpseudosection\b|\bresistivity\b/.test(m)) {
    next.ert = true;
    next.ertInvert =
      /\binvert(?:ing|ed)?\b|\b2[\s-]?d invert|\bexperimental invert/.test(m) &&
      !/\bpseudosection only\b/.test(m);
  }
  if (intent === "seismic") next.seismic = true;
  if (intent === "radiometrics") next.radiometrics = true;
  if (intent === "gpr") next.gpr = true;

  const mag =
    intent === "diurnal" ||
    intent === "rtp" ||
    intent === "magnetic" ||
    /\bdiurnal\b|\brtp\b|\bigrf\b|\bmagnetic\b/.test(m);

  if (mag) {
    next.diurnal = true;
    if (!onlyDiurnal) {
      Object.assign(next, magSuite(true));
      next.rtp = intent === "rtp" || intent === "magnetic" || /\brtp\b/.test(m) || previous?.rtp || false;
      if (intent === "magnetic" || intent === "rtp") next.rtp = true;
      if (intent === "diurnal" && !/\brtp\b/.test(m)) {
        next.rtp = previous?.rtp || false;
      }
    }
  }
  return next;
}

export function inferIntentFromFiles(
  detected: AnalysisIntent | null,
  index: WorkspaceIndex | null,
  targetFolder: string,
  message: string
): AnalysisIntent | "none" {
  if (detected) return detected;
  const m = message.toLowerCase();
  if (/\b(bouguer|free[\s-]?air|gravity|mgal|ert|resistivity|seismic|segy|gpr|radiometr)\b/.test(m)) {
    return detectAnalysisIntent(message) || "none";
  }
  void index;
  void targetFolder;
  return "none";
}

/** Bind supported MagArrow / GSM-19 / gravity-contract catalog records. Never extension search. */
export function collectPlanInputs(
  index: WorkspaceIndex | null,
  targetFolder: string,
  catalog?: ProjectCatalog | null
): PlanInput[] {
  if (catalog) {
    return supportedProcessingRecords(catalog, targetFolder).map((record) => ({
      catalogId: record.id,
      path: record.relativePath,
      kind:
        record.adapterId === "gsm19"
          ? "gsm19-base"
          : record.adapterId === "magarrow"
            ? "magarrow"
            : record.adapterId || undefined,
      size: record.size,
      checksum: record.checksum.value,
      supportStatus: record.supportStatus,
      adapterId: record.adapterId,
      formatId: record.formatId,
      columnMapping: record.columnMapping,
      radioMapping: record.radioMapping,
      radioQuantity: record.radioQuantity,
      correctionHistory: record.correctionHistory,
      acquisitionPlatform: record.acquisitionPlatform,
      instrument: record.instrument,
      elevationDatum: record.elevationDatum,
      units: record.units,
      crs: record.crs,
      bbox: record.bbox,
      cellSizeM: record.cellSizeM,
      dtNs: record.dtNs,
      dxM: record.dxM,
      antennaMHz: record.antennaMHz,
      velocityMs: record.velocityMs,
    }));
  }
  void index;
  return [];
}
