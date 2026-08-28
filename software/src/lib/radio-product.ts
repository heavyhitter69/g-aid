/** Product copy for already-corrected radiometrics. Corrections are not live. */

export const RADIO_STATEMENTS = [
  "Supported radiometrics are already-corrected G-AID RAD 1.0 concentration or documented count-rate tables.",
  "Height correction, stripping, NASVD, dead-time, background, and concentration conversion are not live capabilities.",
  "A K-eTh-eU ternary is a percentile colour stretch, not lithology, mineralisation, or alteration.",
  "Ratios are arithmetic on declared concentrations. They are not lithology, alteration, or drill targets.",
  "Map units come from the bound catalog record or versioned artifact metadata. Filenames are not a unit source.",
] as const;

function posix(path: string): string {
  return path.replace(/\\/g, "/").toLowerCase();
}

function unitsUnknown(units?: string | null): boolean {
  const value = (units || "").trim().toLowerCase();
  return !value || value === "unknown" || value === "n/a" || value === "none" || value === "nan" || value === "null";
}

export function isRadioGridPath(path: string): boolean {
  const n = posix(path);
  return /rad_(k|eu|eth|tc)_grid/.test(n) || /rad_ternary/.test(n);
}

function isRadiometricDisplayPath(path: string, formatId?: string): boolean {
  const n = posix(path);
  const fmt = (formatId || "").toLowerCase();
  return (
    fmt.startsWith("radiometric") ||
    fmt === "rad-ternary" ||
    isRadioGridPath(path) ||
    /rad_stations/.test(n) ||
    /rad_ratios/.test(n) ||
    /radiometr/.test(n)
  );
}

export function radioProductWarnings(
  options: { path?: string; quantity?: string; units?: string; formatId?: string } = {}
): string[] {
  const path = options.path || "";
  if (!isRadiometricDisplayPath(path, options.formatId)) return [];
  const out: string[] = [];
  const quantity = (options.quantity || "").trim().toLowerCase();
  const unknown = unitsUnknown(options.units) || !quantity || quantity === "unknown";
  if (unknown) {
    out.push(
      "Quantity/units are unknown. Unit-specific legend, ternary, ratio, and interpretation claims are blocked."
    );
  }
  if (/rad_ternary/.test(posix(path))) {
    out.push(
      "Ternary RGB is R=K, G=eTh, B=eU after a 2–98 percentile stretch. It is not a lithology or mineralisation map."
    );
  }
  if (/rad_(k|eu|eth|tc)_grid/.test(posix(path))) {
    out.push(
      "Radiometric grids interpolate already-corrected samples. G-AID did not apply height, stripping, or concentration conversion."
    );
  }
  if (quantity === "count_rate") {
    out.push("These values are count rates. Ternary and concentration ratios are not justified.");
  }
  return out;
}
