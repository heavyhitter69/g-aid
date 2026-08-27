import { headerSummaryFromText, looksMostlyText, firstLines } from "../peek.ts";
import {
  deferredRead,
  okIfRecognised,
  okIfSupported,
  type AdapterSniff,
  type CatalogInspection,
  type CatalogAdapter,
  type SniffContext,
} from "./types.ts";
import {
  GPR_CSV_FORMAT,
  GPR_DZT_FORMAT,
  gprReadyForSupport,
  inspectGprDzt,
  inspectGprText,
} from "../gpr-contract.ts";

function gprCsvSniff(ctx: SniffContext): AdapterSniff | null {
  if (!looksMostlyText(ctx.peek)) return null;
  const inspected = inspectGprText(ctx.peekText, ctx.filename);
  if (!inspected.looksLikeGpr) return null;
  return {
    confidence: gprReadyForSupport(inspected) ? 0.94 : 0.84,
    formatId: GPR_CSV_FORMAT,
    mediaClass: "tabular-text",
    domainHint: "gpr",
    notes: [
      gprReadyForSupport(inspected)
        ? "Matched the G-AID GPR 1.0 contract."
        : "GPR-like table; dt_ns, dx_m, AntennaMHz, Units, or the G-AID GPR 1.0 banner are incomplete.",
    ],
  };
}

export const gprCsvAdapter: CatalogAdapter = {
  id: "gpr-csv",
  formatId: GPR_CSV_FORMAT,
  supportStatus: "supported",
  sniff: gprCsvSniff,
  inspect: (ctx) => {
    const inspected = inspectGprText(ctx.peekText, ctx.filename);
    const ready = gprReadyForSupport(inspected);
    const errors = [...inspected.errors];
    if (!ready && inspected.looksLikeGpr) {
      errors.push(
        "This GPR file is recognised but not a supported processing input until Units, dt_ns, dx_m, AntennaMHz, and Trace/Sample/Amplitude validate."
      );
    }
    return {
      columns: inspected.columns,
      headerSummary: firstLines(ctx.peekText, 6).join(" | ") || headerSummaryFromText(ctx.peekText),
      crs: inspected.crs,
      units: inspected.units,
      cellSizeM: inspected.dxM,
      recordCount: inspected.nRows,
      parseErrors: errors.length ? errors : undefined,
      supportStatus: ready ? "supported" : "recognised-unsupported",
      instrument: inspected.antennaMHz ? `${inspected.antennaMHz} MHz antenna` : undefined,
      dtNs: inspected.dtNs,
      dxM: inspected.dxM,
      antennaMHz: inspected.antennaMHz,
      velocityMs: inspected.velocityMs,
    };
  },
  validate: (record) =>
    record.supportStatus === "supported" ? okIfSupported(record, "gpr-csv") : okIfRecognised(record, "gpr-csv"),
  read: () => deferredRead("gpr-csv"),
};

export const gprDztAdapter: CatalogAdapter = {
  id: "gpr-dzt",
  formatId: GPR_DZT_FORMAT,
  supportStatus: "recognised-unsupported",
  sniff: (ctx: SniffContext) => {
    if (ctx.extension !== "dzt" && !ctx.filename.toLowerCase().endsWith(".dzt")) return null;
    return {
      confidence: 0.9,
      formatId: GPR_DZT_FORMAT,
      mediaClass: "binary",
      domainHint: "gpr",
      notes: ["GSSI DZT filename/extension. Binary traces were not decoded as a processing input."],
    };
  },
  inspect: (ctx): CatalogInspection => {
    const inspected = inspectGprDzt(ctx.filename);
    return {
      headerSummary: "GSSI DZT (recognised-unsupported)",
      parseErrors: inspected.errors,
      supportStatus: "recognised-unsupported",
    };
  },
  validate: (record) => okIfRecognised(record, "gpr-dzt"),
  read: () => deferredRead("gpr-dzt"),
};
