"use client";

import { ChevronRight, ChevronDown, ChevronUp, Files, Search, GitBranch, Wrench, Pin, Bug, Table, Layers, Braces, FileCode, FileText, PanelLeftClose } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useState, type ReactNode, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { PluginStoreSidebar } from "@/components/workspace/plugin-store";
import { ExplorerTree } from "@/components/workspace/explorer-tree";
import type { ProjectFile } from "@/types/project";
import { createWorkspaceEntry, copyWorkspaceEntry, deleteWorkspaceEntry, moveWorkspaceEntry, openWorkspaceFolder, refreshWorkspaceIndex, renameWorkspaceEntry } from "@/lib/open-workspace";
import { isGridPath, openJobMapFromPath } from "@/lib/job-results";

function ExplorerActionIcon({
  children,
  ...rest
}: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden {...rest}>
      {children}
    </svg>
  );
}

function NewFileIcon() {
  return (
    <ExplorerActionIcon>
      <path fillRule="evenodd" clipRule="evenodd" d="M9.5 1.1l3.4 3.5.1.4v2h-1V6H8V2H3v11h4v1H2.5l-.5-.5v-12l.5-.5h6.7l.3.1zM9 2v3h2.9L9 2zm4 14h-1v-3H9v-1h3V9h1v3h3v1h-3v3z" />
    </ExplorerActionIcon>
  );
}

function NewFolderIcon() {
  return (
    <ExplorerActionIcon>
      <path fillRule="evenodd" clipRule="evenodd" d="M14.5 2H7.71l-.85-.85L6.51 1h-5l-.5.5v11l.5.5H7v-1H1.99V6h4.49l.35-.15.86-.86H14v1.5l-.001.51h1.011V2.5L14.5 2zm-.51 2h-6.5l-.35.15-.86.86H2v-3h4.29l.85.85.36.15H14l-.01.99zM13 16h-1v-3H9v-1h3V9h1v3h3v1h-3v3z" />
    </ExplorerActionIcon>
  );
}

function RefreshIcon() {
  return (
    <ExplorerActionIcon>
      <path fillRule="evenodd" clipRule="evenodd" d="M4.681 3H2V2h3.5l.5.5V6H5V4a5 5 0 1 0 4.53-.761l.302-.954A6 6 0 1 1 4.681 3z" />
    </ExplorerActionIcon>
  );
}

function CollapseAllIcon() {
  return (
    <ExplorerActionIcon>
      <path d="M9 9H4v1h5V9z" />
      <path fillRule="evenodd" clipRule="evenodd" d="M5 3l1-1h7l1 1v7l-1 1h-2v2l-1 1H3l-1-1V6l1-1h2V3zm1 2h4l1 1v4h2V3H6v2zm4 1H3v7h7V6z" />
    </ExplorerActionIcon>
  );
}

function AuxTwistie({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" className="shrink-0 text-[#c5c5c5]" aria-hidden>
      <path d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" className="shrink-0 text-[#c5c5c5]" aria-hidden>
      <path d="M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z" />
    </svg>
  );
}

function ExplorerAuxPane({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col", open && "min-h-0")}>
      <button
        type="button"
        onClick={onToggle}
        className="h-[22px] w-full flex items-center gap-0.5 px-2 text-[11px] font-bold uppercase tracking-wide text-[#bbbbbb] hover:bg-[#2a2d2e] border-none bg-transparent cursor-pointer"
      >
        <AuxTwistie open={open} />
        <span className="truncate">{title}</span>
      </button>
      {open ? (
        <div className="max-h-[180px] overflow-y-auto px-2 pb-2 text-[11px] text-[#cccccc] font-sans">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 45_000) return "now";
  if (ms < 3_600_000) return `${Math.max(1, Math.floor(ms / 60_000))} min ago`;
  if (ms < 86_400_000) return `${Math.max(1, Math.floor(ms / 3_600_000))} hr ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Sidebar() {
  const { 
    isLeftSidebarOpen, 
    setLeftSidebarOpen, 
    activeLeftSidebarTab, 
    setActiveLeftSidebarTab,
    currentProject,
    workspaceRoot,
    openWorkbenchTab,
    projectFiles,
    addConversation,
    updateConversationTopic,
    addMessageToConversation,
    activeConversationId,
    setChatPanelOpen,
    layoutMode,
    leftSidebarWidth,
    setLeftSidebarWidth,
    activeFile,
    fileTimeline,
    pushTimelineEvent,
  } = useAppStore();

  const [explorerOpen, setExplorerOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [chevronOpen, setChevronOpen] = useState(false);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [creating, setCreating] = useState<"file" | "folder" | null>(null);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState("");
  const [createPrefix, setCreatePrefix] = useState("");
  const [selected, setSelected] = useState<{ id: string; kind: "file" | "folder" } | null>(null);
  const [clip, setClip] = useState<{ mode: "copy" | "cut"; id: string; kind: "file" | "folder" } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFolder, setSearchFolder] = useState<string | null>(null);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    fileId: string;
    kind: "file" | "folder";
  } | null>(null);

  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftSidebarWidth;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      // In agent mode the sidebar is on the RIGHT: dragging left grows it
      const delta = moveEvent.clientX - startX;
      const newWidth = layoutMode === "agent"
        ? startWidth - delta
        : startWidth + delta;
      setLeftSidebarWidth(Math.max(200, Math.min(newWidth, 600)));
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
    };

    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  // Rename States
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Tracks which tabs are pinned to the horizontal bar
  const [pinnedTabs, setPinnedTabs] = useState({
    explorer: true,
    search: true,
    git: true,
    extensions: true,
    debug: false // Starts unpinned, just like in the screenshot
  });

  const allSidebarTabs = [
    { id: "explorer", label: "Explorer", shortcut: "Ctrl+Shift+E", icon: Files },
    { id: "search", label: "Search", shortcut: "Ctrl+Shift+F", icon: Search },
    { id: "git", label: "Source Control", shortcut: "Ctrl+Shift+G", icon: GitBranch },
    { id: "extensions", label: "Plugins", shortcut: "Ctrl+Shift+X", icon: Wrench },
    { id: "debug", label: "Run and Debug", shortcut: "Ctrl+Shift+D", icon: Bug }
  ];

  const handleTabClick = (tabId: string) => {
    if (isLeftSidebarOpen && activeLeftSidebarTab === tabId) {
      // If open and active tab clicked -> close it
      setLeftSidebarOpen(false);
    } else {
      // If closed or different tab clicked -> open and switch
      setActiveLeftSidebarTab(tabId);
      setLeftSidebarOpen(true);
    }
  };

  // Context Menu actions:
  const attachPath = () => {
    if (!contextMenu) return "";
    const fileId = contextMenu.fileId;
    return fileId.split("/").pop() ?? fileId;
  };

  const handleAddFileToChat = () => {
    if (!contextMenu) return;
    const displayName = attachPath();
    const label = contextMenu.kind === "folder" ? `folder ${displayName}` : displayName;
    addMessageToConversation(activeConversationId, {
      sender: "user",
      text: `@${label}`,
    });
    setChatPanelOpen(true);
    setContextMenu(null);
  };

  const handleAddFileToNewChat = () => {
    if (!contextMenu) return;
    const displayName = attachPath();
    const label = contextMenu.kind === "folder" ? `folder ${displayName}` : displayName;
    addConversation();
    setTimeout(() => {
      const newActiveId = useAppStore.getState().activeConversationId;
      updateConversationTopic(newActiveId, displayName);
      addMessageToConversation(newActiveId, {
        sender: "user",
        text: `@${label}`,
      });
    }, 100);
    setChatPanelOpen(true);
    setContextMenu(null);
  };

  const handleCopy = () => {
    if (!contextMenu) return;
    setClip({ mode: "copy", id: contextMenu.fileId, kind: contextMenu.kind });
    setContextMenu(null);
  };

  const handleCut = () => {
    if (!contextMenu) return;
    setClip({ mode: "cut", id: contextMenu.fileId, kind: contextMenu.kind });
    setContextMenu(null);
  };

  const pasteInto = async (destFolderId: string) => {
    if (!clip) return;
    try {
      if (clip.mode === "cut") {
        await moveWorkspaceEntry(clip.id, destFolderId);
        setClip(null);
      } else {
        await copyWorkspaceEntry(clip.id, destFolderId);
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not paste");
    }
  };

  const handlePaste = () => {
    if (!contextMenu || !clip) return;
    const dest =
      contextMenu.kind === "folder"
        ? contextMenu.fileId
        : contextMenu.fileId.includes("/")
          ? contextMenu.fileId.replace(/\/[^/]+$/, "")
          : "";
    void pasteInto(dest);
    setContextMenu(null);
  };

  const absolutePathFor = (fileId: string) => {
    const entry = projectFiles.find((f) => f.id === fileId);
    if (entry?.path && /^[a-zA-Z]:[\\/]/.test(entry.path)) return entry.path;
    if (workspaceRoot) return `${workspaceRoot}\\${fileId.replace(/\//g, "\\")}`;
    return entry?.path ?? fileId;
  };

  const handleCopyPath = () => {
    if (!contextMenu) return;
    void navigator.clipboard.writeText(absolutePathFor(contextMenu.fileId));
    setContextMenu(null);
  };

  const handleCopyRelativePath = () => {
    if (!contextMenu) return;
    void navigator.clipboard.writeText(contextMenu.fileId.replace(/\\/g, "/"));
    setContextMenu(null);
  };

  const handleRenameInitiate = () => {
    if (!contextMenu) return;
    setRenameTarget(contextMenu.fileId);
    setRenameValue(contextMenu.fileId.split("/").pop() ?? contextMenu.fileId);
    setContextMenu(null);
  };

  const handleRenameSubmit = async () => {
    if (!renameTarget) return;
    const next = renameValue.trim();
    const current = renameTarget.replace(/\\/g, "/").split("/").pop() || "";
    if (!next || next === current) {
      setRenameTarget(null);
      return;
    }
    try {
      await renameWorkspaceEntry(renameTarget, next);
      setRenameTarget(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not rename");
    }
  };

  const handleDelete = async () => {
    if (!contextMenu) return;
    const fileId = contextMenu.fileId;
    const name = fileId.replace(/\\/g, "/").split("/").pop() || fileId;
    const ok = window.confirm(
      contextMenu.kind === "folder"
        ? `Delete folder "${name}" and everything in it?\n\nIt will be moved to the Recycle Bin.`
        : `Delete "${name}"?\n\nIt will be moved to the Recycle Bin.`
    );
    if (!ok) {
      setContextMenu(null);
      return;
    }
    try {
      await deleteWorkspaceEntry(fileId);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not delete");
    }
    setContextMenu(null);
  };

  const handleOpenFile = (file: ProjectFile) => {
    if (isGridPath(file.id) && openJobMapFromPath(file.id, "file")) return;
    openWorkbenchTab(`file:${file.id}`, "file", file.name);
  };

  const handleOpenFolder = (folderId: string) => {
    openJobMapFromPath(folderId, "folder");
  };

  const openMap = () => {
    if (!contextMenu) return;
    openJobMapFromPath(contextMenu.fileId, contextMenu.kind);
    setContextMenu(null);
  };

  const openSelected = () => {
    if (!contextMenu || contextMenu.kind !== "file") return;
    const file = projectFiles.find((f) => f.id === contextMenu.fileId);
    if (file) handleOpenFile(file);
    setContextMenu(null);
  };

  const findInFolder = () => {
    if (contextMenu?.kind === "folder") setSearchFolder(contextMenu.fileId);
    else setSearchFolder(null);
    setSearchQuery("");
    setActiveLeftSidebarTab("search");
    setLeftSidebarOpen(true);
    setContextMenu(null);
  };

  const beginCreate = (kind: "file" | "folder", folderId?: string) => {
    let prefix = folderId;
    if (prefix === undefined) {
      if (selected?.kind === "folder") prefix = selected.id;
      else if (selected?.id.includes("/")) prefix = selected.id.replace(/\/[^/]+$/, "");
    }
    setExplorerOpen(true);
    setCreating(kind);
    setCreatePrefix(prefix ? `${prefix.replace(/\\/g, "/").replace(/\/?$/, "/")}` : "");
    setCreateName("");
    setCreateError("");
  };

  const submitCreate = async () => {
    if (!creating) return;
    try {
      await createWorkspaceEntry(creating, `${createPrefix}${createName}`);
      pushTimelineEvent({
        action: "created",
        label: createName,
        path: `${createPrefix}${createName}`.replace(/\\/g, "/"),
      });
      setCreating(null);
      setCreateName("");
      setCreateError("");
      setCreatePrefix("");
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Could not create");
    }
  };

  const handleContextMenu = (e: React.MouseEvent, fileId: string, kind: "file" | "folder") => {
    e.preventDefault();
    const menuWidth = 250;
    const menuHeight = 360;
    let posX = e.clientX;
    let posY = e.clientY;
    if (posX + menuWidth > window.innerWidth) posX = window.innerWidth - menuWidth - 10;
    if (posY + menuHeight > window.innerHeight) posY = window.innerHeight - menuHeight - 10;
    setContextMenu({ x: Math.max(10, posX), y: Math.max(10, posY), fileId, kind });
  };

  const revealInExplorer = () => {
    if (!contextMenu || !workspaceRoot || !window.gaidDesktop?.showItemInFolder) return;
    void window.gaidDesktop.showItemInFolder(workspaceRoot, contextMenu.fileId);
    setContextMenu(null);
  };

  const openWithDefaultApp = () => {
    if (!contextMenu || !workspaceRoot || !window.gaidDesktop?.openPath) return;
    void window.gaidDesktop.openPath(workspaceRoot, contextMenu.fileId);
    setContextMenu(null);
  };

  return (
    <aside 
      style={{ width: leftSidebarWidth }}
      className={cn(
        "shrink-0 bg-[#181818] flex flex-col text-[#cccccc] text-[11px] font-mono select-none overflow-hidden h-full relative z-10",
        layoutMode === "agent" ? "border-l border-[#2b2b2b]" : "border-r border-[#2b2b2b]"
      )}
    >
      <div 
        className={cn(
          "w-1.5 cursor-col-resize absolute top-0 bottom-0 z-50 hover:bg-[#007acc] transition-colors",
          layoutMode === "agent" ? "-left-[1px]" : "-right-[1px]"
        )}
        onMouseDown={handleSidebarResizeStart}
      />
      {/* Horizontal Icon Bar at top */}
      <div className="h-[40px] border-b border-[#2b2b2b] flex items-center px-3 gap-1 relative z-20 shrink-0 select-none">
        
        {/* Render only PINNED tabs */}
        {allSidebarTabs
          .filter(tab => pinnedTabs[tab.id as keyof typeof pinnedTabs])
          .map((tab) => {
            const Icon = tab.icon;
            const isActive = activeLeftSidebarTab === tab.id;
            return (
              <div key={tab.id} className="relative group flex items-center h-full">
                <button
                  onClick={() => handleTabClick(tab.id)}
                  className={cn(
                    "p-1.5 rounded hover:bg-white/5 text-[#858585] hover:text-[#cccccc] transition-colors",
                    isActive && "bg-[#2d2d2d] text-[#e1e1e1] border border-[#3c3c3c]"
                  )}
                >
                  <Icon className="h-4 w-4 stroke-[1.5]" />
                </button>
                <div className="absolute top-[105%] left-1/2 -translate-x-1/2 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap font-sans font-medium">
                  {tab.label.toLowerCase()}
                </div>
              </div>
            );
          })}

        {/* Chevron Dropdown Trigger */}
        <div className="relative group flex items-center h-full">
          <button 
            onClick={() => setChevronOpen(!chevronOpen)}
            className={cn(
              "p-1.5 rounded hover:bg-white/5 text-[#858585] hover:text-[#cccccc] ml-1 transition-colors",
              chevronOpen && "bg-[#2d2d2d] text-[#e1e1e1]"
            )}
          >
            {chevronOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <div className="absolute top-[105%] left-1/2 -translate-x-1/2 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap font-sans font-medium">
            views and more actions
          </div>
        </div>

        {/* Close Sidebar Toggle */}
        <div className="relative group flex items-center h-full ml-auto">
          <button 
            onClick={() => setLeftSidebarOpen(false)}
            className="p-1.5 rounded hover:bg-[#2d2d2d] text-[#858585] hover:text-[#cccccc] transition-colors"
          >
            <PanelLeftClose className={cn("h-4 w-4 stroke-[1.5]", layoutMode === "agent" && "rotate-180")} />
          </button>
          <div className="absolute top-[105%] right-0 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap font-sans font-medium">
            Close sidebar
          </div>
        </div>

        {/* Reveal to pin or unpin overlay */}
        {chevronOpen && (
          <div 
            onMouseLeave={() => setChevronOpen(false)}
            className="absolute right-2 top-full mt-0.5 bg-[#1e1e1e] border border-[#2b2b2b] shadow-2xl rounded-md w-[220px] py-1 z-50 flex flex-col text-[11px]"
          >
            {allSidebarTabs.map((tab) => {
              const Icon = tab.icon;
              const isPinned = pinnedTabs[tab.id as keyof typeof pinnedTabs];
              const isActive = activeLeftSidebarTab === tab.id;

              return (
                <div
                  key={tab.id}
                  onClick={() => {
                    setActiveLeftSidebarTab(tab.id);
                    setLeftSidebarOpen(true);
                    setChevronOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-1.5 hover:bg-[#2d2d2d] text-[#cccccc] cursor-pointer font-sans transition-colors",
                    isActive && "bg-[#2d2d2d] text-white"
                  )}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Icon className="h-3.5 w-3.5 text-[#858585]" />
                    <span className="truncate flex-1 font-medium">{tab.label}</span>
                    {tab.shortcut && (
                      <span className="text-[9px] text-[#555555] font-mono pr-2 shrink-0">{tab.shortcut}</span>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPinnedTabs({
                        ...pinnedTabs,
                        [tab.id]: !isPinned
                      });
                    }}
                    className={cn(
                      "p-1 rounded hover:bg-[#3d3d3d] transition-colors shrink-0",
                      isPinned ? "text-[#007acc]" : "text-[#555555] hover:text-[#cccccc]"
                    )}
                    title={isPinned ? "Unpin from tab bar" : "Pin to tab bar"}
                  >
                    <Pin className="h-3.5 w-3.5 rotate-45 stroke-[2]" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeLeftSidebarTab === "explorer" && (
          <>
            {/* Project Section */}
            <div className="mb-1">
              <div className="gaid-explorer-header sticky top-0 z-40 w-full h-[22px] flex items-center gap-0.5 px-2 bg-[#181818] hover:bg-[#2a2d2e]">
                <button
                  type="button"
                  onClick={() => setExplorerOpen(!explorerOpen)}
                  className="flex-1 min-w-0 flex items-center gap-1 font-bold text-[#cccccc] text-left border-none bg-transparent cursor-pointer"
                >
                  {explorerOpen ? (
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" className="shrink-0 text-[#c5c5c5]" aria-hidden>
                      <path d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" className="shrink-0 text-[#c5c5c5]" aria-hidden>
                      <path d="M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z" />
                    </svg>
                  )}
                  <span className="uppercase truncate">{currentProject ? currentProject.toUpperCase().replace(/\s+/g, '-') : "NO FOLDER OPENED"}</span>
                </button>
                {currentProject && (
                  <div className="flex items-center shrink-0 pr-0.5">
                    <button
                      type="button"
                      title="New File"
                      onClick={() => beginCreate("file")}
                      className="p-0.5 rounded text-[#858585] hover:text-[#cccccc] hover:bg-[#3d3d3d] border-none bg-transparent cursor-pointer"
                    >
                      <NewFileIcon />
                    </button>
                    <button
                      type="button"
                      title="New Folder"
                      onClick={() => beginCreate("folder")}
                      className="p-0.5 rounded text-[#858585] hover:text-[#cccccc] hover:bg-[#3d3d3d] border-none bg-transparent cursor-pointer"
                    >
                      <NewFolderIcon />
                    </button>
                    <button
                      type="button"
                      title="Refresh Explorer"
                      onClick={() => void refreshWorkspaceIndex()}
                      className="p-0.5 rounded text-[#858585] hover:text-[#cccccc] hover:bg-[#3d3d3d] border-none bg-transparent cursor-pointer"
                    >
                      <RefreshIcon />
                    </button>
                    <button
                      type="button"
                      title="Collapse Folders"
                      onClick={() => setCollapseSignal((n) => n + 1)}
                      className="p-0.5 rounded text-[#858585] hover:text-[#cccccc] hover:bg-[#3d3d3d] border-none bg-transparent cursor-pointer"
                    >
                      <CollapseAllIcon />
                    </button>
                  </div>
                )}
              </div>
              
              {explorerOpen && !currentProject && (
                <div className="px-4 py-3 flex flex-col gap-3">
                  <p className="text-[10px] text-[#858585] leading-relaxed">
                    You have not yet opened a folder.
                  </p>
                  <button
                    onClick={() => void openWorkspaceFolder()}
                    className="bg-[#007acc] hover:bg-[#0062a3] text-white py-1.5 px-3 rounded text-xs font-medium transition-colors w-fit border-none cursor-pointer">
                    Open Folder
                  </button>
                </div>
              )}
              
              {explorerOpen && currentProject && (
                <div className="py-0">
                  <ExplorerTree
                    files={projectFiles}
                    activeFile={activeFile}
                    selectedId={selected?.id}
                    onSelect={(id, kind) => setSelected({ id, kind })}
                    onOpenFile={handleOpenFile}
                    onOpenFolder={handleOpenFolder}
                    onContextMenu={handleContextMenu}
                    onMove={(fromId, dest) => {
                      void moveWorkspaceEntry(fromId, dest).catch((err) => {
                        window.alert(err instanceof Error ? err.message : "Could not move");
                      });
                    }}
                    collapseSignal={collapseSignal}
                    creating={creating}
                    createPrefix={createPrefix}
                    createName={createName}
                    onCreateNameChange={setCreateName}
                    onCreateSubmit={() => void submitCreate()}
                    onCreateCancel={() => {
                      setCreating(null);
                      setCreateName("");
                      setCreateError("");
                    }}
                    createError={createError}
                    renameTarget={renameTarget}
                    renameValue={renameValue}
                    onRenameValueChange={setRenameValue}
                    onRenameSubmit={() => void handleRenameSubmit()}
                    onRenameCancel={() => setRenameTarget(null)}
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* Floating Context Menu Overlay */}
        {contextMenu &&
          createPortal(
          <div 
            className="fixed inset-0 z-[9999] cursor-default bg-transparent"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          >
            <div 
              className="absolute bg-[#1e1e1e] border border-[#2b2b2b] shadow-2xl rounded py-1 z-[9999] text-[11px] text-[#cccccc] font-sans w-[250px] select-none"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              {contextMenu.kind === "file" && (
                <>
                  <button
                    onClick={openSelected}
                    className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
                  >
                    <span>Open</span>
                    <span className="text-[10px] text-[#858585] font-mono">Enter</span>
                  </button>
                  {isGridPath(contextMenu.fileId) && (
                    <button
                      onClick={openMap}
                      className="w-full text-left px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
                    >
                      Open map
                    </button>
                  )}
                  <button
                    onClick={openWithDefaultApp}
                    className="w-full text-left px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
                  >
                    Open with default app
                  </button>
                </>
              )}
              {contextMenu.kind === "folder" && (
                <>
                  <button
                    onClick={openMap}
                    className="w-full text-left px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
                  >
                    Open map
                  </button>
                  <button
                    onClick={() => {
                      beginCreate("file", contextMenu.fileId);
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
                  >
                    New File...
                  </button>
                  <button
                    onClick={() => {
                      beginCreate("folder", contextMenu.fileId);
                      setContextMenu(null);
                    }}
                    className="w-full text-left px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
                  >
                    New Folder...
                  </button>
                  <div className="h-[1px] bg-[#2b2b2b] my-1" />
                </>
              )}
              <button
                onClick={revealInExplorer}
                className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
              >
                <span>Reveal in File Explorer</span>
                <span className="text-[10px] text-[#858585] font-mono">Shift+Alt+R</span>
              </button>
              {contextMenu.kind === "folder" && (
                <button
                  onClick={findInFolder}
                  className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
                >
                  <span>Find in Folder...</span>
                  <span className="text-[10px] text-[#858585] font-mono">Shift+Alt+F</span>
                </button>
              )}
              <div className="h-[1px] bg-[#2b2b2b] my-1" />
              <button 
                onClick={handleAddFileToChat}
                className="w-full text-left px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
              >
                {contextMenu.kind === "folder" ? "Add Folder to Chat" : "Add File to Chat"}
              </button>
              <button 
                onClick={handleAddFileToNewChat}
                className="w-full text-left px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
              >
                {contextMenu.kind === "folder" ? "Add Folder to New Chat" : "Add File to New Chat"}
              </button>
              
              <div className="h-[1px] bg-[#2b2b2b] my-1" />
              
              <button 
                onClick={handleCut}
                className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
              >
                <span>Cut</span>
                <span className="text-[10px] text-[#858585] font-mono">Ctrl+X</span>
              </button>
              <button 
                onClick={handleCopy}
                className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
              >
                <span>Copy</span>
                <span className="text-[10px] text-[#858585] font-mono">Ctrl+C</span>
              </button>
              <button
                onClick={handlePaste}
                disabled={!clip}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-1.5 border-none bg-transparent",
                  clip
                    ? "hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white"
                    : "text-[#555555] cursor-default"
                )}
              >
                <span>Paste</span>
                <span className="text-[10px] text-[#858585] font-mono">Ctrl+V</span>
              </button>
              
              <div className="h-[1px] bg-[#2b2b2b] my-1" />
              
              <button 
                onClick={handleCopyPath}
                className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
              >
                <span>Copy Path</span>
                <span className="text-[10px] text-[#858585] font-mono">Shift+Alt+C</span>
              </button>
              <button 
                onClick={handleCopyRelativePath}
                className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
              >
                <span>Copy Relative Path</span>
                <span className="text-[10px] text-[#858585] font-mono">Ctrl+K Ctrl+Shift+C</span>
              </button>
              
              <div className="h-[1px] bg-[#2b2b2b] my-1" />
              
              <button 
                onClick={handleRenameInitiate}
                className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
              >
                <span>Rename...</span>
                <span className="text-[10px] text-[#858585] font-mono">F2</span>
              </button>
              <button 
                onClick={handleDelete}
                className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
              >
                <span>Delete</span>
                <span className="text-[10px] text-[#858585] font-mono">Delete</span>
              </button>
            </div>
          </div>,
          document.body
        )}

        {activeLeftSidebarTab === "search" && (
          <div className="p-4 space-y-3 font-sans">
            <h3 className="text-xs font-bold uppercase text-[#858585]">Search</h3>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchFolder ? `Search in ${searchFolder.split("/").pop()}` : "Search files..."}
              className="w-full bg-[#2a2d2e] border border-[#3c3c3c] rounded px-2 py-1 text-xs outline-none text-[#cccccc]"
            />
            {searchFolder && (
              <button
                type="button"
                onClick={() => setSearchFolder(null)}
                className="text-[10px] text-[#007acc] border-none bg-transparent cursor-pointer p-0"
              >
                Search whole workspace
              </button>
            )}
            <div className="space-y-0.5">
              {projectFiles
                .filter((file) => {
                  if (file.type === "folder") return false;
                  const id = file.id.replace(/\\/g, "/");
                  if (searchFolder && id !== searchFolder && !id.startsWith(`${searchFolder}/`)) return false;
                  const q = searchQuery.trim().toLowerCase();
                  if (!q) return true;
                  return file.name.toLowerCase().includes(q) || id.toLowerCase().includes(q);
                })
                .slice(0, 80)
                .map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => handleOpenFile(file)}
                    className="w-full text-left px-2 py-1 rounded text-[11px] text-[#cccccc] hover:bg-[#2a2d2e] border-none bg-transparent cursor-pointer truncate"
                    title={file.id}
                  >
                    {file.id}
                  </button>
                ))}
            </div>
          </div>
        )}

        {activeLeftSidebarTab === "git" && (
          <div className="p-4 space-y-3 font-sans">
            <h3 className="text-xs font-bold uppercase text-[#858585]">Source Control</h3>
            <div className="text-xs text-[#858585]">No changes detected.</div>
          </div>
        )}

        {activeLeftSidebarTab === "extensions" && <PluginStoreSidebar />}

        {activeLeftSidebarTab === "debug" && (
          <div className="p-4 space-y-3 font-sans">
            <h3 className="text-xs font-bold uppercase text-[#858585]">Run and Debug</h3>
            <button className="w-full bg-[#007acc] hover:bg-[#0062a3] text-white py-1.5 rounded text-xs font-medium transition-colors">
              Run and Debug
            </button>
            <div className="text-[10px] text-[#858585] mt-2 leading-relaxed">
              To customize Run and Debug, open a geophysics workflow or script in the workbench.
            </div>
          </div>
        )}
      </div>
      {activeLeftSidebarTab === "explorer" ? (
        <div className="shrink-0 border-t border-[#2b2b2b]">
          <ExplorerAuxPane title="Timeline" open={timelineOpen} onToggle={() => setTimelineOpen((v) => !v)}>
            {fileTimeline.length === 0 ? (
              <p className="px-1 py-1 text-[#858585]">No local timeline yet. Open or save a file to record activity.</p>
            ) : (
              <ul className="py-0.5">
                {fileTimeline.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      className="w-full text-left px-1 py-0.5 hover:bg-[#2a2d2e] border-none bg-transparent cursor-pointer text-[#cccccc]"
                      onClick={() => {
                        if (!event.path) return;
                        const file = projectFiles.find((f) => f.id === event.path || f.path === event.path || f.name === event.label);
                        if (file) handleOpenFile(file);
                        else openWorkbenchTab(`file:${event.path}`, "file", event.label);
                      }}
                    >
                      <span className="block truncate">{event.label}</span>
                      <span className="block text-[10px] text-[#858585]">
                        {event.action === "opened" ? "Opened" : event.action === "saved" ? "Saved" : event.action === "created" ? "Created" : "Job"} · {relativeTime(event.at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ExplorerAuxPane>
        </div>
      ) : null}
      </div>
    </aside>
  );
}
