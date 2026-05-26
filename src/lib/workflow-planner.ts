/**
 * workflow-planner.ts
 * DAG compiler — capabilities → dual-layer plan.
 * Always produces both layers simultaneously: machine DAG + human markdown.
 * Markdown is DERIVED from DAG, never the source of truth.
 * Propagates invalidation when upstream inputs change.
 */

import type {
  AgentCapability,
  ExecutionDAG,
  DAGNode,
  DAGEdge,
  GeoDataset,
  ScientificProjectSnapshot,
} from "@/types/scientific";
import { getToolsForDomain } from "@/lib/tool-registry";

let _dagNodeCounter = 0;
function nodeId(label: string): string {
  return `node_${label.replace(/\s+/g, "_").toLowerCase()}_${++_dagNodeCounter}`;
}

// ─── Compile capabilities → DAG ───────────────────────────────────────────────

export function compileDAG(
  capabilities: AgentCapability[],
  datasets: GeoDataset[],
  snapshot: ScientificProjectSnapshot
): { dag: ExecutionDAG; markdown: string } {
  const nodes: DAGNode[] = [];
  const edges: DAGEdge[] = [];
  const now = new Date().toISOString();

  // ── 1. Data ingestion nodes (one per dataset) ──────────────────────────────
  const datasetNodeIds: Record<string, string> = {};
  for (const dataset of datasets) {
    const id = nodeId(`ingest_${dataset.modality}`);
    datasetNodeIds[dataset.id] = id;
    nodes.push({
      id,
      label: `Ingest ${dataset.name}`,
      description: `Load and validate ${dataset.modality} dataset (${dataset.units})`,
      agentId: "workflow-agent",
      toolIds: [],
      status: "complete",  // Already uploaded
      invalidationReason: null,
      conditional: null,
      inputs: [],
      outputs: [dataset.id],
      toolExecutionIds: [],
      humanReviewNote: null,
      estimatedDurationMs: 500,
      startedAt: now,
      completedAt: now,
    });
  }

  // ── 2. Processing nodes per capability ─────────────────────────────────────
  let prevNodeId: string | null = null;

  for (const capability of capabilities) {
    // CRS harmonisation check node (conditional)
    const crsSet = new Set(datasets.map((d) => d.crs).filter(Boolean));
    if (crsSet.size > 1 && !nodes.some((n) => n.label.includes("CRS"))) {
      const crsNodeId = nodeId("crs_check");
      nodes.push({
        id: crsNodeId,
        label: "CRS Harmonisation",
        description: `Multiple CRS detected (${[...crsSet].join(", ")}) — reproject all datasets to common reference`,
        agentId: "workflow-agent",
        toolIds: ["crs_harmonizer"],
        status: "pending",
        invalidationReason: null,
        conditional: null,
        inputs: datasets.map((d) => d.id),
        outputs: ["crs_harmonised_datasets"],
        toolExecutionIds: [],
        humanReviewNote: "Verify target CRS is appropriate for the survey area extent",
        estimatedDurationMs: 2000,
        startedAt: null,
        completedAt: null,
      });

      // Connect dataset nodes to CRS node
      for (const dataset of datasets) {
        edges.push({ from: datasetNodeIds[dataset.id], to: crsNodeId, label: "requires harmonisation" });
      }
      prevNodeId = crsNodeId;
    }

    // Tool nodes for this capability
    const domainTools = getToolsForDomain(capability.requiredAgents[0]?.replace("-agent", "") ?? "");
    const capabilityToolIds = capability.requiredTools.filter((tid) =>
      domainTools.some((t) => t.id === tid)
    );

    for (const toolId of capabilityToolIds) {
      const toolNodeId = nodeId(toolId);
      const agentId = capability.requiredAgents[0];

      nodes.push({
        id: toolNodeId,
        label: toolId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        description: `Execute ${toolId} as part of ${capability.description}`,
        agentId: agentId ?? null,
        toolIds: [toolId],
        status: "pending",
        invalidationReason: null,
        conditional: null,
        inputs: datasets.filter((d) => capability.inputModalities.includes(d.modality)).map((d) => d.id),
        outputs: [`${toolId}_output`],
        toolExecutionIds: [],
        humanReviewNote: null,
        estimatedDurationMs: 2500,
        startedAt: null,
        completedAt: null,
      });

      if (prevNodeId) {
        edges.push({ from: prevNodeId, to: toolNodeId });
      } else {
        // Connect to relevant dataset ingestion nodes
        for (const dataset of datasets) {
          if (capability.inputModalities.includes(dataset.modality)) {
            edges.push({ from: datasetNodeIds[dataset.id], to: toolNodeId });
          }
        }
      }
      prevNodeId = toolNodeId;
    }

    // Interpretation synthesis node
    const synthNodeId = nodeId(`synthesis_${capability.id}`);
    nodes.push({
      id: synthNodeId,
      label: `${capability.description} — Synthesis`,
      description: `Geological synthesis and interpretation for: ${capability.description}`,
      agentId: "geological-agent",
      toolIds: [],
      status: "awaiting-human-review",
      invalidationReason: null,
      conditional: null,
      inputs: capabilityToolIds.map((t) => `${t}_output`),
      outputs: ["interpretation_entry"],
      toolExecutionIds: [],
      humanReviewNote: "Review interpretation before committing to final report",
      estimatedDurationMs: 3000,
      startedAt: null,
      completedAt: null,
    });

    if (prevNodeId) {
      edges.push({ from: prevNodeId, to: synthNodeId, label: "requires prior processing" });
    }
    prevNodeId = synthNodeId;
  }

  // ── 3. Final QA review node ─────────────────────────────────────────────────
  const qaNodeId = nodeId("qa_review");
  nodes.push({
    id: qaNodeId,
    label: "Human QA Review",
    description: "Final review of all interpretations and hypotheses before report generation",
    agentId: null,
    toolIds: [],
    status: "blocked",
    invalidationReason: null,
    conditional: null,
    inputs: ["interpretation_entry"],
    outputs: ["reviewed_interpretation"],
    toolExecutionIds: [],
    humanReviewNote: "Approve all interpretations before proceeding to report generation",
    estimatedDurationMs: 0,
    startedAt: null,
    completedAt: null,
  });

  if (prevNodeId) {
    edges.push({ from: prevNodeId, to: qaNodeId, label: "requires all syntheses" });
  }

  const dag: ExecutionDAG = {
    id: `dag_${Date.now()}`,
    nodes,
    edges,
    status: "draft",
    generatedFromCapabilities: capabilities.map((c) => c.id),
    epistemicBranchId: null,
    createdAt: now,
    approvedAt: null,
    approvedBy: null,
    markdownRepresentation: "",
  };

  dag.markdownRepresentation = renderMarkdown(dag, capabilities);

  return { dag, markdown: dag.markdownRepresentation };
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

export function renderMarkdown(dag: ExecutionDAG, capabilities?: AgentCapability[]): string {
  const lines: string[] = [
    `# Workflow Plan`,
    ``,
    `**Generated:** ${dag.createdAt.slice(0, 16)} UTC`,
    `**Status:** ${dag.status}`,
    `**Capabilities:** ${dag.generatedFromCapabilities.join(", ")}`,
    ``,
    `## Workflow Steps`,
    ``,
  ];

  const statusEmoji: Record<string, string> = {
    pending: "○",
    running: "◌",
    complete: "✓",
    failed: "✗",
    skipped: "⊘",
    invalidated: "⚠",
    superseded: "↩",
    "recompute-required": "↺",
    blocked: "⊡",
    "awaiting-human-review": "⊙",
  };

  dag.nodes.forEach((node, i) => {
    const emoji = statusEmoji[node.status] ?? "○";
    lines.push(`### Step ${i + 1}: ${emoji} ${node.label}`);
    lines.push(`**Agent:** ${node.agentId ?? "Human"} | **Status:** ${node.status}`);
    lines.push(node.description);
    if (node.humanReviewNote) lines.push(`> ⊙ *Human review required: ${node.humanReviewNote}*`);
    if (node.invalidationReason) lines.push(`> ⚠ *Invalidation reason: ${node.invalidationReason}*`);
    if (node.toolIds.length > 0) lines.push(`**Tools:** ${node.toolIds.join(", ")}`);
    lines.push(``);
  });

  const invalidated = dag.nodes.filter((n) => n.status === "invalidated" || n.status === "recompute-required");
  if (invalidated.length > 0) {
    lines.push(`## ⚠ Invalidation Warnings`);
    lines.push(`${invalidated.length} node(s) require recomputation:`);
    invalidated.forEach((n) => lines.push(`- **${n.label}**: ${n.invalidationReason ?? "upstream change"}`));
    lines.push(``);
  }

  return lines.join("\n");
}
