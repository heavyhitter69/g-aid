"use client";

import { useEffect, useMemo, useState } from "react";
import { GridMapView } from "@/components/workspace/grid-map-view";
import { parseGeojson, pointsFromVector, linesFromVector, polygonsFromVector } from "@/lib/map/geojson";

type Pack = {
  runId: string;
  planHash: string;
  geojson: string | null;
  tracks: { layers?: Array<{ role?: string; role_reviewed?: boolean; crs?: string; geometry_types?: string[]; attribute_names?: string[] }> } | null;
  ingestQc: Record<string, unknown> | null;
  overlap: { rows?: Array<Record<string, string>>; blocked?: Array<{ reason?: string }> } | null;
  overlapQc: { skipped?: boolean; reason?: string } | null;
  interpretation: {
    not_established?: string[];
    observations?: string[];
    assumptions?: string[];
    uncertainty?: string[];
    recommendations?: string[];
    product_name?: string;
    geological_certainty_improved?: boolean;
  } | null;
  bboxHits?: Array<{ reason: string; relation: string }>;
};

type Payload = {
  points: Pack;
  polygons: Pack;
  unknownCrs: Pack;
  conflict: Pack;
  overlap: Pack;
  interpretation: Pack;
};
type Tab = "points" | "polygons" | "unknown-crs" | "conflict" | "overlap" | "interpretation";

function MapPack({ pack, title }: { pack: Pack; title: string }) {
  const vector = useMemo(() => (pack.geojson ? parseGeojson(pack.geojson) : null), [pack.geojson]);
  const layer = pack.tracks?.layers?.[0];
  if (!vector) return <p className="p-4 text-red-300">Vector GeoJSON missing.</p>;
  const xs = vector.data.features.flatMap((f) => f.coordinates.map((p) => p.x));
  const ys = vector.data.features.flatMap((f) => f.coordinates.map((p) => p.y));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1);
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
            units: "coordinate",
          }}
          overlay={pointsFromVector(vector.data)}
          overlayLines={linesFromVector(vector.data)}
          overlayPolygons={polygonsFromVector(vector.data)}
          units="coordinate"
          crsLabel={layer?.crs || vector.crs.label}
          warnings={[
            "This layer is source geometry and attributes. It is not an AI-confirmed geological interpretation.",
            layer?.role_reviewed
              ? `User-assigned role '${layer.role}' is a catalog label, not proof of ${layer.role}.`
              : "Layer purpose is unassigned. Geology/tenure/structure were not inferred from the filename.",
            "Spatial overlap is geometric coincidence, not a joint interpretation.",
          ]}
        />
      </div>
      <div className="border-t border-[#2b2b2b] px-3 py-2 text-[12px]" data-testid="vector-legend">
        <p data-testid="vector-role">Role: {layer?.role_reviewed ? `${layer.role} (user-assigned)` : "unassigned generic vector"}</p>
        <p data-testid="vector-crs">CRS: {layer?.crs || "undocumented"}</p>
        <p>Geometries: {(layer?.geometry_types || []).join(", ")}</p>
        <p>Attributes (unknown semantics): {(layer?.attribute_names || []).join(", ") || "none"}</p>
      </div>
    </div>
  );
}

export default function GisVerifyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("points");

  useEffect(() => {
    void fetch("/api/verify/gis")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="p-6 text-sm text-red-300">Verification fixtures failed to load: {error}</p>;
  if (!data) return <p className="p-6 text-sm text-[#858585]">Loading GIS verification fixtures…</p>;

  return (
    <main className="h-screen bg-[#1e1e1e] text-[#cccccc] flex flex-col">
      <header className="px-4 py-3 border-b border-[#2b2b2b]">
        <p className="text-[10px] uppercase tracking-wide text-[#858585]">Desktop verification</p>
        <h1 className="text-sm font-medium">G-AID documented GeoJSON vector layer</h1>
        <p className="text-[11px] text-[#9d9d9d] mt-1">
          Source geometry only. Roles are user-assigned. Overlay is not geological, mineral, or causal proof.
        </p>
      </header>
      <nav className="flex gap-1 px-3 py-2 border-b border-[#2b2b2b] text-[12px] flex-wrap">
        {(["points", "polygons", "unknown-crs", "conflict", "overlap", "interpretation"] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`tab-${id}`}
            onClick={() => setTab(id)}
            className={`px-2 py-1 rounded ${tab === id ? "bg-[#094771] text-white" : "text-[#858585]"}`}
          >
            {id === "unknown-crs" ? "Unknown CRS" : id === "conflict" ? "Conflicting CRS" : id}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-h-0">
        {tab === "points" ? <MapPack pack={data.points} title="Sample points (EPSG:32734)" /> : null}
        {tab === "polygons" ? <MapPack pack={data.polygons} title="Geology polygons (filename is not a role)" /> : null}
        {tab === "unknown-crs" ? (
          <div className="p-4 text-[12px] space-y-2" data-testid="unknown-crs-skip">
            <p>Overlay and overlap stay blocked until every layer has a documented EPSG. RFC 7946 lon/lat is not assumed.</p>
            <p data-testid="overlap-skipped">
              skipped={String(Boolean(data.unknownCrs.overlapQc?.skipped))} reason=
              {String(data.unknownCrs.overlapQc?.reason)}
            </p>
          </div>
        ) : null}
        {tab === "conflict" ? (
          <div className="p-4 text-[12px] space-y-2" data-testid="conflict-crs-block">
            <p>Conflicting CRS blocks overlap. G-AID will not silently reproject.</p>
            <ul>
              {(data.conflict.overlap?.blocked || []).map((row) => (
                <li key={row.reason}>{row.reason}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {tab === "overlap" ? (
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <MapPack pack={data.overlap} title="Tenure + samples (same CRS)" />
            </div>
            <div className="border-t border-[#2b2b2b] px-3 py-2 text-[12px]" data-testid="vector-overlap">
              <p className="text-[#858585]">Geometric overlap table (not a prospectivity map)</p>
              <ul>
                {(data.overlap.overlap?.rows || []).map((row, index) => (
                  <li key={index}>
                    {row.relation}: {row.reason}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
        {tab === "interpretation" ? (
          <div className="p-4 text-[12px] space-y-3 overflow-auto">
            <p data-testid="gis-provenance">
              Run {data.interpretation.runId} · plan {String(data.interpretation.planHash)}
            </p>
            <p data-testid="gis-product">{String(data.interpretation.interpretation?.product_name)}</p>
            <p data-testid="geological-certainty">
              geological_certainty_improved={String(Boolean(data.interpretation.interpretation?.geological_certainty_improved))}
            </p>
            <p className="text-[#858585]">Observations</p>
            <ul className="list-disc pl-5">{(data.interpretation.interpretation?.observations || []).map((line) => <li key={line}>{line}</li>)}</ul>
            <p className="text-[#858585]">Assumptions</p>
            <ul className="list-disc pl-5">{(data.interpretation.interpretation?.assumptions || []).map((line) => <li key={line}>{line}</li>)}</ul>
            <p className="text-[#858585]">Uncertainty</p>
            <ul className="list-disc pl-5">{(data.interpretation.interpretation?.uncertainty || []).map((line) => <li key={line}>{line}</li>)}</ul>
            <p className="text-[#858585]">Recommendations</p>
            <ul className="list-disc pl-5">{(data.interpretation.interpretation?.recommendations || []).map((line) => <li key={line}>{line}</li>)}</ul>
            <p className="text-[#858585]">Not established</p>
            <ul className="list-disc pl-5 text-[#9d9d9d]" data-testid="gis-not-established">
              {(data.interpretation.interpretation?.not_established || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}
