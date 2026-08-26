/**
 * Gravity ingest contract (pack 1).
 * Numeric XYZ without documented columns/CRS/units is not gravity data.
 */

export const GRAVITY_XYZ_FORMAT = "gravity-xyz";
export const GRAVITY_CSV_FORMAT = "gravity-csv";
export const GRAVITY_ADAPTER_IDS = ["gravity-xyz", "gravity-csv"] as const;

export const GRAVITY_CANONICAL = {
  x: "X",
  y: "Y",
  gObs: "Gravity",
  elevation: "Elevation",
  stationId: "Station",
  datetime: "DateTime",
  latitude: "Latitude",
} as const;

export type GravityField = keyof typeof GRAVITY_CANONICAL;

export const GRAVITY_ALIASES: Record<GravityField, string[]> = {
  x: ["x", "easting", "east", "lon", "longitude", "long"],
  y: ["y", "northing", "north", "lat", "latitude"],
  gObs: ["gravity", "g_obs", "gobs", "observed_gravity", "grav", "g_obs_mgal", "obs_gravity"],
  elevation: ["elevation", "elev", "height", "z", "h", "ortho_h", "ellipsoidal_h"],
  stationId: ["station", "stn", "station_id", "id", "site"],
  datetime: ["datetime", "date_time", "timestamp", "date"],
  latitude: ["latitude", "lat", "phi"],
};

export type GravityUnits = "mGal" | "m/s2";
export type ElevationDatum = "orthometric" | "ellipsoidal";

export interface GravityColumnMapping {
  x: string;
  y: string;
  gObs: string;
  elevation?: string;
  stationId?: string;
  datetime?: string;
  latitude?: string;
  reviewed: boolean;
  reviewedAt?: string;
}

export interface GravityHeaderMeta {
  crs?: string;
  epsg?: number;
  units?: GravityUnits;
  elevationDatum?: ElevationDatum;
  gravityDatum?: string;
  comments: string[];
}

export interface GravityContractResult {
  looksLikeGravity: boolean;
  formatId: typeof GRAVITY_XYZ_FORMAT | typeof GRAVITY_CSV_FORMAT | "unknown";
  columns: string[];
  canonical: boolean;
  suggestedMapping?: GravityColumnMapping;
  mappingComplete: boolean;
  meta: GravityHeaderMeta;
  errors: string[];
  warnings: string[];
}

function norm(name: string): string {
  return name.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

export function parseCommentMeta(text: string): GravityHeaderMeta {
  const comments = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[\\/#;]/.test(line) || line.toLowerCase().startsWith("/"));
  const blob = comments.join("\n");
  const epsgMatch = blob.match(/EPSG\s*[=:]\s*(\d{4,5})/i) || blob.match(/CRS\s*[=:]\s*EPSG:(\d{4,5})/i);
  const crsName = blob.match(/Coordinate System\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const unitsRaw = blob.match(/Units?\s*[=:]\s*([^\n]+)/i)?.[1]?.trim().toLowerCase();
  let units: GravityUnits | undefined;
  if (unitsRaw) {
    if (/mgal|milligal/.test(unitsRaw)) units = "mGal";
    else if (/m\s*\/\s*s/.test(unitsRaw) || unitsRaw === "ms-2" || unitsRaw === "m/s2") units = "m/s2";
  }
  const datumRaw = blob.match(/ElevationDatum\s*[=:]\s*([^\n]+)/i)?.[1]?.trim().toLowerCase();
  let elevationDatum: ElevationDatum | undefined;
  if (datumRaw) {
    if (/ortho/.test(datumRaw)) elevationDatum = "orthometric";
    if (/ellips/.test(datumRaw)) elevationDatum = "ellipsoidal";
  }
  const gravityDatum = blob.match(/GravityDatum\s*[=:]\s*([^\n]+)/i)?.[1]?.trim();
  const epsg = epsgMatch ? parseInt(epsgMatch[1], 10) : undefined;
  return {
    comments,
    epsg,
    crs: epsg ? `EPSG:${epsg}` : crsName,
    units,
    elevationDatum,
    gravityDatum,
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

function looksLikeNamedGravityHeader(cols: string[]): boolean {
  if (cols.length < 3 || isNumericRow(cols)) return false;
  const coord = cols.some((col) => /^(x|y|easting|northing|east|north|lon|long|longitude|lat|latitude)$/i.test(col));
  const g = cols.some((col) => /^(gravity|g_obs|gobs|grav|observed_gravity|obs_gravity)$/i.test(col));
  return coord && g;
}

export function findHeaderColumns(text: string): string[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^[\\/#;]/.test(line)) {
      const cols = splitColumns(line);
      if (looksLikeNamedGravityHeader(cols)) return cols;
      continue;
    }
    const cols = splitColumns(line);
    if (cols.length >= 3 && !isNumericRow(cols)) return cols;
    break;
  }
  return [];
}

function aliasHit(field: GravityField, columns: string[]): string | undefined {
  const aliases = GRAVITY_ALIASES[field];
  const hits = columns.filter((col) => aliases.includes(norm(col)));
  return hits.length === 1 ? hits[0] : undefined;
}

export function suggestMapping(columns: string[]): GravityColumnMapping | undefined {
  const x = aliasHit("x", columns);
  const y = aliasHit("y", columns);
  const gObs = aliasHit("gObs", columns);
  if (!x || !y || !gObs) return undefined;
  return {
    x,
    y,
    gObs,
    elevation: aliasHit("elevation", columns),
    stationId: aliasHit("stationId", columns),
    datetime: aliasHit("datetime", columns),
    latitude: aliasHit("latitude", columns),
    reviewed: false,
  };
}

export function mappingIsCanonical(mapping: GravityColumnMapping, columns: string[]): boolean {
  const has = (name: string) => columns.some((col) => col === name);
  return (
    mapping.x === GRAVITY_CANONICAL.x &&
    mapping.y === GRAVITY_CANONICAL.y &&
    mapping.gObs === GRAVITY_CANONICAL.gObs &&
    has(GRAVITY_CANONICAL.x) &&
    has(GRAVITY_CANONICAL.y) &&
    has(GRAVITY_CANONICAL.gObs)
  );
}

export function mappingCoversRequired(mapping: GravityColumnMapping | undefined): boolean {
  return Boolean(mapping?.x && mapping?.y && mapping?.gObs);
}

function gravityValues(text: string, columns: string[], gObs: string): number[] {
  const idx = columns.findIndex((col) => col === gObs);
  if (idx < 0) return [];
  const values: number[] = [];
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
    const n = Number(cols[idx]);
    if (Number.isFinite(n)) values.push(n);
  }
  return values;
}

export function inspectGravityText(text: string): GravityContractResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const meta = parseCommentMeta(text);
  const columns = findHeaderColumns(text);
  const suggested = columns.length ? suggestMapping(columns) : undefined;
  const canonical = suggested ? mappingIsCanonical(suggested, columns) : false;
  const gravityToken = /gravity|g_obs|gobs|\bmgal\b|bouguer|free[\s-]?air/i.test(text);
  const looksLikeGravity = Boolean(suggested || (gravityToken && columns.length >= 3));
  const comma = text.split(/\r?\n/).some((line) => line.includes(",") && !/^[\\/#;]/.test(line.trim()));
  const formatId = !looksLikeGravity
    ? "unknown"
    : comma
      ? GRAVITY_CSV_FORMAT
      : GRAVITY_XYZ_FORMAT;

  if (!columns.length) {
    errors.push("No named gravity header. Numeric XYZ without column names is not a supported gravity contract.");
  }
  if (!suggested) {
    errors.push("Required columns X/Y/Gravity (or a reviewed mapping) are missing.");
  }
  if (!meta.crs && meta.epsg == null) {
    errors.push("CRS is not documented (need / EPSG=… or Coordinate System=…).");
  }
  if (!meta.units) {
    errors.push("Gravity units are not documented (need / Units=mGal or / Units=m/s2). Mixed or unknown units are not assumed.");
  }
  if (suggested && !canonical && !suggested.reviewed) {
    errors.push("Column names differ from the canonical X, Y, Gravity contract. Store a reviewed mapping before processing.");
  }
  if (!suggested?.elevation) {
    warnings.push("Elevation/height column is not identified.");
  }
  if (!meta.elevationDatum) {
    warnings.push("Elevation datum is not documented (orthometric or ellipsoidal).");
  }
  if (suggested?.gObs) {
    const values = gravityValues(text, columns, suggested.gObs);
    if (values.length) {
      const abs = values.map((v) => Math.abs(v));
      const min = Math.min(...abs);
      const max = Math.max(...abs);
      if (min < 20 && max > 1000) {
        errors.push("Mixed gravity units in one column. I will not convert a mixed file.");
      }
    }
  }

  return {
    looksLikeGravity,
    formatId,
    columns,
    canonical,
    suggestedMapping: suggested,
    mappingComplete: mappingCoversRequired(suggested) && canonical,
    meta,
    errors: looksLikeGravity ? errors : ["Not a gravity table under the G-AID contract."],
    warnings,
  };
}

export function gravityReadyForSupport(result: GravityContractResult, mapping?: GravityColumnMapping): boolean {
  const used = mapping && mapping.reviewed ? mapping : result.suggestedMapping;
  if (!result.looksLikeGravity) return false;
  if (!mappingCoversRequired(used)) return false;
  if (!result.meta.units) return false;
  if (!result.meta.crs && result.meta.epsg == null) return false;
  if (used && !mappingIsCanonical(used, result.columns) && !used.reviewed) return false;
  if (result.errors.some((err) => /mixed gravity units/i.test(err))) return false;
  return true;
}

export function isGravityAdapterId(id: string | null | undefined): boolean {
  return GRAVITY_ADAPTER_IDS.includes(id as (typeof GRAVITY_ADAPTER_IDS)[number]);
}
