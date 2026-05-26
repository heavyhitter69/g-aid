"use client";

/**
 * hypothesis-graph.tsx
 * Visual hypothesis graph showing epistemic types, confidence, and agent origins.
 * Simple hierarchical list view for Phase 1 (full D3 graph in Phase 2).
 */

import { useState } from "react";
import {
  GitBranch, Network, BarChart3, AlertTriangle, Info,
  Lightbulb, ChevronRight, ChevronDown, TrendingUp
} from "lucide-react";
import { useScientificState } from "@/store/scientific-state";
import { cn } from "@/lib/utils";
import type { HypothesisNodeViewModel, HypothesisEpistemicType } from "@/types/scientific";

const EPISTEMIC_CONFIG: Record<HypothesisEpistemicType, { icon: typeof Info; color: string; label: string }> = {
  observation:            { icon: BarChart3,    color: "#3b9fd9", label: "Observation" },
  interpretation:         { icon: GitBranch,    color: "#4ec9a0", label: "Interpretation" },
  geological_model:       { icon: Network,      color: "#9b5de5", label: "Geological Model" },
  processing_assumption:  { icon: Info,         color: "#858585", label: "Processing Assumption" },
  uncertainty_warning:    { icon: AlertTriangle,color: "#fee440", label: "Warning" },
  recommendation:         { icon: Lightbulb,    color: "#f15bb5", label: "Recommendation" },
};

function ConfidenceBar({ confidence }: { confidence: number }) {
  const pct = confidence * 100;
  const color = pct >= 70 ? "#4ec9a0" : pct >= 50 ? "#fee440" : "#f97316";
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <div className="flex-1 h-[2px] bg-[#333] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[8px] font-mono shrink-0" style={{ color }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

function HypothesisCard({ node }: { node: HypothesisNodeViewModel }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = EPISTEMIC_CONFIG[node.epistemicType];
  const Icon = cfg.icon;

  return (
    <div className={cn(
      "rounded border bg-[#1a1a1a] overflow-hidden transition-colors",
      node.status === "superseded" ? "opacity-50 border-[#222]" : "border-[#2b2b2b]"
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2 p-2 hover:bg-[#252526] transition-colors text-left"
      >
        <Icon
          className="h-3 w-3 shrink-0 mt-0.5"
          style={{ color: cfg.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[8px] font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
            <span className="text-[8px] text-[#555]">· {node.agentLabel}</span>
            {node.contradictionCount > 0 && (
              <span className="text-[8px] text-red-400">⚡ {node.contradictionCount}</span>
            )}
          </div>
          <p className="text-[10px] text-[#aaa] leading-snug line-clamp-2">
            {node.statement}
          </p>
          <ConfidenceBar confidence={node.confidence} />
        </div>
        {node.childIds.length > 0 && (
          expanded ? <ChevronDown className="h-3 w-3 text-[#555] shrink-0 mt-0.5" />
                   : <ChevronRight className="h-3 w-3 text-[#555] shrink-0 mt-0.5" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-[#222] px-3 pb-2 pt-1.5 text-[9px] text-[#555] space-y-1">
          <div>{node.tooltipProvenance}</div>
          <div className="flex gap-2">
            <span>{node.evidenceCount} evidence link{node.evidenceCount !== 1 ? "s" : ""}</span>
            {node.epistemicBranchId && (
              <span className="text-[#9b5de5]">Branch: {node.epistemicBranchId.slice(0, 12)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function HypothesisGraph() {
  const { getHypothesisGraphViewModel } = useScientificState();
  const nodes = getHypothesisGraphViewModel();

  const active = nodes.filter((n) => n.status === "active");
  const superseded = nodes.filter((n) => n.status === "superseded");

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center space-y-1">
        <Network className="h-6 w-6 text-[#3c3c3c]" />
        <p className="text-[10px] text-[#555]">No hypotheses yet</p>
        <p className="text-[9px] text-[#3c3c3c] max-w-[150px] leading-relaxed">
          Agent analysis will populate the hypothesis graph
        </p>
      </div>
    );
  }

  return (
    <div className="p-2 space-y-1.5">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-1.5 text-[10px] text-[#858585]">
          <Network className="h-3 w-3" />
          <span className="font-medium">{active.length} active</span>
        </div>
        <div className="flex items-center gap-1 text-[9px] text-[#555]">
          <TrendingUp className="h-2.5 w-2.5" />
          {active.length > 0
            ? `avg ${(active.reduce((s, n) => s + n.confidence, 0) / active.length * 100).toFixed(0)}%`
            : "—"}
        </div>
      </div>

      {active.map((node) => (
        <HypothesisCard key={node.id} node={node} />
      ))}

      {superseded.length > 0 && (
        <details className="mt-3">
          <summary className="text-[9px] text-[#555] cursor-pointer hover:text-[#858585] px-1">
            {superseded.length} superseded hypothesis{superseded.length !== 1 ? "es" : ""}
          </summary>
          <div className="mt-1.5 space-y-1">
            {superseded.map((node) => (
              <HypothesisCard key={node.id} node={node} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
