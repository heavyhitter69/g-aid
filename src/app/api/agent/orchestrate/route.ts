/**
 * route.ts — /api/agent/orchestrate
 * Plan-first agent loop: grounded workspace read-back, revise until aligned, then execute.
 */

import type { NextRequest } from "next/server";
import { getPendingPlan } from "./implementation-plan";
import { buildPlanningPrompt, collectWorkspaceSearch, syncPendingFromEditor, upsertAgentPlan } from "./agent-plan";
import { patchStreamEpilogue } from "./stream-epilogue";
import { streamPlanDecision } from "../execute-plan";
import {
  detectAnalysisIntent,
  isGeneralKnowledgeQuestion,
  isProceedPhrase,
  isProcessingRequest,
  splitUserAndContext,
  type WorkspaceIndex,
} from "@/lib/workspace-index";
import { streamOrchestra } from "@/lib/ollama-orchestra";
import type { PluginState } from "@/lib/plugins";
import { resolveOrchestraSpeed, type OrchestraChoice } from "@/lib/orchestra-mode";
import { validatePlan } from "@/lib/plan-spec";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
            confidence: 0,
            showConfidence: false,
            capabilityTrace: ["G-AID"],
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
        body: JSON.stringify({ prompt, session_id: sessionId }),
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

async function proxyOrchestra(
  prompt: string,
  sessionId: string,
  epiloguePatch?: Record<string, unknown>,
  onComplete?: (raw: string) => void,
  lookupQuery?: string,
  pluginState?: Partial<PluginState>,
  speed?: "fast" | "thinking",
  resumePartial?: string
): Promise<Response> {
  try {
    const body = await streamOrchestra(prompt, { lookupQuery, pluginState, speed, resumePartial });
    const patched = epiloguePatch
      ? patchStreamEpilogue(body, epiloguePatch, onComplete)
      : body;
    return new Response(patched, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch {
    return proxyPython(prompt, sessionId, epiloguePatch, onComplete);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, sessionId, workspaceRoot, workspaceIndex, projectName, history, pluginState, orchestraChoice, resumePartial, implementationPlanContent } = body as {
    message?: string;
    sessionId?: string;
    workspaceRoot?: string;
    workspaceIndex?: WorkspaceIndex | null;
    projectName?: string;
    history?: { sender: string; text: string }[];
    pluginState?: Partial<PluginState>;
    orchestraChoice?: OrchestraChoice | string;
    resumePartial?: string;
    implementationPlanContent?: string;
  };
  if (!message || !sessionId) {
    return Response.json({ error: "message and sessionId are required" }, { status: 400 });
  }

  const { userText } = splitUserAndContext(message);
  const editorMarkdown = typeof implementationPlanContent === "string" ? implementationPlanContent : undefined;
  let pending = getPendingPlan(sessionId);
  const intent = detectAnalysisIntent(userText);
  const root = typeof workspaceRoot === "string" ? workspaceRoot.trim() : "";

  if (pending && isProceedPhrase(userText)) {
    pending = syncPendingFromEditor(sessionId, editorMarkdown) || pending;
    const check = validatePlan(pending);
    if (!check.ok) {
      return streamAgentResponse(
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
    return new Response(streamPlanDecision(sessionId, "approve", root), {
      headers: { "Content-Type": "application/octet-stream" },
    });
  }

  const planTurn = Boolean(intent || pending || isProcessingRequest(userText)) && !isGeneralKnowledgeQuestion(userText);
  const speed = resolveOrchestraSpeed(userText, { choice: orchestraChoice, planTurn });
  if (planTurn && !root) {
    return streamAgentResponse(
      "Open the survey folder first (**File → Open Folder**). Open the parent survey folder — not a single file — so I can search the days or lines inside it and write results to `G-AID Output`.",
      { type: "synthesis_complete", awaitingApproval: false }
    );
  }

  try {
    if (planTurn && root) {
      const { hits, misses } = collectWorkspaceSearch(userText, root, workspaceIndex ?? null);
      const plan = upsertAgentPlan({
        sessionId,
        userText,
        workspaceRoot: root,
        workspaceIndex: workspaceIndex ?? null,
        projectName: projectName || "",
        editorMarkdown,
        searchHits: hits,
        searchMisses: misses,
      });
      const prompt = buildPlanningPrompt({
        userText,
        history: Array.isArray(history) ? history.slice(-8) : [],
        plan,
      });
      return await proxyOrchestra(
        prompt,
        sessionId,
        {
          type: "synthesis_complete",
          awaitingApproval: true,
          taskFolder: plan.taskFolder,
          implementationPlanContent: plan.plan,
          planRev: plan.rev,
        },
        undefined,
        undefined,
        undefined,
        speed
      );
    }

    return await proxyOrchestra(message, sessionId, undefined, undefined, userText, pluginState, speed, resumePartial);
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
