/**
 * rule-engine.ts
 * Pattern-matching rule executor for symbolic geological inference.
 * Rules are loaded from JSON files — data-driven, auditable, extensible.
 * Symbolic layer runs first; LLM is synthesis-only.
 */

import type {
  InferenceRule,
  RuleCondition,
  RuleMatchResult,
  GeoDataset,
  HypothesisNode,
  ConfidenceProvenance,
} from "@/types/scientific";
import { GEOLOGICAL_ONTOLOGY } from "@/lib/ontology/geological-ontology";

// ─── Rule loading ─────────────────────────────────────────────────────────────

import magneticRules from "@/lib/rules/magnetic-rules.json";
import resistivityRules from "@/lib/rules/resistivity-rules.json";
import gravityRules from "@/lib/rules/gravity-rules.json";
import seismicRules from "@/lib/rules/seismic-rules.json";

const ALL_RULES: InferenceRule[] = [
  ...(magneticRules as InferenceRule[]),
  ...(resistivityRules as InferenceRule[]),
  ...(gravityRules as InferenceRule[]),
  ...(seismicRules as InferenceRule[]),
].sort((a, b) => b.priority - a.priority);

// ─── Execution context ────────────────────────────────────────────────────────

export interface RuleExecutionContext {
  datasets: GeoDataset[];
  anomalyDescriptions: AnomalyDescription[];
  existingHypothesisIds: string[];
  queryText: string;
}

export interface AnomalyDescription {
  modality: string;
  shape: string;
  polarity: "positive" | "negative" | "variable";
  gradient: "sharp" | "gradual" | "variable";
  amplitude: "high" | "moderate" | "low";
  location: string;
  notes?: string;
}

// ─── Condition evaluators ─────────────────────────────────────────────────────

function evaluateCondition(condition: RuleCondition, ctx: RuleExecutionContext): boolean {
  switch (condition.type) {
    case "dataset_present":
      return ctx.datasets.some((d) => d.modality === condition.value);

    case "anomaly_shape":
      return ctx.anomalyDescriptions.some(
        (a) =>
          (!condition.modality || a.modality === condition.modality) &&
          a.shape.toLowerCase().includes(String(condition.value).toLowerCase())
      );

    case "anomaly_polarity":
      return ctx.anomalyDescriptions.some(
        (a) =>
          (!condition.modality || a.modality === condition.modality) &&
          a.polarity === condition.value
      );

    case "gradient_character":
      return ctx.anomalyDescriptions.some(
        (a) =>
          (!condition.modality || a.modality === condition.modality) &&
          a.gradient === condition.value
      );

    case "coincident_anomaly": {
      const targetPolarity = condition.value as string;
      const targetModality = condition.modality as string;
      return ctx.anomalyDescriptions.some(
        (a) => a.modality === targetModality && a.polarity === targetPolarity
      );
    }

    case "dataset_quality": {
      const dataset = ctx.datasets.find((d) => d.modality === condition.modality);
      if (!dataset) return false;
      const snr = dataset.qualityMetrics.signalToNoise;
      if (snr === null) return false;
      const op = condition.operator ?? "gte";
      const threshold = Number(condition.threshold ?? condition.value);
      return applyOperator(snr, op, threshold);
    }

    case "remanence_flag":
      // Phase 1: derive from query text keywords
      return ctx.queryText.toLowerCase().includes("remanence") ||
             ctx.queryText.toLowerCase().includes("remanent");

    case "cultural_noise_probability": {
      // Phase 1: keyword detection
      const hasCultural = ctx.queryText.toLowerCase().includes("cultural") ||
                          ctx.queryText.toLowerCase().includes("infrastructure") ||
                          ctx.queryText.toLowerCase().includes("pipeline") ||
                          ctx.queryText.toLowerCase().includes("powerline");
      const threshold = Number(condition.threshold ?? condition.value ?? 0.5);
      return hasCultural ? 0.7 >= threshold : 0 >= threshold;
    }

    case "acquisition_method": {
      return ctx.datasets.some(
        (d) => d.acquisitionMethod.toLowerCase().includes(String(condition.value).toLowerCase())
      );
    }

    case "hypothesis_exists":
      return ctx.existingHypothesisIds.length > 0;

    default:
      return false;
  }
}

function applyOperator(value: number, op: string, threshold: number): boolean {
  switch (op) {
    case "eq": return value === threshold;
    case "gt": return value > threshold;
    case "lt": return value < threshold;
    case "gte": return value >= threshold;
    case "lte": return value <= threshold;
    default: return false;
  }
}

// ─── Main rule evaluation ─────────────────────────────────────────────────────

export function evaluateRules(
  ctx: RuleExecutionContext,
  domainFilter?: string
): RuleMatchResult[] {
  const rules = domainFilter
    ? ALL_RULES.filter((r) => r.domain === domainFilter)
    : ALL_RULES;

  const results: RuleMatchResult[] = [];

  for (const rule of rules) {
    // Check exclusions first — any exclusion match voids the rule
    const excludedBy = rule.exclusions.find((exc) => evaluateCondition(exc, ctx));
    if (excludedBy) {
      continue;
    }

    // Evaluate all conditions — all must match
    const matchedConditions = rule.conditions.filter((cond) => evaluateCondition(cond, ctx));
    const score = rule.conditions.length > 0
      ? matchedConditions.length / rule.conditions.length
      : 0;

    if (matchedConditions.length === rule.conditions.length && score > 0) {
      results.push({ rule, matchedConditions, excludedBy: null, score });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

// ─── Hypothesis generation ────────────────────────────────────────────────────

let _hypothesisIdCounter = 0;

export function generateHypothesesFromRules(
  matches: RuleMatchResult[],
  datasets: GeoDataset[],
  baseProvenance: ConfidenceProvenance
): Omit<HypothesisNode, "id">[] {
  return matches.map((match) => {
    const { rule, score } = match;
    const entity = GEOLOGICAL_ONTOLOGY.find((e) => e.id === rule.conclusion.geologicalEntityId);
    const adjustedConfidence = Math.min(
      1,
      Math.max(0, baseProvenance.derivedConfidence + rule.conclusion.confidenceModifier * score)
    );

    const provenance: ConfidenceProvenance = {
      ...baseProvenance,
      geologicalConsistency: score,
      derivedConfidence: adjustedConfidence,
      computedAt: new Date().toISOString(),
      computedByKernel: `rule-engine:${rule.id}`,
    };

    const statement = rule.conclusion.hypothesisStatement
      .replace("{{entity}}", entity?.name ?? rule.conclusion.geologicalEntityId)
      .replace("{{domain}}", rule.domain);

    return {
      statement,
      epistemicType: rule.conclusion.epistemicType,
      confidence: adjustedConfidence,
      confidenceProvenance: provenance,
      evidence: datasets.map((d) => ({
        datasetId: d.id,
        description: `${d.modality} data — ${d.name}`,
        weight: 0.5,
      })),
      contradictions: [],
      parentIds: [],
      childIds: [],
      epistemicBranchId: null,
      agentId: "orchestrator-agent" as const,
      datasetIds: datasets.map((d) => d.id),
      ontologyEntityIds: [rule.conclusion.geologicalEntityId],
      createdAt: new Date().toISOString(),
      revisedAt: new Date().toISOString(),
      revisionHistory: [],
      status: "active" as const,
    };
  });
}

export function getRulesByDomain(domain: string): InferenceRule[] {
  return ALL_RULES.filter((r) => r.domain === domain);
}

export function getRuleById(id: string): InferenceRule | undefined {
  return ALL_RULES.find((r) => r.id === id);
}

export { ALL_RULES };
