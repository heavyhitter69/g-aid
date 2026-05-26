"use client";

/**
 * agent-activity.tsx
 * Live execution monitor — shows orchestrator + agent activity in real time.
 * Collapsible panel. Status icons match DAG lifecycle.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Cpu, Zap, CheckCircle2, XCircle, Clock } from "lucide-react";
import { useAgentStore } from "@/store/agent-store";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  running: { icon: Clock, color: "text-[#3b9fd9]", pulse: true, label: "Running" },
  complete: { icon: CheckCircle2, color: "text-[#4ec9a0]", pulse: false, label: "Done" },
  failed: { icon: XCircle, color: "text-red-400", pulse: false, label: "Failed" },
} as const;

const AGENT_COLORS: Record<string, string> = {
  "orchestrator-agent": "#9b5de5",
  "magnetic-agent":    "#f15bb5",
  "resistivity-agent": "#3b9fd9",
  "gravity-agent":     "#fee440",
  "seismic-agent":     "#00bbf9",
  "geological-agent":  "#4ec9a0",
  "workflow-agent":    "#858585",
  system: "#555555",
  human: "#007acc",
};

function agentLabel(actorId: string): string {
  return actorId
    .replace("-agent", "")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function AgentActivity({ collapsed: initialCollapsed = false }: { collapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const { activityLog, isOrchestratorThinking, streamingPreamble, activeAgentId } = useAgentStore();

  const hasActivity = activityLog.length > 0 || isOrchestratorThinking;

  if (!hasActivity) return null;

  return (
    <div className="border-t border-[#2b2b2b] bg-[#181818] shrink-0">
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[#252526] transition-colors text-left"
      >
        <Cpu className="h-3 w-3 text-[#858585]" />
        <span className="text-[10px] text-[#858585] font-medium flex-1">Agent Activity</span>
        {activeAgentId && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
            style={{
              background: `${AGENT_COLORS[activeAgentId] ?? "#555"}22`,
              color: AGENT_COLORS[activeAgentId] ?? "#858585",
            }}
          >
            {agentLabel(activeAgentId)} active
          </span>
        )}
        {collapsed
          ? <ChevronRight className="h-3 w-3 text-[#555]" />
          : <ChevronDown className="h-3 w-3 text-[#555]" />
        }
      </button>

      {!collapsed && (
        <div className="px-3 pb-2 space-y-1 max-h-[140px] overflow-y-auto">
          {/* Orchestrator thinking */}
          {isOrchestratorThinking && (
            <ActivityRow
              actorId="orchestrator-agent"
              description="Resolving capabilities and dispatching agents…"
              status="running"
              relatedToolId={null}
            />
          )}

          {/* Preamble summary */}
          {streamingPreamble && (
            <div className="text-[9px] text-[#555] pl-5 space-y-0.5">
              {streamingPreamble.capabilityTrace.length > 0 && (
                <div>capabilities: {streamingPreamble.capabilityTrace.join(", ")}</div>
              )}
              {streamingPreamble.rulesMatched.length > 0 && (
                <div>rules matched: {streamingPreamble.rulesMatched.length}</div>
              )}
            </div>
          )}

          {/* Activity entries */}
          {activityLog.slice(-8).map((entry) => (
            <ActivityRow
              key={entry.id}
              actorId={entry.actorId}
              description={entry.description}
              status={entry.status}
              relatedToolId={entry.relatedToolId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityRow({
  actorId,
  description,
  status,
  relatedToolId,
}: {
  actorId: string;
  description: string;
  status: "running" | "complete" | "failed";
  relatedToolId: string | null;
}) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  const color = AGENT_COLORS[actorId] ?? "#858585";

  return (
    <div className="flex items-start gap-2 py-0.5">
      <Icon
        className={cn("h-3 w-3 shrink-0 mt-0.5", cfg.color, cfg.pulse && "animate-pulse")}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] font-semibold shrink-0"
            style={{ color }}
          >
            {agentLabel(actorId)}
          </span>
          {relatedToolId && (
            <span className="text-[9px] text-[#555] truncate">
              [{relatedToolId.replace(/_/g, " ")}]
            </span>
          )}
        </div>
        <p className="text-[9px] text-[#666] leading-tight truncate">{description}</p>
      </div>
    </div>
  );
}
