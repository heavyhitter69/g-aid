"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { readRegisteredFile, hasRegisteredFile } from "@/lib/file-registry";
import { isTemporaryWorkspaceFile } from "@/lib/workspace-file-ids";
import { companionAsciiPath, fileExt, isBinaryMapFile, isImageFile, isNumpyFile } from "@/lib/survey-file-kinds";
import { CrsCard, GridMapView, JsonCard, NumpyCard, PointsMapView, extractLineStrings, extractLonLat, parseXyzPoints } from "@/components/workspace/grid-map-view";
import { parseEsriAscii } from "@/lib/map/ascii";
import { epsgZone, looksLonLat, utmZoneFromLon, wgs84ToUtm } from "@/lib/wgs84-utm";
import { FileText, Loader2, Copy, ChevronDown, Download } from "lucide-react";
import { TextEditor } from "@/components/workspace/text-editor";
import { SpreadsheetView } from "@/components/workspace/spreadsheet-view";
import { MarkdownViewer } from "@/components/workspace/markdown-viewer";
import { TEMP_PLAN_ID, TEMP_TASKS_ID } from "@/lib/workspace-file-ids";
import { validateEditorMarkdown } from "@/lib/plan-spec";

export function FileEditorView() {
  const { 
    activeFile, 
    setFileDirty,
    fileContents,
    setFileContent,
    currentProject,
    workspaceRoot,
  } = useAppStore();
  const [isFetchingContent, setIsFetchingContent] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [reviewText, setReviewText] = useState("");
  const [planPreview, setPlanPreview] = useState(false);
  const [mapOverlay, setMapOverlay] = useState<{ x: number; y: number }[]>([]);
  const [mapLines, setMapLines] = useState<{ x: number; y: number }[][]>([]);

  // Lazy-load file content when a tab is opened
  useEffect(() => {
    if (!activeFile) return;
    if (fileContents[activeFile] !== undefined) return; // already loaded
    if (isTemporaryWorkspaceFile(activeFile)) return;

    setIsFetchingContent(true);

    (async () => {
      const ext = fileExt(activeFile);
      const skipText = isBinaryMapFile(activeFile) || isImageFile(activeFile) || isNumpyFile(activeFile);

      if (hasRegisteredFile(activeFile) && !skipText) {
        const text = await readRegisteredFile(activeFile);
        if (text !== null) {
          setFileContent(activeFile, text);
          setIsFetchingContent(false);
          return;
        }
      }

      const root = useAppStore.getState().workspaceRoot;
      if (root && window.gaidDesktop?.readWorkspaceFile) {
        try {
          const companion = companionAsciiPath(activeFile);
          let result;
          try {
            result = await window.gaidDesktop.readWorkspaceFile(root, companion || activeFile);
          } catch {
            result = companion
              ? await window.gaidDesktop.readWorkspaceFile(root, activeFile)
              : null;
          }
          if (result?.media) {
            setFileContent(activeFile, result.media);
            setIsFetchingContent(false);
            return;
          }
          if (result?.text) {
            setFileContent(activeFile, result.text);
            setIsFetchingContent(false);
            return;
          }
          if (result?.binary) {
            setFileContent(activeFile, "");
            setIsFetchingContent(false);
            return;
          }
        } catch (err) {
          console.warn("Desktop workspace read failed:", err);
        }
      }

      if (skipText || ext === "xlsx") {
        setFileContent(activeFile, "");
        setIsFetchingContent(false);
        return;
      }

      // 2. Try Supabase Storage (for files uploaded by authenticated users) or local server
      const fileEntry = useAppStore.getState().projectFiles.find(
        (f) => f.id === activeFile
      );
      if (fileEntry && fileEntry.path) {
        if (!fileEntry.path.startsWith("/local/")) {
           try {
             const res = await fetch(fileEntry.path);
             if (res.ok) {
               // don't fetch text for images or binary excel
               if (!activeFile.endsWith(".png") && !activeFile.endsWith(".xlsx")) {
                 const text = await res.text();
                 setFileContent(activeFile, text);
               } else {
                 setFileContent(activeFile, "[BINARY DATA] Please view this file type externally or use the specialized viewer.");
               }
             }
           } catch (e) {}
        }
      }

      setIsFetchingContent(false);
    })();
  }, [activeFile]);

  useEffect(() => {
    if (!activeFile) {
      setMapOverlay([]);
      setMapLines([]);
      return;
    }
    const ext = fileExt(activeFile);
    if (!["tif", "tiff", "asc", "grd", "npz", "npy"].includes(ext)) {
      setMapOverlay([]);
      return;
    }
    const desktop = window.gaidDesktop;
    const root = workspaceRoot;
    const gridText = fileContents[activeFile];
    if (!root || !desktop?.readWorkspaceFile || !gridText) {
      setMapOverlay([]);
      return;
    }
    const rel = activeFile.replace(/\\/g, "/");
    const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
    const flight = dir ? `${dir}/flight_path.geojson` : "flight_path.geojson";
    const lineaments = dir ? `${dir}/lineaments.geojson` : "lineaments.geojson";
    const prj = rel.replace(/\.(tif|tiff|asc|grd|npz|npy)$/i, ".prj");
    let cancelled = false;
    (async () => {
      let epsg = 0;
      try {
        const prjFile = await desktop.readWorkspaceFile(root, prj);
        const hit = prjFile?.text?.match(/AUTHORITY\["EPSG","(\d+)"\]/g);
        const last = hit?.[hit.length - 1]?.match(/\d+/)?.[0];
        if (last) epsg = parseInt(last, 10);
      } catch {
        /* no prj */
      }
      try {
        const geo = await desktop.readWorkspaceFile(root, flight);
        if (cancelled || !geo?.text) {
          setMapOverlay([]);
          return;
        }
        const pts = extractLonLat(geo.text);
        const grid = parseEsriAscii(gridText);
        if (!pts.length) {
          setMapOverlay([]);
          return;
        }
        const sample = pts[0];
        if (grid && looksLonLat(sample.x, sample.y) && Math.abs(grid.xllcorner) > 180) {
          const zone = epsgZone(epsg)?.zone ?? utmZoneFromLon(sample.x);
          setMapOverlay(
            pts.map((p) => {
              const { easting, northing } = wgs84ToUtm(p.x, p.y, zone);
              return { x: easting, y: northing };
            })
          );
        } else {
          setMapOverlay(pts);
        }
      } catch {
        if (!cancelled) setMapOverlay([]);
      }
      try {
        const lin = await desktop.readWorkspaceFile(root, lineaments);
        if (!cancelled) setMapLines(lin?.text ? extractLineStrings(lin.text) : []);
      } catch {
        if (!cancelled) setMapLines([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeFile, workspaceRoot, fileContents[activeFile ?? ""]]);

  if (!activeFile) {
    return (
      <div className="flex-1 bg-[#1e1e1e] flex items-center justify-center text-[#858585] text-xs font-sans">
        Select a survey file from the Explorer to view and edit its parameters.
      </div>
    );
  }

  if (isFetchingContent) {
    return (
      <div className="flex-1 bg-[#1e1e1e] flex flex-col items-center justify-center gap-3 text-[#858585]">
        <Loader2 className="h-6 w-6 animate-spin text-[#007acc]" />
        <span className="text-xs font-mono">Loading {activeFile}...</span>
      </div>
    );
  }

  const ext = activeFile.split(".").pop()?.toLowerCase() || "";
  const isWordDoc = ["doc", "docx", "odt", "rtf"].includes(ext);
  const isSpreadsheet = ["csv", "tsv", "xls"].includes(ext);
  const isExcel = ["xlsx"].includes(ext);
  const isPdf = ext === "pdf";
  const isImage = ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext);
  const isRaster = ["tif", "tiff", "asc", "grd"].includes(ext);
  const isNpz = ["npz", "npy"].includes(ext);
  const isPrj = ext === "prj";
  const isGeojson = ext === "geojson";
  const isXyz = ext === "xyz";
  const isJson = ext === "json";
  const isMd = ext === "md" || ext === "mdx" || activeFile === "Implementation Plan" || activeFile === "Implementation Plan.md" || activeFile === "tasks.md";
  const useSpreadsheet = isSpreadsheet;
  const useTextEditor =
    !isWordDoc && !useSpreadsheet && !isPdf && !isExcel && !isImage && !isMd && !isRaster && !isPrj && !isGeojson && !isXyz && !isJson && !isNpz;

  if (isRaster) {
    const grid = parseEsriAscii(fileContents[activeFile] || "");
    return (
      <GridMapView
        title={activeFile.split("/").pop() || activeFile}
        grid={grid}
        overlay={mapOverlay}
        overlayLines={mapLines}
        note={grid ? undefined : "Could not decode this raster. G-AID reads its own GeoTIFF and NumPy grids, or a companion .asc."}
      />
    );
  }

  if (isNpz) {
    const grid = parseEsriAscii(fileContents[activeFile] || "");
    if (grid) {
      return (
        <GridMapView
          title={activeFile.split("/").pop() || activeFile}
          grid={grid}
          overlay={mapOverlay}
          overlayLines={mapLines}
        />
      );
    }
    return <NumpyCard title={activeFile.split("/").pop() || activeFile} />;
  }

  if (isPrj) {
    return <CrsCard title={activeFile.split("/").pop() || activeFile} wkt={fileContents[activeFile] || ""} />;
  }

  if (isGeojson) {
    const pts = extractLonLat(fileContents[activeFile] || "");
    return (
      <PointsMapView
        title={activeFile.split("/").pop() || activeFile}
        points={pts}
        note="No coordinates found in this GeoJSON."
      />
    );
  }

  if (isXyz) {
    const pts = parseXyzPoints(fileContents[activeFile] || "");
    return (
      <PointsMapView
        title={activeFile.split("/").pop() || activeFile}
        points={pts}
        colorByZ
        note="No XYZ points found in this file."
      />
    );
  }

  if (isJson) {
    return <JsonCard title={activeFile.split("/").pop() || activeFile} text={fileContents[activeFile] || ""} />;
  }

  if (isMd) {
    const isImplementationPlan = activeFile === "Implementation Plan" || activeFile === TEMP_PLAN_ID;
    const isTasks = activeFile === TEMP_TASKS_ID;
    const isPlanChrome = isImplementationPlan || isTasks;
    const planText = fileContents[activeFile] || "";
    const editorCheck = isImplementationPlan ? validateEditorMarkdown(planText) : { ok: true, blockers: [] as { message: string }[] };
    const proceedBlocked = isImplementationPlan && !editorCheck.ok;
    return (
      <div className="flex-1 bg-[#1e1e1e] flex flex-col h-full overflow-hidden">
        {/* Top toolbar */}
        <div className="h-[45px] border-b border-[#2b2b2b] shrink-0 bg-[#1e1e1e] flex items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#858585]" />
            <span className="text-[#cccccc] text-[13px] font-medium">{activeFile}</span>
            {isImplementationPlan && (
              <span className="text-[11px] text-[#858585]">Edits here are what G-AID will run</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isImplementationPlan && (
              <button
                onClick={() => setPlanPreview(!planPreview)}
                className="px-2.5 py-1.5 text-[12px] text-[#cccccc] border border-[#3c3c3c] rounded-md hover:bg-[#2d2d2d] transition-colors"
                title={planPreview ? "Edit the plan" : "Preview markdown"}
              >
                {planPreview ? "Edit" : "Preview"}
              </button>
            )}
            <button className="p-1.5 text-[#858585] hover:text-[#cccccc] hover:bg-[#2d2d2d] rounded transition-colors" title="Copy">
              <Copy className="h-4 w-4" />
            </button>
            <button className="p-1.5 text-[#858585] hover:text-[#cccccc] hover:bg-[#2d2d2d] rounded transition-colors" title="Download">
              <Download className="h-4 w-4" />
            </button>
             
            {isPlanChrome && (
              <div className="flex items-center gap-2 ml-3 relative">
                <button 
                  onClick={() => setIsReviewOpen(!isReviewOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-[#007acc] rounded-md text-[#cccccc] text-[13px] hover:bg-[#007acc11] transition-colors bg-[#252526]"
                >
                  Review <ChevronDown className="h-3 w-3 text-[#858585]" />
                </button>
                {isImplementationPlan && (
                  <button 
                    onClick={() => {
                      if (proceedBlocked) return;
                      useAppStore.getState().setPendingPrompt("I approve the implementation plan, please proceed.");
                    }}
                    disabled={proceedBlocked}
                    title={proceedBlocked ? editorCheck.blockers.map((issue) => issue.message).join(" ") : "Run this plan"}
                    className="bg-[#007acc] hover:bg-[#1b8fe3] text-white px-4 py-1.5 rounded-md text-[13px] font-bold transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Proceed
                  </button>
                )}

                {/* Review Popover */}
                {isReviewOpen && (
                  <div className="absolute top-[120%] right-[80px] w-[300px] bg-[#252526] border border-[#3c3c3c] rounded-md shadow-2xl z-50 p-3 flex flex-col gap-2">
                    <div className="text-[12px] text-[#cccccc] font-semibold mb-1">Submit comment</div>
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && reviewText.trim()) {
                            useAppStore.getState().setPendingPrompt("Review feedback for the implementation plan: " + reviewText.trim());
                            setReviewText("");
                            setIsReviewOpen(false);
                          }
                        }}
                        placeholder="Add a message..." 
                        autoFocus
                        className="flex-1 bg-[#1e1e1e] border border-[#3c3c3c] rounded-md px-2.5 py-1.5 text-[13px] text-[#cccccc] placeholder:text-[#555] outline-none focus:border-[#007acc]"
                      />
                      <button 
                        onClick={() => {
                          if (reviewText.trim()) {
                            useAppStore.getState().setPendingPrompt("Review feedback for the implementation plan: " + reviewText.trim());
                            setReviewText("");
                            setIsReviewOpen(false);
                          }
                        }}
                        disabled={!reviewText.trim()}
                        className="px-3 py-1.5 rounded-md text-[13px] font-medium transition-colors bg-[#333333] text-[#cccccc] hover:bg-[#444444] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Submit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        {proceedBlocked && (
          <div className="px-4 py-2 text-[12px] text-[#f0c674] bg-[#2a2618] border-b border-[#3c3c3c]">
            {editorCheck.blockers.map((issue) => issue.message).join(" ")}
          </div>
        )}
        <div className="flex-1 overflow-auto">
          {isImplementationPlan && !planPreview ? (
            <TextEditor
              filePath={activeFile}
              content={planText}
              projectName={currentProject}
              onChange={(value) => {
                setFileDirty(activeFile, true);
                setFileContent(activeFile, value);
              }}
            />
          ) : (
            <MarkdownViewer content={planText} />
          )}
        </div>
      </div>
    );
  }

  if (isImage) {
    const stored = fileContents[activeFile] || "";
    const src = stored.startsWith("data:") ? stored : "";
    return (
      <div className="flex-1 bg-[#1e1e1e] flex items-center justify-center h-full w-full p-8 overflow-auto">
         {src ? (
            <img src={src} alt={activeFile} className="max-w-full max-h-full object-contain drop-shadow-2xl border border-[#2b2b2b] rounded-md bg-[#252526] p-2" />
         ) : (
            <div className="text-[#858585]">Could not preview this image.</div>
         )}
      </div>
    );
  }

  if (isExcel) {
    const fileEntry = useAppStore.getState().projectFiles.find(f => f.id === activeFile);
    const src = fileEntry?.path || "";
    return (
      <div className="flex-1 bg-[#1e1e1e] flex flex-col items-center justify-center gap-6 h-full p-8 text-[#cccccc] font-sans">
         <div className="bg-[#217346] w-20 h-20 rounded shadow-xl flex items-center justify-center text-white font-bold text-3xl">X</div>
         <div className="text-center space-y-2">
           <h2 className="text-lg text-white font-medium">{activeFile}</h2>
           <p className="text-sm text-[#858585] max-w-sm mx-auto">This Excel workbook cannot be previewed in the editor. Open it from the survey folder on disk.</p>
         </div>
         {src && (
           <a href={src} download target="_blank" rel="noreferrer" className="bg-[#007acc] hover:bg-[#0062a3] px-6 py-2 rounded text-white font-medium transition-colors no-underline">
             Download File
           </a>
         )}
      </div>
    );
  }

  if (useSpreadsheet) {
    const raw = fileContents[activeFile] ?? "";
    return (
      <SpreadsheetView
        filePath={activeFile}
        content={ext === "xyz" ? raw.replace(/[ \t]+/g, ",") : raw}
        onChange={(value) => {
          setFileDirty(activeFile, true);
          setFileContent(activeFile, value);
        }}
      />
    );
  }

  if (useTextEditor) {
    return (
      <TextEditor
        filePath={activeFile}
        content={fileContents[activeFile] ?? ""}
        projectName={currentProject}
        onChange={(value) => {
          setFileDirty(activeFile, true);
          setFileContent(activeFile, value);
        }}
      />
    );
  }

  return (
    <div className="flex-1 bg-[#1e1e1e] flex items-center justify-center text-[#858585] text-sm p-8 text-center">
      <div>
        <p>No in-app preview for this file type yet.</p>
        <p className="font-mono text-xs mt-2 text-[#cccccc]">{activeFile}</p>
      </div>
    </div>
  );
}
