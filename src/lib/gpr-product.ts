/** Honest GPR product copy. Depth from a user velocity is not ground truth. */

export const GPR_PRODUCT_NAME = "G-AID GPR 1.0 processed radargram";
export const GPR_MAP_LABEL = "GPR radargram (two-way time)";
export const GPR_MIGRATED_LABEL = "GPR Kirchhoff time migration (user velocity)";

export const GPR_STATEMENTS = [
  "Supported GPR is a documented G-AID GPR 1.0 CSV (Units, dt_ns, dx_m, AntennaMHz, Trace/Sample/Amplitude). Arbitrary .dzt files are not processed.",
  "Processing is dewow, time-zero, SEC t² gain, and Butterworth bandpass (Jol 2009). Bandpass defaults to 0.2–2.0 × AntennaMHz when the user does not supply fLowHz/fHighHz.",
  "Kirchhoff time migration runs only with a user-supplied velocity. Velocity is not measured or assumed from the antenna.",
  "Two-way time is not depth. A migrated z axis uses the supplied velocity and is not ground truth.",
  "This pack does not establish utilities, voids, archaeology, water table, rebar, or lithology.",
] as const;

export function isGprSectionPath(path: string): boolean {
  const n = path.replace(/\\/g, "/").toLowerCase();
  return /gpr_radargram\.csv$/.test(n) || /gpr_migrated\.csv$/.test(n);
}

export function gprProductWarnings(options: {
  path?: string;
  migrated?: boolean;
  velocityMs?: number;
  dtNs?: number;
  antennaMHz?: number;
} = {}): string[] {
  const path = (options.path || "").replace(/\\/g, "/").toLowerCase();
  if (!isGprSectionPath(path) && !/gpr_/.test(path)) return [];
  const migrated = options.migrated === true || /gpr_migrated/.test(path);
  const out = [
    `Product: ${migrated ? GPR_MIGRATED_LABEL : GPR_PRODUCT_NAME}.`,
    migrated
      ? "Vertical axis is a time-to-depth conversion with the user-supplied velocity. It is not a measured depth."
      : "Vertical axis is two-way travel time in ns, not depth.",
    "Dewow, time-zero, and SEC gain are processing choices. They are not a unique earth model.",
    "Utilities, voids, archaeology, water table, rebar, and lithology are not established.",
  ];
  if (typeof options.antennaMHz === "number") out.push(`Antenna: ${options.antennaMHz} MHz (documented).`);
  if (typeof options.dtNs === "number") out.push(`Sample interval: ${options.dtNs} ns.`);
  if (migrated && typeof options.velocityMs === "number") {
    out.push(`Migration velocity: ${options.velocityMs} m/s (user-supplied).`);
  }
  return out;
}
