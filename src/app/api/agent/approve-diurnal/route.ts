import type { NextRequest } from "next/server";
import { streamPlanDecision } from "../execute-plan";
import { syncPendingFromEditor } from "../orchestrate/agent-plan";
import { getPendingPlan } from "../orchestrate/implementation-plan";
import { validatePlan } from "@/lib/plan-spec";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const encoder = new TextEncoder();

function streamMessage(text: string, epilogue: Record<string, unknown>): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`\x00${JSON.stringify({ agentId: "orchestrator-agent", confidence: 0, showConfidence: false })}\n`));
      controller.enqueue(encoder.encode(text));
      controller.enqueue(encoder.encode(`\n\x02${JSON.stringify(epilogue)}\n`));
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/octet-stream" } });
}

interface ApproveRequest {
  sessionId: string;
  decision: "approve" | "reject";
  comment?: string;
  implementationPlanContent?: string;
  planRev?: number;
  workspaceRoot?: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: ApproveRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionId, decision, implementationPlanContent, workspaceRoot } = body;
  if (!sessionId || !decision) {
    return Response.json({ error: "sessionId and decision are required" }, { status: 400 });
  }

  const root = typeof workspaceRoot === "string" ? workspaceRoot.trim() : "";
  if (decision === "approve") {
    const pending = syncPendingFromEditor(sessionId, implementationPlanContent) || getPendingPlan(sessionId, root);
    if (pending) {
      const check = validatePlan(pending);
      if (!check.ok) {
        return streamMessage(
          `I can't start yet. ${check.blockers.map((issue) => issue.message).join(" ")} Edit the plan or tell me what to change.`,
          {
            type: "synthesis_complete",
            awaitingApproval: true,
            taskFolder: pending.taskFolder,
            implementationPlanContent: pending.plan,
            planRev: pending.rev,
          }
        );
      }
    }
  }

  return new Response(streamPlanDecision(sessionId, decision, root), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Transfer-Encoding": "chunked",
      "X-Session-Id": sessionId,
    },
  });
}
