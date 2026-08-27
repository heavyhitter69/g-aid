/**
 * capability-graph.ts
 * Thin adapter over the live magnetic capability registry.
 * ERT, gravity, seismic, and other packs are not registered here.
 */

import { listCapabilities } from "./capabilities/registry.ts";
import type {
  AgentCapability,
  AgentId,
  ScientificProjectSnapshot,
  StateOpportunity,
} from "@/types/scientific";

export function liveCapabilitiesAsAgentCapabilities(): AgentCapability[] {
  return listCapabilities().map((capability) => ({
    id: capability.id,
    description: capability.description,
    requiredTools: capability.kernelNodeIds,
    requiredAgents: ["magnetic-agent"] as AgentId[],
    inputModalities: ["magnetic"],
    estimatedDurationMs: 4000,
    stateOpportunityTriggers: [
      {
        condition: "modality_combination",
        requiredModalities: ["magnetic"],
        description: capability.title,
      },
    ],
  }));
}

export const CAPABILITY_GRAPH: AgentCapability[] = liveCapabilitiesAsAgentCapabilities();

export function resolveFromIntent(
  message: string,
  snapshot: ScientificProjectSnapshot
): AgentCapability[] {
  const lower = message.toLowerCase();
  const magnetic =
    /\b(magnetic|magnetics|magarrow|gsm-?19|diurnal|igrf|rtp)\b/.test(lower);
  if (!magnetic) return [];
  const available = new Set(snapshot.datasets.map((dataset) => dataset.modality));
  if (snapshot.datasets.length && !available.has("magnetic")) return [];
  return CAPABILITY_GRAPH.filter((capability) => capability.id === "mag.diurnal");
}

export function resolveFromState(snapshot: ScientificProjectSnapshot): StateOpportunity[] {
  const magneticIds = snapshot.datasets.filter((dataset) => dataset.modality === "magnetic").map((dataset) => dataset.id);
  if (!magneticIds.length) return [];
  const already = snapshot.opportunities.some(
    (opportunity) => !opportunity.dismissed && opportunity.requiredCapabilityIds.includes("mag.diurnal")
  );
  if (already) return [];
  const diurnal = CAPABILITY_GRAPH.find((capability) => capability.id === "mag.diurnal");
  return [
    {
      id: `opp_mag.diurnal_${Date.now()}`,
      title: diurnal?.description || "Diurnal correction",
      description: "Supported MagArrow and GSM-19 catalog records can run registered magnetics after a frozen plan.",
      triggeredBy: {
        condition: "modality_combination",
        requiredModalities: ["magnetic"],
        description: "Magnetic dataset available for registered magnetics capabilities",
      },
      requiredCapabilityIds: ["mag.diurnal"],
      datasetIds: magneticIds,
      confidence: 0.75,
      dismissed: false,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function selectMinimalAgents(
  capabilities: AgentCapability[],
  _snapshot: ScientificProjectSnapshot
): AgentId[] {
  if (!capabilities.length) return [];
  return ["magnetic-agent"];
}

export function getCapabilityById(id: string): AgentCapability | undefined {
  return CAPABILITY_GRAPH.find((capability) => capability.id === id);
}
