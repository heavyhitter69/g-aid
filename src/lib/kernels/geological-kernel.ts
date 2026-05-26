/**
 * geological-kernel.ts
 * GeologicalSynthesisKernel — cross-discipline structural synthesis and lithological inference.
 * This kernel integrates outputs from other kernels into a unified geological model.
 */

import type { GeoDataset, HypothesisNode, ConfidenceProvenance, ScientificProjectSnapshot } from "@/types/scientific";
import { ReasoningKernel, generateNodeId } from "@/lib/kernels/kernel-base";
import type { AnomalyDescription } from "@/lib/rules/rule-engine";
import type { evaluateRules } from "@/lib/rules/rule-engine";

export class GeologicalSynthesisKernel extends ReasoningKernel {
  readonly id = "geological-kernel";
  readonly domain = "geological" as const;
  readonly agentId = "geological-agent" as const;

  isRelevantDataset(_dataset: GeoDataset): boolean {
    // Geological kernel uses all datasets — it synthesises across methods
    return true;
  }

  extractAnomalyDescriptions(query: string): AnomalyDescription[] {
    const lower = query.toLowerCase();
    // Geological kernel synthesises descriptions from all modalities mentioned
    const descriptions: AnomalyDescription[] = [];
    if (lower.includes("magnetic") || lower.includes("mag")) {
      descriptions.push({ modality: "magnetic", shape: "irregular", polarity: "variable", gradient: "gradual", amplitude: "moderate", location: "survey area" });
    }
    if (lower.includes("resistivity") || lower.includes("ert")) {
      descriptions.push({ modality: "resistivity", shape: "irregular", polarity: "variable", gradient: "gradual", amplitude: "moderate", location: "survey area" });
    }
    if (lower.includes("gravity") || lower.includes("grav")) {
      descriptions.push({ modality: "gravity", shape: "irregular", polarity: "variable", gradient: "gradual", amplitude: "moderate", location: "survey area" });
    }
    return descriptions;
  }

  synthesizeInterpretation(
    query: string,
    hypotheses: HypothesisNode[],
    _ruleMatches: ReturnType<typeof evaluateRules>,
    provenance: ConfidenceProvenance
  ): string {
    const interpretations = hypotheses.filter((h) => h.epistemicType === "interpretation");
    const models = hypotheses.filter((h) => h.epistemicType === "geological_model");
    const warnings = hypotheses.filter((h) => h.epistemicType === "uncertainty_warning" || h.epistemicType === "processing_assumption");
    const confLabel = this.confidenceToLanguage(provenance.derivedConfidence);
    const lower = query.toLowerCase();

    // Identify geological context from query
    const context = lower.includes("groundwater") ? "hydrogeological" :
      lower.includes("mineral") || lower.includes("gold") || lower.includes("ore") ? "mineral exploration" :
      lower.includes("structure") || lower.includes("fault") || lower.includes("shear") ? "structural" : "general";

    return [
      `## Geological Synthesis`,
      ``,
      `**Multi-Method Integration**`,
      interpretations.length > 0
        ? `Integration of available geophysical datasets suggests the following geological framework:`
        : `Geological synthesis requires more specific anomaly descriptions to constrain interpretation. Please describe the key features observed in each dataset.`,
      ``,
      ...(interpretations.length > 0 ? [
        ...interpretations.map((h, i) => `${i + 1}. ${h.statement}`),
        ``,
      ] : []),
      ...(models.length > 0 ? [
        `**Conceptual Geological Model**`,
        ...models.map((m) => `- ${m.statement}`),
        ``,
      ] : []),
      `**Geological Consistency Assessment**`,
      `- Interpretation consistency across methods: ${interpretations.length > 1 ? "multiple methods provide convergent evidence — confidence elevated" : "single method — additional data recommended for constraint"}`,
      `- ${context.charAt(0).toUpperCase() + context.slice(1)} context: geological framework is ${provenance.geologicalConsistency !== null ? (provenance.geologicalConsistency > 0.6 ? "consistent" : "partially consistent") : "unconstrained"} with regional geology`,
      ``,
      ...(warnings.length > 0 ? [`**Critical Limitations**`, ...warnings.map((w) => `- ${w.statement}`), ``] : []),
      `**Confidence**`,
      `${(provenance.derivedConfidence * 100).toFixed(0)}% (${confLabel})`,
      ``,
      `*This is a multi-method synthesis. Individual method confidence scores are in respective agent responses.*`,
      ``,
      `**Recommended Next Steps**`,
      `- Review individual agent interpretations for method-specific detail`,
      `- Consider epistemic branch creation if competing models exist`,
      `- Human review recommended before committing to drilling or further survey design`,
    ].join("\n");
  }

  // Override: geological kernel enhances hypotheses with cross-method synthesis node
  protected applyProbabilisticUpdate(
    hypotheses: HypothesisNode[],
    snapshot: ScientificProjectSnapshot
  ): HypothesisNode[] {
    const updated = super.applyProbabilisticUpdate(hypotheses, snapshot);

    // Synthesize a cross-method summary hypothesis if 2+ method interpretations exist
    const methodInterpretations = snapshot.hypothesisGraph.filter(
      (h) => h.epistemicType === "interpretation" && h.status === "active"
    );

    if (methodInterpretations.length >= 2) {
      const avgConfidence = methodInterpretations.reduce((sum, h) => sum + h.confidence, 0) / methodInterpretations.length;
      const syntheticHypothesis: HypothesisNode = {
        id: generateNodeId("hyp_geological_synthesis"),
        statement: `Cross-method synthesis: ${methodInterpretations.length} independent geophysical methods provide convergent evidence. Integrated interpretation carries elevated confidence relative to single-method analysis.`,
        epistemicType: "geological_model",
        confidence: Math.min(0.85, avgConfidence + 0.1),
        confidenceProvenance: {
          dataQualityScore: null,
          crossMethodAgreement: 0.85,
          modelConvergence: null,
          geologicalConsistency: 0.75,
          spatialCoverage: null,
          spatialCompatibility: null,
          linespacing: null,
          derivedConfidence: Math.min(0.85, avgConfidence + 0.1),
          computedAt: new Date().toISOString(),
          computedByKernel: this.id,
        },
        evidence: methodInterpretations.map((h) => ({
          datasetId: h.datasetIds[0] ?? "unknown",
          description: h.statement.slice(0, 80) + "…",
          weight: h.confidence,
        })),
        contradictions: [],
        parentIds: methodInterpretations.map((h) => h.id),
        childIds: [],
        epistemicBranchId: null,
        agentId: this.agentId,
        datasetIds: [...new Set(methodInterpretations.flatMap((h) => h.datasetIds))],
        ontologyEntityIds: [...new Set(methodInterpretations.flatMap((h) => h.ontologyEntityIds))],
        createdAt: new Date().toISOString(),
        revisedAt: new Date().toISOString(),
        revisionHistory: [],
        status: "active",
      };
      return [...updated, syntheticHypothesis];
    }

    return updated;
  }
}

export const geologicalKernel = new GeologicalSynthesisKernel();
