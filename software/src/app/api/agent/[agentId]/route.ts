/**
 * route.ts — /api/agent/[agentId]
 * Specialist agent streaming endpoint.
 * Runs: symbolic rules → probabilistic update → domain synthesis.
 * Two-phase stream: \x00 JSON preamble | \x01 text tokens | \x02 epilogue JSON
 */

import type { NextRequest } from "next/server";
import { magneticKernel } from "@/lib/kernels/magnetic-kernel";
import { resistivityKernel } from "@/lib/kernels/resistivity-kernel";
import { gravityKernel } from "@/lib/kernels/gravity-kernel";
import { seismicKernel } from "@/lib/kernels/seismic-kernel";
import { geologicalKernel } from "@/lib/kernels/geological-kernel";
import { synthesizeResponse } from "@/lib/agent-prompts";
import type { ReasoningKernel } from "@/lib/kernels/kernel-base";
import type { AgentId, ScientificProjectSnapshot, StreamPreamble } from "@/types/scientific";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

const KERNEL_MAP: Record<string, ReasoningKernel> = {
  "magnetic-agent": magneticKernel,
  "resistivity-agent": resistivityKernel,
  "gravity-agent": gravityKernel,
  "seismic-agent": seismicKernel,
  "geological-agent": geologicalKernel,
};

interface AgentRequest {
  message: string;
  context: string;
  snapshot: ScientificProjectSnapshot;
  sessionId: string;
  capabilityIds: string[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
): Promise<Response> {
  const { agentId } = await params;

  let body: AgentRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, snapshot, sessionId } = body;
  const kernel = KERNEL_MAP[agentId];

  if (!kernel) {
    // Orchestrator or unknown agent — return generic coordination response
    return streamSimulatedResponse(agentId as AgentId, message, snapshot);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: string) => controller.enqueue(encoder.encode(data));

      try {
        // ── Stage 1: Run kernel (symbolic + probabilistic) ──────────────────
        const result = await kernel.reason(message, snapshot.datasets, snapshot);

        // ── Stage 2: Emit preamble ──────────────────────────────────────────
        const preamble: StreamPreamble = {
          type: "preamble",
          agentId: kernel.agentId,
          confidence: result.baseProvenance.derivedConfidence,
          confidenceProvenance: result.baseProvenance,
          toolsInvoked: [],
          capabilityTrace: body.capabilityIds,
          rulesMatched: result.ruleMatchIds,
          hypothesesUpdated: [],
          epistemicTypesProduced: [...new Set(result.hypotheses.map((h) => h.epistemicType))],
        };
        enqueue(`\x00${JSON.stringify(preamble)}\n`);

        await delay(80); // Simulate processing time

        // ── Stage 3: Stream interpretation text ─────────────────────────────
        const interpretationText = synthesizeResponse({
          agentId: kernel.agentId,
          query: message,
          hypotheses: result.hypotheses,
          datasets: snapshot.datasets,
          provenance: result.baseProvenance,
          ruleMatchIds: result.ruleMatchIds,
        });

        enqueue("\x01");
        const tokens = interpretationText.split(/(?<=\s)/); // Split preserving whitespace
        for (const token of tokens) {
          enqueue(token);
          await delay(token.includes("\n") ? 30 : 12);
        }

        // ── Stage 4: Epilogue with hypothesis events ────────────────────────
        const hypothesisEvents = result.hypotheses.map((h) => ({
          type: "HYPOTHESIS_CREATED" as const,
          payload: { hypothesis: h },
        }));

        enqueue(`\n\x02${JSON.stringify({
          type: "agent_complete",
          agentId: kernel.agentId,
          hypothesesProduced: result.hypotheses.length,
          ruleMatchCount: result.ruleMatchIds.length,
          confidence: result.baseProvenance.derivedConfidence,
          hypothesisEvents,
          sessionId,
        })}\n`);

        controller.close();
      } catch (err) {
        enqueue(`\x01\n\n*Agent encountered an error during processing: ${err instanceof Error ? err.message : "Unknown error"}*`);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
    },
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function streamSimulatedResponse(agentId: AgentId, message: string, snapshot: ScientificProjectSnapshot): Response {
  const text = synthesizeResponse({
    agentId,
    query: message,
    hypotheses: snapshot.hypothesisGraph.filter((h) => h.status === "active"),
    datasets: snapshot.datasets,
    provenance: {
      dataQualityScore: 0.5,
      crossMethodAgreement: 0.5,
      modelConvergence: null,
      geologicalConsistency: null,
      spatialCoverage: 0.5,
      spatialCompatibility: null,
      linespacing: null,
      derivedConfidence: 0.5,
      computedAt: new Date().toISOString(),
      computedByKernel: "orchestrator",
    },
    ruleMatchIds: [],
  });

  return new Response(`\x01${text}`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
