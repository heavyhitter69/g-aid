"use client";

import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Plus, Clock, MoreHorizontal, PanelRight, Paperclip, Mic, ChevronDown } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

export function AIPanel() {
  const { 
    conversations, 
    activeConversationId,
    setActiveConversationId,
    addConversation, 
    removeConversation, 
    updateConversationTopic, 
    addMessageToConversation, 
    toggleChatPanel 
  } = useAppStore();

  // Retrieve current active conversation
  const activeConversation = conversations.find(c => c.id === activeConversationId) || conversations[0] || {
    id: "default",
    topic: "New Agent",
    messages: []
  };

  const chatTopic = activeConversation.topic;
  const chatMessages = activeConversation.messages;

  const [inputVal, setInputVal] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedMode, setSelectedMode] = useState("Agent");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("Auto");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const generateTopic = (msg: string) => {
    const lowercase = msg.toLowerCase();
    if (lowercase.includes("exploration") || lowercase.includes("survey")) {
      return "Exploration Geophysics";
    }
    if (lowercase.includes("ert") || lowercase.includes("resistivity")) {
      return "ERT Line 4 Interpretation";
    }
    if (lowercase.includes("seismic") || lowercase.includes("earthquake")) {
      return "Seismic Reflection Sweep";
    }
    if (lowercase.includes("gravity") || lowercase.includes("magnetic")) {
      return "Potential Fields Analysis";
    }
    return msg.length > 25 ? msg.substring(0, 22) + "..." : msg;
  };

  const handleSend = () => {
    if (!inputVal.trim() || isGenerating) return;

    const userMsg = inputVal.trim();
    setInputVal("");

    // Set topic if it's the first message
    if (chatMessages.length === 0) {
      const topicName = generateTopic(userMsg);
      updateConversationTopic(activeConversation.id, topicName);
    }

    addMessageToConversation(activeConversation.id, { sender: "user", text: userMsg });
    setIsGenerating(true);

    // Simulate Agent response
    setTimeout(() => {
      let agentReply = "";
      const lowercase = userMsg.toLowerCase();

      if (lowercase.includes("exploration") || lowercase.includes("survey")) {
        agentReply = `[${selectedMode} Mode] Based on the 3D resistivity voxel model, I have mapped the shallow boundary at 45m depth. There is a distinct conductive zone (15-30 Ohm-m) correlating perfectly with saturated gravels. I suggest drilling a verification borehole at STATION 450E.`;
      } else if (lowercase.includes("ert") || lowercase.includes("resistivity")) {
        agentReply = `[${selectedMode} Mode] Running 2.5D inversion sweep on ERT Line 4 dataset... Inversion converged in 4 iterations with RMSE 2.1%. Anomaly detected: high-resistivity zone (>450 Ohm-m) at 12-18m depth, suggesting mineralized quartz vein structures.`;
      } else {
        agentReply = `[${selectedMode} Mode] Hello! I am your AI Geophysics Copilot in ${selectedMode} mode. I'm ready to plan workflows, execute inversions, and generate geological logs. What survey or dataset would you like to inspect today?`;
      }

      addMessageToConversation(activeConversation.id, { sender: "agent", text: agentReply });
      setIsGenerating(false);
    }, 1200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const modes = [
    { id: "Agent", label: "Agent", icon: () => <span className="text-[12px] font-semibold">∞</span> },
    { id: "Plan", label: "Plan", icon: () => (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/>
        <line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/>
        <line x1="3" y1="6" x2="3.01" y2="6"/>
        <line x1="3" y1="12" x2="3.01" y2="12"/>
        <line x1="3" y1="18" x2="3.01" y2="18"/>
      </svg>
    )},
    { id: "Ask", label: "Ask", icon: () => (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    )},
  ];

  const currentModeObj = modes.find(m => m.id === selectedMode) || modes[0];

  return (
    <aside className="w-full flex flex-col bg-[#1e1e1e] text-[#cccccc] font-sans h-full select-none">
      {/* Horizontal Tabs Header Bar */}
      <div className="h-[35px] border-b border-[#2b2b2b] flex items-center bg-[#181818] shrink-0 relative z-20 select-none">
        
        {/* Dynamic List of Conversation Tabs */}
        <div className="flex-1 flex items-center h-full overflow-x-auto scrollbar-none">
          {conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <div
                key={conv.id}
                onClick={() => setActiveConversationId(conv.id)}
                className={cn(
                  "h-full flex items-center gap-2 px-3 border-r border-[#2b2b2b] text-[11px] cursor-pointer transition-colors relative group min-w-[100px] max-w-[140px]",
                  isActive 
                    ? "bg-[#1e1e1e] text-white border-t-2 border-[#007acc] font-medium" 
                    : "bg-[#181818] text-[#858585] hover:bg-[#202020] hover:text-[#cccccc]"
                )}
              >
                <MessageSquare className="h-3 w-3 shrink-0" />
                <span className="truncate flex-1">{conv.topic}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeConversation(conv.id);
                  }}
                  className="p-0.5 rounded hover:bg-[#333333] hover:text-white text-[#858585] shrink-0 transition-colors"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Action Controls to the right of the Tabs */}
        <div className="flex items-center gap-1.5 px-2 text-[#858585] h-full shrink-0 border-l border-[#2b2b2b] select-none">
          {/* New Tab */}
          <div className="relative group flex items-center h-full">
            <button 
              onClick={addConversation} 
              className="p-1 rounded hover:bg-white/10 hover:text-[#cccccc] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <div className="absolute top-[110%] right-0 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap font-sans font-medium">
              new tab
            </div>
          </div>

          {/* Conversation History */}
          <div className="relative group flex items-center h-full">
            <button 
              className="p-1 rounded hover:bg-white/10 hover:text-[#cccccc] transition-colors"
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
            <div className="absolute top-[110%] right-0 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap font-sans font-medium">
              conversation history
            </div>
          </div>

          {/* More Options */}
          <div className="relative group flex items-center h-full">
            <button 
              className="p-1 rounded hover:bg-white/10 hover:text-[#cccccc] transition-colors"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            <div className="absolute top-[110%] right-0 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap font-sans font-medium">
              more options
            </div>
          </div>

          {/* Close Panel */}
          <div className="relative group flex items-center h-full">
            <button 
              onClick={toggleChatPanel} 
              className="p-1 rounded hover:bg-white/10 hover:text-[#cccccc] transition-colors"
            >
              <PanelRight className="h-3.5 w-3.5" />
            </button>
            <div className="absolute top-[110%] right-0 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap font-sans font-medium">
              close panel
            </div>
          </div>
        </div>
      </div>

      {/* Main chat layout */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1e]">
        {/* Pinned input box at the top */}
        <div className="p-3 border-b border-[#2b2b2b] shrink-0 bg-[#1e1e1e]">
          <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg p-2 flex flex-col focus-within:border-[#007acc] transition-colors relative">
            <textarea
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Plan, Build, / for commands, @ for context"
              className="bg-transparent border-none outline-none resize-none text-[12px] text-[#cccccc] placeholder-[#858585] h-[70px] font-sans leading-relaxed"
            />
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#2b2b2b]">
              <div className="flex items-center gap-1.5 relative">
                <button 
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-1.5 text-[10px] bg-[#333333] hover:bg-[#3e3e42] px-2 py-0.5 rounded text-[#cccccc] border border-[#3c3c3c] transition-colors"
                >
                  {currentModeObj.icon()}
                  <span>{currentModeObj.label}</span>
                  <ChevronDown className="h-2.5 w-2.5 text-[#858585]" />
                </button>

                {/* Mode dropdown overlay - opens downward */}
                {dropdownOpen && (
                  <div className="absolute left-0 top-full mt-1 bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-xl w-[140px] py-1 z-50 flex flex-col text-[12px]">
                    {modes.map((mode) => {
                      const isSelected = selectedMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          onClick={() => {
                            setSelectedMode(mode.id);
                            setDropdownOpen(false);
                          }}
                          className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[#333333] text-left text-[#cccccc] transition-colors w-full font-medium"
                        >
                          <span className="text-[#858585] flex items-center justify-center w-3 h-3">
                            {mode.icon()}
                          </span>
                          <span className="flex-1">{mode.label}</span>
                          {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#e1e1e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto">
                              <polyline points="20 6 9 17 4 12"/>
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {/* Model / Agent Dropdown */}
                <div className="relative">
                  <button 
                    onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                    className="flex items-center gap-1 text-[9px] text-[#858585] px-1 hover:text-[#cccccc] transition-colors cursor-pointer bg-transparent border-none outline-none"
                  >
                    <span className="truncate max-w-[80px]">{selectedModel}</span>
                    <ChevronDown className="h-2.5 w-2.5" />
                  </button>

                  {modelDropdownOpen && (
                    <div className="absolute left-0 top-full mt-1 bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-xl w-[140px] py-1 z-50 flex flex-col text-[10px]">
                      {["Auto", "Geophysics-GPT", "Claude 3.5 Sonnet", "Gemini 1.5 Pro"].map((model) => {
                        const isSelected = selectedModel === model;
                        return (
                          <button
                            key={model}
                            onClick={() => {
                              setSelectedModel(model);
                              setModelDropdownOpen(false);
                            }}
                            className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#333333] text-left text-[#cccccc] transition-colors w-full"
                          >
                            <span className="flex-1">{model}</span>
                            {isSelected && (
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#e1e1e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-[#858585]">
                <button className="p-1 hover:bg-[#333333] hover:text-[#cccccc] rounded transition-colors">
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
                <button className="p-1 hover:bg-[#333333] hover:text-[#cccccc] rounded transition-colors">
                  <Mic className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable message panel */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-[#858585] p-6 space-y-2">
              <MessageSquare className="h-8 w-8 stroke-[1] text-[#3c3c3c] animate-pulse" />
              <p className="text-[11px]">No conversation started</p>
              <p className="text-[10px] max-w-[200px] leading-relaxed">Ask about groundwater grids, resistivity inversion parameters, or site models.</p>
            </div>
          ) : (
            chatMessages.map((msg, idx) => (
              <div 
                key={idx} 
                className={cn(
                  "flex flex-col max-w-[85%] rounded-lg p-2.5 text-[12px] leading-relaxed shadow-sm font-sans",
                  msg.sender === "user" 
                    ? "bg-[#007acc] text-white ml-auto" 
                    : "bg-[#252526] text-[#cccccc] mr-auto border border-[#3c3c3c]"
                )}
              >
                <span className="text-[9px] uppercase font-bold text-[#858585] mb-1">
                  {msg.sender === "user" ? "You" : "Geophysics Agent"}
                </span>
                <p className="whitespace-pre-wrap">{msg.text}</p>
              </div>
            ))
          )}

          {isGenerating && (
            <div className="bg-[#252526] text-[#cccccc] mr-auto border border-[#3c3c3c] rounded-lg p-2.5 text-[12px] leading-relaxed max-w-[85%] flex items-center gap-2">
              <div className="h-1.5 w-1.5 bg-[#858585] rounded-full animate-bounce" />
              <div className="h-1.5 w-1.5 bg-[#858585] rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="h-1.5 w-1.5 bg-[#858585] rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
