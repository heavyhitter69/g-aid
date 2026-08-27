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
  quantity: string;
  channelUnits: { k?: string; eu?: string; eth?: string };
  units: string;
  warnings: string[];
}

export function isRadioTernaryPath(path: string): boolean {
  return /rad_ternary\.json$/i.test(path.replace(/\\/g, "/"));
}

function unitsUnknown(units?: string | null): boolean {
  const value = (units || "").trim().toLowerCase();
  return !value || value === "unknown" || value === "n/a" || value === "none" || value === "nan" || value === "null";
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
  const channelUnits =
    (raw.channel_units as RadioTernaryGrid["channelUnits"]) ||
    (raw.units && typeof raw.units === "object" && !Array.isArray(raw.units)
      ? (raw.units as RadioTernaryGrid["channelUnits"])
      : {});
  const quantity = typeof raw.quantity === "string" && raw.quantity.trim() ? raw.quantity.trim() : "unknown";
  const units =
    typeof raw.units === "string" && raw.units.trim() ? raw.units.trim() : "unknown";
  const channelUnknown =
    unitsUnknown(channelUnits.k) || unitsUnknown(channelUnits.eu) || unitsUnknown(channelUnits.eth);
  const blocked = quantity !== "concentration" || channelUnknown;
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
    quantity,
    channelUnits,
    units,
    warnings: [
      "Ternary RGB is a percentile colour stretch (R=K, G=eTh, B=eU), not lithology, mineralisation, or alteration.",
      path ? `Source file: ${path.replace(/\\/g, "/").split("/").pop()}` : "",
      blocked
        ? "Quantity/units are unknown or not concentration. Ternary interpretation claims are blocked."
        : `Channel units: K=${channelUnits.k || "unknown"}, eU=${channelUnits.eu || "unknown"}, eTh=${channelUnits.eth || "unknown"}.`,
    ].filter(Boolean),
  };
}
