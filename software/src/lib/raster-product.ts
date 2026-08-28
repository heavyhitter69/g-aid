import { overlayDecision, type CrsInfo } from "./map/crs.ts";
import { crsFromCatalog } from "./map/crs.ts";

export const RASTER_PRODUCT_NAME = "G-AID documented raster layer";
export const TERRAIN_PRODUCT_NAME = "G-AID documented terrain layer";

export const RASTER_SUPPORTED_FORMAT =
  "Classic GeoTIFF/COG metadata (IFD tags) and uncompressed Classic TIFF strip pixels (uint8/uint16/int16/int32/float32, band 1), plus ESRI ASCII grids. Documented DEM ASCII (EPSG, Units=m, ElevationDatum) for terrain viewing.";

export const RASTER_STATEMENTS = [
  "Product: G-AID documented raster layer. Values are source measurements, not a remote-sensing interpretation.",
  "Catalog inspect is metadata-first. Full rasters are never loaded into the LLM or browser memory.",
  "Supported inspect: Classic GeoTIFF IFD (dimensions, CRS GeoKeys, affine/geotransform, nodata, bands, compression, layout) and ESRI ASCII headers.",
  "Pixel display is uncompressed Classic TIFF strips of uint8/uint16/int16/int32/float32, sampling band 1 of multiband files, plus ESRI ASCII cells under the declared preview limit.",
  "Compressed GeoTIFF, tiled/COG pixels, BigTIFF, MrSID, ECW, JPEG2000, and FileGDB rasters are not decoded.",
  "A filename containing 'dem' is not a DEM. Terrain viewing requires the documented DEM ASCII contract (EPSG, Units=m, ElevationDatum).",
  "Raster overlays require documented CRS compatibility. G-AID will not silently reproject.",
  "Hillshade, slope, aspect, terrain correction, spectral indices, raster algebra, and LiDAR are not registered raster operations.",
];

export function rasterLayerHeading(opts?: {
  terrain?: boolean;
  formatId?: string;
  preview?: boolean;
}): string {
  if (opts?.terrain) return "Terrain layer (documented DEM ASCII; source elevations, not a derivative)";
  if (opts?.preview) return "Raster layer (preview/overview — not the full dataset)";
  if (opts?.formatId === "geotiff") return "Raster layer (GeoTIFF source values)";
  if (opts?.formatId === "esri-ascii-grid") return "Raster layer (ESRI ASCII source values)";
  return "Raster layer (source values)";
}

export function rasterProductWarnings(opts: {
  path?: string;
  formatId?: string;
  crs?: string;
  crsSource?: string;
  nodata?: number;
  nodataPresent?: boolean;
  compression?: string;
  rasterLayout?: string;
  pixelsDecodable?: boolean;
  previewRequired?: boolean;
  bandCount?: number;
  terrain?: boolean;
}): string[] {
  const warnings = [
    "This layer is source raster values. It is not a remote-sensing interpretation or a terrain derivative.",
  ];
  if (opts.terrain) {
    warnings.push("Terrain viewing uses documented DEM ASCII elevations. Hillshade, slope, aspect, and terrain correction are not applied.");
  } else {
    warnings.push("A filename containing 'dem' does not make this a DEM.");
  }
  if (!opts.crs) {
    warnings.push("CRS is undocumented. Overlay is blocked. Coordinates were not assumed or reprojected.");
  } else {
    warnings.push(`CRS is ${opts.crs}${opts.crsSource ? ` (from ${opts.crsSource})` : ""}. Coordinates were not reprojected.`);
  }
  if (opts.nodataPresent || opts.nodata != null) {
    warnings.push(`Nodata is ${opts.nodata}. Nodata cells are excluded from the legend stretch.`);
  }
  if (opts.bandCount && opts.bandCount > 1) {
    warnings.push(`Multiband raster (${opts.bandCount} bands). Map display samples band 1 only.`);
  }
  if (opts.previewRequired) {
    warnings.push("This raster exceeds the declared preview/overview limit. The full grid was not loaded.");
  }
  if (opts.pixelsDecodable === false) {
    const layout = opts.rasterLayout || "unknown layout";
    const compression = opts.compression || "unknown compression";
    warnings.push(`Pixels are not decoded (${layout}, ${compression}). Extent may still display from metadata.`);
  }
  return warnings;
}

export function rasterOverlayAllowed(
  left?: CrsInfo | string | null,
  right?: CrsInfo | string | null
): ReturnType<typeof overlayDecision> {
  const asInfo = (value?: CrsInfo | string | null): CrsInfo | undefined => {
    if (!value) return undefined;
    if (typeof value === "string") return crsFromCatalog(value, { source: "catalog" });
    return value;
  };
  return overlayDecision(asInfo(left), asInfo(right));
}
