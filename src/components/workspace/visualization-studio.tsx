"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { GridMapView, extractLineStrings, extractLonLat, parseEsriAscii } from "@/components/workspace/grid-map-view";
import { folderOf, layerLabel, rasterLayersFromPaths } from "@/lib/job-results";
import { companionAsciiPath } from "@/lib/survey-file-kinds";
import { epsgZone, looksLonLat, utmZoneFromLon, wgs84ToUtm } from "@/lib/wgs84-utm";
import { cn } from "@/lib/utils";

export function VisualizationStudio() {
  const {
    lastJobResults,
    projectFiles,
    fileContents,
    setFileContent,
    workspaceRoot,
  } = useAppStore();
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<{ x: number; y: number }[]>([]);
  const [overlayLines, setOverlayLines] = useState<{ x: number; y: number }[][]>([]);
  const [loading, setLoading] = useState(false);

  const jobPaths = useMemo(() => {
    if (lastJobResults?.files?.length) return lastJobResults.files;
    const prefix = lastJobResults?.productsRel;
    if (prefix) {
      return projectFiles
        .map((f) => (f.path || f.id).replace(/\\/g, "/"))
        .filter((p) => p === prefix || p.startsWith(`${prefix}/`));
    }
    return projectFiles
      .map((f) => (f.path || f.id).replace(/\\/g, "/"))
      .filter((p) => /g-aid output/i.test(p));
  }, [lastJobResults, projectFiles]);

  const layers = useMemo(() => rasterLayersFromPaths(jobPaths), [jobPaths]);
  const jobTitle = lastJobResults?.taskFolder || folderOf(layers[0]?.id || "") || "Results";

  useEffect(() => {
    if (!layers.length) {
      setActiveLayerId(null);
      return;
    }
    const preferred = lastJobResults?.activeLayerId;
    setActiveLayerId((current) => {
      if (preferred) {
        const match = layers.find(
          (layer) => layer.id === preferred || layer.id.replace(/\\/g, "/") === preferred.replace(/\\/g, "/")
        );
        if (match) return match.id;
      }
      if (current && layers.some((layer) => layer.id === current)) return current;
      return layers[0].id;
    });
  }, [layers, lastJobResults?.activeLayerId]);

  useEffect(() => {
    if (!activeLayerId || !workspaceRoot || !window.gaidDesktop?.readWorkspaceFile) return;
    if (fileContents[activeLayerId] !== undefined) return;
    let cancelled = false;
    setLoading(true);
    void window.gaidDesktop
      .readWorkspaceFile(workspaceRoot, activeLayerId)
      .then((result) => {
        if (cancelled) return;
        const text = result?.text || "";
        if (text) {
          setFileContent(activeLayerId, text);
          return;
        }
        const companion = companionAsciiPath(activeLayerId);
        if (companion && companion !== activeLayerId) {
          return window.gaidDesktop
            ?.readWorkspaceFile(workspaceRoot, companion)
            .then((ascii) => {
              if (cancelled) return;
              setFileContent(activeLayerId, ascii?.text || "");
            });
        }
        setFileContent(activeLayerId, "");
      })
      .catch(() => {
        if (!cancelled) setFileContent(activeLayerId, "");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeLayerId, workspaceRoot, fileContents, setFileContent]);

  const gridText = activeLayerId ? fileContents[activeLayerId] : undefined;
  const grid = useMemo(() => (gridText ? parseEsriAscii(gridText) : null), [gridText]);
  const overlayDir = lastJobResults?.productsRel || (activeLayerId ? folderOf(activeLayerId) : "");
  const awaitingGrid = Boolean(activeLayerId && fileContents[activeLayerId] === undefined);

  useEffect(() => {
    const desktop = window.gaidDesktop;
    if (!workspaceRoot || !desktop?.readWorkspaceFile || !overlayDir || !grid) return;
    let cancelled = false;
    const flight = `${overlayDir}/flight_path.geojson`;
    const lineaments = `${overlayDir}/lineaments.geojson`;
    const prj = activeLayerId
      ? activeLayerId.replace(/\.(tif|tiff|asc|grd|npz|npy)$/i, ".prj")
      : `${overlayDir}/tmi_grid.prj`;
    (async () => {
      let epsg = 0;
      try {
        const prjFile = await desktop.readWorkspaceFile(workspaceRoot, prj);
        const hit = prjFile?.text?.match(/AUTHORITY\["EPSG","(\d+)"\]/g);
        const last = hit?.[hit.length - 1]?.match(/\d+/)?.[0];
        if (last) epsg = parseInt(last, 10);
      } catch {
        /* no prj */
      }
      try {
        const geo = await desktop.readWorkspaceFile(workspaceRoot, flight);
        if (cancelled) return;
        const pts = geo?.text ? extractLonLat(geo.text) : [];
        if (!pts.length) {
          setOverlay([]);
        } else {
          const sample = pts[0];
          if (looksLonLat(sample.x, sample.y) && Math.abs(grid.xllcorner) > 180) {
            const zone = epsgZone(epsg)?.zone ?? utmZoneFromLon(sample.x);
            setOverlay(
              pts.map((p) => {
                const { easting, northing } = wgs84ToUtm(p.x, p.y, zone);
                return { x: easting, y: northing };
              })
            );
          } else {
            setOverlay(pts);
          }
        }
      } catch {
        if (!cancelled) setOverlay([]);
      }
      try {
        const lin = await desktop.readWorkspaceFile(workspaceRoot, lineaments);
        if (!cancelled) setOverlayLines(lin?.text ? extractLineStrings(lin.text) : []);
      } catch {
        if (!cancelled) setOverlayLines([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceRoot, overlayDir, activeLayerId, grid]);

  if (!layers.length) {
    return (
      <section className="h-full flex flex-col items-center justify-center gap-2 p-8 text-[#858585]">
        <Layers className="h-8 w-8" />
        <h2 className="text-lg font-semibold text-[#cccccc]">Map</h2>
        <p className="text-sm max-w-md text-center">
          After Proceed, this view opens the job. Close the tab anytime — double-click the job folder under G-AID Output, or a TMI/RTP grid, to bring the map back.
        </p>
      </section>
    );
  }

  return (
    <section className="h-full flex min-h-0">
      <aside className="w-[200px] shrink-0 border-r border-[#2b2b2b] bg-[#181818] flex flex-col">
        <header className="px-3 py-2 border-b border-[#2b2b2b]">
          <p className="text-[10px] uppercase tracking-wide text-[#858585]">Job</p>
          <p className="text-[12px] text-[#cccccc] font-medium leading-snug truncate" title={jobTitle}>
            {jobTitle}
          </p>
        </header>
        <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-[#858585]">Layers</div>
        <ul className="flex-1 overflow-auto px-2 pb-2 space-y-0.5">
          {layers.map((layer) => {
            const active = layer.id === activeLayerId;
            return (
              <li key={layer.id}>
                <button
                  type="button"
                  onClick={() => setActiveLayerId(layer.id)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded text-[12px] truncate",
                    active
                      ? "bg-[#094771] text-white"
                      : "text-[#cccccc] hover:bg-[#2a2d2e]"
                  )}
                  title={layer.id}
                >
                  {layer.label}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="px-3 py-2 text-[10px] text-[#6a6a6a] leading-snug border-t border-[#2b2b2b]">
          Flight path and lineaments load as overlays. Close this tab and double-click the job folder in G-AID Output to open it again.
        </p>
      </aside>
      <div className="flex-1 min-w-0 min-h-0 relative">
        {loading && fileContents[activeLayerId || ""] === undefined ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#1e1e1e]/80 text-[#858585] gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-[#007acc]" />
            <span className="text-xs">Loading {layerLabel(activeLayerId || "")}…</span>
          </div>
        ) : null}
        <GridMapView
          title={activeLayerId ? layerLabel(activeLayerId) : jobTitle}
          grid={grid}
          overlay={overlay}
          overlayLines={overlayLines}
          note={
            grid
              ? undefined
              : awaitingGrid || loading
                ? "Loading grid…"
                : "Could not decode this raster."
          }
        />
      </div>
    </section>
  );
}
