/**
 * scientific-state.ts
 * Zustand store wrapping ScientificEventLog + StateProjector.
 * Selectors are the ONLY path from domain model to UI — enforced view-model separation.
 * State is never mutated directly — only events are appended.
 */

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ScientificEventLog, persistEventLog } from "@/lib/event-log";
import { projectSnapshot } from "@/lib/state-projector";
import { resolveFromState } from "@/lib/capability-graph";
import type {
  ScientificProjectSnapshot,
  GeoDataset,
  HypothesisNode,
  HypothesisEpistemicType,
  DAGNode,
  DataModality,
  StateOpportunity,
  EpistemicBranch,
  ScientificEvent,
  HypothesisNodeViewModel,
  DatasetCardViewModel,
  OpportunityChipViewModel,
  DAGViewModel,
  ConfidenceProvenance,
} from "@/types/scientific";

// ─── Store shape ──────────────────────────────────────────────────────────────

interface ScientificStateStore {
  // Event log — source of truth
  eventLog: ScientificEventLog;

  // Derived snapshot — recomputed on relevant events
  snapshot: ScientificProjectSnapshot;

  // Project identity
  projectId: string;

  // ── Actions — all produce events, never mutate state directly ──────────────
  ingestDataset: (dataset: GeoDataset) => void;
  createHypothesis: (
    statement: string,
    epistemicType: HypothesisEpistemicType,
    datasetIds: string[],
    confidence: number,
    provenance: ConfidenceProvenance
  ) => string;
  updateHypothesisConfidence: (id: string, provenance: ConfidenceProvenance, reason: string) => void;
  linkHypotheses: (parentId: string, childId: string) => void;
  dismissOpportunity: (id: string) => void;
  approveDAGNode: (nodeId: string) => void;
  addInterpretation: (agentId: string, content: string, datasetIds: string[], hypothesisIds: string[], confidence: number, provenance: ConfidenceProvenance) => void;
  appendEvent: <T>(type: Parameters<ScientificEventLog["append"]>[0], actorId: Parameters<ScientificEventLog["append"]>[1], payload: T, causationId?: string) => ScientificEvent<T>;
  detectAndAppendOpportunities: () => void;
  resetProject: () => void;

  // ── Selectors — presentation adapters (UI never reads raw snapshot) ─────────
  getActiveOpportunities: () => StateOpportunity[];
  getHypothesesByType: (type: HypothesisEpistemicType) => HypothesisNode[];
  getInvalidatedNodes: () => DAGNode[];
  getDatasetsByModality: (modality: DataModality) => GeoDataset[];
  getActiveBranches: () => EpistemicBranch[];
  exportProvenance: () => string;

  // ── View model selectors (strict boundary — UI only uses these) ─────────────
  getHypothesisGraphViewModel: () => HypothesisNodeViewModel[];
  getDatasetCardsViewModel: () => DatasetCardViewModel[];
  getOpportunityChipsViewModel: () => OpportunityChipViewModel[];
  getDAGViewModel: () => DAGViewModel | null;
}

// ─── ID generators ────────────────────────────────────────────────────────────

let _idCounter = 0;
function genId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++_idCounter}`;
}

function makeEmptySnapshot(projectId: string): ScientificProjectSnapshot {
  return {
    projectId,
    snapshotSequenceNumber: 0,
    datasets: [],
    hypothesisGraph: [],
    epistemicBranches: [],
    executionDAG: null,
    toolExecutions: [],
    opportunities: [],
    interpretations: [],
    spatialIndexSummary: {
      registeredDatasets: 0,
      overlapPairs: [],
      crsSet: [],
      dominantCRS: null,
      totalCoverageAreaKm2: 0,
      compatibilityIssues: [],
    },
    lastModified: new Date().toISOString(),
  };
}

// ─── View model builders ──────────────────────────────────────────────────────

function toHypothesisViewModel(h: HypothesisNode, snapshot: ScientificProjectSnapshot): HypothesisNodeViewModel {
  const p = h.confidenceProvenance;
  return {
    id: h.id,
    statement: h.statement,
    epistemicType: h.epistemicType,
    confidence: h.confidence,
    status: h.status,
    parentIds: h.parentIds,
    childIds: h.childIds,
    epistemicBranchId: h.epistemicBranchId,
    evidenceCount: h.evidence.length,
    contradictionCount: h.contradictions.length,
    agentLabel: h.agentId === "human" ? "Human" : h.agentId.replace("-agent", "").replace(/\b\w/g, (c) => c.toUpperCase()),
    tooltipProvenance: [
      `Data quality: ${p.dataQualityScore !== null ? (p.dataQualityScore * 100).toFixed(0) + "%" : "N/A"}`,
      `Cross-method: ${p.crossMethodAgreement !== null ? (p.crossMethodAgreement * 100).toFixed(0) + "%" : "N/A"}`,
      `Coverage: ${p.spatialCoverage !== null ? (p.spatialCoverage * 100).toFixed(0) + "%" : "N/A"}`,
      `Computed by: ${p.computedByKernel}`,
    ].join(" | "),
  };
}

function qualityLabel(dataset: GeoDataset): DatasetCardViewModel["qualityLabel"] {
  const snr = dataset.qualityMetrics.signalToNoise;
  if (snr === null) return "unknown";
  if (snr >= 20) return "good";
  if (snr >= 10) return "moderate";
  return "poor";
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useScientificState = create<ScientificStateStore>()(
  persist(
    (set, get) => {
      const eventLog = new ScientificEventLog();
      const projectId = "gaid-project-001";

      const reproject = (log: ScientificEventLog, pid: string) =>
        projectSnapshot(log.getAll(), pid);

      return {
        eventLog,
        snapshot: makeEmptySnapshot(projectId),
        projectId,

        // ── Actions ────────────────────────────────────────────────────────────

        ingestDataset: (dataset) => {
          const log = get().eventLog;
          log.startCorrelation();
          log.append("DATASET_INGESTED", "human", { dataset });
          const newSnapshot = reproject(log, get().projectId);
          persistEventLog();
          set({ snapshot: newSnapshot });

          // Proactively detect new opportunities
          get().detectAndAppendOpportunities();
        },

        createHypothesis: (statement, epistemicType, datasetIds, confidence, provenance) => {
          const id = genId("hyp");
          const log = get().eventLog;
          const hypothesis: HypothesisNode = {
            id,
            statement,
            epistemicType,
            confidence,
            confidenceProvenance: provenance,
            evidence: datasetIds.map((did) => {
              const ds = get().snapshot.datasets.find((d) => d.id === did);
              return { datasetId: did, description: ds?.name ?? did, weight: 0.5 };
            }),
            contradictions: [],
            parentIds: [],
            childIds: [],
            epistemicBranchId: null,
            agentId: "human",
            datasetIds,
            ontologyEntityIds: [],
            createdAt: new Date().toISOString(),
            revisedAt: new Date().toISOString(),
            revisionHistory: [],
            status: "active",
          };
          log.append("HYPOTHESIS_CREATED", "human", { hypothesis });
          const newSnapshot = reproject(log, get().projectId);
          set({ snapshot: newSnapshot });
          persistEventLog();
          return id;
        },

        updateHypothesisConfidence: (id, provenance, reason) => {
          const log = get().eventLog;
          log.append("CONFIDENCE_UPDATED", "system", { hypothesisId: id, provenance });
          log.append("HYPOTHESIS_UPDATED", "system", {
            id,
            patch: { confidenceProvenance: provenance },
            confidence: provenance.derivedConfidence,
            reason,
          });
          set({ snapshot: reproject(log, get().projectId) });
          persistEventLog();
        },

        linkHypotheses: (parentId, childId) => {
          const log = get().eventLog;
          log.append("HYPOTHESIS_LINKED", "system", { parentId, childId });
          set({ snapshot: reproject(log, get().projectId) });
          persistEventLog();
        },

        dismissOpportunity: (id) => {
          const log = get().eventLog;
          log.append("OPPORTUNITY_DISMISSED", "human", { id });
          set({ snapshot: reproject(log, get().projectId) });
          persistEventLog();
        },

        approveDAGNode: (nodeId) => {
          const log = get().eventLog;
          const dag = get().snapshot.executionDAG;
          if (!dag) return;
          log.append("DAG_NODE_COMPLETED", "human", {
            dagId: dag.id,
            nodeId,
            status: "complete" as const,
            reason: "Human approved",
          });
          set({ snapshot: reproject(log, get().projectId) });
          persistEventLog();
        },

        addInterpretation: (agentId, content, datasetIds, hypothesisIds, confidence, provenance) => {
          const log = get().eventLog;
          const entry = {
            id: genId("interp"),
            agentId,
            content,
            datasetIds,
            hypothesisIds,
            confidence,
            confidenceProvenance: provenance,
            toolsUsed: [],
            createdAt: new Date().toISOString(),
            epistemicBranchId: null,
          };
          log.append("INTERPRETATION_ADDED", agentId as import("@/types/scientific").ActorId, { entry });
          set({ snapshot: reproject(log, get().projectId) });
          persistEventLog();
        },

        appendEvent: (type, actorId, payload, causationId) => {
          const log = get().eventLog;
          const event = log.append(type, actorId, payload, causationId);
          set({ snapshot: reproject(log, get().projectId) });
          persistEventLog();
          return event;
        },

        detectAndAppendOpportunities: () => {
          const current = get().snapshot;
          const newOpportunities = resolveFromState(current);
          if (newOpportunities.length > 0) {
            const log = get().eventLog;
            for (const opp of newOpportunities) {
              log.append("OPPORTUNITY_DETECTED", "system", { opportunity: opp });
            }
            set({ snapshot: reproject(log, get().projectId) });
          }
        },

        resetProject: () => {
          const freshLog = new ScientificEventLog();
          const pid = "gaid-project-001";
          set({ eventLog: freshLog, snapshot: makeEmptySnapshot(pid), projectId: pid });
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("gaid-scientific-state");
          }
        },

        // ── Selectors ──────────────────────────────────────────────────────────

        getActiveOpportunities: () =>
          get().snapshot.opportunities.filter((o) => !o.dismissed),

        getHypothesesByType: (type) =>
          get().snapshot.hypothesisGraph.filter((h) => h.epistemicType === type && h.status === "active"),

        getInvalidatedNodes: () =>
          get().snapshot.executionDAG?.nodes.filter(
            (n) => n.status === "invalidated" || n.status === "recompute-required"
          ) ?? [],

        getDatasetsByModality: (modality) =>
          get().snapshot.datasets.filter((d) => d.modality === modality),

        getActiveBranches: () =>
          get().snapshot.epistemicBranches.filter((b) => b.status === "active"),

        exportProvenance: () => get().eventLog.exportProvenanceReport(),

        // ── View model selectors ───────────────────────────────────────────────

        getHypothesisGraphViewModel: () => {
          const { snapshot } = get();
          return snapshot.hypothesisGraph.map((h) => toHypothesisViewModel(h, snapshot));
        },

        getDatasetCardsViewModel: () => {
          const { snapshot } = get();
          return snapshot.datasets.map((d): DatasetCardViewModel => ({
            id: d.id,
            name: d.name,
            modality: d.modality,
            crs: d.crs,
            units: d.units,
            qualityLabel: qualityLabel(d),
            overlappingDatasetNames: snapshot.spatialIndexSummary.overlapPairs
              .filter((p) => p.datasetIds.includes(d.id))
              .map((p) => {
                const otherId = p.datasetIds.find((id) => id !== d.id)!;
                return snapshot.datasets.find((ds) => ds.id === otherId)?.name ?? otherId;
              }),
            lineageSteps: d.lineage.length,
            opportunityCount: snapshot.opportunities.filter(
              (o) => !o.dismissed && o.datasetIds.includes(d.id)
            ).length,
          }));
        },

        getOpportunityChipsViewModel: () =>
          get().snapshot.opportunities
            .filter((o) => !o.dismissed)
            .map((o): OpportunityChipViewModel => ({
              id: o.id,
              title: o.title,
              description: o.description,
              confidence: o.confidence,
              capabilityIds: o.requiredCapabilityIds,
            })),

        getDAGViewModel: () => {
          const { snapshot } = get();
          if (!snapshot.executionDAG) return null;
          const { nodes, edges } = snapshot.executionDAG;
          return {
            nodes: nodes.map((n) => ({
              id: n.id,
              label: n.label,
              status: n.status,
              agentDomain: n.agentId
                ? (n.agentId.replace("-agent", "") as import("@/types/scientific").AgentDomain)
                : null,
              toolCount: n.toolIds.length,
              isConditional: n.conditional !== null,
            })),
            edges,
            invalidatedCount: nodes.filter((n) => n.status === "invalidated").length,
            awaitingReviewCount: nodes.filter((n) => n.status === "awaiting-human-review").length,
          };
        },
      };
    },
    {
      name: "gaid-scientific-state",
      partialize: (state) => ({
        // Only persist the serialized event log, not the derived snapshot
        serializedEventLog: state.eventLog.serialize(),
        projectId: state.projectId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && (state as any).serializedEventLog) {
          state.eventLog.restore((state as any).serializedEventLog);
          state.snapshot = projectSnapshot(state.eventLog.getAll(), state.projectId);
        }
      },
    }
  )
);
