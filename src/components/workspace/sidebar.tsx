"use client";

import { ChevronRight, ChevronDown, ChevronUp, Files, Search, GitBranch, Wrench, Pin, Bug, Table, Layers, Braces, FileCode, FileText, PanelLeftClose } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const { 
    isLeftSidebarOpen, 
    setLeftSidebarOpen, 
    activeLeftSidebarTab, 
    setActiveLeftSidebarTab,
    currentProject,
    openWorkbenchTab,
    projectFiles,
    setProjectFiles,
    fileContents,
    setFileContent,
    addConversation,
    updateConversationTopic,
    addMessageToConversation,
    activeConversationId,
    setChatPanelOpen,
    closeWorkbenchTab,
    workbenchTabs
  } = useAppStore();

  const [explorerOpen, setExplorerOpen] = useState(true);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [chevronOpen, setChevronOpen] = useState(false);

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    fileName: string;
  } | null>(null);

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
    { id: "extensions", label: "Tools", shortcut: "Ctrl+Shift+X", icon: Wrench },
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
  const handleAddFileToChat = () => {
    if (!contextMenu) return;
    const name = contextMenu.fileName;
    const fileContentText = fileContents[name] || `[Empty File]`;
    
    addMessageToConversation(activeConversationId, {
      sender: "user",
      text: `Please analyze this file: ${name}. Here is its content:\n\n${fileContentText.slice(0, 1000)}`
    });
    
    addMessageToConversation(activeConversationId, {
      sender: "agent",
      text: `I have analyzed the parameters inside **${name}**. Let me know if you would like me to formulate a 2D resistivity calculation model or check spacing tolerances!`
    });
    
    setChatPanelOpen(true);
    setContextMenu(null);
  };

  const handleAddFileToNewChat = () => {
    if (!contextMenu) return;
    const name = contextMenu.fileName;
    const fileContentText = fileContents[name] || `[Empty File]`;
    
    addConversation();
    
    setTimeout(() => {
      const latestState = useAppStore.getState();
      const newActiveId = latestState.activeConversationId;
      
      updateConversationTopic(newActiveId, `Analysis of ${name}`);
      addMessageToConversation(newActiveId, {
        sender: "user",
        text: `I've opened a dedicated session for: ${name}. File context:\n\n${fileContentText.slice(0, 1000)}`
      });
      addMessageToConversation(newActiveId, {
        sender: "agent",
        text: `Welcome to a brand-new focus thread on **${name}**. I've indexed the soil boundary intervals. What operations would you like to run?`
      });
    }, 100);

    setChatPanelOpen(true);
    setContextMenu(null);
  };

  const handleOpenTimeline = () => {
    setTimelineOpen(true);
    setContextMenu(null);
  };

  const handleCopy = () => {
    if (!contextMenu) return;
    const name = contextMenu.fileName;
    const text = fileContents[name] || "";
    navigator.clipboard.writeText(text);
    setContextMenu(null);
  };

  const handleCopyPath = () => {
    if (!contextMenu) return;
    const name = contextMenu.fileName;
    const path = `/local-uploads/${name}`;
    navigator.clipboard.writeText(path);
    setContextMenu(null);
  };

  const handleRenameInitiate = () => {
    if (!contextMenu) return;
    setRenameTarget(contextMenu.fileName);
    setRenameValue(contextMenu.fileName);
    setContextMenu(null);
  };

  const handleRenameSubmit = () => {
    if (!renameTarget || !renameValue.trim()) return;
    
    const updatedFiles = projectFiles.map(file => {
      if (file.name === renameTarget) {
        return { ...file, name: renameValue, path: `/local-uploads/${renameValue}` };
      }
      return file;
    });
    setProjectFiles(updatedFiles);

    if (fileContents[renameTarget] !== undefined) {
      setFileContent(renameValue, fileContents[renameTarget]);
    }

    const tabId = `file:${renameTarget}`;
    const newTabId = `file:${renameValue}`;
    const isTabOpen = workbenchTabs.some(t => t.id === tabId);
    if (isTabOpen) {
      closeWorkbenchTab(tabId);
      openWorkbenchTab(newTabId, "file", renameValue);
    }

    setRenameTarget(null);
  };

  const handleDelete = () => {
    if (!contextMenu) return;
    const name = contextMenu.fileName;
    const updated = projectFiles.filter(file => file.name !== name);
    setProjectFiles(updated);
    closeWorkbenchTab(`file:${name}`);
    setContextMenu(null);
  };

  return (
    <aside className="w-[250px] shrink-0 border-r border-[#2b2b2b] bg-[#181818] flex flex-col text-[#cccccc] text-[11px] font-mono select-none overflow-hidden h-full">
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
            <PanelLeftClose className="h-4 w-4 stroke-[1.5]" />
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

      <div className="flex-1 overflow-y-auto pt-2">
        {activeLeftSidebarTab === "explorer" && (
          <>
            {/* Project Section */}
            <div className="mb-1">
              <button 
                onClick={() => setExplorerOpen(!explorerOpen)}
                className="w-full flex items-center gap-1 px-1 py-1 hover:bg-[#2a2d2e] font-bold text-[#cccccc] text-left border-none bg-transparent cursor-pointer"
              >
                {explorerOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                <span className="uppercase truncate">{currentProject ? currentProject.toUpperCase().replace(/\s+/g, '-') : "NO FOLDER OPENED"}</span>
              </button>
              
              {explorerOpen && !currentProject && (
                <div className="px-4 py-3 flex flex-col gap-3">
                  <p className="text-[10px] text-[#858585] leading-relaxed">
                    You have not yet opened a folder.
                  </p>
                  <button className="bg-[#007acc] hover:bg-[#0062a3] text-white py-1.5 px-3 rounded text-xs font-medium transition-colors w-fit border-none cursor-pointer">
                    Open Folder
                  </button>
                </div>
              )}
              
              {explorerOpen && currentProject && (
                <div className="pl-4 py-1 flex flex-col gap-0.5">
                  {projectFiles.map((file) => {
                    let Icon = FileText;
                    let color = "text-[#9cdcfe]";
                    if (file.name.endsWith(".dat")) {
                      Icon = Table;
                      color = "text-[#4fc1ff]";
                    } else if (file.name.endsWith(".grd")) {
                      Icon = Layers;
                      color = "text-[#4ec9b0]";
                    } else if (file.name.endsWith(".json")) {
                      Icon = Braces;
                      color = "text-[#d7ba7d]";
                    } else if (file.name.endsWith(".yaml") || file.name.endsWith(".yml")) {
                      Icon = FileCode;
                      color = "text-[#ce9178]";
                    } else if (file.name.endsWith(".csv")) {
                      Icon = FileText;
                      color = "text-[#9cdcfe]";
                    }
                    
                    const isRenaming = renameTarget === file.name;

                    return (
                      <div key={file.name} className="relative group w-full">
                        {isRenaming ? (
                          <input 
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={handleRenameSubmit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameSubmit();
                              if (e.key === "Escape") setRenameTarget(null);
                            }}
                            autoFocus
                            className="bg-[#3c3c3c] text-white border border-[#007acc] rounded px-1 py-0.5 text-xs outline-none w-[90%] font-sans ml-4"
                          />
                        ) : (
                          <button
                            onClick={() => {
                              openWorkbenchTab(`file:${file.name}`, "file", file.name);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              const menuWidth = 250;
                              const menuHeight = 310;
                              let posX = e.clientX;
                              let posY = e.clientY;
                              
                              if (posX + menuWidth > window.innerWidth) {
                                posX = window.innerWidth - menuWidth - 10;
                              }
                              if (posY + menuHeight > window.innerHeight) {
                                posY = window.innerHeight - menuHeight - 10;
                              }
                              
                              posX = Math.max(10, posX);
                              posY = Math.max(10, posY);

                              setContextMenu({
                                x: posX,
                                y: posY,
                                fileName: file.name
                              });
                            }}
                            className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-[#2a2d2e] text-[#cccccc] hover:text-white text-left font-sans text-xs font-normal border-none bg-transparent cursor-pointer transition-colors"
                          >
                            <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
                            <span className="truncate">{file.name}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Floating Context Menu Overlay */}
        {contextMenu && (
          <div 
            className="fixed inset-0 z-50 cursor-default bg-transparent"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          >
            <div 
              className="absolute bg-[#1e1e1e] border border-[#2b2b2b] shadow-2xl rounded py-1 z-50 text-[11px] text-[#cccccc] font-sans w-[250px] select-none"
              style={{ top: contextMenu.y, left: contextMenu.x }}
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={handleAddFileToChat}
                className="w-full text-left px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
              >
                Add File to Cursor Chat
              </button>
              <button 
                onClick={handleAddFileToNewChat}
                className="w-full text-left px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
              >
                Add File to New Cursor Chat
              </button>
              
              <div className="h-[1px] bg-[#2b2b2b] my-1" />
              
              <button 
                onClick={handleOpenTimeline}
                className="w-full text-left px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
              >
                Open Timeline
              </button>
              
              <div className="h-[1px] bg-[#2b2b2b] my-1" />
              
              <button 
                onClick={handleCopy}
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
              
              <div className="h-[1px] bg-[#2b2b2b] my-1" />
              
              <button 
                onClick={handleCopyPath}
                className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
              >
                <span>Copy Path</span>
                <span className="text-[10px] text-[#858585] font-mono">Shift+Alt+C</span>
              </button>
              <button 
                onClick={handleCopyPath}
                className="w-full flex items-center justify-between px-4 py-1.5 hover:bg-[#2d2d2d] cursor-pointer text-[#e1e1e1] hover:text-white border-none bg-transparent"
              >
                <span>Copy Relative Path</span>
                <span className="text-[10px] text-[#858585] font-mono">Ctrl+M Ctrl+Shift+C</span>
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
          </div>
        )}

        {activeLeftSidebarTab === "search" && (
          <div className="p-4 space-y-3 font-sans">
            <h3 className="text-xs font-bold uppercase text-[#858585]">Search</h3>
            <input 
              type="text" 
              placeholder="Search files..." 
              className="w-full bg-[#2a2d2e] border border-[#3c3c3c] rounded px-2 py-1 text-xs outline-none text-[#cccccc]"
            />
          </div>
        )}

        {activeLeftSidebarTab === "git" && (
          <div className="p-4 space-y-3 font-sans">
            <h3 className="text-xs font-bold uppercase text-[#858585]">Source Control</h3>
            <div className="text-xs text-[#858585]">No changes detected.</div>
          </div>
        )}

        {activeLeftSidebarTab === "extensions" && (
          <div className="p-4 space-y-3 font-sans">
            <h3 className="text-xs font-bold uppercase text-[#858585]">Tools</h3>
            <div className="text-xs text-[#858585]">0 Tools installed.</div>
          </div>
        )}

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
    </aside>
  );
}
