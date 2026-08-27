import type {
  CatalogBBox,
  CatalogRecord,
  CatalogTimeRange,
  DomainHint,
  MediaClass,
  SupportStatus,
} from "../types.ts";

export interface SniffContext {
  relativePath: string;
  filename: string;
  extension: string;
  size: number;
  peek: Buffer;
  peekText: string;
  absPath?: string;
  siblingNames?: string[];
  companionPrjText?: string;
}

export interface AdapterSniff {
  confidence: number;
  formatId: string;
  mediaClass: MediaClass;
  domainHint: DomainHint;
  notes?: string[];
  parseErrors?: string[];
}

export interface CatalogInspection {
  columns?: string[];
  headerSummary?: string;
  crs?: string;
  units?: string;
  bbox?: CatalogBBox;
  cellSizeM?: number;
  timeRange?: CatalogTimeRange;
  recordCount?: number;
  parseErrors?: string[];
  supportStatus?: SupportStatus;
  columnMapping?: CatalogRecord["columnMapping"];
  radioMapping?: CatalogRecord["radioMapping"];
  geochemMapping?: CatalogRecord["geochemMapping"];
  sampleMedium?: string;
  lab?: string;
  analyticalMethod?: string;
  detectionLimitTreatment?: string;
  radioQuantity?: string;
  correctionHistory?: string;
  acquisitionPlatform?: string;
  instrument?: string;
  elevationDatum?: string;
  gravityDatum?: string;
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
  vectorRole?: CatalogRecord["vectorRole"];
  shapefileSidecars?: {
    shp: boolean;
    shx: boolean;
    dbf: boolean;
    prj: boolean;
  };
  geojsonContract?: CatalogRecord["geojsonContract"];
  crsSource?: CatalogRecord["crsSource"];
  axisOrder?: CatalogRecord["axisOrder"];
  coordinateOrder?: CatalogRecord["coordinateOrder"];
}

export interface AdapterValidation {
  ok: boolean;
  errors: string[];
}

export interface CatalogReadResult {
  ok: false;
  reason: "full-read-deferred";
  message: string;
}

/**
 * Catalog adapters sniff and inspect. Full scientific reads stay in later
 * processing packs — MagArrow/GSM-19 parsing remains in the Python pipeline.
 */
export interface CatalogAdapter {
  id: string;
  formatId: string;
  supportStatus: SupportStatus;
  sniff(ctx: SniffContext): AdapterSniff | null;
  inspect(ctx: SniffContext, sniff: AdapterSniff): CatalogInspection;
  validate(record: CatalogRecord): AdapterValidation;
  read(ctx: SniffContext): CatalogReadResult;
}

export function deferredRead(adapterId: string): CatalogReadResult {
  return {
    ok: false,
    reason: "full-read-deferred",
    message: `Adapter ${adapterId} does not load source bytes in the catalog. Full reads belong to a later processing pack.`,
  };
}

export function okIfSupported(record: CatalogRecord, adapterId: string): AdapterValidation {
  const errors: string[] = [];
  if (record.adapterId !== adapterId) errors.push(`Expected adapter ${adapterId}.`);
  if (record.supportStatus !== "supported") errors.push("Record is not a supported processing input.");
  return { ok: errors.length === 0, errors };
}

export function okIfRecognised(record: CatalogRecord, adapterId: string): AdapterValidation {
  const errors: string[] = [];
  if (record.adapterId !== adapterId) errors.push(`Expected adapter ${adapterId}.`);
  if (record.supportStatus === "supported") {
    errors.push("Recognised-unsupported adapters must not claim processing support.");
  }
  return { ok: errors.length === 0, errors };
}
