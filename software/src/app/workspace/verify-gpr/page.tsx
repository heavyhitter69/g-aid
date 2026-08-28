"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionView } from "@/components/workspace/section-view";
import { parseSectionCsv } from "@/lib/section/parse";
import { gprProductWarningsFromQc } from "@/lib/gpr-product";

type RunPack = {
  runId: string;
  parentRunId?: string;
  planHash: string;
  csv: string;
  qc: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  interpretation: {
    not_established?: string[];
    uncertainty?: string[];
    observations?: string[];
    product_name?: string;
  } | null;
  plan: Record<string, unknown>;
};

type Payload = {
  radargram: RunPack;
  nyquistAdjust: RunPack;
  nyquistRefuse: RunPack;
  migrated: RunPack;
};

type Tab = "radargram" | "filter" | "migrated" | "interpretation";

function mhz(hz: unknown): string {
  const n = Number(hz);
  if (!Number.isFinite(n)) return "unknown";
  return `${(n / 1e6).toPrecision(4)} MHz`;
}

function qcWarnings(pack: RunPack, path: string): string[] {
  const merged = { ...(pack.qc || {}), ...(pack.meta || {}) };
  return gprProductWarningsFromQc(
    {
      migrated: Boolean(merged.migrated) || /gpr_migrated/.test(path),
      velocity_ms: typeof merged.velocity_ms === "number" ? merged.velocity_ms : undefined,
      dt_ns: typeof merged.dt_ns === "number" ? merged.dt_ns : undefined,
      antenna_mhz: typeof merged.antenna_mhz === "number" ? merged.antenna_mhz : undefined,
      sampling_hz: typeof merged.sampling_hz === "number" ? merged.sampling_hz : undefined,
      nyquist_hz: typeof merged.nyquist_hz === "number" ? merged.nyquist_hz : undefined,
      bandpass_applied: typeof merged.bandpass_applied === "boolean" ? merged.bandpass_applied : undefined,
      bandpass_adjusted: typeof merged.bandpass_adjusted === "boolean" ? merged.bandpass_adjusted : undefined,
      bandpass_refused: typeof merged.bandpass_refused === "boolean" ? merged.bandpass_refused : undefined,
      requested_filter_hz: Array.isArray(merged.requested_filter_hz)
        ? (merged.requested_filter_hz as Array<number | null>)
        : undefined,
      applied_filter_hz: Array.isArray(merged.applied_filter_hz)
        ? (merged.applied_filter_hz as Array<number | null>)
        : undefined,
      refusal_reason: typeof merged.refusal_reason === "string" ? merged.refusal_reason : undefined,
      adjustment_reason: typeof merged.adjustment_reason === "string" ? merged.adjustment_reason : undefined,
      bandpass:
        merged.bandpass && typeof merged.bandpass === "object"
          ? (merged.bandpass as { refusal_reason?: string | null; adjustment_reason?: string | null })
          : undefined,
    },
    path
  );
}

export default function GprVerifyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string>("");
  const [tab, setTab] = useState<Tab>("radargram");

  useEffect(() => {
    void fetch("/api/verify/gpr")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  const radargram = useMemo(
    () => (data ? parseSectionCsv(data.radargram.csv, "gpr_radargram.csv") : null),
    [data]
  );
  const adjusted = useMemo(
    () => (data ? parseSectionCsv(data.nyquistAdjust.csv, "gpr_radargram.csv") : null),
    [data]
  );
  const migrated = useMemo(
    () => (data ? parseSectionCsv(data.migrated.csv, "gpr_migrated.csv") : null),
    [data]
  );

  if (error) {
    return <p className="p-6 text-sm text-red-300">Verification fixtures failed to load: {error}</p>;
  }
  if (!data) {
    return <p className="p-6 text-sm text-[#858585]">Loading GPR verification fixtures…</p>;
  }
  if (!radargram || !adjusted || !migrated) {
    return (
      <p className="p-6 text-sm text-red-300">
        Fixtures loaded but a GPR radargram failed to parse. This is not a utility map or a measured depth model.
      </p>
    );
  }

  return (
    <main className="h-screen bg-[#1e1e1e] text-[#cccccc] flex flex-col">
      <header className="px-4 py-3 border-b border-[#2b2b2b]">
        <p className="text-[10px] uppercase tracking-wide text-[#858585]">Desktop verification</p>
        <h1 className="text-sm font-medium">G-AID GPR 1.0 processed radargram</h1>
        <p className="text-[11px] text-[#9d9d9d] mt-1">
          Same SectionView as the workspace. Two-way time is not depth. A visually enhanced radargram does not have
          improved geological certainty.
        </p>
      </header>
      <nav className="flex gap-1 px-3 py-2 border-b border-[#2b2b2b] text-[12px] flex-wrap">
        {(["radargram", "filter", "migrated", "interpretation"] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`tab-${id}`}
            onClick={() => setTab(id)}
            className={`px-2 py-1 rounded ${tab === id ? "bg-[#094771] text-white" : "text-[#858585]"}`}
          >
            {id === "radargram"
              ? "Unmigrated radargram"
              : id === "filter"
                ? "Filter / Nyquist"
                : id === "migrated"
                  ? "Migrated (user velocity)"
                  : "Interpretation"}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-h-0">
        {tab === "radargram" ? (
          <SectionView
            section={radargram}
            extraWarnings={qcWarnings(data.radargram, "G-AID Output/runs/r-verify-gpr/gpr_radargram.csv")}
          />
        ) : null}
        {tab === "filter" ? (
          <div className="h-full overflow-auto">
            <SectionView
              section={adjusted}
              extraWarnings={qcWarnings(data.nyquistAdjust, "G-AID Output/runs/r-verify-gpr-nyquist/gpr_radargram.csv")}
            />
            <div className="p-4 text-[12px] space-y-2 border-t border-[#2b2b2b]">
              <p data-testid="filter-adjusted">
                Coarse-dt adjustment: refused={String(Boolean(data.nyquistAdjust.qc?.bandpass_refused))} adjusted=
                {String(Boolean(data.nyquistAdjust.qc?.bandpass_adjusted))} applied=
                {String(Boolean(data.nyquistAdjust.qc?.bandpass_applied))} Nyquist{" "}
                {mhz(data.nyquistAdjust.qc?.nyquist_hz)}
              </p>
              <p data-testid="filter-refused">
                Undersampled refusal: refused={String(Boolean(data.nyquistRefuse.qc?.bandpass_refused))} applied=
                {String(Boolean(data.nyquistRefuse.qc?.bandpass_applied))} reason=
                {String(
                  (data.nyquistRefuse.qc?.bandpass as { refusal_reason?: string } | undefined)?.refusal_reason ||
                    data.nyquistRefuse.qc?.refusal_reason ||
                    ""
                )}
              </p>
              <p data-testid="filter-no-clamp">High-cut is never silently placed at 0.999 × Nyquist.</p>
            </div>
          </div>
        ) : null}
        {tab === "migrated" ? (
          <SectionView
            section={migrated}
            extraWarnings={qcWarnings(data.migrated, "G-AID Output/runs/r-verify-gpr-mig/gpr_migrated.csv")}
          />
        ) : null}
        {tab === "interpretation" ? (
          <div className="p-4 text-[12px] space-y-3 overflow-auto">
            <p data-testid="gpr-radargram-provenance">
              Unmigrated run {data.radargram.runId} · plan {String(data.radargram.planHash)}
            </p>
            <p data-testid="gpr-mig-provenance">
              Migrated run {data.migrated.runId} · plan {String(data.migrated.planHash)} · velocity{" "}
              {String(data.migrated.qc?.velocity_ms)} m/s
            </p>
            <p data-testid="gpr-product">{String(data.radargram.interpretation?.product_name || data.radargram.qc?.product_name)}</p>
            <p data-testid="geological-certainty">
              geological_certainty_improved={String(Boolean(data.radargram.qc?.geological_certainty_improved))}
            </p>
            <ul className="list-disc pl-5 text-[#9d9d9d]" data-testid="gpr-not-established">
              {(data.radargram.interpretation?.not_established || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <ul className="list-disc pl-5 text-[#9d9d9d]">
              {(data.radargram.interpretation?.uncertainty || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}
