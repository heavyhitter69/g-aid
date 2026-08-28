/**
 * state-projector.ts
 * Derives ScientificProjectSnapshot from the append-only EventLog.
 * State is NEVER stored directly — it is always derived from events.
 * This guarantees full provenance, reproducibility, and reversibility.
 */

import type { ScientificEvent } from "@/types/scientific";
import type {
  ScientificProjectSnapshot,
  GeoDataset,
  HypothesisNode,
  EpistemicBranch,
  ExecutionDAG,
  DAGNode,
  ToolExecutionRecord,
  StateOpportunity,
  InterpretationEntry,
  SpatialIndexSummary,
  ConfidenceProvenance,
} from "@/types/scientific";

// ─── Payload type helpers ────────────────────────────────────────────────────

type DatasetIngestedPayload = { dataset: GeoDataset };
type HypothesisCreatedPayload = { hypothesis: HypothesisNode };
type HypothesisUpdatedPayload = { id: string; patch: Partial<HypothesisNode>; confidence: number; reason: string };
type HypothesisLinkedPayload = { parentId: string; childId: string };
type HypothesisSupersededPayload = { id: string; replacedById: string };
type EpistemicBranchCreatedPayload = { branch: EpistemicBranch };
type EpistemicBranchUpdatedPayload = { id: string; patch: Partial<EpistemicBranch> };
type ToolInvokedPayload = { record: ToolExecutionRecord };
type ToolCompletedPayload = { id: string; outputs: Record<string, unknown>; completedAt: string };
type DAGCreatedPayload = { dag: ExecutionDAG };
type DAGNodeStatusPayload = { dagId: string; nodeId: string; status: DAGNode["status"]; reason?: string };
type DAGApprovedPayload = { dagId: string; approvedBy: string; approvedAt: string };
type InterpretationAddedPayload = { entry: InterpretationEntry };
type OpportunityDetectedPayload = { opportunity: StateOpportunity };
type OpportunityDismissedPayload = { id: string };

// ─── Main projection function ────────────────────────────────────────────────

export function projectSnapshot(
  events: ScientificEvent[],
  projectId = "default-project"
): ScientificProjectSnapshot {
  const datasets: Map<string, GeoDataset> = new Map();
  const hypotheses: Map<string, HypothesisNode> = new Map();
  const branches: Map<string, EpistemicBranch> = new Map();
  const toolExecutions: Map<string, ToolExecutionRecord> = new Map();
  const opportunities: Map<string, StateOpportunity> = new Map();
  const interpretations: Map<string, InterpretationEntry> = new Map();
  let currentDAG: ExecutionDAG | null = null;
  let latestSeq = 0;

  for (const event of events) {
    latestSeq = event.sequenceNumber;

    switch (event.type) {
      // ── Datasets ──────────────────────────────────────────────────────────
      case "DATASET_INGESTED":
      case "DATASET_CLASSIFIED": {
        const { dataset } = event.payload as DatasetIngestedPayload;
        datasets.set(dataset.id, dataset);
        break;
      }

      // ── Hypotheses ────────────────────────────────────────────────────────
      case "HYPOTHESIS_CREATED": {
        const { hypothesis } = event.payload as HypothesisCreatedPayload;
        hypotheses.set(hypothesis.id, hypothesis);
        break;
      }

      case "HYPOTHESIS_UPDATED": {
        const { id, patch, confidence, reason } = event.payload as HypothesisUpdatedPayload;
        const existing = hypotheses.get(id);
        if (existing) {
          const revision = {
            revisedAt: event.timestamp,
            previousConfidence: existing.confidence,
            newConfidence: confidence,
            reason,
            triggeredByEventId: event.id,
          };
          hypotheses.set(id, {
            ...existing,
            ...patch,
            confidence,
            revisedAt: event.timestamp,
            revisionHistory: [...existing.revisionHistory, revision],
          });
        }
        break;
      }

      case "HYPOTHESIS_LINKED": {
        const { parentId, childId } = event.payload as HypothesisLinkedPayload;
        const parent = hypotheses.get(parentId);
        const child = hypotheses.get(childId);
        if (parent && !parent.childIds.includes(childId)) {
          hypotheses.set(parentId, { ...parent, childIds: [...parent.childIds, childId] });
        }
        if (child && !child.parentIds.includes(parentId)) {
          hypotheses.set(childId, { ...child, parentIds: [...child.parentIds, parentId] });
        }
        break;
      }

      case "HYPOTHESIS_SUPERSEDED": {
        const { id } = event.payload as HypothesisSupersededPayload;
        const h = hypotheses.get(id);
        if (h) hypotheses.set(id, { ...h, status: "superseded", revisedAt: event.timestamp });
        break;
      }

      // ── Epistemic Branches ────────────────────────────────────────────────
      case "EPISTEMIC_BRANCH_CREATED": {
        const { branch } = event.payload as EpistemicBranchCreatedPayload;
        branches.set(branch.id, branch);
        break;
      }

      case "EPISTEMIC_BRANCH_UPDATED": {
        const { id, patch } = event.payload as EpistemicBranchUpdatedPayload;
        const existing = branches.get(id);
        if (existing) branches.set(id, { ...existing, ...patch });
        break;
      }

      // ── Tool Executions ───────────────────────────────────────────────────
      case "TOOL_INVOKED": {
        const { record } = event.payload as ToolInvokedPayload;
        toolExecutions.set(record.id, record);
        break;
      }

      case "TOOL_COMPLETED": {
        const { id, outputs, completedAt } = event.payload as ToolCompletedPayload;
        const record = toolExecutions.get(id);
        if (record) {
          toolExecutions.set(id, { ...record, status: "complete", outputs, completedAt });
        }
        break;
      }

      case "TOOL_FAILED": {
        const { id } = event.payload as { id: string; errorMessage: string };
        const record = toolExecutions.get(id);
        if (record) toolExecutions.set(id, { ...record, status: "failed" });
        break;
      }

      // ── DAG ───────────────────────────────────────────────────────────────
      case "DAG_CREATED": {
        const { dag } = event.payload as DAGCreatedPayload;
        currentDAG = dag;
        break;
      }

      case "DAG_NODE_STARTED":
      case "DAG_NODE_COMPLETED":
      case "DAG_NODE_INVALIDATED":
      case "DAG_NODE_BLOCKED": {
        const { nodeId, status, reason } = event.payload as DAGNodeStatusPayload;
        if (currentDAG !== null) {
          const updatedDAG: ExecutionDAG = {
            ...currentDAG,
            nodes: currentDAG.nodes.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    status,
                    invalidationReason: reason ?? n.invalidationReason,
                    startedAt: status === "running" ? event.timestamp : n.startedAt,
                    completedAt: status === "complete" ? event.timestamp : n.completedAt,
                  }
                : n
            ),
          };
          // Propagate invalidation to downstream nodes
          const withInvalidation = status === "invalidated"
            ? propagateInvalidation(updatedDAG, nodeId, event.timestamp)
            : updatedDAG;
          currentDAG = { ...withInvalidation, status: computeDAGStatus(withInvalidation) };
        }
        break;
      }

      case "DAG_APPROVED": {
        const { approvedBy, approvedAt } = event.payload as DAGApprovedPayload;
        if (currentDAG !== null) {
          const dagSnapshot: ExecutionDAG = currentDAG;
          currentDAG = {
            ...dagSnapshot,
            status: "approved",
            approvedAt,
            approvedBy: approvedBy as import("@/types/scientific").ActorId,
          };
        }
        break;
      }

      // ── Interpretations ───────────────────────────────────────────────────
      case "INTERPRETATION_ADDED": {
        const { entry } = event.payload as InterpretationAddedPayload;
        interpretations.set(entry.id, entry);
        break;
      }

      // ── Opportunities ─────────────────────────────────────────────────────
      case "OPPORTUNITY_DETECTED": {
        const { opportunity } = event.payload as OpportunityDetectedPayload;
        opportunities.set(opportunity.id, opportunity);
        break;
      }

      case "OPPORTUNITY_DISMISSED": {
        const { id } = event.payload as OpportunityDismissedPayload;
        const o = opportunities.get(id);
        if (o) opportunities.set(id, { ...o, dismissed: true });
        break;
      }

      // ── Confidence updates ────────────────────────────────────────────────
      case "CONFIDENCE_UPDATED": {
        const { hypothesisId, provenance } = event.payload as {
          hypothesisId: string;
          provenance: ConfidenceProvenance;
        };
        const h = hypotheses.get(hypothesisId);
        if (h) {
          hypotheses.set(hypothesisId, {
            ...h,
            confidence: provenance.derivedConfidence,
            confidenceProvenance: provenance,
          });
        }
        break;
      }

      default:
        break;
    }
  }

  const spatialIndexSummary = buildSpatialIndexSummary(Array.from(datasets.values()));

  return {
    projectId,
    snapshotSequenceNumber: latestSeq,
    datasets: Array.from(datasets.values()),
    hypothesisGraph: Array.from(hypotheses.values()),
    epistemicBranches: Array.from(branches.values()),
    executionDAG: currentDAG,
    toolExecutions: Array.from(toolExecutions.values()),
    opportunities: Array.from(opportunities.values()),
    interpretations: Array.from(interpretations.values()),
    spatialIndexSummary,
    lastModified: new Date().toISOString(),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function propagateInvalidation(dag: ExecutionDAG, invalidatedNodeId: string, timestamp: string): ExecutionDAG {
  // Find all nodes downstream of the invalidated node via DFS
  const downstreamIds = new Set<string>();
  const toVisit = [invalidatedNodeId];

  while (toVisit.length > 0) {
    const nodeId = toVisit.pop()!;
    const outgoing = dag.edges.filter((e) => e.from === nodeId).map((e) => e.to);
    for (const id of outgoing) {
      if (!downstreamIds.has(id)) {
        downstreamIds.add(id);
        toVisit.push(id);
      }
    }
  }

  // Mark downstream nodes as recompute-required (not invalidated — they may still be valid with recompute)
  return {
    ...dag,
    nodes: dag.nodes.map((n) =>
      downstreamIds.has(n.id) && n.status === "complete"
        ? { ...n, status: "recompute-required" as const, invalidationReason: `Upstream node ${invalidatedNodeId} was invalidated at ${timestamp}` }
        : n
    ),
  };
}

function computeDAGStatus(dag: ExecutionDAG): ExecutionDAG["status"] {
  const statuses = dag.nodes.map((n) => n.status);
  if (statuses.some((s) => s === "failed")) return "failed";
  if (statuses.some((s) => s === "invalidated" || s === "recompute-required")) return "partially-invalid";
  if (statuses.every((s) => s === "complete" || s === "skipped")) return "complete";
  if (statuses.some((s) => s === "running")) return "running";
  return dag.status;
}

function buildSpatialIndexSummary(datasets: GeoDataset[]): SpatialIndexSummary {
  // Phase 1: simple bounding box overlap detection
  const overlapPairs: SpatialIndexSummary["overlapPairs"] = [];
  const crsSet = [...new Set(datasets.map((d) => d.crs).filter(Boolean))];

  for (let i = 0; i < datasets.length; i++) {
    for (let j = i + 1; j < datasets.length; j++) {
      const a = datasets[i];
      const b = datasets[j];
      const overlap = computeOverlapAreaKm2(a.spatialExtent, b.spatialExtent);
      if (overlap > 0) {
        overlapPairs.push({ datasetIds: [a.id, b.id], overlapAreaKm2: overlap });
      }
    }
  }

  return {
    registeredDatasets: datasets.length,
    overlapPairs,
    crsSet,
    dominantCRS: crsSet[0] ?? null,
    totalCoverageAreaKm2: datasets.reduce((sum, d) => sum + extentAreaKm2(d.spatialExtent), 0),
    compatibilityIssues: [],
  };
}

function extentAreaKm2(bbox: GeoDataset["spatialExtent"]): number {
  const latKm = (bbox.maxLat - bbox.minLat) * 111;
  const lonKm = (bbox.maxLon - bbox.minLon) * 111 * Math.cos((((bbox.maxLat + bbox.minLat) / 2) * Math.PI) / 180);
  return Math.abs(latKm * lonKm);
}

function computeOverlapAreaKm2(a: GeoDataset["spatialExtent"], b: GeoDataset["spatialExtent"]): number {
  const minLat = Math.max(a.minLat, b.minLat);
  const maxLat = Math.min(a.maxLat, b.maxLat);
  const minLon = Math.max(a.minLon, b.minLon);
  const maxLon = Math.min(a.maxLon, b.maxLon);
  if (minLat >= maxLat || minLon >= maxLon) return 0;
  const midLat = (minLat + maxLat) / 2;
  const latKm = (maxLat - minLat) * 111;
  const lonKm = (maxLon - minLon) * 111 * Math.cos((midLat * Math.PI) / 180);
  return latKm * lonKm;
}

// ─── Derived projections ─────────────────────────────────────────────────────

export function projectHypothesisGraph(events: ScientificEvent[]): HypothesisNode[] {
  return projectSnapshot(events).hypothesisGraph;
}

export function projectExecutionDAG(events: ScientificEvent[]): ExecutionDAG | null {
  return projectSnapshot(events).executionDAG;
}

export function projectDatasets(events: ScientificEvent[]): GeoDataset[] {
  return projectSnapshot(events).datasets;
}

export function detectInvalidatedNodes(dag: ExecutionDAG): DAGNode[] {
  return dag.nodes.filter((n) => n.status === "invalidated" || n.status === "recompute-required");
}
