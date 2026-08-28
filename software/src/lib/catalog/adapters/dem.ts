import { headerSummaryFromText, looksMostlyText } from "../peek-text.ts";
import {
  deferredRead,
  okIfRecognised,
  okIfSupported,
  type AdapterSniff,
  type CatalogInspection,
  type CatalogAdapter,
} from "./types.ts";
import { DEM_ADAPTER_ID, DEM_ASCII_FORMAT, demHeaderSummary, demReadyForSupport, inspectDemText } from "../dem-contract.ts";

function demSniff(ctx: { peek: Buffer; peekText: string }): AdapterSniff | null {
  if (!looksMostlyText(ctx.peek)) return null;
  const inspected = inspectDemText(ctx.peekText);
  if (!inspected.looksLikeDem) return null;
  return {
    confidence: demReadyForSupport(inspected) ? 0.93 : 0.84,
    formatId: DEM_ASCII_FORMAT,
    mediaClass: "raster",
    domainHint: "gis",
    notes: [
      demReadyForSupport(inspected)
        ? "Matched the G-AID DEM ASCII contract (EPSG, Units=m, ElevationDatum)."
        : "DEM-like ASCII grid; CRS, units, or vertical datum is incomplete.",
    ],
  };
}

function demInspect(ctx: { peekText: string }): CatalogInspection {
  const inspected = inspectDemText(ctx.peekText);
  const ready = demReadyForSupport(inspected);
  const errors = [...inspected.errors];
  if (!ready && inspected.looksLikeDem) {
    errors.push(
      "This DEM is recognised but not a supported terrain source until EPSG, Units=m, ElevationDatum, extent, and cell size are documented."
    );
  }
  return {
    headerSummary: demHeaderSummary(ctx.peekText) || headerSummaryFromText(ctx.peekText),
    crs: inspected.crs,
    units: inspected.units,
    bbox: inspected.bbox,
    cellSizeM: inspected.cellSizeM,
    recordCount:
      Number.isFinite(inspected.ncols) && Number.isFinite(inspected.nrows)
        ? (inspected.ncols as number) * (inspected.nrows as number)
        : undefined,
    parseErrors: errors.length ? errors : undefined,
    supportStatus: ready ? "supported" : "recognised-unsupported",
    elevationDatum: inspected.elevationDatum,
    ncols: inspected.ncols,
    nrows: inspected.nrows,
    bandCount: 1,
    dataType: "ascii-float",
    compression: "uncompressed",
    rasterLayout: "ascii",
    previewRequired: false,
    pixelsDecodable: true,
    rasterContract: ready ? "dem-ascii" : "esri-ascii",
    crsConfidence: inspected.crs ? "high" : "none",
    crsSource: inspected.crs ? "epsg-comment" : undefined,
  };
}

export const demAsciiAdapter: CatalogAdapter = {
  id: DEM_ADAPTER_ID,
  formatId: DEM_ASCII_FORMAT,
  supportStatus: "supported",
  sniff: (ctx) => demSniff(ctx),
  inspect: (ctx) => demInspect(ctx),
  validate: (record) =>
    record.supportStatus === "supported" ? okIfSupported(record, DEM_ADAPTER_ID) : okIfRecognised(record, DEM_ADAPTER_ID),
  read: () => deferredRead(DEM_ADAPTER_ID),
};
