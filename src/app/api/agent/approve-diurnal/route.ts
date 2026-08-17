import type { NextRequest } from "next/server";
import { streamPlanDecision } from "../execute-plan";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ApproveRequest {
  sessionId: string;
  decision: "approve" | "reject";
  comment?: string;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: ApproveRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sessionId, decision } = body;
  if (!sessionId || !decision) {
    return Response.json({ error: "sessionId and decision are required" }, { status: 400 });
  }

  return new Response(streamPlanDecision(sessionId, decision), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Transfer-Encoding": "chunked",
      "X-Session-Id": sessionId,
    },
  });
}
