"use client";

import { useEffect, useMemo, useState } from "react";
import { GridMapView } from "@/components/workspace/grid-map-view";
import { parseGeojson, pointsFromVector, polygonsFromVector } from "@/lib/map/geojson";
import { geochemLayerHeading, geochemProductWarnings } from "@/lib/geochem-product";

type CatalogRow = {
  id: string;
  relativePath: string;
  filename: string;
  supportStatus: string;
  formatId: string;
  adapterId: string | null;
  domainHint: string;
  crs: string | null;
  units: string | null;
  sampleMedium: string | null;
  geochemMapping?: { reviewed?: boolean; sampleId?: string };
  parseErrors?: string[];
};

type Pack = {
  runId: string;
  planHash: string;
  geojson: string | null;
  ingestQc: Record<string, unknown> | null;
  qc: {
    n_censored?: number;
    mixed_units?: boolean;
    duplicate_sample_ids?: string[];
    qa_qc?: { applied?: boolean; reason?: string };
    replaced_bdl_with_zero?: boolean;
  } | null;
  summary: {
    comparisons?: Array<{ blocked?: boolean; reason?: string; left?: string; right?: string }>;
    elements?: Array<{ key?: string; units?: string; n_censored?: number; max?: number }>;
  } | null;
  pointsMeta: { n_features?: number; visual_scale?: string; crs?: string } | null;
  geologyGeojson?: string | null;
  interpretation: {
    not_established?: string[];
    observations?: string[];
    assumptions?: string[];
    uncertainty?: string[];
    recommendations?: string[];
    product_name?: string;
    geological_certainty_improved?: boolean;
  } | null;
};

type Payload = {
  catalog: { root: string; records: CatalogRow[] };
  valid: Pack;
  bdl: Pack;
  mixed: Pack;
  qc: Pack;
  overlay: Pack;
  comparison: { blocked: boolean; reason: string };
  warnings: string[];
};

type Tab = "catalog" | "points" | "bdl" | "mixed" | "qc" | "overlay" | "interpretation";

function MapPack({ pack, title, extraWarnings = [] }: { pack: Pack; title: string; extraWarnings?: string[] }) {
  const vector = useMemo(() => (pack.geojson ? parseGeojson(pack.geojson) : null), [pack.geojson]);
  const geology = useMemo(
    () => (pack.geologyGeojson ? parseGeojson(pack.geologyGeojson) : null),
    [pack.geologyGeojson]
  );
  if (!vector) {
    return (
      <p className="p-4 text-amber-300" data-testid="map-missing">
        Sample points were not mapped ({pack.pointsMeta?.crs || "no CRS/geojson"}). High values were not invented as a map.
      </p>
    );
  }
  const xs = vector.data.features.flatMap((f) => f.coordinates.map((p) => p.x));
  const ys = vector.data.features.flatMap((f) => f.coordinates.map((p) => p.y));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1);
  const sample = vector.data.features[0];
  const element = String(sample?.properties?.element || "Au");
  const unit = String(sample?.properties?.unit || "ppm");
  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0">
        <GridMapView
          title={title}
          grid={{
            ncols: 2,
            nrows: 2,
            xllcorner: minX - span * 0.1,
            yllcorner: minY - span * 0.1,
            cellsize: (span * 1.2) / 2,
            nodata: -9999,
            values: new Float64Array([0, 0, 0, 0]),
            units: unit,
          }}
          overlay={pointsFromVector(vector.data)}
          overlayPolygons={geology ? polygonsFromVector(geology.data) : undefined}
          units={unit}
          crsLabel={pack.pointsMeta?.crs || vector.crs.label}
          warnings={[
            ...geochemProductWarnings({
              element,
              units: unit,
              censored: true,
              qualifierVisible: true,
              medium: String(sample?.properties?.medium || "soil"),
              crs: pack.pointsMeta?.crs || vector.crs.key,
            }),
            ...extraWarnings,
          ]}
        />
      </div>
      <div className="border-t border-[#2b2b2b] px-3 py-2 text-[12px]" data-testid="legend">
        <p>
          {geochemLayerHeading(element, unit)} · qualifier={String(sample?.properties?.qualifier || "none")} · source=
          {String(sample?.properties?.source || "")} · filter={String(sample?.properties?.filter_state || "unfiltered")} ·
          scale={pack.pointsMeta?.visual_scale}
        </p>
      </div>
    </div>
  );
}

export default function GeochemVerifyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("catalog");

  useEffect(() => {
    void fetch("/api/verify/geochem")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="p-6 text-sm text-red-300">Verification fixtures failed to load: {error}</p>;
  if (!data) return <p className="p-6 text-sm text-[#858585]">Loading geochemistry verification fixtures…</p>;

  return (
    <main className="h-screen bg-[#1e1e1e] text-[#cccccc] flex flex-col">
      <header className="px-4 py-3 border-b border-[#2b2b2b]">
        <p className="text-[10px] uppercase tracking-wide text-[#858585]">Desktop verification</p>
        <h1 className="text-sm font-medium">G-AID GEOCHEM 1.0 sample assays</h1>
        <p className="text-[11px] text-[#9d9d9d] mt-1">
          Same map workspace as the product. High values are observations, not ore. Below-detection stays censored.
        </p>
      </header>
      <nav className="flex gap-1 px-3 py-2 border-b border-[#2b2b2b] text-[12px] flex-wrap">
        {(["catalog", "points", "bdl", "mixed", "qc", "overlay", "interpretation"] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`tab-${id}`}
            onClick={() => setTab(id)}
            className={`px-2 py-1 rounded ${tab === id ? "bg-[#094771] text-white" : "text-[#858585]"}`}
          >
            {id}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-h-0 overflow-auto">
        {tab === "catalog" ? (
          <table className="w-full text-left text-[12px]" data-testid="catalog-table">
            <thead>
              <tr className="text-[#858585]">
                <th className="px-3 py-2">File</th>
                <th className="px-3 py-2">Support</th>
                <th className="px-3 py-2">Adapter</th>
                <th className="px-3 py-2">CRS / medium</th>
                <th className="px-3 py-2">Errors</th>
              </tr>
            </thead>
            <tbody>
              {data.catalog.records.map((record) => (
                <tr key={record.id} className="border-t border-[#2b2b2b]">
                  <td className="px-3 py-2 font-mono">{record.relativePath}</td>
                  <td className="px-3 py-2">{record.supportStatus}</td>
                  <td className="px-3 py-2">
                    {record.adapterId}/{record.formatId}
                  </td>
                  <td className="px-3 py-2">
                    {record.crs || "—"} / {record.sampleMedium || "—"} / {record.units || "—"}
                  </td>
                  <td className="px-3 py-2 text-amber-300">{record.parseErrors?.[0] || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {tab === "points" ? <MapPack pack={data.valid} title="Valid soil assays (EPSG:32734)" /> : null}
        {tab === "bdl" ? (
          <div className="h-full flex flex-col">
            <MapPack pack={data.bdl} title="Below-detection censored (not zero)" extraWarnings={["BDL values are null, not 0."]} />
            <p className="px-3 py-2 text-[12px]" data-testid="bdl-count">
              n_censored={data.bdl.qc?.n_censored} replaced_bdl_with_zero={String(data.bdl.qc?.replaced_bdl_with_zero)}
            </p>
          </div>
        ) : null}
        {tab === "mixed" ? (
          <div className="p-4 text-[13px]" data-testid="mixed-block">
            <p className="text-amber-300">{data.comparison.reason}</p>
            <p>blocked={String(data.comparison.blocked)}</p>
            <p>{data.mixed.summary?.comparisons?.[0]?.reason}</p>
            <p className="mt-3 text-[#858585]">Direct comparison of Au_ppm and Fe_pct is refused. Units were not converted.</p>
          </div>
        ) : null}
        {tab === "qc" ? (
          <div className="p-4 text-[13px]" data-testid="qc-panel">
            <p>duplicate_ids={JSON.stringify(data.qc.qc?.duplicate_sample_ids || [])}</p>
            <p>qa_qc.applied={String(data.qc.qc?.qa_qc?.applied)} {data.qc.qc?.qa_qc?.reason || ""}</p>
            <p>mixed_units={String(data.qc.qc?.mixed_units)}</p>
          </div>
        ) : null}
        {tab === "overlay" ? (
          <div className="h-full flex flex-col">
            <MapPack
              pack={data.overlay}
              title="Assays over geology polygon (coincidence, not proof)"
              extraWarnings={["Spatial association with geology is not causal evidence."]}
            />
          </div>
        ) : null}
        {tab === "interpretation" ? (
          <div className="p-4 text-[13px] space-y-2" data-testid="interpretation">
            <p>geological_certainty_improved={String(data.valid.interpretation?.geological_certainty_improved)}</p>
            <p className="text-[#858585]">{data.valid.interpretation?.product_name}</p>
            <ul>
              {(data.valid.interpretation?.not_established || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}
