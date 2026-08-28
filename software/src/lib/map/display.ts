/**
 * Display adapters. Viewing is not processing support.
 * Incomplete shapefiles, FileGDB, LAS/LAZ, and SEG-Y are recognised but not decoded.
 */

export type DisplayAdapterId =
  | "esri-ascii-grid"
  | "geotiff"
  | "geojson"
  | "esri-prj"
  | "shapefile"
  | "geopackage"
  | "las-point-cloud"
  | "laz-point-cloud"
  | "segy"
  | "filegdb";

export interface DisplayAdapter {
  id: DisplayAdapterId | string;
  formatIds: string[];
  viewable: boolean;
  decoded: boolean;
  kind: "raster" | "vector" | "crs" | "none";
  reason: string;
}

const ADAPTERS: DisplayAdapter[] = [
  {
    id: "esri-ascii-grid",
    formatIds: ["esri-ascii-grid", "dem-ascii"],
    viewable: true,
    decoded: true,
    kind: "raster",
    reason: "ESRI ASCII grid header and cell values are read with a declared preview limit.",
  },
  {
    id: "geotiff",
    formatIds: ["geotiff"],
    viewable: true,
    decoded: true,
    kind: "raster",
    reason: "Uncompressed Classic TIFF strips (uint8/uint16/int16/int32/float32, band 1) are decoded under a preview limit. Compressed, tiled, and COG pixels are not decoded. Companion .asc is used when present.",
  },
  {
    id: "geojson",
    formatIds: ["geojson"],
    viewable: true,
    decoded: true,
    kind: "vector",
    reason: "GeoJSON Feature/FeatureCollection is parsed with a feature/byte preview limit.",
  },
  {
    id: "esri-prj",
    formatIds: ["esri-prj"],
    viewable: false,
    decoded: false,
    kind: "crs",
    reason: "PRJ/WKT is CRS metadata, not a map layer.",
  },
  {
    id: "shapefile",
    formatIds: ["shapefile"],
    viewable: true,
    decoded: true,
    kind: "vector",
    reason: "Documented ESRI shapefile (.shp/.shx/.dbf with .prj EPSG) is parsed. Incomplete or unparseable sidecars are not decoded.",
  },
  {
    id: "geopackage",
    formatIds: ["geopackage"],
    viewable: false,
    decoded: false,
    kind: "none",
    reason: "GeoPackage is recognised but not decoded in this release. Tables and geometries were not loaded.",
  },
  {
    id: "las-point-cloud",
    formatIds: ["las-point-cloud", "laz-point-cloud"],
    viewable: false,
    decoded: false,
    kind: "none",
    reason: "LAS/LAZ point clouds are not loaded into the map or the model.",
  },
  {
    id: "segy",
    formatIds: ["segy"],
    viewable: false,
    decoded: false,
    kind: "none",
    reason: "SEG-Y volumes are not loaded into the map or the model.",
  },
  {
    id: "filegdb",
    formatIds: ["filegdb", "gdb"],
    viewable: false,
    decoded: false,
    kind: "none",
    reason: "FileGDB is not a display adapter in this release.",
  },
];

export function displayAdapterFor(formatId: string): DisplayAdapter | undefined {
  const key = formatId.toLowerCase();
  return ADAPTERS.find((adapter) => adapter.formatIds.includes(key) || adapter.id === key);
}

export function isFalselyDecodable(formatId: string): boolean {
  const adapter = displayAdapterFor(formatId);
  return Boolean(adapter && !adapter.decoded);
}

export function formatIdFromPath(path: string): string {
  const name = path.replace(/\\/g, "/").split("/").pop() || path;
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
  if (ext === "asc" || ext === "grd") return "esri-ascii-grid";
  if (ext === "tif" || ext === "tiff") return "geotiff";
  if (ext === "geojson") return "geojson";
  if (ext === "prj" || ext === "wkt") return "esri-prj";
  if (ext === "shp") return "shapefile";
  if (ext === "gpkg") return "geopackage";
  if (ext === "laz") return "laz-point-cloud";
  if (ext === "las") return "unknown";
  if (ext === "sgy" || ext === "segy") return "segy";
  if (ext === "gdb") return "filegdb";
  return "unknown";
}

export function isDemAscii(record: {
  formatId: string;
  elevationDatum?: string;
  units?: string;
}): boolean {
  if (record.formatId === "dem-ascii") return true;
  void record.elevationDatum;
  void record.units;
  return false;
}
