import { MAX_COLUMNS } from "../types.ts";
import { firstLines, headerSummaryFromText, splitHeader } from "../peek-text.ts";
import {
  deferredRead,
  okIfSupported,
  type AdapterSniff,
  type CatalogAdapter,
  type CatalogInspection,
  type SniffContext,
} from "./types.ts";

function hasMagArrowHeaders(text: string): boolean {
  const lower = text.toLowerCase();
  const lat = /\blatitude\b|\blat\b/.test(lower);
  const lon = /\blongitude\b|\blon\b|\blong\b/.test(lower);
  const mag = /\bmag\b|\bmagnetic\b|\btmi\b|\bmagnt\b/.test(lower);
  return lat && lon && mag;
}

function magarrowSniff(ctx: SniffContext): AdapterSniff | null {
  if (!hasMagArrowHeaders(ctx.peekText)) return null;
  return {
    confidence: 0.92,
    formatId: "magarrow",
    mediaClass: "tabular-text",
    domainHint: "magnetics",
    notes: ["Matched MagArrow header contract (latitude, longitude, mag)."],
  };
}

function magarrowInspect(ctx: SniffContext): CatalogInspection {
  const headerLine = firstLines(ctx.peekText, 8).find((line) => hasMagArrowHeaders(line)) || firstLines(ctx.peekText, 1)[0] || "";
  const columns = splitHeader(headerLine).slice(0, MAX_COLUMNS);
  return {
    columns: columns.length ? columns : undefined,
    headerSummary: headerSummaryFromText(ctx.peekText),
    units: "nT",
    parseErrors: columns.length < 3 ? ["MagArrow header has fewer than three columns in the peeked bytes."] : undefined,
  };
}

export const magarrowAdapter: CatalogAdapter = {
  id: "magarrow",
  formatId: "magarrow",
  supportStatus: "supported",
  sniff: magarrowSniff,
  inspect: magarrowInspect,
  validate: (record) => okIfSupported(record, "magarrow"),
  read: () => deferredRead("magarrow"),
};
