"use client";

import { useEffect, useMemo, useState } from "react";
import { GridMapView, parseEsriAscii } from "@/components/workspace/grid-map-view";
import { SectionView } from "@/components/workspace/section-view";
import { parseSectionCsv } from "@/lib/section/parse";
import { gravityProductWarnings, NEAR_ZONE_MAP_LABEL } from "@/lib/gravity-product";

type Payload = {
  gravity: {
    runId: string;
    planHash: string;
    ascii: string;
    qc: Record<string, unknown>;
    interpretation: { observations?: string[]; not_established?: string[] };
    crs: string;
    units: string;
    productName: string;
  };
  ert: {
    runId: string;
    planHash: string;
    pseudosection: string;
    model: string;
    qc: Record<string, unknown>;
    interpretation: { not_established?: string[] };
  };
  crsConflict: { warning: string };
};

type Tab = "gravity" | "pseudo" | "invert" | "provenance";

export default function Phase5bVerifyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string>("");
  const [tab, setTab] = useState<Tab>("gravity");

  useEffect(() => {
    void fetch("/api/verify/phase5b")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  const grid = useMemo(() => (data ? parseEsriAscii(data.gravity.ascii) : null), [data]);
  const pseudo = useMemo(
    () => (data ? parseSectionCsv(data.ert.pseudosection, "ert_pseudosection.csv") : null),
    [data]
  );
  const model = useMemo(() => (data ? parseSectionCsv(data.ert.model, "ert_2d_model.csv") : null), [data]);
  const gravWarnings = data
    ? gravityProductWarnings({
        path: "G-AID Output/runs/r-verify-grav/near_zone_terrain_corrected_bouguer_grid.asc",
        bullardB: Boolean(data.gravity.qc.apply_bullard_b),
        densityGcc: Number(data.gravity.qc.density_gcc),
        terrainRadiusM: Number(data.gravity.qc.terrain_radius_m),
        demCellSizeM: Number(data.gravity.qc.dem_cellsize_m),
        coverageFraction: Number(data.gravity.qc.mean_coverage_fraction),
        elevationDatum: String(data.gravity.qc.dem_elevation_datum || ""),
      })
    : [];

  if (error) {
    return <p className="p-6 text-sm text-red-300">Verification fixtures failed to load: {error}</p>;
  }
  if (!data || !grid || !pseudo || !model) {
    return <p className="p-6 text-sm text-[#858585]">Loading Phase 5B verification fixtures…</p>;
  }

  return (
    <main className="h-screen bg-[#1e1e1e] text-[#cccccc] flex flex-col">
      <header className="px-4 py-3 border-b border-[#2b2b2b]">
        <p className="text-[10px] uppercase tracking-wide text-[#858585]">Desktop verification</p>
        <h1 className="text-sm font-medium">Near-zone terrain-corrected Bouguer and ERT sections</h1>
        <p className="text-[11px] text-[#9d9d9d] mt-1">
          This page renders the same map and section components as the workspace. It does not claim Complete Bouguer,
          Res2DInv, groundwater, or drill targets.
        </p>
      </header>
      <nav className="flex gap-1 px-3 py-2 border-b border-[#2b2b2b] text-[12px]">
        {(["gravity", "pseudo", "invert", "provenance"] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-2 py-1 rounded ${tab === id ? "bg-[#094771] text-white" : "text-[#858585]"}`}
          >
            {id === "gravity"
              ? "Gravity map"
              : id === "pseudo"
                ? "ERT pseudosection"
                : id === "invert"
                  ? "ERT invert"
                  : "Provenance / CRS"}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-h-0">
        {tab === "gravity" ? (
          <GridMapView
            title={NEAR_ZONE_MAP_LABEL}
            grid={grid}
            units={data.gravity.units}
            crsLabel={data.gravity.crs}
            warnings={[...gravWarnings, data.crsConflict.warning]}
          />
        ) : null}
        {tab === "pseudo" ? <SectionView section={pseudo} /> : null}
        {tab === "invert" ? <SectionView section={model} /> : null}
        {tab === "provenance" ? (
          <div className="p-4 text-[12px] space-y-3 overflow-auto">
            <p data-testid="grav-provenance">
              Run {data.gravity.runId} · plan {String(data.gravity.planHash).slice(0, 8)}
            </p>
            <p data-testid="ert-provenance">
              Run {data.ert.runId} · plan {String(data.ert.planHash).slice(0, 8)}
            </p>
            <p data-testid="crs-warning">{data.crsConflict.warning}</p>
            <p>Gravity product: {data.gravity.productName}</p>
            <p>Bullard B: {String(data.gravity.qc.bullard_b_status)}</p>
            <p>DEM cell size: {String(data.gravity.qc.dem_cellsize_m)} m, coverage {String(data.gravity.qc.mean_coverage_fraction)}</p>
            <p>Far-zone: {String(data.gravity.qc.far_zone)}; intermediate-zone: {String(data.gravity.qc.intermediate_zone)}</p>
            <p>ERT invert topography used: {String(data.ert.qc.topography_used)}; not Res2DInv: {String(data.ert.qc.not_res2dinv)}</p>
            <ul className="list-disc pl-5 text-[#9d9d9d]">
              {(data.gravity.interpretation.not_established || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}
