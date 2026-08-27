"use client";

import { useEffect, useMemo, useState } from "react";
import { LogView } from "@/components/workspace/log-view";
import { GridMapView } from "@/components/workspace/grid-map-view";
import { parseBoreholeTracks } from "@/lib/log/parse";
import { parseGeojson, pointsFromVector } from "@/lib/map/geojson";

type Pack = {
  runId: string;
  planHash: string;
  tracks: Record<string, unknown>;
  ingestQc: Record<string, unknown> | null;
  collarQc: Record<string, unknown> | null;
  collarGeojson: string | null;
  interpretation: {
    not_established?: string[];
    observations?: string[];
    uncertainty?: string[];
    product_name?: string;
    geological_certainty_improved?: boolean;
  } | null;
  overlap?: Array<{ path: string; label: string; formatId: string; reason: string }>;
};

type Payload = { log: Pack; collar: Pack; missingCrs: Pack };
type Tab = "log" | "collar" | "missing-crs" | "interpretation";

export default function LasVerifyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("log");

  useEffect(() => {
    void fetch("/api/verify/las")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  const log = useMemo(() => (data ? parseBoreholeTracks(JSON.stringify(data.log.tracks), "borehole_tracks.json") : null), [data]);
  const vector = useMemo(() => (data?.collar.collarGeojson ? parseGeojson(data.collar.collarGeojson) : null), [data]);

  if (error) return <p className="p-6 text-sm text-red-300">Verification fixtures failed to load: {error}</p>;
  if (!data || !log) return <p className="p-6 text-sm text-[#858585]">Loading LAS verification fixtures…</p>;

  return (
    <main className="h-screen bg-[#1e1e1e] text-[#cccccc] flex flex-col">
      <header className="px-4 py-3 border-b border-[#2b2b2b]">
        <p className="text-[10px] uppercase tracking-wide text-[#858585]">Desktop verification</p>
        <h1 className="text-sm font-medium">G-AID LAS 2.0 measured-depth log</h1>
        <p className="text-[11px] text-[#9d9d9d] mt-1">
          Same LogView as the workspace. Measured depth is not TVD. A collar is mapped only with coordinates and CRS.
        </p>
      </header>
      <nav className="flex gap-1 px-3 py-2 border-b border-[#2b2b2b] text-[12px] flex-wrap">
        {(["log", "collar", "missing-crs", "interpretation"] as Tab[]).map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`tab-${id}`}
            onClick={() => setTab(id)}
            className={`px-2 py-1 rounded ${tab === id ? "bg-[#094771] text-white" : "text-[#858585]"}`}
          >
            {id === "log"
              ? "Vertical log"
              : id === "collar"
                ? "Mapped collar"
                : id === "missing-crs"
                  ? "Missing CRS"
                  : "Interpretation"}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-h-0">
        {tab === "log" ? <LogView log={log} /> : null}
        {tab === "collar" ? (
          <div className="h-full flex flex-col">
            {vector ? (
              <div className="flex-1 min-h-0">
                <GridMapView
                  title="Borehole collar (EPSG:4326)"
                  grid={{
                    ncols: 2,
                    nrows: 2,
                    xllcorner: (vector.data.features[0]?.coordinates[0]?.x ?? 0) - 1,
                    yllcorner: (vector.data.features[0]?.coordinates[0]?.y ?? 0) - 1,
                    cellsize: 1,
                    nodata: -9999,
                    values: new Float64Array([0, 0, 0, 0]),
                    units: "coordinate",
                  }}
                  overlay={pointsFromVector(vector.data)}
                  units="coordinate"
                  crsLabel="WGS 84 (EPSG:4326)"
                  warnings={[
                    "Collar is a point with documented CRS, not a well path.",
                    "Overlapping layers are geometric coincidence, not a joint interpretation.",
                  ]}
                />
              </div>
            ) : (
              <p className="p-4 text-red-300">Collar GeoJSON missing.</p>
            )}
            <div className="border-t border-[#2b2b2b] px-3 py-2 text-[12px]" data-testid="collar-overlap">
              <p className="text-[#858585]">Layers overlapping this collar</p>
              <ul>
                {(data.collar.overlap || []).map((hit) => (
                  <li key={hit.path}>
                    {hit.label} ({hit.formatId})
                  </li>
                ))}
              </ul>
              <p data-testid="collar-kind">
                coordinate_kind={String((data.collar.collarQc as { coordinate_kind?: string } | null)?.coordinate_kind)} location_quality=
                {String((data.collar.collarQc as { location_quality?: string } | null)?.location_quality)}
              </p>
            </div>
          </div>
        ) : null}
        {tab === "missing-crs" ? (
          <div className="p-4 text-[12px] space-y-2" data-testid="missing-crs-skip">
            <p>Log viewing remains available without a map position.</p>
            <p data-testid="collar-skipped">
              skipped={String(Boolean((data.missingCrs.collarQc as { skipped?: boolean } | null)?.skipped))} reason=
              {String((data.missingCrs.collarQc as { reason?: string } | null)?.reason)}
            </p>
            <p>No fabricated collar GeoJSON: {data.missingCrs.collarGeojson ? "present (invalid)" : "absent"}</p>
          </div>
        ) : null}
        {tab === "interpretation" ? (
          <div className="p-4 text-[12px] space-y-3 overflow-auto">
            <p data-testid="las-provenance">
              Run {data.log.runId} · plan {String(data.log.planHash)}
            </p>
            <p data-testid="las-product">{String(data.log.interpretation?.product_name)}</p>
            <p data-testid="geological-certainty">
              geological_certainty_improved={String(Boolean(data.log.interpretation?.geological_certainty_improved))}
            </p>
            <ul className="list-disc pl-5 text-[#9d9d9d]" data-testid="las-not-established">
              {(data.log.interpretation?.not_established || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}
