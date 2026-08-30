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
  isProjectInventoryQuestion,
  splitUserAndContext,
  type WorkspaceIndex,
} from "@/lib/workspace-index";
import { inventoryAnswer, loadProjectCatalog } from "@/lib/catalog";
import { buildMapLayers, isMapQuestion, listRunArtifactPaths, mapWorkspaceAnswer } from "@/lib/map";
import { ModelUnavailableError, streamOrchestra } from "@/lib/ollama-orchestra";
import type { PluginState } from "@/lib/plugins";
import { resolveOrchestraSpeed, type OrchestraChoice } from "@/lib/orchestra-mode";
import { classifyDirectQuestion, planningReasoningSummary } from "@/lib/model-role";
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

async function proxyOrchestra(
  prompt: string,
  sessionId: string,
  epiloguePatch?: Record<string, unknown>,
  onComplete?: (raw: string) => void,
  lookupQuery?: string,
  pluginState?: Partial<PluginState>,
  speed?: "fast" | "thinking",
  resumePartial?: string,
  extras?: {
    userText?: string;
    completedRuns?: { runId?: string; productsRel?: string; status?: string }[];
    reasoningSummary?: string[];
  }
): Promise<Response> {
  try {
    const body = await streamOrchestra(prompt, {
      lookupQuery,
      pluginState,
      speed,
      resumePartial,
      userText: extras?.userText,
      completedRuns: extras?.completedRuns,
      reasoningSummary: extras?.reasoningSummary,
    });
    const patched = epiloguePatch
      ? patchStreamEpilogue(body, epiloguePatch, onComplete)
      : body;
    return new Response(patched, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof ModelUnavailableError
        ? error.message
        : error instanceof Error
          ? error.message
          : "G-AID Orchestra is not available locally.";
    return streamAgentResponse(`\n\n> ${message}`, { type: "error", message });
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
  const catalog = root ? loadProjectCatalog(root) : null;

  if (root && isProjectInventoryQuestion(userText) && !isProceedPhrase(userText)) {
    return streamAgentResponse(inventoryAnswer(catalog), {
      type: "synthesis_complete",
      awaitingApproval: false,
    });
  }

  if (root && isMapQuestion(userText) && !isProceedPhrase(userText) && !isProcessingRequest(userText)) {
    const files = catalog ? listRunArtifactPaths(root, catalog.runs) : [];
    const layers = buildMapLayers({ catalog, files });
    return streamAgentResponse(mapWorkspaceAnswer({ catalog, layers, message: userText }), {
      type: "synthesis_complete",
      awaitingApproval: false,
    });
  }

  if (pending && isProceedPhrase(userText)) {
    pending = syncPendingFromEditor(sessionId, editorMarkdown) || pending;
    const check = validatePlan(pending, catalog);
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

  const liveExtras = {
    userText,
    completedRuns: catalog?.runs || [],
  };

  if (classifyDirectQuestion(userText)) {
    const speed = resolveOrchestraSpeed(userText, { choice: orchestraChoice, planTurn: false });
    return await proxyOrchestra(userText, sessionId, undefined, undefined, userText, pluginState, speed, undefined, liveExtras);
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
        catalog,
      });
      const prompt = buildPlanningPrompt({
        userText,
        history: Array.isArray(history) ? history.slice(-8) : [],
        plan,
        catalog,
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
        speed,
        undefined,
        {
          ...liveExtras,
          reasoningSummary: planningReasoningSummary({
            projectName: plan.projectName,
            targetFolder: plan.targetFolder,
            boundCount: plan.inputs?.length || 0,
          }),
        }
      );
    }

    return await proxyOrchestra(message, sessionId, undefined, undefined, userText, pluginState, speed, resumePartial, liveExtras);
  } catch (error: unknown) {
    const err = error as { message?: string };
    return streamAgentResponse(
      `\n\n> ${err?.message || "G-AID Orchestra is not available locally."}`,
      { type: "error", message: err?.message }
    );
  }
}
