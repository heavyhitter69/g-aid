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
  | "geochemistry"
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
  cellSizeM?: number;
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
  vectorRole?: {
    role: "geology" | "structure" | "tenure" | "alteration" | "mine-feature" | "sample-location" | "generic-vector";
    reviewed: boolean;
    reviewedAt?: string;
    source: "user-assigned" | "unassigned";
  };
  shapefileSidecars?: {
    shp: boolean;
    shx: boolean;
    dbf: boolean;
    prj: boolean;
    cpg?: boolean;
  };
  geojsonContract?: "rfc7946" | "legacy-geojson" | "g-aid-custom-import";
  shapefileContract?: "esri-shp-shx-dbf-prj";
  vectorFormat?: "geojson" | "shapefile";
  encoding?: string;
  encodingSource?: "cpg" | "undeclared-cp1252";
  crsConfidence?: "high" | "medium" | "none";
  crsSource?: "rfc7946" | "legacy-crs" | "companion-prj" | "epsg-comment" | "user-confirmed" | "shapefile-prj" | "geotiff-geokeys";
  axisOrder?: "lon-lat" | "lat-lon" | "east-north" | "unknown";
  coordinateOrder?: "lon-lat" | "lat-lon" | "east-north" | "unknown";
  ncols?: number;
  nrows?: number;
  nodata?: number;
  bandCount?: number;
  dataType?: string;
  compression?: string;
  rasterLayout?: string;
  geotransform?: [number, number, number, number, number, number] | number[];
  valueMin?: number;
  valueMax?: number;
  overviewCount?: number;
  previewRequired?: boolean;
  pixelsDecodable?: boolean;
  rasterContract?: string;
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
