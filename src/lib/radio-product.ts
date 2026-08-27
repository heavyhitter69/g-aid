/** Product copy for already-corrected radiometrics. Corrections are not live. */

export const RADIO_STATEMENTS = [
  "Supported radiometrics are already-corrected G-AID RAD 1.0 concentration or documented count-rate tables.",
  "Height correction, stripping, NASVD, dead-time, background, and concentration conversion are not live capabilities.",
  "A K-eTh-eU ternary is a percentile colour stretch, not lithology, mineralisation, or alteration.",
  "Ratios are arithmetic on declared concentrations. They are not lithology, alteration, or drill targets.",
] as const;

export function isRadioGridPath(path: string): boolean {
  const n = path.replace(/\\/g, "/").toLowerCase();
  return /rad_(k|eu|eth|tc)_grid/.test(n) || /rad_ternary/.test(n);
}

export function radioProductWarnings(options: { path?: string; quantity?: string } = {}): string[] {
  const path = (options.path || "").replace(/\\/g, "/").toLowerCase();
  const out: string[] = [];
  if (/rad_ternary/.test(path)) {
    out.push("Ternary RGB is R=K, G=eTh, B=eU after a 2–98 percentile stretch. It is not a lithology or mineralisation map.");
  }
  if (/rad_(k|eu|eth|tc)_grid/.test(path)) {
    out.push("Radiometric grids interpolate already-corrected samples. G-AID did not apply height, stripping, or concentration conversion.");
  }
  if (options.quantity === "count_rate") {
    out.push("These values are count rates. Ternary and concentration ratios are not justified.");
  }
  return out;
}
