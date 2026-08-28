/**
 * resistivity-kernel.ts
 * ResistivityInferenceKernel — epistemic system for ERT/resistivity.
 * Handles: inversion non-uniqueness, suppression, electrode geometry, depth uncertainty.
 */

import type { GeoDataset, HypothesisNode, ConfidenceProvenance } from "@/types/scientific";
import { ReasoningKernel } from "@/lib/kernels/kernel-base";
import type { AnomalyDescription } from "@/lib/rules/rule-engine";
import type { evaluateRules } from "@/lib/rules/rule-engine";

export class ResistivityInferenceKernel extends ReasoningKernel {
  readonly id = "resistivity-kernel";
  readonly domain = "resistivity" as const;
  readonly agentId = "resistivity-agent" as const;

  isRelevantDataset(dataset: GeoDataset): boolean {
    return dataset.modality === "resistivity";
  }

  extractAnomalyDescriptions(query: string): AnomalyDescription[] {
    const lower = query.toLowerCase();

    const polarity = lower.includes("conductive") || lower.includes("low resist") || lower.includes("conductor")
      ? "negative"
      : lower.includes("resistive") || lower.includes("high resist") || lower.includes("resistor")
      ? "positive"
      : "variable";

    const shape = lower.includes("layer") || lower.includes("horizontal") || lower.includes("flat")
      ? "layered"
      : lower.includes("vertical") || lower.includes("sub-vertical") || lower.includes("dipping") || lower.includes("fault")
      ? "linear"
      : lower.includes("circular") || lower.includes("round")
      ? "circular"
      : "irregular";

    return [
      {
        modality: "resistivity",
        shape,
        polarity,
        gradient: lower.includes("sharp") || lower.includes("abrupt") ? "sharp" : "gradual",
        amplitude: lower.includes("strong") || lower.includes("intense") ? "high" : "moderate",
        location: "survey section",
      },
    ];
  }

  synthesizeInterpretation(
    query: string,
    hypotheses: HypothesisNode[],
    ruleMatches: ReturnType<typeof evaluateRules>,
    provenance: ConfidenceProvenance
  ): string {
    const primary = hypotheses.find((h) => h.epistemicType === "interpretation") ?? hypotheses[0];
    const warnings = hypotheses.filter((h) => h.epistemicType === "uncertainty_warning" || h.epistemicType === "processing_assumption");
    const recommendations = [...new Set(ruleMatches.flatMap((m) => m.rule.conclusion.additionalRecommendations ?? []))].slice(0, 4);
    const confLabel = this.confidenceToLanguage(provenance.derivedConfidence);

    return [
      `## Resistivity Interpretation`,
      ``,
      `**Interpretation**`,
      primary
        ? primary.statement
        : `ERT data reviewed. The resistivity structure requires additional context for confident interpretation — please specify anomaly character (conductive/resistive), geometry, and depth range.`,
      ``,
      `**Supporting Evidence**`,
      ...(primary?.evidence.map((e) => `- ${e.description}`) ?? [`- Resistivity dataset present in project`]),
      ``,
      `**Inversion Considerations**`,
      `- ERT inversion is non-unique: multiple earth models may fit the data equally well`,
      `- Depth penetration is limited by electrode array spread (maximum depth ≈ array length / 5)`,
      `- Near-surface conductive layers can suppress response from deeper features`,
      ``,
      ...(warnings.length > 0 ? [`**Warnings**`, ...warnings.map((w) => `- ${w.statement}`), ``] : []),
      `**Confidence**`,
      `${(provenance.derivedConfidence * 100).toFixed(0)}% (${confLabel})`,
      ``,
      `*Confidence basis: data quality ${((provenance.dataQualityScore ?? 0.5) * 100).toFixed(0)}% · cross-method ${((provenance.crossMethodAgreement ?? 0.4) * 100).toFixed(0)}% · spatial coverage ${((provenance.spatialCoverage ?? 0.5) * 100).toFixed(0)}%*`,
      ``,
      ...(recommendations.length > 0 ? [`**Recommended Next Steps**`, ...recommendations.map((r) => `- ${r}`)] : []),
    ].join("\n");
  }
}

export const resistivityKernel = new ResistivityInferenceKernel();
