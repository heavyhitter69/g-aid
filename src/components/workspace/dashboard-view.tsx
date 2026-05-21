"use client";

import Image from "next/image";
import { FolderOpen, DownloadCloud, TerminalSquare, Box } from "lucide-react";
import { useAppStore } from "@/store/app-store";

export function DashboardView() {
  const { currentProject, setCurrentProject, setProjectFiles } = useAppStore();

  const handleOpenDemoProject = () => {
    setCurrentProject("Nevada Basin Survey 2026");
    setProjectFiles([
      { name: "line4_ert.dat", type: "file", path: "/nevada-basin-survey-2026/line4_ert.dat" },
      { name: "basin_gravity.grd", type: "file", path: "/nevada-basin-survey-2026/basin_gravity.grd" },
      { name: "survey_layout.json", type: "file", path: "/nevada-basin-survey-2026/survey_layout.json" },
      { name: "inversion_config.yaml", type: "file", path: "/nevada-basin-survey-2026/inversion_config.yaml" },
      { name: "well_log_bh12.csv", type: "file", path: "/nevada-basin-survey-2026/well_log_bh12.csv" }
    ]);
  };

  if (currentProject) {
    // Show keyboard shortcuts when a project IS opened
    return (
      <div className="h-full bg-[var(--ws-panel)] flex items-center justify-center select-none relative">
        <div className="flex flex-col items-center opacity-60">
          <div className="mb-12 flex items-center justify-center filter drop-shadow-[0_0_15px_rgba(0,122,204,0.3)]">
            <Image src="/g-aid logo.png" alt="G-AID" width={160} height={56} className="object-contain" priority />
          </div>

          <div className="grid grid-cols-[auto_auto] gap-x-8 gap-y-3 text-[var(--ws-text)] text-[13px]">
            <div className="text-right font-sans">New Agent</div>
            <div className="font-mono text-[11px] flex items-center gap-1">
              <span className="bg-[var(--ws-input-bg)] px-1.5 py-0.5 rounded text-[var(--ws-text-bright)] border border-[var(--ws-border)]">Ctrl</span> + <span className="bg-[var(--ws-input-bg)] px-1.5 py-0.5 rounded text-[var(--ws-text-bright)] border border-[var(--ws-border)]">Shift</span> + <span className="bg-[var(--ws-input-bg)] px-1.5 py-0.5 rounded text-[var(--ws-text-bright)] border border-[var(--ws-border)]">L</span>
            </div>
            
            <div className="text-right font-sans">Search Files</div>
            <div className="font-mono text-[11px] flex items-center gap-1">
              <span className="bg-[var(--ws-input-bg)] px-1.5 py-0.5 rounded text-[var(--ws-text-bright)] border border-[var(--ws-border)]">Ctrl</span> + <span className="bg-[var(--ws-input-bg)] px-1.5 py-0.5 rounded text-[var(--ws-text-bright)] border border-[var(--ws-border)]">P</span>
            </div>

            <div className="text-right font-sans">Maximize Chat</div>
            <div className="font-mono text-[11px] flex items-center gap-1">
              <span className="bg-[var(--ws-input-bg)] px-1.5 py-0.5 rounded text-[var(--ws-text-bright)] border border-[var(--ws-border)]">Ctrl</span> + <span className="bg-[var(--ws-input-bg)] px-1.5 py-0.5 rounded text-[var(--ws-text-bright)] border border-[var(--ws-border)]">Alt</span> + <span className="bg-[var(--ws-input-bg)] px-1.5 py-0.5 rounded text-[var(--ws-text-bright)] border border-[var(--ws-border)]">E</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show the Start Screen when NO project is opened
  return (
    <div className="h-full bg-[var(--ws-panel)] flex items-center justify-center select-none overflow-y-auto">
      <div className="flex flex-col max-w-3xl w-full px-8 py-12">
        {/* Logo and Plan */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <Image src="/g-aid logo.png" alt="G-AID" width={140} height={40} className="object-contain" priority />
          </div>
          <div className="text-[#858585] text-sm ml-2">
            Free Plan &middot; <span className="text-[#007acc] cursor-pointer hover:underline">Upgrade</span>
          </div>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <button 
            onClick={handleOpenDemoProject}
            className="flex flex-col items-start p-5 bg-[var(--ws-panel-alt)] hover:bg-[var(--ws-panel-hover)] border border-[var(--ws-border)] rounded-xl transition-colors cursor-pointer text-left group"
          >
            <FolderOpen className="h-5 w-5 text-[#cccccc] group-hover:text-white mb-3" />
            <span className="text-[#cccccc] group-hover:text-white font-medium text-sm">Open project</span>
          </button>
          <button className="flex flex-col items-start p-5 bg-[var(--ws-panel-alt)] hover:bg-[var(--ws-panel-hover)] border border-[var(--ws-border)] rounded-xl transition-colors cursor-pointer text-left group">
            <DownloadCloud className="h-5 w-5 text-[#cccccc] group-hover:text-white mb-3" />
            <span className="text-[#cccccc] group-hover:text-white font-medium text-sm">Clone repo</span>
          </button>
          <button className="flex flex-col items-start p-5 bg-[var(--ws-panel-alt)] hover:bg-[var(--ws-panel-hover)] border border-[var(--ws-border)] rounded-xl transition-colors cursor-pointer text-left group">
            <TerminalSquare className="h-5 w-5 text-[#cccccc] group-hover:text-white mb-3" />
            <span className="text-[#cccccc] group-hover:text-white font-medium text-sm">Connect via SSH</span>
          </button>
        </div>

        {/* Recent Projects */}
        <div>
          <h3 className="text-[#858585] text-xs font-semibold mb-4 px-2">Recent projects</h3>
          <div className="flex flex-col">
            <div 
              onClick={handleOpenDemoProject}
              className="flex justify-between items-center py-2 px-2 hover:bg-[var(--ws-panel-hover)] rounded cursor-pointer transition-colors group"
            >
              <span className="text-[#cccccc] group-hover:text-white text-sm font-medium">Nevada Basin Survey 2026</span>
              <span className="text-[#555555] group-hover:text-[#858585] text-xs font-mono hidden sm:block">
                C:\Projects\nevada-basin-survey
              </span>
            </div>
            <div className="flex justify-between items-center py-2 px-2 hover:bg-[var(--ws-panel-hover)] rounded cursor-pointer transition-colors group">
              <span className="text-[#cccccc] group-hover:text-white text-sm font-medium">geophysics-demo2.0</span>
              <span className="text-[#555555] group-hover:text-[#858585] text-xs font-mono hidden sm:block">
                C:\Users\sarko\Documents\geophysics-demo2.0
              </span>
            </div>
            <div className="flex justify-between items-center py-2 px-2 hover:bg-[var(--ws-panel-hover)] rounded cursor-pointer transition-colors group">
              <span className="text-[#cccccc] group-hover:text-white text-sm font-medium">genie-dev</span>
              <span className="text-[#555555] group-hover:text-[#858585] text-xs font-mono hidden sm:block">
                C:\Users\sarko\Documents\genie-dev
              </span>
            </div>
            <div className="flex justify-between items-center py-2 px-2 hover:bg-[var(--ws-panel-hover)] rounded cursor-pointer transition-colors group">
              <span className="text-[#cccccc] group-hover:text-white text-sm font-medium">JOEY THE BRAND</span>
              <span className="text-[#555555] group-hover:text-[#858585] text-xs font-mono hidden sm:block">
                C:\Users\sarko\Documents\joey-the-brand
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

