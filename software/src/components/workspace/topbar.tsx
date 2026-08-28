"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Settings, ChevronRight, Check } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { isDesktop } from "@/lib/desktop";
import { openWorkspaceFolder } from "@/lib/open-workspace";

function CursorChatIcon({ className, active }: { className?: string; active?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden>
      <path
        d="M3.25 2.75h9.5A1.75 1.75 0 0 1 14.5 4.5v5.75a1.75 1.75 0 0 1-1.75 1.75H8.06L5.2 14.4a.4.4 0 0 1-.7-.27v-2.13H3.25A1.75 1.75 0 0 1 1.5 10.25V4.5A1.75 1.75 0 0 1 3.25 2.75Z"
        fill={active ? "#ffffff" : "#9B9B9B"}
      />
    </svg>
  );
}

export function Topbar() {
  const { 
    currentProject, 
    toggleChatPanel,
    isChatPanelOpen,
    setActiveLeftSidebarTab,
    setLeftSidebarOpen,
    openWorkbenchTab,
    autoSave,
    setAutoSave,
    dirtyFiles,
    saveFile,
    saveAllFiles,
    activeFile,
    setOpenFileDialogOpen,
    setOpenFolderDialogOpen,
    setSaveAsDialogOpen
  } = useAppStore();
  
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    setDesktop(isDesktop());
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "n") return;
      event.preventDefault();
      void window.gaidDesktop?.openNewWindow?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Flat interface — all properties optional so any property access is safe
  // after `item.type === "divider"` early-return guard in the render loop
  interface MenuItem {
    type?: "divider";
    label?: string;
    shortcut?: string;
    action?: string;
    disabled?: boolean;
    hasChevron?: boolean;
    isToggle?: boolean;
  }

  const fileMenuItems: MenuItem[] = [
    { label: "New Window", shortcut: "Ctrl+Shift+N", action: "new-window" },
    { type: "divider" },
    { label: "Open File...", shortcut: "Ctrl+O", action: "open-file" },
    { label: "Open Folder...", shortcut: "Ctrl+M Ctrl+O", action: "open-folder" },
    { label: "Open Workspace from File..." },
    { label: "Open Recent", hasChevron: true },
    { type: "divider" },
    { label: "Add Folder to Workspace..." },
    { label: "Save Workspace As..." },
    { label: "Duplicate Workspace" },
    { type: "divider" },
    { label: "Save", shortcut: "Ctrl+S", disabled: !activeFile || (!autoSave && !dirtyFiles.includes(activeFile)), action: "save" },
    { label: "Save As...", shortcut: "Ctrl+Shift+S", disabled: !activeFile, action: "save-as" },
    { label: "Save All", shortcut: "Ctrl+M S", disabled: autoSave || dirtyFiles.length === 0, action: "save-all" },
    { type: "divider" },
    { label: "Share", hasChevron: true },
    { type: "divider" },
    { label: "Auto Save", isToggle: true },
    { label: "Preferences", hasChevron: true, action: "settings" },
    { type: "divider" },
    { label: "Revert File", disabled: true },
    { label: "Close Editor", shortcut: "Ctrl+F4", disabled: true },
    { label: "Close Folder", shortcut: "Ctrl+M F" },
    { label: "Close Window", shortcut: "Alt+F4" },
    { type: "divider" },
    { label: "Exit" }
  ];

  const editMenuItems: MenuItem[] = [
    { label: "Undo", shortcut: "Ctrl+Z" },
    { label: "Redo", shortcut: "Ctrl+Y" },
    { type: "divider" },
    { label: "Cut", shortcut: "Ctrl+X" },
    { label: "Copy", shortcut: "Ctrl+C" },
    { label: "Paste", shortcut: "Ctrl+V" },
    { type: "divider" },
    { label: "Find", shortcut: "Ctrl+F" },
    { label: "Replace", shortcut: "Ctrl+H" },
    { type: "divider" },
    { label: "Find in Files", shortcut: "Ctrl+Shift+F", action: "search" },
    { label: "Replace in Files", shortcut: "Ctrl+Shift+H", action: "search" }
  ];

  return (
    <header className={cn(
      "h-[36px] bg-[#181818] border-b border-[#2b2b2b] flex items-center justify-between shrink-0 select-none z-50 relative gaid-drag",
      desktop && "pr-[138px]"
    )}>
      <div className="flex items-center h-full gaid-no-drag">
        <Image
          src="/app-icon.png"
          alt="G-AID"
          width={16}
          height={16}
          className="ml-2 mr-1 h-4 w-4 rounded-[3.5px] object-cover pointer-events-none select-none"
          priority
        />
        <menu className="flex items-center h-full text-[13px] text-[#cccccc] space-x-0.5 list-none p-0 m-0">
          
          {/* File Menu Header */}
          <li 
            className="relative h-full flex items-center"
            onMouseEnter={() => setActiveMenu("File")}
            onMouseLeave={() => setActiveMenu(null)}
          >
            <button className={cn(
              "px-2 py-1 hover:bg-white/10 rounded cursor-pointer leading-[28px] text-[13px] text-[#cccccc] outline-none border-none bg-transparent",
              activeMenu === "File" && "bg-white/10"
            )}>
              File
            </button>
            
            {activeMenu === "File" && (
              <div className="absolute left-0 top-full mt-0.5 bg-[#1e1e1e] border border-[#2b2b2b] shadow-2xl rounded-md w-[280px] py-1 z-50 flex flex-col text-[11px] font-sans">
                {fileMenuItems.map((item, idx) => {
                  if (item.type === "divider") {
                    return <div key={idx} className="h-[1px] bg-[#2b2b2b] my-1" />;
                  }

                  const isAutoSave = item.isToggle && item.label === "Auto Save";
                  const showCheck = isAutoSave && autoSave;

                  return (
                    <button
                      key={idx}
                      disabled={item.disabled}
                      onClick={() => {
                        if (isAutoSave) {
                          setAutoSave(!autoSave);
                        } else if (item.action === "new-window") {
                          void window.gaidDesktop?.openNewWindow?.();
                        } else if (item.action === "settings") {
                          openWorkbenchTab("settings", "settings", "Settings");
                        } else if (item.action === "open-file") {
                          document.getElementById("native-file-picker")?.click();
                        } else if (item.action === "open-folder") {
                          void openWorkspaceFolder();
                        } else if (item.action === "save" && activeFile) {
                          saveFile(activeFile);
                        } else if (item.action === "save-as") {
                          setSaveAsDialogOpen(true);
                        } else if (item.action === "save-all") {
                          saveAllFiles();
                        }
                        setActiveMenu(null);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors relative pl-7",
                        item.disabled 
                          ? "text-[#555555] cursor-default bg-transparent" 
                          : "text-[#cccccc] hover:bg-[#007acc] hover:text-white cursor-pointer"
                      )}
                    >
                      {/* Checkmark gutter */}
                      <span className="absolute left-2 flex items-center justify-center w-3 h-3">
                        {showCheck && <Check className="h-3 w-3 stroke-[2.5]" />}
                      </span>

                      <span>{item.label}</span>
                      
                      {item.shortcut && (
                        <span className={cn(
                          "text-[10px] text-[#858585] font-mono",
                          !item.disabled && "group-hover:text-white"
                        )}>
                          {item.shortcut}
                        </span>
                      )}

                      {item.hasChevron && (
                        <ChevronRight className="h-3 w-3 text-[#858585] ml-2" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </li>

          {/* Edit Menu Header */}
          <li 
            className="relative h-full flex items-center"
            onMouseEnter={() => setActiveMenu("Edit")}
            onMouseLeave={() => setActiveMenu(null)}
          >
            <button className={cn(
              "px-2 py-1 hover:bg-white/10 rounded cursor-pointer leading-[28px] text-[13px] text-[#cccccc] outline-none border-none bg-transparent",
              activeMenu === "Edit" && "bg-white/10"
            )}>
              Edit
            </button>
            
            {activeMenu === "Edit" && (
              <div className="absolute left-0 top-full mt-0.5 bg-[#1e1e1e] border border-[#2b2b2b] shadow-2xl rounded-md w-[220px] py-1 z-50 flex flex-col text-[11px] font-sans">
                {editMenuItems.map((item, idx) => {
                  if (item.type === "divider") {
                    return <div key={idx} className="h-[1px] bg-[#2b2b2b] my-1" />;
                  }

                  return (
                    <button
                      key={idx}
                      disabled={item.disabled}
                      onClick={() => {
                        if (item.action === "search") {
                          setActiveLeftSidebarTab("search");
                          setLeftSidebarOpen(true);
                        }
                        setActiveMenu(null);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-1.5 text-left transition-colors relative pl-6",
                        item.disabled 
                          ? "text-[#555555] cursor-default bg-transparent" 
                          : "text-[#cccccc] hover:bg-[#007acc] hover:text-white cursor-pointer"
                      )}
                    >
                      <span>{item.label}</span>
                      
                      {item.shortcut && (
                        <span className={cn(
                          "text-[10px] text-[#858585] font-mono"
                        )}>
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </li>

          {["Help"].map((item) => (
            <li key={item} className="px-2 hover:bg-white/10 rounded cursor-pointer leading-[28px] text-[13px] text-[#cccccc]">{item}</li>
          ))}
        </menu>
      </div>

      <div className="absolute left-1/2 -translate-x-1/2 flex items-center text-[12px] text-[#cccccc] pointer-events-none font-sans font-medium tracking-wide">
        <span>{currentProject ? currentProject.toLowerCase().replace(/\s+/g, '-') : "GEOPHYSICS - AGENT ITERATION DOMAIN"}</span>
      </div>

      <div className="flex items-center h-full gap-0.5 text-[#cccccc] z-10 gaid-no-drag">
        <button className="flex items-center gap-1.5 mx-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-sans transition-all duration-200 border border-[#007acc]/40 bg-gradient-to-r from-[#007acc]/20 to-[#005f9e]/20 text-[#4fc3f7] hover:from-[#007acc]/35 hover:to-[#005f9e]/35 hover:border-[#007acc]/70 hover:text-white hover:shadow-[0_0_12px_rgba(0,122,204,0.3)] shrink-0">
          Upgrade to Pro
        </button>

        <div className="relative group flex items-center h-full">
          <button 
            onClick={toggleChatPanel} 
            className="h-full px-2 flex items-center justify-center transition-colors hover:bg-white/10"
            title="Chat"
            aria-pressed={isChatPanelOpen}
          >
            <CursorChatIcon className="h-[16px] w-[16px]" active={isChatPanelOpen} />
          </button>
          <div className="absolute top-[105%] left-1/2 -translate-x-1/2 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap font-sans font-medium">
            Chat
          </div>
        </div>

        <div className="relative group flex items-center h-full">
          <button 
            onClick={() => openWorkbenchTab("settings", "settings", "Settings")} 
            className="h-full px-2 hover:bg-white/10 flex items-center justify-center transition-colors"
            title="Settings"
          >
            <Settings className="h-[16px] w-[16px] stroke-[1.5]" />
          </button>
          <div className="absolute top-[105%] left-1/2 -translate-x-1/2 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap font-sans font-medium">
            Settings
          </div>
        </div>
      </div>
    </header>
  );
}
