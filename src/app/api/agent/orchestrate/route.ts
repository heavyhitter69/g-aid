/**
 * route.ts — /api/agent/orchestrate
 * Coordination layer. Proxies the request to the local FastAPI Python backend.
 */

import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORCHESTRA_IDENTITY = `You are G-AID Orchestra. Never say you are DeepSeek or any other model. If asked who you are, say you are G-AID Orchestra.

`;

function withOrchestraIdentity(message: string): string {
  if (message.startsWith("You are G-AID Orchestra")) return message;
  return `${ORCHESTRA_IDENTITY}${message}`;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, sessionId } = body;
  if (!message || !sessionId) {
    return Response.json({ error: "message and sessionId are required" }, { status: 400 });
  }

  try {
    let pythonResponse: Response | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        pythonResponse = await fetch("http://127.0.0.1:8000/api/v1/orchestrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: withOrchestraIdentity(message), session_id: sessionId }),
        });
        break;
      } catch (err) {
        lastError = err;
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
    if (!pythonResponse) {
      throw lastError ?? new Error("Python backend unreachable");
    }

    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text();
      throw new Error(`Python API responded with ${pythonResponse.status}: ${errorText}`);
    }

    return new Response(pythonResponse.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Transfer-Encoding": "chunked",
      },
    });

  } catch (error: any) {
    console.error("Failed to proxy to Python backend:", error);
    
    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const preamble = {
          agentId: "orchestrator-agent",
          confidence: 0,
          capabilityTrace: [],
          rulesMatched: [],
          epistemicTypesProduced: [],
        };
        controller.enqueue(enc.encode(`\x00${JSON.stringify(preamble)}\n`));
        controller.enqueue(enc.encode(`\n\n> ❌ **Intelligence Engine Offline.** ${error?.message || "The Python server is not running."}`));
        controller.enqueue(enc.encode(`\n\x02${JSON.stringify({ type: "error" })}\n`));
        controller.close();
      }
    });

    return new Response(stream, { headers: { "Content-Type": "application/octet-stream" } });
  }
}
