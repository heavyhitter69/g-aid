/**
 * route.ts — /api/agent/orchestrate
 * Coordination layer. Resolves capabilities, selects kernel, runs reasoning + synthesis.
 * All inline — no sub-fetch to agent routes. Clean 3-phase stream protocol:
 *   \x00{json}\n  — preamble
 *   text tokens    — streamed content (NO \x01 prefix per token, text mode entered once)
 *   \n\x02{json}\n — epilogue
 *
 * The client receives exactly one clean stream.
 */

import type { NextRequest } from "next/server";
import { resolveFromIntent, selectMinimalAgents, resolveFromState } from "@/lib/capability-graph";
import { buildAgentContext, formatContextForPrompt } from "@/lib/context-engine";
import { compileDAG } from "@/lib/workflow-planner";
import { synthesizeResponse } from "@/lib/agent-prompts";
import { magneticKernel } from "@/lib/kernels/magnetic-kernel";
import { resistivityKernel } from "@/lib/kernels/resistivity-kernel";
import { gravityKernel } from "@/lib/kernels/gravity-kernel";
import { seismicKernel } from "@/lib/kernels/seismic-kernel";
import { geologicalKernel } from "@/lib/kernels/geological-kernel";
import type { ReasoningKernel } from "@/lib/kernels/kernel-base";
import type {
  ScientificProjectSnapshot,
  AgentId,
  StreamPreamble,
  ConfidenceProvenance,
} from "@/types/scientific";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─── Kernel registry ──────────────────────────────────────────────────────────

const KERNEL_MAP: Record<string, ReasoningKernel> = {
  "magnetic-agent":    magneticKernel,
  "resistivity-agent": resistivityKernel,
  "gravity-agent":     gravityKernel,
  "seismic-agent":     seismicKernel,
  "geological-agent":  geologicalKernel,
};

// ─── Request shape ────────────────────────────────────────────────────────────

interface OrchestrateRequest {
  message: string;
  sessionId: string;
  mode?: "interpret" | "plan" | "status";
  snapshotData?: ScientificProjectSnapshot;
}

// ─── Stream helpers ───────────────────────────────────────────────────────────

const encoder = new TextEncoder();
const enc = (s: string) => encoder.encode(s);
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<Response> {
  let body: OrchestrateRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, sessionId, mode = "interpret", snapshotData } = body;
  if (!message || !sessionId) {
    return Response.json({ error: "message and sessionId are required" }, { status: 400 });
  }

  const snapshot: ScientificProjectSnapshot = snapshotData ?? makeEmptySnapshot(sessionId);

  // ── Capability + agent resolution ─────────────────────────────────────────
  const capabilities = resolveFromIntent(message, snapshot);
  const agentIds     = selectMinimalAgents(capabilities, snapshot);
  const proactiveOpps = resolveFromState(snapshot);

  // Primary agent: prefer specialist over geological (geological synthesises last)
  const primaryAgentId: AgentId =
    agentIds.find((a) => a !== "geological-agent") ??
    agentIds[0] ??
    "orchestrator-agent";

  const kernel = KERNEL_MAP[primaryAgentId] ?? null;

  // ── Context ───────────────────────────────────────────────────────────────
  const agentContext = buildAgentContext(snapshot, message, primaryAgentId);

  // ─────────────────────────────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => controller.enqueue(enc(s));

      try {
        // ── Plan mode ──────────────────────────────────────────────────────
        if (mode === "plan" && capabilities.length > 0) {
          const { dag, markdown } = compileDAG(capabilities, snapshot.datasets, snapshot);

          const planPreamble: StreamPreamble = buildPreamble(
            primaryAgentId, 0.65, capabilities, [], []
          );
          enqueue(`\x00${JSON.stringify(planPreamble)}\n`);
          await delay(80);

          // Stream plan markdown token by token
          const tokens = markdown.split(" ");
          for (const token of tokens) {
            enqueue(token + " ");
            await delay(14);
          }

          enqueue(`\n\n---\n\n*Workflow compiled from ${capabilities.length} capability(ies).*\n`);
          enqueue(`\n\x02${JSON.stringify({
            type: "plan_complete",
            dag,
            opportunitiesDetected: proactiveOpps.length,
          })}\n`);

          controller.close();
          return;
        }

        // ── Interpret mode: run kernel if available ────────────────────────
        let ruleMatchIds: string[] = [];
        let hypothesisEvents: object[] = [];
        let derivedConfidence = 0.55;
        let kernelProvenance: ConfidenceProvenance | null = null;

        if (kernel) {
          try {
            const result = await kernel.reason(message, snapshot.datasets, snapshot);
            ruleMatchIds       = result.ruleMatchIds;
            derivedConfidence  = result.baseProvenance.derivedConfidence;
            kernelProvenance   = result.baseProvenance;
            hypothesisEvents   = result.hypotheses.map((h) => ({
              type: "HYPOTHESIS_CREATED",
              payload: { hypothesis: h },
            }));
          } catch {
            // Kernel error — fall through to base provenance
          }
        }

        // ── Phase 1: Preamble ──────────────────────────────────────────────
        const provenance: ConfidenceProvenance = kernelProvenance ?? {
          dataQualityScore:       snapshot.datasets.length > 0 ? 0.6 : null,
          crossMethodAgreement:   agentIds.length > 1 ? 0.65 : null,
          modelConvergence:       null,
          geologicalConsistency:  null,
          spatialCoverage:        snapshot.datasets.length > 0 ? 0.55 : null,
          spatialCompatibility:   null,
          linespacing:            null,
          derivedConfidence,
          computedAt:             new Date().toISOString(),
          computedByKernel:       kernel?.agentId ?? "orchestrator",
        };

        const preamble: StreamPreamble = buildPreamble(
          primaryAgentId,
          provenance.derivedConfidence,
          capabilities,
          ruleMatchIds,
          [],
        );
        preamble.confidenceProvenance = provenance;
        enqueue(`\x00${JSON.stringify(preamble)}\n`);

        await delay(60);

        // ── Phase 2: Response text (no \x01 per token — enter text mode once) ─
        const responseText = synthesizeResponse({
          agentId:      primaryAgentId,
          query:        message,
          hypotheses:   snapshot.hypothesisGraph.filter((h) => h.status === "active"),
          datasets:     snapshot.datasets,
          provenance,
          ruleMatchIds,
        });

        // Append proactive opportunity note if any were found
        const fullText = proactiveOpps.length > 0
          ? responseText + `\n\n---\n\n**💡 ${proactiveOpps.length} proactive opportunit${proactiveOpps.length === 1 ? "y" : "ies"} detected.** Use the chips in the panel to activate them.`
          : responseText;

        // Stream tokens with human-readable cadence
        const tokens = fullText.split(/(?<= )/);  // split keeping trailing space
        for (const token of tokens) {
          enqueue(token);
          // Vary delay: longer after newlines (paragraph beats), shorter for mid-sentence
          const hasNewline = token.includes("\n");
          await delay(hasNewline ? 25 : 10);
        }

        // ── Phase 3: Epilogue ──────────────────────────────────────────────
        const thought = generateThought(message, primaryAgentId, capabilities, ruleMatchIds, snapshot.datasets.length);
        enqueue(`\n\x02${JSON.stringify({
          type:                   "agent_complete",
          agentId:                primaryAgentId,
          thought,
          hypothesisEvents,
          opportunitiesDetected:  proactiveOpps.length,
          agentsDispatched:       agentIds,
          capabilitiesResolved:   capabilities.map((c) => c.id),
          contextTokens:          agentContext.tokenEstimate,
          sessionId,
        })}\n`);

        controller.close();
      } catch (err) {
        enqueue(`\n*Internal error: ${err instanceof Error ? err.message : "unknown"}*`);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Session-Id": sessionId,
    },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPreamble(
  agentId: AgentId,
  confidence: number,
  capabilities: ReturnType<typeof resolveFromIntent>,
  ruleMatchIds: string[],
  hypothesesUpdated: string[],
): StreamPreamble {
  return {
    type: "preamble",
    agentId,
    confidence,
    confidenceProvenance: {
      dataQualityScore: null, crossMethodAgreement: null, modelConvergence: null,
      geologicalConsistency: null, spatialCoverage: null, spatialCompatibility: null,
      linespacing: null, derivedConfidence: confidence,
      computedAt: new Date().toISOString(),
      computedByKernel: "orchestrator",
    },
    toolsInvoked:            capabilities.flatMap((c) => c.requiredTools),
    capabilityTrace:         capabilities.map((c) => c.id),
    rulesMatched:            ruleMatchIds,
    hypothesesUpdated,
    epistemicTypesProduced:  [],
  };
}

// ─── Thought generator ────────────────────────────────────────────────────────
// Produces a brief internal reasoning trace for the ThoughtDisclosure UI.

function generateThought(
  query: string,
  agentId: AgentId,
  capabilities: ReturnType<typeof resolveFromIntent>,
  ruleMatchIds: string[],
  datasetCount: number,
): string {
  const lower = query.toLowerCase();
  const isGreeting = /^(hi|hello|hey|howdy|greetings|what's up|sup|yo)\b/.test(lower);
  const isHelp     = /\b(help|what can you do|capabilities|features)\b/.test(lower);
  const isPlan     = lower.includes("/plan");

  if (isGreeting) {
    return `The user sent a greeting. No geophysical keywords detected — no domain kernel required. Routing to the orchestrator's conversational onboarding template.`;
  }
  if (isHelp) {
    return `The user is asking about system capabilities. Returning a structured capabilities overview without triggering any specialist kernels.`;
  }
  if (isPlan) {
    const capList = capabilities.map((c) => c.id).join(", ") || "none matched";
    return `Plan mode requested. Capability graph resolved: [${capList}]. Compiling DAG with ${capabilities.length} node(s). ${datasetCount} dataset(s) available to constrain tool inputs.`;
  }

  const parts: string[] = [];

  if (capabilities.length > 0) {
    parts.push(`Intent resolved to ${capabilities.length} capability(ies): ${capabilities.map((c) => c.id).join(", ")}.`);
  } else {
    parts.push(`No specific geophysical capabilities matched. Falling back to orchestrator synthesis.`);
  }

  const agentLabel: Record<string, string> = {
    "orchestrator-agent": "Orchestrator (no specialist required)",
    "magnetic-agent":     "Magnetic specialist kernel",
    "resistivity-agent":  "Resistivity/ERT specialist kernel",
    "gravity-agent":      "Gravity specialist kernel",
    "seismic-agent":      "Seismic specialist kernel",
    "geological-agent":   "Geological synthesis kernel",
  };
  parts.push(`Selected agent: ${agentLabel[agentId] ?? agentId}.`);

  if (ruleMatchIds.length > 0) {
    parts.push(`${ruleMatchIds.length} inference rule(s) fired: ${ruleMatchIds.slice(0, 3).join(", ")}${ruleMatchIds.length > 3 ? "…" : ""}.`);
  } else {
    parts.push(`No domain inference rules matched — using base synthesis template.`);
  }

  if (datasetCount === 0) {
    parts.push(`No datasets loaded; confidence will be low until data is ingested.`);
  } else {
    parts.push(`${datasetCount} dataset(s) available to inform interpretation.`);
  }

  return parts.join(" ");
}

function makeEmptySnapshot(projectId: string): ScientificProjectSnapshot {
  return {
    projectId,
    snapshotSequenceNumber: 0,
    datasets: [],
    hypothesisGraph: [],
    epistemicBranches: [],
    executionDAG: null,
    toolExecutions: [],
    opportunities: [],
    interpretations: [],
    spatialIndexSummary: {
      registeredDatasets: 0,
      overlapPairs: [],
      crsSet: [],
      dominantCRS: null,
      totalCoverageAreaKm2: 0,
      compatibilityIssues: [],
    },
    lastModified: new Date().toISOString(),
  };
}
