"use client";

import { useEffect, useMemo, useState } from "react";
import { GridMapView } from "@/components/workspace/grid-map-view";
import type { RasterGrid } from "@/lib/map/types";
import { rasterProductWarnings } from "@/lib/raster-product";

type CatalogRow = {
  id: string;
  relativePath: string;
  filename: string;
  supportStatus: string;
  formatId: string;
  adapterId: string;
  crs: string | null;
  units: string | null;
  ncols: number | null;
  nrows: number | null;
  nodata: number | null;
  compression: string | null;
  rasterLayout: string | null;
  previewRequired: boolean;
  pixelsDecodable: boolean | null;
  elevationDatum: string | null;
  bandCount?: number | null;
};

type Pack = {
  runId: string;
  inspectQc: Record<string, unknown> | null;
  tracks: Record<string, unknown> | null;
  terrain: Record<string, unknown> | null;
  terrainMeta: Record<string, unknown> | null;
};

type GridPayload = {
  ncols: number;
  nrows: number;
  values: number[];
  nodata: number;
  xllcorner: number;
  yllcorner: number;
  cellsize: number;
};

type Payload = {
  catalog: { records: CatalogRow[] };
  geotiffGrid: GridPayload | null;
  asciiGrid: GridPayload | null;
  demGrid: GridPayload | null;
  overlayConflict: { allowed: boolean; code: string; message: string };
  overlayMissing: { allowed: boolean; code: string; message: string };
  geotiff: Pack;
  ascii: Pack;
  dem: Pack;
  compressed: Pack;
  cog: Pack;
  huge: Pack;
  missingCrs: Pack;
  conflict: Pack;
  filenameDem: Pack;
};

type Tab = "catalog" | "geotiff" | "ascii" | "terrain" | "limits";

function toGrid(raw: GridPayload | null): RasterGrid | null {
  if (!raw) return null;
  return {
    ncols: raw.ncols,
    nrows: raw.nrows,
    xllcorner: raw.xllcorner,
    yllcorner: raw.yllcorner,
    cellsize: raw.cellsize,
    nodata: raw.nodata,
    values: Float64Array.from(raw.values),
  };
}

export default function RasterVerifyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("catalog");
  const [opacity, setOpacity] = useState(0.85);
  const [sample, setSample] = useState("Click the map to sample a cell. Nodata cells stay excluded from the legend stretch.");

  useEffect(() => {
    void fetch("/api/verify/raster")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  const geotiff = useMemo(() => toGrid(data?.geotiffGrid || null), [data]);
  const ascii = useMemo(() => toGrid(data?.asciiGrid || null), [data]);
  const dem = useMemo(() => toGrid(data?.demGrid || null), [data]);

  if (error) return <p className="p-6 text-sm text-red-300">Verification fixtures failed to load: {error}</p>;
  if (!data) return <p className="p-6 text-sm text-[#858585]">Loading raster verification fixtures…</p>;

  const geotiffWarnings = rasterProductWarnings({
    formatId: "geotiff",
    crs: "EPSG:32630",
    crsSource: "geotiff-geokeys",
    nodata: geotiff?.nodata,
    nodataPresent: geotiff?.nodata != null,
    pixelsDecodable: true,
  });
  const asciiWarnings = rasterProductWarnings({
    formatId: "esri-ascii-grid",
    crs: "EPSG:32630",
    crsSource: "epsg-comment",
    nodata: ascii?.nodata,
    nodataPresent: ascii?.nodata != null,
    pixelsDecodable: true,
  });
  const terrainWarnings = rasterProductWarnings({
    formatId: "dem-ascii",
    crs: "EPSG:32630",
    crsSource: "epsg-comment",
    nodata: dem?.nodata,
    nodataPresent: dem?.nodata != null,
    pixelsDecodable: true,
    terrain: true,
  });

  return (
    <main className="h-screen bg-[#1e1e1e] text-[#cccccc] flex flex-col">
      <header className="px-4 py-3 border-b border-[#2b2b2b]">
        <p className="text-[10px] uppercase tracking-wide text-[#858585]">Desktop verification</p>
        <h1 className="text-sm font-medium">G-AID raster and terrain interoperability</h1>
        <p className="text-[11px] text-[#9d9d9d] mt-1">
          Metadata-first catalog. Same GridMapView as the workspace. No silent reprojection, registered hillshade, or raster algebra.
        </p>
      </header>
      <nav className="flex gap-1 px-3 py-2 border-b border-[#2b2b2b] text-[12px] flex-wrap">
        {(["catalog", "geotiff", "ascii", "terrain", "limits"] as Tab[]).map((id) => (
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
      <div className="flex-1 min-h-0 overflow-auto p-3 text-[12px]">
        {tab === "catalog" ? (
          <table className="w-full text-left border-collapse" data-testid="raster-catalog">
            <thead>
              <tr className="text-[#858585]">
                <th className="p-1">file</th>
                <th className="p-1">format</th>
                <th className="p-1">status</th>
                <th className="p-1">CRS</th>
                <th className="p-1">layout</th>
                <th className="p-1">nodata</th>
                <th className="p-1">pixels</th>
              </tr>
            </thead>
            <tbody>
              {data.catalog.records.map((row) => (
                <tr key={row.id} className="border-t border-[#2b2b2b]" data-testid={`row-${row.relativePath}`}>
                  <td className="p-1">{row.relativePath}</td>
                  <td className="p-1">{row.formatId}</td>
                  <td className="p-1">{row.supportStatus}</td>
                  <td className="p-1">{row.crs || "undocumented"}</td>
                  <td className="p-1">{row.rasterLayout || row.compression || "—"}</td>
                  <td className="p-1">{row.nodata ?? "—"}</td>
                  <td className="p-1">
                    {row.previewRequired ? "preview-limit" : row.pixelsDecodable === false ? "not-decoded" : row.pixelsDecodable ? "decodable" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {tab === "geotiff" && geotiff ? (
          <div className="h-[560px] flex flex-col gap-2">
            <label className="text-[#9d9d9d]">
              Opacity {opacity.toFixed(2)}
              <input
                className="ml-2 align-middle"
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                data-testid="geotiff-opacity"
              />
            </label>
            <p className="text-[#9d9d9d]" data-testid="geotiff-sample">
              {sample}
            </p>
            <div className="flex-1 min-h-0">
              <GridMapView
                title="Raster layer (GeoTIFF source values)"
                grid={geotiff}
                units="metres"
                opacity={opacity}
                crsLabel="EPSG:32630"
                warnings={geotiffWarnings}
                onInspect={(hit) =>
                  setSample(
                    hit.nodata
                      ? `Sample nodata at ${hit.x.toFixed(1)}, ${hit.y.toFixed(1)}`
                      : `Sample ${hit.value} at ${hit.x.toFixed(1)}, ${hit.y.toFixed(1)}`
                  )
                }
              />
            </div>
            <p data-testid="geotiff-qc">{JSON.stringify(data.geotiff.inspectQc?.reprojected)}</p>
          </div>
        ) : null}
        {tab === "ascii" && ascii ? (
          <div className="h-[560px] flex flex-col gap-2">
            <div className="flex-1 min-h-0">
              <GridMapView
                title="Raster layer (ESRI ASCII source values)"
                grid={ascii}
                units="m"
                opacity={opacity}
                crsLabel="EPSG:32630"
                warnings={asciiWarnings}
              />
            </div>
          </div>
        ) : null}
        {tab === "terrain" ? (
          <div className="h-[560px] flex flex-col gap-2">
            <p data-testid="terrain-hillshade">{String((data.dem.terrain as { hillshade?: boolean } | null)?.hillshade)}</p>
            <p data-testid="filename-dem">{JSON.stringify(data.filenameDem.terrainMeta)}</p>
            {dem ? (
              <div className="flex-1 min-h-0">
                <GridMapView
                  title="Terrain layer (documented DEM ASCII; source elevations, not a derivative)"
                  grid={dem}
                  units="m"
                  opacity={opacity}
                  crsLabel="EPSG:32630"
                  warnings={terrainWarnings}
                />
              </div>
            ) : (
              <p>Documented DEM ASCII grid was not decoded.</p>
            )}
          </div>
        ) : null}
        {tab === "limits" ? (
          <div className="space-y-2 text-[#9d9d9d]" data-testid="raster-limits">
            <p>Compressed pixels loaded: {String((data.compressed.inspectQc as { layers?: Array<{ pixels_decodable?: boolean }> } | null)?.layers?.[0]?.pixels_decodable)}</p>
            <p>COG layout: {String((data.cog.inspectQc as { layers?: Array<{ layout?: string }> } | null)?.layers?.[0]?.layout)}</p>
            <p>Huge preview: {String((data.huge.inspectQc as { layers?: Array<{ preview_required?: boolean }> } | null)?.layers?.[0]?.preview_required)}</p>
            <p>Missing CRS overlay: {data.overlayMissing.code}</p>
            <p>CRS conflict overlay: {data.overlayConflict.code} — {data.overlayConflict.message}</p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
