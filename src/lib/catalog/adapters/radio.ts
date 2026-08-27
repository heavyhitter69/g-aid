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
  RADIO_CSV_FORMAT,
  RADIO_SPECTRUM_FORMAT,
  RADIO_XYZ_FORMAT,
  inspectRadiometricText,
  radioReadyForSupport,
} from "../radio-contract.ts";

function radioSniff(ctx: SniffContext): AdapterSniff | null {
  if (!looksMostlyText(ctx.peek)) return null;
  const inspected = inspectRadiometricText(ctx.peekText);
  if (!inspected.looksLikeRadiometric) return null;
  const formatId =
    inspected.formatId === "unknown"
      ? RADIO_CSV_FORMAT
      : inspected.formatId === RADIO_SPECTRUM_FORMAT
        ? RADIO_SPECTRUM_FORMAT
        : inspected.formatId;
  return {
    confidence: inspected.canonical ? 0.94 : inspected.rawSpectrum ? 0.88 : 0.82,
    formatId,
    mediaClass: "tabular-text",
    domainHint: "radiometrics",
    notes: [
      inspected.rawSpectrum
        ? "Channelised spectrometer table. Corrections are not a live capability."
        : inspected.canonical
          ? "Matched the G-AID RAD 1.0 named-column contract."
          : "Radiometric-like table; canonical mapping or correction history is incomplete.",
    ],
    parseErrors: inspected.looksLikeRadiometric ? undefined : inspected.errors,
  };
}

function radioInspect(ctx: SniffContext): CatalogInspection {
  const inspected = inspectRadiometricText(ctx.peekText);
  const ready = radioReadyForSupport(inspected);
  const errors = [...inspected.errors];
  if (!ready && inspected.looksLikeRadiometric) {
    errors.push(
      "This radiometric file is recognised but not a supported processing input until CRS, quantity, units, line, acquisition metadata, correction history, and a reviewed mapping (if names differ) are documented."
    );
  }
  const units =
    inspected.meta.quantity === "concentration"
      ? [inspected.meta.unitsK, inspected.meta.unitsU, inspected.meta.unitsTh, inspected.meta.unitsTc]
          .filter(Boolean)
          .join("; ") || inspected.meta.units
      : inspected.meta.units;
  return {
    columns: inspected.columns.slice(0, MAX_COLUMNS),
    headerSummary: headerSummaryFromText(ctx.peekText) || firstLines(ctx.peekText, 4).join(" | "),
    crs: inspected.meta.crs,
    units,
    parseErrors: errors.length ? errors : undefined,
    supportStatus: ready ? "supported" : "recognised-unsupported",
    radioMapping: inspected.suggestedMapping,
    radioQuantity: inspected.meta.quantity,
    correctionHistory: inspected.meta.correctionHistory,
    acquisitionPlatform: inspected.meta.platform,
    instrument: inspected.meta.instrument,
    bbox: inspected.bbox,
  };
}

export const radiometricXyzAdapter: CatalogAdapter = {
  id: "radiometric-xyz",
  formatId: RADIO_XYZ_FORMAT,
  supportStatus: "supported",
  sniff: (ctx) => {
    const sniffed = radioSniff(ctx);
    if (!sniffed) return null;
    if (sniffed.formatId !== RADIO_XYZ_FORMAT) return null;
    return sniffed;
  },
  inspect: radioInspect,
  validate: (record) =>
    record.supportStatus === "supported"
      ? okIfSupported(record, "radiometric-xyz")
      : okIfRecognised(record, "radiometric-xyz"),
  read: () => deferredRead("radiometric-xyz"),
};

export const radiometricCsvAdapter: CatalogAdapter = {
  id: "radiometric-csv",
  formatId: RADIO_CSV_FORMAT,
  supportStatus: "supported",
  sniff: (ctx) => {
    const sniffed = radioSniff(ctx);
    if (!sniffed) return null;
    if (sniffed.formatId !== RADIO_CSV_FORMAT) return null;
    return sniffed;
  },
  inspect: radioInspect,
  validate: (record) =>
    record.supportStatus === "supported"
      ? okIfSupported(record, "radiometric-csv")
      : okIfRecognised(record, "radiometric-csv"),
  read: () => deferredRead("radiometric-csv"),
};

export const radiometricSpectrumAdapter: CatalogAdapter = {
  id: "radiometric-spectrum",
  formatId: RADIO_SPECTRUM_FORMAT,
  supportStatus: "recognised-unsupported",
  sniff: (ctx) => {
    const sniffed = radioSniff(ctx);
    if (!sniffed) return null;
    if (sniffed.formatId !== RADIO_SPECTRUM_FORMAT) return null;
    return sniffed;
  },
  inspect: radioInspect,
  validate: (record) => okIfRecognised(record, "radiometric-spectrum"),
  read: () => deferredRead("radiometric-spectrum"),
};
