/**
 * Map display types. This is viewing, not geophysical processing.
 */

export const DISPLAY_FORMATS = [
  "esri-ascii-grid",
  "geotiff",
  "geojson",
  "dem-ascii",
] as const;

export type DisplayFormatId = (typeof DISPLAY_FORMATS)[number] | string;

export type LayerOrigin = "source" | "derived-run" | "unsupported" | "preview";

export type DisplayStatus = "viewable" | "preview" | "recognised-not-decoded" | "not-viewable";

export type CrsAxisOrder = "lon-lat" | "lat-lon" | "east-north" | "unknown";
export type GeojsonContractKind = "rfc7946" | "legacy-geojson" | "g-aid-custom-import";

export interface CrsInfo {
  key: string;
  label: string;
  epsg?: number;
  units?: string;
  datum?: string;
  source: "prj" | "geotiff" | "geojson" | "catalog" | "rfc7946" | "legacy-crs" | "custom-import" | "shapefile-prj" | "unknown";
  assumed: boolean;
  authority?: "OGC" | "EPSG";
  axisOrder?: CrsAxisOrder;
  /** File storage order. GeoJSON coordinate arrays are [lon, lat] even when a legacy crs names EPSG:4326. */
  coordinateOrder?: CrsAxisOrder;
  geojsonContract?: GeojsonContractKind;
}

export interface PreviewPolicy {
  maxGridCells: number;
  maxGridDimension: number;
  maxAsciiBytes: number;
  maxGeojsonBytes: number;
  maxGeojsonFeatures: number;
  maxProfileSamples: number;
  label: string;
}

export interface RasterGrid {
  ncols: number;
  nrows: number;
  xllcorner: number;
  yllcorner: number;
  cellsize: number;
  nodata: number;
  values: Float64Array;
  units?: string;
  quantity?: string;
  channel?: string;
  preview?: boolean;
  previewNote?: string;
}

export interface VectorFeature {
  type: "Point" | "LineString" | "Polygon" | "MultiPolygon";
  coordinates: { x: number; y: number }[];
  rings?: { x: number; y: number }[][];
  parts?: { x: number; y: number }[][][];
  id?: string | number;
  properties?: Record<string, unknown>;
}

export interface VectorLayerData {
  features: VectorFeature[];
  preview?: boolean;
  previewNote?: string;
  featureCount: number;
}

export interface MapLayerSpec {
  id: string;
  catalogId?: string;
  artifactId?: string;
  path: string;
  label: string;
  origin: LayerOrigin;
  displayStatus: DisplayStatus;
  formatId: string;
  mediaClass: string;
  supportStatus?: string;
  runId?: string;
  parentRunId?: string;
  planHash?: string;
  crs?: CrsInfo;
  bbox?: { minX: number; minY: number; maxX: number; maxY: number };
  units?: string;
  reason?: string;
  representation: "full" | "preview" | "undecoded";
  warnings?: string[];
  vectorRole?: {
    role: string;
    reviewed: boolean;
  };
  attributeNames?: string[];
  geometryTypes?: string[];
}

export interface OverlayDecision {
  allowed: boolean;
  code:
    | "same-crs"
    | "unknown-crs"
    | "conflicting-crs"
    | "assumed-crs"
    | "crs84-epsg4326-geojson-lonlat"
    | "crs84-epsg4326-axis-order";
  message: string;
  compatibilityDecision?: "geojson-lonlat-no-axis-swap";
}

export interface RunArtifact {
  artifactId: string;
  runId: string;
  parentRunId?: string;
  planHash?: string;
  path: string;
  filename: string;
  formatId: string;
}

export interface ProfileSample {
  distance: number;
  x: number;
  y: number;
  value: number | null;
  nodata: boolean;
}

export interface ProfileResult {
  samples: ProfileSample[];
  interpolation: "nearest-neighbour";
  units: string;
  crs?: CrsInfo;
  sourceId: string;
  sourcePath: string;
  representation: "full" | "preview";
}
