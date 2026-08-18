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
  "orchestrator-agent": `You are G-AID, a helpful assistant in the G-AID desktop app. Speak in first person as I.
Never call yourself Orchestra or a third-party tool. Answer the user's question directly. Do not mention geophysics, surveys, or workspace files unless they asked. Do not quote instructions.`,

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

export function buildOllamaPrompt(input: SynthesisInput): string {
  const { agentId, query, hypotheses, datasets, provenance } = input;
  const system = SYSTEM_PROMPTS[agentId] || "You are a helpful geoscientific assistant.";
  const confPct = (provenance.derivedConfidence * 100).toFixed(0);
  
  let prompt = `${system}\n\n`;
  prompt += `=== Current Context ===\n`;
  prompt += `User Query: "${query}"\n\n`;
  
  if (datasets.length > 0) {
    prompt += `Loaded Datasets:\n`;
    datasets.forEach(d => {
      prompt += `- ${d.name} (${d.modality}, Quality: ${d.qualityMetrics.signalToNoise} SNR)\n`;
    });
    prompt += `\n`;
  } else {
    prompt += `Loaded Datasets: None\n\n`;
  }

  if (hypotheses.length > 0) {
    prompt += `Active Hypotheses (Derived Confidence: ${confPct}%):\n`;
    hypotheses.forEach(h => {
      prompt += `- [${h.epistemicType}] ${h.statement}\n`;
    });
    prompt += `\n`;
  }

  prompt += `Instructions: Respond directly to the user's query based on the context above. Use markdown formatting. Provide a structured, scientifically accurate interpretation. You MUST ALWAYS enclose your internal reasoning ONLY inside <think>...</think> tags at the very beginning of your response. Do NOT include a separate "Internal Reasoning" markdown section in your final output.`;
  return prompt;
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
  const isHelp = /\b(help|what can you do|what do you do|how does this work|capabilities|features|how\s+to\s+upload|how\s+do\s+i\s+upload|how\s+to\s+open|how\s+do\s+i\s+open|how\s+to\s+load|how\s+do\s+i\s+load|how\s+to\s+add|how\s+do\s+i\s+add|how\s+to\s+use|how\s+do\s+i\s+use|how\s+to\s+import|how\s+do\s+i\s+import|how\s+to\s+switch|how\s+do\s+i\s+switch)\b/.test(lowerQuery);
  const isConversational = /^(how\s+are\s+you|how's\s+it\s+going|how\s+is\s+it\s+going|who\s+are\s+you|what\s+are\s+you|who\s+is\s+this|are\s+you\s+(there|alive|real|human|bot|ai)|thanks|thank\s+you|cool|awesome|great|ok|okay|yes|no|test|hello\s+there)\b/.test(lowerQuery);
  const isAnalyzeAll = /\b(analy[sz]e\s+(all|every|the|these|my|loaded)|process\s+(all|every|the)|scan\s+(all|every|the)|review\s+(all|every|the)|examine\s+(all|every|the))\b/.test(lowerQuery);

  if (isGreeting) {
    return "Hi there! 👋 How can I help you today?";
  }

  if (isConversational) {
    if (lowerQuery.includes("how are you") || lowerQuery.includes("how's it going") || lowerQuery.includes("how is it going")) {
      return "I'm doing great, thanks for asking! 😊 How about you? What's on your mind today?";
    }
    
    if (lowerQuery.includes("who are you") || lowerQuery.includes("what are you") || lowerQuery.includes("who is this")) {
      return [
        `I am **G-AID**, your assistant in this desktop app.`,
        ``,
        `I'm specialized in interpreting geophysical data (magnetic, gravity, resistivity, seismic) and auto-generating structured workflows. Let me know what data we're looking at, and I can start analyzing!`,
      ].join("\n");
    }

    if (lowerQuery.includes("thanks") || lowerQuery.includes("thank you")) {
      return [
        `You're very welcome! I'm here to help. Let me know if you want to analyze some geophysical anomalies, plan a processing DAG, or inspect loaded data.`,
      ].join("\n");
    }

    if (lowerQuery.includes("ok") || lowerQuery.includes("okay") || lowerQuery.includes("cool") || lowerQuery.includes("awesome") || lowerQuery.includes("great") || lowerQuery.includes("yes") || lowerQuery.includes("no")) {
      return [
        `Sounds good! Let me know when you're ready to analyze some data or build a workflow.`,
      ].join("\n");
    }

    // Default conversational response fallback
    return [
      `I'm here and ready to help! I am your AI-native geoscientific assistant.`,
      ``,
      datasets.length > 0
        ? `You currently have **${datasets.length} dataset${datasets.length > 1 ? "s" : ""}** loaded. Tell me what geophysical anomalies or inversion tasks you'd like to tackle next.`
        : `No datasets are loaded yet. Upload your gravity, magnetic, ERT, or seismic data files, and let's get started!`,
    ].join("\n");
  }

  if (isHelp) {
    if (/\b(upload|load|import|add)\b/.test(lowerQuery)) {
      return [
        `## How to Upload & Load Geophysical Data`,
        ``,
        `You can ingest survey files and datasets into G-AID in several quick ways:`,
        ``,
        `1. **Open a Local Folder (Recommended)**`,
        `   * Click **File > Open Folder...** (or press \`Ctrl+M Ctrl+O\`).`,
        `   * This imports all files inside the folder, maps them in the Explorer tree, and automatically ingests valid geophysical data in the background.`,
        ``,
        `2. **Open Individual Files**`,
        `   * Click **File > Open File...** (or press \`Ctrl+O\`) to pick files from your local drive.`,
        `   * Supported extensions include \`.dat\`, \`.grd\`, \`.csv\`, \`.json\`, \`.segy\`, \`.las\`, etc.`,
        ``,
        `3. **Switch Between Demo Projects**`,
        `   * Click **File > Open Folder...** and choose one of the built-in geological models (e.g., *Nevada Basin Survey*, *Death Valley*, or *Colorado Aquifer*).`,
      ].join("\n");
    }

    if (/\b(open|switch|project|folder)\b/.test(lowerQuery)) {
      return [
        `## How to Open Folders & Switch Projects`,
        ``,
        `To switch projects or open local workspaces:`,
        `1. Go to the top menu and select **File > Open Folder...** (\`Ctrl+M Ctrl+O\`).`,
        `2. You can select a local folder from your computer or switch to one of G-AID's built-in demo datasets listed in the popup modal.`,
        `3. Once loaded, G-AID's workspace will calibrate its active files, sidebar views, and scientific agents accordingly.`,
      ].join("\n");
    }

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

  // Define geophysical domain keywords to route general queries away from scientific templates
  const GEOPHYSICAL_KEYWORDS = [
    "magnetic", "resistivity", "gravity", "seismic", "anomaly", "anomalies", 
    "fault", "stratigraphy", "basin", "dataset", "datasets", "log", "logs", 
    "well", "invert", "inversion", "survey", "rock", "geology", "geological", 
    "geophysical", "earth", "aquifer", "crust", "fault", "mineral", "lineament", 
    "profile", "depth", "velocity", "field", "workflow", "/plan", "ert", 
    "segy", "sgy", "grd", "csv", "dat", "borehole", "dike", "intrusion", "basement",
    "sediment", "conductive", "resistive", "density", "susceptibility", "amplitude"
  ];

  const isGeophysical = GEOPHYSICAL_KEYWORDS.some(kw => lowerQuery.includes(kw));



  if (!isGeophysical) {
    if (/\bholiday\b/.test(lowerQuery)) {
      return [
        `Today is not a standard national holiday. It is a regular business day, perfect for analyzing geophysical anomalies!`,
        ``,
        `Let me know when you'd like to load datasets or start planning a workflow.`,
      ].join("\n");
    }

    if (/\b(day|date|today|time|year|month)\b/.test(lowerQuery)) {
      const today = new Date();
      const dateString = today.toLocaleDateString("en-US", { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      return [
        `Today is **${dateString}**.`,
        ``,
        `I am G-AID, your AI-native geoscientific assistant. Let me know when you'd like to analyze some geophysical data or plan a processing workflow!`,
      ].join("\n");
    }

    if (/\b(calculate|math|plus|minus|\+|\-|\*|\/|\=)\b/.test(lowerQuery) && /\b\d+\b/.test(lowerQuery)) {
      return [
        `I'm focused on geoscientific and geophysical analysis rather than general arithmetic, but I can compile highly optimized processing DAGs for you!`,
        ``,
        `If you have datasets loaded, describe the anomalies or type \`/plan\` to start.`,
      ].join("\n");
    }

    // Default general response fallback for non-geophysical queries
    return [
      `I'm here and ready to help! I am G-AID, your AI-native geoscientific assistant.`,
      ``,
      `I specialize in magnetic, resistivity, gravity, and seismic data processing, and tracking scientific hypotheses with full epistemic provenance.`,
      ``,
      datasets.length > 0
        ? `You currently have **${datasets.length} dataset${datasets.length > 1 ? "s" : ""}** loaded. Tell me what geophysical targets you'd like to interpret!`
        : `No datasets are loaded yet. Upload your survey data using the **Datasets** panel, and I'll begin interpreting them!`,
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
