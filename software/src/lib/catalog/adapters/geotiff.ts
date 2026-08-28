import {
  deferredRead,
  okIfRecognised,
  okIfSupported,
  type AdapterSniff,
  type CatalogAdapter,
  type CatalogInspection,
  type SniffContext,
} from "./types.ts";
import {
  GEOTIFF_ADAPTER_ID,
  GEOTIFF_FORMAT,
  geotiffReadyForSupport,
  inspectTiffBuffer,
  tiffSignature,
  type RasterInspect,
} from "../raster-contract.ts";

function sniffGeotiff(ctx: SniffContext): AdapterSniff | null {
  const sig = tiffSignature(ctx.peek);
  if (!sig.looksLikeTiff) return null;
  const inspected = inspectTiffBuffer(ctx.peek);
  const ready = geotiffReadyForSupport(inspected);
  const notes = [
    sig.isBigTiff
      ? "BigTIFF signature. Tags were not parsed as Classic TIFF; pixels were not loaded."
      : ready
        ? "Classic GeoTIFF IFD parsed (dimensions and geotransform). Pixel values were not loaded."
        : "TIFF signature. GeoTIFF tags were incomplete in the peek; pixels were not loaded.",
  ];
  return {
    confidence: ready ? 0.94 : sig.isBigTiff ? 0.88 : 0.86,
    formatId: GEOTIFF_FORMAT,
    mediaClass: "raster",
    domainHint: "gis",
    notes,
  };
}

export function catalogInspectionFromGeoTiff(inspected: RasterInspect): CatalogInspection {
  const ready = geotiffReadyForSupport(inspected);
  const errors = [...inspected.errors];
  if (inspected.isBigTiff) {
    errors.push("BigTIFF is recognised-unsupported. A Classic TIFF/COG IFD reader is registered for metadata, not a BigTIFF reader.");
  } else if (!ready && inspected.looksLikeTiff) {
    errors.push(
      inspected.ifdBeyondBuffer
        ? "TIFF IFD was beyond the peeked bytes until disk inspect. Incomplete GeoTIFF tags are not processing support."
        : "GeoTIFF dimensions or geotransform did not parse. This raster stays recognised-unsupported for inspect."
    );
  }
  return {
    headerSummary: inspected.width && inspected.height ? `${inspected.width}×${inspected.height} ${inspected.dataType || "raster"}` : undefined,
    crs: inspected.crs,
    units: inspected.units,
    bbox: inspected.bbox,
    cellSizeM: inspected.cellSizeM,
    recordCount:
      Number.isFinite(inspected.width) && Number.isFinite(inspected.height)
        ? (inspected.width as number) * (inspected.height as number)
        : undefined,
    parseErrors: errors.length ? errors : undefined,
    supportStatus: ready ? "supported" : "recognised-unsupported",
    ncols: inspected.width,
    nrows: inspected.height,
    nodata: inspected.nodata,
    bandCount: inspected.bandCount,
    dataType: inspected.dataType,
    compression: inspected.compression,
    rasterLayout: inspected.cogLike ? "cog" : inspected.layout,
    geotransform: inspected.geotransform?.affine,
    valueMin: inspected.valueMin,
    valueMax: inspected.valueMax,
    overviewCount: inspected.overviewCount,
    previewRequired: inspected.previewRequired,
    pixelsDecodable: inspected.pixelsDecodable,
    rasterContract: inspected.rasterContract,
    crsConfidence: inspected.crsConfidence,
    crsSource: inspected.crsSource,
    axisOrder: inspected.crs === "EPSG:4326" ? "lat-lon" : inspected.crs ? "east-north" : "unknown",
    coordinateOrder: inspected.crs === "EPSG:4326" ? "lat-lon" : inspected.crs ? "east-north" : "unknown",
  };
}

export const geotiffAdapter: CatalogAdapter = {
  id: GEOTIFF_ADAPTER_ID,
  formatId: GEOTIFF_FORMAT,
  supportStatus: "supported",
  sniff: sniffGeotiff,
  inspect: (ctx) => catalogInspectionFromGeoTiff(inspectTiffBuffer(ctx.peek)),
  validate: (record) =>
    record.supportStatus === "supported" ? okIfSupported(record, GEOTIFF_ADAPTER_ID) : okIfRecognised(record, GEOTIFF_ADAPTER_ID),
  read: () => deferredRead(GEOTIFF_ADAPTER_ID),
};
