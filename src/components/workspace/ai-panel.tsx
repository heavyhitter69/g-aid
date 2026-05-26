"use client";

/**
 * ai-panel.tsx (v2)
 * Wires scientific state, streaming API, preamble parsing, opportunity chips,
 * agent badges, confidence provenance display, and evidence accordions.
 * Preserves all existing tab/conversation UI.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageSquare, X, Plus, Clock, MoreHorizontal, PanelRight,
  Paperclip, Mic, ChevronDown, AlertCircle, Zap, GitBranch,
  TrendingUp, AlertTriangle, Info, CheckCircle2, Network,
  BarChart3, Lightbulb, SendHorizontal
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useScientificState } from "@/store/scientific-state";
import { useAgentStore } from "@/store/agent-store";
import { cn } from "@/lib/utils";
import type { StreamPreamble, OpportunityChipViewModel, HypothesisEpistemicType, AgentId } from "@/types/scientific";
import { AgentActivity } from "@/components/workspace/agent-activity";

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENT_COLORS: Record<string, string> = {
  "orchestrator-agent": "#9b5de5",
  "magnetic-agent":    "#f15bb5",
  "resistivity-agent": "#3b9fd9",
  "gravity-agent":     "#fee440",
  "seismic-agent":     "#00bbf9",
  "geological-agent":  "#4ec9a0",
  "workflow-agent":    "#858585",
};

const EPISTEMIC_CONFIG: Record<HypothesisEpistemicType, { icon: typeof Info; color: string; label: string }> = {
  observation:            { icon: BarChart3,    color: "#3b9fd9", label: "Observation" },
  interpretation:         { icon: GitBranch,    color: "#4ec9a0", label: "Interpretation" },
  geological_model:       { icon: Network,      color: "#9b5de5", label: "Geological Model" },
  processing_assumption:  { icon: Info,         color: "#858585", label: "Processing Assumption" },
  uncertainty_warning:    { icon: AlertTriangle,color: "#fee440", label: "Uncertainty Warning" },
  recommendation:         { icon: Lightbulb,    color: "#f15bb5", label: "Recommendation" },
};

// ─── Confidence chip ──────────────────────────────────────────────────────────

function ConfidenceChip({ confidence, provenance }: {
  confidence: number;
  provenance: StreamPreamble["confidenceProvenance"];
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const pct = (confidence * 100).toFixed(0);
  const color = confidence >= 0.7 ? "#4ec9a0" : confidence >= 0.5 ? "#fee440" : "#f97316";
  const label = confidence >= 0.8 ? "High" : confidence >= 0.6 ? "Moderate" : confidence >= 0.4 ? "Low" : "Speculative";

  return (
    <div className="relative inline-block">
      <button
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border"
        style={{ color, borderColor: `${color}44`, background: `${color}11` }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <TrendingUp className="h-2.5 w-2.5" />
        {pct}% {label}
      </button>
      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-1 bg-[#252526] border border-[#3c3c3c] rounded shadow-xl p-2 text-[9px] text-[#cccccc] w-[200px] z-50 space-y-1">
          <div className="font-semibold text-[#858585] mb-1">Confidence Provenance</div>
          {provenance.dataQualityScore !== null && (
            <ProvRow label="Data Quality" value={provenance.dataQualityScore} />
          )}
          {provenance.crossMethodAgreement !== null && (
            <ProvRow label="Cross-Method" value={provenance.crossMethodAgreement} />
          )}
          {provenance.spatialCoverage !== null && (
            <ProvRow label="Coverage" value={provenance.spatialCoverage} />
          )}
          {provenance.geologicalConsistency !== null && (
            <ProvRow label="Geol. Consistency" value={provenance.geologicalConsistency} />
          )}
          <div className="text-[8px] text-[#555] pt-1 border-t border-[#333]">
            Computed by: {provenance.computedByKernel}
          </div>
        </div>
      )}
    </div>
  );
}

function ProvRow({ label, value }: { label: string; value: number }) {
  const pct = (value * 100).toFixed(0);
  const color = value >= 0.7 ? "#4ec9a0" : value >= 0.5 ? "#fee440" : "#f97316";
  return (
    <div className="flex items-center justify-between">
      <span className="text-[#858585]">{label}</span>
      <div className="flex items-center gap-1">
        <div className="w-[50px] h-[3px] bg-[#333] rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
        </div>
        <span style={{ color }}>{pct}%</span>
      </div>
    </div>
  );
}

// ─── Agent badge ──────────────────────────────────────────────────────────────

function AgentBadge({ agentId, rulesMatched, capabilityTrace }: {
  agentId: string;
  rulesMatched: string[];
  capabilityTrace: string[];
}) {
  const color = AGENT_COLORS[agentId] ?? "#858585";
  const label = agentId.replace("-agent", "").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span
        className="text-[9px] font-semibold px-2 py-0.5 rounded-full"
        style={{ background: `${color}22`, color }}
      >
        {label} Agent
      </span>
      {rulesMatched.length > 0 && (
        <span className="text-[9px] text-[#555] flex items-center gap-1">
          <CheckCircle2 className="h-2.5 w-2.5" />
          {rulesMatched.length} rule{rulesMatched.length > 1 ? "s" : ""} matched
        </span>
      )}
    </div>
  );
}

// ─── Opportunity chip ─────────────────────────────────────────────────────────

function OpportunityChip({ opp, onDismiss, onActivate }: {
  opp: OpportunityChipViewModel;
  onDismiss: () => void;
  onActivate: () => void;
}) {
  return (
    <div className="flex items-start gap-2 bg-[#1a2332] border border-[#3b9fd933] rounded-lg p-2 text-[10px]">
      <Lightbulb className="h-3 w-3 text-[#3b9fd9] shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-[#3b9fd9] truncate">{opp.title}</div>
        <div className="text-[#555] leading-tight mt-0.5">{opp.description}</div>
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          onClick={onActivate}
          className="text-[9px] px-1.5 py-0.5 bg-[#3b9fd922] text-[#3b9fd9] rounded hover:bg-[#3b9fd944] transition-colors"
        >
          Run
        </button>
        <button onClick={onDismiss} className="p-0.5 hover:text-[#858585] text-[#444] rounded">
          <X className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Streaming markdown renderer ──────────────────────────────────────────────

function StreamingMessage({ content, preamble, isStreaming }: {
  content: string;
  preamble: StreamPreamble | null;
  isStreaming: boolean;
}) {
  // Simple markdown-to-JSX: bold, headers, bullet points
  const renderMarkdown = (text: string) => {
    const lines = text.split("\n");
    return lines.map((line, i) => {
      if (line.startsWith("## ")) {
        return <div key={i} className="font-bold text-[12px] text-white mt-2 mb-1">{line.slice(3)}</div>;
      }
      if (line.startsWith("### ")) {
        return <div key={i} className="font-semibold text-[11px] text-[#cccccc] mt-1.5 mb-0.5">{line.slice(4)}</div>;
      }
      if (line.startsWith("**") && line.endsWith("**")) {
        return <div key={i} className="font-semibold text-[#cccccc] mt-1">{line.slice(2, -2)}</div>;
      }
      if (line.startsWith("- ")) {
        const text = line.slice(2).replace(/\*\*(.*?)\*\*/g, "$1");
        return <div key={i} className="flex gap-1.5 text-[#aaaaaa]"><span className="text-[#555] shrink-0">•</span><span>{text}</span></div>;
      }
      if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
        return <div key={i} className="text-[#666] italic">{line.slice(1, -1)}</div>;
      }
      if (line.startsWith("---")) {
        return <div key={i} className="border-t border-[#2b2b2b] my-2" />;
      }
      if (line.trim() === "") {
        return <div key={i} className="h-1" />;
      }
      // Inline bold
      const parts = line.split(/\*\*(.*?)\*\*/g);
      return (
        <div key={i} className="text-[#aaaaaa] leading-relaxed">
          {parts.map((part, j) => j % 2 === 1 ? <strong key={j} className="text-[#cccccc]">{part}</strong> : part)}
        </div>
      );
    });
  };

  return (
    <div className="space-y-1">
      {preamble && (
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <AgentBadge
            agentId={preamble.agentId}
            rulesMatched={preamble.rulesMatched}
            capabilityTrace={preamble.capabilityTrace}
          />
          <ConfidenceChip
            confidence={preamble.confidence}
            provenance={preamble.confidenceProvenance}
          />
          {preamble.epistemicTypesProduced.map((type) => {
            const cfg = EPISTEMIC_CONFIG[type];
            const Icon = cfg.icon;
            return (
              <span key={type} className="text-[9px] flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ color: cfg.color, background: `${cfg.color}11` }}>
                <Icon className="h-2.5 w-2.5" />
                {cfg.label}
              </span>
            );
          })}
        </div>
      )}
      <div className="space-y-0.5">
        {renderMarkdown(content)}
        {isStreaming && (
          <span className="inline-block h-3 w-1 bg-[#007acc] animate-pulse ml-0.5" />
        )}
      </div>
    </div>
  );
}

// ─── Message type ─────────────────────────────────────────────────────────────

interface EnhancedMessage {
  id: string;
  sender: "user" | "agent";
  text: string;
  preamble?: StreamPreamble | null;
  isStreaming?: boolean;
  timestamp: string;
  thinkingStartedAt?: number;
  thinkingDuration?: number; // seconds
  thought?: string; // internal reasoning shown in disclosure
}

// ─── Thinking indicator ───────────────────────────────────────────────────────

const THINKING_PHASES = ["Thinking", "Analyzing", "Synthesizing"] as const;

function ThinkingIndicator({ startedAt }: { startedAt: number }) {
  const [phase, setPhase] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const phaseTimer = setInterval(() => setPhase((p) => (p + 1) % THINKING_PHASES.length), 2000);
    const elapsedTimer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 200);
    return () => { clearInterval(phaseTimer); clearInterval(elapsedTimer); };
  }, [startedAt]);

  return (
    <div className="flex items-center gap-2.5 py-0.5">
      {/* Animated orb */}
      <div className="relative h-4 w-4 shrink-0">
        <div className="absolute inset-0 rounded-full bg-[#007acc] opacity-20 animate-ping" />
        <div className="absolute inset-[3px] rounded-full bg-[#007acc]" />
      </div>
      {/* Phase text */}
      <span
        key={phase}
        className="text-[11px] font-medium text-[#cccccc] animate-in fade-in slide-in-from-bottom-1 duration-300"
      >
        {THINKING_PHASES[phase]}
        <span className="inline-flex gap-[2px] ml-[2px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-[3px] w-[3px] rounded-full bg-[#007acc] animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </span>
      </span>
      {/* Elapsed */}
      <span className="ml-auto text-[9px] text-[#444] tabular-nums">{elapsed}s</span>
    </div>
  );
}

// ─── Thought disclosure ───────────────────────────────────────────────────────

function ThoughtDisclosure({ duration, thought }: { duration: number; thought?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[10px] text-[#555] hover:text-[#858585] transition-colors group"
      >
        <span
          className="inline-block transition-transform duration-200"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ›
        </span>
        <span>Thought for {duration}s</span>
      </button>
      {open && thought && (
        <div className="mt-1.5 ml-3 pl-2 border-l border-[#2b2b2b] text-[10px] text-[#555] leading-relaxed italic animate-in fade-in slide-in-from-top-1 duration-200">
          {thought}
        </div>
      )}
    </div>
  );
}

// ─── Input box sub-component ─────────────────────────────────────────────────

interface InputBoxProps {
  inputVal: string;
  setInputVal: (v: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleSend: () => void;
  isGenerating: boolean;
  dropdownOpen: boolean;
  setDropdownOpen: (v: boolean) => void;
  currentModeObj: { id: string; label: string; icon: () => React.ReactNode };
  modes: { id: string; label: string; icon: () => React.ReactNode }[];
  selectedMode: string;
  setSelectedMode: (v: string) => void;
  modelDropdownOpen: boolean;
  setModelDropdownOpen: (v: boolean) => void;
  selectedModel: string;
  setSelectedModel: (v: string) => void;
  dropUp?: boolean; // when true, dropdowns open upward (input is near bottom of panel)
}

function InputBox({
  inputVal, setInputVal, handleKeyDown, handleSend, isGenerating,
  dropdownOpen, setDropdownOpen, currentModeObj, modes, selectedMode, setSelectedMode,
  modelDropdownOpen, setModelDropdownOpen, selectedModel, setSelectedModel,
  dropUp = false,
}: InputBoxProps) {
  // Dropdown anchor: open upward when input is at bottom, downward when at top
  const anchor = dropUp
    ? "bottom-full mb-1"
    : "top-full mt-1";
  const canSend = inputVal.trim().length > 0 && !isGenerating;
  return (
    <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg p-2 flex flex-col focus-within:border-[#007acc] transition-colors relative">
      <textarea
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe the anomaly, ask for interpretation, or type /plan for a workflow…"
        className="bg-transparent border-none outline-none resize-none text-[12px] text-[#cccccc] placeholder-[#858585] h-[70px] font-sans leading-relaxed"
      />
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#2b2b2b]">
        <div className="flex items-center gap-1.5 relative">
          <button
            onClick={() => { setDropdownOpen(!dropdownOpen); setModelDropdownOpen(false); }}
            className="flex items-center gap-1.5 text-[10px] bg-[#333333] hover:bg-[#3e3e42] px-2 py-0.5 rounded text-[#cccccc] border border-[#3c3c3c] transition-colors"
          >
            {currentModeObj.icon()}
            <span>{currentModeObj.label}</span>
            <ChevronDown className="h-2.5 w-2.5 text-[#858585]" />
          </button>
          {dropdownOpen && (
            <div className={`absolute left-0 ${anchor} bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-xl w-[140px] py-1 z-50 flex flex-col text-[12px]`}>
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => { setSelectedMode(mode.id); setDropdownOpen(false); }}
                  className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-[#333333] text-left text-[#cccccc] transition-colors w-full font-medium"
                >
                  <span className="text-[#858585] flex items-center justify-center w-3 h-3">{mode.icon()}</span>
                  <span className="flex-1">{mode.label}</span>
                  {selectedMode === mode.id && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#e1e1e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <button
              onClick={() => { setModelDropdownOpen(!modelDropdownOpen); setDropdownOpen(false); }}
              className="flex items-center gap-1 text-[9px] text-[#858585] px-1 hover:text-[#cccccc] transition-colors"
            >
              <span className="truncate max-w-[90px]">{selectedModel}</span>
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
            {modelDropdownOpen && (
              <div className={`absolute left-0 ${anchor} bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-xl w-[160px] py-1 z-50 flex flex-col text-[10px]`}>
                {["G-AID Simulation", "Gemini 1.5 Pro", "Claude 3.5 Sonnet", "GPT-4o"].map((model) => (
                  <button
                    key={model}
                    onClick={() => { setSelectedModel(model); setModelDropdownOpen(false); }}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#333333] text-left text-[#cccccc] transition-colors w-full"
                  >
                    <span className="flex-1">{model}</span>
                    {selectedModel === model && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#e1e1e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[#858585]">
          <button className="p-1 hover:bg-[#333333] hover:text-[#cccccc] rounded transition-colors"><Paperclip className="h-3.5 w-3.5" /></button>
          <button className="p-1 hover:bg-[#333333] hover:text-[#cccccc] rounded transition-colors"><Mic className="h-3.5 w-3.5" /></button>
          <button
            id="ai-panel-send-btn"
            onClick={handleSend}
            disabled={!canSend}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all duration-200",
              canSend
                ? "bg-[#007acc] text-white hover:bg-[#1b8fe3] shadow-[0_0_8px_#007acc55] cursor-pointer"
                : "bg-[#2a2a2a] text-[#444] cursor-not-allowed"
            )}
          >
            <SendHorizontal className="h-3 w-3" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AIPanel() {
  const {
    conversations,
    activeConversationId,
    setActiveConversationId,
    addConversation,
    removeConversation,
    updateConversationTopic,
    addMessageToConversation,
    toggleChatPanel,
    agentSettings
  } = useAppStore();

  const scientificState = useScientificState();
  const agentStore = useAgentStore();

  const textSizeClass = {
    "Small": "text-[10px]",
    "Default": "text-[12px]",
    "Large": "text-[14px]",
    "Extra Large": "text-[16px]"
  }[agentSettings?.textSize || "Default"];

  const activeConversation = conversations.find(c => c.id === activeConversationId) || conversations[0] || {
    id: "default", topic: "New Analysis", messages: []
  };

  const [inputVal, setInputVal] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedMode, setSelectedMode] = useState("Agent");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("G-AID Simulation");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const [enhancedMessages, setEnhancedMessages] = useState<EnhancedMessage[]>([]);
  const [currentStreamId, setCurrentStreamId] = useState<string | null>(null);
  const [hasSentMessage, setHasSentMessage] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const opportunities = scientificState.getOpportunityChipsViewModel();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [enhancedMessages, agentStore.streamBuffer]);

  const generateTopic = (msg: string) => {
    const lc = msg.toLowerCase();
    if (lc.includes("exploration") || lc.includes("survey")) return "Exploration Survey";
    if (lc.includes("ert") || lc.includes("resistivity")) return "ERT Interpretation";
    if (lc.includes("seismic") || lc.includes("earthquake")) return "Seismic Analysis";
    if (lc.includes("gravity") || lc.includes("magnetic")) return "Potential Fields";
    if (lc.includes("groundwater") || lc.includes("aquifer")) return "Hydrogeological Analysis";
    return msg.length > 25 ? msg.substring(0, 22) + "…" : msg;
  };

  const handleAddConversation = () => {
    const limit = agentSettings?.maxTabCount?.value;
    if (limit !== "Unlimited" && limit !== undefined) {
      const limitNum = Number(limit);
      if (!isNaN(limitNum) && conversations.length >= limitNum) {
        setShowLimitWarning(true);
        setTimeout(() => setShowLimitWarning(false), 3000);
        return;
      }
    }
    addConversation();
  };

  const handleSend = useCallback(async () => {
    if (!inputVal.trim() || isGenerating) return;

    const userMsg = inputVal.trim();
    setInputVal("");
    setHasSentMessage(true);

    if (enhancedMessages.length === 0) {
      updateConversationTopic(activeConversation.id, generateTopic(userMsg));
    }

    const userMsgId = `msg_${Date.now()}_user`;
    setEnhancedMessages(prev => [...prev, {
      id: userMsgId,
      sender: "user",
      text: userMsg,
      timestamp: new Date().toISOString(),
    }]);

    setIsGenerating(true);
    agentStore.setOrchestratorThinking(true);
    agentStore.clearStream();
    agentStore.clearActivity(); // reset per-response activity log

    const agentMsgId = `msg_${Date.now()}_agent`;
    setCurrentStreamId(agentMsgId);
    const thinkingStart = Date.now();

    setEnhancedMessages(prev => [...prev, {
      id: agentMsgId,
      sender: "agent",
      text: "",
      preamble: null,
      isStreaming: true,
      timestamp: new Date().toISOString(),
      thinkingStartedAt: thinkingStart,
    }]);

    try {
      const response = await fetch("/api/agent/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          sessionId: activeConversation.id,
          mode: selectedMode === "Plan" ? "plan" : "interpret",
          snapshotData: scientificState.snapshot,
        }),
      });

      if (!response.body) throw new Error("No response body");
      agentStore.setOrchestratorThinking(false);
      agentStore.setStreaming(true);

      const reader = response.body.getReader();
      let preamble: StreamPreamble | null = null;
      let accumulatedText = "";
      let thought = ""; // internal reasoning shown in thought disclosure

      // ── Byte-scan state machine ──────────────────────────────────────────
      // Protocol: \x00{json}\n  |  text tokens (no per-token marker)  |  \n\x02{json}\n
      // States: "scan" → looking for first control byte
      //         "preamble" → inside \x00...\n JSON block
      //         "text" → streaming text (everything until \x02)
      //         "epilogue" → inside \x02...\n JSON block
      type ParseState = "scan" | "preamble" | "text" | "epilogue";
      let state: ParseState = "scan";
      let jsonBuf = "";
      let rawBuf = new Uint8Array(0);
      const dec = new TextDecoder();

      let activityId: string | null = null;
      let lastTextUpdate = 0; // throttle UI updates to ~60fps

      const processRaw = () => {
        let i = 0;
        while (i < rawBuf.length) {
          const byte = rawBuf[i];

          if (state === "scan") {
            if (byte === 0x00) { state = "preamble"; jsonBuf = ""; i++; }
            else if (byte === 0x02) { state = "epilogue"; jsonBuf = ""; i++; }
            else { i++; } // skip stray bytes in scan mode

          } else if (state === "preamble") {
            if (byte === 0x0a) { // \n ends preamble JSON
              try {
                preamble = JSON.parse(jsonBuf) as StreamPreamble;
                agentStore.setPreamble(preamble);
                agentStore.setActiveAgent(preamble.agentId as AgentId);
                // Only append one activity entry per response
                if (!activityId) {
                  activityId = agentStore.appendActivity({
                    actorId: preamble.agentId,
                    description: preamble.rulesMatched.length > 0
                      ? `${preamble.rulesMatched.length} rule${preamble.rulesMatched.length > 1 ? "s" : ""} matched, ${preamble.capabilityTrace.length} capabilit${preamble.capabilityTrace.length === 1 ? "y" : "ies"}`
                      : "Processing query…",
                    status: "running",
                    relatedToolId: null,
                  });
                }
              } catch { /* malformed preamble — ignore */ }
              state = "text"; jsonBuf = ""; i++;
            } else {
              jsonBuf += String.fromCharCode(byte); i++;
            }

          } else if (state === "text") {
            // Find the next \x02 (epilogue marker) in the remaining buffer
            let end = i;
            while (end < rawBuf.length && rawBuf[end] !== 0x02) end++;

            if (end > i) {
              const textSlice = rawBuf.slice(i, end);
              const decoded = dec.decode(textSlice, { stream: true });
              accumulatedText += decoded;
              agentStore.appendStreamToken(decoded);

              // Throttle React setState to ~60fps to avoid waterfall re-renders
              const now = Date.now();
              if (now - lastTextUpdate > 16) {
                lastTextUpdate = now;
                const snap = accumulatedText;
                const pSnap = preamble;
                setEnhancedMessages(prev =>
                  prev.map(m => m.id === agentMsgId
                    ? { ...m, text: snap, preamble: pSnap, isStreaming: true }
                    : m
                  )
                );
              }
            }

            if (end < rawBuf.length && rawBuf[end] === 0x02) {
              state = "epilogue"; jsonBuf = ""; i = end + 1;
            } else {
              i = end; // consumed all up to end
              break;   // need more data
            }

          } else if (state === "epilogue") {
            if (byte === 0x0a) { // \n ends epilogue JSON
              // Strip leading \n if present
              const clean = jsonBuf.replace(/^\n/, "");
              try {
                const epilogue = JSON.parse(clean);
                if (epilogue.hypothesisEvents?.length) {
                  for (const evt of epilogue.hypothesisEvents) {
                    scientificState.appendEvent("HYPOTHESIS_CREATED", epilogue.agentId, evt.payload);
                  }
                }
                if (epilogue.opportunitiesDetected > 0) {
                  scientificState.detectAndAppendOpportunities();
                }
                if (epilogue.thought) {
                  thought = epilogue.thought;
                }
                if (activityId) agentStore.completeActivity(activityId);
              } catch { /* malformed epilogue — ignore */ }
              state = "scan"; jsonBuf = ""; i++;
            } else {
              jsonBuf += String.fromCharCode(byte); i++;
            }
          }
        }

        // Consume processed bytes
        rawBuf = rawBuf.slice(i < rawBuf.length ? i : rawBuf.length);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Append new chunk to raw buffer
        const merged = new Uint8Array(rawBuf.length + value.length);
        merged.set(rawBuf);
        merged.set(value, rawBuf.length);
        rawBuf = merged;
        processRaw();
      }

      // Flush any remaining text in buffer
      if (rawBuf.length > 0 && (state as string) === "text") {
        const remaining = dec.decode(rawBuf, { stream: false });
        if (remaining.trim()) accumulatedText += remaining;
      }

      // Finalize message
      const thinkingDuration = Math.round((Date.now() - thinkingStart) / 1000);
      setEnhancedMessages(prev =>
        prev.map(m => m.id === agentMsgId
          ? { ...m, text: accumulatedText, preamble, isStreaming: false, thinkingDuration, thought: thought || undefined }
          : m
        )
      );

      agentStore.setStreaming(false);
      agentStore.clearStream();
      agentStore.setActiveAgent(null);

      // Persist to legacy conversation store
      addMessageToConversation(activeConversation.id, { sender: "user", text: userMsg });
      addMessageToConversation(activeConversation.id, { sender: "agent", text: accumulatedText });


    } catch (err) {
      const errorText = `Analysis failed: ${err instanceof Error ? err.message : "Unknown error"}. Please try again.`;
      setEnhancedMessages(prev =>
        prev.map(m => m.id === agentMsgId
          ? { ...m, text: errorText, isStreaming: false }
          : m
        )
      );
    } finally {
      setIsGenerating(false);
      setCurrentStreamId(null);
      agentStore.setOrchestratorThinking(false);
      agentStore.setStreaming(false);
    }
  }, [inputVal, isGenerating, activeConversation, selectedMode, scientificState, agentStore]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (agentSettings?.submitWithCtrlEnter) {
      if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); handleSend(); }
    } else {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    }
  };

  const modes = [
    { id: "Agent", label: "Agent", icon: () => <span className="text-[12px] font-semibold">∞</span> },
    { id: "Plan", label: "Plan", icon: () => (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
        <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
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
      {/* Tabs Header */}
      <div className="h-[35px] flex items-center bg-[#181818] shrink-0 relative z-20 select-none">
        <div className="flex-1 flex items-center h-full overflow-x-auto scrollbar-none">
          {conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <div
                key={conv.id}
                onClick={() => { setActiveConversationId(conv.id); setEnhancedMessages([]); }}
                className={cn(
                  "h-full flex items-center gap-2 px-3 border-r border-[#2b2b2b] text-[11px] cursor-pointer transition-colors relative group min-w-[100px] max-w-[140px] rounded-t-md",
                  isActive
                    ? "bg-[#1e1e1e] text-white border-t-2 border-[#007acc] font-medium"
                    : "bg-[#181818] text-[#858585] hover:bg-[#202020] hover:text-[#cccccc] border-b border-[#2b2b2b]"
                )}
              >
                <MessageSquare className="h-3 w-3 shrink-0" />
                <span className="truncate flex-1">{conv.topic}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeConversation(conv.id); }}
                  className="p-0.5 rounded hover:bg-[#333333] hover:text-white text-[#858585] shrink-0 transition-colors"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            );
          })}
          <div className="flex-1 h-full border-b border-[#2b2b2b] min-w-[20px]" />
        </div>

        <div className="flex items-center gap-1.5 px-2 text-[#858585] h-full shrink-0 border-l border-b border-[#2b2b2b] select-none">
          <div className="relative group flex items-center h-full">
            <button onClick={handleAddConversation} className="p-1 rounded hover:bg-white/10 hover:text-[#cccccc] transition-colors">
              <Plus className="h-3.5 w-3.5" />
            </button>
            <div className="absolute top-[110%] right-0 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap font-sans font-medium">new tab</div>
            {showLimitWarning && (
              <div className="absolute top-[120%] right-0 bg-red-500/10 backdrop-blur-xl border border-red-500/20 text-red-400 text-[10px] px-3 py-2 rounded shadow-2xl z-50 whitespace-nowrap font-sans flex flex-col gap-1 animate-in fade-in slide-in-from-top-2">
                <span className="font-bold flex items-center gap-1.5"><AlertCircle className="w-3 h-3" />Max tabs reached</span>
                <span className="text-red-400/80">Increase limit in Settings › Agents.</span>
              </div>
            )}
          </div>
          <div className="relative group flex items-center h-full">
            <button className="p-1 rounded hover:bg-white/10 hover:text-[#cccccc] transition-colors"><Clock className="h-3.5 w-3.5" /></button>
            <div className="absolute top-[110%] right-0 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap">conversation history</div>
          </div>
          <div className="relative group flex items-center h-full">
            <button className="p-1 rounded hover:bg-white/10 hover:text-[#cccccc] transition-colors"><MoreHorizontal className="h-3.5 w-3.5" /></button>
          </div>
          <div className="relative group flex items-center h-full">
            <button onClick={toggleChatPanel} className="p-1 rounded hover:bg-white/10 hover:text-[#cccccc] transition-colors"><PanelRight className="h-3.5 w-3.5" /></button>
            <div className="absolute top-[110%] right-0 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap">close panel</div>
          </div>
        </div>
      </div>

      {/* Main layout: input floats top until first send, then moves to bottom */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1e]">

        {/* Input box — shown at top ONLY before first message */}
        {!hasSentMessage && (
          <div className="p-3 border-b border-[#2b2b2b] shrink-0 bg-[#1e1e1e] animate-in fade-in duration-200">
            <InputBox
              inputVal={inputVal}
              setInputVal={setInputVal}
              handleKeyDown={handleKeyDown}
              handleSend={handleSend}
              isGenerating={isGenerating}
              dropdownOpen={dropdownOpen}
              setDropdownOpen={setDropdownOpen}
              currentModeObj={currentModeObj}
              modes={modes}
              selectedMode={selectedMode}
              setSelectedMode={setSelectedMode}
              modelDropdownOpen={modelDropdownOpen}
              setModelDropdownOpen={setModelDropdownOpen}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              dropUp={false}
            />
          </div>
        )}

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Opportunities */}
          {opportunities.length > 0 && enhancedMessages.length === 0 && (
            <div className="space-y-1.5 mb-2">
              <div className="text-[9px] text-[#555] uppercase font-semibold tracking-wider">Proactive Opportunities</div>
              {opportunities.slice(0, 3).map((opp) => (
                <OpportunityChip
                  key={opp.id}
                  opp={opp}
                  onDismiss={() => scientificState.dismissOpportunity(opp.id)}
                  onActivate={() => {
                    setInputVal(`Run analysis: ${opp.title}`);
                  }}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {enhancedMessages.length === 0 && opportunities.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center text-[#858585] p-6 space-y-2">
              <div className="h-10 w-10 rounded-full bg-[#252526] border border-[#3c3c3c] flex items-center justify-center mb-2">
                <Zap className="h-5 w-5 text-[#007acc]" />
              </div>
              <p className="text-[11px] font-medium text-[#cccccc]">G-AID Scientific Engine</p>
              <p className="text-[10px] max-w-[220px] leading-relaxed">
                Upload datasets to activate proactive opportunities, or describe your geophysical anomaly to begin analysis.
              </p>
              <div className="flex gap-2 mt-2 flex-wrap justify-center">
                {["Magnetic anomaly analysis", "ERT aquifer target", "Multi-method integration"].map((hint) => (
                  <button
                    key={hint}
                    onClick={() => setInputVal(hint)}
                    className="text-[9px] px-2 py-1 rounded border border-[#3c3c3c] text-[#555] hover:text-[#cccccc] hover:border-[#555] transition-colors"
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {enhancedMessages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col leading-relaxed font-sans",
                textSizeClass,
                msg.sender === "user"
                  ? "bg-[#007acc] text-white ml-auto max-w-[85%] rounded-lg p-2.5 shadow-sm"
                  : "text-[#cccccc] mr-auto max-w-full py-1"
              )}
            >
              {msg.sender === "user" ? (
                <p className="whitespace-pre-wrap">{msg.text}</p>
              ) : (
                <>
                  {/* Thought disclosure — shown when done */}
                  {msg.thinkingDuration !== undefined && !msg.isStreaming && (
                    <ThoughtDisclosure duration={msg.thinkingDuration} thought={msg.thought} />
                  )}
                  {/* Live thinking indicator — shown while streaming with no text yet */}
                  {msg.isStreaming && msg.thinkingStartedAt && msg.text === "" && (
                    <ThinkingIndicator startedAt={msg.thinkingStartedAt} />
                  )}
                  <StreamingMessage
                    content={msg.text}
                    preamble={msg.preamble ?? null}
                    isStreaming={msg.isStreaming ?? false}
                  />
                  {/* Opportunity chips after agent response */}
                  {!msg.isStreaming && opportunities.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {opportunities.slice(0, 2).map((opp) => (
                        <OpportunityChip
                          key={opp.id}
                          opp={opp}
                          onDismiss={() => scientificState.dismissOpportunity(opp.id)}
                          onActivate={() => setInputVal(`Run analysis: ${opp.title}`)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {/* Generating indicator — only shown when no agent message bubble exists yet */}
          {isGenerating && agentStore.isOrchestratorThinking && enhancedMessages.length === 0 && (
            <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg p-3 mr-auto max-w-[85%]">
              <ThinkingIndicator startedAt={Date.now()} />
            </div>
          )}
        </div>

        {/* Agent Activity Monitor */}
        <AgentActivity />

        {/* Input box — shown at bottom AFTER first message is sent */}
        {hasSentMessage && (
          <div className="p-3 border-t border-[#2b2b2b] shrink-0 bg-[#1e1e1e] animate-in slide-in-from-bottom-4 fade-in duration-300">
            <InputBox
              inputVal={inputVal}
              setInputVal={setInputVal}
              handleKeyDown={handleKeyDown}
              handleSend={handleSend}
              isGenerating={isGenerating}
              dropdownOpen={dropdownOpen}
              setDropdownOpen={setDropdownOpen}
              currentModeObj={currentModeObj}
              modes={modes}
              selectedMode={selectedMode}
              setSelectedMode={setSelectedMode}
              modelDropdownOpen={modelDropdownOpen}
              setModelDropdownOpen={setModelDropdownOpen}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              dropUp={true}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
