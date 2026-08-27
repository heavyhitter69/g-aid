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
  radioQuantity?: string;
  correctionHistory?: string;
  acquisitionPlatform?: string;
  instrument?: string;
  elevationDatum?: string;
  gravityDatum?: string;
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
