import { MAX_COLUMNS } from "../types.ts";
import { firstLines, headerSummaryFromText, looksMostlyText } from "../peek-text.ts";
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
  GEOCHEM_CSV_FORMAT,
  GEOCHEM_XYZ_FORMAT,
  geochemReadyForSupport,
  inspectGeochemText,
} from "../geochem-contract.ts";

function geochemSniff(ctx: SniffContext): AdapterSniff | null {
  if (!looksMostlyText(ctx.peek)) return null;
  const inspected = inspectGeochemText(ctx.peekText);
  if (!inspected.looksLikeGeochem) return null;
  const formatId = inspected.formatId === "unknown" ? GEOCHEM_CSV_FORMAT : inspected.formatId;
  return {
    confidence: inspected.canonical ? 0.94 : 0.82,
    formatId,
    mediaClass: "tabular-text",
    domainHint: "geochemistry",
    notes: [
      inspected.canonical
        ? "Matched the G-AID GEOCHEM 1.0 named-column contract."
        : "Geochemistry-like table; canonical mapping, CRS, or medium is incomplete. Element-like names alone are not a contract.",
    ],
  };
}

function geochemInspect(ctx: SniffContext): CatalogInspection {
  const inspected = inspectGeochemText(ctx.peekText);
  const ready = geochemReadyForSupport(inspected);
  const errors = [...inspected.errors];
  if (!ready && inspected.looksLikeGeochem) {
    errors.push(
      "This assay/sample file is recognised but not a supported processing input until CRS, sample medium, documented element units, and a reviewed mapping (if names differ) are present."
    );
  }
  const units =
    inspected.elements.length && inspected.elements.every((el) => el.units === inspected.elements[0].units)
      ? inspected.elements[0].units
      : inspected.meta.units || (inspected.elements.length ? "mixed" : undefined);
  return {
    columns: inspected.columns.slice(0, MAX_COLUMNS),
    headerSummary: headerSummaryFromText(ctx.peekText) || firstLines(ctx.peekText, 4).join(" | "),
    crs: inspected.meta.crs,
    units,
    parseErrors: errors.length ? errors : undefined,
    supportStatus: ready ? "supported" : inspected.looksLikeGeochem ? "recognised-unsupported" : "unknown",
    geochemMapping: inspected.suggestedMapping,
    sampleMedium: inspected.meta.medium,
    lab: inspected.meta.lab,
    analyticalMethod: inspected.meta.method,
    detectionLimitTreatment: inspected.meta.detectionLimitTreatment || "censored",
    locationQuality: inspected.meta.crs ? "documented" : "missing",
    coordinateKind:
      inspected.meta.crs === "OGC:CRS84" || inspected.meta.crs === "EPSG:4326" ? "geographic" : inspected.meta.crs ? "easting-northing" : "unknown",
    bbox: inspected.bbox,
  };
}

export const geochemXyzAdapter: CatalogAdapter = {
  id: "geochem-xyz",
  formatId: GEOCHEM_XYZ_FORMAT,
  supportStatus: "supported",
  sniff: (ctx) => {
    const sniffed = geochemSniff(ctx);
    if (!sniffed) return null;
    if (sniffed.formatId !== GEOCHEM_XYZ_FORMAT) return null;
    return sniffed;
  },
  inspect: geochemInspect,
  validate: (record) =>
    record.supportStatus === "supported"
      ? okIfSupported(record, "geochem-xyz")
      : okIfRecognised(record, "geochem-xyz"),
  read: () => deferredRead("geochem-xyz"),
};

export const geochemCsvAdapter: CatalogAdapter = {
  id: "geochem-csv",
  formatId: GEOCHEM_CSV_FORMAT,
  supportStatus: "supported",
  sniff: (ctx) => {
    const sniffed = geochemSniff(ctx);
    if (!sniffed) return null;
    if (sniffed.formatId !== GEOCHEM_CSV_FORMAT) return null;
    return sniffed;
  },
  inspect: geochemInspect,
  validate: (record) =>
    record.supportStatus === "supported"
      ? okIfSupported(record, "geochem-csv")
      : okIfRecognised(record, "geochem-csv"),
  read: () => deferredRead("geochem-csv"),
};
