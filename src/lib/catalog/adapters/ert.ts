import { headerSummaryFromText, looksMostlyText, firstLines } from "../peek.ts";
import {
  deferredRead,
  okIfRecognised,
  okIfSupported,
  type AdapterSniff,
  type CatalogInspection,
  type CatalogAdapter,
} from "./types.ts";
import { ERT_CSV_FORMAT, ERT_DAT_FORMAT, ertReadyForSupport, inspectErtText } from "../ert-contract.ts";

function ertSniff(ctx: { peek: Buffer; peekText: string; filename: string }): AdapterSniff | null {
  if (!looksMostlyText(ctx.peek)) return null;
  const inspected = inspectErtText(ctx.peekText, ctx.filename);
  if (!inspected.looksLikeErt) return null;
  return {
    confidence: ertReadyForSupport(inspected) ? 0.94 : 0.82,
    formatId: inspected.formatId === "unknown" ? ERT_DAT_FORMAT : inspected.formatId,
    mediaClass: "tabular-text",
    domainHint: "resistivity",
    notes: [
      ertReadyForSupport(inspected)
        ? "Matched the G-AID ERT 1.0 contract."
        : "ERT-like file; units, array, or geometry are incomplete.",
    ],
  };
}

function ertInspect(ctx: { peekText: string; filename: string }): CatalogInspection {
  const inspected = inspectErtText(ctx.peekText, ctx.filename);
  const ready = ertReadyForSupport(inspected);
  const errors = [...inspected.errors];
  if (!ready && inspected.looksLikeErt) {
    errors.push("This ERT file is recognised but not a supported processing input until units, array, and geometry validate.");
  }
  return {
    headerSummary: firstLines(ctx.peekText, 4).join(" | ") || headerSummaryFromText(ctx.peekText),
    crs: inspected.crs,
    units: inspected.unitsOhmM ? "ohm.m" : undefined,
    recordCount: inspected.nParsed || inspected.nDeclared,
    parseErrors: errors.length ? errors : undefined,
    supportStatus: ready ? "supported" : "recognised-unsupported",
  };
}

export const ertDatAdapter: CatalogAdapter = {
  id: "ert-dat",
  formatId: ERT_DAT_FORMAT,
  supportStatus: "supported",
  sniff: (ctx) => {
    const sniffed = ertSniff(ctx);
    if (!sniffed || sniffed.formatId !== ERT_DAT_FORMAT) return null;
    return sniffed;
  },
  inspect: ertInspect,
  validate: (record) =>
    record.supportStatus === "supported" ? okIfSupported(record, "ert-dat") : okIfRecognised(record, "ert-dat"),
  read: () => deferredRead("ert-dat"),
};

export const ertCsvAdapter: CatalogAdapter = {
  id: "ert-csv",
  formatId: ERT_CSV_FORMAT,
  supportStatus: "supported",
  sniff: (ctx) => {
    const sniffed = ertSniff(ctx);
    if (!sniffed || sniffed.formatId !== ERT_CSV_FORMAT) return null;
    return sniffed;
  },
  inspect: ertInspect,
  validate: (record) =>
    record.supportStatus === "supported" ? okIfSupported(record, "ert-csv") : okIfRecognised(record, "ert-csv"),
  read: () => deferredRead("ert-csv"),
};
