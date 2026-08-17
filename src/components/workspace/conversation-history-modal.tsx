"use client";

import { useState, useRef, useEffect } from "react";
import { Trash2, X } from "lucide-react";
import { useAppStore, type Conversation } from "@/store/app-store";
import { cn } from "@/lib/utils";

interface ConversationHistoryModalProps {
  onClose: () => void;
}

function formatTimeAgo(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk} wk${wk === 1 ? "" : "s"} ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} mo ago`;
  const yr = Math.floor(day / 365);
  return `${yr} yr${yr === 1 ? "" : "s"} ago`;
}

function lastResponseAt(convo: Conversation): string | undefined {
  for (let i = convo.messages.length - 1; i >= 0; i--) {
    const message = convo.messages[i];
    if (message.sender === "agent" && message.timestamp) return message.timestamp;
  }
  for (let i = convo.messages.length - 1; i >= 0; i--) {
    if (convo.messages[i].timestamp) return convo.messages[i].timestamp;
  }
  return undefined;
}

export function ConversationHistoryModal({ onClose }: ConversationHistoryModalProps) {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    setChatPanelOpen,
    removeConversation,
    currentProject,
    recentProjects,
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pendingConvo, setPendingConvo] = useState<Conversation | null>(null);
  const [openTargetIndex, setOpenTargetIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const workspacePath =
    recentProjects.find((project) => project.name === currentProject)?.path ||
    currentProject ||
    "current workspace";

  useEffect(() => {
    inputRef.current?.focus();
  }, [pendingConvo]);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleOutsideClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [onClose]);

  const filteredConvos = conversations.filter(
    (c) => c.messages.length > 0 && c.topic.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentConvos = filteredConvos.filter((c) => c.id === activeConversationId);
  const runningConvos = filteredConvos.filter((c) => c.isGenerating && c.id !== activeConversationId);
  const recentConvos = filteredConvos
    .filter((c) => c.id !== activeConversationId && !c.isGenerating)
    .sort((a, b) => {
      const aTime = lastResponseAt(a) ? new Date(lastResponseAt(a)!).getTime() : 0;
      const bTime = lastResponseAt(b) ? new Date(lastResponseAt(b)!).getTime() : 0;
      return bTime - aTime;
    });
  const orderedConvos = [...currentConvos, ...runningConvos, ...recentConvos];

  const openInCurrentWindow = (convo: Conversation) => {
    setActiveConversationId(convo.id);
    setChatPanelOpen(true);
    onClose();
  };

  const openInAnotherWindow = async (convo: Conversation) => {
    const pathname = `/workspace?conversation=${encodeURIComponent(convo.id)}`;
    if (window.gaidDesktop?.openAuxWindow) {
      await window.gaidDesktop.openAuxWindow(pathname);
    } else {
      window.open(pathname, "_blank", "noopener,noreferrer");
    }
    onClose();
  };

  const confirmOpenTarget = () => {
    if (!pendingConvo) return;
    if (openTargetIndex === 0) {
      openInCurrentWindow(pendingConvo);
    } else {
      void openInAnotherWindow(pendingConvo);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (pendingConvo) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setOpenTargetIndex((prev) => (prev === 0 ? 1 : 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          confirmOpenTarget();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setPendingConvo(null);
          setOpenTargetIndex(0);
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, orderedConvos.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + orderedConvos.length) % Math.max(1, orderedConvos.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (orderedConvos[selectedIndex]) {
          setPendingConvo(orderedConvos[selectedIndex]);
          setOpenTargetIndex(0);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [orderedConvos, selectedIndex, pendingConvo, openTargetIndex]);

  const handleDelete = (e: React.MouseEvent, convoId: string) => {
    e.stopPropagation();
    removeConversation(convoId);
    setSelectedIndex((prev) => Math.min(prev, Math.max(0, orderedConvos.length - 2)));
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center font-sans">
      <div
        ref={containerRef}
        className="bg-[#181818] border border-[#2d2d2d] rounded-lg shadow-[0_20px_50px_rgba(0,0,0,0.9)] w-[520px] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="p-3 border-b border-[#2b2b2b] bg-[#181818] flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={pendingConvo ? "" : searchQuery}
              readOnly={Boolean(pendingConvo)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder={
                pendingConvo
                  ? "Select where to open the conversation"
                  : "Search all convos..."
              }
              className="w-full bg-[#1e1e1e] text-[#cccccc] text-[13px] placeholder-[#666666] px-3 py-2 rounded-md border border-[#2d2d2d] focus:border-[#007acc] focus:shadow-[0_0_8px_rgba(0,122,204,0.3)] outline-none transition-all duration-150"
            />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/10 text-[#858585] hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {pendingConvo ? (
          <div className="flex-1 max-h-[380px] overflow-y-auto py-1 scrollbar-thin px-1">
            <button
              type="button"
              onMouseEnter={() => setOpenTargetIndex(0)}
              onClick={() => openInCurrentWindow(pendingConvo)}
              className={cn(
                "w-full flex items-center justify-between gap-4 px-3 py-2.5 rounded-md text-left text-[13px]",
                openTargetIndex === 0 ? "bg-[#04395e] text-white" : "text-[#cccccc] hover:bg-[#202020]"
              )}
            >
              <span className="font-semibold shrink-0">Open in current window</span>
              <span className={cn("truncate text-[12px]", openTargetIndex === 0 ? "text-[#9cdcfe]" : "text-[#858585]")}>
                Continue conversation in the current workspace
              </span>
            </button>
            <button
              type="button"
              onMouseEnter={() => setOpenTargetIndex(1)}
              onClick={() => void openInAnotherWindow(pendingConvo)}
              className={cn(
                "w-full flex items-center justify-between gap-4 px-3 py-2.5 rounded-md text-left text-[13px]",
                openTargetIndex === 1 ? "bg-[#04395e] text-white" : "text-[#cccccc] hover:bg-[#202020]"
              )}
            >
              <span className="font-semibold shrink-0">Open in another window</span>
              <span className={cn("truncate text-[12px]", openTargetIndex === 1 ? "text-[#9cdcfe]" : "text-[#858585]")}>
                {workspacePath}
              </span>
            </button>
          </div>
        ) : (
          <div className="flex-1 max-h-[380px] overflow-y-auto py-2 scrollbar-thin px-2">
            {orderedConvos.length === 0 ? (
              <div className="text-center text-[#555] text-[11px] py-12">
                No conversations found
              </div>
            ) : (
              <div className="space-y-1">
                {[
                  { label: "Current", items: currentConvos },
                  { label: "Running", items: runningConvos },
                  { label: "Recent", items: recentConvos },
                ].map((section) => {
                  if (section.items.length === 0) return null;
                  return (
                    <div key={section.label}>
                      <div className="text-[10px] text-[#555] font-semibold uppercase tracking-wider px-3 py-1.5 select-none">
                        {section.label}
                      </div>
                      <div className="space-y-[1px]">
                        {section.items.map((convo) => {
                          const idx = orderedConvos.findIndex((item) => item.id === convo.id);
                          const isSelected = idx === selectedIndex;
                          const lastResponse = formatTimeAgo(lastResponseAt(convo));

                          return (
                            <div
                              key={convo.id}
                              onMouseEnter={() => setSelectedIndex(idx)}
                              onClick={() => {
                                setPendingConvo(convo);
                                setOpenTargetIndex(0);
                              }}
                              className={cn(
                                "flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors group select-none text-[12px]",
                                isSelected
                                  ? "bg-[#2a2a2a] text-white"
                                  : "text-[#cccccc] hover:bg-[#202020]"
                              )}
                            >
                              <div className="flex items-baseline gap-2 min-w-0 flex-1">
                                <span className="truncate font-medium">{convo.topic}</span>
                                {currentProject && (
                                  <span className="truncate text-[11px] text-[#666] font-normal max-w-[38%]">
                                    {currentProject}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2 shrink-0 ml-3">
                                <span className="text-[10px] text-[#666] font-medium">
                                  {lastResponse}
                                </span>
                                <button
                                  onClick={(e) => handleDelete(e, convo.id)}
                                  className={cn(
                                    "p-1 rounded text-[#555] hover:text-red-400 hover:bg-[#383838] transition-colors",
                                    isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                  )}
                                  title="Delete conversation"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="h-[30px] shrink-0 border-t border-[#2b2b2b] bg-[#141414] flex items-center justify-between px-4 text-[10px] text-[#555] font-semibold select-none">
          <span className="flex items-center gap-1">
            <span className="text-[11px] font-mono">↑↓</span> to navigate
          </span>
          <span className="flex items-center gap-1">
            <span className="text-[12px] font-mono font-medium">↵</span> to select
          </span>
        </div>
      </div>
    </div>
  );
}
