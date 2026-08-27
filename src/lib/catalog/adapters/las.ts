import fs from "node:fs";
import { headerSummaryFromText, looksMostlyText, firstLines } from "../peek.ts";
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
  LAS_ADAPTER_ID,
  LAS_WELL_FORMAT,
  inspectLasText,
  isLasfSignature,
  lasReadyForSupport,
  looksLikeLasWellText,
} from "../las-contract.ts";

const LAS_INSPECT_BYTES = 65536;

function lasText(ctx: SniffContext): string {
  if (ctx.absPath) {
    try {
      const buf = fs.readFileSync(ctx.absPath);
      if (isLasfSignature(buf)) return buf.subarray(0, 4).toString("ascii");
      return buf.subarray(0, Math.min(buf.length, LAS_INSPECT_BYTES)).toString("utf8");
    } catch {
      return ctx.peekText;
    }
  }
  return ctx.peekText;
}

function lasSniff(ctx: SniffContext): AdapterSniff | null {
  if (isLasfSignature(ctx.peek)) return null;
  if (!looksMostlyText(ctx.peek)) return null;
  const text = ctx.peekText;
  if (!looksLikeLasWellText(text)) return null;
  const inspected = inspectLasText(text, ctx.filename);
  if (!inspected.looksLikeLas) return null;
  const ready = lasReadyForSupport(inspected);
  return {
    confidence: ready ? 0.94 : 0.86,
    formatId: LAS_WELL_FORMAT,
    mediaClass: "borehole-log",
    domainHint: "geology",
    notes: [
      ready
        ? "Matched CWLS LAS 2.0 WRAP.NO well-log contract."
        : "ASCII LAS well-log section markers; header, WRAP, units, or depth index did not validate as LAS 2.0 WRAP.NO.",
    ],
  };
}

export const lasWellAdapter: CatalogAdapter = {
  id: LAS_ADAPTER_ID,
  formatId: LAS_WELL_FORMAT,
  supportStatus: "supported",
  sniff: lasSniff,
  inspect: (ctx): CatalogInspection => {
    const inspected = inspectLasText(lasText(ctx), ctx.filename);
    const ready = lasReadyForSupport(inspected);
    const errors = [...inspected.errors];
    if (!ready && inspected.looksLikeLas) {
      errors.push(
        "This LAS file is recognised but not a supported processing input until VERS 2.x, WRAP.NO, well/curve/ASCII sections, depth index, and curve units validate."
      );
    }
    return {
      columns: inspected.curves.map((curve) => curve.mnemonic),
      headerSummary: firstLines(ctx.peekText, 6).join(" | ") || headerSummaryFromText(ctx.peekText),
      crs: inspected.crs,
      units: inspected.depthUnits,
      elevationDatum: inspected.elevationDatum,
      bbox:
        Number.isFinite(inspected.collarX) && Number.isFinite(inspected.collarY)
          ? {
              minX: inspected.collarX as number,
              minY: inspected.collarY as number,
              maxX: inspected.collarX as number,
              maxY: inspected.collarY as number,
            }
          : undefined,
      recordCount: inspected.nRows,
      parseErrors: errors.length ? errors : undefined,
      supportStatus: ready ? "supported" : inspected.looksLikeLas ? "recognised-unsupported" : "unknown",
      wellId: inspected.wellId,
      curves: inspected.curves.map((curve) => curve.mnemonic),
      curveUnits: inspected.curves.map((curve) => curve.unit),
      nullValue: inspected.nullValue,
      startDepth: inspected.startDepth,
      stopDepth: inspected.stopDepth,
      step: inspected.step,
      wrap: inspected.wrap,
      lasVersion: inspected.lasVersion,
      depthIndex: inspected.depthIndex,
      depthUnits: inspected.depthUnits,
      collarX: inspected.collarX,
      collarY: inspected.collarY,
      collarZ: inspected.collarZ,
      coordinateKind: inspected.coordinateKind,
      locationQuality: inspected.locationQuality,
      collarMappable: inspected.collarMappable,
    };
  },
  validate: (record) =>
    record.supportStatus === "supported" ? okIfSupported(record, LAS_ADAPTER_ID) : okIfRecognised(record, LAS_ADAPTER_ID),
  read: () => deferredRead(LAS_ADAPTER_ID),
};
