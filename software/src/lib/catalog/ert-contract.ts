/**
 * G-AID ERT 1.0 contract. An arbitrary .dat file is not ERT data.
 *
 * Layout:
 *   title
 *   unit electrode spacing (m)
 *   array type integer: 1 wenner, 2 pole-pole, 3 dipole-dipole, 6 pole-dipole, 7 schlumberger
 *   n measurements
 *   x a n rhoa  (exactly n lines)
 *   topography flag 0|1
 * Required: / Units=ohm.m
 * Optional: / EPSG=<integer>
 */

export const ERT_DAT_FORMAT = "ert-dat";
export const ERT_CSV_FORMAT = "ert-csv";
export const ERT_ADAPTER_IDS = ["ert-dat", "ert-csv"] as const;

export const ARRAY_CODES: Record<number, string> = {
  1: "wenner",
  2: "pole_pole",
  3: "dipole_dipole",
  6: "pole_dipole",
  7: "schlumberger",
};

export interface ErtContractResult {
  looksLikeErt: boolean;
  formatId: typeof ERT_DAT_FORMAT | typeof ERT_CSV_FORMAT | "unknown";
  title?: string;
  spacing?: number;
  arrayCode?: number;
  array?: string;
  nDeclared?: number;
  nParsed?: number;
  unitsOhmM: boolean;
  epsg?: number;
  crs?: string;
  topoFlag?: number;
  errors: string[];
  warnings: string[];
}

const COMMENT_RE = /^(?:\/\s*|#\s*|;\s*)?(Units|EPSG|CRS|Array)\s*=\s*(.+)$/i;

function comments(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.trim().match(COMMENT_RE);
    if (match) found[match[1].toLowerCase()] = match[2].trim();
  }
  return found;
}

function isComment(line: string): boolean {
  const s = line.trim();
  return !s || /^[/#;]/.test(s);
}

export function unitsAreOhmM(raw?: string): boolean {
  if (!raw) return false;
  const t = raw.toLowerCase().replace(/\s+/g, "").replace(/ω|omega/g, "ohm");
  return t === "ohm.m" || t === "ohm-m" || t === "ohmm" || t === "ohm_m" || /ohm[.\-]m/.test(t);
}

export function inspectErtText(text: string, filename = ""): ErtContractResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const meta = comments(text);
  const unitsOhmM = unitsAreOhmM(meta.units);
  const epsgMatch = (meta.epsg || meta.crs || "").match(/(\d{4,6})/);
  const epsg = epsgMatch ? parseInt(epsgMatch[1], 10) : undefined;
  const lowerName = filename.toLowerCase();
  const csv = lowerName.endsWith(".csv") || (text.includes(",") && /midpoint|rhoa|resistivity/i.test(text));

  const body = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !isComment(l));
  if (csv) {
    const header = body[0] || "";
    const cols = header.split(/[,\t;]/).map((c) => c.trim().toLowerCase());
    const looks =
      cols.includes("midpoint_x") ||
      (cols.includes("x") && cols.includes("a") && cols.includes("n") && cols.some((c) => /rhoa|resistivity/.test(c)));
    if (looks && !unitsOhmM) errors.push("ERT CSV requires / Units=ohm.m. I will not assume resistivity units.");
    if (looks && !cols.includes("array") && !meta.array) {
      errors.push("ERT CSV requires an array column or / Array=. I will not default the array type.");
    }
    return {
      looksLikeErt: looks,
      formatId: looks ? ERT_CSV_FORMAT : "unknown",
      unitsOhmM,
      epsg,
      crs: epsg ? `EPSG:${epsg}` : undefined,
      errors: looks ? errors : ["Not an ERT CSV under the G-AID contract."],
      warnings,
    };
  }

  if (body.length < 6) {
    return {
      looksLikeErt: false,
      formatId: "unknown",
      unitsOhmM,
      errors: ["Not a G-AID ERT 1.0 .dat layout."],
      warnings,
    };
  }

  const title = body[0];
  const spacing = Number(body[1].split(/\s+/)[0]);
  const arrayCode = Number(body[2].split(/\s+/)[0]);
  const nDeclared = Number(body[3].split(/\s+/)[0]);
  const knownArray = Number.isInteger(arrayCode) && ARRAY_CODES[arrayCode];
  const firstMeas = (body[4] || "").split(/\s+/).map(Number);
  const layout =
    Number.isFinite(spacing) &&
    spacing > 0 &&
    Number.isInteger(arrayCode) &&
    Number.isInteger(nDeclared) &&
    nDeclared >= 1 &&
    firstMeas.length >= 4 &&
    firstMeas.slice(0, 4).every((n) => Number.isFinite(n));

  if (!layout) {
    return {
      looksLikeErt: false,
      formatId: "unknown",
      unitsOhmM,
      errors: ["Numeric .dat without the G-AID ERT layout is not ERT data."],
      warnings,
    };
  }

  if (!unitsOhmM) errors.push("ERT .dat requires / Units=ohm.m. I will not assume resistivity units.");
  if (!knownArray) errors.push(`Unsupported ERT array code ${arrayCode}.`);
  if (!(spacing > 0)) errors.push("Electrode spacing must be > 0.");
  if (firstMeas[1] <= 0 || firstMeas[2] < 1 || firstMeas[3] <= 0) {
    errors.push("Invalid electrode geometry or apparent resistivity (a>0, n≥1, rhoa>0).");
  }

  let nParsed = 0;
  for (let i = 4; i < body.length && nParsed < nDeclared; i++) {
    const nums = body[i].split(/\s+/).map(Number);
    if (nums.length >= 4 && nums.slice(0, 4).every((n) => Number.isFinite(n))) nParsed += 1;
    else break;
  }
  const topoLine = body[4 + nDeclared];
  const topoFlag = topoLine != null ? Number(topoLine.split(/\s+/)[0]) : undefined;
  if (topoFlag === 1) {
    const nTopo = Number((body[5 + nDeclared] || "").split(/\s+/)[0]);
    if (!Number.isInteger(nTopo) || nTopo < 1) {
      errors.push("Topography flag is 1 but topography records are missing or invalid.");
    }
  } else if (topoFlag != null && topoFlag !== 0 && Number.isFinite(topoFlag)) {
    errors.push("ERT topography flag must be 0 or 1.");
  }
  if (!epsg) warnings.push("No / EPSG= documented. Section viewing is allowed; GIS/map export is blocked.");

  return {
    looksLikeErt: true,
    formatId: ERT_DAT_FORMAT,
    title,
    spacing,
    arrayCode,
    array: knownArray || undefined,
    nDeclared,
    nParsed,
    unitsOhmM,
    epsg,
    crs: epsg ? `EPSG:${epsg}` : undefined,
    topoFlag: Number.isFinite(topoFlag) ? topoFlag : undefined,
    errors,
    warnings,
  };
}

export function ertReadyForSupport(result: ErtContractResult): boolean {
  return result.looksLikeErt && result.unitsOhmM && result.errors.length === 0 && Boolean(result.array || result.formatId === ERT_CSV_FORMAT);
}
