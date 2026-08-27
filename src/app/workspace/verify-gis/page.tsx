"use client";

import { useEffect, useMemo, useState } from "react";
import { GridMapView } from "@/components/workspace/grid-map-view";
import { VECTOR_ROLES, type VectorRoleId } from "@/lib/catalog/geojson-contract";
import { parseGeojson, pointsFromVector, linesFromVector, polygonsFromVector } from "@/lib/map/geojson";

type TrackLayer = {
  source_path?: string;
  role?: string;
  role_reviewed?: boolean;
  crs?: string;
  crs_source?: string;
  geojson_contract?: string;
  axis_order?: string;
  coordinate_order?: string;
  geometry_types?: string[];
  attribute_names?: string[];
};

type CatalogRow = {
  id: string;
  relativePath: string;
  filename: string;
  supportStatus: string;
  formatId: string;
  adapterId: string;
  mediaClass: string;
  crs: string | null;
  crsSource?: string | null;
  geojsonContract?: string | null;
  axisOrder?: string | null;
  coordinateOrder?: string | null;
  locationQuality?: string;
  vectorRole?: { role?: string; reviewed?: boolean; source?: string };
  geometryTypes?: string[];
  attributeNames?: string[];
  parseErrors?: string[];
  shapefileSidecars?: { shp?: boolean; shx?: boolean; dbf?: boolean; prj?: boolean };
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
    uncertainty?: string[];
    recommendations?: string[];
    product_name?: string;
    geological_certainty_improved?: boolean;
  } | null;
  bboxHits?: Array<{ reason: string; relation: string }>;
};

type Payload = {
  catalog: { root: string; records: CatalogRow[] };
  points: Pack;
  lines: Pack;
  polygons: Pack;
  rfc7946: Pack;
  legacy: Pack;
  customImport: Pack;
  unknownCrs: Pack;
  conflict: Pack;
  compat: Pack;
  overlap: Pack;
  interpretation: Pack;
};
type Tab =
  | "catalog"
  | "points"
  | "lines"
  | "polygons"
  | "rfc7946"
  | "legacy"
  | "custom-import"
  | "undocumented"
  | "compat"
  | "conflict"
  | "overlap"
  | "interpretation";

const TAB_LABEL: Record<Tab, string> = {
  catalog: "catalog",
  points: "points",
  lines: "lines",
  polygons: "polygons",
  rfc7946: "RFC 7946 CRS84",
  legacy: "legacy-GeoJSON",
  "custom-import": "custom import",
  undocumented: "undocumented projected",
  compat: "CRS84 vs 4326",
  conflict: "Conflicting CRS",
  overlap: "overlap",
  interpretation: "interpretation",
};

function MapPack({ pack, title }: { pack: Pack; title: string }) {
  const vector = useMemo(() => (pack.geojson ? parseGeojson(pack.geojson) : null), [pack.geojson]);
  const layers = pack.tracks?.layers || [];
  const layer = layers[0];
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
            layers.some((item) => item.role_reviewed)
              ? "User-assigned roles are catalog labels, not geological confirmation."
              : "Layer purpose is unassigned. Geology/tenure/structure were not inferred from the filename.",
            layer?.crs === "OGC:CRS84"
              ? "OGC:CRS84 is WGS 84 longitude-latitude degrees. It is not EPSG:4326 and was not reprojected."
              : layer?.geojson_contract === "legacy-geojson"
                ? "legacy-GeoJSON: the crs member is not the RFC 7946 CRS mechanism."
                : layer?.geojson_contract === "g-aid-custom-import"
                  ? "G-AID custom import contract, not standard RFC 7946 GeoJSON."
                  : "Spatial overlap is geometric coincidence, not a joint interpretation.",
          ]}
        />
      </div>
      <div className="border-t border-[#2b2b2b] px-3 py-2 text-[12px]" data-testid="vector-legend">
        {layers.map((item) => (
          <p key={item.source_path || item.role}>
            {item.source_path || "layer"} · Role:{" "}
            {item.role_reviewed ? `${item.role} (user-assigned)` : "unassigned generic vector"} · CRS: {item.crs || "undocumented"} ·
            contract {item.geojson_contract || "n/a"} · axis {item.axis_order || "n/a"} · storage {item.coordinate_order || "n/a"} ·{" "}
            {(item.geometry_types || []).join(", ")} · attributes {(item.attribute_names || []).join(", ") || "none"} (unknown semantics)
          </p>
        ))}
      </div>
    </div>
  );
}

function CatalogTable({ records }: { records: CatalogRow[] }) {
  const [roles, setRoles] = useState<Record<string, { role: VectorRoleId; reviewed: boolean }>>({});
  return (
    <div className="h-full overflow-auto p-4" data-testid="gis-catalog">
      <p className="text-[12px] text-[#9d9d9d] mb-3">
        Catalog classification for the GIS fixture project. RFC 7946 GeoJSON with no crs member is documented OGC:CRS84.
        Filenames do not assign geology or mineral meaning. Role changes here are a reviewed catalog label only and are
        not persisted into the fixture folder.
      </p>
      <table className="w-full text-left border border-[#3c3c3c] text-[12px]">
        <thead className="bg-[#252526] text-[11px] uppercase tracking-wide text-[#858585]">
          <tr>
            <th className="px-2 py-1">File</th>
            <th className="px-2 py-1">Support</th>
            <th className="px-2 py-1">Format</th>
            <th className="px-2 py-1">CRS</th>
            <th className="px-2 py-1">Contract</th>
            <th className="px-2 py-1">Vector role</th>
            <th className="px-2 py-1">Notes</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const assigned = roles[record.id];
            const role = assigned?.role || record.vectorRole?.role || "generic-vector";
            const reviewed = assigned?.reviewed || Boolean(record.vectorRole?.reviewed);
            const sidecar = record.shapefileSidecars;
            return (
              <tr key={record.id} className="border-t border-[#3c3c3c]" data-testid={`catalog-row-${record.relativePath}`}>
                <td className="px-2 py-1 font-mono">{record.relativePath}</td>
                <td className="px-2 py-1" data-testid={`catalog-support-${record.relativePath}`}>
                  {record.supportStatus}
                </td>
                <td className="px-2 py-1">{record.formatId}</td>
                <td className="px-2 py-1" data-testid={`catalog-crs-${record.relativePath}`}>
                  {record.crs || "CRS not documented"}
                </td>
                <td className="px-2 py-1" data-testid={`catalog-contract-${record.relativePath}`}>
                  {record.geojsonContract || "—"}
                  {record.axisOrder ? ` · ${record.axisOrder}` : ""}
                  {record.coordinateOrder ? ` / ${record.coordinateOrder}` : ""}
                </td>
                <td className="px-2 py-1">
                  {record.adapterId === "geojson" ? (
                    <select
                      data-testid={`vector-role-${record.relativePath}`}
                      className="bg-[#2a2d2e] border border-[#3c3c3c] rounded px-1 py-0.5 max-w-[10rem]"
                      value={role}
                      onChange={(e) =>
                        setRoles((current) => ({
                          ...current,
                          [record.id]: { role: e.target.value as VectorRoleId, reviewed: true },
                        }))
                      }
                    >
                      {VECTOR_ROLES.map((id) => (
                        <option key={id} value={id}>
                          {id}
                          {reviewed && role === id ? " (reviewed)" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-2 py-1 text-[#f0c674]">
                  {sidecar
                    ? `sidecars shx=${String(sidecar.shx)} dbf=${String(sidecar.dbf)} prj=${String(sidecar.prj)}`
                    : null}{" "}
                  {(record.parseErrors || []).join(" ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function GisVerifyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("catalog");

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

  const tabs: Tab[] = [
    "catalog",
    "points",
    "lines",
    "polygons",
    "rfc7946",
    "legacy",
    "custom-import",
    "undocumented",
    "compat",
    "conflict",
    "overlap",
    "interpretation",
  ];

  return (
    <main className="h-screen bg-[#1e1e1e] text-[#cccccc] flex flex-col">
      <header className="px-4 py-3 border-b border-[#2b2b2b]">
        <p className="text-[10px] uppercase tracking-wide text-[#858585]">Desktop verification</p>
        <h1 className="text-sm font-medium">G-AID documented GeoJSON vector layer</h1>
        <p className="text-[11px] text-[#9d9d9d] mt-1">
          RFC 7946 is OGC:CRS84. Legacy crs and .prj / EPSG= are not RFC 7946. Overlay is not geological, mineral, or causal proof.
        </p>
      </header>
      <nav className="flex gap-1 px-3 py-2 border-b border-[#2b2b2b] text-[12px] flex-wrap">
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`tab-${id}`}
            onClick={() => setTab(id)}
            className={`px-2 py-1 rounded ${tab === id ? "bg-[#094771] text-white" : "text-[#858585]"}`}
          >
            {TAB_LABEL[id]}
          </button>
        ))}
      </nav>
      <div className="flex-1 min-h-0">
        {tab === "catalog" ? <CatalogTable records={data.catalog.records} /> : null}
        {tab === "points" ? <MapPack pack={data.points} title="Sample points (EPSG:32734)" /> : null}
        {tab === "lines" ? <MapPack pack={data.lines} title="Structure lines (filename is not a role)" /> : null}
        {tab === "polygons" ? <MapPack pack={data.polygons} title="Geology polygons (filename is not a role)" /> : null}
        {tab === "rfc7946" ? <MapPack pack={data.rfc7946} title="RFC 7946 GeoJSON (OGC:CRS84, no crs member)" /> : null}
        {tab === "legacy" ? <MapPack pack={data.legacy} title="legacy-GeoJSON with crs member EPSG:4326" /> : null}
        {tab === "custom-import" ? (
          <MapPack pack={data.customImport} title="G-AID custom import (.prj AUTHORITY EPSG:32734)" />
        ) : null}
        {tab === "undocumented" ? (
          <div className="p-4 text-[12px] space-y-2" data-testid="unknown-crs-skip">
            <p>
              Projected coordinates without a legacy crs mapping or G-AID custom import are not RFC 7946 OGC:CRS84.
              Overlay and overlap stay blocked. G-AID will not silently reproject.
            </p>
            <p data-testid="overlap-skipped">
              skipped={String(Boolean(data.unknownCrs.overlapQc?.skipped))} reason=
              {String(data.unknownCrs.overlapQc?.reason)}
            </p>
            <p data-testid="unknown-crs-message">{String(data.unknownCrs.overlapQc?.message || "")}</p>
            <p data-testid="undocumented-ingest">ingest_layers={String(data.unknownCrs.ingestQc?.n_layers ?? 0)}</p>
          </div>
        ) : null}
        {tab === "compat" ? (
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <MapPack pack={data.compat} title="OGC:CRS84 + EPSG:4326 GeoJSON lon-lat compatibility" />
            </div>
            <div className="border-t border-[#2b2b2b] px-3 py-2 text-[12px]" data-testid="crs84-compat">
              <p>
                OGC:CRS84 and EPSG:4326 are different CRS identities. Documented compatibility uses stored GeoJSON [lon,
                lat] without an axis swap or reprojection. Decision id: geojson-lonlat-no-axis-swap.
              </p>
              <ul>
                {(data.compat.overlap?.crs_decisions || []).map((row, index) => (
                  <li key={index} data-testid="compat-decision">
                    {row.left_crs} vs {row.right_crs} · {row.code} · {row.compatibility_decision || "none"}
                  </li>
                ))}
              </ul>
              <p className="text-[#858585]">Geometric overlap (not CRS identity, not a prospectivity map)</p>
              <ul>
                {(data.compat.overlap?.rows || []).map((row, index) => (
                  <li key={index}>
                    {row.relation}: {row.reason}
                  </li>
                ))}
              </ul>
            </div>
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
