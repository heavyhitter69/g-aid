/**
 * capability-graph.ts
 * Capability graph — resolves scientific capabilities from user intent AND from scientific state.
 * Two resolution paths: intent-driven (message) + state-driven (proactive, no prompt needed).
 */

import type {
  AgentCapability,
  AgentId,
  DataModality,
  ScientificProjectSnapshot,
  StateOpportunity,
  StateOpportunityTrigger,
} from "@/types/scientific";

// ─── Capability definitions ───────────────────────────────────────────────────

export const CAPABILITY_GRAPH: AgentCapability[] = [
  {
    id: "structural-groundwater-analysis",
    description: "Multi-method structural and hydrogeological analysis using ERT and magnetics",
    requiredTools: ["lineament_extractor", "pseudosection_gen", "inversion_ert_2d"],
    requiredAgents: ["magnetic-agent", "resistivity-agent", "geological-agent"],
    inputModalities: ["magnetic", "resistivity"],
    estimatedDurationMs: 8000,
    stateOpportunityTriggers: [
      { condition: "modality_combination", requiredModalities: ["magnetic", "resistivity"], description: "MAG + ERT datasets present — structural-hydrogeological analysis available" },
    ],
  },
  {
    id: "potential-fields-joint-interpretation",
    description: "Joint magnetic and gravity interpretation for density/susceptibility structure",
    requiredTools: ["rtp_filter", "analytic_signal", "bouguer_correction", "regional_residual_separation"],
    requiredAgents: ["magnetic-agent", "gravity-agent", "geological-agent"],
    inputModalities: ["magnetic", "gravity"],
    estimatedDurationMs: 6000,
    stateOpportunityTriggers: [
      { condition: "datasets_overlap", requiredModalities: ["magnetic", "gravity"], description: "Overlapping MAG + gravity — joint potential-fields interpretation available" },
    ],
  },
  {
    id: "magnetic-interpretation",
    description: "Single-method magnetic interpretation — anomaly pattern analysis and structural mapping",
    requiredTools: ["rtp_filter", "analytic_signal", "lineament_extractor"],
    requiredAgents: ["magnetic-agent"],
    inputModalities: ["magnetic"],
    estimatedDurationMs: 4000,
    stateOpportunityTriggers: [
      { condition: "modality_combination", requiredModalities: ["magnetic"], description: "Magnetic dataset available for interpretation" },
    ],
  },
  {
    id: "resistivity-interpretation",
    description: "ERT/resistivity interpretation — inversion and hydrogeological analysis",
    requiredTools: ["pseudosection_gen", "inversion_ert_2d"],
    requiredAgents: ["resistivity-agent"],
    inputModalities: ["resistivity"],
    estimatedDurationMs: 5000,
    stateOpportunityTriggers: [
      { condition: "modality_combination", requiredModalities: ["resistivity"], description: "ERT dataset available for inversion and interpretation" },
    ],
  },
  {
    id: "gravity-interpretation",
    description: "Gravity anomaly analysis — regional/residual separation and density modelling",
    requiredTools: ["bouguer_correction", "regional_residual_separation"],
    requiredAgents: ["gravity-agent"],
    inputModalities: ["gravity"],
    estimatedDurationMs: 4000,
    stateOpportunityTriggers: [
      { condition: "modality_combination", requiredModalities: ["gravity"], description: "Gravity dataset available for interpretation" },
    ],
  },
  {
    id: "seismic-interpretation",
    description: "Seismic reflection interpretation — structural mapping and facies analysis",
    requiredTools: ["spectral_analysis", "horizon_picker"],
    requiredAgents: ["seismic-agent"],
    inputModalities: ["seismic"],
    estimatedDurationMs: 7000,
    stateOpportunityTriggers: [
      { condition: "modality_combination", requiredModalities: ["seismic"], description: "Seismic dataset available for interpretation" },
    ],
  },
  {
    id: "full-multi-method-integration",
    description: "Complete multi-method geophysical integration — all available datasets",
    requiredTools: ["rtp_filter", "analytic_signal", "pseudosection_gen", "bouguer_correction"],
    requiredAgents: ["magnetic-agent", "resistivity-agent", "gravity-agent", "geological-agent"],
    inputModalities: ["magnetic", "resistivity", "gravity"],
    estimatedDurationMs: 12000,
    stateOpportunityTriggers: [
      { condition: "datasets_overlap", requiredModalities: ["magnetic", "resistivity", "gravity"], description: "3+ overlapping datasets — full multi-method integration recommended" },
    ],
  },
  {
    id: "contradiction-resolution",
    description: "Resolve contradicting hypotheses — competing models analysis",
    requiredTools: [],
    requiredAgents: ["geological-agent", "magnetic-agent"],
    inputModalities: [],
    estimatedDurationMs: 3000,
    stateOpportunityTriggers: [
      { condition: "hypothesis_contradiction", description: "Contradicting active hypotheses detected — resolution analysis available" },
    ],
  },
  {
    id: "uncertainty-reduction",
    description: "Targeted analysis to reduce uncertainty in low-confidence hypotheses",
    requiredTools: [],
    requiredAgents: ["geological-agent"],
    inputModalities: [],
    estimatedDurationMs: 3000,
    stateOpportunityTriggers: [
      { condition: "confidence_below_threshold", threshold: 0.45, description: "Low-confidence hypothesis detected — targeted acquisition recommended" },
    ],
  },
  {
    id: "crs-harmonisation",
    description: "Align all datasets to a common coordinate reference system",
    requiredTools: ["crs_harmonizer"],
    requiredAgents: ["workflow-agent"],
    inputModalities: [],
    estimatedDurationMs: 2000,
    stateOpportunityTriggers: [],
  },
];

// ─── Intent keywords → capability IDs ────────────────────────────────────────

const INTENT_MAP: Array<{ keywords: string[]; capabilityIds: string[] }> = [
  { keywords: ["magnetic", "magnetics", "mag", "rtp", "aeromagnetic"], capabilityIds: ["magnetic-interpretation"] },
  { keywords: ["resistivity", "ert", "electrical", "tomography", "inversion"], capabilityIds: ["resistivity-interpretation"] },
  { keywords: ["gravity", "gravimetry", "bouguer", "gravitation"], capabilityIds: ["gravity-interpretation"] },
  { keywords: ["seismic", "reflection", "refraction", "migration"], capabilityIds: ["seismic-interpretation"] },
  { keywords: ["groundwater", "aquifer", "water", "hydro", "hydrogeolog"], capabilityIds: ["structural-groundwater-analysis"] },
  { keywords: ["structure", "fault", "shear", "lineament", "structural"], capabilityIds: ["structural-groundwater-analysis", "magnetic-interpretation"] },
  { keywords: ["intrusion", "pluton", "mafic", "felsic", "granite"], capabilityIds: ["potential-fields-joint-interpretation"] },
  { keywords: ["all data", "integrate", "synthesis", "multi-method", "joint"], capabilityIds: ["full-multi-method-integration"] },
  { keywords: ["contradict", "conflict", "disagree", "alternative", "competing"], capabilityIds: ["contradiction-resolution"] },
  { keywords: ["uncertain", "low confidence", "confidence", "constraint"], capabilityIds: ["uncertainty-reduction"] },
];

// ─── Path A: Intent-driven resolution ─────────────────────────────────────────

export function resolveFromIntent(
  message: string,
  snapshot: ScientificProjectSnapshot
): AgentCapability[] {
  const lower = message.toLowerCase();
  const matchedIds = new Set<string>();

  for (const { keywords, capabilityIds } of INTENT_MAP) {
    if (keywords.some((kw) => lower.includes(kw))) {
      capabilityIds.forEach((id) => matchedIds.add(id));
    }
  }

  // Filter to capabilities where required modalities are available
  const availableModalities = new Set(snapshot.datasets.map((d) => d.modality));
  const resolved = Array.from(matchedIds)
    .map((id) => CAPABILITY_GRAPH.find((c) => c.id === id))
    .filter((c): c is AgentCapability => c !== undefined)
    .filter((c) =>
      c.inputModalities.length === 0 ||
      c.inputModalities.every((m) => availableModalities.has(m))
    );

  // Fallback: if no intent match but datasets exist, suggest single-method capabilities
  if (resolved.length === 0 && snapshot.datasets.length > 0) {
    return resolveFromState(snapshot).slice(0, 2).map((o) =>
      CAPABILITY_GRAPH.find((c) => c.id === o.requiredCapabilityIds[0])
    ).filter((c): c is AgentCapability => c !== undefined);
  }

  return resolved;
}

// ─── Path B: State-driven (proactive) resolution ──────────────────────────────

export function resolveFromState(
  snapshot: ScientificProjectSnapshot
): StateOpportunity[] {
  const opportunities: StateOpportunity[] = [];
  const availableModalities = new Set(snapshot.datasets.map((d) => d.modality));
  const overlapPairs = snapshot.spatialIndexSummary.overlapPairs;

  for (const capability of CAPABILITY_GRAPH) {
    for (const trigger of capability.stateOpportunityTriggers) {
      const triggered = evaluateTrigger(trigger, snapshot, availableModalities, overlapPairs);
      if (triggered) {
        // Don't duplicate existing undismissed opportunities
        const alreadyExists = snapshot.opportunities.some(
          (o) => !o.dismissed && o.requiredCapabilityIds.includes(capability.id)
        );
        if (!alreadyExists) {
          opportunities.push({
            id: `opp_${capability.id}_${Date.now()}`,
            title: capability.description,
            description: trigger.description,
            triggeredBy: trigger,
            requiredCapabilityIds: [capability.id],
            datasetIds: snapshot.datasets.map((d) => d.id),
            confidence: 0.75,
            dismissed: false,
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  return opportunities;
}

function evaluateTrigger(
  trigger: StateOpportunityTrigger,
  snapshot: ScientificProjectSnapshot,
  availableModalities: Set<DataModality>,
  overlapPairs: typeof snapshot.spatialIndexSummary.overlapPairs
): boolean {
  switch (trigger.condition) {
    case "modality_combination":
      return trigger.requiredModalities?.every((m) => availableModalities.has(m)) ?? false;

    case "datasets_overlap": {
      if (!trigger.requiredModalities) return false;
      const required = new Set(trigger.requiredModalities);
      return overlapPairs.some(({ datasetIds }) => {
        const d1 = snapshot.datasets.find((d) => d.id === datasetIds[0]);
        const d2 = snapshot.datasets.find((d) => d.id === datasetIds[1]);
        return d1 && d2 && required.has(d1.modality) && required.has(d2.modality);
      });
    }

    case "hypothesis_contradiction":
      return snapshot.hypothesisGraph.some(
        (h) => h.status === "active" && h.contradictions.length > 0
      );

    case "confidence_below_threshold":
      return snapshot.hypothesisGraph.some(
        (h) => h.status === "active" && h.confidence < (trigger.threshold ?? 0.5)
      );

    case "dag_node_invalidated":
      return !!snapshot.executionDAG?.nodes.some(
        (n) => n.status === "invalidated" || n.status === "recompute-required"
      );

    case "missing_complementary_dataset": {
      const hasMag = availableModalities.has("magnetic");
      const hasGrav = availableModalities.has("gravity");
      return hasMag && !hasGrav;
    }

    default:
      return false;
  }
}

// ─── Agent selection ──────────────────────────────────────────────────────────

export function selectMinimalAgents(
  capabilities: AgentCapability[],
  snapshot: ScientificProjectSnapshot
): AgentId[] {
  const agentSet = new Set<AgentId>();
  const availableModalities = new Set(snapshot.datasets.map((d) => d.modality));

  for (const cap of capabilities) {
    // Only include agents whose modalities are available
    for (const agentId of cap.requiredAgents) {
      const domain = agentId.replace("-agent", "") as string;
      // Always include orchestrator/geological/workflow agents regardless
      if (["orchestrator", "geological", "workflow"].includes(domain) || availableModalities.has(domain as DataModality)) {
        agentSet.add(agentId);
      }
    }
  }

  return Array.from(agentSet);
}

export function getCapabilityById(id: string): AgentCapability | undefined {
  return CAPABILITY_GRAPH.find((c) => c.id === id);
}
