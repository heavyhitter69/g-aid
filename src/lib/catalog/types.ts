/**
 * Persistent project catalog: `{project}/G-AID Output/project.catalog.json`.
 * Support is three-way. Extension sniffing is not processing support.
 */

export const CATALOG_SCHEMA_VERSION = 1;
export const CATALOG_FILENAME = "project.catalog.json";

export const SUPPORT_STATUSES = ["supported", "recognised-unsupported", "unknown"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export type MediaClass =
  | "tabular-text"
  | "raster"
  | "vector"
  | "crs"
  | "point-cloud"
  | "borehole-log"
  | "seismic"
  | "document"
  | "image"
  | "binary"
  | "unknown";

export type DomainHint =
  | "magnetics"
  | "gravity"
  | "resistivity"
  | "seismic"
  | "gpr"
  | "radiometrics"
  | "gis"
  | "geology"
  | "report"
  | "unknown";

export type ChecksumStrategy = "sha256" | "sha256-head-64k" | "none";

export type ClassificationMethod =
  | "adapter-sniff"
  | "format-sniff"
  | "extension-unconfirmed"
  | "unknown";

export interface CatalogChecksum {
  strategy: ChecksumStrategy;
  value?: string;
}

export interface CatalogBBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CatalogTimeRange {
  start?: string;
  end?: string;
}

export interface CatalogProvenance {
  method: ClassificationMethod;
  adapterId?: string;
  peekedBytes: number;
  notes?: string[];
}

export interface CatalogRecord {
  id: string;
  relativePath: string;
  filename: string;
  extension: string;
  size: number;
  modifiedTime: string;
  checksum: CatalogChecksum;
  mediaClass: MediaClass;
  domainHint: DomainHint;
  formatId: string;
  supportStatus: SupportStatus;
  adapterId: string | null;
  sniffConfidence: number;
  columns?: string[];
  headerSummary?: string;
  crs?: string;
  units?: string;
  bbox?: CatalogBBox;
  timeRange?: CatalogTimeRange;
  recordCount?: number;
  parseErrors?: string[];
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
  gravityDatum?: string;
  provenance: CatalogProvenance;
}

export interface CatalogRunProvenance {
  runId: string;
  parentRunId?: string;
  createdAt?: string;
  status?: string;
  productsRel?: string;
  intent?: string;
  planHash?: string;
  source: "disk" | "previous-catalog";
}

export interface ProjectCatalog {
  schemaVersion: number;
  generatedAt: string;
  previousGeneratedAt?: string;
  workspaceRoot: string;
  records: CatalogRecord[];
  runs: CatalogRunProvenance[];
  truncated: boolean;
  truncationReason?: string;
  skippedOutputDir: boolean;
  fileCountLimit: number;
  peekBytes: number;
  scannedFiles: number;
  skippedFiles: number;
}

export const MAX_CATALOG_FILES = 20000;
export const PEEK_BYTES = 4096;
export const MAX_FULL_HASH_BYTES = 8 * 1024 * 1024;
export const HEAD_HASH_BYTES = 64 * 1024;
export const MAX_HEADER_SUMMARY = 500;
export const MAX_COLUMNS = 48;
export const SMALL_TEXT_COUNT_BYTES = 1 * 1024 * 1024;
