"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Trash2, X, MessageSquare } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

interface ConversationHistoryModalProps {
  onClose: () => void;
}

export function ConversationHistoryModal({ onClose }: ConversationHistoryModalProps) {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    removeConversation
  } = useAppStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus search input on open
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Click outside to close
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

  // Filter conversations based on search query and exclude empty ones
  const filteredConvos = conversations.filter(c =>
    c.messages.length > 0 && c.topic.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredConvos.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredConvos.length) % Math.max(1, filteredConvos.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredConvos[selectedIndex]) {
          handleSelect(filteredConvos[selectedIndex]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredConvos, selectedIndex]);

  const handleSelect = (convo: any) => {
    setActiveConversationId(convo.id);
    onClose();
  };

  const handleDelete = (e: React.MouseEvent, convoId: string) => {
    e.stopPropagation();
    removeConversation(convoId);
    setSelectedIndex(prev => Math.min(prev, Math.max(0, filteredConvos.length - 2)));
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center font-sans">
      <div
        ref={containerRef}
        className="bg-[#181818] border border-[#2d2d2d] rounded-lg shadow-[0_20px_50px_rgba(0,0,0,0.9)] w-[520px] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Search Header */}
        <div className="p-3 border-b border-[#2b2b2b] bg-[#181818] flex items-center justify-between gap-3">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(0);
              }}
              placeholder="Search all convos..."
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

        {/* Lists Area */}
        <div className="flex-1 max-h-[380px] overflow-y-auto py-2 scrollbar-thin px-2">
          <div className="text-[10px] text-[#555] font-semibold uppercase tracking-wider px-3 py-1.5 select-none">
            All Conversations
          </div>

          {filteredConvos.length === 0 ? (
            <div className="text-center text-[#555] text-[11px] py-12">
              No conversations found
            </div>
          ) : (
            <div className="space-y-[1px]">
              {filteredConvos.map((convo, idx) => {
                const isSelected = idx === selectedIndex;
                const isActive = convo.id === activeConversationId;
                const messageCount = convo.messages.length;

                return (
                  <div
                    key={convo.id}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => handleSelect(convo)}
                    className={cn(
                      "flex items-center justify-between px-3 py-2.5 rounded-md cursor-pointer transition-colors group select-none text-[12px]",
                      isSelected
                        ? "bg-[#2a2a2a] text-white"
                        : "text-[#cccccc] hover:bg-[#202020]"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <MessageSquare className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-colors",
                        isActive ? "text-[#007acc]" : "text-[#555]"
                      )} />
                      <span className={cn(
                        "truncate font-medium",
                        isActive && "text-[#007acc]"
                      )}>
                        {convo.topic}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="text-[10px] text-[#555] font-semibold tracking-wider font-mono">
                        {messageCount} msg{messageCount !== 1 ? "s" : ""}
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
          )}
        </div>

        {/* Bottom Help Bar */}
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
