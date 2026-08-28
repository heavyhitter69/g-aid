/**
 * gravity-kernel.ts
 * GravityInferenceKernel — density contrast reasoning, regional/residual decomposition.
 */

import type { GeoDataset, HypothesisNode, ConfidenceProvenance } from "@/types/scientific";
import { ReasoningKernel } from "@/lib/kernels/kernel-base";
import type { AnomalyDescription } from "@/lib/rules/rule-engine";
import type { evaluateRules } from "@/lib/rules/rule-engine";

export class GravityInferenceKernel extends ReasoningKernel {
  readonly id = "gravity-kernel";
  readonly domain = "gravity" as const;
  readonly agentId = "gravity-agent" as const;

  isRelevantDataset(dataset: GeoDataset): boolean {
    return dataset.modality === "gravity";
  }

  extractAnomalyDescriptions(query: string): AnomalyDescription[] {
    const lower = query.toLowerCase();
    const polarity = lower.includes("low") || lower.includes("negative") || lower.includes("deficit")
      ? "negative" : lower.includes("high") || lower.includes("positive") || lower.includes("excess") ? "positive" : "variable";
    return [{
      modality: "gravity",
      shape: lower.includes("circular") ? "circular" : lower.includes("linear") || lower.includes("elongated") ? "elongated" : "irregular",
      polarity,
      gradient: lower.includes("sharp") ? "sharp" : "gradual",
      amplitude: lower.includes("strong") || lower.includes("large") ? "high" : "moderate",
      location: "survey area",
    }];
  }

  synthesizeInterpretation(
    _query: string,
    hypotheses: HypothesisNode[],
    ruleMatches: ReturnType<typeof evaluateRules>,
    provenance: ConfidenceProvenance
  ): string {
    const primary = hypotheses.find((h) => h.epistemicType === "interpretation") ?? hypotheses[0];
    const warnings = hypotheses.filter((h) => h.epistemicType !== "interpretation");
    const recommendations = [...new Set(ruleMatches.flatMap((m) => m.rule.conclusion.additionalRecommendations ?? []))].slice(0, 4);
    const confLabel = this.confidenceToLanguage(provenance.derivedConfidence);

    return [
      `## Gravity Interpretation`,
      ``,
      `**Interpretation**`,
      primary ? primary.statement : `Gravity data reviewed. Regional-residual separation and Bouguer correction verification are required before geological interpretation can proceed.`,
      ``,
      `**Supporting Evidence**`,
      ...(primary?.evidence.map((e) => `- ${e.description}`) ?? [`- Gravity dataset present in project`]),
      ``,
      `**Gravity Processing Notes**`,
      `- Regional-residual separation method and wavelength cutoff critically affect anomaly shape and amplitude`,
      `- Terrain correction accuracy depends on DEM resolution — verify DEM grid spacing matches survey grid`,
      `- Density contrast assumed from literature — direct density measurements recommended`,
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

export const gravityKernel = new GravityInferenceKernel();
