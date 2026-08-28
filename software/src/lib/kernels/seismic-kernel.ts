/**
 * seismic-kernel.ts
 * SeismicInferenceKernel — velocity model dependency, migration artifacts, multiples.
 */

import type { GeoDataset, HypothesisNode, ConfidenceProvenance } from "@/types/scientific";
import { ReasoningKernel } from "@/lib/kernels/kernel-base";
import type { AnomalyDescription } from "@/lib/rules/rule-engine";
import type { evaluateRules } from "@/lib/rules/rule-engine";

export class SeismicInferenceKernel extends ReasoningKernel {
  readonly id = "seismic-kernel";
  readonly domain = "seismic" as const;
  readonly agentId = "seismic-agent" as const;

  isRelevantDataset(dataset: GeoDataset): boolean {
    return dataset.modality === "seismic";
  }

  extractAnomalyDescriptions(query: string): AnomalyDescription[] {
    const lower = query.toLowerCase();
    const shape = lower.includes("layer") || lower.includes("horizon") || lower.includes("flat") ? "layered"
      : lower.includes("fault") || lower.includes("termination") || lower.includes("offset") ? "linear"
      : lower.includes("fold") || lower.includes("anticline") ? "irregular" : "layered";
    return [{
      modality: "seismic",
      shape,
      polarity: lower.includes("bright") || lower.includes("peak") ? "positive" : lower.includes("trough") ? "negative" : "variable",
      gradient: lower.includes("sharp") || lower.includes("abrupt") ? "sharp" : "gradual",
      amplitude: lower.includes("strong") || lower.includes("bright") ? "high" : "moderate",
      location: "seismic section",
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
      `## Seismic Interpretation`,
      ``,
      `**Interpretation**`,
      primary ? primary.statement : `Seismic data reviewed. Interpretation requires specification of data type (reflection/refraction), processing status, and target depth range.`,
      ``,
      `**Supporting Evidence**`,
      ...(primary?.evidence.map((e) => `- ${e.description}`) ?? [`- Seismic dataset present in project`]),
      ``,
      `**Seismic Processing Notes**`,
      `- All structural interpretations are velocity-model dependent — depth uncertainty ±5–15% without well calibration`,
      `- Multiple reflections require identification and removal before structural interpretation`,
      `- Migration aperture affects imaging of steep dips — confirm migration algorithm is appropriate`,
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

export const seismicKernel = new SeismicInferenceKernel();
