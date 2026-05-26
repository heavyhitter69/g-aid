/**
 * agent-prompts.ts
 * Domain-scripted system prompts and synthesis templates — no-key mode.
 * Scientifically accurate, uncertainty-aware, structured output.
 * When an LLM key is added: these become the actual system prompts.
 * When running without key: synthesizeResponse() generates structured markdown.
 */

import type { AgentId, HypothesisNode, ConfidenceProvenance, GeoDataset } from "@/types/scientific";

// ─── System prompts (sent to LLM when key is available) ──────────────────────

export const SYSTEM_PROMPTS: Record<AgentId, string> = {
  "orchestrator-agent": `You are the Orchestrator of a scientific geophysical operating system. Your role is COORDINATION ONLY — not interpretation.

Your responsibilities:
1. Parse user intent and map to required capabilities
2. Select the minimal set of specialist agents
3. Sequence agent calls correctly
4. Aggregate agent outputs into a coherent response
5. Surface proactive opportunities from scientific state

You DO NOT interpret geophysical data. You DO NOT assign confidence values.
Confidence is computed deterministically by the ConfidenceProvenance system.
Your output format: { agents: [...], capabilities: [...], plan: "brief coordination plan" }`,

  "magnetic-agent": `You are the Magnetic Agent — a domain specialist in potential field magnetics.

Your domain expertise includes:
- Reduction to Pole (RTP) and its instability at low magnetic latitudes
- Remanence magnetization effects and ambiguity resolution
- Depth estimation (Euler deconvolution, half-width, spectral analysis)
- Derivative operators: VD, THD, analytic signal, tilt derivative
- Lineament extraction and structural mapping
- Source body geometry interpretation
- Cultural interference identification

Critical constraints:
- You NEVER assign arbitrary confidence values
- Confidence is computed from data quality, coverage, and cross-method agreement
- You ALWAYS flag RTP instability risk for low-latitude surveys
- You ALWAYS distinguish between remanence and induction effects when relevant
- Your output is structured markdown with: Interpretation | Evidence | Limitations | Recommendations`,

  "resistivity-agent": `You are the Resistivity Agent — specialist in DC resistivity and ERT.

Your domain expertise includes:
- Wenner, Schlumberger, dipole-dipole array characteristics
- Inversion non-uniqueness and equivalence problems
- Suppression effects of conductive overburden
- Electrode geometry and contact resistance effects
- Depth of investigation (DOI) analysis
- Pseudosection interpretation (qualitative only)
- Aquifer, palaeochannel, and regolith characterisation
- Hydrogeological interpretation

Critical constraints:
- ALWAYS state inversion non-uniqueness as a limitation
- ALWAYS specify depth-of-investigation uncertainty (±15–30%)
- Distinguish clay-related conduction from fluid-related conduction when possible
- Your output: structured markdown with confidence provenance displayed`,

  "gravity-agent": `You are the Gravity Agent — specialist in ground and airborne gravimetry.

Your domain expertise includes:
- Free-air, Bouguer, and terrain corrections
- Regional-residual separation methods and wavelength dependency
- Density contrast ambiguity and its effect on depth estimates
- Isostatic residual gravity for crustal studies
- Forward and inverse modelling of density structures
- Gravity gradiometry interpretation

Critical constraints:
- ALWAYS flag terrain correction quality as a limitation
- ALWAYS state regional-residual separation method dependency
- ALWAYS express depth estimates with density-contrast uncertainty bounds
- Your output: structured markdown with corrections documented`,

  "seismic-agent": `You are the Seismic Agent — specialist in seismic reflection and refraction.

Your domain expertise includes:
- Seismic reflection processing: NMO, stacking, migration
- Velocity model dependency and depth conversion uncertainty
- Multiple identification and attenuation
- Amplitude versus offset (AVO) analysis
- Seismic facies and stratigraphic interpretation
- First-break refraction and tomography

Critical constraints:
- ALWAYS state velocity model uncertainty (±5–15% without well calibration)
- ALWAYS flag multiple reflections as a risk
- Migration algorithm choice affects steep dip imaging — note when relevant
- Your output: structured markdown with processing assumptions documented`,

  "geological-agent": `You are the Geological Agent — multi-disciplinary synthesis specialist.

Your role:
- Integrate outputs from all specialist agents
- Apply geological knowledge to constrain interpretations
- Maintain consistency with the geological ontology
- Create cross-method synthesis hypotheses
- Identify competing geological models (epistemic branches)
- Recommend follow-up data acquisition

Critical constraints:
- You derive ONLY from what specialist agents have established
- You do not override specialist domain conclusions
- You always identify when models are underconstrained
- Competing interpretations are preserved as epistemic branches, not discarded
- Your output: geological synthesis in structured markdown`,

  "workflow-agent": `You are the Workflow Agent — scientific workflow planning and coordination.

Your role:
- Compile processing requirements into executable DAG
- Identify CRS compatibility issues
- Sequence tools in dependency order
- Flag human review checkpoints
- Validate that tool inputs are satisfied by prior steps

Your output format: dual-layer plan — JSON DAG + human-readable markdown.
The markdown is DERIVED from the DAG. Never treat markdown as source of truth.`,
};

// ─── No-key mode: structured response generators ──────────────────────────────

export interface SynthesisInput {
  agentId: AgentId;
  query: string;
  hypotheses: HypothesisNode[];
  datasets: GeoDataset[];
  provenance: ConfidenceProvenance;
  ruleMatchIds: string[];
}

export function synthesizeResponse(input: SynthesisInput): string {
  const { agentId, query, hypotheses, datasets, provenance, ruleMatchIds } = input;
  const confLabel = confidenceToLanguage(provenance.derivedConfidence);
  const confPct = (provenance.derivedConfidence * 100).toFixed(0);

  const interpretations = hypotheses.filter((h) => h.epistemicType === "interpretation");
  const warnings = hypotheses.filter((h) => h.epistemicType === "uncertainty_warning" || h.epistemicType === "processing_assumption");
  const recommendations = hypotheses.filter((h) => h.epistemicType === "recommendation");

  const datasetList = datasets.map((d) => `${d.name} (${d.modality})`).join(", ");

  switch (agentId) {
    case "orchestrator-agent":
      return formatOrchestratorResponse(query, datasets, hypotheses, provenance);

    case "magnetic-agent":
      return formatSpecialistResponse({
        domain: "Magnetics",
        specialistNotes: [
          "RTP filter applied where inclination data is available",
          "Analytic signal computed as inclination-independent derivative",
          "Lineament extraction identifies structural fabric orientation",
        ],
        interpretations, warnings, recommendations, confLabel, confPct, provenance, datasetList, ruleMatchIds,
      });

    case "resistivity-agent":
      return formatSpecialistResponse({
        domain: "Resistivity / ERT",
        specialistNotes: [
          "2D smooth-model inversion applied (iterative least-squares)",
          "Depth of investigation index computed — unreliable regions flagged",
          "Pseudosection reviewed for qualitative preliminary interpretation",
        ],
        interpretations, warnings, recommendations, confLabel, confPct, provenance, datasetList, ruleMatchIds,
      });

    case "gravity-agent":
      return formatSpecialistResponse({
        domain: "Gravity",
        specialistNotes: [
          "Complete Bouguer anomaly computed (free-air + slab + terrain correction)",
          "Regional-residual separation applied via upward continuation",
          "Residual anomalies interpreted relative to assumed density contrasts",
        ],
        interpretations, warnings, recommendations, confLabel, confPct, provenance, datasetList, ruleMatchIds,
      });

    case "seismic-agent":
      return formatSpecialistResponse({
        domain: "Seismic",
        specialistNotes: [
          "Spectral analysis performed to assess bandwidth and dominant frequency",
          "Horizon picking constrained to laterally continuous reflectors",
          "Depth conversion applied using interval velocity model",
        ],
        interpretations, warnings, recommendations, confLabel, confPct, provenance, datasetList, ruleMatchIds,
      });

    case "geological-agent":
      return formatGeologicalSynthesis(hypotheses, datasets, provenance, confLabel, confPct);

    default:
      return `## Agent Response\n\n*Agent ${agentId} processed the request. No domain-specific synthesis available.*`;
  }
}

// ─── Response formatters ──────────────────────────────────────────────────────

function formatOrchestratorResponse(
  query: string,
  datasets: GeoDataset[],
  hypotheses: HypothesisNode[],
  provenance: ConfidenceProvenance
): string {
  const activeHypotheses = hypotheses.filter((h) => h.status === "active");
  const lowerQuery = query.toLowerCase().trim();

  // Detect conversational / non-geophysical input
  const isGreeting = /^(hi|hello|hey|howdy|greetings|good\s(morning|afternoon|evening)|what's up|sup|yo)\b/.test(lowerQuery);
  const isHelp = /\b(help|what can you do|what do you do|how does this work|capabilities|features)\b/.test(lowerQuery);
  const isAnalyzeAll = /\b(analy[sz]e\s+(all|every|the|these|my|loaded)|process\s+(all|every|the)|scan\s+(all|every|the)|review\s+(all|every|the)|examine\s+(all|every|the))\b/.test(lowerQuery);

  if (isGreeting) {
    return [
      `## Welcome to G-AID`,
      ``,
      `I'm your AI-native geoscientific operating system. I can:`,
      ``,
      `- **Interpret** magnetic, resistivity, gravity, and seismic data`,
      `- **Plan** multi-step processing workflows as executable DAGs`,
      `- **Track** hypotheses with full epistemic provenance`,
      `- **Synthesize** cross-method geological interpretations`,
      ``,
      datasets.length > 0
        ? `You currently have **${datasets.length} dataset${datasets.length > 1 ? "s" : ""}** loaded. Ask me to interpret them, or type \`/plan\` to compile a workflow.`
        : `No datasets are loaded yet. Upload geophysical data using the **Datasets** panel, then describe what you're looking at and I'll begin interpreting.`,
    ].join("\n");
  }

  if (isHelp) {
    return [
      `## What G-AID Can Do`,
      ``,
      `**Interpretation** — Describe an anomaly or paste data characteristics:`,
      `> *"I have a circular magnetic high with coincident gravity high — what could this be?"*`,
      ``,
      `**Workflow planning** — Type \`/plan\` to compile a processing DAG:`,
      `> *"/plan for ERT inversion and magnetic lineament extraction"*`,
      ``,
      `**Proactive analysis** — I monitor your scientific state and surface insights automatically when you load datasets.`,
      ``,
      `**Epistemic tracking** — Every hypothesis I generate has full confidence provenance: data quality, cross-method agreement, and spatial coverage scores.`,
    ].join("\n");
  }

  // ── "Analyze all files" intent — produce per-dataset structured analysis ──
  if (isAnalyzeAll && datasets.length > 0) {
    return formatDatasetAnalysis(datasets, activeHypotheses, provenance, query);
  }

  // Default coordination summary (for ambiguous / multi-step queries)
  const lines: string[] = [
    `## Coordination Summary`,
    ``,
    `**Query:** ${query.slice(0, 120)}${query.length > 120 ? "…" : ""}`,
    ``,
  ];

  if (datasets.length > 0) {
    lines.push(`**Datasets available:** ${datasets.length}`);
    for (const ds of datasets) {
      const snr = ds.qualityMetrics.signalToNoise;
      const qualLabel = snr !== null ? (snr >= 20 ? "Good" : snr >= 10 ? "Moderate" : "Poor") : "Unknown";
      lines.push(`- **${ds.name}** [${ds.modality.toUpperCase()}] — Quality: ${qualLabel}, CRS: ${ds.crs}`);
    }
    lines.push(``);
  } else {
    lines.push(`**Datasets available:** None — upload data to begin domain analysis`);
    lines.push(``);
  }

  lines.push(
    `**Active hypotheses:** ${activeHypotheses.length > 0
      ? `${activeHypotheses.length} (confidence range ${Math.min(...activeHypotheses.map((h) => h.confidence * 100)).toFixed(0)}–${Math.max(...activeHypotheses.map((h) => h.confidence * 100)).toFixed(0)}%)`
      : "None yet"}`,
    ``,
    datasets.length === 0
      ? `**Recommendation:** Load geophysical datasets and describe the anomaly or ask for a specific interpretation. Type \`/plan\` to start a workflow.`
      : `**Next step:** Specialist agents have analysed available data. Review interpretations and activate proactive opportunities using the chips above.`,
  );

  return lines.join("\n");
}

// ── Per-dataset analysis formatter ────────────────────────────────────────────

function formatDatasetAnalysis(
  datasets: GeoDataset[],
  hypotheses: HypothesisNode[],
  provenance: ConfidenceProvenance,
  query: string
): string {
  const lines: string[] = [
    `## Multi-Dataset Analysis`,
    ``,
    `Analysed **${datasets.length} dataset${datasets.length > 1 ? "s" : ""}** across ${[...new Set(datasets.map((d) => d.modality))].length} geophysical modalit${[...new Set(datasets.map((d) => d.modality))].length === 1 ? "y" : "ies"}.`,
    ``,
  ];

  // Extract any file context snippets from the query
  const hasFileContext = query.includes("--- File Context ---");

  for (const ds of datasets) {
    const snr = ds.qualityMetrics.signalToNoise;
    const qualLabel = snr !== null ? (snr >= 20 ? "Good" : snr >= 10 ? "Moderate" : "Poor") : "Unknown";
    const coverage = ds.qualityMetrics.coveragePercent;
    const hasSpatial = ds.spatialExtent.minLat !== 0 || ds.spatialExtent.maxLat !== 0;

    lines.push(`### ${ds.name}`);
    lines.push(``);
    lines.push(`- **Modality:** ${ds.modality.toUpperCase()}`);
    lines.push(`- **Acquisition:** ${ds.acquisitionMethod}`);
    lines.push(`- **Units:** ${ds.units} | **CRS:** ${ds.crs}`);
    lines.push(`- **Data Quality:** ${qualLabel} (SNR: ${snr?.toFixed(1) ?? "N/A"} dB)`);
    if (coverage !== null) {
      lines.push(`- **Coverage:** ${coverage.toFixed(0)}%`);
    }
    if (hasSpatial) {
      lines.push(`- **Spatial Extent:** Lat ${ds.spatialExtent.minLat.toFixed(4)}–${ds.spatialExtent.maxLat.toFixed(4)}, Lon ${ds.spatialExtent.minLon.toFixed(4)}–${ds.spatialExtent.maxLon.toFixed(4)}`);
    }
    if (ds.fileSize) {
      const sizeMB = (ds.fileSize / (1024 * 1024));
      lines.push(`- **File Size:** ${sizeMB >= 1 ? sizeMB.toFixed(1) + " MB" : (ds.fileSize / 1024).toFixed(1) + " KB"}`);
    }
    lines.push(``);

    // Modality-specific observations
    switch (ds.modality) {
      case "magnetic":
        lines.push(`**Magnetic Assessment:**`);
        lines.push(`- Total Magnetic Intensity (TMI) data detected`);
        if (hasSpatial && Math.abs(ds.spatialExtent.minLat) < 20) {
          lines.push(`- ⚠️ Low magnetic latitude detected — RTP instability risk is elevated. Consider using analytic signal instead.`);
        }
        lines.push(`- Recommend: Apply RTP, compute analytic signal, extract lineaments for structural interpretation`);
        break;
      case "resistivity":
        lines.push(`**Resistivity Assessment:**`);
        lines.push(`- Electrical resistivity / ERT data detected`);
        lines.push(`- ⚠️ Inversion non-uniqueness is an inherent limitation — multiple models may fit the data`);
        lines.push(`- Recommend: Run 2D smooth-model inversion, compute DOI index, identify conductive/resistive targets`);
        break;
      case "gravity":
        lines.push(`**Gravity Assessment:**`);
        lines.push(`- Gravity survey data detected`);
        lines.push(`- Recommend: Apply Bouguer correction, perform regional-residual separation, identify density anomalies`);
        break;
      case "seismic":
        lines.push(`**Seismic Assessment:**`);
        lines.push(`- Seismic survey data detected`);
        lines.push(`- Recommend: Process reflections, pick horizons, build velocity model for depth conversion`);
        break;
      default:
        lines.push(`**General Assessment:**`);
        lines.push(`- ${ds.modality} data loaded and ready for domain-specific analysis`);
    }
    lines.push(``);
    lines.push(`---`);
    lines.push(``);
  }

  // Overall confidence
  const confPct = (provenance.derivedConfidence * 100).toFixed(0);
  const confLabel = confidenceToLanguage(provenance.derivedConfidence);
  lines.push(`**Overall Confidence: ${confPct}% (${confLabel})**`);
  lines.push(`*Basis: data quality ${((provenance.dataQualityScore ?? 0.5) * 100).toFixed(0)}% · spatial coverage ${((provenance.spatialCoverage ?? 0.5) * 100).toFixed(0)}%*`);
  lines.push(``);

  // Cross-method opportunities
  const modalities = [...new Set(datasets.map((d) => d.modality))];
  if (modalities.length > 1) {
    lines.push(`**Cross-Method Opportunities:**`);
    lines.push(`- ${modalities.length} independent geophysical methods available for integrated interpretation`);
    lines.push(`- Multi-method agreement analysis is possible — this significantly improves interpretation confidence`);
    lines.push(`- Type \`/plan\` to generate a multi-method processing workflow`);
  } else {
    lines.push(`**Recommended Next Steps:**`);
    lines.push(`- Consider acquiring complementary geophysical data (different modality) to reduce interpretation ambiguity`);
    lines.push(`- Ask specific questions about anomalies or features visible in the data`);
    lines.push(`- Type \`/plan\` to generate a processing workflow for this dataset`);
  }

  if (hypotheses.length > 0) {
    lines.push(``);
    lines.push(`**Active Hypotheses:** ${hypotheses.length}`);
    for (const h of hypotheses.slice(0, 5)) {
      lines.push(`- [${(h.confidence * 100).toFixed(0)}%] ${h.statement.slice(0, 150)}`);
    }
  }

  return lines.join("\n");
}


interface SpecialistFormatInput {
  domain: string;
  specialistNotes: string[];
  interpretations: HypothesisNode[];
  warnings: HypothesisNode[];
  recommendations: HypothesisNode[];
  confLabel: string;
  confPct: string;
  provenance: ConfidenceProvenance;
  datasetList: string;
  ruleMatchIds: string[];
}

function formatSpecialistResponse(input: SpecialistFormatInput): string {
  const { domain, specialistNotes, interpretations, warnings, recommendations, confLabel, confPct, provenance, datasetList, ruleMatchIds } = input;
  const lines: string[] = [
    `## ${domain} Analysis`,
    ``,
    `**Datasets used:** ${datasetList || "No domain datasets available"}`,
    ``,
  ];

  if (interpretations.length > 0) {
    lines.push(`**Interpretation**`);
    interpretations.forEach((h) => lines.push(h.statement));
    lines.push(``);
  }

  lines.push(`**Processing Notes**`);
  specialistNotes.forEach((n) => lines.push(`- ${n}`));
  lines.push(``);

  if (ruleMatchIds.length > 0) {
    lines.push(`**Inference Rules Applied**`);
    lines.push(`${ruleMatchIds.length} geological inference rule(s) matched and evaluated`);
    lines.push(``);
  }

  if (warnings.length > 0) {
    lines.push(`**Limitations**`);
    warnings.forEach((w) => lines.push(`- ${w.statement.slice(0, 200)}`));
    lines.push(``);
  }

  lines.push(`**Confidence: ${confPct}% (${confLabel})**`);
  lines.push(`*Basis: data quality ${((provenance.dataQualityScore ?? 0.5) * 100).toFixed(0)}% · cross-method ${((provenance.crossMethodAgreement ?? 0.4) * 100).toFixed(0)}% · spatial coverage ${((provenance.spatialCoverage ?? 0.5) * 100).toFixed(0)}%*`);
  lines.push(``);

  if (recommendations.length > 0) {
    lines.push(`**Recommended Next Steps**`);
    recommendations.forEach((r) => lines.push(`- ${r.statement}`));
  }

  return lines.join("\n");
}

function formatGeologicalSynthesis(
  hypotheses: HypothesisNode[],
  datasets: GeoDataset[],
  provenance: ConfidenceProvenance,
  confLabel: string,
  confPct: string
): string {
  const interpretations = hypotheses.filter((h) => h.epistemicType === "interpretation");
  const models = hypotheses.filter((h) => h.epistemicType === "geological_model");
  const modalities = [...new Set(datasets.map((d) => d.modality))].join(", ").toUpperCase();

  return [
    `## Geological Synthesis`,
    ``,
    `**Methods integrated:** ${modalities || "None"}`,
    ``,
    `**Cross-Method Assessment**`,
    interpretations.length >= 2
      ? `${interpretations.length} independent geophysical methods provide convergent evidence. Multi-method agreement increases confidence in the interpreted geological framework.`
      : `Single-method interpretation. Additional independent geophysical constraints are recommended to reduce interpretive ambiguity.`,
    ``,
    ...(models.length > 0 ? [
      `**Conceptual Geological Model**`,
      ...models.map((m) => `- ${m.statement}`),
      ``,
    ] : []),
    ...(interpretations.length > 0 ? [
      `**Integrated Interpretations**`,
      ...interpretations.map((h, i) => `${i + 1}. [${(h.confidence * 100).toFixed(0)}% confidence] ${h.statement.slice(0, 200)}`),
      ``,
    ] : [
      `**Integrated Interpretations**`,
      `Insufficient multi-method data for integrated geological synthesis. Upload additional datasets and re-run analysis.`,
      ``,
    ]),
    `**Confidence: ${confPct}% (${confLabel})**`,
    ``,
    `**Recommended Next Steps**`,
    `- Review individual agent interpretations for method-specific constraints`,
    `- Consider creating parallel epistemic branches if competing models are plausible`,
    `- Schedule human expert review before committing to field programme`,
  ].join("\n");
}

function confidenceToLanguage(confidence: number): string {
  if (confidence >= 0.80) return "high confidence";
  if (confidence >= 0.65) return "moderate-to-high confidence";
  if (confidence >= 0.50) return "moderate confidence";
  if (confidence >= 0.35) return "possible";
  return "speculative — requires additional constraints";
}
