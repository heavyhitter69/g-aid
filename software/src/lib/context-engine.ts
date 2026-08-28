/**
 * context-engine.ts
 * 5-stage context compression pipeline.
 * Raw EventLog → Projected Snapshot → Relevance Extraction → Causal Compression → Agent Prompt.
 * Prevents LLM context window collapse as scientific state grows.
 */

import type {
  AgentId,
  AgentContext,
  ScientificProjectSnapshot,
  HypothesisNode,
  ScientificEvent,
} from "@/types/scientific";

const MAX_TOKEN_BUDGET = 3500; // Conservative budget leaving room for instructions + response
const MAX_HYPOTHESES = 5;
const MAX_CAUSAL_EVENTS = 10;

// ─── Stage 1: Relevance Extraction ───────────────────────────────────────────

function scoreHypothesisSalience(hypothesis: HypothesisNode, query: string): number {
  const lower = query.toLowerCase();
  const statement = hypothesis.statement.toLowerCase();
  let score = 0;

  // Recency bonus
  const ageMs = Date.now() - new Date(hypothesis.createdAt).getTime();
  score += Math.max(0, 1 - ageMs / (7 * 24 * 60 * 60 * 1000)); // decay over 7 days

  // Keyword overlap
  const queryWords = lower.split(/\s+/).filter((w) => w.length > 3);
  const statementWords = statement.split(/\s+/);
  const overlap = queryWords.filter((w) => statementWords.some((sw) => sw.includes(w))).length;
  score += overlap * 0.2;

  // Confidence — higher confidence = more salient
  score += hypothesis.confidence * 0.3;

  // Active status
  if (hypothesis.status === "active") score += 0.3;

  return score;
}

// ─── Stage 2: Causal Chain Compression ───────────────────────────────────────

function compressCausalChain(events: ScientificEvent[], maxEvents: number): ScientificEvent[] {
  if (events.length <= maxEvents) return events;

  // Keep causally-significant events: DATASET_INGESTED, HYPOTHESIS_CREATED, DAG_APPROVED, INTERPRETATION_ADDED
  const highPriority = ["DATASET_INGESTED", "HYPOTHESIS_CREATED", "DAG_APPROVED", "INTERPRETATION_ADDED", "OPPORTUNITY_DETECTED", "HUMAN_APPROVED"] as const;
  const priorityEvents = events.filter((e) => (highPriority as readonly string[]).includes(e.type));
  const recentEvents = events.slice(-Math.floor(maxEvents / 2));

  const combined = [...new Map([...priorityEvents, ...recentEvents].map((e) => [e.id, e])).values()];
  return combined.sort((a, b) => a.sequenceNumber - b.sequenceNumber).slice(-maxEvents);
}

// ─── Stage 3: Format for Agent ────────────────────────────────────────────────

function formatDatasetSummary(snapshot: ScientificProjectSnapshot): string {
  if (snapshot.datasets.length === 0) return "No datasets loaded.";
  return snapshot.datasets.map((d) =>
    `- ${d.name} [${d.modality.toUpperCase()}] | CRS: ${d.crs} | Quality: SNR=${d.qualityMetrics.signalToNoise?.toFixed(1) ?? "unknown"} dB`
  ).join("\n");
}

function formatHypothesisSummary(hypotheses: HypothesisNode[], query: string): string {
  if (hypotheses.length === 0) return "No active hypotheses.";
  const ranked = [...hypotheses]
    .sort((a, b) => scoreHypothesisSalience(b, query) - scoreHypothesisSalience(a, query))
    .slice(0, MAX_HYPOTHESES);
  return ranked.map((h) =>
    `[${h.epistemicType.toUpperCase()}] ${(h.confidence * 100).toFixed(0)}% — ${h.statement.slice(0, 120)}${h.statement.length > 120 ? "…" : ""}`
  ).join("\n");
}

function formatCausalChain(events: ScientificEvent[]): string {
  if (events.length === 0) return "No prior events.";
  return events.map((e) =>
    `[${e.type}] by ${e.actorId} at ${e.timestamp.slice(0, 16)}`
  ).join("\n");
}

function formatOpportunities(snapshot: ScientificProjectSnapshot): string {
  const active = snapshot.opportunities.filter((o) => !o.dismissed);
  if (active.length === 0) return "No active opportunities.";
  return active.slice(0, 3).map((o) => `- ${o.title}: ${o.description}`).join("\n");
}

function formatSpatialSummary(snapshot: ScientificProjectSnapshot): string {
  const { spatialIndexSummary } = snapshot;
  const lines = [
    `${spatialIndexSummary.registeredDatasets} datasets registered`,
    spatialIndexSummary.dominantCRS ? `Dominant CRS: ${spatialIndexSummary.dominantCRS}` : "",
    spatialIndexSummary.overlapPairs.length > 0
      ? `${spatialIndexSummary.overlapPairs.length} spatial overlap pair(s) detected`
      : "No spatial overlaps detected",
  ].filter(Boolean);
  return lines.join(" | ");
}

// ─── Token budget estimator (rough character-based) ───────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4); // rough: 4 chars ≈ 1 token
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

export function buildAgentContext(
  snapshot: ScientificProjectSnapshot,
  query: string,
  agentId: AgentId,
  recentEvents: ScientificEvent[] = []
): AgentContext {
  // Stage 1: Extract relevant slices
  const activeHypotheses = snapshot.hypothesisGraph.filter((h) => h.status === "active");

  // Stage 2: Compress causal chain
  const compressedEvents = compressCausalChain(recentEvents, MAX_CAUSAL_EVENTS);

  // Stage 3: Format each section
  const datasetSummary = formatDatasetSummary(snapshot);
  const relevantHypotheses = formatHypothesisSummary(activeHypotheses, query);
  const recentCausalChain = formatCausalChain(compressedEvents);
  const activeOpportunities = formatOpportunities(snapshot);
  const spatialSummary = formatSpatialSummary(snapshot);
  const matchedRules = ""; // populated by rule engine after evaluation

  const totalText = [datasetSummary, relevantHypotheses, recentCausalChain, activeOpportunities, spatialSummary].join("\n");
  const tokenEstimate = estimateTokens(totalText);

  return {
    agentId,
    tokenEstimate,
    datasetSummary,
    relevantHypotheses,
    recentCausalChain,
    activeOpportunities,
    spatialSummary,
    matchedRules,
    generatedAt: new Date().toISOString(),
  };
}

/** Format AgentContext into a system prompt injection string */
export function formatContextForPrompt(ctx: AgentContext): string {
  return [
    `## Scientific State Context`,
    ``,
    `### Available Datasets`,
    ctx.datasetSummary,
    ``,
    `### Active Hypotheses (ranked by salience)`,
    ctx.relevantHypotheses,
    ``,
    `### Recent Event Chain`,
    ctx.recentCausalChain,
    ``,
    `### Proactive Opportunities`,
    ctx.activeOpportunities,
    ``,
    `### Spatial Context`,
    ctx.spatialSummary,
    ``,
    `*Context generated: ${ctx.generatedAt} | Estimated tokens: ${ctx.tokenEstimate}*`,
  ].join("\n");
}
