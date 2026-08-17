/**
 * route.ts — /api/agent/orchestrate
 * Plan-first agent loop: grounded workspace read-back, revise until aligned, then execute.
 */

import type { NextRequest } from "next/server";
import { PENDING_APPROVAL } from "./implementation-plan";
import { buildPlanningPrompt, upsertAgentPlan } from "./agent-plan";
import { patchStreamEpilogue } from "./stream-epilogue";
import { streamPlanDecision } from "../execute-plan";
import {
  detectAnalysisIntent,
  isProceedPhrase,
  splitUserAndContext,
  type WorkspaceIndex,
} from "@/lib/workspace-index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ORCHESTRA_IDENTITY = `You are G-AID Orchestra. Never say you are DeepSeek or any other model. If asked who you are, say you are G-AID Orchestra.

`;

function withOrchestraIdentity(message: string): string {
  if (message.startsWith("You are G-AID Orchestra")) return message;
  return `${ORCHESTRA_IDENTITY}${message}`;
}

const encoder = new TextEncoder();

function streamAgentResponse(
  text: string,
  epilogue: Record<string, unknown>,
  preamble: Record<string, unknown> = {}
): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `\x00${JSON.stringify({
            agentId: "orchestrator-agent",
            confidence: 0.9,
            showConfidence: true,
            capabilityTrace: ["G-AID Orchestra"],
            ...preamble,
          })}\n`
        )
      );
      controller.enqueue(encoder.encode(text));
      controller.enqueue(encoder.encode(`\n\x02${JSON.stringify(epilogue)}\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/octet-stream" },
  });
}

async function proxyPython(
  prompt: string,
  sessionId: string,
  epiloguePatch?: Record<string, unknown>,
  onComplete?: (raw: string) => void
): Promise<Response> {
  let pythonResponse: Response | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      pythonResponse = await fetch("http://127.0.0.1:8000/api/v1/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: withOrchestraIdentity(prompt), session_id: sessionId }),
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
  if (!pythonResponse.body) {
    throw new Error("Python API returned an empty body");
  }
  const body = epiloguePatch
    ? patchStreamEpilogue(pythonResponse.body, epiloguePatch, onComplete)
    : pythonResponse.body;
  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Transfer-Encoding": "chunked",
    },
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, sessionId, workspaceRoot, workspaceIndex, projectName, history } = body as {
    message?: string;
    sessionId?: string;
    workspaceRoot?: string;
    workspaceIndex?: WorkspaceIndex | null;
    projectName?: string;
    history?: { sender: string; text: string }[];
  };
  if (!message || !sessionId) {
    return Response.json({ error: "message and sessionId are required" }, { status: 400 });
  }

  const { userText } = splitUserAndContext(message);
  const pending = PENDING_APPROVAL[sessionId];
  const intent = detectAnalysisIntent(userText);
  const root = typeof workspaceRoot === "string" ? workspaceRoot.trim() : "";

  if (pending && isProceedPhrase(userText)) {
    return new Response(streamPlanDecision(sessionId, "approve"), {
      headers: { "Content-Type": "application/octet-stream" },
    });
  }

  const planTurn = Boolean(intent || pending);
  if (planTurn && !root) {
    return streamAgentResponse(
      "Open the survey folder first (**File → Open Folder**). Open the main survey (for example TEMA SURVEY), not a single day, so I can see DAY 1, DAY 2, … and write results to `G-AID Output` under that folder.",
      { type: "synthesis_complete", awaitingApproval: false }
    );
  }

  try {
    if (planTurn && root) {
      const plan = upsertAgentPlan({
        sessionId,
        userText,
        workspaceRoot: root,
        workspaceIndex: workspaceIndex ?? null,
        projectName: projectName || "",
      });
      const prompt = buildPlanningPrompt({
        userText,
        history: Array.isArray(history) ? history.slice(-8) : [],
        plan,
      });
      return await proxyPython(
        prompt,
        sessionId,
        {
          type: "synthesis_complete",
          awaitingApproval: true,
          taskFolder: plan.taskFolder,
          implementationPlanContent: plan.plan,
        }
      );
    }

    return await proxyPython(message, sessionId);
  } catch (error: unknown) {
    console.error("Failed to proxy to Python backend:", error);
    const err = error as { message?: string };
    const stream = new ReadableStream({
      start(controller) {
        const preamble = {
          agentId: "orchestrator-agent",
          confidence: 0,
          capabilityTrace: [],
          rulesMatched: [],
          epistemicTypesProduced: [],
        };
        controller.enqueue(encoder.encode(`\x00${JSON.stringify(preamble)}\n`));
        controller.enqueue(encoder.encode(`\n\n> ❌ **Intelligence Engine Offline.** ${err?.message || "The Python server is not running."}`));
        controller.enqueue(encoder.encode(`\n\x02${JSON.stringify({ type: "error" })}\n`));
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/octet-stream" } });
  }
}
