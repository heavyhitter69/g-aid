/**
 * magnetic-kernel.ts
 * MagneticInferenceKernel — domain-specific epistemic system for magnetics.
 * Handles: RTP instability, remanence ambiguity, depth estimation, lineament extraction.
 * Synthesis is domain-scripted (no-key mode) — scientifically accurate templates.
 */

import type { GeoDataset, HypothesisNode, ConfidenceProvenance } from "@/types/scientific";
import { ReasoningKernel } from "@/lib/kernels/kernel-base";
import type { AnomalyDescription } from "@/lib/rules/rule-engine";
import type { evaluateRules } from "@/lib/rules/rule-engine";

export class MagneticInferenceKernel extends ReasoningKernel {
  readonly id = "magnetic-kernel";
  readonly domain = "magnetic" as const;
  readonly agentId = "magnetic-agent" as const;

  isRelevantDataset(dataset: GeoDataset): boolean {
    return dataset.modality === "magnetic";
  }

  extractAnomalyDescriptions(query: string): AnomalyDescription[] {
    const lower = query.toLowerCase();
    const descriptions: AnomalyDescription[] = [];

    const polarity = lower.includes("low") || lower.includes("negative") || lower.includes("depress")
      ? "negative"
      : lower.includes("high") || lower.includes("positive") || lower.includes("peak")
      ? "positive"
      : "variable";

    const shape = lower.includes("circular") || lower.includes("round") || lower.includes("bull")
      ? "circular"
      : lower.includes("linear") || lower.includes("trend") || lower.includes("elongated") || lower.includes("dyke")
      ? "linear"
      : lower.includes("irregular") || lower.includes("complex")
      ? "irregular"
      : "irregular";

    const gradient = lower.includes("sharp") || lower.includes("steep") || lower.includes("abrupt")
      ? "sharp"
      : "gradual";

    descriptions.push({
      modality: "magnetic",
      shape,
      polarity,
      gradient,
      amplitude: lower.includes("strong") || lower.includes("intense") || lower.includes("high amplitude") ? "high" : "moderate",
      location: "survey area",
    });

    // Detect coincident gravity mention
    if (lower.includes("gravity") || lower.includes("grav") || lower.includes("bouguer")) {
      const gravPolarity = lower.includes("gravity low") || lower.includes("gravity negative") ? "negative" : "positive";
      descriptions.push({
        modality: "gravity",
        shape: "irregular",
        polarity: gravPolarity,
        gradient: "gradual",
        amplitude: "moderate",
        location: "coincident with magnetic anomaly",
      });
    }

    return descriptions;
  }

  synthesizeInterpretation(
    query: string,
    hypotheses: HypothesisNode[],
    ruleMatches: ReturnType<typeof evaluateRules>,
    provenance: ConfidenceProvenance
  ): string {
    const primaryHyp = hypotheses.find((h) => h.epistemicType === "interpretation") ?? hypotheses[0];
    const warnings = hypotheses.filter((h) => h.epistemicType === "uncertainty_warning" || h.epistemicType === "processing_assumption");
    const recommendations = ruleMatches.flatMap((m) => m.rule.conclusion.additionalRecommendations ?? []);
    const confLabel = this.confidenceToLanguage(provenance.derivedConfidence);

    const lines: string[] = [
      `## Magnetic Interpretation`,
      ``,
    ];

    if (primaryHyp) {
      lines.push(`**Interpretation**`);
      lines.push(primaryHyp.statement);
      lines.push(``);
    } else {
      lines.push(`**Interpretation**`);
      lines.push(`Magnetic data has been reviewed. No dominant anomaly pattern detected from available information — additional context or data required to constrain interpretation.`);
      lines.push(``);
    }

    lines.push(`**Supporting Evidence**`);
    if (primaryHyp?.evidence.length) {
      primaryHyp.evidence.forEach((e) => lines.push(`- ${e.description}`));
    } else {
      lines.push(`- Magnetic dataset present in project`);
    }
    lines.push(``);

    if (warnings.length > 0) {
      lines.push(`**Limitations and Warnings**`);
      warnings.forEach((w) => lines.push(`- ${w.statement}`));
      lines.push(``);
    }

    lines.push(`**Confidence**`);
    lines.push(`${(provenance.derivedConfidence * 100).toFixed(0)}% (${confLabel})`);
    lines.push(``);
    lines.push(`*Confidence basis: data quality ${((provenance.dataQualityScore ?? 0.5) * 100).toFixed(0)}% · cross-method ${((provenance.crossMethodAgreement ?? 0.4) * 100).toFixed(0)}% · spatial coverage ${((provenance.spatialCoverage ?? 0.5) * 100).toFixed(0)}%*`);
    lines.push(``);

    if (recommendations.length > 0) {
      lines.push(`**Recommended Next Steps**`);
      const unique = [...new Set(recommendations)].slice(0, 4);
      unique.forEach((r) => lines.push(`- ${r}`));
    }

    return lines.join("\n");
  }
}

export const magneticKernel = new MagneticInferenceKernel();
