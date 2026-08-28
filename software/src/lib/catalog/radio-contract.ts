/**
 * Radiometric ingest contract (G-AID RAD 1.0).
 * K/U/Th columns or a familiar extension are not radiometric data.
 * Raw spectrometer files are recognised-unsupported until correction metadata
 * and live correction kernels exist.
 */

import type { CatalogBBox } from "./types.ts";

export const RADIO_CSV_FORMAT = "radiometric-csv";
export const RADIO_XYZ_FORMAT = "radiometric-xyz";
export const RADIO_SPECTRUM_FORMAT = "radiometric-spectrum";
export const RADIO_ADAPTER_IDS = ["radiometric-csv", "radiometric-xyz"] as const;

export const RADIO_CANONICAL = {
  x: "X",
  y: "Y",
  line: "Line",
  k: "K",
  eu: "eU",
  eth: "eTh",
  tc: "TC",
} as const;

export type RadioField = keyof typeof RADIO_CANONICAL;
export type RadioQuantity = "concentration" | "count_rate" | "counts";
export type RadioChannel = "k" | "eu" | "eth" | "tc";

export const RADIO_ALIASES: Record<RadioField, string[]> = {
  x: ["x", "easting", "east"],
  y: ["y", "northing", "north"],
  line: ["line", "flight_line", "linename", "line_id", "fiducial"],
  k: ["k", "k_pct", "k%", "potassium", "k_conc", "pctk"],
  eu: ["eu", "e_u", "eu_ppm", "equivalent_uranium"],
  eth: ["eth", "e_th", "eth_ppm", "equivalent_thorium"],
  tc: ["tc", "total_count", "totalcount", "dose", "dose_rate", "ngy"],
};

/** Used only when a radiometric header is already present. */
const HEADER_SCOPED_ALIASES: Record<RadioField, string[]> = {
  x: RADIO_ALIASES.x,
  y: RADIO_ALIASES.y,
  line: RADIO_ALIASES.line,
  k: [...RADIO_ALIASES.k, "pot"],
  eu: [...RADIO_ALIASES.eu, "u", "uranium", "u_ppm"],
  eth: [...RADIO_ALIASES.eth, "th", "thorium", "th_ppm"],
  tc: RADIO_ALIASES.tc,
};

export interface RadioColumnMapping {
  x: string;
  y: string;
  line: string;
  k?: string;
  eu?: string;
  eth?: string;
  tc?: string;
  reviewed: boolean;
  reviewedAt?: string;
}

export interface RadioHeaderMeta {
  crs?: string;
  epsg?: number;
  quantity?: RadioQuantity;
  unitsK?: string;
  unitsU?: string;
  unitsTh?: string;
  unitsTc?: string;
  units?: string;
  correctionHistory?: string;
  platform?: string;
  instrument?: string;
  acquisitionDate?: string;
  comments: string[];
}

export interface RadioContractResult {
  looksLikeRadiometric: boolean;
  rawSpectrum: boolean;
  formatId: typeof RADIO_CSV_FORMAT | typeof RADIO_XYZ_FORMAT | typeof RADIO_SPECTRUM_FORMAT | "unknown";
  columns: string[];
  canonical: boolean;
  suggestedMapping?: RadioColumnMapping;
  mappingComplete: boolean;
  meta: RadioHeaderMeta;
  errors: string[];
  warnings: string[];
  bbox?: CatalogBBox;
  channels: RadioChannel[];
}

function norm(name: string): string {
  return name.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

export function parseRadioCommentMeta(text: string): RadioHeaderMeta {
  const comments = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[\\/#;]/.test(line) || line.toLowerCase().startsWith("/"));
  const blob = comments.join("\n");
  const epsgMatch = blob.match(/EPSG\s*[=:]\s*(\d{4,5})/i) || blob.match(/CRS\s*[=:]\s*EPSG:(\d{4,5})/i);
  const crsName = blob.match(/Coordinate System\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const quantityRaw = blob.match(/Quantity\s*[=:]\s*([^\n]+)/i)?.[1]?.trim().toLowerCase();
  let quantity: RadioQuantity | undefined;
  if (quantityRaw) {
    if (/concentrat/.test(quantityRaw)) quantity = "concentration";
    else if (/count[_\s-]?rate|cps/.test(quantityRaw)) quantity = "count_rate";
    else if (/^counts?\b/.test(quantityRaw) || quantityRaw === "counts") quantity = "counts";
  }
  const unitsK = blob.match(/UnitsK\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const unitsU = blob.match(/UnitsU\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const unitsTh = blob.match(/UnitsTh\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const unitsTc = blob.match(/UnitsTC\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const unitsGeneric = blob.match(/Units?\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const correctionHistory = blob.match(/CorrectionHistory\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const platform = blob.match(/Platform\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const instrument = blob.match(/Instrument\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const acquisitionDate = blob.match(/AcquisitionDate\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const epsg = epsgMatch ? parseInt(epsgMatch[1], 10) : undefined;
  if (!quantity && unitsGeneric) {
    const u = unitsGeneric.toLowerCase();
    if (/%k|ppm\s*e[u]|ppm\s*eth|ngy/.test(u)) quantity = "concentration";
    else if (/\bcps\b|count\/s|counts per second/.test(u)) quantity = "count_rate";
    else if (/\bcounts?\b/.test(u) && !/count_rate|cps/.test(u)) quantity = "counts";
  }
  return {
    comments,
    epsg,
    crs: epsg ? `EPSG:${epsg}` : crsName,
    quantity,
    unitsK,
    unitsU,
    unitsTh,
    unitsTc,
    units: unitsGeneric,
    correctionHistory,
    platform,
    instrument,
    acquisitionDate,
  };
}

function splitColumns(line: string): string[] {
  const cleaned = line.replace(/^[/\\#;]\s*/, "").trim();
  if (!cleaned) return [];
  if (cleaned.includes(",")) return cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  return cleaned.split(/\s+/).filter(Boolean);
}

function isNumericRow(cols: string[]): boolean {
  if (cols.length < 2) return false;
  return cols.every((col) => /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(col));
}

function radioHeaderToken(text: string): boolean {
  return /g-aid\s*rad|radiometr|spectrometer|equivalent uranium|equivalent thorium|\beU\b|\beTh\b|total[_\s-]?count|nGy|airborne gamma/i.test(
    text
  );
}

function looksLikeNamedRadioHeader(cols: string[], headerPresent: boolean): boolean {
  if (cols.length < 3 || isNumericRow(cols)) return false;
  const names = cols.map(norm);
  const coord = names.some((col) => ["x", "y", "easting", "northing", "east", "north"].includes(col));
  const distinctive = names.some((col) => ["eu", "e_u", "eth", "e_th", "tc", "total_count", "totalcount"].includes(col));
  const kuTh = names.includes("k") && names.includes("u") && names.includes("th");
  return coord && (distinctive || (headerPresent && kuTh));
}

export function findRadioHeaderColumns(text: string): string[] {
  const headerPresent = radioHeaderToken(text);
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^[\\/#;]/.test(line)) {
      const cols = splitColumns(line);
      if (looksLikeNamedRadioHeader(cols, headerPresent)) return cols;
      continue;
    }
    const cols = splitColumns(line);
    if (cols.length >= 3 && !isNumericRow(cols)) return cols;
    break;
  }
  return [];
}

function channelColumns(columns: string[]): string[] {
  return columns.filter((col) => /^ch\d+$/i.test(norm(col).replace("_", "")));
}

function aliasHit(field: RadioField, columns: string[], headerPresent: boolean): string | undefined {
  const aliases = headerPresent ? HEADER_SCOPED_ALIASES[field] : RADIO_ALIASES[field];
  const hits = columns.filter((col) => aliases.includes(norm(col)));
  return hits.length === 1 ? hits[0] : undefined;
}

export function suggestRadioMapping(columns: string[], headerPresent: boolean): RadioColumnMapping | undefined {
  const x = aliasHit("x", columns, headerPresent);
  const y = aliasHit("y", columns, headerPresent);
  const line = aliasHit("line", columns, headerPresent);
  if (!x || !y || !line) return undefined;
  const mapping: RadioColumnMapping = {
    x,
    y,
    line,
    k: aliasHit("k", columns, headerPresent),
    eu: aliasHit("eu", columns, headerPresent),
    eth: aliasHit("eth", columns, headerPresent),
    tc: aliasHit("tc", columns, headerPresent),
    reviewed: false,
  };
  if (!mapping.k && !mapping.eu && !mapping.eth && !mapping.tc) return undefined;
  return mapping;
}

export function mappingIsCanonical(mapping: RadioColumnMapping, columns: string[]): boolean {
  const has = (name: string) => columns.some((col) => col === name);
  if (mapping.x !== RADIO_CANONICAL.x || mapping.y !== RADIO_CANONICAL.y || mapping.line !== RADIO_CANONICAL.line) {
    return false;
  }
  if (!has(RADIO_CANONICAL.x) || !has(RADIO_CANONICAL.y) || !has(RADIO_CANONICAL.line)) return false;
  const channels: Array<[keyof RadioColumnMapping, string]> = [
    ["k", RADIO_CANONICAL.k],
    ["eu", RADIO_CANONICAL.eu],
    ["eth", RADIO_CANONICAL.eth],
    ["tc", RADIO_CANONICAL.tc],
  ];
  for (const [field, canonical] of channels) {
    const value = mapping[field];
    if (value && value !== canonical) return false;
  }
  return true;
}

export function mappingCoversRequired(mapping: RadioColumnMapping | undefined): boolean {
  if (!mapping?.x || !mapping?.y || !mapping?.line) return false;
  return Boolean(mapping.k || mapping.eu || mapping.eth || mapping.tc);
}

function xyBBox(text: string, columns: string[], mapping: RadioColumnMapping | undefined): CatalogBBox | undefined {
  if (!mapping) return undefined;
  const xi = columns.findIndex((col) => col === mapping.x);
  const yi = columns.findIndex((col) => col === mapping.y);
  if (xi < 0 || yi < 0) return undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let headerSeen = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[\\/#;]/.test(line)) continue;
    const cols = splitColumns(line);
    if (!headerSeen && !isNumericRow(cols)) {
      headerSeen = true;
      continue;
    }
    headerSeen = true;
    const x = Number(cols[xi]);
    const y = Number(cols[yi]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return undefined;
  return { minX, minY, maxX, maxY };
}

function presentChannels(mapping?: RadioColumnMapping): RadioChannel[] {
  if (!mapping) return [];
  const out: RadioChannel[] = [];
  if (mapping.k) out.push("k");
  if (mapping.eu) out.push("eu");
  if (mapping.eth) out.push("eth");
  if (mapping.tc) out.push("tc");
  return out;
}

function concentrationUnitsOk(meta: RadioHeaderMeta, channels: RadioChannel[]): boolean {
  const kOk = !channels.includes("k") || /%/.test(meta.unitsK || meta.units || "");
  const uOk = !channels.includes("eu") || /ppm/.test(meta.unitsU || meta.units || "");
  const thOk = !channels.includes("eth") || /ppm/.test(meta.unitsTh || meta.units || "");
  const tcOk = !channels.includes("tc") || /ngy|nGy|cps|count/i.test(meta.unitsTc || meta.units || "");
  return kOk && uOk && thOk && tcOk;
}

function countRateUnitsOk(meta: RadioHeaderMeta): boolean {
  const blob = [meta.units, meta.unitsK, meta.unitsU, meta.unitsTh, meta.unitsTc].filter(Boolean).join(" ");
  return /\bcps\b|count\/s|counts per second/i.test(blob);
}

export function inspectRadiometricText(text: string): RadioContractResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const meta = parseRadioCommentMeta(text);
  const headerPresent = radioHeaderToken(text);
  const columns = findRadioHeaderColumns(text);
  const chCols = channelColumns(columns);
  const liveTime = columns.some((col) => /live[_\s-]?time/i.test(col));
  const rawSpectrum = chCols.length >= 8 || (liveTime && chCols.length >= 4);
  const suggested = columns.length && !rawSpectrum ? suggestRadioMapping(columns, headerPresent) : undefined;
  const distinctiveCol = columns.some((col) => /^(eu|e_u|eth|e_th|tc|total_count)$/i.test(norm(col)));
  const looksLikeRadiometric = Boolean(
    rawSpectrum || suggested || (headerPresent && columns.length >= 3) || distinctiveCol
  );
  const comma = text.split(/\r?\n/).some((line) => line.includes(",") && !/^[\\/#;]/.test(line.trim()));
  const formatId = !looksLikeRadiometric
    ? "unknown"
    : rawSpectrum
      ? RADIO_SPECTRUM_FORMAT
      : comma
        ? RADIO_CSV_FORMAT
        : RADIO_XYZ_FORMAT;

  if (rawSpectrum) {
    errors.push(
      "This looks like raw or channelised spectrometer data. Height correction, stripping, NASVD, dead-time, background, and concentration conversion are not live capabilities. Required metadata (live time, channel definitions, calibration, stripping coefficients, altitude) is not a supported processing contract in this release."
    );
  }
  if (!rawSpectrum && looksLikeRadiometric) {
    if (!columns.length) {
      errors.push("No named radiometric header. Numeric XYZ without column names is not a supported radiometric contract.");
    }
    if (!suggested) {
      errors.push("Required columns X/Y/Line plus at least one of K, eU, eTh, TC (or a reviewed mapping) are missing.");
    }
    if (!meta.crs && meta.epsg == null) {
      errors.push("CRS is not documented (need / EPSG=… or Coordinate System=…).");
    }
    if (!meta.quantity) {
      errors.push("Quantity is not documented (need / Quantity=concentration, count_rate, or counts). I will not infer counts vs concentrations from the numbers.");
    }
    if (meta.quantity === "counts") {
      errors.push("Quantity=counts is raw spectrometer output. Correction, stripping, and concentration conversion are not implemented as live capabilities.");
    }
    if (!meta.correctionHistory || /^(unknown|none|n\/a|-)$/i.test(meta.correctionHistory)) {
      errors.push("CorrectionHistory is required. Already-corrected products must declare what was applied. I will not assume IAEA stripping or height correction.");
    }
    if (!meta.platform && !meta.instrument && !meta.acquisitionDate) {
      errors.push("Acquisition metadata is missing (need / Platform= and/or / Instrument= and/or / AcquisitionDate=).");
    }
    if (suggested && !canonicalReady(suggested, columns) && !suggested.reviewed) {
      errors.push("Column names differ from the canonical X, Y, Line, K, eU, eTh, TC contract. Store a reviewed mapping before processing.");
    }
    if (meta.quantity === "concentration" && suggested && !concentrationUnitsOk(meta, presentChannels(suggested))) {
      errors.push("Concentration channels need documented units (UnitsK=%K, UnitsU=ppm eU, UnitsTh=ppm eTh).");
    }
    if (meta.quantity === "count_rate" && !countRateUnitsOk(meta)) {
      errors.push("Count-rate data need documented units (cps).");
    }
    if (meta.quantity === "count_rate") {
      warnings.push("Count-rate products can be ingested and gridded. Ternary K-U-Th and concentration ratios are not justified.");
    }
  }

  const canonical = suggested ? mappingIsCanonical(suggested, columns) : false;
  return {
    looksLikeRadiometric,
    rawSpectrum,
    formatId,
    columns,
    canonical,
    suggestedMapping: suggested,
    mappingComplete: mappingCoversRequired(suggested) && canonical,
    meta,
    errors: looksLikeRadiometric
      ? errors
      : ["Not a radiometric table under the G-AID RAD 1.0 contract. K/U/Th assay columns are not radiometric data."],
    warnings,
    bbox: suggested ? xyBBox(text, columns, suggested) : undefined,
    channels: presentChannels(suggested),
  };
}

function canonicalReady(mapping: RadioColumnMapping, columns: string[]): boolean {
  return mappingIsCanonical(mapping, columns);
}

export function radioReadyForSupport(result: RadioContractResult, mapping?: RadioColumnMapping): boolean {
  const used = mapping && mapping.reviewed ? mapping : result.suggestedMapping;
  if (!result.looksLikeRadiometric) return false;
  if (result.rawSpectrum) return false;
  if (result.meta.quantity === "counts") return false;
  if (!mappingCoversRequired(used)) return false;
  if (!result.meta.quantity) return false;
  if (!result.meta.crs && result.meta.epsg == null) return false;
  if (!result.meta.correctionHistory || /^(unknown|none|n\/a|-)$/i.test(result.meta.correctionHistory)) return false;
  if (!result.meta.platform && !result.meta.instrument && !result.meta.acquisitionDate) return false;
  if (used && !mappingIsCanonical(used, result.columns) && !used.reviewed) return false;
  if (result.errors.some((err) => /raw spectrometer|Quantity=counts|documented units/i.test(err))) return false;
  return true;
}

export function isRadioAdapterId(id: string | null | undefined): boolean {
  return RADIO_ADAPTER_IDS.includes(id as (typeof RADIO_ADAPTER_IDS)[number]);
}

export function ternaryJustified(quantity?: RadioQuantity, channels?: RadioChannel[]): boolean {
  if (quantity !== "concentration") return false;
  const set = new Set(channels || []);
  return set.has("k") && set.has("eu") && set.has("eth");
}

export function ratioJustified(quantity?: RadioQuantity, channels?: RadioChannel[]): boolean {
  if (quantity !== "concentration") return false;
  const set = new Set(channels || []);
  return (set.has("eu") && set.has("eth")) || (set.has("eu") && set.has("k")) || (set.has("eth") && set.has("k"));
}
