"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/app-store";
import { fetchFileText } from "@/lib/supabase/storage";
import { readRegisteredFile, hasRegisteredFile } from "@/lib/file-registry";
import { X, Play, RefreshCw, Save, Database, Table, Map, Braces, Settings2, FileText, CheckCircle2, AlertCircle, Layers, Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, List, Sparkles, Eye, ZoomIn, ZoomOut, RotateCw, Printer, Download, Maximize2, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TextEditor } from "@/components/workspace/text-editor";
import { SpreadsheetView } from "@/components/workspace/spreadsheet-view";

const DEMO_MOCK_FILES = [
  "line4_ert.dat",
  "basin_gravity.grd",
  "survey_layout.json",
  "inversion_config.yaml",
  "well_log_bh12.csv",
];

export function FileEditorView() {
  const { 
    activeFile, 
    setActiveFile, 
    setWorkspaceView,
    autoSave,
    setFileDirty,
    fileContents,
    setFileContent,
    currentProject,
  } = useAppStore();
  const [inversionLoading, setInversionLoading] = useState(false);
  const [inversionProgress, setInversionProgress] = useState<string[]>([]);
  const [inversionDone, setInversionDone] = useState(false);
  const [rmsError, setRmsError] = useState(14.8);
  const [contourThreshold, setContourThreshold] = useState(50);
  const [activeJsonTab, setActiveJsonTab] = useState<"code" | "schema">("code");
  const [isFetchingContent, setIsFetchingContent] = useState(false);

  // Lazy-load file content when a tab is opened
  useEffect(() => {
    if (!activeFile) return;
    if (fileContents[activeFile] !== undefined) return; // already loaded

    setIsFetchingContent(true);

    (async () => {
      // 1. Try local file registry first (files opened from disk this session)
      if (hasRegisteredFile(activeFile)) {
        const text = await readRegisteredFile(activeFile);
        if (text !== null) {
          setFileContent(activeFile, text);
          setIsFetchingContent(false);
          return;
        }
      }

      // 2. Try Supabase Storage (for files uploaded by authenticated users)
      const fileEntry = useAppStore.getState().projectFiles.find(
        (f) => f.id === activeFile && f.path && !f.path.startsWith("/local/")
      );
      if (fileEntry) {
        const text = await fetchFileText(fileEntry.path).catch(() => null);
        if (text !== null) {
          setFileContent(activeFile, text);
        }
      }

      setIsFetchingContent(false);
    })();
  }, [activeFile]);

  // Reset states when active file changes
  useEffect(() => {
    setInversionLoading(false);
    setInversionProgress([]);
    setInversionDone(false);
  }, [activeFile]);

  // Word Editor States
  const [wordBold, setWordBold] = useState(false);
  const [wordItalic, setWordItalic] = useState(false);
  const [wordUnderline, setWordUnderline] = useState(false);
  const [wordAlign, setWordAlign] = useState<"left" | "center" | "right">("left");
  const [wordFontSize, setWordFontSize] = useState("12pt");

  // PDF Viewer States
  const [pdfZoom, setPdfZoom] = useState(100);
  const [pdfRotation, setPdfRotation] = useState(0);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfSearchText, setPdfSearchText] = useState("");

  // Reset states when active file changes
  useEffect(() => {
    setInversionLoading(false);
    setInversionProgress([]);
    setInversionDone(false);
  }, [activeFile]);

  if (!activeFile) {
    return (
      <div className="flex-1 bg-[#1e1e1e] flex items-center justify-center text-[#858585] text-xs font-sans">
        Select a survey file from the Explorer to view and edit its parameters.
      </div>
    );
  }

  // Loading spinner while fetching content from Supabase Storage
  if (isFetchingContent) {
    return (
      <div className="flex-1 bg-[#1e1e1e] flex flex-col items-center justify-center gap-3 text-[#858585]">
        <Loader2 className="h-6 w-6 animate-spin text-[#007acc]" />
        <span className="text-xs font-mono">Loading {activeFile}...</span>
      </div>
    );
  }

  const ext = activeFile.split(".").pop()?.toLowerCase() || "";
  const isDemoMock =
    DEMO_MOCK_FILES.includes(activeFile) && fileContents[activeFile] === undefined;
  const isWordDoc = ["doc", "docx", "odt", "rtf"].includes(ext);
  const isSpreadsheet = ["csv", "tsv", "xls", "xlsx"].includes(ext);
  const isPdf = ext === "pdf";
  const useSpreadsheet =
    isSpreadsheet &&
    !(DEMO_MOCK_FILES.includes(activeFile) && fileContents[activeFile] === undefined);
  const useTextEditor =
    !isDemoMock && !isWordDoc && !useSpreadsheet && !isPdf;

  if (useSpreadsheet) {
    return (
      <SpreadsheetView
        filePath={activeFile}
        content={fileContents[activeFile] ?? ""}
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

  const handleClose = () => {
    setActiveFile(null);
    setWorkspaceView("dashboard");
  };

  const runMockInversion = () => {
    setFileDirty(activeFile, true);
    setInversionLoading(true);
    setInversionDone(false);
    setInversionProgress([]);
    
    const logs = [
      "Initializing Wenner-Schlumberger 2D Finite Difference grid mesh...",
      "Reading 192 quad-pole electrode measurement data points...",
      "Iteration 1: Calculating Jacobian matrix... RMS Error = 14.82%",
      "Iteration 2: Updating resistivity distribution model... RMS Error = 9.45%",
      "Iteration 3: Applying L1-norm smoothness constraints... RMS Error = 5.22%",
      "Iteration 4: Recalculating forward response mesh... RMS Error = 3.18%",
      "Iteration 5: Convergence threshold reached. Final RMS Error = 2.05%"
    ];

    logs.forEach((log, index) => {
      setTimeout(() => {
        setInversionProgress(prev => [...prev, log]);
        if (index === logs.length - 1) {
          setInversionLoading(false);
          setInversionDone(true);
          setRmsError(2.05);
        }
      }, (index + 1) * 800);
    });
  };

  return (
    <div className="flex-1 bg-[#1e1e1e] flex flex-col h-full overflow-hidden text-[#cccccc] font-sans select-none">
      {/* Editor Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        
        {/* FILE 1: line4_ert.dat */}
        {activeFile === "line4_ert.dat" && fileContents["line4_ert.dat"] === undefined && (
          <div className="space-y-6 max-w-5xl">
            <div className="flex items-center justify-between border-b border-[#2b2b2b] pb-3">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Table className="h-5 w-5 text-[#4fc1ff]" />
                  Electrical Resistivity Tomography (ERT) Raw Profile Data
                </h2>
                <p className="text-xs text-[#858585] mt-1 font-mono">File Path: /nevada-basin-survey-2026/line4_ert.dat</p>
              </div>
              <div className="flex items-center gap-4 bg-[#252526] px-4 py-2 border border-[#3c3c3c] rounded text-xs">
                <div><span className="text-[#858585]">Electrodes:</span> <strong className="text-white">48</strong></div>
                <div className="w-[1px] h-4 bg-[#2b2b2b]" />
                <div><span className="text-[#858585]">Spacing:</span> <strong className="text-white">5.0 m</strong></div>
                <div className="w-[1px] h-4 bg-[#2b2b2b]" />
                <div><span className="text-[#858585]">Array Type:</span> <strong className="text-white">Wenner-Schlumberger</strong></div>
              </div>
            </div>

            {/* Pseudosection CSS Heatmap Chart */}
            <div className="bg-[#181818] border border-[#2b2b2b] rounded-lg p-4">
              <h3 className="text-xs font-bold uppercase text-[#858585] mb-3 tracking-wider">Apparent Resistivity 2D Field Heatmap</h3>
              <div className="relative">
                {/* 2D Pseudosection Grid Simulation */}
                <div className="grid grid-cols-12 gap-1.5 h-[120px] items-end pb-2 pt-4">
                  {Array.from({ length: 48 }).map((_, i) => {
                    const depth = Math.floor(i / 12) + 1; // 4 rows
                    const resValue = Math.sin(i * 0.4) * 150 + 200 + (depth * 80);
                    // Map resValue to hot/cold gradient: Red (high resistivity/sand) to Blue (clay/groundwater anomaly)
                    let bgColor = "bg-blue-600";
                    if (resValue > 380) bgColor = "bg-red-500";
                    else if (resValue > 300) bgColor = "bg-orange-500";
                    else if (resValue > 220) bgColor = "bg-yellow-500";
                    else if (resValue > 150) bgColor = "bg-emerald-500";

                    return (
                      <div 
                        key={i} 
                        className={cn("w-full rounded-sm hover:scale-105 transition-transform duration-200 cursor-pointer border border-white/5", bgColor)}
                        style={{ height: `${100 - (depth * 18)}%` }}
                        title={`Station: ${i * 5}m, Depth: ${depth * 5}m, App.Res: ${Math.round(resValue)} Ω·m`}
                      />
                    );
                  })}
                </div>
                {/* Axes label */}
                <div className="flex justify-between text-[9px] text-[#555555] font-mono mt-1 px-1">
                  <span>STATION 0 m</span>
                  <span>STATION 120 m</span>
                  <span>STATION 240 m</span>
                </div>
              </div>

              {/* Legend bar */}
              <div className="flex justify-between items-center mt-5 pt-3 border-t border-[#2b2b2b] text-[10px] text-[#858585]">
                <span>Apparent Resistivity Legend (Ω·m):</span>
                <div className="flex items-center gap-1.5">
                  <div className="flex h-3 w-36 rounded overflow-hidden border border-white/10">
                    <span className="flex-1 bg-blue-600" />
                    <span className="flex-1 bg-emerald-500" />
                    <span className="flex-1 bg-yellow-500" />
                    <span className="flex-1 bg-orange-500" />
                    <span className="flex-1 bg-red-500" />
                  </div>
                  <span className="font-mono text-white text-[9px]">&lt;50 (Clay) - &gt;450 (Dry Sand)</span>
                </div>
              </div>
            </div>

            {/* Electrode Spacing DataTable */}
            <div>
              <h3 className="text-xs font-bold uppercase text-[#858585] mb-3 tracking-wider">Acquisition Sensor Readings</h3>
              <div className="bg-[#181818] border border-[#2b2b2b] rounded-lg overflow-hidden font-mono text-xs">
                <div className="grid grid-cols-6 gap-2 bg-[#252526] px-4 py-2 border-b border-[#2b2b2b] font-semibold text-white">
                  <span>Reading</span>
                  <span>A (m)</span>
                  <span>B (m)</span>
                  <span>M (m)</span>
                  <span>N (m)</span>
                  <span className="text-right text-[#4fc1ff]">V/I (R) Ω</span>
                </div>
                <div className="divide-y divide-[#2b2b2b] max-h-[220px] overflow-y-auto">
                  {[
                    { id: 1, a: 0, b: 15, m: 5, n: 10, r: 124.5 },
                    { id: 2, a: 5, b: 20, m: 10, n: 15, r: 84.2 },
                    { id: 3, a: 10, b: 25, m: 15, n: 20, r: 242.8 },
                    { id: 4, a: 15, b: 30, m: 20, n: 25, r: 412.1 },
                    { id: 5, a: 20, b: 35, m: 25, n: 30, r: 18.4 },
                    { id: 6, a: 25, b: 40, m: 30, n: 35, r: 54.1 },
                    { id: 7, a: 30, b: 45, m: 35, n: 40, r: 92.6 }
                  ].map((row) => (
                    <div key={row.id} className="grid grid-cols-6 gap-2 px-4 py-2 hover:bg-[#202021] text-[#cccccc]">
                      <span className="text-[#858585]">#{row.id}</span>
                      <span>{row.a}.0</span>
                      <span>{row.b}.0</span>
                      <span>{row.m}.0</span>
                      <span>{row.n}.0</span>
                      <span className="text-right text-[#4ec9b0] font-semibold">{row.r.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FILE 2: basin_gravity.grd */}
        {activeFile === "basin_gravity.grd" && fileContents["basin_gravity.grd"] === undefined && (
          <div className="space-y-6 max-w-5xl">
            <div className="flex items-center justify-between border-b border-[#2b2b2b] pb-3">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Layers className="h-5 w-5 text-[#4ec9b0]" />
                  Bouguer Gravity Anomaly Grid
                </h2>
                <p className="text-xs text-[#858585] mt-1 font-mono">File Path: /nevada-basin-survey-2026/basin_gravity.grd</p>
              </div>
              <div className="flex items-center gap-4 bg-[#252526] px-4 py-2 border border-[#3c3c3c] rounded text-xs">
                <div><span className="text-[#858585]">Nodes:</span> <strong className="text-white">120 x 85</strong></div>
                <div className="w-[1px] h-4 bg-[#2b2b2b]" />
                <div><span className="text-[#858585]">Bouguer Density:</span> <strong className="text-white">2.67 g/cm³</strong></div>
                <div className="w-[1px] h-4 bg-[#2b2b2b]" />
                <div><span className="text-[#858585]">Grid Step:</span> <strong className="text-white">250 m</strong></div>
              </div>
            </div>

            {/* Gravity 2D Contour Grid Simulator */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 bg-[#181818] border border-[#2b2b2b] rounded-lg p-5">
                <h3 className="text-xs font-bold uppercase text-[#858585] mb-4 tracking-wider">Regional Gravity Anomaly Surface Contour</h3>
                
                {/* Graphic 2D Grid anomaly map */}
                <div className="relative aspect-video rounded bg-gradient-to-tr from-indigo-950 via-zinc-900 to-rose-950 border border-white/5 overflow-hidden flex items-center justify-center">
                  
                  {/* Dense basement ridge (Gravity High) */}
                  <div className="absolute top-[30%] left-[45%] w-36 h-36 rounded-full bg-red-500/20 blur-2xl animate-pulse" />
                  <div className="absolute top-[35%] left-[50%] w-16 h-16 rounded-full bg-red-400/40 blur-xl" />

                  {/* Basin fill (Gravity Low) */}
                  <div className="absolute bottom-[20%] left-[20%] w-44 h-44 rounded-full bg-blue-600/25 blur-3xl" />
                  <div className="absolute bottom-[25%] left-[25%] w-20 h-20 rounded-full bg-blue-500/30 blur-2xl" />

                  {/* SVG Contour lines */}
                  <svg className="absolute inset-0 w-full h-full stroke-white/10 stroke-1 fill-none">
                    <circle cx="55%" cy="45%" r="30" stroke="rgba(244,63,94,0.3)" />
                    <circle cx="55%" cy="45%" r="60" stroke="rgba(244,63,94,0.2)" />
                    <circle cx="55%" cy="45%" r="90" stroke="rgba(244,63,94,0.1)" />

                    <circle cx="30%" cy="65%" r="40" stroke="rgba(59,130,246,0.3)" />
                    <circle cx="30%" cy="65%" r="70" stroke="rgba(59,130,246,0.2)" />
                    <circle cx="30%" cy="65%" r="100" stroke="rgba(59,130,246,0.1)" />
                  </svg>

                  <span className="absolute bottom-3 left-3 text-[10px] text-[#858585] font-mono">Basin Low (-32 mGal)</span>
                  <span className="absolute top-3 right-3 text-[10px] text-[#858585] font-mono">Basement Ridge (+12 mGal)</span>
                  <span className="text-[11px] font-mono text-[#858585] border border-white/5 bg-black/40 px-2 py-1 rounded">2D Gravity Field Grid</span>
                </div>
              </div>

              {/* Grid Control Toolbar */}
              <div className="bg-[#181818] border border-[#2b2b2b] rounded-lg p-5 space-y-4">
                <h3 className="text-xs font-bold uppercase text-[#858585] tracking-wider">Surface Grid Controls</h3>
                
                <div className="space-y-1.5">
                  <label className="text-xs text-[#858585] flex justify-between">
                    <span>Contour Step Threshold</span>
                    <span className="text-white font-mono">{contourThreshold} mGal</span>
                  </label>
                  <input 
                    type="range" 
                    min="10" 
                    max="100" 
                    value={contourThreshold} 
                    onChange={(e) => {
                      setContourThreshold(Number(e.target.value));
                      setFileDirty(activeFile, true);
                    }}
                    className="w-full h-1 bg-[#2b2b2b] rounded-lg appearance-none cursor-pointer accent-[#4ec9b0]"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-xs text-[#858585]">Active Reduction Densities</span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button 
                      onClick={() => setFileDirty(activeFile, true)}
                      className="bg-[#2d2d2d] border border-[#3c3c3c] py-1.5 rounded font-medium text-white hover:bg-[#3d3d3d] transition-colors border-none cursor-pointer"
                    >
                      2.67 g/cm³ (Standard)
                    </button>
                    <button 
                      onClick={() => setFileDirty(activeFile, true)}
                      className="bg-transparent border border-[#2b2b2b] py-1.5 rounded font-medium text-[#858585] hover:bg-[#252526] hover:text-white transition-colors cursor-pointer"
                    >
                      2.20 g/cm³ (Soil)
                    </button>
                  </div>
                </div>

                <div className="border-t border-[#2b2b2b] pt-4 space-y-2">
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-[#4ec9b0]" />
                    <span>Datum Reference (WGS84)</span>
                  </div>
                  <p className="text-[10px] text-[#858585] leading-relaxed">
                    Corrected for free-air, latitude, and ellipsoid heights matching the USGS Nevada gravity reference model.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FILE 3: survey_layout.json */}
        {activeFile === "survey_layout.json" && fileContents["survey_layout.json"] === undefined && (
          <div className="space-y-4 max-w-5xl h-full flex flex-col">
            <div className="flex items-center justify-between border-b border-[#2b2b2b] pb-3">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Braces className="h-5 w-5 text-[#d7ba7d]" />
                  Geophysical Station Coordinates & Elevation JSON
                </h2>
                <p className="text-xs text-[#858585] mt-1 font-mono">File Path: /nevada-basin-survey-2026/survey_layout.json</p>
              </div>
            </div>

            {/* JSON Code Viewer Tabs */}
            <div className="flex-1 bg-[#181818] border border-[#2b2b2b] rounded-lg overflow-hidden flex flex-col min-h-[300px]">
              <div className="bg-[#252526] border-b border-[#2b2b2b] px-3 flex gap-2">
                <button 
                  onClick={() => {
                    setActiveJsonTab("code");
                    setFileDirty(activeFile, true);
                  }}
                  className={cn("px-3 py-2 text-xs font-semibold border-b-2 bg-transparent transition-colors cursor-pointer border-none", activeJsonTab === "code" ? "border-[#d7ba7d] text-white" : "border-transparent text-[#858585] hover:text-white")}
                >
                  Raw JSON
                </button>
                <button 
                  onClick={() => {
                    setActiveJsonTab("schema");
                    setFileDirty(activeFile, true);
                  }}
                  className={cn("px-3 py-2 text-xs font-semibold border-b-2 bg-transparent transition-colors cursor-pointer border-none", activeJsonTab === "schema" ? "border-[#d7ba7d] text-white" : "border-transparent text-[#858585] hover:text-white")}
                >
                  Layout Visualization Schema
                </button>
              </div>

              {activeJsonTab === "code" ? (
                <pre className="flex-1 p-5 overflow-auto text-xs font-mono text-[#d7ba7d] leading-relaxed bg-[#1b1b1c] select-text">
{`{
  "surveyName": "Nevada Great Basin Geothermal Survey 2026",
  "datum": "WGS84 / UTM zone 11N",
  "baseStation": {
    "id": "NV-BASE-01",
    "coordinates": { "easting": 284512.4, "northing": 4392150.2, "elevation": 1420.5 }
  },
  "stations": [
    { "id": "ST-01", "x": 0.0, "y": 0.0, "elev": 1420.1, "status": "active" },
    { "id": "ST-02", "x": 10.0, "y": 0.0, "elev": 1420.2, "status": "active" },
    { "id": "ST-03", "x": 20.0, "y": 0.0, "elev": 1420.4, "status": "active" },
    { "id": "ST-04", "x": 30.0, "y": 0.0, "elev": 1420.7, "status": "active" },
    { "id": "ST-05", "x": 40.0, "y": 0.0, "elev": 1421.1, "status": "active" },
    { "id": "ST-06", "x": 50.0, "y": 0.0, "elev": 1421.5, "status": "flagged_high_noise" }
  ]
}`}
                </pre>
              ) : (
                <div className="flex-1 p-6 space-y-4 text-xs">
                  <h4 className="text-sm font-semibold text-white">Station Density Chart</h4>
                  <div className="grid grid-cols-6 gap-3 h-32 items-end max-w-md bg-[#252526] p-4 rounded border border-[#3c3c3c]">
                    {[1420.1, 1420.2, 1420.4, 1420.7, 1421.1, 1421.5].map((el, i) => (
                      <div key={i} className="flex flex-col items-center gap-1.5 h-full justify-end">
                        <div className="w-full bg-[#d7ba7d] rounded-t-sm" style={{ height: `${(el - 1419.5) * 45}%` }} />
                        <span className="text-[9px] font-mono text-[#858585]">ST-{i+1}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-[#858585]">Visualizing Easting elevation changes from Base station baseline.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FILE 4: inversion_config.yaml */}
        {activeFile === "inversion_config.yaml" && fileContents["inversion_config.yaml"] === undefined && (
          <div className="space-y-6 max-w-5xl">
            <div className="flex items-center justify-between border-b border-[#2b2b2b] pb-3">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-[#ce9178]" />
                  2D Resistivity Inversion Optimization Control YAML
                </h2>
                <p className="text-xs text-[#858585] mt-1 font-mono">File Path: /nevada-basin-survey-2026/inversion_config.yaml</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* YAML Editor panel */}
              <div className="lg:col-span-3 bg-[#181818] border border-[#2b2b2b] rounded-lg overflow-hidden flex flex-col">
                <div className="bg-[#252526] px-4 py-2 border-b border-[#2b2b2b] flex items-center justify-between">
                  <span className="text-xs font-semibold text-white font-mono">inversion_config.yaml</span>
                  <span className="text-[10px] text-[#ce9178] font-mono">YAML Config</span>
                </div>
                <pre className="p-5 font-mono text-xs text-[#ce9178] leading-relaxed bg-[#1b1b1c] overflow-auto select-text">
{`# 2D Least-Squares Smoothness-Constrained Inversion Settings
inversion_settings:
  max_iterations: 5
  convergence_limit_percent: 2.0
  damping_factor: 0.15
  smoothness_ratio_vertical: 0.5
  smoothness_ratio_horizontal: 1.0

grid_mesh_parameters:
  horizontal_mesh_spacing_m: 2.5
  vertical_mesh_spacing_factor: 1.10
  boundary_mesh_pad_nodes: 5

geotechnical_priors:
  groundwater_table_depth_m: 14.5
  clay_basement_resistivity_ohm_m: 15.0`}
                </pre>
              </div>

              {/* Interactive Inversion Simulator */}
              <div className="lg:col-span-2 bg-[#181818] border border-[#2b2b2b] rounded-lg p-5 space-y-4 flex flex-col justify-between">
                <div className="space-y-4">
                  <div className="border-b border-[#2b2b2b] pb-3">
                    <h3 className="text-xs font-bold uppercase text-[#858585] tracking-wider">Workbench Solver</h3>
                    <p className="text-[10px] text-[#858585] mt-1 leading-relaxed">
                      Run the mock 2D Least-Squares forward inversion mesh simulator direct from your browser.
                    </p>
                  </div>

                  {/* Trigger inversion solver button */}
                  <button 
                    onClick={runMockInversion}
                    disabled={inversionLoading}
                    className="w-full py-2 bg-[#007acc] hover:bg-[#0062a3] disabled:bg-[#007acc]/40 text-white rounded text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer border-none"
                  >
                    {inversionLoading ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    <span>{inversionLoading ? "Iterating forward mesh..." : "Run 2D Inversion Engine"}</span>
                  </button>

                  {/* Output progress terminal box */}
                  {(inversionLoading || inversionProgress.length > 0) && (
                    <div className="bg-black/40 border border-[#2b2b2b] rounded p-3 font-mono text-[9px] text-emerald-400 space-y-1.5 max-h-[200px] overflow-y-auto">
                      {inversionProgress.map((line, i) => (
                        <div key={i} className="flex gap-1.5">
                          <span className="text-zinc-600 select-none">[{i+1}]</span>
                          <span className={cn(line.includes("Error") && "text-amber-400", line.includes("Successful") && "text-cyan-400")}>{line}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Inversion complete chart banner */}
                  {inversionDone && (
                    <div className="bg-[#202021] border border-[#4ec9b0]/20 rounded p-4 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold text-[#4ec9b0]">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Inversion Complete! (RMS Error: {rmsError}%)</span>
                      </div>
                      
                      {/* CSS 2D Grid Anomaly Chart representing groundwater aquifer */}
                      <div className="h-16 rounded overflow-hidden relative flex flex-col justify-end border border-white/5">
                        <div className="w-full bg-[#3e2e25] h-[30%]" /> {/* dry sand top */}
                        <div className="w-full bg-[#1b4332] h-[40%] flex items-center justify-center relative"> {/* clay / water sand */}
                          <span className="absolute inset-0 bg-blue-500/20 blur-md" />
                          <span className="text-[9px] font-mono text-[#9cdcfe] z-10 font-bold uppercase tracking-widest">Groundwater Zone Found (14.5m)</span>
                        </div>
                        <div className="w-full bg-[#1c1a27] h-[30%]" /> {/* dense basement */}
                      </div>
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-[#858585] border-t border-[#2b2b2b] pt-3 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                  <span>Runs in browser sandboxed inversion engine.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FILE 5: well_log_bh12.csv */}
        {activeFile === "well_log_bh12.csv" && fileContents["well_log_bh12.csv"] === undefined && (
          <div className="space-y-6 max-w-5xl">
            <div className="flex items-center justify-between border-b border-[#2b2b2b] pb-3">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#9cdcfe]" />
                  Drillhole Lithology Water Borehole Log (BH-12)
                </h2>
                <p className="text-xs text-[#858585] mt-1 font-mono">File Path: /nevada-basin-survey-2026/well_log_bh12.csv</p>
              </div>
              <div className="flex items-center gap-4 bg-[#252526] px-4 py-2 border border-[#3c3c3c] rounded text-xs">
                <div><span className="text-[#858585]">Total Depth:</span> <strong className="text-white">28.0 m</strong></div>
                <div className="w-[1px] h-4 bg-[#2b2b2b]" />
                <div><span className="text-[#858585]">Water Level:</span> <strong className="text-white">14.8 m</strong></div>
                <div className="w-[1px] h-4 bg-[#2b2b2b]" />
                <div><span className="text-[#858585]">Borehole Status:</span> <strong className="text-[#4fc1ff] font-semibold">Active Aquifer</strong></div>
              </div>
            </div>

            {/* 2D Drillhole Lithological Column Drawing alongside Measured Soil charts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Lithological stratigraphic column */}
              <div className="bg-[#181818] border border-[#2b2b2b] rounded-lg p-5">
                <h3 className="text-xs font-bold uppercase text-[#858585] mb-4 tracking-wider">Lithology Log Column</h3>
                
                <div className="space-y-0.5 max-w-xs font-sans text-xs">
                  {/* Layer 1: Dry Sand */}
                  <div className="border border-white/5 bg-[#d7ba7d]/20 h-[50px] flex items-center justify-between px-3 text-[#d7ba7d] rounded-t relative">
                    <div className="absolute inset-0 bg-[radial-gradient(#d7ba7d_1px,transparent_1px)] [background-size:8px_8px] opacity-25" />
                    <span className="font-semibold z-10">Dry Sand & Gravel</span>
                    <span className="font-mono z-10 text-[10px]">0.0 - 4.5 m</span>
                  </div>

                  {/* Layer 2: Tight Clay */}
                  <div className="border border-white/5 bg-[#858585]/20 h-[80px] flex items-center justify-between px-3 text-[#cccccc] relative">
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,#858585_0,#858585_1px,transparent_0,transparent_50%)] [background-size:12px_12px] opacity-25" />
                    <span className="font-semibold z-10">Conductive Clay Cap</span>
                    <span className="font-mono z-10 text-[10px]">4.5 - 12.0 m</span>
                  </div>

                  {/* Layer 3: Unconsolidated gravel aquifer */}
                  <div className="border border-white/5 bg-[#4fc1ff]/20 h-[120px] flex items-center justify-between px-3 text-[#4fc1ff] rounded-b relative">
                    <div className="absolute inset-0 bg-[radial-gradient(#4fc1ff_2px,transparent_2px)] [background-size:14px_14px] opacity-25" />
                    <div className="absolute top-[25%] left-0 right-0 border-t-2 border-dashed border-blue-400 flex items-center justify-center">
                      <span className="bg-[#1e1e1e] px-2 py-0.5 text-[8px] font-bold text-blue-300 font-mono tracking-widest uppercase">WATER TABLE (14.8m)</span>
                    </div>
                    <span className="font-semibold z-10">Gravel Aquifer</span>
                    <span className="font-mono z-10 text-[10px]">12.0 - 28.0 m</span>
                  </div>
                </div>
              </div>

              {/* Soil logs DataTable */}
              <div className="md:col-span-2 bg-[#181818] border border-[#2b2b2b] rounded-lg p-5">
                <h3 className="text-xs font-bold uppercase text-[#858585] mb-4 tracking-wider">Stratigraphic CSV Data</h3>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#252526] text-white border-b border-[#2b2b2b]">
                        <th className="p-2">Depth (m)</th>
                        <th className="p-2">Soil Classification</th>
                        <th className="p-2">Moisture (%)</th>
                        <th className="p-2 text-right">Resistivity (Ω·m)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#2b2b2b]">
                      {[
                        { depth: "0.0 - 2.0", type: "Coarse Dry Sand", moisture: "4.2%", res: 480 },
                        { depth: "2.0 - 4.5", type: "Gravelly Sand", moisture: "8.5%", res: 350 },
                        { depth: "4.5 - 8.0", type: "Silty Silt-Clay", moisture: "28.4%", res: 18 },
                        { depth: "8.0 - 12.0", type: "Plastic Soft Clay", moisture: "38.1%", res: 12 },
                        { depth: "12.0 - 18.0", type: "Saturated Coarse Sand", moisture: "84.2%", res: 84 },
                        { depth: "18.0 - 28.0", type: "Water-bearing Gravel", moisture: "94.5%", res: 110 }
                      ].map((row, idx) => (
                        <tr key={idx} className="hover:bg-[#202021] text-[#cccccc]">
                          <td className="p-2 font-semibold text-white">{row.depth}</td>
                          <td className="p-2">{row.type}</td>
                          <td className="p-2 text-[#9cdcfe]">{row.moisture}</td>
                          <td className="p-2 text-right text-[#4ec9b0] font-bold">{row.res}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Custom Fallback Raw File Editor */}
        {(!DEMO_MOCK_FILES.includes(activeFile) || fileContents[activeFile] !== undefined) && (() => {
          if (isWordDoc) {
            return (
              <div className="flex-1 flex flex-col h-full bg-[#f3f2f1] text-[#333333] font-sans rounded-lg overflow-hidden border border-[#dad9d8]">
                {/* MS Word Ribbon Header */}
                <div className="bg-[#107c41] text-white px-4 py-1.5 flex items-center justify-between text-xs font-semibold shrink-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span>Microsoft Word Online - {activeFile}</span>
                  </div>
                  <div className="text-[10px] text-white/80">Saved to Cloud</div>
                </div>

                <div className="bg-[#f3f2f1] border-b border-[#dad9d8] py-1.5 px-4 flex flex-wrap gap-2 text-[11px] items-center shrink-0 select-none">
                  <button 
                    onClick={() => setWordBold(!wordBold)}
                    className={cn("p-1 rounded hover:bg-[#eae8e6] cursor-pointer border-none font-bold", wordBold ? "bg-[#dad9d8] text-black" : "text-zinc-700 bg-transparent")}
                    title="Bold"
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </button>
                  <button 
                    onClick={() => setWordItalic(!wordItalic)}
                    className={cn("p-1 rounded hover:bg-[#eae8e6] cursor-pointer border-none", wordItalic ? "bg-[#dad9d8] text-black italic" : "text-zinc-700 bg-transparent")}
                    title="Italic"
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </button>
                  <button 
                    onClick={() => setWordUnderline(!wordUnderline)}
                    className={cn("p-1 rounded hover:bg-[#eae8e6] cursor-pointer border-none underline", wordUnderline ? "bg-[#dad9d8] text-black" : "text-zinc-700 bg-transparent")}
                    title="Underline"
                  >
                    <Underline className="h-3.5 w-3.5" />
                  </button>
                  <div className="h-4 w-[1px] bg-[#dad9d8] mx-1" />
                  <button 
                    onClick={() => setWordAlign("left")}
                    className={cn("p-1 rounded hover:bg-[#eae8e6] cursor-pointer border-none", wordAlign === "left" ? "bg-[#dad9d8]" : "bg-transparent")}
                  >
                    <AlignLeft className="h-3.5 w-3.5 text-zinc-700" />
                  </button>
                  <button 
                    onClick={() => setWordAlign("center")}
                    className={cn("p-1 rounded hover:bg-[#eae8e6] cursor-pointer border-none", wordAlign === "center" ? "bg-[#dad9d8]" : "bg-transparent")}
                  >
                    <AlignCenter className="h-3.5 w-3.5 text-zinc-700" />
                  </button>
                  <button 
                    onClick={() => setWordAlign("right")}
                    className={cn("p-1 rounded hover:bg-[#eae8e6] cursor-pointer border-none", wordAlign === "right" ? "bg-[#dad9d8]" : "bg-transparent")}
                  >
                    <AlignRight className="h-3.5 w-3.5 text-zinc-700" />
                  </button>
                  <div className="h-4 w-[1px] bg-[#dad9d8] mx-1" />
                  <select 
                    value={wordFontSize}
                    onChange={(e) => setWordFontSize(e.target.value)}
                    className="bg-white border border-[#dad9d8] text-zinc-700 rounded px-1.5 py-0.5 text-[10px] outline-none"
                  >
                    <option value="10pt">10pt</option>
                    <option value="12pt">12pt</option>
                    <option value="14pt">14pt</option>
                    <option value="18pt">18pt</option>
                  </select>
                  <div className="h-4 w-[1px] bg-[#dad9d8] mx-1" />
                  <button className="flex items-center gap-1 p-1 rounded hover:bg-[#eae8e6] cursor-pointer border-none text-[#107c41] bg-transparent">
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>AI Copilot Smart Outline</span>
                  </button>
                </div>

                {/* Word Page Space */}
                <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-[#eae8e6]">
                  <div 
                    key={activeFile}
                    contentEditable
                    suppressContentEditableWarning
                    dangerouslySetInnerHTML={{ 
                      __html: fileContents[activeFile] !== undefined && fileContents[activeFile].trim() !== ""
                        ? (fileContents[activeFile].trim().startsWith("<") 
                            ? fileContents[activeFile] 
                            : fileContents[activeFile].split('\n').map(line => line.trim() ? `<p>${line}</p>` : `<br/>`).join(''))
                        : `<h2>GEOPHYSICAL FIELD REPORT</h2>
                           <p><strong>PROJECT ID:</strong> NV-BASIN-2026-A</p>
                           <p><strong>AUTHOR:</strong> Dr. Sarah Jenkins, Lead Hydrologist</p>
                           <p><strong>LOCATION:</strong> Central Nevada Basin Grid Coordinate System</p>
                           <hr/>
                           <h3>1. EXECUTIVE SUMMARY</h3>
                           <p>This report details the subsurface stratigraphic mappings and geological horizons mapped during the hydrogeological investigation in Nevada Basin. High-resolution soundings were executed using 4D electrical resistivity sweeps.</p>
                           <h3>2. LITHOLOGY & STRATIGRAPHY</h3>
                           <p>Core analysis reveals an upper unsaturated sand-gravel horizon extending to 4.5 meters. Underneath, a thick layer of coarse saturated aquifer sand (with high yields) is fully defined down to 28.0 meters.</p>
                           <h3>3. SENSOR CALIBRATION DETAILS</h3>
                           <ul>
                             <li>Geophones configured: 48</li>
                             <li>Base elevation: 1420.4 m</li>
                             <li>Average Resistivity: 104.2 Ohm-m</li>
                           </ul>`
                    }}
                    onInput={(e) => {
                      setFileDirty(activeFile, true);
                      setFileContent(activeFile, e.currentTarget.innerHTML);
                    }}
                    className={cn(
                      "w-full max-w-[800px] min-h-[1050px] bg-white text-zinc-900 shadow-2xl rounded border border-zinc-300 p-16 outline-none overflow-y-auto leading-relaxed font-sans text-sm",
                      wordBold && "font-bold",
                      wordItalic && "italic",
                      wordUnderline && "underline"
                    )}
                    style={{ fontSize: wordFontSize, textAlign: wordAlign }}
                  />
                </div>
              </div>
            );
          }

          if (isPdf) {
            return (
              <div className="flex-1 flex flex-col h-full bg-[#383838] text-white rounded-lg overflow-hidden border border-[#2b2b2b] select-none font-sans">
                {/* PDF Toolbar */}
                <div className="bg-[#2d2d2d] border-b border-[#1f1f1f] px-4 py-1.5 flex items-center justify-between text-xs shrink-0 select-none">
                  <div className="flex items-center gap-3">
                    <span className="bg-[#ff2400] text-white px-1 py-0.5 rounded text-[10px] font-bold">PDF</span>
                    <span className="truncate max-w-[200px]">{activeFile}</span>
                    <span className="text-zinc-500 font-mono">Page {pdfPage} of 3</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPdfZoom(Math.max(50, pdfZoom - 10))}
                      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer border-none bg-transparent"
                    >
                      <ZoomOut className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-[10px] font-mono w-10 text-center">{pdfZoom}%</span>
                    <button 
                      onClick={() => setPdfZoom(Math.min(200, pdfZoom + 10))}
                      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer border-none bg-transparent"
                    >
                      <ZoomIn className="h-3.5 w-3.5" />
                    </button>
                    <div className="w-[1px] h-4 bg-zinc-700" />
                    <button 
                      onClick={() => setPdfRotation((pdfRotation + 90) % 360)}
                      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer border-none bg-transparent"
                      title="Rotate Page"
                    >
                      <RotateCw className="h-3.5 w-3.5" />
                    </button>
                    <button className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer border-none bg-transparent" title="Print PDF">
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                    <button className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-white cursor-pointer border-none bg-transparent" title="Download Report">
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex overflow-hidden">
                  {/* PDF Thumbnail Sidebar */}
                  <div className="w-48 bg-[#2d2d2d] border-r border-[#1f1f1f] p-4 space-y-4 overflow-y-auto shrink-0 select-none">
                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Page Previews</h4>
                    {[1, 2, 3].map((p) => (
                      <button 
                        key={p}
                        onClick={() => setPdfPage(p)}
                        className={cn(
                          "w-full aspect-[1/1.4] bg-white border-2 text-zinc-800 rounded p-1.5 flex flex-col justify-between hover:border-[#007acc] transition-colors cursor-pointer text-left",
                          pdfPage === p ? "border-[#007acc] ring-1 ring-[#007acc]/40" : "border-zinc-700 bg-zinc-100"
                        )}
                      >
                        <div className="text-[7px] text-[#ff2400] font-bold border-b border-zinc-300 pb-0.5">PAGE {p}</div>
                        <div className="flex-1 py-1 space-y-0.5">
                          <div className="h-1 bg-zinc-400 w-full rounded-sm" />
                          <div className="h-1 bg-zinc-300 w-3/4 rounded-sm" />
                          <div className="h-1 bg-zinc-300 w-5/6 rounded-sm" />
                        </div>
                        <div className="text-[6px] text-zinc-400 text-right">Draft {p}</div>
                      </button>
                    ))}
                  </div>

                  {/* Main PDF Page Display */}
                  <div className="flex-1 overflow-auto p-8 flex justify-center bg-[#383838]">
                    <div 
                      className="bg-white text-zinc-950 p-16 shadow-2xl transition-transform duration-300 border border-zinc-700 w-full max-w-[760px] aspect-[1/1.4] rounded relative"
                      style={{ 
                        transform: `scale(${pdfZoom / 100}) rotate(${pdfRotation}deg)`,
                        transformOrigin: "top center"
                      }}
                    >
                      {/* Acrobat Watermark */}
                      <div className="absolute top-4 right-6 text-[8px] text-[#ff2400] font-bold font-mono border border-[#ff2400]/40 rounded px-1.5 py-0.5">ADOBE ACROBAT DOCUMENT</div>

                      {pdfPage === 1 && (
                        <div className="space-y-6 font-serif leading-relaxed text-sm">
                          <div className="border-b-2 border-zinc-800 pb-3 text-center">
                            <h1 className="text-xl font-bold uppercase tracking-wide text-zinc-900">United States Geophysical Research Laboratory</h1>
                            <h2 className="text-xs font-sans text-zinc-500 uppercase tracking-widest mt-1">Scientific Investigation Report 2026-B94</h2>
                          </div>

                          <div className="space-y-4">
                            <h3 className="text-md font-sans font-bold text-zinc-900 border-b border-zinc-200 pb-1 mt-6">1. Subsurface Hydrogeological Analysis - Nevada Basin</h3>
                            <p className="indent-8 text-[12px] text-zinc-800">
                              A high-resolution 2D electrical resistivity tomography (ERT) and gravity modeling survey was executed in the northern reaches of the Nevada Basin aquifer basin. The field survey comprised 48 individual sensor geophones configured in a Wenner-Schlumberger quad-pole setup array. 
                            </p>
                            <p className="indent-8 text-[12px] text-zinc-800">
                              Preliminary apparent resistivity logs indicate three discrete lithological horizons. The superficial strata is composed of porous dry sand with resistivity ranges surpassing 350 Ω·m. Underneath this, a highly saturated sand-gravel aquifer shows low apparent resistivity anomalies (75 to 110 Ω·m), indicating high water yield coefficients.
                            </p>
                          </div>

                          <div className="bg-zinc-100 border-l-4 border-[#007acc] p-4 rounded text-zinc-800 font-sans text-xs">
                            <strong className="text-zinc-900">Key Finding:</strong> Aquifer configuration begins at 14.5 meters vertical depth, bounded by an underlying impermeable clay basement (15 Ω·m) starting at 28.0 meters.
                          </div>
                        </div>
                      )}

                      {pdfPage === 2 && (
                        <div className="space-y-6 font-serif leading-relaxed text-[12px]">
                          <div className="border-b border-zinc-200 pb-2">
                            <h3 className="text-sm font-sans font-bold text-zinc-900">2. Forward Response Inversion Solver Formulas</h3>
                            <p className="text-zinc-500 font-sans text-[10px] uppercase tracking-wider">Chapter 2 - Mathematical Inversion Frameworks</p>
                          </div>

                          <p className="text-zinc-800">
                            The apparent resistivity calculated for a Wenner-Schlumberger electrode array with spacing coefficient a is resolved dynamically using:
                          </p>

                          <div className="bg-zinc-50 border border-zinc-300 p-5 rounded flex justify-center items-center my-4 font-mono text-xs text-zinc-900 shadow-sm">
                            {"ρ_apparent = 2 * π * A * (V / I) * [1 + (2 * A) / (A + B)]"}
                          </div>

                          <p className="text-zinc-800">
                            To minimize calculation residuals, a smoothness-constrained least-squares inversion algorithm is applied synchronously:
                          </p>

                          <div className="bg-zinc-50 border border-zinc-300 p-5 rounded flex justify-center items-center my-4 font-mono text-xs text-zinc-900 shadow-sm">
                            {"(J^T * J + α * C^T * C) * ΔP = J^T * G"}
                          </div>

                          <p className="text-zinc-800">
                            Where J represents the sensitivity Jacobian mesh matrix, C is the horizontal/vertical smoothness boundary operator, and α is the damping coefficient (calibrated at 0.15).
                          </p>
                        </div>
                      )}

                      {pdfPage === 3 && (
                        <div className="space-y-6 font-serif leading-relaxed text-[12px]">
                          <div className="border-b border-zinc-200 pb-2">
                            <h3 className="text-sm font-sans font-bold text-zinc-900">3. Stratigraphic Correlation Data Matrix</h3>
                            <p className="text-zinc-500 font-sans text-[10px] uppercase tracking-wider">Chapter 3 - Sensor Readings Summary</p>
                          </div>

                          <table className="w-full border-collapse border border-zinc-300 text-[10px] font-sans text-zinc-800">
                            <thead>
                              <tr className="bg-zinc-100 text-zinc-900 font-bold border-b border-zinc-300">
                                <th className="border border-zinc-300 p-2">Lithological Strata</th>
                                <th className="border border-zinc-300 p-2">Depth Interval (m)</th>
                                <th className="border border-zinc-300 p-2">Average Resistivity (Ω·m)</th>
                                <th className="border border-zinc-300 p-2">Geotechnical Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b border-zinc-200">
                                <td className="border border-zinc-300 p-2 font-semibold">Dry Alluvial Sand</td>
                                <td className="border border-zinc-300 p-2">0.0 - 4.5</td>
                                <td className="border border-zinc-300 p-2">420.5</td>
                                <td className="border border-zinc-300 p-2 text-amber-600 font-medium">Unsaturated Zone</td>
                              </tr>
                              <tr className="border-b border-zinc-200">
                                <td className="border border-zinc-300 p-2 font-semibold">Saturated Aquifer</td>
                                <td className="border border-zinc-300 p-2 font-semibold text-emerald-600">4.5 - 28.0</td>
                                <td className="border border-zinc-300 p-2 text-emerald-600 font-bold">104.2</td>
                                <td className="border border-zinc-300 p-2 text-emerald-600 font-bold">Active Reservoir</td>
                              </tr>
                              <tr className="border-b border-zinc-200">
                                <td className="border border-zinc-300 p-2 font-semibold">Stiff Clay Basement</td>
                                <td className="border border-zinc-300 p-2">28.0+</td>
                                <td className="border border-zinc-300 p-2 text-red-600">15.4</td>
                                <td className="border border-zinc-300 p-2 text-zinc-500">Aquiclude Bed</td>
                              </tr>
                            </tbody>
                          </table>

                          <div className="mt-8 text-center text-[10px] text-zinc-400 font-sans border-t border-zinc-200 pt-4">
                            End of Research Bulletin. All measurements calibrated under WGS84 Datum Guidelines.
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          return null;
        })()}

      </div>
    </div>
  );
}
