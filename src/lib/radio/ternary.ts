export interface RadioTernaryGrid {
  source: string;
  nx?: number | null;
  ny?: number | null;
  x0?: number;
  y0?: number;
  dx?: number;
  dy?: number;
  rgb: number[][][];
  assignment: { R: string; G: string; B: string };
  formula: string;
  p_lo: number;
  p_hi: number;
  warnings: string[];
}

export function isRadioTernaryPath(path: string): boolean {
  return /rad_ternary\.json$/i.test(path.replace(/\\/g, "/"));
}

export function parseRadioTernaryJson(text: string, path = ""): RadioTernaryGrid {
  const raw = JSON.parse(text) as Record<string, unknown>;
  const rgb = raw.rgb as number[][][] | number[][] | undefined;
  if (!Array.isArray(rgb) || !rgb.length) {
    throw new Error("rad_ternary.json has no RGB array.");
  }
  const asGrid: number[][][] = Array.isArray(rgb[0]?.[0])
    ? (rgb as number[][][])
    : [(rgb as number[][]).map((row) => (Array.isArray(row) ? row : [0, 0, 0]))];
  const assignment = (raw.assignment as RadioTernaryGrid["assignment"]) || { R: "K %", G: "eTh ppm", B: "eU ppm" };
  return {
    source: String(raw.source || "unknown"),
    nx: typeof raw.nx === "number" ? raw.nx : null,
    ny: typeof raw.ny === "number" ? raw.ny : null,
    x0: typeof raw.x0 === "number" ? raw.x0 : undefined,
    y0: typeof raw.y0 === "number" ? raw.y0 : undefined,
    dx: typeof raw.dx === "number" ? raw.dx : undefined,
    dy: typeof raw.dy === "number" ? raw.dy : undefined,
    rgb: asGrid,
    assignment,
    formula: String(raw.formula || ""),
    p_lo: Number(raw.p_lo ?? 2),
    p_hi: Number(raw.p_hi ?? 98),
    warnings: [
      "Ternary RGB is a percentile colour stretch (R=K, G=eTh, B=eU), not lithology, mineralisation, or alteration.",
      path ? `Source file: ${path.replace(/\\/g, "/").split("/").pop()}` : "",
    ].filter(Boolean),
  };
}
