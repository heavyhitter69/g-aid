/**
 * agent-store.ts
 * Ephemeral execution state — NOT persisted.
 * Tracks live agent activity, streaming buffers, preamble, active tool.
 */

"use client";

import { create } from "zustand";
import type { AgentId, ActivityEntry, StreamPreamble } from "@/types/scientific";

let _activityCounter = 0;

interface AgentStore {
  // Live execution state
  activeAgentId: AgentId | null;
  activeToolId: string | null;
  isOrchestratorThinking: boolean;

  // Streaming protocol
  streamingPreamble: StreamPreamble | null;
  streamBuffer: string;
  isStreaming: boolean;

  // Activity log (current session — not persisted)
  activityLog: ActivityEntry[];

  // Pending capabilities from orchestrator
  pendingCapabilityIds: string[];

  // ── Actions ──────────────────────────────────────────────────────────────────
  setActiveAgent: (id: AgentId | null) => void;
  setActiveTool: (id: string | null) => void;
  setOrchestratorThinking: (thinking: boolean) => void;
  setPreamble: (preamble: StreamPreamble | null) => void;
  appendStreamToken: (token: string) => void;
  clearStream: () => void;
  setStreaming: (streaming: boolean) => void;
  appendActivity: (entry: Omit<ActivityEntry, "id" | "startedAt">) => string;
  completeActivity: (id: string) => void;
  failActivity: (id: string) => void;
  clearActivity: () => void;
  setPendingCapabilities: (ids: string[]) => void;
}

export const useAgentStore = create<AgentStore>()((set, get) => ({
  activeAgentId: null,
  activeToolId: null,
  isOrchestratorThinking: false,
  streamingPreamble: null,
  streamBuffer: "",
  isStreaming: false,
  activityLog: [],
  pendingCapabilityIds: [],

  setActiveAgent: (id) => set({ activeAgentId: id }),
  setActiveTool: (id) => set({ activeToolId: id }),
  setOrchestratorThinking: (thinking) => set({ isOrchestratorThinking: thinking }),

  setPreamble: (preamble) => set({ streamingPreamble: preamble }),

  appendStreamToken: (token) =>
    set((state) => ({ streamBuffer: state.streamBuffer + token })),

  clearStream: () =>
    set({ streamBuffer: "", streamingPreamble: null, isStreaming: false }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  appendActivity: (entry) => {
    const id = `act_${Date.now()}_${++_activityCounter}`;
    const full: ActivityEntry = {
      ...entry,
      id,
      startedAt: new Date().toISOString(),
    };
    set((state) => ({ activityLog: [...state.activityLog, full] }));
    return id;
  },

  completeActivity: (id) =>
    set((state) => ({
      activityLog: state.activityLog.map((a) =>
        a.id === id ? { ...a, status: "complete" as const, completedAt: new Date().toISOString() } : a
      ),
    })),

  failActivity: (id) =>
    set((state) => ({
      activityLog: state.activityLog.map((a) =>
        a.id === id ? { ...a, status: "failed" as const, completedAt: new Date().toISOString() } : a
      ),
    })),

  clearActivity: () => set({ activityLog: [] }),

  setPendingCapabilities: (ids) => set({ pendingCapabilityIds: ids }),
}));
