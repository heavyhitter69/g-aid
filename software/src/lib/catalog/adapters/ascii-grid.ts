import { headerSummaryFromText } from "../peek-text.ts";
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
  ASCII_GRID_ADAPTER_ID,
  ASCII_GRID_FORMAT,
  asciiGridReadyForSupport,
  inspectAsciiGridText,
  rasterHeaderSummary,
  type AsciiGridInspect,
} from "../raster-contract.ts";
import { firstLines, looksMostlyText } from "../peek-text.ts";

function sniffEsriAscii(ctx: SniffContext): AdapterSniff | null {
  if (!looksMostlyText(ctx.peek)) return null;
  const head = firstLines(ctx.peekText, 8).join("\n").toLowerCase();
  if (!/\bncols\b/.test(head) || !/\bnrows\b/.test(head)) return null;
  const inspected = inspectAsciiGridText(ctx.peekText, ctx.size);
  const ready = asciiGridReadyForSupport(inspected);
  return {
    confidence: ready ? 0.92 : 0.88,
    formatId: ASCII_GRID_FORMAT,
    mediaClass: "raster",
    domainHint: "gis",
    notes: [
      ready
        ? "ESRI ASCII grid header parsed (ncols/nrows/cellsize/origin). Cell values were not fully loaded."
        : "ESRI ASCII grid header (ncols/nrows). Origin or cellsize is incomplete; cell values were not loaded.",
    ],
  };
}

export function catalogInspectionFromAsciiGrid(inspected: AsciiGridInspect, peekText: string): CatalogInspection {
  const ready = asciiGridReadyForSupport(inspected);
  const errors = [...inspected.errors];
  if (!ready && inspected.looksLikeAscii) {
    errors.push("ESRI ASCII grid header is incomplete. Dimensions, cellsize, and origin are required for inspect support.");
  }
  return {
    headerSummary: rasterHeaderSummary(peekText) || headerSummaryFromText(peekText),
    crs: inspected.crs,
    units: inspected.units,
    bbox: inspected.bbox,
    cellSizeM: inspected.cellsize,
    recordCount:
      Number.isFinite(inspected.ncols) && Number.isFinite(inspected.nrows)
        ? (inspected.ncols as number) * (inspected.nrows as number)
        : undefined,
    parseErrors: errors.length ? errors : undefined,
    supportStatus: ready ? "supported" : "recognised-unsupported",
    ncols: inspected.ncols,
    nrows: inspected.nrows,
    nodata: inspected.nodata,
    bandCount: 1,
    dataType: "ascii-float",
    compression: "uncompressed",
    rasterLayout: "ascii",
    geotransform:
      Number.isFinite(inspected.xll) && Number.isFinite(inspected.yll) && Number.isFinite(inspected.cellsize) && Number.isFinite(inspected.nrows)
        ? [
            inspected.xll as number,
            inspected.cellsize as number,
            0,
            (inspected.yll as number) + (inspected.nrows as number) * (inspected.cellsize as number),
            0,
            -(inspected.cellsize as number),
          ]
        : undefined,
    valueMin: inspected.valueMin,
    valueMax: inspected.valueMax,
    overviewCount: 0,
    previewRequired: inspected.previewRequired,
    pixelsDecodable: !inspected.previewRequired,
    rasterContract: "esri-ascii",
    crsConfidence: inspected.crsConfidence,
    crsSource: inspected.crsSource,
    axisOrder: inspected.crs ? "east-north" : "unknown",
    coordinateOrder: inspected.crs ? "east-north" : "unknown",
  };
}

export const asciiGridAdapter: CatalogAdapter = {
  id: ASCII_GRID_ADAPTER_ID,
  formatId: ASCII_GRID_FORMAT,
  supportStatus: "supported",
  sniff: sniffEsriAscii,
  inspect: (ctx) => catalogInspectionFromAsciiGrid(inspectAsciiGridText(ctx.peekText, ctx.size), ctx.peekText),
  validate: (record) =>
    record.supportStatus === "supported"
      ? okIfSupported(record, ASCII_GRID_ADAPTER_ID)
      : okIfRecognised(record, ASCII_GRID_ADAPTER_ID),
  read: () => deferredRead(ASCII_GRID_ADAPTER_ID),
};
