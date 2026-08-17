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
  Paperclip, Mic, ChevronDown, ChevronRight, ChevronUp, AlertCircle, Zap, GitBranch,
  TrendingUp, AlertTriangle, Info, CheckCircle2, Network,
  BarChart3, Lightbulb, SendHorizontal, Search, Trash2, FileText,
  Copy, ThumbsUp, ThumbsDown, RotateCcw, Check
} from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { useScientificState } from "@/store/scientific-state";
import { useAgentStore } from "@/store/agent-store";
import { cn } from "@/lib/utils";
import type { StreamPreamble, OpportunityChipViewModel, HypothesisEpistemicType, AgentId } from "@/types/scientific";
import { AgentActivity } from "@/components/workspace/agent-activity";
import { summariseFileForAgent } from "@/lib/auto-ingest";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

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

// ─── Copy Button ──────────────────────────────────────────────────────────────

function CopyButton({ text, className, iconClassName }: { text: string; className?: string; iconClassName?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button 
      className={cn("relative transition-colors", className)} 
      onClick={handleCopy}
      title="Copy"
    >
      {copied ? (
        <Check className={cn("h-3.5 w-3.5", iconClassName)} />
      ) : (
        <Copy className={cn("h-3.5 w-3.5", iconClassName)} />
      )}
      {copied && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-[#252526] text-[#cccccc] text-[11px] font-medium rounded shadow-xl whitespace-nowrap z-50 animate-in fade-in zoom-in-95 duration-100 border border-[#3c3c3c]">
          Copied
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-[#3c3c3c]">
             <div className="absolute -top-[5px] -left-[4px] border-4 border-transparent border-t-[#252526]" />
          </div>
        </div>
      )}
    </button>
  );
}

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

function StreamingMessage({ content, preamble, isStreaming, isThinking, showConfidence }: {
  content: string;
  preamble: StreamPreamble | null;
  isStreaming: boolean;
  isThinking?: boolean;
  showConfidence?: boolean;
}) {
  let formattedText = content.trim();
  
  // Strip outer markdown wrapper if the LLM mistakenly wrapped its entire response in a code block
  if (formattedText.startsWith("```markdown")) {
    formattedText = formattedText.substring(11).trimStart();
    if (formattedText.endsWith("```")) {
      formattedText = formattedText.substring(0, formattedText.length - 3).trimEnd();
    }
  } else if (formattedText.startsWith("```md")) {
    formattedText = formattedText.substring(5).trimStart();
    if (formattedText.endsWith("```")) {
      formattedText = formattedText.substring(0, formattedText.length - 3).trimEnd();
    }
  }
  return (
    <div className="space-y-1">
      <div className="space-y-0.5">
        <div className="text-[13px] leading-relaxed text-[var(--ws-text)] break-words w-full max-w-full overflow-hidden prose prose-invert prose-p:my-1 prose-pre:bg-[#1e1e1e] prose-pre:border prose-pre:border-[#2b2b2b] prose-code:text-[#d4d4d4] prose-code:bg-[#1e1e1e] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-table:border-collapse prose-table:w-full prose-td:border prose-td:border-[#2b2b2b] prose-td:p-2 prose-th:border prose-th:border-[#2b2b2b] prose-th:p-2 prose-th:bg-[#181818] prose-th:text-left">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {formattedText}
          </ReactMarkdown>
        </div>
      </div>
      {showConfidence && preamble && !isStreaming && formattedText && (
        <div className="pt-2">
          <ConfidenceChip
            confidence={preamble.confidence}
            provenance={preamble.confidenceProvenance}
          />
        </div>
      )}
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
  thinkingDuration?: number;
  thought?: string;
  awaitingApproval?: boolean;
  taskFolder?: string;
}

function ThoughtDisclosure({ duration, thought, isThinking }: { duration: number; thought?: string; isThinking?: boolean }) {
  const [open, setOpen] = useState(false);
  const thoughtRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !thoughtRef.current) return;
    thoughtRef.current.scrollTop = thoughtRef.current.scrollHeight;
  }, [thought, open, isThinking]);

  const formatTime = (secs: number) => {
    const safe = Math.max(1, secs || 0);
    if (safe < 60) return `${safe}s`;
    const m = Math.floor(safe / 60);
    const s = safe % 60;
    if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
  };

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[13px] text-[#c8c8c8] hover:text-white transition-colors"
      >
        {isThinking ? (
          <span className="gaid-thinking-shimmer font-medium select-none">Thinking</span>
        ) : (
          <span>Thought for {formatTime(duration)}</span>
        )}
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        )}
      </button>
      {open && (isThinking || thought) && (
        <div
          ref={thoughtRef}
          className="mt-3 ml-2 text-[13px] text-[#a0a0a0] leading-relaxed border-l-2 border-[#333] pl-3 max-h-[240px] overflow-y-auto scrollbar-thin"
        >
          {thought && thought.includes("[1/") ? (
            <ul className="list-disc space-y-1 pl-4">
              {thought.split('\n').filter(Boolean).map((line, i) => {
                const cleanLine = line.replace(/^\[\d+\/\d+\]\s*/, '');
                return <li key={i}>{cleanLine}</li>;
              })}
            </ul>
          ) : (
            <div className="whitespace-pre-wrap font-mono text-[12px] opacity-80">
              {thought || ""}
              {isThinking && <span className="inline-block w-[6px] h-[12px] ml-0.5 align-[-1px] bg-[#858585] animate-pulse" />}
            </div>
          )}
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
  handleStop: () => void;
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
  inputVal, setInputVal, handleKeyDown, handleSend, handleStop, isGenerating,
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
    <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg p-2 flex flex-col focus-within:border-[#007acc] transition-colors relative shadow-sm">
      <textarea
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything, @ to mention, / for actions"
        className="bg-transparent border-none outline-none resize-none text-[12px] text-[#cccccc] placeholder-[#858585] h-[50px] font-sans leading-relaxed"
      />
      <div className="flex items-center justify-between mt-1 pt-1">
        <div className="flex items-center gap-1.5 relative">
          <button className="text-[#858585] hover:text-[#cccccc] p-1 rounded transition-colors mr-1">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => { setDropdownOpen(!dropdownOpen); setModelDropdownOpen(false); }}
            className="flex items-center gap-1.5 text-[10px] bg-transparent hover:bg-[#333333] px-1.5 py-0.5 rounded text-[#cccccc] transition-colors"
          >
            {currentModeObj.icon()}
            <span className="font-medium text-[#cccccc]">{currentModeObj.label}</span>
            <ChevronUp className="h-3 w-3 text-[#858585]" />
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
                {["G-AID Orchestra"].map((model) => (
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
        <div className="flex items-center gap-1">
          <button type="button" className="text-[#858585] hover:text-[#cccccc] p-1.5 rounded-full transition-colors bg-[#333333] border border-[#3c3c3c]" title="Voice">
            <Mic className="h-3.5 w-3.5" />
          </button>
          {isGenerating ? (
            <button
              type="button"
              onClick={handleStop}
              title="Stop"
              className="h-7 w-7 rounded-full bg-[#2a2a2a] border border-[#3c3c3c] hover:bg-[#333] transition-colors flex items-center justify-center"
            >
              <span className="block h-2.5 w-2.5 rounded-[2px] bg-[#ef4444]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!canSend}
              title="Send"
              className={cn(
                "p-1.5 rounded-full transition-colors",
                canSend
                  ? "bg-[#007acc] text-white hover:bg-[#1b8fe3]"
                  : "bg-[#2a2a2a] text-[#555555] border border-[#3c3c3c]"
              )}
            >
              <SendHorizontal className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Pending Changes Widget ──────────────────────────────────────────────────

function PendingChangesWidget() {
  const pendingFileUpdates = useAppStore(state => state.pendingFileUpdates);
  const applyPendingFileUpdates = useAppStore(state => state.applyPendingFileUpdates);
  const clearPendingFileUpdates = useAppStore(state => state.clearPendingFileUpdates);

  if (!pendingFileUpdates || pendingFileUpdates.length === 0) return null;

  return (
    <div className="bg-[#252526] border border-[#3c3c3c] rounded-lg p-2.5 mb-2 shadow-lg animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-[#cccccc]" />
          <span className="text-[12px] font-semibold text-[#cccccc]">{pendingFileUpdates.length} Files Modified</span>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={clearPendingFileUpdates}
            className="text-[11px] font-medium text-[#858585] hover:text-[#cccccc] transition-colors"
          >
            Reject all
          </button>
          <button 
            onClick={applyPendingFileUpdates}
            className="px-2.5 py-0.5 bg-[#007acc] hover:bg-[#1b8fe3] text-white text-[11px] font-medium rounded transition-colors"
          >
            Accept all
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1 max-h-[120px] overflow-y-auto pr-1">
        {pendingFileUpdates.map((file, idx) => (
          <div key={idx} className="flex items-center justify-between px-2 py-1 bg-[#1e1e1e] rounded border border-[#2b2b2b]">
            <span className="text-[11px] text-[#cccccc] font-mono truncate max-w-[180px]">{file.id.split('/').pop() || file.id}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-[#4caf50]">+<span className="opacity-0">0</span></span>
              <span className="text-[10px] text-[#f44336]">-<span className="opacity-0">0</span></span>
            </div>
          </div>
        ))}
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
    hideConversation,
    updateConversationTopic,
    addMessageToConversation,
    toggleChatPanel,
    agentSettings,
    fileContents,
    projectFiles,
    isHistoryModalOpen,
    setHistoryModalOpen,
    currentProject,
    setActiveFile,
    setWorkspaceView,
    openWorkbenchTab,
    setConversationState,
    updateMessageInConversation
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

  const inputVal = activeConversation.inputVal || "";
  const setInputVal = (val: string) => setConversationState(activeConversation.id, { inputVal: val });
  
  const isGenerating = activeConversation.isGenerating || false;
  const setIsGenerating = (val: boolean) => setConversationState(activeConversation.id, { isGenerating: val });
  
  const enhancedMessages = activeConversation.messages;
  const hasSentMessage = enhancedMessages.length > 0;

  const [selectedMode, setSelectedMode] = useState("Agent");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState("G-AID Orchestra");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isAutoScrollEnabled = useRef(true);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    isAutoScrollEnabled.current = isAtBottom;
  };

  const opportunities = scientificState.getOpportunityChipsViewModel();

  useEffect(() => {
    if (scrollRef.current && isAutoScrollEnabled.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [enhancedMessages, agentStore.streamBuffer]);

  // Listen for pending prompts from other parts of the app
  const { pendingPrompt, setPendingPrompt, setChatPanelOpen } = useAppStore();

  const assignAiTopic = useCallback(async (convId: string, userMsg: string, reply: string) => {
    try {
      const response = await fetch("/api/agent/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, reply }),
      });
      const data = await response.json().catch(() => ({}));
      const title = typeof data?.title === "string" ? data.title.trim() : "";
      updateConversationTopic(convId, title || "New conversation");
    } catch {
      updateConversationTopic(convId, "New conversation");
    }
  }, [updateConversationTopic]);

  const handleAddConversation = () => {
    const limit = agentSettings?.maxTabCount?.value;
    if (limit !== "Unlimited" && limit !== undefined) {
      const limitNum = Number(limit);
      const visibleCount = conversations.filter(c => !c.hidden).length;
      if (!isNaN(limitNum) && visibleCount >= limitNum) {
        setShowLimitWarning(true);
        setTimeout(() => setShowLimitWarning(false), 3000);
        return;
      }
    }
    addConversation();
  };

  const handleUndo = (msgId: string) => {
    const conv = conversations.find(c => c.id === activeConversationId);
    if (!conv) return;
    
    const msgIndex = conv.messages.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return;
    
    const msg = conv.messages[msgIndex];
    
    setInputVal(msg.text);
    
    if (isGenerating) {
      setConversationState(conv.id, { isGenerating: false });
      agentStore.setStreaming(false);
      agentStore.setOrchestratorThinking(false);
    }
    
    useAppStore.getState().clearPendingFileUpdates();
    
    const newMessages = conv.messages.slice(0, msgIndex);
    setConversationState(conv.id, { messages: newMessages });
  };

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleSend = useCallback(async (eOrPrompt?: React.MouseEvent | React.FormEvent | string) => {
    // If it's an event, it will be an object. If it's a direct string, it's a string.
    const isString = typeof eOrPrompt === "string";
    if (!isString && eOrPrompt && "preventDefault" in eOrPrompt) {
      eOrPrompt.preventDefault();
    }
    const textToSend = isString ? eOrPrompt : inputVal;

    if (!textToSend.trim() || isGenerating) return;
    const userMsg = textToSend.trim();
    const convId = activeConversation.id;

    if (!isString) setInputVal("");

    const shouldTitle = activeConversation.messages.length === 0;

    const userMsgId = `msg_${Date.now()}_user`;
    
    // Persist user message to store immediately
    addMessageToConversation(convId, { 
      id: userMsgId,
      sender: "user", 
      text: userMsg,
      timestamp: new Date().toISOString()
    });

    isAutoScrollEnabled.current = true;
    setIsGenerating(true);
    agentStore.setOrchestratorThinking(true);
    agentStore.clearStream();
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    const agentMsgId = `msg_${Date.now()}_agent`;
    let actualThinkingStart: number | undefined;
    let thinkingDurationRecorded: number | undefined;
    let accumulatedText = "";
    let preamble: StreamPreamble | null = null;

    addMessageToConversation(convId, {
      id: agentMsgId,
      sender: "agent",
      text: "",
      preamble: null,
      isStreaming: true,
      thinkingStartedAt: Date.now(),
      timestamp: new Date().toISOString(),
    });

    try {
      // Build file content summaries for the orchestrator
      const fileSummaries = projectFiles
        .filter((f) => fileContents[f.id])
        .slice(0, 20)
        .map((f) => summariseFileForAgent(f.id, fileContents[f.id]))
        .join("\n\n");

      const lowerMsg = userMsg.toLowerCase().trim();
      const isGreeting = /^(hi|hello|hey|howdy|greetings|good\s(morning|afternoon|evening)|what's up|sup|yo)\b/.test(lowerMsg);
      const isConversational = isGreeting || lowerMsg === "help" || lowerMsg === "who are you";

      const enrichedMessage = (fileSummaries && !isConversational)
        ? `${userMsg}\n\n--- File Context ---\n${fileSummaries}`
        : userMsg;

      const response = await fetch("/api/agent/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: enrichedMessage,
          sessionId: convId,
          mode: selectedMode === "Plan" ? "plan" : "interpret",
          snapshotData: scientificState.snapshot,
          projectName: currentProject || "",
          guestId: localStorage.getItem("gaid_guest_id") || undefined,
          model: selectedModel,
        }),
        signal: abort.signal,
      });

      if (!response.ok) {
        // Server returned an error (e.g., 404 from diurnal analysis when no files found)
        const errorJson = await response.json().catch(() => ({ error: `Server error: ${response.status}` }));
        throw new Error(errorJson.error || `Request failed with status ${response.status}`);
      }

      if (!response.body) throw new Error("No response body");
      agentStore.setOrchestratorThinking(false);
      agentStore.setStreaming(true);

      const reader = response.body.getReader();
      let thought = ""; // internal reasoning shown in thought disclosure

      // ── Byte-scan state machine ──────────────────────────────────────────
      // Protocol: \x00{json}\n  |  text tokens (no per-token marker)  |  \n\x02{json}\n
      // States: "scan" → looking for first control byte
      //         "preamble" → inside \x00...\n JSON block
      //         "text" → streaming text (everything until \x02)
      //         "epilogue" → inside \x02...\n JSON block
      type ParseState = "scan" | "preamble" | "text" | "epilogue";
      let state: ParseState = "scan";
      let jsonBytes: number[] = [];
      let rawBuf = new Uint8Array(0);
      const dec = new TextDecoder();

let activityId: string | null = null;
      let lastTextUpdate = 0; // throttle UI updates to ~60fps
      interface EpilogueSnapshot {
        awaitingApproval?: boolean;
        taskFolder?: string;
        [key: string]: unknown;
      }
      let epilogueSnapshot: EpilogueSnapshot | null = null;

      const processRaw = () => {
        let i = 0;
        while (i < rawBuf.length) {
          const byte = rawBuf[i];

          if (state === "scan") {
            if (byte === 0x00) { state = "preamble"; jsonBytes = []; i++; }
            else if (byte === 0x02) { state = "epilogue"; jsonBytes = []; i++; }
            else { state = "text"; }

          } else if (state === "preamble") {
            if (byte === 0x0a) { // \n ends preamble JSON
              try {
                const jsonStr = dec.decode(new Uint8Array(jsonBytes));
                preamble = JSON.parse(jsonStr) as StreamPreamble;
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
                    conversationId: convId,
                  });
                }
              } catch { /* malformed preamble — ignore */ }
              state = "text"; jsonBytes = []; i++;
            } else {
              jsonBytes.push(byte); i++;
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

              if (actualThinkingStart === undefined) {
                if (accumulatedText.includes("<think>") || accumulatedText.includes("<思考>")) {
                  actualThinkingStart = Date.now();
                }
              }

              if (thinkingDurationRecorded === undefined && actualThinkingStart !== undefined) {
                if (accumulatedText.includes("</think>") || accumulatedText.includes("</思考>")) {
                  thinkingDurationRecorded = Math.round((Date.now() - actualThinkingStart) / 1000);
                }
              }

              const now = Date.now();
              const firstThinkChunk = actualThinkingStart !== undefined && lastTextUpdate === 0;
              if (firstThinkChunk || now - lastTextUpdate > 16) {
                lastTextUpdate = now;
                const snap = accumulatedText;
                const pSnap = preamble;
                updateMessageInConversation(convId, agentMsgId, { 
                  text: snap, 
                  preamble: pSnap, 
                  isStreaming: true,
                  thinkingStartedAt: actualThinkingStart,
                  thinkingDuration: thinkingDurationRecorded
                });
              }
            }

            if (end < rawBuf.length && rawBuf[end] === 0x02) {
              state = "epilogue"; jsonBytes = []; i = end + 1;
            } else {
              i = end; // consumed all up to end
              break;   // need more data
            }

} else if (state === "epilogue") {
             if (byte === 0x0a) { // \n ends epilogue JSON
               try {
                 const jsonStr = dec.decode(new Uint8Array(jsonBytes));
                 // Strip leading \n if present
                 const clean = jsonStr.replace(/^\n/, "");
                 const epilogue = JSON.parse(clean);
                 epilogueSnapshot = epilogue;
                 if (epilogue.hypothesisEvents?.length) {
                   for (const evt of epilogue.hypothesisEvents) {
                     scientificState.appendEvent("HYPOTHESIS_CREATED", epilogue.agentId, evt.payload);
                   }
                 }
                 if (epilogue.opportunitiesDetected > 0) {
                   scientificState.detectAndAppendOpportunities();
                 }
                 if (epilogue.implementationPlanContent) {
                   useAppStore.getState().setFileContent("Implementation Plan", epilogue.implementationPlanContent);
                 }
                 if (epilogue.thought) {
                   thought = epilogue.thought;
                 }
                 if (epilogue.projectFilesUpdates && Array.isArray(epilogue.projectFilesUpdates)) {
                   const state = useAppStore.getState();
                   const currentFiles = state.projectFiles;
                   const newFiles = epilogue.projectFilesUpdates.filter((f: { id: string, content?: string }) => !currentFiles.some(existing => existing.id === f.id));
                   if (newFiles.length > 0) {
                      state.setProjectFiles([...currentFiles, ...newFiles]);
                      newFiles.forEach((f: { id: string, content?: string }) => {
                        if (f.content) {
                          state.setFileContent(f.id, f.content);
                        }
                      });
                   }
                 }
                 if (activityId) agentStore.completeActivity(activityId);
               } catch { /* malformed epilogue — ignore */ }
               state = "scan"; jsonBytes = []; i++;
             } else {
               jsonBytes.push(byte); i++;
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
      const thinkingDuration = thinkingDurationRecorded ?? Math.round((Date.now() - (actualThinkingStart || Date.now())) / 1000);
      updateMessageInConversation(convId, agentMsgId, {
        text: accumulatedText,
        preamble,
        isStreaming: false,
        thinkingDuration,
        thought: thought || undefined,
        awaitingApproval: (epilogueSnapshot as any)?.awaitingApproval ?? false,
        taskFolder: (epilogueSnapshot as any)?.taskFolder
      });

      if (shouldTitle) {
        void assignAiTopic(convId, userMsg, accumulatedText);
      }

      agentStore.setStreaming(false);
      agentStore.clearStream();
      agentStore.setActiveAgent(null);

    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (aborted) {
        const thinkingDuration = thinkingDurationRecorded ?? Math.round((Date.now() - (actualThinkingStart || Date.now())) / 1000);
        updateMessageInConversation(convId, agentMsgId, {
          text: accumulatedText,
          preamble,
          isStreaming: false,
          thinkingDuration,
        });
      } else {
        const errorText = `\n\n> ❌ **Connection Interrupted:** ${err instanceof Error ? err.message : "Unknown network error"}. If your machine went to sleep, the stream may have dropped.`;
        const finalMsgText = accumulatedText ? accumulatedText + errorText : errorText.trimStart();
        updateMessageInConversation(convId, agentMsgId, { text: finalMsgText, isStreaming: false });
      }
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
      setConversationState(convId, { isGenerating: false });
      agentStore.setOrchestratorThinking(false);
      agentStore.setStreaming(false);
    }
  }, [
    inputVal, isGenerating, activeConversation.id, activeConversation.messages.length, 
    addMessageToConversation, updateMessageInConversation, setConversationState, agentStore, scientificState, projectFiles, 
    fileContents, currentProject, selectedMode, updateConversationTopic, assignAiTopic
  ]);

  useEffect(() => {
    if (pendingPrompt && !isGenerating) {
      const prompt = pendingPrompt;
      setPendingPrompt(null);
      setChatPanelOpen(true);
      // Wait for chat panel to open before sending
      setTimeout(() => handleSend(prompt), 50);
    }
  }, [pendingPrompt, isGenerating, handleSend, setChatPanelOpen, setPendingPrompt]);


  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (agentSettings?.submitWithCtrlEnter) {
      if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); handleSend(); }
    } else {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    }
  };

const handleApproveDiurnal = async (sessionId: string) => {
    const dec = new TextDecoder();
    const approvalMsgId = `msg_${Date.now()}_approval`;
    const thinkingStart = Date.now();
    
    addMessageToConversation(sessionId, {
      id: approvalMsgId,
      sender: "agent",
      text: "",
      preamble: null,
      isStreaming: true,
      timestamp: new Date().toISOString(),
      thinkingStartedAt: thinkingStart,
    });
    
    try {
      const response = await fetch("/api/agent/approve-diurnal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          decision: "approve"
        }),
      });

      if (!response.body) throw new Error("No response body");
      
      const reader = response.body.getReader();
      let accumulated = "";
      let preamble: StreamPreamble | null = null;
      let rawBuf = new Uint8Array(0);
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const merged = new Uint8Array(rawBuf.length + value.length);
        merged.set(rawBuf);
        merged.set(value, rawBuf.length);
        rawBuf = merged;
        
        // Extract preamble and epilogue
        let pos = 0;
        while (pos < rawBuf.length) {
          if (rawBuf[pos] === 0x00) {
            // Preamble start - find the newline
            let end = pos + 1;
            while (end < rawBuf.length && rawBuf[end] !== 0x0a) end++;
            if (end < rawBuf.length) {
              const jsonStr = dec.decode(new Uint8Array(rawBuf.slice(pos + 1, end)));
              try {
                preamble = JSON.parse(jsonStr) as StreamPreamble;
              } catch {}
              pos = end + 1;
            } else break;
          } else if (rawBuf[pos] === 0x02) {
            // Epilogue start - find the newline
            let end = pos + 1;
            while (end < rawBuf.length && rawBuf[end] !== 0x0a) end++;
            if (end < rawBuf.length) {
              const jsonStr = dec.decode(new Uint8Array(rawBuf.slice(pos + 1, end)));
              try {
                const epilogue = JSON.parse(jsonStr.replace(/^\n/, ""));
                if (epilogue.projectFilesUpdates && Array.isArray(epilogue.projectFilesUpdates)) {
                   const state = useAppStore.getState();
                   const currentFiles = state.projectFiles;
                   const newFiles = epilogue.projectFilesUpdates.filter((f: any) => !currentFiles.some(existing => existing.id === f.id));
                   if (newFiles.length > 0) {
                      state.setProjectFiles([...currentFiles, ...newFiles]);
                   }
                }
              } catch (e) {}
            }
            pos = end + 1;
          } else {
            pos++;
          }
        }
        
        // Extract text content
        let textStart = 0;
        let textEnd = rawBuf.length;
        if (rawBuf[0] === 0x00) textStart = 1;
        for (let k = textStart; k < rawBuf.length; k++) {
          if (rawBuf[k] === 0x02) { textEnd = k; break; }
        }
        
        if (textEnd > textStart) {
          const slice = rawBuf.slice(textStart, textEnd);
          const decoded = dec.decode(slice, { stream: true });
          accumulated += decoded;
          updateMessageInConversation(sessionId, approvalMsgId, { text: accumulated, preamble, isStreaming: true });
        }
      }

      updateMessageInConversation(sessionId, approvalMsgId, { text: accumulated, preamble, isStreaming: false });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      updateMessageInConversation(sessionId, approvalMsgId, { text: `Approval failed: ${errorMsg}`, isStreaming: false });
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
    <aside className="w-full flex flex-col bg-[#1e1e1e] text-[#cccccc] font-sans h-full relative">
      {/* Tabs Header */}
      <div className="h-[35px] flex items-center bg-[#181818] shrink-0 relative z-20 select-none">
        <div className="flex-1 flex items-center h-full overflow-x-auto scrollbar-none">
          {conversations.filter(c => !c.hidden).map((conv) => {
            const isActive = conv.id === activeConversationId;
            return (
              <div
                key={conv.id}
                onClick={() => { setActiveConversationId(conv.id); }}
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
                  onClick={(e) => { e.stopPropagation(); hideConversation(conv.id); }}
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
            <button 
              onClick={() => setHistoryModalOpen(!isHistoryModalOpen)} 
              className={cn(
                "p-1 rounded transition-colors",
                isHistoryModalOpen ? "bg-white/10 text-white" : "text-[#858585] hover:bg-white/10 hover:text-[#cccccc]"
              )}
            >
              <Clock className="h-3.5 w-3.5" />
            </button>
            {!isHistoryModalOpen && (
              <div className="absolute top-[110%] right-0 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap">conversation history</div>
            )}
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
              handleStop={handleStop}
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
        <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 space-y-3">

          {/* Messages */}
          {enhancedMessages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex flex-col leading-relaxed font-sans group relative",
                textSizeClass,
                msg.sender === "user"
                  ? "bg-[#007acc] text-white ml-auto max-w-[85%] rounded-lg p-2.5 px-3 shadow-sm"
                  : "text-[var(--ws-text)] mr-auto max-w-full py-1"
              )}
            >
{msg.sender === "user" ? (
                 <div className="flex flex-col">
                   <p className="whitespace-pre-wrap">{msg.text}</p>
                   <div className="flex items-center gap-1.5 mt-1.5 -mb-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                     <span className="text-[9px] text-white/70 mr-auto select-none">
                       {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ""}
                     </span>
                     <CopyButton 
                       text={msg.text}
                       className="p-1 hover:bg-white/20 text-white/80 hover:text-white rounded" 
                       iconClassName="h-3 w-3"
                     />
                     <button 
                       className="p-1 hover:bg-white/20 text-white/80 hover:text-white transition-colors rounded" 
                       title="Undo"
                       onClick={() => handleUndo(msg.id!)}
                     >
                       <RotateCcw className="h-3 w-3" />
                     </button>
                   </div>
                 </div>
               ) : (() => {
                 let displayThought = msg.thought || "";
                 let displayText = msg.text;

                 // Extract all completed <think> blocks
                 const thinkRegex = /<think>([\s\S]*?)<\/think>|<思考>([\s\S]*?)<\/思考>/g;
                 let combinedThoughts = "";
                 let match;
                 while ((match = thinkRegex.exec(displayText)) !== null) {
                   combinedThoughts += (match[1] || match[2]).trim() + "\n\n";
                 }

                 if (combinedThoughts) {
                   displayThought = combinedThoughts.trim();
                   displayText = displayText.replace(/<think>[\s\S]*?<\/think>|<思考>[\s\S]*?<\/思考>/g, "");
                 }

                 // Check if there is an unclosed think block (streaming)
                 const openMatch = displayText.match(/<(?:think|思考)>/);
                 if (openMatch && openMatch.index !== undefined) {
                   const unclosedThought = displayText.slice(openMatch.index + openMatch[0].length);
                   if (unclosedThought || openMatch) {
                     displayThought = displayThought
                       ? (unclosedThought ? displayThought + "\n\n" + unclosedThought : displayThought)
                       : unclosedThought;
                   }
                   displayText = displayText.slice(0, openMatch.index).trim();
                 }
                 
                 // Clean up any stray closing tags that were outside of matched blocks
                 displayText = displayText.replace(/<\/(?:think|思考)>/g, "").trim();

                 const stillThinking = Boolean(msg.isStreaming) && msg.thinkingDuration === undefined && !displayText;
                 const showCompletedThought = !stillThinking && (Boolean(displayThought) || msg.thinkingDuration !== undefined);
                 const hasProjectData = projectFiles.some((f) => Boolean(fileContents[f.id]?.trim()));
                 const showConfidence = !msg.isStreaming
                   && hasProjectData
                   && Boolean(displayText.trim())
                   && Boolean(msg.preamble?.confidence)
                   && ((msg.preamble as StreamPreamble & { showConfidence?: boolean })?.showConfidence
                     || (msg.preamble?.rulesMatched?.length ?? 0) > 0
                     || (msg.preamble?.capabilityTrace?.length ?? 0) > 0);

                 return (
                 <>
                   {(stillThinking || showCompletedThought) ? (
                     <ThoughtDisclosure
                       duration={msg.thinkingDuration ?? 1}
                       thought={displayThought || undefined}
                       isThinking={stillThinking}
                     />
                   ) : null}
                   <StreamingMessage
                     content={displayText}
                     preamble={msg.preamble ?? null}
                     isStreaming={msg.isStreaming ?? false}
                     isThinking={Boolean(msg.isStreaming) && !displayText}
                     showConfidence={showConfidence}
                   />
                   {/* Action Bar */}
                   {!msg.isStreaming && (
                     <div className="flex items-center gap-2 mt-2 text-[#858585] text-[10px] w-full max-w-full">
                       <span className="mr-auto select-none">
                         {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ""}
                       </span>
                       <CopyButton 
                         text={displayText}
                         className="p-1 hover:text-[#cccccc] rounded hover:bg-white/5" 
                         iconClassName="h-3.5 w-3.5"
                       />
                       <button className="p-1 hover:text-[#cccccc] transition-colors rounded hover:bg-white/5" title="Good response">
                         <ThumbsUp className="h-3.5 w-3.5" />
                       </button>
                       <button className="p-1 hover:text-[#cccccc] transition-colors rounded hover:bg-white/5" title="Bad response">
                         <ThumbsDown className="h-3.5 w-3.5" />
                       </button>
                     </div>
                   )}
                   {/* Approval button for diurnal analysis plans */}
                   {!msg.isStreaming && msg.awaitingApproval && (
                     <div 
                       onClick={() => {
                         openWorkbenchTab("file:Implementation Plan", "file", "Implementation Plan");
                       }}
                       className="mt-4 bg-[#1e1e1e] border border-[#2b2b2b] rounded-lg p-3 w-full max-w-sm flex flex-col gap-2 shadow-sm cursor-pointer hover:border-[#3c3c3c] transition-colors"
                     >
                       <div className="flex items-center gap-2">
                         <FileText className="h-4 w-4 text-white" />
                         <span className="font-semibold text-white text-[13px]">Implementation Plan</span>
                       </div>
                       <p className="text-[12px] text-[#cccccc] mb-2 leading-relaxed">
                         Implementation plan for correcting diurnal variations.
                       </p>
                       <div className="flex gap-2">
                         <button
                           onClick={(e) => {
                             e.stopPropagation();
                             handleApproveDiurnal(activeConversation.id);
                           }}
                           className="px-4 py-1.5 text-[12px] font-semibold bg-[#007acc] text-white rounded hover:bg-[#1b8fe3] transition-colors"
                         >
                           Proceed
                         </button>
                       </div>
                     </div>
                   )}
                   {/* (Opportunities removed) */}
                 </>
                 );
               })()}
            </div>
          ))}

          {/* Generating indicator — only shown when no agent message bubble exists yet */}
          {isGenerating && agentStore.isOrchestratorThinking && enhancedMessages.length === 0 && (
            <div className="mr-auto max-w-[85%] py-1">
              <ThoughtDisclosure duration={1} isThinking thought="" />
            </div>
          )}
        </div>

        {/* Agent Activity Monitor has been removed to match new sleek IDE style */}

        {/* Input box — shown at bottom AFTER first message is sent */}
        {hasSentMessage && (
          <div className="p-3 border-t border-[#2b2b2b] shrink-0 bg-[#1e1e1e] animate-in slide-in-from-bottom-4 fade-in duration-300">
            <PendingChangesWidget />
            <InputBox
              inputVal={inputVal}
              setInputVal={setInputVal}
              handleKeyDown={handleKeyDown}
              handleSend={handleSend}
              handleStop={handleStop}
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
