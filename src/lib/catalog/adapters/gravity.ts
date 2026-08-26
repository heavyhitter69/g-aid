import { MAX_COLUMNS } from "../types.ts";
import { firstLines, headerSummaryFromText, looksMostlyText } from "../peek.ts";
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
  GRAVITY_CSV_FORMAT,
  GRAVITY_XYZ_FORMAT,
  gravityReadyForSupport,
  inspectGravityText,
} from "../gravity-contract.ts";

function gravitySniff(ctx: SniffContext): AdapterSniff | null {
  if (!looksMostlyText(ctx.peek)) return null;
  const inspected = inspectGravityText(ctx.peekText);
  if (!inspected.looksLikeGravity) return null;
  return {
    confidence: inspected.canonical ? 0.94 : 0.82,
    formatId: inspected.formatId === "unknown" ? GRAVITY_XYZ_FORMAT : inspected.formatId,
    mediaClass: "tabular-text",
    domainHint: "gravity",
    notes: [
      inspected.canonical
        ? "Matched the G-AID gravity named-column contract."
        : "Gravity-like table; canonical X/Y/Gravity mapping is incomplete or unreviewed.",
    ],
    parseErrors: inspected.looksLikeGravity ? undefined : inspected.errors,
  };
}

function gravityInspect(ctx: SniffContext): CatalogInspection {
  const inspected = inspectGravityText(ctx.peekText);
  const ready = gravityReadyForSupport(inspected);
  const errors = [...inspected.errors];
  if (!ready && inspected.looksLikeGravity) {
    errors.push("This gravity file is recognised but not a supported processing input until CRS, units, and a reviewed mapping (if names differ) are documented.");
  }
  return {
    columns: inspected.columns.slice(0, MAX_COLUMNS),
    headerSummary: headerSummaryFromText(ctx.peekText) || firstLines(ctx.peekText, 4).join(" | "),
    crs: inspected.meta.crs,
    units: inspected.meta.units,
    parseErrors: errors.length ? errors : undefined,
    supportStatus: ready ? "supported" : "recognised-unsupported",
    columnMapping: inspected.suggestedMapping,
    elevationDatum: inspected.meta.elevationDatum,
    gravityDatum: inspected.meta.gravityDatum,
    bbox: inspected.bbox,
  };
}

export const gravityXyzAdapter: CatalogAdapter = {
  id: "gravity-xyz",
  formatId: GRAVITY_XYZ_FORMAT,
  supportStatus: "supported",
  sniff: (ctx) => {
    const sniffed = gravitySniff(ctx);
    if (!sniffed) return null;
    if (sniffed.formatId !== GRAVITY_XYZ_FORMAT) return null;
    return sniffed;
  },
  inspect: gravityInspect,
  validate: (record) =>
    record.supportStatus === "supported" ? okIfSupported(record, "gravity-xyz") : okIfRecognised(record, "gravity-xyz"),
  read: () => deferredRead("gravity-xyz"),
};

export const gravityCsvAdapter: CatalogAdapter = {
  id: "gravity-csv",
  formatId: GRAVITY_CSV_FORMAT,
  supportStatus: "supported",
  sniff: (ctx) => {
    const sniffed = gravitySniff(ctx);
    if (!sniffed) return null;
    if (sniffed.formatId !== GRAVITY_CSV_FORMAT) return null;
    return sniffed;
  },
  inspect: gravityInspect,
  validate: (record) =>
    record.supportStatus === "supported" ? okIfSupported(record, "gravity-csv") : okIfRecognised(record, "gravity-csv"),
  read: () => deferredRead("gravity-csv"),
};
