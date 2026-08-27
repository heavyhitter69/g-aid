/**
 * G-AID GPR 1.0 contract. An arbitrary .dzt or amplitude CSV is not GPR data.
 *
 * Required comments:
 *   / G-AID GPR 1.0
 *   / Units=<documented amplitude unit, e.g. amp>
 *   / dt_ns=<positive sample interval>
 *   / dx_m=<positive trace spacing>
 *   / AntennaMHz=<positive centre frequency>
 * Optional: / EPSG=<integer> (required only for GIS)
 * Optional: / VelocityMns= or / VelocityMs= — never assumed
 * Columns: Trace, Sample, Amplitude (canonical) or reviewed aliases.
 */

export const GPR_CSV_FORMAT = "gpr-csv";
export const GPR_DZT_FORMAT = "gpr-dzt";
export const GPR_ADAPTER_IDS = ["gpr-csv"] as const;

export const GPR_CANONICAL = {
  trace: "Trace",
  sample: "Sample",
  amplitude: "Amplitude",
} as const;

export type GprField = keyof typeof GPR_CANONICAL;

export const GPR_ALIASES: Record<GprField, string[]> = {
  trace: ["trace", "tr", "scan", "trace_index", "traceno"],
  sample: ["sample", "nsamp", "twt", "sample_index"],
  amplitude: ["amplitude", "amp", "value", "samples"],
};

export interface GprContractResult {
  looksLikeGpr: boolean;
  looksLikeDzt: boolean;
  formatId: typeof GPR_CSV_FORMAT | typeof GPR_DZT_FORMAT | "unknown";
  banner: boolean;
  units?: string;
  dtNs?: number;
  dxM?: number;
  antennaMHz?: number;
  velocityMns?: number;
  velocityMs?: number;
  epsg?: number;
  crs?: string;
  columns: string[];
  mapping?: { trace: string; sample: string; amplitude: string };
  nRows?: number;
  errors: string[];
  warnings: string[];
}

function comments(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/g-aid\s+gpr\s+1\.0/i.test(line)) found.banner = "G-AID GPR 1.0";
    const match = line.match(/^(?:\/\s*|#\s*|;\s*)?([A-Za-z][A-Za-z0-9_]*)\s*=\s*(.+)$/);
    if (match) found[match[1].toLowerCase()] = match[2].trim();
  }
  return found;
}

function splitHeader(line: string): string[] {
  if (line.includes(",")) return line.split(",").map((c) => c.trim()).filter(Boolean);
  return line.split(/\s+/).filter(Boolean);
}

function matchField(cols: string[], field: GprField): string | undefined {
  const aliases = GPR_ALIASES[field];
  const canonical = GPR_CANONICAL[field].toLowerCase();
  for (const col of cols) {
    const n = col.toLowerCase().replace(/[\s\-]+/g, "_");
    if (n === canonical || aliases.includes(n)) return col;
  }
  return undefined;
}

function positive(raw?: string): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(String(raw).replace(/[^0-9.eE+\-]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function unitsDocumented(raw?: string): boolean {
  if (!raw) return false;
  const t = raw.trim().toLowerCase();
  return t.length > 0 && !["unknown", "n/a", "none", "nan", "null"].includes(t);
}

export function inspectGprText(text: string, filename = ""): GprContractResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const meta = comments(text);
  const banner = Boolean(meta.banner);
  const units = meta.units;
  const dtNs = positive(meta.dt_ns || meta.dtns);
  const dxM = positive(meta.dx_m || meta.dxm);
  const antennaMHz = positive(meta.antennamhz || meta.antenna_mhz || meta.antenna);
  const velocityMns = positive(meta.velocitymns || meta.velocity_mns);
  const velocityMs = positive(meta.velocityms || meta.velocity_ms);
  const epsgMatch = (meta.epsg || meta.crs || "").match(/(\d{4,6})/);
  const epsg = epsgMatch ? parseInt(epsgMatch[1], 10) : undefined;

  const body = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^[/#;]/.test(l));
  const header = body[0] || "";
  const columns = splitHeader(header);
  const trace = matchField(columns, "trace");
  const sample = matchField(columns, "sample");
  const amplitude = matchField(columns, "amplitude");
  const named = Boolean(trace && sample && amplitude);
  const looks =
    banner ||
    (named && (dtNs != null || dxM != null || antennaMHz != null || /g-aid\s+gpr/i.test(text)));

  if (looks && !banner) errors.push("GPR CSV requires the / G-AID GPR 1.0 banner. I will not treat an amplitude table as GPR from columns alone.");
  if (looks && !unitsDocumented(units)) errors.push("GPR CSV requires / Units=. I will not assume amplitude units.");
  if (looks && !(dtNs && dtNs > 0)) errors.push("GPR CSV requires / dt_ns= as a positive sample interval. I will not invent two-way time.");
  if (looks && !(dxM && dxM > 0)) errors.push("GPR CSV requires / dx_m= as a positive trace spacing. I will not invent survey geometry.");
  if (looks && !(antennaMHz && antennaMHz > 0)) errors.push("GPR CSV requires / AntennaMHz=. I will not invent antenna frequency.");
  if (looks && !named) errors.push("GPR CSV needs Trace, Sample, and Amplitude columns (or a reviewed mapping).");
  if (looks && !epsg) warnings.push("No / EPSG= documented. Section viewing is allowed; GIS/map export is blocked.");

  return {
    looksLikeGpr: looks,
    looksLikeDzt: false,
    formatId: looks ? GPR_CSV_FORMAT : "unknown",
    banner,
    units,
    dtNs,
    dxM,
    antennaMHz,
    velocityMns,
    velocityMs,
    epsg,
    crs: epsg ? `EPSG:${epsg}` : undefined,
    columns,
    mapping: named && trace && sample && amplitude ? { trace, sample, amplitude } : undefined,
    nRows: looks ? Math.max(0, body.length - 1) : undefined,
    errors: looks ? errors : filename.toLowerCase().endsWith(".csv") ? [] : ["Not a G-AID GPR 1.0 table."],
    warnings,
  };
}

export function inspectGprDzt(filename: string): GprContractResult {
  return {
    looksLikeGpr: false,
    looksLikeDzt: true,
    formatId: GPR_DZT_FORMAT,
    banner: false,
    columns: [],
    errors: [
      "GSSI DZT is recognised-unsupported. G-AID will not invent dt, dx, or antenna frequency from a binary header. Convert to a documented G-AID GPR 1.0 CSV to process.",
    ],
    warnings: [],
  };
}

export function gprReadyForSupport(result: GprContractResult): boolean {
  return (
    result.looksLikeGpr &&
    result.formatId === GPR_CSV_FORMAT &&
    result.banner &&
    unitsDocumented(result.units) &&
    Boolean(result.dtNs && result.dxM && result.antennaMHz && result.mapping) &&
    result.errors.length === 0
  );
}
