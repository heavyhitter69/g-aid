/**
 * kernel-base.ts
 * Abstract base class for all discipline-specific ReasoningKernels.
 * Each domain (magnetic, resistivity, etc.) has its own epistemic system.
 * Shared: UncertaintyFramework, EvidenceFramework, HypothesisFramework.
 * LLM is synthesis-only — symbolic + probabilistic layers run first.
 */

import type {
  AgentId,
  AgentDomain,
  GeoDataset,
  HypothesisNode,
  ConfidenceProvenance,
  InterpretationEntry,
  ScientificProjectSnapshot,
} from "@/types/scientific";
import { evaluateRules, generateHypothesesFromRules } from "@/lib/rules/rule-engine";
import type { RuleExecutionContext, AnomalyDescription } from "@/lib/rules/rule-engine";

let _idCounter = 0;
export function generateNodeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${++_idCounter}`;
}

// ─── Shared Frameworks ────────────────────────────────────────────────────────

/** Deterministic confidence computation — LLM cannot modify this */
export function computeBaseConfidenceProvenance(
  datasets: GeoDataset[],
  kernelId: string
): ConfidenceProvenance {
  const snrValues = datasets
    .map((d) => d.qualityMetrics.signalToNoise)
    .filter((v): v is number => v !== null);

  const coverageValues = datasets
    .map((d) => d.qualityMetrics.coveragePercent)
    .filter((v): v is number => v !== null);

  const linespacing = datasets
    .map((d) => d.samplingDensity)
    .filter((v): v is number => v !== null);

  const dataQualityScore = snrValues.length > 0
    ? Math.min(1, Math.max(0, (snrValues.reduce((a, b) => a + b, 0) / snrValues.length) / 30))
    : 0.5;

  const spatialCoverage = coverageValues.length > 0
    ? (coverageValues.reduce((a, b) => a + b, 0) / coverageValues.length) / 100
    : 0.5;

  const linespaceScore = linespacing.length > 0
    ? Math.min(1, 200 / (linespacing.reduce((a, b) => a + b, 0) / linespacing.length)) // 200m line spacing = 1.0
    : 0.5;

  // Multi-dataset bonus — cross-method coverage increases confidence
  const crossMethodAgreement = datasets.length > 1 ? 0.7 : 0.4;

  const derivedConfidence = weightedAverage([
    [dataQualityScore, 0.30],
    [spatialCoverage, 0.20],
    [linespaceScore, 0.20],
    [crossMethodAgreement, 0.30],
  ]);

  return {
    dataQualityScore,
    crossMethodAgreement,
    modelConvergence: null,   // set by inversion tools
    geologicalConsistency: null, // set by rule engine
    spatialCoverage,
    spatialCompatibility: null,  // set by spatial engine
    linespacing: linespacing[0] ?? null,
    derivedConfidence,
    computedAt: new Date().toISOString(),
    computedByKernel: kernelId,
  };
}

function weightedAverage(pairs: [number, number][]): number {
  const totalWeight = pairs.reduce((sum, [, w]) => sum + w, 0);
  const weightedSum = pairs.reduce((sum, [v, w]) => sum + v * w, 0);
  return totalWeight > 0 ? Math.min(1, Math.max(0, weightedSum / totalWeight)) : 0.5;
}

// ─── Abstract Kernel ──────────────────────────────────────────────────────────

export abstract class ReasoningKernel {
  abstract readonly id: string;
  abstract readonly domain: AgentDomain;
  abstract readonly agentId: AgentId;

  /**
   * Main entry point. Runs symbolic → probabilistic → synthesis.
   * Returns hypotheses + structured markdown interpretation.
   */
  async reason(
    query: string,
    datasets: GeoDataset[],
    snapshot: ScientificProjectSnapshot
  ): Promise<KernelReasoningResult> {
    const domainDatasets = datasets.filter((d) => this.isRelevantDataset(d));
    const baseProvenance = computeBaseConfidenceProvenance(domainDatasets.length > 0 ? domainDatasets : datasets, this.id);

    // Stage 1: Symbolic — pattern-matching rules
    const anomalies = this.extractAnomalyDescriptions(query);
    const ruleCtx: RuleExecutionContext = {
      datasets: domainDatasets,
      anomalyDescriptions: anomalies,
      existingHypothesisIds: snapshot.hypothesisGraph.map((h) => h.id),
      queryText: query,
    };
    const ruleMatches = evaluateRules(ruleCtx, this.domain);

    // Stage 2: Generate hypothesis nodes from rule matches
    const rawHypotheses = generateHypothesesFromRules(ruleMatches, domainDatasets, baseProvenance);
    const hypotheses: HypothesisNode[] = rawHypotheses.map((h) => ({
      ...h,
      id: generateNodeId(`hyp_${this.domain}`),
      agentId: this.agentId,
    }));

    // Stage 3: Probabilistic — update confidence based on cross-method evidence
    const updatedHypotheses = this.applyProbabilisticUpdate(hypotheses, snapshot);

    // Stage 4: Synthesis — structured domain-scripted markdown (no LLM in no-key mode)
    const interpretation = this.synthesizeInterpretation(query, updatedHypotheses, ruleMatches, baseProvenance);

    return {
      hypotheses: updatedHypotheses,
      interpretation,
      ruleMatchIds: ruleMatches.map((m) => m.rule.id),
      baseProvenance,
      agentId: this.agentId,
    };
  }

  /** Override to define which datasets this kernel cares about */
  abstract isRelevantDataset(dataset: GeoDataset): boolean;

  /** Override to extract anomaly descriptions from query text */
  abstract extractAnomalyDescriptions(query: string): AnomalyDescription[];

  /** Override to provide domain-specific synthesis templates */
  abstract synthesizeInterpretation(
    query: string,
    hypotheses: HypothesisNode[],
    ruleMatches: ReturnType<typeof evaluateRules>,
    provenance: ConfidenceProvenance
  ): string;

  /** Probabilistic update: Bayesian-inspired confidence revision from context */
  protected applyProbabilisticUpdate(
    hypotheses: HypothesisNode[],
    snapshot: ScientificProjectSnapshot
  ): HypothesisNode[] {
    return hypotheses.map((h) => {
      let confidence = h.confidence;

      // Boost: existing corroborating hypothesis increases confidence
      const corroborating = snapshot.hypothesisGraph.filter(
        (existing) =>
          existing.status === "active" &&
          existing.ontologyEntityIds.some((id) => h.ontologyEntityIds.includes(id)) &&
          existing.agentId !== h.agentId
      );
      if (corroborating.length > 0) {
        confidence = Math.min(1, confidence + 0.08 * corroborating.length);
      }

      // Penalise: active contradicting hypothesis decreases confidence
      const contradicting = snapshot.hypothesisGraph.filter(
        (existing) =>
          existing.status === "active" &&
          existing.contradictions.some((c) =>
            h.datasetIds.includes(c.datasetId)
          )
      );
      if (contradicting.length > 0) {
        confidence = Math.max(0, confidence - 0.06 * contradicting.length);
      }

      if (confidence !== h.confidence) {
        return {
          ...h,
          confidence,
          confidenceProvenance: {
            ...h.confidenceProvenance,
            derivedConfidence: confidence,
            computedAt: new Date().toISOString(),
          },
        };
      }
      return h;
    });
  }

  /** Shared: format confidence as uncertainty language */
  protected confidenceToLanguage(confidence: number): string {
    if (confidence >= 0.80) return "high confidence";
    if (confidence >= 0.65) return "moderate-to-high confidence";
    if (confidence >= 0.50) return "moderate confidence";
    if (confidence >= 0.35) return "possible";
    return "speculative — requires additional constraints";
  }

  /** Shared: extract keywords for anomaly classification */
  protected extractKeywords(query: string, keywords: string[]): string[] {
    const lower = query.toLowerCase();
    return keywords.filter((k) => lower.includes(k.toLowerCase()));
  }
}

export interface KernelReasoningResult {
  hypotheses: HypothesisNode[];
  interpretation: string;
  ruleMatchIds: string[];
  baseProvenance: ConfidenceProvenance;
  agentId: AgentId;
}
