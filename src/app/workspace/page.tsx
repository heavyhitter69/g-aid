"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/workspace/sidebar";
import { Topbar } from "@/components/workspace/topbar";
import { StatusBar } from "@/components/workspace/status-bar";
import { AIPanel } from "@/components/workspace/ai-panel";
import { UploadModal } from "@/components/workspace/upload-modal";
import { DashboardView } from "@/components/workspace/dashboard-view";
import { WorkflowBuilder } from "@/components/workflows/workflow-builder";
import { VisualizationStudio } from "@/components/workspace/visualization-studio";
import { AICenter } from "@/components/workspace/ai-center";
import { SettingsView } from "@/components/workspace/settings-view";
import { FileEditorView } from "@/components/workspace/file-editor";
import { useAppStore } from "@/store/app-store";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { ChevronRight, X, Settings, Table, Layers, Braces, FileCode, FileText, Folder, Search, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export default function WorkspacePage() {
  const router = useRouter();
  const { 
    isAuthenticated, 
    workspaceView,
    isAgentSidebarOpen,
    isTerminalOpen,
    isChatPanelOpen,
    isLeftSidebarOpen,
    toggleLeftSidebar,
    conversations,
    workbenchTabs,
    activeWorkbenchTabId,
    setActiveWorkbenchTabId,
    closeWorkbenchTab,
    dirtyFiles,
    isOpenFileDialogOpen,
    isOpenFolderDialogOpen,
    isSaveAsDialogOpen,
    setOpenFileDialogOpen,
    setOpenFolderDialogOpen,
    setSaveAsDialogOpen,
    projectFiles,
    addProjectFile,
    openWorkbenchTab,
    currentProject,
    setCurrentProject,
    setProjectFiles,
    activeFile,
    saveFile,
    setFileContent,
    addConversation,
    setChatPanelOpen,
    toggleChatPanel,
    setActiveLeftSidebarTab,
    setLeftSidebarOpen,
    setWorkspaceView
  } = useAppStore();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [saveAsName, setSaveAsName] = useState("");
  const [fileSearch, setFileSearch] = useState("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. New Agent: Ctrl + Shift + L
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        addConversation();
        setChatPanelOpen(true);
      }
      
      // 2. Search Files: Ctrl + P
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setActiveLeftSidebarTab("search");
        setLeftSidebarOpen(true);
      }
      
      // 3. Maximize Chat: Ctrl + Alt + E
      if (e.ctrlKey && e.altKey && e.key.toLowerCase() === "e") {
        e.preventDefault();
        toggleChatPanel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [addConversation, setChatPanelOpen, setActiveLeftSidebarTab, setLeftSidebarOpen, toggleChatPanel]);

  useEffect(() => {
    if (activeFile) {
      setSaveAsName(activeFile.replace(/(\.[^.]+)$/, "_copy$1"));
    }
  }, [activeFile, isSaveAsDialogOpen]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/signin");
    }
  }, [isAuthenticated, router]);

  const renderView = () => {
    switch (workspaceView) {
      case "workflow":
        return <WorkflowBuilder />;
      case "visualization":
        return <VisualizationStudio />;
      case "ai-center":
        return <AICenter />;
      case "datasets":
        return (
          <section className="p-6 bg-[#1e1e1e] h-full text-[#cccccc]">
            <h2 className="text-lg font-semibold mb-4 text-white">Dataset Explorer</h2>
            <ul className="space-y-2">
              {["line4_ert.dat", "ip_chargeability.csv", "bh03_log.csv", "survey_grid.segy"].map((f) => (
                <li key={f} className="flex items-center justify-between p-4 bg-[#252526] rounded border border-[#3c3c3c] font-mono text-sm">
                  <span>{f}</span>
                  <span className="text-xs text-[#858585]">Ready</span>
                </li>
              ))}
            </ul>
          </section>
        );
      case "settings":
        return <SettingsView />;
      case "file-editor":
        return <FileEditorView />;
      case "reports":
        return (
          <section className="p-8 bg-[#1e1e1e] h-full text-[#cccccc]">
            <h2 className="text-2xl font-bold mb-4 text-white">Scientific Reports</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {["Q1_Survey_Analysis.pdf", "Resistivity_Model_Final.docx", "Site_Investigation_v2.pdf"].map(r => (
                <div key={r} className="p-4 bg-[#252526] border border-[#3c3c3c] rounded flex items-center justify-between">
                  <span>{r}</span>
                  <button className="text-xs underline hover:text-white">Download</button>
                </div>
              ))}
            </div>
          </section>
        );
      default:
        return <DashboardView />;
    }
  };

  if (!isAuthenticated) return null;

  return (
    <ThemeProvider>
    <main className="relative h-screen flex flex-col overflow-hidden bg-[#1e1e1e]">
      <Topbar />
      
      <div className="flex-1 flex min-h-0 relative">
        {/* Slick Sidebar Trigger Strip when closed */}
        {!isLeftSidebarOpen && (
          <button 
            onClick={toggleLeftSidebar}
            className="absolute left-0 top-0 bottom-0 w-2 hover:w-3 bg-transparent hover:bg-white/5 border-r border-[#2b2b2b] flex items-center justify-center group z-40 transition-all cursor-pointer"
          >
            <ChevronRight className="h-3 w-3 text-[#858585] opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}

        {isLeftSidebarOpen && <Sidebar />}
        
        <section className="flex-1 flex flex-col min-w-0 relative bg-[#1e1e1e]">
          <div className="flex-1 flex min-h-0">
            <article className="flex-1 overflow-hidden flex flex-col h-full">
              {workbenchTabs.length > 0 && (
                <div className="h-[35px] bg-[#181818] border-b border-[#2b2b2b] flex items-center shrink-0 overflow-x-auto select-none no-scrollbar">
                  {workbenchTabs.map((tab) => {
                    const isActive = activeWorkbenchTabId === tab.id;
                    const isDirty = tab.type === "file" && dirtyFiles.includes(tab.id.replace("file:", ""));
                    
                    // Match icon and color based on extension
                    let Icon = FileText;
                    let fileColor = "text-[#9cdcfe]";
                    if (tab.type === "settings") {
                      Icon = Settings;
                      fileColor = isActive ? "text-[#007acc]" : "text-[#858585] group-hover:text-[#cccccc]";
                    } else if (tab.title.endsWith(".dat")) {
                      Icon = Table;
                      fileColor = "text-[#4fc1ff]";
                    } else if (tab.title.endsWith(".grd")) {
                      Icon = Layers;
                      fileColor = "text-[#4ec9b0]";
                    } else if (tab.title.endsWith(".json")) {
                      Icon = Braces;
                      fileColor = "text-[#d7ba7d]";
                    } else if (tab.title.endsWith(".yaml") || tab.title.endsWith(".yml")) {
                      Icon = FileCode;
                      fileColor = "text-[#ce9178]";
                    } else if (tab.title.endsWith(".csv")) {
                      Icon = FileText;
                      fileColor = "text-[#9cdcfe]";
                    }

                    return (
                      <div
                        key={tab.id}
                        onClick={() => openWorkbenchTab(tab.id, tab.type, tab.title)}
                        className={cn(
                          "h-full px-4 border-r border-[#2b2b2b] flex items-center gap-2 text-xs cursor-pointer transition-colors relative group",
                          isActive ? "bg-[#1e1e1e] text-white border-t-2 border-t-[#007acc]" : "bg-[#141414] text-[#858585] hover:bg-[#1b1b1c] hover:text-[#cccccc]"
                        )}
                      >
                        {/* File/Setting Type Icon */}
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", fileColor)} />
                        
                        <span className="truncate max-w-[120px] font-sans font-medium">{tab.title}</span>
                        
                        {/* Close button / Dirty indicator */}
                        <div className="flex items-center gap-1 ml-1.5 shrink-0">
                          {isDirty && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#4fc1ff] shrink-0" />
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              closeWorkbenchTab(tab.id);
                            }}
                            className="p-0.5 rounded hover:bg-white/10 text-[#858585] hover:text-white cursor-pointer border-none bg-transparent transition-colors"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                {renderView()}
              </div>
            </article>
            
            {/* Conditional Right Panels */}
            {isChatPanelOpen && (
              <div className="w-[350px] border-l border-[#2b2b2b] bg-[#181818] shrink-0 flex flex-col h-full">
                <AIPanel />
              </div>
            )}
            {isAgentSidebarOpen && (
              <div className="w-80 border-l border-[#2b2b2b] bg-[#181818] text-[#cccccc] p-4 shrink-0 overflow-y-auto">
                <h2 className="text-xs font-bold mb-4 uppercase tracking-wider">New Agent</h2>
                <p className="text-[11px] text-[#858585]">Configure a new geophysics agent here.</p>
                <div className="mt-4 space-y-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase text-[#858585]">Agent Name</label>
                    <input type="text" className="bg-[#2a2d2e] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] outline-none text-[#cccccc]" placeholder="e.g. Seismic Interpreter" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] uppercase text-[#858585]">Discipline</label>
                    <select className="bg-[#2a2d2e] border border-[#3c3c3c] rounded px-2 py-1 text-[11px] outline-none text-[#cccccc]">
                      <option>Seismic Processing</option>
                      <option>Electrical Resistivity</option>
                      <option>Gravity/Magnetics</option>
                    </select>
                  </div>
                  <button className="w-full bg-[#007acc] hover:bg-[#005f9e] text-white rounded py-1 text-[11px] mt-4 transition-colors">
                    Create Agent
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Conditional Bottom Panel */}
          {isTerminalOpen && (
            <div className="h-56 shrink-0 border-t border-[#2b2b2b] bg-[#1e1e1e] text-[#cccccc] p-2 flex flex-col">
              <div className="flex gap-4 border-b border-[#2b2b2b] px-2 pt-1 pb-2 uppercase tracking-wider text-[10px] text-[#858585]">
                <button className="hover:text-[#cccccc] transition-colors">Problems</button>
                <button className="hover:text-[#cccccc] transition-colors">Output</button>
                <button className="text-[#cccccc] border-b border-[#007acc] pb-1 -mb-[9px]">Terminal</button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 font-mono text-[12px] leading-relaxed">
                <div><span className="text-[#007acc]">PS C:\Users\sarko\Documents\geophysics-demo2.0&gt;</span> npm run dev</div>
                <div className="mt-1">
                  <span className="text-[#858585]">&gt; geophysics-demo@0.1.0 dev</span><br/>
                  <span className="text-[#858585]">&gt; next dev</span>
                </div>
                <div className="text-[#4caf50] mt-2">ready - started server on 0.0.0.0:3000, url: http://localhost:3000</div>
                <div className="text-[#cccccc] mt-1">event - compiled client and server successfully in 1240 ms (142 modules)</div>
                <div className="text-[#cccccc]">wait  - compiling...</div>
                <div className="text-[#4caf50]">event - compiled client and server successfully in 118 ms (142 modules)</div>
              </div>
            </div>
          )}
        </section>
      </div>
      
      <StatusBar />
      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />

      {/* Hidden Native File Selector */}
      <input 
        type="file" 
        id="native-file-picker" 
        className="hidden" 
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const isDocx = file.name.endsWith(".docx") || file.name.endsWith(".doc");
            const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
            const reader = new FileReader();

            if (isDocx) {
              reader.onload = async (event) => {
                const arrayBuffer = event.target?.result as ArrayBuffer;
                try {
                  const mammoth = await import("mammoth");
                  const result = await mammoth.convertToHtml({ arrayBuffer });
                  setFileContent(file.name, result.value);
                } catch (err) {
                  console.error("Error parsing docx", err);
                  setFileContent(file.name, "Error: Could not extract text from Microsoft Word document.");
                }
              };
              reader.readAsArrayBuffer(file);
            } else if (isExcel) {
              reader.onload = async (event) => {
                const arrayBuffer = event.target?.result as ArrayBuffer;
                try {
                  const XLSX = await import("xlsx");
                  const data = new Uint8Array(arrayBuffer);
                  const workbook = XLSX.read(data, { type: "array" });
                  const firstSheetName = workbook.SheetNames[0];
                  const worksheet = workbook.Sheets[firstSheetName];
                  const sheetArray = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                  setFileContent(file.name, JSON.stringify(sheetArray));
                } catch (err) {
                  console.error("Error parsing xlsx", err);
                  setFileContent(file.name, "Error: Could not parse Excel spreadsheet.");
                }
              };
              reader.readAsArrayBuffer(file);
            } else {
              reader.onload = (event) => {
                const text = event.target?.result as string;
                setFileContent(file.name, text);
              };
              reader.readAsText(file);
            }

            // Reset projectFiles, project, and tabs to treat as a standalone file workspace
            setCurrentProject("Standalone File");
            setProjectFiles([{ name: file.name, type: "file" as const, path: `/local-uploads/${file.name}` }]);
            useAppStore.setState({ workbenchTabs: [] });
            openWorkbenchTab(`file:${file.name}`, "file", file.name);
          }
        }}
      />

      {/* Hidden Native Folder Selector */}
      <input 
        type="file" 
        id="native-folder-picker" 
        className="hidden" 
        // @ts-ignore
        webkitdirectory="" 
        directory="" 
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            const relativePath = files[0].webkitRelativePath;
            const folderName = relativePath.split("/")[0] || "Selected Folder";
            
            // Smart Filtering: ignore system / compiled / dependency directories to run blazing fast
            const ignoredFolders = ["node_modules", ".next", ".git", ".gemini", "dist", "build", "out", ".vscode", "tmp", "temp", "cache"];
            
            const filteredFiles = Array.from(files).filter((file) => {
              const parts = file.webkitRelativePath.toLowerCase().split("/");
              // Ignore matches
              return !parts.some(part => ignoredFolders.includes(part)) && !file.name.startsWith(".");
            });

            // Read actual file contents client-side
            filteredFiles.forEach((file) => {
              const isDocx = file.name.endsWith(".docx") || file.name.endsWith(".doc");
              const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
              const reader = new FileReader();

              if (isDocx) {
                reader.onload = async (event) => {
                  const arrayBuffer = event.target?.result as ArrayBuffer;
                  try {
                    const mammoth = await import("mammoth");
                    const result = await mammoth.convertToHtml({ arrayBuffer });
                    setFileContent(file.name, result.value);
                  } catch (err) {
                    console.error("Error parsing docx", err);
                    setFileContent(file.name, "Error: Could not extract text from Word document.");
                  }
                };
                reader.readAsArrayBuffer(file);
              } else if (isExcel) {
                reader.onload = async (event) => {
                  const arrayBuffer = event.target?.result as ArrayBuffer;
                  try {
                    const XLSX = await import("xlsx");
                    const data = new Uint8Array(arrayBuffer);
                    const workbook = XLSX.read(data, { type: "array" });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const sheetArray = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    setFileContent(file.name, JSON.stringify(sheetArray));
                  } catch (err) {
                    console.error("Error parsing xlsx", err);
                    setFileContent(file.name, "Error: Could not parse Excel spreadsheet.");
                  }
                };
                reader.readAsArrayBuffer(file);
              } else {
                reader.onload = (event) => {
                  const text = event.target?.result as string;
                  setFileContent(file.name, text);
                };
                reader.readAsText(file);
              }
            });

            const mappedFiles = filteredFiles.map((f) => ({
              name: f.name,
              type: "file" as const,
              path: `/${folderName}/${f.webkitRelativePath}`
            }));

            const uniqueFiles = mappedFiles.filter((file, index, self) =>
              index === self.findIndex((t) => t.name === file.name)
            );

            // Cap at 15 items to prevent browser lag and UI freezing
            const cappedFiles = uniqueFiles.slice(0, 15);
            
            setCurrentProject(folderName);
            setProjectFiles(cappedFiles);
            
            // Reset workbench tabs to clean slate for this standalone folder
            useAppStore.setState({ workbenchTabs: [] });

            if (cappedFiles.length > 0) {
              openWorkbenchTab(`file:${cappedFiles[0].name}`, "file", cappedFiles[0].name);
            }
          }
        }}
      />

      {/* Modal 1: Open File */}
      {isOpenFileDialogOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center font-sans">
          <div className="bg-[#1e1e1e] border border-[#2b2b2b] rounded-lg shadow-2xl w-[480px] overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex justify-between items-center px-4 py-3 bg-[#181818] border-b border-[#2b2b2b]">
              <span className="text-xs font-bold uppercase tracking-wider text-[#858585]">Open Survey File / Dataset</span>
              <button 
                onClick={() => setOpenFileDialogOpen(false)}
                className="text-[#858585] hover:text-white bg-transparent border-none cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              {/* Native selection shortcut */}
              <button
                onClick={() => {
                  document.getElementById("native-file-picker")?.click();
                  setOpenFileDialogOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 bg-[#007acc] hover:bg-[#005f9e] text-white text-xs font-bold rounded cursor-pointer transition-colors border-none"
              >
                <FolderOpen className="h-4 w-4" />
                Choose local file from computer...
              </button>

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#858585]" />
                <input 
                  type="text" 
                  placeholder="Search project files..." 
                  value={fileSearch}
                  onChange={(e) => setFileSearch(e.target.value)}
                  className="w-full bg-[#252526] border border-[#3c3c3c] text-white text-xs pl-8 pr-3 py-2 rounded focus:outline-none focus:border-[#007acc] outline-none"
                />
              </div>

              {/* File List */}
              <div className="space-y-1">
                <span className="text-[10px] uppercase text-[#858585] font-bold block mb-1">Files in {currentProject}</span>
                <div className="space-y-0.5 max-h-[180px] overflow-y-auto pr-1">
                  {projectFiles
                    .filter(f => f.name.toLowerCase().includes(fileSearch.toLowerCase()))
                    .map((file) => {
                      let FileIcon = FileText;
                      let color = "text-[#9cdcfe]";
                      if (file.name.endsWith(".dat")) {
                        FileIcon = Table;
                        color = "text-[#4fc1ff]";
                      } else if (file.name.endsWith(".grd")) {
                        FileIcon = Layers;
                        color = "text-[#4ec9b0]";
                      } else if (file.name.endsWith(".json")) {
                        FileIcon = Braces;
                        color = "text-[#d7ba7d]";
                      } else if (file.name.endsWith(".yaml") || file.name.endsWith(".yml")) {
                        FileIcon = FileCode;
                        color = "text-[#ce9178]";
                      } else if (file.name.endsWith(".csv")) {
                        FileIcon = FileText;
                        color = "text-[#9cdcfe]";
                      }
                      
                      return (
                        <button
                          key={file.name}
                          onClick={() => {
                            openWorkbenchTab(`file:${file.name}`, "file", file.name);
                            setOpenFileDialogOpen(false);
                            setFileSearch("");
                          }}
                          className="w-full flex items-center justify-between px-2 py-2 rounded hover:bg-[#2a2d2e] text-[#cccccc] hover:text-white text-left font-sans text-xs border-none bg-transparent cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <FileIcon className={cn("h-4 w-4 shrink-0", color)} />
                            <span>{file.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-[#858585]">{file.path}</span>
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="border-t border-[#2b2b2b] pt-4">
                <span className="text-[10px] uppercase text-[#858585] font-bold block mb-2">Create New File</span>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="e.g. aquifer_depths.csv, test_ert.dat" 
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    className="flex-1 bg-[#252526] border border-[#3c3c3c] text-white text-xs px-3 py-1.5 rounded focus:outline-none focus:border-[#007acc] outline-none"
                  />
                  <button
                    disabled={!newFileName}
                    onClick={() => {
                      if (!newFileName) return;
                      addProjectFile(newFileName, "file", `/${currentProject.toLowerCase().replace(/\s+/g, '-')}/${newFileName}`);
                      openWorkbenchTab(`file:${newFileName}`, "file", newFileName);
                      setNewFileName("");
                      setOpenFileDialogOpen(false);
                    }}
                    className="px-3 py-1.5 bg-[#007acc] hover:bg-[#005f9e] disabled:bg-[#555555] text-white text-xs font-semibold rounded cursor-pointer border-none transition-colors"
                  >
                    Create & Open
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Open Folder / Switch Projects */}
      {isOpenFolderDialogOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center font-sans">
          <div className="bg-[#1e1e1e] border border-[#2b2b2b] rounded-lg shadow-2xl w-[450px] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-4 py-3 bg-[#181818] border-b border-[#2b2b2b]">
              <span className="text-xs font-bold uppercase tracking-wider text-[#858585]">Open Folder / Switch Project</span>
              <button 
                onClick={() => setOpenFolderDialogOpen(false)}
                className="text-[#858585] hover:text-white bg-transparent border-none cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <button
                onClick={() => {
                  document.getElementById("native-folder-picker")?.click();
                  setOpenFolderDialogOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 bg-[#007acc] hover:bg-[#005f9e] text-white text-xs font-bold rounded cursor-pointer transition-colors border-none"
              >
                <FolderOpen className="h-4 w-4" />
                Select local folder from computer...
              </button>

              <span className="text-[10px] uppercase text-[#858585] font-bold block">Available Geophysical Projects</span>
              <div className="space-y-1">
                {[
                  {
                    name: "Nevada Basin Survey 2026",
                    desc: "Wenner-Schlumberger quad-pole ERT lines, regional gravity anomalies, and clay stratigraphy well logs.",
                    files: ["line4_ert.dat", "basin_gravity.grd", "survey_layout.json", "inversion_config.yaml", "well_log_bh12.csv"]
                  },
                  {
                    name: "Death Valley ERT Project",
                    desc: "Hyper-arid deep crustal resistivity models, active graben fault gravity logs, and thermal well surveys.",
                    files: ["dv_survey_ert.dat", "valley_gravity.grd", "fault_layout.json", "dv_solver_setup.yaml"]
                  },
                  {
                    name: "Colorado Aquifer Gravity Grid",
                    desc: "Ogallala sandstone aquifer boundaries, high-density water table depletion surveys, and flow JSON parameters.",
                    files: ["co_aquifer_ert.dat", "gravity_anomaly.grd", "aquifer_wells.csv"]
                  },
                  {
                    name: "Texas Groundwater Inversion",
                    desc: "Deep limestone karst water reserves, aquifer subsidence gravity logs, and fracture mesh grids.",
                    files: ["tx_groundwater.dat", "karst_gravity.grd", "subsidence_wells.csv", "karst_inversion.yaml"]
                  }
                ].map((proj) => {
                  const isActive = currentProject === proj.name;
                  return (
                    <button
                      key={proj.name}
                      onClick={() => {
                        setCurrentProject(proj.name);
                        // Populate project-specific files dynamically!
                        const populated = proj.files.map(f => ({
                          name: f,
                          type: "file" as const,
                          path: `/${proj.name.toLowerCase().replace(/\s+/g, '-')}/${f}`
                        }));
                        setProjectFiles(populated);
                        setOpenFolderDialogOpen(false);
                      }}
                      className={cn(
                        "w-full text-left p-3 rounded-lg border transition-all cursor-pointer bg-transparent",
                        isActive 
                          ? "border-[#007acc] bg-[#007acc]/5 hover:bg-[#007acc]/10" 
                          : "border-[#2b2b2b] hover:border-[#3c3c3c] hover:bg-white/5"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Folder className={cn("h-4 w-4", isActive ? "text-[#007acc]" : "text-[#858585]")} />
                        <span className="text-xs font-bold text-white">{proj.name}</span>
                        {isActive && <span className="text-[9px] bg-[#007acc]/20 text-[#007acc] px-1.5 py-0.5 rounded font-medium ml-auto">Active</span>}
                      </div>
                      <p className="text-[10px] text-[#858585] leading-relaxed mb-1">{proj.desc}</p>
                      <div className="text-[9px] font-mono text-[#555555] truncate">
                        Files: {proj.files.join(", ")}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Save File As */}
      {isSaveAsDialogOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center font-sans">
          <div className="bg-[#1e1e1e] border border-[#2b2b2b] rounded-lg shadow-2xl w-[400px] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-4 py-3 bg-[#181818] border-b border-[#2b2b2b]">
              <span className="text-xs font-bold uppercase tracking-wider text-[#858585]">Save File As</span>
              <button 
                onClick={() => setSaveAsDialogOpen(false)}
                className="text-[#858585] hover:text-white bg-transparent border-none cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase text-[#858585] font-bold block">Filename</label>
                <input 
                  type="text" 
                  value={saveAsName}
                  onChange={(e) => setSaveAsName(e.target.value)}
                  placeholder="e.g. line4_ert_copy.dat"
                  className="w-full bg-[#252526] border border-[#3c3c3c] text-white text-xs px-3 py-2 rounded focus:outline-none focus:border-[#007acc] outline-none font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setSaveAsDialogOpen(false)}
                  className="px-3 py-1.5 bg-transparent border border-[#3c3c3c] hover:bg-white/5 text-[#cccccc] text-xs font-semibold rounded cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={!saveAsName}
                  onClick={() => {
                    if (!saveAsName) return;
                    addProjectFile(saveAsName, "file", `/${currentProject.toLowerCase().replace(/\s+/g, '-')}/${saveAsName}`);
                    saveFile(saveAsName); // save changes
                    openWorkbenchTab(`file:${saveAsName}`, "file", saveAsName);
                    setSaveAsDialogOpen(false);
                  }}
                  className="px-4 py-1.5 bg-[#007acc] hover:bg-[#005f9e] disabled:bg-[#555555] text-white text-xs font-semibold rounded cursor-pointer border-none transition-colors"
                >
                  Save As
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
    </ThemeProvider>
  );
}

