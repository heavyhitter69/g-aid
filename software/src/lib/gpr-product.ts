/** Honest GPR product copy. Depth from a user velocity is not ground truth. */

export const GPR_PRODUCT_NAME = "G-AID GPR 1.0 processed radargram";
export const GPR_MAP_LABEL = "GPR radargram (two-way time)";
export const GPR_MIGRATED_LABEL = "GPR Kirchhoff time migration (user velocity)";

export const NYQUIST_HIGH_FRACTION = 0.8;
export const ANTENNA_LOW_FRACTION = 0.2;
export const ANTENNA_HIGH_FRACTION = 2.0;
export const DEFAULT_DEWOW_WINDOW = 31;
export const DEFAULT_FILTER_ORDER = 4;
export const DEFAULT_SEC_POWER = 2.0;
export const DEFAULT_TIME_ZERO_THRESHOLD = 0.05;

/** Must match docs/validation/results/gpr_migration_benchmark.json all_passed. */
export const GPR_MIGRATION_BENCHMARK_PASSED = true;

export const GPR_STATEMENTS = [
  "Supported GPR is a documented G-AID GPR 1.0 CSV (Units, dt_ns, dx_m, AntennaMHz, Trace/Sample/Amplitude). Arbitrary .dzt files are not processed.",
  "Dewow (odd running mean), time-zero (stack first-break threshold), SEC t^n gain, and Butterworth band-pass are optional frozen parameters (Jol 2009). Defaults are on and recorded.",
  "Sampling frequency and Nyquist are derived from dt_ns. Band-pass corners are validated against Nyquist. A high-cut at or above Nyquist is refused, not silently clamped to 0.999 Nyquist.",
  "When the antenna default 0.2–2.0 × AntennaMHz is not Nyquist-safe, G-AID applies a documented safe high-cut of 0.8 × Nyquist if the low-cut still fits; otherwise the filter is skipped and the user must supply corners.",
  "Kirchhoff time migration runs only with a user-supplied velocity and only if the documented diffraction benchmark has passed. Velocity is not assumed from the antenna.",
  "Two-way time is not depth. A migrated z axis uses the supplied velocity and is not ground truth. A visually enhanced radargram does not have improved geological certainty.",
  "This pack does not establish utilities, voids, archaeology, water table, rebar, or lithology.",
] as const;

export function samplingFromDtNs(dtNs: number): { samplingHz: number; nyquistHz: number } | undefined {
  if (!(typeof dtNs === "number" && Number.isFinite(dtNs) && dtNs > 0)) return undefined;
  const samplingHz = 1e9 / dtNs;
  return { samplingHz, nyquistHz: 0.5 * samplingHz };
}

export function resolveGprBandpass(options: {
  dtNs?: number;
  fLowHz?: number;
  fHighHz?: number;
  antennaMHz?: number;
  applyBandpass?: boolean;
}): {
  samplingHz?: number;
  nyquistHz?: number;
  requestedLowHz?: number;
  requestedHighHz?: number;
  appliedLowHz?: number;
  appliedHighHz?: number;
  requestedSource: "user" | "antenna_default" | "none";
  bandpassApplied: boolean;
  bandpassAdjusted: boolean;
  bandpassRefused: boolean;
  reason?: string;
} {
  const samp = typeof options.dtNs === "number" ? samplingFromDtNs(options.dtNs) : undefined;
  const apply = options.applyBandpass !== false;
  if (!samp) {
    return { requestedSource: "none", bandpassApplied: false, bandpassAdjusted: false, bandpassRefused: true, reason: "dt_ns is required to derive Nyquist." };
  }
  if (!apply) {
    return {
      samplingHz: samp.samplingHz,
      nyquistHz: samp.nyquistHz,
      requestedSource: "none",
      bandpassApplied: false,
      bandpassAdjusted: false,
      bandpassRefused: true,
      reason: "Band-pass skipped because applyBandpass is false in the frozen plan.",
    };
  }
  const user = typeof options.fLowHz === "number" && typeof options.fHighHz === "number";
  const reqLow = user
    ? options.fLowHz
    : typeof options.antennaMHz === "number"
      ? ANTENNA_LOW_FRACTION * options.antennaMHz * 1e6
      : undefined;
  const reqHigh = user
    ? options.fHighHz
    : typeof options.antennaMHz === "number"
      ? ANTENNA_HIGH_FRACTION * options.antennaMHz * 1e6
      : undefined;
  const source = user ? "user" : reqLow != null ? "antenna_default" : "none";
  if (reqLow == null || reqHigh == null) {
    return {
      samplingHz: samp.samplingHz,
      nyquistHz: samp.nyquistHz,
      requestedSource: source,
      bandpassApplied: false,
      bandpassAdjusted: false,
      bandpassRefused: true,
      reason: "No user fLowHz/fHighHz and no AntennaMHz, so the band-pass will not be applied.",
    };
  }
  const invalid = cornersInvalid(reqLow, reqHigh, samp.nyquistHz);
  if (!invalid) {
    return {
      samplingHz: samp.samplingHz,
      nyquistHz: samp.nyquistHz,
      requestedLowHz: reqLow,
      requestedHighHz: reqHigh,
      appliedLowHz: reqLow,
      appliedHighHz: reqHigh,
      requestedSource: source,
      bandpassApplied: true,
      bandpassAdjusted: false,
      bandpassRefused: false,
    };
  }
  if (source === "user") {
    return {
      samplingHz: samp.samplingHz,
      nyquistHz: samp.nyquistHz,
      requestedLowHz: reqLow,
      requestedHighHz: reqHigh,
      requestedSource: source,
      bandpassApplied: false,
      bandpassAdjusted: false,
      bandpassRefused: true,
      reason: invalid,
    };
  }
  const safeHigh = NYQUIST_HIGH_FRACTION * samp.nyquistHz;
  const safeInvalid = cornersInvalid(reqLow, safeHigh, samp.nyquistHz);
  if (!safeInvalid) {
    return {
      samplingHz: samp.samplingHz,
      nyquistHz: samp.nyquistHz,
      requestedLowHz: reqLow,
      requestedHighHz: reqHigh,
      appliedLowHz: reqLow,
      appliedHighHz: safeHigh,
      requestedSource: source,
      bandpassApplied: true,
      bandpassAdjusted: true,
      bandpassRefused: false,
      reason: `Antenna default 0.2–2.0 × AntennaMHz is not Nyquist-safe. Applied documented safe high-cut ${NYQUIST_HIGH_FRACTION} × Nyquist. This is not a silent clamp to 0.999 Nyquist.`,
    };
  }
  return {
    samplingHz: samp.samplingHz,
    nyquistHz: samp.nyquistHz,
    requestedLowHz: reqLow,
    requestedHighHz: reqHigh,
    requestedSource: source,
    bandpassApplied: false,
    bandpassAdjusted: false,
    bandpassRefused: true,
    reason: `${invalid} Supply fLowHz/fHighHz below Nyquist.`,
  };
}

function cornersInvalid(low: number, high: number, nyquistHz: number): string | undefined {
  if (!(low > 0 && high > 0)) return "Band-pass corners must be positive.";
  if (low >= high) return "Band-pass low-cut must be below high-cut.";
  if (high >= nyquistHz) {
    return `Band-pass high-cut is at or above Nyquist (${(nyquistHz / 1e6).toPrecision(4)} MHz). G-AID will not silently place a high-cut at 0.999 × Nyquist.`;
  }
  if (low >= nyquistHz) return "Band-pass low-cut is at or above Nyquist.";
  return undefined;
}

export function isGprSectionPath(path: string): boolean {
  const n = path.replace(/\\/g, "/").toLowerCase();
  return /gpr_radargram\.csv$/.test(n) || /gpr_migrated\.csv$/.test(n);
}

export function gprSectionHeading(zReference?: string, modelStatus?: string): string {
  const z = (zReference || "").toLowerCase();
  const status = (modelStatus || "").toLowerCase();
  const migrated = /user velocity|0\.5 v t|depth m from/.test(z) || (/kirchhoff/.test(status) && !/not migrated/.test(status));
  return migrated
    ? "GPR Kirchhoff time migration (user-velocity depth, not ground truth)"
    : "GPR radargram (two-way time, not depth)";
}

export function gprProductWarnings(options: {
  path?: string;
  migrated?: boolean;
  velocityMs?: number;
  dtNs?: number;
  antennaMHz?: number;
  samplingHz?: number;
  nyquistHz?: number;
  bandpassApplied?: boolean;
  bandpassAdjusted?: boolean;
  bandpassRefused?: boolean;
  requestedFilterHz?: Array<number | null>;
  appliedFilterHz?: Array<number | null>;
  filterNote?: string;
} = {}): string[] {
  const path = (options.path || "").replace(/\\/g, "/").toLowerCase();
  if (!isGprSectionPath(path) && !/gpr_/.test(path)) return [];
  const migrated = options.migrated === true || /gpr_migrated/.test(path);
  const out = [
    `Product: ${migrated ? GPR_MIGRATED_LABEL : GPR_PRODUCT_NAME}.`,
    migrated
      ? "Vertical axis is a time-to-depth conversion with the user-supplied velocity. It is not a measured depth."
      : "Vertical axis is two-way travel time in ns, not depth.",
    "Dewow, time-zero, SEC gain, and band-pass are processing choices. A visually enhanced radargram does not have improved geological certainty.",
    "Utilities, voids, archaeology, water table, rebar, and lithology are not established.",
  ];
  if (typeof options.antennaMHz === "number") out.push(`Antenna: ${options.antennaMHz} MHz (documented).`);
  if (typeof options.dtNs === "number") out.push(`Sample interval: ${options.dtNs} ns.`);
  if (typeof options.samplingHz === "number") out.push(`Sampling frequency: ${(options.samplingHz / 1e6).toPrecision(4)} MHz.`);
  if (typeof options.nyquistHz === "number") out.push(`Nyquist: ${(options.nyquistHz / 1e6).toPrecision(4)} MHz.`);
  if (options.requestedFilterHz) {
    out.push(`Requested filter: ${formatHzPair(options.requestedFilterHz)}.`);
  }
  if (options.appliedFilterHz && options.bandpassApplied) {
    out.push(`Applied filter: ${formatHzPair(options.appliedFilterHz)}${options.bandpassAdjusted ? " (Nyquist-safe adjustment)" : ""}.`);
  }
  if (options.bandpassRefused) out.push(options.filterNote || "Band-pass was not applied.");
  else if (options.filterNote) out.push(options.filterNote);
  if (migrated && typeof options.velocityMs === "number") {
    out.push(`Migration velocity: ${options.velocityMs} m/s (user-supplied).`);
  }
  return out;
}

function formatHzPair(pair: Array<number | null | undefined>): string {
  const [lo, hi] = pair;
  if (typeof lo !== "number" || typeof hi !== "number") return "not applied";
  return `${(lo / 1e6).toPrecision(4)}–${(hi / 1e6).toPrecision(4)} MHz`;
}

export function gprFrozenNyquistLine(options: {
  dtNs?: number;
  antennaMHz?: number;
  fLowHz?: number;
  fHighHz?: number;
  applyBandpass?: boolean;
}): string {
  const samp = typeof options.dtNs === "number" ? samplingFromDtNs(options.dtNs) : undefined;
  if (!samp) return "GPR sampling/Nyquist: dt_ns is not bound yet, so filter corners cannot be validated.";
  const band = resolveGprBandpass(options);
  const req =
    typeof band.requestedLowHz === "number" && typeof band.requestedHighHz === "number"
      ? `${formatHzPair([band.requestedLowHz, band.requestedHighHz])} (${band.requestedSource})`
      : `none (${band.requestedSource})`;
  const applied =
    band.bandpassApplied && typeof band.appliedLowHz === "number" && typeof band.appliedHighHz === "number"
      ? formatHzPair([band.appliedLowHz, band.appliedHighHz])
      : "not applied";
  const status = band.bandpassRefused
    ? `Refusal: ${band.reason}`
    : band.bandpassAdjusted
      ? `Adjustment: ${band.reason}`
      : "No Nyquist adjustment.";
  return `GPR sampling ${(samp.samplingHz / 1e6).toPrecision(4)} MHz, Nyquist ${(samp.nyquistHz / 1e6).toPrecision(4)} MHz. Requested filter ${req}. Applied filter ${applied}. ${status}`;
}

export function gprProductWarningsFromQc(
  qc:
    | {
        migrated?: boolean;
        velocity_ms?: number;
        dt_ns?: number;
        antenna_mhz?: number;
        sampling_hz?: number;
        nyquist_hz?: number;
        bandpass_applied?: boolean;
        bandpass_adjusted?: boolean;
        bandpass_refused?: boolean;
        requested_filter_hz?: Array<number | null>;
        applied_filter_hz?: Array<number | null>;
        refusal_reason?: string;
        adjustment_reason?: string;
        bandpass?: { refusal_reason?: string | null; adjustment_reason?: string | null };
      }
    | null
    | undefined,
  path?: string
): string[] {
  if (!qc && !path) return [];
  return gprProductWarnings({
    path,
    migrated: qc?.migrated,
    velocityMs: qc?.velocity_ms,
    dtNs: qc?.dt_ns,
    antennaMHz: qc?.antenna_mhz,
    samplingHz: qc?.sampling_hz,
    nyquistHz: qc?.nyquist_hz,
    bandpassApplied: qc?.bandpass_applied,
    bandpassAdjusted: qc?.bandpass_adjusted,
    bandpassRefused: qc?.bandpass_refused,
    requestedFilterHz: qc?.requested_filter_hz,
    appliedFilterHz: qc?.applied_filter_hz,
    filterNote:
      qc?.refusal_reason ||
      qc?.adjustment_reason ||
      qc?.bandpass?.refusal_reason ||
      qc?.bandpass?.adjustment_reason ||
      undefined,
  });
}
