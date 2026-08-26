export type SectionKind = "pseudosection" | "resistivity-model";

export interface SectionPoint {
  x: number;
  z: number;
  value: number;
}

export interface SectionGrid {
  kind: SectionKind;
  units: string;
  zReference: string;
  interpolation: string;
  modelStatus: string;
  points: SectionPoint[];
  warnings: string[];
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function col(header: string[], name: string): number {
  const i = header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  return i;
}

export function isErtSectionPath(path: string): boolean {
  const n = path.replace(/\\/g, "/").toLowerCase();
  return /ert_pseudosection\.csv$/.test(n) || /ert_2d_model\.csv$/.test(n);
}

export function parseSectionCsv(text: string, path = ""): SectionGrid {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return {
      kind: /ert_2d_model/.test(path) ? "resistivity-model" : "pseudosection",
      units: "ohm.m",
      zReference: "unknown",
      interpolation: "unknown",
      modelStatus: "empty",
      points: [],
      warnings: ["Section file has no data rows."],
    };
  }
  const header = splitCsvLine(lines[0]);
  const xi = col(header, "x");
  const zi = col(header, "z");
  const vi = header.findIndex((h) => /rhoa_ohm_m|resistivity_ohm_m|value/i.test(h));
  const points: SectionPoint[] = [];
  for (const line of lines.slice(1)) {
    const parts = splitCsvLine(line);
    const x = Number(parts[xi]);
    const z = Number(parts[zi]);
    const value = Number(parts[vi]);
    if ([x, z, value].every((n) => Number.isFinite(n))) points.push({ x, z, value });
  }
  const model = /ert_2d_model/.test(path) || header.some((h) => /resistivity_ohm_m/i.test(h));
  const zRefCol = header.findIndex((h) => /z_reference/i.test(h));
  const interpCol = header.findIndex((h) => /interpolation/i.test(h));
  const statusCol = header.findIndex((h) => /model_status/i.test(h));
  const sample = splitCsvLine(lines[1] || "");
  return {
    kind: model ? "resistivity-model" : "pseudosection",
    units: "ohm.m",
    zReference: (zRefCol >= 0 ? sample[zRefCol] : "") || (model
      ? "model depth below a flat surface (topography not used)"
      : "pseudo-depth n·a/2 (not inversion depth)"),
    interpolation: (interpCol >= 0 ? sample[interpCol] : "") || (model ? "smoothness-constrained model cells" : "none — discrete measurements"),
    modelStatus: (statusCol >= 0 ? sample[statusCol] : "") || (model
      ? "2-D smoothness inversion; not Res2DInv"
      : "not a depth model"),
    points,
    warnings: [
      model
        ? "This smoothness model is not Res2DInv, not 3-D, and not lithology, groundwater, ore, or a drill target."
        : "A pseudosection is not a depth model and is not true resistivity.",
    ],
  };
}
