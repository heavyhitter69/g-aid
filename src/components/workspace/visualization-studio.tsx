"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { GridMapView, parseEsriAscii } from "@/components/workspace/grid-map-view";
import { folderOf } from "@/lib/job-results";
import { companionAsciiPath } from "@/lib/survey-file-kinds";
import {
  buildMapLayers,
  compareRunLayers,
  crsFromPrj,
  linesFromVector,
  overlayDecision,
  parseGeojson,
  pointsFromVector,
  provenanceLabel,
  runIdFromPath,
  sampleProfile,
  selectLayerById,
  selectLayerByPath,
  type CrsInfo,
  type MapLayerSpec,
  type ProfileResult,
  type RasterGrid,
} from "@/lib/map";
import { cn } from "@/lib/utils";

interface LayerUiState {
  visible: boolean;
  opacity: number;
}

function originBadge(origin: MapLayerSpec["origin"]): string {
  if (origin === "derived-run") return "run product";
  if (origin === "source") return "source";
  if (origin === "preview") return "preview";
  return "unsupported";
}

function comparePathsFor(files: string[], compareRunId: string): string[] {
  return files.map((file) => {
    const name = file.replace(/\\/g, "/").split("/").pop();
    return name ? `G-AID Output/runs/${compareRunId}/${name}` : "";
  }).filter(Boolean);
}

export function VisualizationStudio() {
  const {
    lastJobResults,
    projectFiles,
    fileContents,
    setFileContent,
    workspaceRoot,
    projectCatalog,
    mapFocus,
    compareRunId,
    setCompareRunId,
  } = useAppStore();
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [ui, setUi] = useState<Record<string, LayerUiState>>({});
  const [layerOrder, setLayerOrder] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [inspect, setInspect] = useState<string>("");

  const allPaths = useMemo(() => {
    const fromProject = projectFiles.map((f) => (f.path || f.id).replace(/\\/g, "/"));
    const fromJob = lastJobResults?.files || [];
    const extra = compareRunId ? comparePathsFor(fromJob, compareRunId) : [];
    return [...new Set([...fromProject, ...fromJob, ...extra])];
  }, [projectFiles, lastJobResults, compareRunId]);

  const layers = useMemo(
    () => buildMapLayers({ catalog: projectCatalog, files: allPaths }),
    [projectCatalog, allPaths]
  );

  useEffect(() => {
    setLayerOrder((current) => {
      const ids = layers.map((layer) => layer.id);
      const kept = current.filter((id) => ids.includes(id));
      const missing = ids.filter((id) => !kept.includes(id));
      return [...kept, ...missing];
    });
  }, [layers]);

  const orderedLayers = useMemo(() => {
    const byId = new Map(layers.map((layer) => [layer.id, layer]));
    const ordered = layerOrder
      .map((id) => byId.get(id))
      .filter((layer): layer is MapLayerSpec => Boolean(layer));
    for (const layer of layers) {
      if (!ordered.some((item) => item.id === layer.id)) ordered.push(layer);
    }
    return ordered;
  }, [layers, layerOrder]);

  const viewable = orderedLayers.filter((layer) => layer.displayStatus === "viewable");
  const runIds = [...new Set(viewable.map((layer) => layer.runId).filter(Boolean))] as string[];

  useEffect(() => {
    setUi((current) => {
      const next = { ...current };
      for (const layer of layers) {
        if (!next[layer.id]) next[layer.id] = { visible: layer.displayStatus === "viewable", opacity: 1 };
      }
      return next;
    });
  }, [layers]);

  useEffect(() => {
    if (mapFocus?.catalogId || mapFocus?.artifactId || mapFocus?.path) {
      const hit =
        (mapFocus.catalogId && selectLayerById(layers, mapFocus.catalogId)) ||
        (mapFocus.artifactId && selectLayerById(layers, mapFocus.artifactId)) ||
        (mapFocus.path && selectLayerByPath(layers, mapFocus.path));
      if (hit) {
        setActiveLayerId(hit.id);
        setUi((current) => ({ ...current, [hit.id]: { visible: true, opacity: current[hit.id]?.opacity ?? 1 } }));
        return;
      }
    }
    if (!viewable.length) {
      setActiveLayerId(null);
      return;
    }
    const preferred = lastJobResults?.activeLayerId;
    setActiveLayerId((current) => {
      if (preferred) {
        const match = selectLayerByPath(layers, preferred) || selectLayerById(layers, preferred);
        if (match) return match.id;
      }
      if (current && layers.some((layer) => layer.id === current)) return current;
      return viewable[0].id;
    });
  }, [layers, lastJobResults?.activeLayerId, mapFocus, viewable]);

  const active = layers.find((layer) => layer.id === activeLayerId) || null;
  const leftRunId =
    runIdFromPath(lastJobResults?.productsRel || "") || lastJobResults?.runId || lastJobResults?.taskFolder || "";
  const compareLayers =
    compareRunId && leftRunId
      ? compareRunLayers(layers, leftRunId, compareRunId, projectCatalog?.runs)
      : null;

  useEffect(() => {
    if (!active || !workspaceRoot || !window.gaidDesktop?.readWorkspaceFile) return;
    if (fileContents[active.path] !== undefined) return;
    let cancelled = false;
    setLoading(true);
    void window.gaidDesktop
      .readWorkspaceFile(workspaceRoot, active.path)
      .then((result) => {
        if (cancelled) return;
        const text = result?.text || "";
        if (text) {
          setFileContent(active.path, text);
          return;
        }
        const companion = companionAsciiPath(active.path);
        if (companion && companion !== active.path) {
          return window.gaidDesktop
            ?.readWorkspaceFile(workspaceRoot, companion)
            .then((ascii) => {
              if (cancelled) return;
              setFileContent(active.path, ascii?.text || "");
            });
        }
        setFileContent(active.path, "");
      })
      .catch(() => {
        if (!cancelled) setFileContent(active.path, "");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, workspaceRoot, fileContents, setFileContent]);

  const text = active ? fileContents[active.path] : undefined;
  const raster: RasterGrid | null = useMemo(() => {
    if (!active || !text) return null;
    if (active.formatId === "geojson") return null;
    return parseEsriAscii(text);
  }, [active, text]);
  const vector = useMemo(() => {
    if (!active || !text || active.formatId !== "geojson") return null;
    return parseGeojson(text);
  }, [active, text]);

  const [prjCrs, setPrjCrs] = useState<string>("");
  useEffect(() => {
    const desktop = window.gaidDesktop;
    if (!workspaceRoot || !desktop?.readWorkspaceFile || !active) {
      setPrjCrs("");
      return;
    }
    const prj = active.path.replace(/\.(tif|tiff|asc|grd|npz|npy|geojson)$/i, ".prj");
    let cancelled = false;
    void desktop.readWorkspaceFile(workspaceRoot, prj).then((file) => {
      if (!cancelled) setPrjCrs(file?.text || "");
    }).catch(() => {
      if (!cancelled) setPrjCrs("");
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceRoot, active]);

  const activeCrs = prjCrs ? crsFromPrj(prjCrs) : active?.crs || vector?.crs;
  const overlayLayer = viewable.find(
    (layer) =>
      layer.id !== active?.id &&
      layer.formatId === "geojson" &&
      ui[layer.id]?.visible &&
      (layer.origin === "derived-run" || layer.path.toLowerCase().includes("flight_path"))
  );

  const [overlayPrj, setOverlayPrj] = useState<string>("");
  const [overlayParsedCrs, setOverlayParsedCrs] = useState<CrsInfo | undefined>(undefined);
  const [overlayPts, setOverlayPts] = useState<{ x: number; y: number }[]>([]);
  const [overlayLines, setOverlayLines] = useState<{ x: number; y: number }[][]>([]);
  useEffect(() => {
    const desktop = window.gaidDesktop;
    if (!overlayLayer || !workspaceRoot || !desktop?.readWorkspaceFile) {
      setOverlayPrj("");
      setOverlayParsedCrs(undefined);
      setOverlayPts([]);
      setOverlayLines([]);
      return;
    }
    const prj = overlayLayer.path.replace(/\.(geojson)$/i, ".prj");
    let cancelled = false;
    void Promise.all([
      desktop.readWorkspaceFile(workspaceRoot, overlayLayer.path),
      desktop.readWorkspaceFile(workspaceRoot, prj).catch(() => ({ text: "" })),
    ]).then(([file, prjFile]) => {
      if (cancelled) return;
      const parsed = file?.text ? parseGeojson(file.text) : null;
      setOverlayPrj(prjFile?.text || "");
      setOverlayParsedCrs(parsed?.crs);
      setOverlayPts(parsed ? pointsFromVector(parsed.data) : []);
      setOverlayLines(parsed ? linesFromVector(parsed.data) : []);
    }).catch(() => {
      if (!cancelled) {
        setOverlayPrj("");
        setOverlayParsedCrs(undefined);
        setOverlayPts([]);
        setOverlayLines([]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [overlayLayer, workspaceRoot]);

  const overlayCrs: CrsInfo | undefined = overlayPrj
    ? crsFromPrj(overlayPrj)
    : overlayLayer?.crs || overlayParsedCrs;
  const overlayDecisionResult = overlayLayer ? overlayDecision(activeCrs, overlayCrs) : null;
  const overlayAllowed = Boolean(overlayDecisionResult?.allowed);

  const geojsonExtentNote =
    active?.formatId === "geojson"
      ? "GeoJSON is drawn as vector overlay on a placeholder extent grid, not as elevation or a DEM."
      : "";
  const warnings = [
    overlayDecisionResult && !overlayDecisionResult.allowed ? overlayDecisionResult.message : "",
    active?.reason && active.displayStatus !== "viewable" ? active.reason : "",
    raster?.previewNote,
    vector?.data.previewNote,
    geojsonExtentNote,
    raster?.preview || vector?.data.preview ? "This view is a preview/overview — not the full dataset." : "",
    "A visual overlay does not prove geological, mineral, or geophysical causation.",
  ].filter(Boolean);

  const units =
    active?.formatId === "dem-ascii" || /dem/i.test(active?.path || "")
      ? "m"
      : activeCrs?.units === "degrees"
        ? "degrees"
        : active?.units || (active?.formatId === "geojson" ? "coordinate" : "nT");

  function moveLayer(id: string, dir: -1 | 1) {
    setLayerOrder((current) => {
      const ids = current.length ? current : layers.map((layer) => layer.id);
      const i = ids.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ids.length) return ids;
      const next = ids.slice();
      const a = next[i];
      next[i] = next[j];
      next[j] = a;
      return next;
    });
  }

  function showCompareMatch(layer: MapLayerSpec) {
    const match = compareLayers?.matched.find((item) => item.left.id === layer.id || item.right.id === layer.id);
    if (!match) return;
    const other = match.left.id === layer.id ? match.right : match.left;
    setActiveLayerId(other.id);
    setUi((current) => ({
      ...current,
      [other.id]: { visible: true, opacity: current[layer.id]?.opacity ?? 0.55 },
    }));
  }

  if (!layers.length) {
    return (
      <section className="h-full flex flex-col items-center justify-center gap-2 p-8 text-[#858585]">
        <Layers className="h-8 w-8" />
        <h2 className="text-lg font-semibold text-[#cccccc]">Map workspace</h2>
        <p className="text-sm max-w-md text-center">
          Catalog GeoJSON/DEM/ASCII records and completed magnetic run products appear here. Shapefile, LAS/LAZ, and SEG-Y are not decoded.
        </p>
      </section>
    );
  }

  return (
    <section className="h-full flex min-h-0">
      <aside className="w-[240px] shrink-0 border-r border-[#2b2b2b] bg-[#181818] flex flex-col">
        <header className="px-3 py-2 border-b border-[#2b2b2b]">
          <p className="text-[10px] uppercase tracking-wide text-[#858585]">Map workspace</p>
          <p className="text-[12px] text-[#cccccc] font-medium leading-snug">
            {lastJobResults?.taskFolder || "Catalog + runs"}
          </p>
        </header>
        {runIds.length > 0 ? (
          <div className="px-3 py-2 border-b border-[#2b2b2b]">
            <p className="text-[10px] uppercase tracking-wide text-[#858585] mb-1">Compare run</p>
            <select
              value={compareRunId || ""}
              onChange={(e) => setCompareRunId(e.target.value || null)}
              className="w-full bg-[#2a2d2e] border border-[#3c3c3c] rounded px-1.5 py-1 text-[11px] text-[#cccccc]"
            >
              <option value="">None</option>
              {runIds
                .filter((id) => id !== (active?.runId || leftRunId))
                .map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
            </select>
            {compareLayers?.warnings[0] ? (
              <p className="text-[10px] text-[#f0c674] mt-1 leading-snug">{compareLayers.warnings[0]}</p>
            ) : null}
            <p className="text-[10px] text-[#6a6a6a] mt-1 leading-snug">
              Comparison is layer switching between versioned artifacts, not a blended proof overlay.
            </p>
          </div>
        ) : null}
        <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-[#858585]">Layers</div>
        <ul className="flex-1 overflow-auto px-2 pb-2 space-y-1">
          {orderedLayers.map((layer, index) => {
            const activeRow = layer.id === activeLayerId;
            const state = ui[layer.id] || { visible: layer.displayStatus === "viewable", opacity: 1 };
            const comparePair = compareLayers?.matched.find(
              (item) => item.left.id === layer.id || item.right.id === layer.id
            );
            return (
              <li
                key={layer.id}
                className={cn("rounded px-2 py-1.5", activeRow ? "bg-[#094771]" : "hover:bg-[#2a2d2e]")}
              >
                <button
                  type="button"
                  onClick={() => setActiveLayerId(layer.id)}
                  className="w-full text-left"
                  title={layer.path}
                >
                  <div className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={state.visible}
                      onChange={(e) =>
                        setUi((current) => ({
                          ...current,
                          [layer.id]: { ...state, visible: e.target.checked },
                        }))
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="text-[12px] text-[#cccccc] truncate flex-1">{layer.label}</span>
                  </div>
                  <div className="text-[10px] text-[#858585] pl-5 leading-snug">
                    {originBadge(layer.origin)} · {layer.displayStatus}
                    {layer.supportStatus ? ` · ${layer.supportStatus}` : ""}
                  </div>
                  <div className="text-[10px] text-[#6a6a6a] pl-5 truncate">{provenanceLabel(layer)}</div>
                </button>
                {activeRow ? (
                  <div className="pl-5 pt-1 flex items-center gap-2 flex-wrap">
                    <input
                      type="range"
                      min={15}
                      max={100}
                      value={Math.round(state.opacity * 100)}
                      onChange={(e) =>
                        setUi((current) => ({
                          ...current,
                          [layer.id]: { ...state, opacity: Number(e.target.value) / 100 },
                        }))
                      }
                    />
                    <button type="button" className="text-[10px] text-[#858585]" onClick={() => moveLayer(layer.id, -1)} disabled={index === 0}>
                      up
                    </button>
                    <button type="button" className="text-[10px] text-[#858585]" onClick={() => moveLayer(layer.id, 1)} disabled={index === orderedLayers.length - 1}>
                      down
                    </button>
                    {comparePair ? (
                      <button type="button" className="text-[10px] text-[#4ec9b0]" onClick={() => showCompareMatch(layer)}>
                        other run
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <p className="px-3 py-2 text-[10px] text-[#6a6a6a] leading-snug border-t border-[#2b2b2b]">
          Display is not processing. Shapefile, LAS/LAZ, FileGDB, and SEG-Y stay undecoded.
        </p>
      </aside>
      <div className="flex-1 min-w-0 min-h-0 relative flex flex-col">
        {loading && text === undefined ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#1e1e1e]/80 text-[#858585] gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-[#007acc]" />
            <span className="text-xs">Loading {active?.label}…</span>
          </div>
        ) : null}
        {active?.formatId === "geojson" && vector ? (
          <GridMapView
            title={active.label}
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
            overlayLines={linesFromVector(vector.data)}
            units={units}
            warnings={warnings}
            crsLabel={activeCrs?.label}
            opacity={ui[active.id]?.opacity ?? 1}
          />
        ) : (
          <GridMapView
            title={active?.label || folderOf(active?.path || "") || "Map"}
            grid={raster}
            overlay={overlayAllowed ? overlayPts : []}
            overlayLines={overlayAllowed ? overlayLines : []}
            units={units}
            warnings={warnings}
            crsLabel={activeCrs?.label}
            opacity={ui[active?.id || ""]?.opacity ?? 1}
            note={
              raster
                ? undefined
                : active && fileContents[active.path] === undefined
                  ? "Loading grid…"
                  : active?.reason || "Could not decode this raster. G-AID reads ESRI ASCII, uncompressed G-AID GeoTIFF, or a companion .asc."
            }
            onInspect={(hit) => {
              setInspect(
                hit.nodata
                  ? `${hit.x.toFixed(2)}, ${hit.y.toFixed(2)} nodata`
                  : `${hit.x.toFixed(2)}, ${hit.y.toFixed(2)} = ${hit.value?.toFixed(3)} ${units}`
              );
            }}
            onProfile={(a, b) => {
              if (!raster || !active) return;
              setProfile(
                sampleProfile(raster, a, b, {
                  id: active.id,
                  path: active.path,
                  units,
                  crs: activeCrs,
                })
              );
            }}
          />
        )}
        <div className="px-3 py-1.5 border-t border-[#2b2b2b] text-[11px] text-[#858585] bg-[#181818]">
          {inspect || (active ? provenanceLabel(active) : "")}
          {profile ? (
            <div className="mt-1 font-mono text-[10px] text-[#cccccc]">
              Profile {profile.sourcePath}: {profile.interpolation}, {profile.units}, {profile.crs?.label || "CRS unknown"}, {profile.representation}
              {" · "}
              {profile.samples.filter((s) => !s.nodata).length} samples
            </div>
          ) : null}
          {compareLayers?.matched[0] ? (
            <div className="mt-1 text-[10px]">
              Compare match: {compareLayers.matched[0].left.path} ↔ {compareLayers.matched[0].right.path}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
