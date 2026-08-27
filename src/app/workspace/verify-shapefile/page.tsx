"use client";

import { useEffect, useMemo, useState } from "react";
import { GridMapView } from "@/components/workspace/grid-map-view";
import { parseGeojson, pointsFromVector, linesFromVector, polygonsFromVector } from "@/lib/map/geojson";

type TrackLayer = {
  source_path?: string;
  role?: string;
  role_reviewed?: boolean;
  crs?: string;
  crs_source?: string;
  crs_confidence?: string;
  source_format?: string;
  encoding?: string;
  geometry_types?: string[];
  attribute_names?: string[];
};

type CatalogRow = {
  relativePath: string;
  filename: string;
  supportStatus: string;
  formatId: string;
  adapterId: string;
  crs: string | null;
  crsSource?: string | null;
  crsConfidence?: string | null;
  encoding?: string | null;
  encodingSource?: string | null;
  vectorRole?: { role?: string; reviewed?: boolean; source?: string };
  geometryTypes?: string[];
  attributeNames?: string[];
  parseErrors?: string[];
  shapefileSidecars?: { shp?: boolean; shx?: boolean; dbf?: boolean; prj?: boolean; cpg?: boolean };
};

type Pack = {
  runId: string;
  planHash: string;
  geojson: string | null;
  tracks: { layers?: TrackLayer[] } | null;
  ingestQc: Record<string, unknown> | null;
  overlap: {
    rows?: Array<Record<string, string>>;
    blocked?: Array<{ reason?: string }>;
    crs_decisions?: Array<Record<string, string>>;
  } | null;
  overlapQc: { skipped?: boolean; reason?: string; message?: string } | null;
  interpretation: {
    not_established?: string[];
    observations?: string[];
    assumptions?: string[];
    geological_certainty_improved?: boolean;
  } | null;
  exportMeta?: { shapefile?: boolean; geopackage?: boolean; format?: string } | null;
  bboxHits?: Array<{ reason: string; relation: string }>;
};

type Payload = {
  catalog: { root: string; parser: string; records: CatalogRow[] };
  points: Pack;
  lines: Pack;
  polygons: Pack;
  blocked: Pack;
  conflict: Pack;
  overlap: Pack;
  interpretation: Pack;
};

type Tab = "catalog" | "points" | "lines" | "polygons" | "blocked" | "conflict" | "overlap" | "interpretation";

function MapPack({ pack, title }: { pack: Pack; title: string }) {
  const vector = useMemo(() => (pack.geojson ? parseGeojson(pack.geojson) : null), [pack.geojson]);
  const layers = pack.tracks?.layers || [];
  const layer = layers[0];
  if (!vector) {
    return (
      <p className="p-4 text-amber-300" data-testid="map-missing">
        Shapefile was not mapped. Incomplete, corrupt, or undocumented CRS datasets stay recognised-unsupported.
      </p>
    );
  }
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
          crsLabel={`${layer?.crs || vector.crs.label} (${layer?.crs_source || "unknown"}, ${layer?.crs_confidence || "n/a"})`}
          warnings={[
            "This layer is source geometry and attributes. It is not an AI-confirmed geological interpretation.",
            "Attribute names have unknown semantics. UNIT/LITHOLOGY/geology.shp do not establish geology.",
            `CRS source is ${layer?.crs_source || "unknown"} with confidence ${layer?.crs_confidence || "n/a"}. Coordinates were not reprojected.`,
            "Spatial overlap is geometric coincidence, not a joint interpretation.",
          ]}
        />
      </div>
      <div className="border-t border-[#2b2b2b] px-3 py-2 text-[12px]" data-testid="vector-legend">
        {layers.map((item) => (
          <p key={item.source_path || item.role}>
            {item.source_path || "layer"} · format {item.source_format || "shapefile"} · Role:{" "}
            {item.role_reviewed ? `${item.role} (user-assigned)` : "unassigned generic vector"} · CRS: {item.crs || "undocumented"} ·
            source {item.crs_source || "n/a"} · confidence {item.crs_confidence || "n/a"} · encoding {item.encoding || "undeclared"}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function VerifyShapefilePage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [tab, setTab] = useState<Tab>("catalog");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/verify/shapefile")
      .then((res) => res.json())
      .then((data: Payload) => setPayload(data))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) return <p className="p-6 text-red-300">{error}</p>;
  if (!payload) return <p className="p-6 text-[#cccccc]">Loading shapefile verification…</p>;

  const tabs: Tab[] = ["catalog", "points", "lines", "polygons", "blocked", "conflict", "overlap", "interpretation"];
  const geology = payload.catalog.records.find((row) => row.relativePath.includes("polygons/geology.shp"));

  return (
    <div className="h-screen flex flex-col bg-[#1e1e1e] text-[#cccccc]">
      <header className="px-4 py-3 border-b border-[#2b2b2b]">
        <h1 className="text-lg" data-testid="shp-title">
          Documented shapefile ingest (GIS vector extension)
        </h1>
        <p className="text-[12px] text-[#858585]" data-testid="shp-parser">
          Parser {payload.catalog.parser}. Shared gis.vector_* capabilities. GeoPackage remains recognised-unsupported.
        </p>
      </header>
      <nav className="flex flex-wrap gap-1 px-3 py-2 border-b border-[#2b2b2b]">
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`tab-${id}`}
            className={`px-2 py-1 text-[12px] rounded ${tab === id ? "bg-[#0e639c] text-white" : "bg-[#2a2d2e]"}`}
            onClick={() => setTab(id)}
          >
            {id}
          </button>
        ))}
      </nav>
      <main className="flex-1 min-h-0 overflow-auto">
        {tab === "catalog" ? (
          <div className="p-4 text-[13px]" data-testid="catalog-table">
            <p data-testid="geology-role">
              geology.shp role: {geology?.vectorRole?.role || "generic-vector"} (reviewed={String(geology?.vectorRole?.reviewed || false)})
            </p>
            <table className="w-full mt-2 text-left">
              <thead>
                <tr>
                  <th>path</th>
                  <th>support</th>
                  <th>CRS</th>
                  <th>source</th>
                  <th>confidence</th>
                </tr>
              </thead>
              <tbody>
                {payload.catalog.records
                  .filter((row) => row.formatId === "shapefile")
                  .map((row) => (
                    <tr key={row.relativePath} data-testid={`row-${row.relativePath}`}>
                      <td>{row.relativePath}</td>
                      <td>{row.supportStatus}</td>
                      <td>{row.crs || "—"}</td>
                      <td>{row.crsSource || "—"}</td>
                      <td>{row.crsConfidence || "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {tab === "points" ? <MapPack pack={payload.points} title="Shapefile points" /> : null}
        {tab === "lines" ? <MapPack pack={payload.lines} title="Shapefile polylines" /> : null}
        {tab === "polygons" ? <MapPack pack={payload.polygons} title="Geology-style shapefile polygons" /> : null}
        {tab === "blocked" ? (
          <div className="p-4 text-[13px]" data-testid="blocked-panel">
            <p>Invalid shapefile datasets stay recognised-unsupported. Sidecar names alone are not ingest.</p>
            <pre className="mt-2 whitespace-pre-wrap text-[12px] text-amber-200">
              {JSON.stringify(payload.blocked.ingestQc, null, 2)}
            </pre>
          </div>
        ) : null}
        {tab === "conflict" ? (
          <div className="p-4 text-[13px]" data-testid="conflict-panel">
            <p>EPSG:32734 vs EPSG:4326. Overlap is blocked. Reprojection is not registered.</p>
            <pre className="mt-2 whitespace-pre-wrap text-[12px]">
              {JSON.stringify(payload.conflict.overlap?.blocked || payload.conflict.overlap, null, 2)}
            </pre>
          </div>
        ) : null}
        {tab === "overlap" ? (
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <MapPack pack={payload.overlap} title="Shapefile overlap (geometric coincidence)" />
            </div>
            <pre className="max-h-40 overflow-auto border-t border-[#2b2b2b] p-3 text-[12px]" data-testid="overlap-rows">
              {JSON.stringify(payload.overlap.overlap?.rows || [], null, 2)}
            </pre>
          </div>
        ) : null}
        {tab === "interpretation" ? (
          <div className="p-4 text-[13px]" data-testid="interpretation-panel">
            <p data-testid="certainty">
              geological_certainty_improved={String(payload.interpretation.interpretation?.geological_certainty_improved)}
            </p>
            <ul className="list-disc ml-5 mt-2">
              {(payload.interpretation.interpretation?.not_established || []).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="mt-3">Export writer shapefile={String(payload.overlap.exportMeta?.shapefile)} geopackage={String(payload.overlap.exportMeta?.geopackage)}</p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
