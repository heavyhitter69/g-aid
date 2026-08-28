/**
 * CWLS LAS 2.0 well-log contract (WRAP.NO only).
 *
 * An arbitrary .las file is not a well log. LASF / LASzip point clouds are
 * not this contract. Unknown curve mnemonics stay unknown — meaning is never
 * invented from the mnemonic alone.
 */

export const LAS_WELL_FORMAT = "las-well";
export const LAS_ADAPTER_ID = "las-well";
export const LAS_SUPPORTED_VERSION = "2.0";
export const LAS_SUPPORTED_WRAP = "NO";

export const DEPTH_INDEX_MNEMONICS = ["DEPT", "DEPTH", "MD", "DEPTH_MD", "DEPT_MD"] as const;

export type CoordinateKind = "geographic" | "easting-northing" | "unknown";
export type LocationQuality = "documented" | "user-confirmed" | "missing";

export interface LasCurve {
  mnemonic: string;
  unit: string;
  description: string;
  /** Always unknown unless the user later supplies meaning. Never inferred. */
  semantics: "unknown";
}

export interface LasWellItem {
  mnemonic: string;
  unit: string;
  value: string;
  description: string;
}

export interface LasContractResult {
  looksLikeLas: boolean;
  looksLikeLidar: boolean;
  formatId: typeof LAS_WELL_FORMAT | "las-point-cloud" | "unknown";
  lasVersion?: string;
  wrap?: string;
  wellId?: string;
  nullValue?: number;
  nullAssumed: boolean;
  startDepth?: number;
  stopDepth?: number;
  step?: number;
  startUnit?: string;
  stopUnit?: string;
  stepUnit?: string;
  depthIndex?: string;
  depthUnits?: string;
  curves: LasCurve[];
  wellItems: LasWellItem[];
  nRows?: number;
  asciiPresent: boolean;
  asciiRowsInPeek: boolean;
  collarX?: number;
  collarY?: number;
  collarZ?: number;
  collarZMnemonic?: string;
  coordinateKind: CoordinateKind;
  crs?: string;
  epsg?: number;
  elevationDatum?: string;
  locationQuality: LocationQuality;
  collarMappable: boolean;
  headerProvenance: Record<string, string>;
  errors: string[];
  warnings: string[];
}

const GEO_X = ["LATI", "LAT", "LATITUDE"];
const GEO_Y = ["LONG", "LON", "LNG", "LONGITUDE"];
const PROJ_X = ["XWELL", "X", "EAST", "EASTING"];
const PROJ_Y = ["YWELL", "Y", "NORTH", "NORTHING"];
const ELEV = ["ELEV", "KB", "DF", "GL", "ELEVATION"];

export function isLasfSignature(bytes: Buffer | Uint8Array | string): boolean {
  if (typeof bytes === "string") return bytes.slice(0, 4) === "LASF";
  if (bytes.length < 4) return false;
  return Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "LASF";
}

export function looksLikeLasWellText(text: string): boolean {
  if (!text || isLasfSignature(text)) return false;
  const hasV = /~(?:V|VERSION)\b/i.test(text);
  const hasW = /~(?:W|WELL)\b/i.test(text);
  const hasC = /~(?:C|CURVE)\b/i.test(text);
  return hasV && hasW && hasC;
}

function sectionKey(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("~")) return null;
  const letter = trimmed[1]?.toUpperCase() || "";
  return letter || "A";
}

export function splitLasSections(text: string): Record<string, string[]> {
  const sections: Record<string, string[]> = { V: [], W: [], C: [], P: [], O: [], A: [] };
  let current: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const key = sectionKey(raw);
    if (key) {
      current = key in sections ? key : "A";
      continue;
    }
    if (current) sections[current].push(raw);
  }
  return sections;
}

/** CWLS mnemonic line: MNEM.UNIT VALUE : DESCRIPTION (spaces around the dot allowed). */
export function parseMnemonicLine(line: string): LasWellItem | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("~")) return null;
  const match = trimmed.match(/^([A-Za-z][A-Za-z0-9_]*)\s*\.(\S*)\s*(.*)$/);
  if (!match) return null;
  const mnemonic = match[1];
  const unit = match[2] || "";
  const rest = match[3] || "";
  const colon = rest.indexOf(":");
  const valuePart = (colon >= 0 ? rest.slice(0, colon) : rest).trim();
  const description = (colon >= 0 ? rest.slice(colon + 1) : "").trim();
  const value = valuePart.split(/\s+/)[0] || valuePart;
  return { mnemonic, unit, value, description };
}

function itemMap(items: LasWellItem[]): Map<string, LasWellItem> {
  const map = new Map<string, LasWellItem>();
  for (const item of items) map.set(item.mnemonic.toUpperCase(), item);
  return map;
}

function findItem(map: Map<string, LasWellItem>, names: string[]): LasWellItem | undefined {
  for (const name of names) {
    const hit = map.get(name.toUpperCase());
    if (hit) return hit;
  }
  return undefined;
}

function parseNumber(raw?: string): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(String(raw).replace(/[^0-9.eE+\-]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function comments(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/g-aid\s+well\s+1\.0/i.test(line)) found.banner = "G-AID WELL 1.0";
    const match = line.match(/\/\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*([^\s,;]+)/);
    if (match) found[match[1].toLowerCase()] = match[2].trim();
  }
  return found;
}

function wrapNormalised(raw?: string): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().toUpperCase();
  if (t === "NO" || t === "NONE" || t === "0") return "NO";
  if (t === "YES" || t === "1") return "YES";
  return t;
}

function versionMajor(raw?: string): { label: string; major: number } | undefined {
  if (!raw) return undefined;
  const match = String(raw).match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  const label = match[1];
  const major = parseInt(label.split(".")[0] || "0", 10);
  return { label, major };
}

export function isDepthIndexMnemonic(mnemonic: string): boolean {
  return (DEPTH_INDEX_MNEMONICS as readonly string[]).includes(mnemonic.toUpperCase());
}

function asciiRows(lines: string[], curveCount: number): { rows: number[][]; errors: string[]; warnings: string[] } {
  const rows: number[][] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("~")) continue;
    const parts = line.split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    const nums: number[] = [];
    let bad = false;
    for (const part of parts) {
      const n = Number(part);
      if (!Number.isFinite(n)) {
        bad = true;
        break;
      }
      nums.push(n);
    }
    if (bad) {
      errors.push(`Non-numeric ASCII data: ${line.slice(0, 80)}`);
      continue;
    }
    if (curveCount > 0 && nums.length !== curveCount) {
      warnings.push(`ASCII row has ${nums.length} values; curve section lists ${curveCount}.`);
    }
    rows.push(nums);
  }
  return { rows, errors, warnings };
}

function depthQc(rows: number[], step?: number): string[] {
  const errors: string[] = [];
  if (rows.length < 2) return errors;
  const seen = new Set<number>();
  for (const d of rows) {
    if (seen.has(d)) errors.push("Duplicate depth values in the ASCII section.");
    seen.add(d);
  }
  let inc = 0;
  let dec = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i] > rows[i - 1]) inc += 1;
    else if (rows[i] < rows[i - 1]) dec += 1;
    else errors.push("Non-strict depth indexing (repeated consecutive depth).");
  }
  if (inc && dec) errors.push("Depth index is not monotonic.");
  if (typeof step === "number" && step !== 0) {
    const sign = Math.sign(step);
    if (sign > 0 && dec) errors.push("STEP is positive but depths decrease.");
    if (sign < 0 && inc) errors.push("STEP is negative but depths increase.");
  }
  return [...new Set(errors)];
}

export function inspectLasText(text: string, filename = ""): LasContractResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lidar = isLasfSignature(text) || /\blaz\b/i.test(filename) && filename.toLowerCase().endsWith(".laz");
  if (lidar) {
    return {
      looksLikeLas: false,
      looksLikeLidar: true,
      formatId: "las-point-cloud",
      curves: [],
      wellItems: [],
      asciiPresent: false,
      asciiRowsInPeek: false,
      nullAssumed: false,
      coordinateKind: "unknown",
      locationQuality: "missing",
      collarMappable: false,
      headerProvenance: {},
      errors: ["LASF / LiDAR point-cloud signature. This is not a CWLS LAS well log."],
      warnings: [],
    };
  }

  const looks = looksLikeLasWellText(text);
  const sections = splitLasSections(text);
  const meta = comments(text);
  const vItems = sections.V.map(parseMnemonicLine).filter((item): item is LasWellItem => Boolean(item));
  const wItems = sections.W.map(parseMnemonicLine).filter((item): item is LasWellItem => Boolean(item));
  const cItems = sections.C.map(parseMnemonicLine).filter((item): item is LasWellItem => Boolean(item));
  const vMap = itemMap(vItems);
  const wMap = itemMap(wItems);

  const versRaw = vMap.get("VERS")?.value;
  const wrapRaw = wrapNormalised(vMap.get("WRAP")?.value);
  const ver = versionMajor(versRaw);

  const curves: LasCurve[] = cItems.map((item) => ({
    mnemonic: item.mnemonic,
    unit: item.unit,
    description: item.description,
    semantics: "unknown",
  }));

  const wellId = (wMap.get("WELL")?.value || wMap.get("WELL")?.description || "").trim() || undefined;
  const nullParsed = parseNumber(wMap.get("NULL")?.value);
  const nullAssumed = nullParsed == null;
  const nullValue = nullParsed ?? -999.25;

  const strt = wMap.get("STRT");
  const stop = wMap.get("STOP");
  const step = wMap.get("STEP");
  const startDepth = parseNumber(strt?.value);
  const stopDepth = parseNumber(stop?.value);
  const stepValue = parseNumber(step?.value);

  const depthCurve = curves[0];
  const depthIndex = depthCurve?.mnemonic;
  const depthUnits = depthCurve?.unit;

  const geoX = findItem(wMap, GEO_X);
  const geoY = findItem(wMap, GEO_Y);
  const projX = findItem(wMap, PROJ_X);
  const projY = findItem(wMap, PROJ_Y);
  const elev = findItem(wMap, ELEV);

  let coordinateKind: CoordinateKind = "unknown";
  let collarX: number | undefined;
  let collarY: number | undefined;
  if (geoX && geoY) {
    coordinateKind = "geographic";
    collarY = parseNumber(geoX.value);
    collarX = parseNumber(geoY.value);
  } else if (projX && projY) {
    coordinateKind = "easting-northing";
    collarX = parseNumber(projX.value);
    collarY = parseNumber(projY.value);
  }
  const collarZ = parseNumber(elev?.value);

  const epsgMatch = (meta.epsg || wMap.get("EPSG")?.value || wMap.get("CRS")?.value || "").match(/(\d{4,6})/);
  const epsg = epsgMatch ? parseInt(epsgMatch[1], 10) : undefined;
  const crs = epsg ? `EPSG:${epsg}` : undefined;
  const elevationDatum = meta.elevationdatum || wMap.get("EDF")?.value || undefined;

  const hasCoords = Number.isFinite(collarX) && Number.isFinite(collarY);
  const locationQuality: LocationQuality = hasCoords && crs ? "documented" : "missing";
  const collarMappable = Boolean(hasCoords && crs);

  const asciiMarker = /~(?:A|ASCII)\b/i.test(text);
  const ascii = asciiRows(sections.A, curves.length);
  errors.push(...ascii.errors);
  warnings.push(...ascii.warnings);
  const depths = ascii.rows.map((row) => row[0]).filter((n) => Number.isFinite(n));
  errors.push(...depthQc(depths, stepValue));

  if (looks && !ver) errors.push("LAS well-log requires VERS in ~Version. I will not guess the LAS version.");
  if (looks && ver && ver.major !== 2) {
    errors.push(`LAS ${ver.label} is recognised-unsupported. G-AID processes CWLS LAS 2.0 WRAP.NO only.`);
  }
  if (looks && !wrapRaw) errors.push("LAS well-log requires WRAP.NO in ~Version. WRAP.YES is not unwrapped.");
  if (looks && wrapRaw === "YES") errors.push("WRAP.YES is recognised-unsupported. G-AID does not unwrap wrapped LAS ASCII.");
  if (looks && wrapRaw && wrapRaw !== "NO" && wrapRaw !== "YES") {
    errors.push(`WRAP.${wrapRaw} is not a documented LAS 2.0 WRAP.NO well log.`);
  }
  if (looks && (!sections.V.length && !vItems.length)) errors.push("Malformed LAS header: ~Version section is empty.");
  if (looks && !wItems.length) errors.push("Malformed LAS header: ~Well section has no mnemonic lines.");
  if (looks && !cItems.length) errors.push("Malformed LAS header: ~Curve section has no mnemonics.");
  if (looks && !asciiMarker) errors.push("Malformed LAS header: ~ASCII data section is missing.");
  if (looks && curves.some((curve) => !curve.unit)) {
    errors.push("Every curve must have a CWLS unit (MNEM.UNIT). Missing curve units are not inferred.");
  }
  if (looks && depthIndex && !isDepthIndexMnemonic(depthIndex)) {
    errors.push(`First curve '${depthIndex}' is not a measured-depth index (DEPT/DEPTH/MD). I will not invent a depth axis.`);
  }
  if (looks && depthUnits && strt?.unit && strt.unit && depthUnits.toUpperCase() !== strt.unit.toUpperCase()) {
    errors.push(`Depth curve unit ${depthUnits} is inconsistent with STRT unit ${strt.unit}.`);
  }
  if (looks && depthUnits && stop?.unit && stop.unit && depthUnits.toUpperCase() !== stop.unit.toUpperCase()) {
    errors.push(`Depth curve unit ${depthUnits} is inconsistent with STOP unit ${stop.unit}.`);
  }
  if (nullAssumed && looks) warnings.push("NULL was not documented in ~Well; -999.25 is recorded as the conventional LAS null and flagged as assumed.");
  if (looks && !wellId) warnings.push("WELL identifier was not documented in ~Well.");
  if (looks && hasCoords && !crs) {
    warnings.push("Collar coordinates are present without a documented CRS. Log viewing is allowed; the collar is not mapped.");
  }
  if (looks && !hasCoords) warnings.push("No well location (LATI/LONG or X/Y) documented. Vertical log viewing is allowed; no map position is invented.");
  if (looks && asciiMarker && ascii.rows.length === 0) {
    warnings.push("ASCII section marker is present but data rows are not in this peek. Ingest will validate the full ASCII body.");
  }
  if (looks && curves.some((curve) => !isDepthIndexMnemonic(curve.mnemonic))) {
    warnings.push("Curve mnemonics are stored with unknown semantics. GR, resistivity, density, or sonic names are not lithology, water, ore, or reservoir.");
  }

  const directional = curves.filter((curve) => /^(INCL|AZIM|DEVI|TVD|DX|DY)$/i.test(curve.mnemonic));
  if (directional.length) {
    warnings.push(
      `Directional/TVD mnemonics (${directional.map((c) => c.mnemonic).join(", ")}) are stored as unknown-semantics curves. A well trajectory is not computed.`
    );
  }

  const headerProvenance: Record<string, string> = {};
  if (ver) headerProvenance.VERS = ver.label;
  if (wrapRaw) headerProvenance.WRAP = wrapRaw;
  if (wellId) headerProvenance.WELL = wellId;
  if (filename) headerProvenance.source = filename;
  if (meta.banner) headerProvenance.banner = meta.banner;

  return {
    looksLikeLas: looks,
    looksLikeLidar: false,
    formatId: looks ? LAS_WELL_FORMAT : "unknown",
    lasVersion: ver?.label,
    wrap: wrapRaw,
    wellId,
    nullValue,
    nullAssumed,
    startDepth,
    stopDepth,
    step: stepValue,
    startUnit: strt?.unit,
    stopUnit: stop?.unit,
    stepUnit: step?.unit,
    depthIndex,
    depthUnits,
    curves,
    wellItems: wItems,
    nRows: ascii.rows.length || undefined,
    asciiPresent: asciiMarker,
    asciiRowsInPeek: ascii.rows.length > 0,
    collarX,
    collarY,
    collarZ,
    collarZMnemonic: elev?.mnemonic,
    coordinateKind,
    crs,
    epsg,
    elevationDatum,
    locationQuality,
    collarMappable,
    headerProvenance,
    errors: looks ? errors : filename.toLowerCase().endsWith(".las") ? ["Not a CWLS LAS 2.0 well log."] : [],
    warnings,
  };
}

export function lasReadyForSupport(result: LasContractResult): boolean {
  return (
    result.looksLikeLas &&
    !result.looksLikeLidar &&
    result.formatId === LAS_WELL_FORMAT &&
    Boolean(result.lasVersion && result.lasVersion.startsWith("2")) &&
    result.wrap === "NO" &&
    Boolean(result.depthIndex && isDepthIndexMnemonic(result.depthIndex)) &&
    result.curves.length > 0 &&
    result.curves.every((curve) => Boolean(curve.unit)) &&
    result.asciiPresent &&
    result.errors.length === 0
  );
}
