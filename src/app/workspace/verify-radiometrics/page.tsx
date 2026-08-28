"use client";

import { useEffect, useMemo, useState } from "react";
import { GridMapView } from "@/components/workspace/grid-map-view";
import { parseEsriAscii } from "@/lib/map/ascii";
import { TernaryView } from "@/components/workspace/ternary-view";
import { parseRadioTernaryJson } from "@/lib/radio/ternary";
import { radioProductWarnings } from "@/lib/radio-product";
import { layerLabel } from "@/lib/raster-layers";

type Payload = {
  concentration: {
    runId: string;
    parentRunId?: string;
    planHash: string;
    ascii: string;
    ternary: string;
    ratios: string;
    ratioQc: Record<string, unknown>;
    gridQc: Record<string, unknown>;
    interpretation: { not_established?: string[]; interpretation_blocked?: boolean };
    crs: string;
    units: string;
    quantity: string;
  };
  countRate: {
    runId: string;
    parentRunId?: string;
    planHash: string;
    ascii: string;
    ternaryQc: { skipped?: boolean; reason?: string };
    ratioQc: { skipped?: boolean; reason?: string };
    crs: string;
    units: string;
    quantity: string;
  };
  unknownUnits: {
    runId: string;
    parentRunId?: string;
    planHash: string;
    ascii: string;
    ternaryQc: { skipped?: boolean; reason?: string } | null;
    interpretation: { interpretation_blocked?: boolean; not_established?: string[] };
    crs: string;
    units: string;
    quantity: string;
  };
};

type Tab = "grid" | "ternary" | "ratios" | "count-rate" | "unknown" | "provenance";

export default function RadiometricsVerifyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string>("");
  const [tab, setTab] = useState<Tab>("grid");

  useEffect(() => {
    void fetch("/api/verify/radiometrics")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  const concGrid = useMemo(() => (data ? parseEsriAscii(data.concentration.ascii) : null), [data]);
  const cpsGrid = useMemo(() => (data ? parseEsriAscii(data.countRate.ascii) : null), [data]);
  const unknownGrid = useMemo(() => (data ? parseEsriAscii(data.unknownUnits.ascii) : null), [data]);
  const ternary = useMemo(() => {
    if (!data) return null;
    try {
      return parseRadioTernaryJson(data.concentration.ternary, "rad_ternary.json");
    } catch {
      return null;
    }
  }, [data]);

  if (error) {
    return <p className="p-6 text-sm text-red-300">Verification fixtures failed to load: {error}</p>;
  }
  if (!data) {
    return <p className="p-6 text-sm text-[#858585]">Loading radiometrics verification fixtures…</p>;
  }
  if (!concGrid || !cpsGrid || !unknownGrid || !ternary) {
    return (
      <p className="p-6 text-sm text-red-300">
        Fixtures loaded but a radiometric grid or ternary failed to parse. Quantity/units are not inferred from filenames.
      </p>
    );
  }

  const concWarnings = radioProductWarnings({
    path: "G-AID Output/runs/r-verify-rad-conc/rad_k_grid.asc",
    quantity: data.concentration.quantity,
    units: data.concentration.units,
  });
  const cpsWarnings = radioProductWarnings({
    path: "G-AID Output/runs/r-verify-rad-cps/rad_k_grid.asc",
    quantity: data.countRate.quantity,
    units: data.countRate.units,
  });
  const unknownWarnings = radioProductWarnings({
    path: "G-AID Output/runs/r-verify-rad-unknown/rad_k_grid.asc",
    quantity: data.unknownUnits.quantity,
    units: data.unknownUnits.units,
  });

  return (
    <main className="h-screen bg-[#1e1e1e] text-[#cccccc] flex flex-col">
      <header className="px-4 py-3 border-b border-[#2b2b2b]">
        <p className="text-[10px] uppercase tracking-wide text-[#858585]">Desktop verification</p>
        <h1 className="text-sm font-medium">Already-corrected radiometrics (G-AID RAD 1.0)</h1>
        <p className="text-[11px] text-[#9d9d9d] mt-1">
          Same GridMapView and TernaryView as the workspace. Units come from catalog/artifact metadata, not filenames.
        </p>
      </header>
      <nav className="flex gap-1 px-3 py-2 border-b border-[#2b2b2b] text-[12px] flex-wrap">
        {(["grid", "ternary", "ratios", "count-rate", "unknown", "provenance"] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`tab-${id}`}
            onClick={() => setTab(id)}
            className={`px-2 py-1 rounded ${tab === id ? "bg-[#094771] text-white" : "text-[#858585]"}`}
          >
            {id === "grid"
              ? "K grid"
              : id === "ternary"
                ? "Ternary"
                : id === "ratios"
                  ? "Ratios"
                  : id === "count-rate"
                    ? "Count-rate"
                    : id === "unknown"
                      ? "Unknown units"
                      : "Provenance"}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-h-0">
        {tab === "grid" ? (
          <GridMapView
            title={`${layerLabel("rad_k_grid.asc")} (${data.concentration.units})`}
            grid={concGrid}
            units={data.concentration.units}
            crsLabel={data.concentration.crs}
            warnings={concWarnings}
          />
        ) : null}
        {tab === "ternary" ? <TernaryView ternary={ternary} /> : null}
        {tab === "ratios" ? (
          <div className="p-4 text-[12px] space-y-3 overflow-auto">
            <p data-testid="ratio-status">
              Ratios skipped: {String(Boolean(data.concentration.ratioQc.skipped))} · units eU/K{" "}
              {String(data.concentration.ratioQc.units_eu_k || "unknown")}
            </p>
            <pre className="text-[11px] text-[#9d9d9d] whitespace-pre-wrap">{data.concentration.ratios}</pre>
          </div>
        ) : null}
        {tab === "count-rate" ? (
          <GridMapView
            title={`${layerLabel("rad_k_grid.asc")} (${data.countRate.units})`}
            grid={cpsGrid}
            units={data.countRate.units}
            crsLabel={data.countRate.crs}
            warnings={[
              ...cpsWarnings,
              data.countRate.ternaryQc.skipped
                ? `Ternary unavailable: ${data.countRate.ternaryQc.reason || "count-rate data"}`
                : "",
              data.countRate.ratioQc.skipped
                ? `Ratios unavailable: ${data.countRate.ratioQc.reason || "count-rate data"}`
                : "",
            ].filter(Boolean)}
          />
        ) : null}
        {tab === "unknown" ? (
          <GridMapView
            title={`${layerLabel("rad_k_grid.asc")} (${data.unknownUnits.units})`}
            grid={unknownGrid}
            units={data.unknownUnits.units}
            crsLabel={data.unknownUnits.crs}
            warnings={unknownWarnings}
          />
        ) : null}
        {tab === "provenance" ? (
          <div className="p-4 text-[12px] space-y-3 overflow-auto">
            <p data-testid="rad-conc-provenance">
              Concentration run {data.concentration.runId} · parent {String(data.concentration.parentRunId || "none")} ·
              plan {String(data.concentration.planHash)}
            </p>
            <p data-testid="rad-cps-provenance">
              Count-rate run {data.countRate.runId} · plan {String(data.countRate.planHash)}
            </p>
            <p data-testid="rad-unknown-provenance">
              Unknown-units run {data.unknownUnits.runId} · plan {String(data.unknownUnits.planHash)}
            </p>
            <p data-testid="count-rate-skip">
              Count-rate ternary skipped: {String(Boolean(data.countRate.ternaryQc.skipped))}; ratios skipped:{" "}
              {String(Boolean(data.countRate.ratioQc.skipped))}
            </p>
            <p data-testid="unknown-blocked">
              Unknown-units interpretation blocked: {String(Boolean(data.unknownUnits.interpretation.interpretation_blocked))}
            </p>
            <ul className="list-disc pl-5 text-[#9d9d9d]">
              {(data.concentration.interpretation.not_established || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}
