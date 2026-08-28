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
import { formatWorkspaceForAgent, wantsWorkspaceContext } from "@/lib/workspace-index";
import { summarizeCatalog } from "@/lib/catalog/summarize";
import { mergeSearchHits, searchWorkspaceIndex, type WorkspaceSearchHit } from "@/lib/workspace-search";
import { applyWorkspaceFileUpdates } from "@/lib/workspace-files";
import { presentJobResultsFromEpilogue } from "@/lib/job-results";
import { refreshWorkspaceIndex } from "@/lib/open-workspace";
import { conversationTitleFromText, displayConversationTopic, isPlaceholderTopic } from "@/lib/conversation-title";
import { isTemporaryWorkspaceFile, TEMP_PLAN_ID } from "@/lib/workspace-file-ids";
import { ORCHESTRA_CHOICES, pickerLabel, resolveOrchestraSpeed, type OrchestraChoice } from "@/lib/orchestra-mode";
import { upsertWorkStep, type WorkStep } from "@/lib/work-steps";
import { WorkingLog } from "@/components/workspace/working-log";
import { PendingChangesCard } from "@/components/workspace/pending-changes";
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

function splitExecutionNarrative(text: string): { intro: string; outro: string } {
  const markers = [
    "Finished. Results are on the map.",
    "Finished. Check G-AID Output for results.",
    "Stopped. This run did not finish. Check G-AID Output only for whatever was written before the error.",
  ];
  for (const marker of markers) {
    const idx = text.lastIndexOf(marker);
    if (idx >= 0) {
      return { intro: text.slice(0, idx).trim(), outro: text.slice(idx).trim() };
    }
  }
  return { intro: text.trim(), outro: "" };
}

const THOUGHT_ECHO = /you are g-aid|never say you are|if asked who you are|system prompt|ground truth workspace|do not paste|implementation plan tab/i;

function cleanDisplayedThought(text: string): string {
  return text
    .replace(/<\/?(?:think|思考)>/gi, "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !THOUGHT_ECHO.test(trimmed);
    })
    .join("\n")
    .trim();
}

// ─── Streaming markdown renderer ──────────────────────────────────────────────

const DONE_REMARK_PLUGINS = [remarkGfm, remarkMath];
const DONE_REHYPE_PLUGINS = [rehypeKatex];

function TypingDots() {
  return (
    <span className="gaid-typing-dots" aria-label="Waiting for reply">
      <i />
      <i />
      <i />
    </span>
  );
}

function useSmoothReveal(target: string, active: boolean): string {
  const [shown, setShown] = useState(() => (active ? "" : target));
  const shownRef = useRef(active ? "" : target);
  const targetRef = useRef(target);
  const activeRef = useRef(active);
  targetRef.current = target;
  activeRef.current = active;

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const goal = targetRef.current;
      const current = shownRef.current;
      const streaming = activeRef.current;
      if (current === goal) {
        if (streaming) frame = requestAnimationFrame(tick);
        return;
      }
      if (current.length > goal.length || !goal.startsWith(current)) {
        shownRef.current = goal;
        setShown(goal);
        if (streaming) frame = requestAnimationFrame(tick);
        return;
      }
      const dt = Math.min(48, now - last);
      last = now;
      const behind = goal.length - current.length;
      const charsPerMs = !streaming ? 0.55 : behind > 480 ? 0.42 : behind > 160 ? 0.2 : 0.09;
      const add = Math.max(1, Math.ceil(dt * charsPerMs));
      const next = goal.slice(0, current.length + add);
      shownRef.current = next;
      setShown(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return shown;
}

function StreamingMessage({ content, preamble, isStreaming, isThinking, showConfidence }: {
  content: string;
  preamble: StreamPreamble | null;
  isStreaming: boolean;
  isThinking?: boolean;
  showConfidence?: boolean;
}) {
  let formattedText = isStreaming ? content : content.trim();
  if (!isStreaming) {
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
  }
  const revealed = useSmoothReveal(formattedText, Boolean(isStreaming && formattedText));
  return (
    <div className="space-y-1">
      <div className="space-y-0.5">
        <div className="text-[13px] leading-relaxed text-[var(--ws-text)] break-words w-full max-w-full overflow-hidden prose prose-invert prose-p:my-1 prose-pre:bg-[#1e1e1e] prose-pre:border prose-pre:border-[#2b2b2b] prose-code:text-[#d4d4d4] prose-code:bg-[#1e1e1e] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-table:border-collapse prose-table:w-full prose-td:border prose-td:border-[#2b2b2b] prose-td:p-2 prose-th:border prose-th:border-[#2b2b2b] prose-th:p-2 prose-th:bg-[#181818] prose-th:text-left">
          {isStreaming ? (
            <span className="whitespace-pre-wrap">
              {revealed}
              {revealed ? <span className="gaid-stream-caret" aria-hidden /> : null}
            </span>
          ) : (
            <ReactMarkdown
              remarkPlugins={DONE_REMARK_PLUGINS}
              rehypePlugins={DONE_REHYPE_PLUGINS}
            >
              {revealed}
            </ReactMarkdown>
          )}
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
  workSteps?: WorkStep[];
  interrupted?: boolean;
  interruptKind?: "network" | "empty" | "stalled" | "engine";
}

function InterruptCard({
  requestId,
  onRetry,
  onDismiss,
}: {
  requestId: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  const shortId = requestId.replace(/^msg_/, "").slice(0, 12);
  return (
    <div className="w-full max-w-[440px] rounded-xl border border-[#3d3d3d] bg-[#252526] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#e2b340]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-white">Connection interrupted</h3>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded p-0.5 text-[#858585] hover:bg-white/5 hover:text-white"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[#b4b4b4]">
            Your connection was interrupted, so this reply paused. Wait until you have a stable connection, then try again to continue from where it left off.
          </p>
          <div className="mt-3.5 flex items-center justify-between gap-3">
            <button
              type="button"
              className="min-w-0 truncate text-[11px] text-[#8a8a8a] hover:text-[#ccc]"
              onClick={() => void navigator.clipboard.writeText(requestId)}
              title="Copy request id"
            >
              Copy request {shortId}…
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex shrink-0 items-center gap-2 rounded-md bg-[#3c3c3c] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#4a4a4a]"
            >
              Try again
              <span className="font-mono text-[10px] text-[#9a9a9a]">Ctrl ↵</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThoughtDisclosure({ duration, thought, isThinking }: { duration: number; thought?: string; isThinking?: boolean }) {
  const [open, setOpen] = useState(Boolean(isThinking));
  const thoughtRef = useRef<HTMLDivElement>(null);
  const revealedThought = useSmoothReveal(thought || "", Boolean(isThinking));

  useEffect(() => {
    if (isThinking) setOpen(true);
  }, [isThinking]);

  useEffect(() => {
    if (!open || !thoughtRef.current) return;
    thoughtRef.current.scrollTop = thoughtRef.current.scrollHeight;
  }, [revealedThought, open, isThinking]);

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
      {open && (
        <div
          ref={thoughtRef}
          className="mt-3 ml-2 text-[13px] text-[#a0a0a0] leading-relaxed border-l-2 border-[#333] pl-3 max-h-[240px] overflow-y-auto scrollbar-thin"
        >
          {revealedThought.includes("[1/") ? (
            <ul className="list-disc space-y-1 pl-4">
              {revealedThought.split('\n').filter(Boolean).map((line, i) => {
                const cleanLine = line.replace(/^\[\d+\/\d+\]\s*/, '');
                return <li key={i}>{cleanLine}</li>;
              })}
            </ul>
          ) : (
            <div className="whitespace-pre-wrap font-mono text-[12px] opacity-80">
              {revealedThought}
              {isThinking ? <span className="gaid-stream-caret" aria-hidden /> : null}
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
  orchestraChoice: OrchestraChoice;
  setOrchestraChoice: (v: OrchestraChoice) => void;
  previewSpeed: "fast" | "thinking";
  dropUp?: boolean; // when true, dropdowns open upward (input is near bottom of panel)
}

function InputBox({
  inputVal, setInputVal, handleKeyDown, handleSend, handleStop, isGenerating,
  dropdownOpen, setDropdownOpen, currentModeObj, modes, selectedMode, setSelectedMode,
  modelDropdownOpen, setModelDropdownOpen, orchestraChoice, setOrchestraChoice, previewSpeed,
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
              title="Orchestra speed"
            >
              <span className="truncate max-w-[140px]">{pickerLabel(orchestraChoice, previewSpeed)}</span>
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
            {modelDropdownOpen && (
              <div className={`absolute left-0 ${anchor} bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-xl w-[240px] py-1 z-50 flex flex-col text-[10px]`}>
                {ORCHESTRA_CHOICES.map((choice) => (
                  <button
                    key={choice.id}
                    onClick={() => { setOrchestraChoice(choice.id); setModelDropdownOpen(false); }}
                    className="flex items-start gap-2 px-3 py-1.5 hover:bg-[#333333] text-left text-[#cccccc] transition-colors w-full"
                  >
                    <span className="flex-1">
                      <span className="block font-medium">{choice.label}</span>
                      <span className="block text-[9px] text-[#858585]">{choice.hint}</span>
                    </span>
                    {orchestraChoice === choice.id && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#e1e1e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-1 shrink-0">
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
    setAgentSettings,
    pluginState,
    fileContents,
    projectFiles,
    isHistoryModalOpen,
    setHistoryModalOpen,
    currentProject,
    workspaceRoot,
    workspaceIndex,
    projectCatalog,
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
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const orchestraChoice = (agentSettings?.orchestraChoice || "auto") as OrchestraChoice;
  const setOrchestraChoice = (choice: OrchestraChoice) => setAgentSettings({ orchestraChoice: choice });
  const previewSpeed = resolveOrchestraSpeed(inputVal, { choice: orchestraChoice });
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const abortReasonRef = useRef<"user" | "stall" | "retry" | null>(null);
  const sendGenRef = useRef(0);
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
    const fallback = conversationTitleFromText(userMsg);
    try {
      const response = await fetch("/api/agent/title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, reply }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json().catch(() => ({}));
      const title = typeof data?.title === "string" ? data.title.trim() : "";
      if (title && !isPlaceholderTopic(title)) {
        updateConversationTopic(convId, title);
        return;
      }
    } catch {
      /* keep the first-message title */
    }
    if (fallback) updateConversationTopic(convId, fallback);
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
    
    useAppStore.getState().clearPendingFileChanges();
    
    const newMessages = conv.messages.slice(0, msgIndex);
    setConversationState(conv.id, { messages: newMessages });
  };

  const handleStop = useCallback(() => {
    abortReasonRef.current = "user";
    abortRef.current?.abort();
  }, []);

  const handleSend = useCallback(async (
    eOrPrompt?: React.MouseEvent | React.FormEvent | string,
    opts?: { resumeAgentId?: string }
  ) => {
    const isString = typeof eOrPrompt === "string";
    if (!isString && eOrPrompt && "preventDefault" in eOrPrompt) {
      eOrPrompt.preventDefault();
    }

    const convId = activeConversation.id;
    const resumeAgentId = opts?.resumeAgentId;
    const liveMessages = useAppStore.getState().conversations.find((c) => c.id === convId)?.messages || [];
    let userMsg = (isString ? eOrPrompt : inputVal).trim();
    let agentMsgId = `msg_${Date.now()}_agent`;
    let accumulatedText = "";
    let resumePartial = "";

    if (resumeAgentId) {
      const idx = liveMessages.findIndex((m) => m.id === resumeAgentId);
      const prevUser = [...liveMessages.slice(0, idx)].reverse().find((m) => m.sender === "user");
      const agentMsg = idx >= 0 ? liveMessages[idx] : undefined;
      if (!prevUser?.text) return;
      userMsg = prevUser.text.trim();
      agentMsgId = resumeAgentId;
      resumePartial = (agentMsg?.text || "").replace(/\n\n> ❌ \*\*(?:Connection Interrupted|Intelligence Engine)[\s\S]*$/, "").trim();
      accumulatedText = resumePartial;
    }

    if (!userMsg || (isGenerating && !resumeAgentId)) return;
    if (!resumeAgentId && !isString) setInputVal("");

    const shouldTitle = !resumeAgentId && activeConversation.messages.length === 0;
    if (shouldTitle) {
      const instant = conversationTitleFromText(userMsg);
      if (instant) updateConversationTopic(convId, instant);
    }

    if (!resumeAgentId) {
      addMessageToConversation(convId, {
        id: `msg_${Date.now()}_user`,
        sender: "user",
        text: userMsg,
        timestamp: new Date().toISOString()
      });
    }

    isAutoScrollEnabled.current = true;
    setIsGenerating(true);
    agentStore.setOrchestratorThinking(true);
    agentStore.clearStream();
    abortReasonRef.current = null;
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const sendGen = sendGenRef.current + 1;
    sendGenRef.current = sendGen;

    let actualThinkingStart: number | undefined;
    let thinkingDurationRecorded: number | undefined;
    let preamble: StreamPreamble | null = null;
    let streamError: string | null = null;

    if (resumeAgentId) {
      updateMessageInConversation(convId, agentMsgId, {
        isStreaming: true,
        interrupted: false,
        interruptKind: undefined,
        text: accumulatedText,
      });
    } else {
      addMessageToConversation(convId, {
        id: agentMsgId,
        sender: "agent",
        text: "",
        preamble: null,
        isStreaming: true,
        timestamp: new Date().toISOString(),
      });
    }

    let stallTimer: ReturnType<typeof setTimeout> | null = null;
    const speed = resolveOrchestraSpeed(userMsg, {
      choice: orchestraChoice,
      planTurn: selectedMode === "Plan",
    });
    const firstStallMs = speed === "thinking" ? 180_000 : 55_000;
    const tokenStallMs = speed === "thinking" ? 120_000 : 45_000;
    const hasModelText = (value: string) =>
      Boolean(value.replace(/<\/?(?:think|思考)>/gi, "").trim());
    const armStall = (ms: number) => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        abortReasonRef.current = "stall";
        abort.abort();
      }, ms);
    };
    armStall(hasModelText(accumulatedText) ? tokenStallMs : firstStallMs);

    try {
      // Build file content summaries for the orchestrator
      const unsafeMedia = new Set(["raster", "point-cloud", "seismic", "binary", "image"]);
      const fileSummaries = projectFiles
        .filter((f) => fileContents[f.id] && !isTemporaryWorkspaceFile(f.id) && !isTemporaryWorkspaceFile(f.name))
        .filter((f) => {
          const record = projectCatalog?.records.find((item) => item.relativePath === f.id || item.relativePath === f.path);
          return !record || !unsafeMedia.has(record.mediaClass);
        })
        .slice(0, 20)
        .map((f) => summariseFileForAgent(f.id, fileContents[f.id]))
        .join("\n\n");

      const attachWorkspace = wantsWorkspaceContext(userMsg);
      let searchHits: WorkspaceSearchHit[] = [];
      if (attachWorkspace && workspaceIndex) {
        searchHits = searchWorkspaceIndex(workspaceIndex, userMsg);
        if (workspaceRoot && window.gaidDesktop?.searchWorkspace) {
          try {
            const extra = await window.gaidDesktop.searchWorkspace(workspaceRoot, userMsg, { maxHits: 40 });
            searchHits = mergeSearchHits(
              searchHits,
              extra.map((hit) => ({
                ...hit,
                why: (hit.why === "content" || hit.why === "kind" || hit.why === "name" ? hit.why : "path") as WorkspaceSearchHit["why"],
              }))
            );
          } catch (err) {
            console.warn("Workspace search failed:", err);
          }
        }
      }
      let workspaceCatalog = projectCatalog
        ? summarizeCatalog(projectCatalog, 80)
        : formatWorkspaceForAgent(workspaceIndex, 80, searchHits);
      if (projectCatalog && searchHits.length) {
        workspaceCatalog += `\nSearch hits:\n${searchHits
          .slice(0, 24)
          .map((hit) => `- ${hit.relativePath} (${hit.kind}${hit.why ? `, ${hit.why}` : ""})`)
          .join("\n")}`;
      }

      const contextBlocks: string[] = [];
      if (workspaceCatalog && attachWorkspace) {
        contextBlocks.push(
          `--- Workspace ---\nUse this catalog only if the user asked about these files. Do not start a processing plan unless they asked.\n${workspaceCatalog}`
        );
      }
      if (fileSummaries && attachWorkspace) {
        contextBlocks.push(`--- File Context ---\n${fileSummaries}`);
      }
      const enrichedMessage = contextBlocks.length
        ? `${userMsg}\n\n${contextBlocks.join("\n\n")}`
        : userMsg;

      const history = activeConversation.messages
        .filter((m) => m.text && !m.isStreaming)
        .slice(-6)
        .map((m) => ({
          sender: m.sender,
          text: m.text
            .replace(/<think>[\s\S]*?<\/think>/gi, "")
            .replace(/<思考>[\s\S]*?<\/思考>/gi, "")
            .trim()
            .slice(0, 800),
        }))
        .filter((m) => m.text);

      const response = await fetch("/api/agent/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: enrichedMessage,
          sessionId: convId,
          mode: selectedMode === "Plan" ? "plan" : "interpret",
          snapshotData: scientificState.snapshot,
          projectName: currentProject || "",
          workspaceRoot: workspaceRoot || "",
          workspaceIndex: workspaceIndex || null,
          history,
          pluginState,
          orchestraChoice,
          guestId: localStorage.getItem("gaid_guest_id") || undefined,
          implementationPlanContent: useAppStore.getState().fileContents[TEMP_PLAN_ID],
          ...(resumePartial ? { resumePartial } : {}),
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
        implementationPlanContent?: string;
      }
      let epilogueSnapshot: EpilogueSnapshot | null = null;
      let planAwaitingApproval = false;
      let planTaskFolder: string | undefined;

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
              if (hasModelText(decoded) || hasModelText(accumulatedText)) {
                armStall(tokenStallMs);
              }

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
                 if (epilogue.type === "error" || epilogue.type === "stream_error") {
                   streamError = typeof epilogue.message === "string" && epilogue.message
                     ? epilogue.message
                     : "The engine stopped unexpectedly.";
                 }
                 planAwaitingApproval = Boolean(epilogue?.awaitingApproval);
                 planTaskFolder = epilogue?.taskFolder;
                 if (epilogue.hypothesisEvents?.length) {
                   for (const evt of epilogue.hypothesisEvents) {
                     scientificState.appendEvent("HYPOTHESIS_CREATED", epilogue.agentId, evt.payload);
                   }
                 }
                 if (epilogue.opportunitiesDetected > 0) {
                   scientificState.detectAndAppendOpportunities();
                 }
                 if (epilogue.implementationPlanContent) {
                   useAppStore.getState().setFileContent(TEMP_PLAN_ID, epilogue.implementationPlanContent);
                 }
                 if (epilogue.thought) {
                   thought = epilogue.thought;
                 }
                 if (epilogue.projectFilesUpdates && Array.isArray(epilogue.projectFilesUpdates)) {
                   applyWorkspaceFileUpdates(epilogue.projectFilesUpdates);
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

      const awaitingApproval = planAwaitingApproval;
      if (sendGenRef.current !== sendGen) return;
      const visible = accumulatedText
        .replace(/<\/?(?:think|思考)>/gi, "")
        .trim();
      const empty = !visible;
      const failed = Boolean(streamError) || empty;

      updateMessageInConversation(convId, agentMsgId, {
        text: accumulatedText,
        preamble,
        isStreaming: false,
        interrupted: failed,
        interruptKind: streamError ? "engine" : empty ? "empty" : undefined,
        ...(thinkingDurationRecorded !== undefined ? { thinkingDuration: thinkingDurationRecorded } : {}),
        thought: thought || undefined,
        awaitingApproval,
        taskFolder: planTaskFolder
      });

      if (shouldTitle && !failed) {
        void assignAiTopic(convId, userMsg, accumulatedText);
      }

      agentStore.setStreaming(false);
      agentStore.clearStream();
      agentStore.setActiveAgent(null);

    } catch (err) {
      if (sendGenRef.current !== sendGen) return;
      const aborted = err instanceof DOMException && err.name === "AbortError";
      const reason = abortReasonRef.current;
      if (aborted && reason === "user") {
        updateMessageInConversation(convId, agentMsgId, {
          text: accumulatedText,
          preamble,
          isStreaming: false,
          interrupted: false,
          ...(thinkingDurationRecorded !== undefined ? { thinkingDuration: thinkingDurationRecorded } : {}),
        });
      } else {
        updateMessageInConversation(convId, agentMsgId, {
          text: accumulatedText,
          preamble,
          isStreaming: false,
          interrupted: true,
          interruptKind: aborted && reason === "stall" ? "stalled" : "network",
          ...(thinkingDurationRecorded !== undefined ? { thinkingDuration: thinkingDurationRecorded } : {}),
        });
      }
    } finally {
      if (stallTimer) clearTimeout(stallTimer);
      if (abortRef.current === abort) abortRef.current = null;
      if (sendGenRef.current === sendGen) {
        setConversationState(convId, { isGenerating: false });
        agentStore.setOrchestratorThinking(false);
        agentStore.setStreaming(false);
      }
    }
  }, [
    inputVal, isGenerating, activeConversation.id, activeConversation.messages, 
    addMessageToConversation, updateMessageInConversation, setConversationState, agentStore, scientificState, projectFiles, 
    fileContents, currentProject, workspaceRoot, workspaceIndex, projectCatalog, selectedMode, updateConversationTopic, assignAiTopic, pluginState, orchestraChoice
  ]);

  const handleRetryInterrupted = useCallback((agentMsgId: string) => {
    void handleSend(undefined, { resumeAgentId: agentMsgId });
  }, [handleSend]);

  const interruptedAgent = [...enhancedMessages]
    .reverse()
    .find((m) => m.sender === "agent" && m.interrupted && !m.isStreaming);

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
    if (e.key === "Enter" && e.ctrlKey && interruptedAgent?.id && !isGenerating) {
      e.preventDefault();
      handleRetryInterrupted(interruptedAgent.id);
      return;
    }
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
    setConversationState(sessionId, { isGenerating: true });
    
    addMessageToConversation(sessionId, {
      id: approvalMsgId,
      sender: "agent",
      text: "",
      preamble: null,
      isStreaming: true,
      timestamp: new Date().toISOString(),
      thinkingStartedAt: thinkingStart,
      workSteps: [],
    });

    const abort = new AbortController();
    abortRef.current = abort;
    let workSteps: WorkStep[] = [];
    let accumulated = "";
    
    try {
      const response = await fetch("/api/agent/approve-diurnal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          decision: "approve",
          implementationPlanContent: useAppStore.getState().fileContents[TEMP_PLAN_ID],
          workspaceRoot: workspaceRoot || "",
        }),
        signal: abort.signal,
      });

      if (!response.body) throw new Error("No response body");
      
      const reader = response.body.getReader();
      let preamble: StreamPreamble | null = null;
      let rawBuf = new Uint8Array(0);

      const findByte = (buf: Uint8Array, value: number, start = 0) => {
        for (let i = start; i < buf.length; i++) {
          if (buf[i] === value) return i;
        }
        return -1;
      };
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const merged = new Uint8Array(rawBuf.length + value.length);
        merged.set(rawBuf);
        merged.set(value, rawBuf.length);
        rawBuf = merged;

        let pos = 0;
        while (pos < rawBuf.length) {
          const byte = rawBuf[pos];
          if (byte === 0x00 || byte === 0x02) {
            const end = findByte(rawBuf, 0x0a, pos + 1);
            if (end < 0) break;
            const jsonStr = dec.decode(rawBuf.slice(pos + 1, end));
            try {
              const parsed = JSON.parse(jsonStr.replace(/^\n/, ""));
              if (byte === 0x00) preamble = parsed as StreamPreamble;
              if (parsed.projectFilesUpdates && Array.isArray(parsed.projectFilesUpdates)) {
                applyWorkspaceFileUpdates(parsed.projectFilesUpdates);
              }
              if (parsed.type === "execution_complete") {
                presentJobResultsFromEpilogue(parsed);
                void refreshWorkspaceIndex();
              }
              if (parsed.type === "work_step") {
                if (parsed.done) {
                  workSteps = workSteps.map((step) =>
                    step.status === "running" ? { ...step, status: "done" } : step
                  );
                } else if (parsed.id && parsed.label) {
                  workSteps = upsertWorkStep(workSteps, {
                    id: String(parsed.id),
                    label: String(parsed.label),
                    status: parsed.status === "warning" ? "warning" : "running",
                  });
                }
              }
            } catch {
              /* ignore malformed control frames */
            }
            pos = end + 1;
          } else {
            let next = pos + 1;
            while (next < rawBuf.length && rawBuf[next] !== 0x00 && rawBuf[next] !== 0x02) next++;
            if (next === rawBuf.length && !done) {
              accumulated += dec.decode(rawBuf.slice(pos, next), { stream: true });
              pos = next;
              break;
            }
            accumulated += dec.decode(rawBuf.slice(pos, next), { stream: true });
            pos = next;
          }
        }
        rawBuf = rawBuf.slice(pos);
        updateMessageInConversation(sessionId, approvalMsgId, {
          text: accumulated,
          preamble,
          isStreaming: true,
          workSteps,
        });
      }

      if (rawBuf.length) {
        accumulated += dec.decode(rawBuf);
      }
      workSteps = workSteps.map((step) =>
        step.status === "running" ? { ...step, status: "done" } : step
      );
      updateMessageInConversation(sessionId, approvalMsgId, {
        text: accumulated,
        preamble,
        isStreaming: false,
        workSteps,
      });

    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        updateMessageInConversation(sessionId, approvalMsgId, {
          text: accumulated || "Stopped.",
          isStreaming: false,
          workSteps,
        });
      } else {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        updateMessageInConversation(sessionId, approvalMsgId, { text: `Approval failed: ${errorMsg}`, isStreaming: false, workSteps });
      }
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
      setConversationState(sessionId, { isGenerating: false });
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
                <span className="truncate flex-1">
                  {displayConversationTopic(
                    conv.topic,
                    conv.messages.find((message) => message.sender === "user")?.text
                  )}
                </span>
                <button
                  type="button"
                  aria-label="Close chat tab"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    hideConversation(conv.id);
                  }}
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

      {/* Main layout: empty tab is centered; after the first send, input sits at the bottom */}
      <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1e]">
        {!hasSentMessage ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 flex flex-col items-center justify-center px-5">
              <h1
                title={currentProject || "G-AID"}
                className="text-[28px] font-semibold text-white tracking-tight mb-6 max-w-full truncate px-2"
              >
                {currentProject || "G-AID"}
              </h1>
              <div className="w-full max-w-[520px]">
                <PendingChangesCard />
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
                  orchestraChoice={orchestraChoice}
                  setOrchestraChoice={setOrchestraChoice}
                  previewSpeed={previewSpeed}
                  dropUp={false}
                />
              </div>
            </div>
            <p className="shrink-0 text-center text-[11px] text-[#6e6e6e] pb-3 px-4">
              AI may make mistakes. Check results against the survey files.
            </p>
          </div>
        ) : (
          <>
            <div className="relative flex-1 flex flex-col min-h-0">
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
                 displayText = displayText.replace(/<\/(?:think|思考)>/g, "");
                 displayThought = displayThought.replace(/<\/?(?:think|思考)>/gi, "");
                 if (!msg.isStreaming) displayText = displayText.trim();
                 displayThought = cleanDisplayedThought(displayThought);

                 const rawText = msg.text || "";
                 const thinkOpen = /<(?:think|思考)>/i.test(rawText);
                 const thinkClosed = /<\/(?:think|思考)>/i.test(rawText);
                 const stillThinking =
                   Boolean(msg.isStreaming) &&
                   !displayText.trim() &&
                   (Boolean(displayThought) || (thinkOpen && !thinkClosed));
                 const showCompletedThought = !stillThinking && Boolean(displayThought);
                 const waitingForFirstToken = Boolean(msg.isStreaming) && !displayText && !displayThought && !stillThinking;
                 const hasProjectData = projectFiles.some((f) => Boolean(fileContents[f.id]?.trim()));
                 const showConfidence = !msg.isStreaming
                   && hasProjectData
                   && Boolean(displayText.trim())
                   && Boolean(msg.preamble?.confidence)
                   && ((msg.preamble as StreamPreamble & { showConfidence?: boolean })?.showConfidence
                     || (msg.preamble?.rulesMatched?.length ?? 0) > 0
                     || (msg.preamble?.capabilityTrace?.length ?? 0) > 0);

                 const isPlanRun = displayText.includes("Plan approved.");
                 const { intro, outro } = isPlanRun
                   ? splitExecutionNarrative(displayText)
                   : { intro: displayText, outro: "" };
                 const showWorking = isPlanRun || Boolean(msg.workSteps?.length);

                 return (
                 <>
                   {(stillThinking || showCompletedThought) ? (
                     <ThoughtDisclosure
                       duration={msg.thinkingDuration ?? 1}
                       thought={displayThought || undefined}
                       isThinking={stillThinking}
                     />
                   ) : null}
                   {waitingForFirstToken ? (
                     <TypingDots />
                   ) : isPlanRun ? (
                     <>
                       <StreamingMessage
                         content={intro}
                         preamble={msg.preamble ?? null}
                         isStreaming={msg.isStreaming ?? false}
                         isThinking={Boolean(msg.isStreaming) && !intro}
                         showConfidence={false}
                       />
                       <WorkingLog
                         steps={msg.workSteps || []}
                         isWorking={Boolean(msg.isStreaming)}
                       />
                       {!msg.isStreaming && outro ? (
                         <StreamingMessage
                           content={outro}
                           preamble={msg.preamble ?? null}
                           isStreaming={false}
                           showConfidence={showConfidence}
                         />
                       ) : null}
                     </>
                   ) : (
                     <>
                       {showWorking ? (
                         <WorkingLog steps={msg.workSteps || []} isWorking={Boolean(msg.isStreaming)} />
                       ) : null}
                       {displayText || !msg.isStreaming ? (
                         <StreamingMessage
                           content={displayText}
                           preamble={msg.preamble ?? null}
                           isStreaming={msg.isStreaming ?? false}
                           isThinking={Boolean(msg.isStreaming) && !displayText}
                           showConfidence={showConfidence}
                         />
                       ) : null}
                     </>
                   )}
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
                         openWorkbenchTab(`file:${TEMP_PLAN_ID}`, "file", TEMP_PLAN_ID);
                       }}
                       className="mt-4 bg-[#1e1e1e] border border-[#2b2b2b] rounded-lg p-3 w-full max-w-sm flex flex-col gap-2 shadow-sm cursor-pointer hover:border-[#3c3c3c] transition-colors"
                     >
                       <div className="flex items-center gap-2">
                         <FileText className="h-4 w-4 text-white" />
                         <span className="font-semibold text-white text-[13px]">Implementation Plan</span>
                       </div>
                       <p className="text-[12px] text-[#cccccc] mb-2 leading-relaxed">
                         Read the plan. Request changes in chat until it matches. Proceed only when you agree.
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
        </div>
        {interruptedAgent?.id ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-3">
            <div className="pointer-events-auto w-full flex justify-center">
              <InterruptCard
                requestId={interruptedAgent.id}
                onRetry={() => handleRetryInterrupted(interruptedAgent.id!)}
                onDismiss={() =>
                  updateMessageInConversation(activeConversation.id, interruptedAgent.id!, {
                    interrupted: false,
                  })
                }
              />
            </div>
          </div>
        ) : null}
            </div>

        <div className="p-3 border-t border-[#2b2b2b] shrink-0 bg-[#1e1e1e] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <PendingChangesCard />
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
            orchestraChoice={orchestraChoice}
            setOrchestraChoice={setOrchestraChoice}
            previewSpeed={previewSpeed}
            dropUp={true}
          />
        </div>
          </>
        )}
      </div>
    </aside>
  );
}
