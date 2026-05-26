"use client";

import Image from "next/image";
import { FolderOpen, DownloadCloud, TerminalSquare, Clock, Folder } from "lucide-react";
import { useAppStore } from "@/store/app-store";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function DashboardView() {
  const { currentProject, recentProjects } = useAppStore();

  const openPicker = () => document.getElementById("native-folder-picker")?.click();

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
            onClick={() => document.getElementById("native-folder-picker")?.click()}
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
            {recentProjects.length > 0 ? (
              recentProjects.map((proj) => (
                <div
                  key={`${proj.name}-${proj.openedAt}`}
                  onClick={openPicker}
                  className="flex justify-between items-center py-2.5 px-2 hover:bg-[var(--ws-panel-hover)] rounded cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Folder className="h-4 w-4 text-[#555555] group-hover:text-[#858585] shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[#cccccc] group-hover:text-white text-sm font-medium truncate">
                        {proj.name}
                      </span>
                      <span className="text-[#444444] text-[10px] flex items-center gap-1.5">
                        <Clock className="h-2.5 w-2.5" />
                        {timeAgo(proj.openedAt)}
                        {proj.fileCount > 0 && (
                          <span className="ml-1">&middot; {proj.fileCount} file{proj.fileCount === 1 ? "" : "s"}</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <span className="text-[#555555] group-hover:text-[#858585] text-xs font-mono hidden sm:block truncate ml-4 max-w-[45%] text-right">
                    {proj.path}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-6 text-center">
                <p className="text-[#555555] text-xs">No recent projects</p>
                <p className="text-[#444444] text-[10px] mt-1">Open a folder to get started</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

