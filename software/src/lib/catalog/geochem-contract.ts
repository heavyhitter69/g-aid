/**
 * Geochemistry ingest contract (G-AID GEOCHEM 1.0).
 *
 * Element-like column names (Fe, Cu, Au, K, U, Th) are not geochemistry.
 * An arbitrary CSV is not a processing input because it looks chemical.
 * Classification requires a documented banner and/or / CRS= plus / Medium=.
 */

import type { CatalogBBox } from "./types.ts";

export const GEOCHEM_CSV_FORMAT = "geochem-csv";
export const GEOCHEM_XYZ_FORMAT = "geochem-xyz";
export const GEOCHEM_ADAPTER_IDS = ["geochem-csv", "geochem-xyz"] as const;

export const GEOCHEM_CANONICAL = {
  sampleId: "SampleID",
  x: "X",
  y: "Y",
  medium: "Medium",
  qcFlag: "QCFlag",
  batch: "Batch",
  date: "Date",
  lab: "Lab",
  method: "Method",
} as const;

export const GEOCHEM_MEDIA = [
  "soil",
  "rock",
  "stream-sediment",
  "till",
  "lag",
  "vegetation",
  "water",
  "drill-core",
  "rock-chip",
  "unknown",
] as const;

export type GeochemMedium = (typeof GEOCHEM_MEDIA)[number];

export const GEOCHEM_UNITS = ["ppm", "ppb", "pct", "percent", "wt%"] as const;
export type GeochemUnit = (typeof GEOCHEM_UNITS)[number];

export const GEOCHEM_QC_FLAGS = ["sample", "blank", "standard", "field_duplicate", "lab_duplicate"] as const;
export type GeochemQcFlag = (typeof GEOCHEM_QC_FLAGS)[number];

export interface GeochemElementMapping {
  column: string;
  symbol: string;
  units: string;
  qualifierColumn?: string;
  detectionLimitColumn?: string;
}

export interface GeochemColumnMapping {
  sampleId: string;
  x: string;
  y: string;
  medium?: string;
  elements: GeochemElementMapping[];
  qcFlag?: string;
  batch?: string;
  date?: string;
  lab?: string;
  method?: string;
  reviewed: boolean;
  reviewedAt?: string;
}

export interface GeochemHeaderMeta {
  crs?: string;
  epsg?: number;
  medium?: string;
  units?: string;
  lab?: string;
  method?: string;
  detectionLimitTreatment?: string;
  standardExpected?: string;
  comments: string[];
}

export interface GeochemContractResult {
  looksLikeGeochem: boolean;
  formatId: typeof GEOCHEM_CSV_FORMAT | typeof GEOCHEM_XYZ_FORMAT | "unknown";
  columns: string[];
  canonical: boolean;
  suggestedMapping?: GeochemColumnMapping;
  mappingComplete: boolean;
  meta: GeochemHeaderMeta;
  errors: string[];
  warnings: string[];
  bbox?: CatalogBBox;
  elements: GeochemElementMapping[];
}

function norm(name: string): string {
  return name.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

export function parseGeochemCommentMeta(text: string): GeochemHeaderMeta {
  const comments = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[\\/#;]/.test(line) || line.toLowerCase().startsWith("/"));
  const blob = comments.join("\n");
  const epsgMatch = blob.match(/EPSG\s*[=:]\s*(\d{4,5})/i) || blob.match(/CRS\s*[=:]\s*EPSG:(\d{4,5})/i);
  const crs84 = /CRS\s*[=:]\s*OGC:CRS84/i.test(blob);
  const crsName = blob.match(/CRS\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const medium = blob.match(/Medium\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const units = blob.match(/Units\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const lab = blob.match(/Lab\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const method = blob.match(/Method\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const detectionLimitTreatment = blob.match(/DetectionLimitTreatment\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const standardExpected = blob.match(/StandardExpected\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const epsg = epsgMatch ? parseInt(epsgMatch[1], 10) : undefined;
  let crs: string | undefined;
  if (crs84) crs = "OGC:CRS84";
  else if (epsg) crs = `EPSG:${epsg}`;
  else if (crsName && !/^unknown$/i.test(crsName)) crs = crsName;
  return {
    comments,
    epsg,
    crs,
    medium,
    units,
    lab,
    method,
    detectionLimitTreatment,
    standardExpected,
  };
}

export function geochemBannerPresent(text: string): boolean {
  return /g-aid\s*geochem/i.test(text);
}

export function looksLikeGeochem(text: string): boolean {
  if (geochemBannerPresent(text)) return true;
  const comments = text
    .split(/\r?\n/)
    .filter((line) => /^[\\/#;]/.test(line.trim()) || line.trim().toLowerCase().startsWith("/"))
    .join("\n");
  return /\/\s*CRS\s*=/i.test(comments) && /\/\s*Medium\s*=/i.test(comments);
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

export function findGeochemHeaderColumns(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^[\\/#;]/.test(line)) {
      const cols = splitColumns(line);
      if (cols.length >= 3 && !isNumericRow(cols) && cols.some((col) => /sample|site|x|y|easting|northing/i.test(col))) {
        return cols;
      }
      continue;
    }
    const cols = splitColumns(line);
    if (cols.length >= 3 && !isNumericRow(cols)) return cols;
    break;
  }
  return [];
}

const SAMPLE_ALIASES = ["sampleid", "sample_id", "sampid", "site", "site_id", "sample"];
const X_ALIASES = ["x", "easting", "east"];
const Y_ALIASES = ["y", "northing", "north"];
const MEDIUM_ALIASES = ["medium", "type", "sample_type", "samplemedium", "lithology"];
const QC_ALIASES = ["qcflag", "qc_flag", "qc", "sample_class"];
const BATCH_ALIASES = ["batch", "job", "workorder"];
const DATE_ALIASES = ["date", "sample_date", "sampled"];
const LAB_ALIASES = ["lab", "laboratory"];
const METHOD_ALIASES = ["method", "anal_method", "analytical_method"];

const ELEMENT_UNIT = /^(?:([A-Z][a-z]{0,1}|[A-Z][a-z]?\d*[A-Za-z0-9]*)|Au|Ag|Cu|Fe|Zn|Pb|As|Ni|Co|Mo|U|Th|K|W|Sn|Sb|Bi|Cd|Cr|Mn|V|Ti|P|S|Ba|Sr|Rb|Zr|Y|La|Ce|Nd)_(ppm|ppb|pct|percent|wt%|wtpct)$/i;
const QUAL_SUFFIX = /_(qual|qualifier)$/i;
const DL_SUFFIX = /_(dl|lod|detection_limit)$/i;

function aliasHit(aliases: string[], columns: string[]): string | undefined {
  const hits = columns.filter((col) => aliases.includes(norm(col)));
  return hits.length === 1 ? hits[0] : undefined;
}

export function normalizeGeochemUnit(raw?: string): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (value === "ppm" || value === "ug/g" || value === "µg/g") return "ppm";
  if (value === "ppb" || value === "ng/g") return "ppb";
  if (value === "pct" || value === "percent" || value === "%" || value === "wt%" || value === "wtpct" || value === "wt.%") {
    return "pct";
  }
  return raw.trim();
}

export function parseCanonicalElementColumn(name: string): GeochemElementMapping | undefined {
  const cleaned = name.replace(/^\uFEFF/, "").trim();
  if (QUAL_SUFFIX.test(cleaned) || DL_SUFFIX.test(cleaned)) return undefined;
  const match = cleaned.match(ELEMENT_UNIT);
  if (!match) return undefined;
  const symbol = match[1];
  const units = normalizeGeochemUnit(match[2]) || match[2];
  if (!symbol) return undefined;
  return { column: cleaned, symbol, units };
}

function reservedName(name: string): boolean {
  const n = norm(name);
  return (
    SAMPLE_ALIASES.includes(n) ||
    X_ALIASES.includes(n) ||
    Y_ALIASES.includes(n) ||
    MEDIUM_ALIASES.includes(n) ||
    QC_ALIASES.includes(n) ||
    BATCH_ALIASES.includes(n) ||
    DATE_ALIASES.includes(n) ||
    LAB_ALIASES.includes(n) ||
    METHOD_ALIASES.includes(n) ||
    QUAL_SUFFIX.test(name) ||
    DL_SUFFIX.test(name)
  );
}

function pairMetaColumns(columns: string[], mapping: GeochemElementMapping): GeochemElementMapping {
  const stem = mapping.column.replace(/_(ppm|ppb|pct|percent|wt%|wtpct)$/i, "");
  const qual = columns.find((col) => norm(col) === norm(`${stem}_qual`) || norm(col) === norm(`${stem}_qualifier`) || norm(col) === norm(`${mapping.symbol}_qual`));
  const dl = columns.find((col) => norm(col) === norm(`${stem}_dl`) || norm(col) === norm(`${stem}_lod`) || norm(col) === norm(`${mapping.symbol}_dl`));
  return {
    ...mapping,
    qualifierColumn: qual,
    detectionLimitColumn: dl,
  };
}

export function suggestGeochemMapping(columns: string[], meta: GeochemHeaderMeta): GeochemColumnMapping | undefined {
  const sampleId = aliasHit(SAMPLE_ALIASES, columns);
  const x = aliasHit(X_ALIASES, columns);
  const y = aliasHit(Y_ALIASES, columns);
  if (!sampleId || !x || !y) return undefined;
  const canonicalElements = columns
    .map(parseCanonicalElementColumn)
    .filter((item): item is GeochemElementMapping => Boolean(item))
    .map((item) => pairMetaColumns(columns, item));
  const defaultUnit = normalizeGeochemUnit(meta.units);
  const ambiguous: string[] = [];
  if (!canonicalElements.length && defaultUnit) {
    for (const col of columns) {
      if (reservedName(col)) continue;
      const n = col.replace(/^\uFEFF/, "").trim();
      if (/^[A-Z][a-z]?$/i.test(n) || /^[A-Z][a-z]{0,8}$/i.test(n)) {
        ambiguous.push(n);
      }
    }
  }
  const elements =
    canonicalElements.length > 0
      ? canonicalElements
      : ambiguous.length
        ? ambiguous.map((column) => ({
            column,
            symbol: column,
            units: defaultUnit || "unknown",
          }))
        : [];
  if (!elements.length) return undefined;
  return {
    sampleId,
    x,
    y,
    medium: aliasHit(MEDIUM_ALIASES, columns),
    elements,
    qcFlag: aliasHit(QC_ALIASES, columns),
    batch: aliasHit(BATCH_ALIASES, columns),
    date: aliasHit(DATE_ALIASES, columns),
    lab: aliasHit(LAB_ALIASES, columns),
    method: aliasHit(METHOD_ALIASES, columns),
    reviewed: false,
  };
}

export function mappingIsCanonical(mapping: GeochemColumnMapping, columns: string[]): boolean {
  if (mapping.sampleId !== GEOCHEM_CANONICAL.sampleId) return false;
  if (mapping.x !== GEOCHEM_CANONICAL.x || mapping.y !== GEOCHEM_CANONICAL.y) return false;
  if (!columns.includes(GEOCHEM_CANONICAL.sampleId) || !columns.includes(GEOCHEM_CANONICAL.x) || !columns.includes(GEOCHEM_CANONICAL.y)) {
    return false;
  }
  if (mapping.medium && mapping.medium !== GEOCHEM_CANONICAL.medium) return false;
  if (!mapping.elements.length) return false;
  return mapping.elements.every((el) => {
    const parsed = parseCanonicalElementColumn(el.column);
    return Boolean(parsed && parsed.symbol === el.symbol && normalizeGeochemUnit(parsed.units) === normalizeGeochemUnit(el.units));
  });
}

export function mappingCoversRequired(mapping: GeochemColumnMapping | undefined): boolean {
  if (!mapping?.sampleId || !mapping?.x || !mapping?.y) return false;
  return mapping.elements.length > 0 && mapping.elements.every((el) => Boolean(el.column && el.symbol && el.units && el.units !== "unknown"));
}

function xyBBox(text: string, columns: string[], mapping: GeochemColumnMapping | undefined): CatalogBBox | undefined {
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

export function inspectGeochemText(text: string): GeochemContractResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const meta = parseGeochemCommentMeta(text);
  const looks = looksLikeGeochem(text);
  const columns = looks ? findGeochemHeaderColumns(text) : [];
  const suggested = columns.length ? suggestGeochemMapping(columns, meta) : undefined;
  const comma = text.split(/\r?\n/).some((line) => line.includes(",") && !/^[\\/#;]/.test(line.trim()));
  const formatId = !looks ? "unknown" : comma ? GEOCHEM_CSV_FORMAT : GEOCHEM_XYZ_FORMAT;

  if (looks) {
    if (!columns.length) {
      errors.push("No named geochemistry header. Numeric XYZ without column names is not a supported assay contract.");
    }
    if (!suggested) {
      errors.push(
        "Required columns SampleID, X, Y plus at least one documented element (or a reviewed mapping) are missing."
      );
    }
    if (!meta.crs && meta.epsg == null) {
      errors.push("CRS is not documented (need / CRS=EPSG:… or / CRS=OGC:CRS84).");
    }
    if (!meta.medium && !suggested?.medium) {
      errors.push("Sample medium/type is not documented (need / Medium=… or a Medium column).");
    }
    if (suggested && !mappingIsCanonical(suggested, columns) && !suggested.reviewed) {
      errors.push(
        "Column names differ from the canonical SampleID, X, Y, Medium, Element_unit contract. Store a reviewed mapping before processing."
      );
    }
    const unknownUnits = suggested?.elements.filter((el) => !el.units || el.units === "unknown") || [];
    if (unknownUnits.length) {
      errors.push(
        `Element units are undocumented for: ${unknownUnits.map((el) => el.column).join(", ")}. I will not infer ppm from the numbers.`
      );
    }
    const unitSet = new Set((suggested?.elements || []).map((el) => normalizeGeochemUnit(el.units) || el.units));
    if (unitSet.size > 1) {
      warnings.push(
        "Mixed element units are preserved. Direct comparison of those elements is blocked until units match."
      );
    }
    const ambiguousHeaders = columns.filter((col) => {
      if (reservedName(col)) return false;
      if (parseCanonicalElementColumn(col)) return false;
      return /^[A-Z][a-z]?$/i.test(col.trim()) || /gold|copper|iron|arsenic/i.test(col);
    });
    if (ambiguousHeaders.length && (!suggested || !mappingIsCanonical(suggested, columns))) {
      errors.push(
        `Element-name ambiguity: ${ambiguousHeaders.join(", ")}. Map each column to a symbol and unit; I will not guess Au from gold or Fe from iron.`
      );
    }
    if (meta.detectionLimitTreatment && !/censor/i.test(meta.detectionLimitTreatment)) {
      warnings.push(
        "Detection-limit treatment is recorded as-is. Below-detection values stay censored; they are not replaced with zero."
      );
    }
  }

  const canonical = suggested ? mappingIsCanonical(suggested, columns) : false;
  return {
    looksLikeGeochem: looks,
    formatId,
    columns,
    canonical,
    suggestedMapping: suggested,
    mappingComplete: mappingCoversRequired(suggested) && canonical,
    meta,
    errors: looks
      ? errors
      : [
          "Not a geochemistry table under the G-AID GEOCHEM 1.0 contract. Element-like column names are not assay data.",
        ],
    warnings,
    bbox: suggested ? xyBBox(text, columns, suggested) : undefined,
    elements: suggested?.elements || [],
  };
}

export function geochemReadyForSupport(result: GeochemContractResult, mapping?: GeochemColumnMapping): boolean {
  const used = mapping && mapping.reviewed ? mapping : result.suggestedMapping;
  if (!result.looksLikeGeochem) return false;
  if (!mappingCoversRequired(used)) return false;
  if (!result.meta.crs && result.meta.epsg == null) return false;
  if (!result.meta.medium && !used?.medium) return false;
  if (used && !mappingIsCanonical(used, result.columns) && !used.reviewed) return false;
  if (used?.elements.some((el) => !el.units || el.units === "unknown")) return false;
  if (result.errors.some((err) => /Element-name ambiguity|undocumented for/i.test(err)) && !(used && used.reviewed)) {
    return false;
  }
  return true;
}

export function isGeochemAdapterId(id: string | null | undefined): boolean {
  return GEOCHEM_ADAPTER_IDS.includes(id as (typeof GEOCHEM_ADAPTER_IDS)[number]);
}

export function mixedUnitsBlockComparison(elements: GeochemElementMapping[]): boolean {
  const units = new Set(elements.map((el) => normalizeGeochemUnit(el.units) || el.units || "unknown"));
  return units.size !== 1 || units.has("unknown") || [...units].some((u) => !u);
}

export function parseCensoredToken(raw: string): { numeric: number | null; censored: boolean; qualifier?: string; detectionLimit?: number } {
  const text = String(raw ?? "").trim();
  if (!text) return { numeric: null, censored: false };
  if (/^(bdl|nd|n\.?d\.?|ldl|n\/a|-)$/i.test(text)) {
    return { numeric: null, censored: true, qualifier: "BDL" };
  }
  const lt = text.match(/^<\s*([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/);
  if (lt) {
    const dl = Number(lt[1]);
    return { numeric: null, censored: true, qualifier: "<", detectionLimit: Number.isFinite(dl) ? dl : undefined };
  }
  if (text === "<") return { numeric: null, censored: true, qualifier: "<" };
  const num = Number(text);
  if (Number.isFinite(num)) return { numeric: num, censored: false };
  return { numeric: null, censored: false };
}

export function qualifierMeansCensored(raw?: string): boolean {
  if (!raw) return false;
  return /^(<|>|u|lt|bdl|nd)$/i.test(raw.trim());
}
