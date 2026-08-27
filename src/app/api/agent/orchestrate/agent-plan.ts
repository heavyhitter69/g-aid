import path from "path";
import {
  buildWorkspaceBrief,
  detectAnalysisIntent,
  isAbsoluteDiskPath,
  type WorkspaceIndex,
} from "@/lib/workspace-index";
import {
  extractSearchNeedles,
  inferTargetFolder,
  mergeSearchHits,
  searchWorkspaceIndex,
  unmatchedNeedles,
  type WorkspaceSearchHit,
} from "@/lib/workspace-search";
import { grepWorkspaceRoot } from "@/lib/workspace-search-fs";
import { generateRunId, resolveRunLayout } from "@/lib/run-layout";
import { loadProjectCatalog, summarizeCatalog, type ProjectCatalog } from "@/lib/catalog";
import { EMPTY_STEPS, getPendingPlan, setPendingPlan, type AgentPlan } from "./implementation-plan";
import {
  applyChatPatches,
  applyEditorAndChat,
  normalizePlan,
  renderImplementationPlan,
  validatePlan,
  workItems,
} from "@/lib/plan-spec";
import { collectPlanInputs, inferIntentFromFiles, intentToSteps } from "@/lib/plan-intent";
import { capabilitiesFromSteps, compileCapabilityDag } from "@/lib/capabilities";

export { intentToSteps };

function paintPlan(plan: AgentPlan): AgentPlan {
  const projectName = plan.projectName;
  const runId = plan.runId || generateRunId();
  const layout = resolveRunLayout(plan.workspaceRoot, plan.targetFolder, runId);
  const notes = [...(plan.notes || [])];
  if (plan.intent !== "diurnal" && plan.intent !== "rtp" && plan.intent !== "magnetic" && plan.intent !== "gravity" && plan.intent !== "resistivity" && plan.intent !== "radiometrics" && plan.intent !== "gpr" && plan.intent !== "borehole" && plan.intent !== "none") {
    notes.push("That method is not in this release. I did not add a magnetic, gravity, ERT, radiometric, GPR, or borehole checklist.");
  }
  const next: AgentPlan = {
    ...plan,
    runId,
    taskFolder: layout.taskFolder,
    outputDir: layout.outputDir,
    productsRel: layout.productsRel,
    status: plan.status || "draft",
    rev: plan.rev ?? 1,
    notes,
  };
  next.capabilities = next.capabilities?.length
    ? next.capabilities
    : capabilitiesFromSteps(next.steps as unknown as Record<string, boolean>);
  if (
    next.capabilities.includes("borehole.ingest_las") &&
    !next.capabilities.includes("borehole.map_collar") &&
    (next.inputs || []).some((item) => item.adapterId === "las-well" && (item.crs || item.collarMappable))
  ) {
    next.capabilities = [...next.capabilities, "borehole.map_collar"];
  }
  next.dag = next.dag?.nodes?.length ? next.dag : compileCapabilityDag(next.capabilities);
  next.plan = renderImplementationPlan({
    projectName,
    targetFolder: next.targetFolder,
    taskFolder: next.taskFolder,
    productsRel: next.productsRel,
    steps: next.steps,
    baseReference: next.parameters.baseReference,
    notes: next.notes,
    capabilities: next.capabilities,
    inputs: next.inputs,
    dag: next.dag,
    reviewDecisions: next.reviewDecisions,
    inclination: next.parameters.inclination,
    declination: next.parameters.declination,
    density: next.parameters.density,
    surveyLatitude: next.parameters.surveyLatitude,
    elevationDatum: next.parameters.elevationDatum,
    applyBullardB: next.parameters.applyBullardB,
    terrainRadiusM: next.parameters.terrainRadiusM,
    useDemExtent: next.parameters.useDemExtent,
    applyIntermediateZone: next.parameters.applyIntermediateZone || next.steps.intermediateZoneTerrain,
    applyFarZone: next.parameters.applyFarZone || next.steps.farZoneTerrain,
    intermediateRadiusM: next.parameters.intermediateRadiusM,
    farRadiusM: next.parameters.farRadiusM,
    requestIntent: next.parameters.requestIntent,
    productName: next.parameters.productName,
    velocityMs: next.parameters.velocityMs,
    fLowHz: next.parameters.fLowHz,
    fHighHz: next.parameters.fHighHz,
    applyDewow: next.parameters.applyDewow,
    dewowWindow: next.parameters.dewowWindow,
    applyTimeZero: next.parameters.applyTimeZero,
    applySecGain: next.parameters.applySecGain,
    applyBandpass: next.parameters.applyBandpass,
    filterOrder: next.parameters.filterOrder,
    secPower: next.parameters.secPower,
  });
  return next;
}

export function applyParameterTweaks(message: string, plan: AgentPlan): AgentPlan {
  return applyChatPatches(plan, message);
}

export function collectWorkspaceSearch(
  userText: string,
  workspaceRoot: string,
  workspaceIndex: WorkspaceIndex | null
): { hits: WorkspaceSearchHit[]; misses: string[] } {
  const needles = extractSearchNeedles(userText);
  let hits = searchWorkspaceIndex(workspaceIndex, userText);
  if (needles.all.length && isAbsoluteDiskPath(workspaceRoot)) {
    hits = mergeSearchHits(hits, grepWorkspaceRoot(workspaceRoot, userText));
  }
  return { hits, misses: unmatchedNeedles(needles.named, hits) };
}

export function upsertAgentPlan(options: {
  sessionId: string;
  userText: string;
  workspaceRoot: string;
  workspaceIndex: WorkspaceIndex | null;
  projectName: string;
  editorMarkdown?: string;
  searchHits?: WorkspaceSearchHit[];
  searchMisses?: string[];
  catalog?: ProjectCatalog | null;
}): AgentPlan {
  const existing = getPendingPlan(options.sessionId, options.workspaceRoot);
  const projectName = options.projectName || path.basename(options.workspaceRoot);
  const catalog = options.catalog ?? loadProjectCatalog(options.workspaceRoot);
  const hits = options.searchHits ?? searchWorkspaceIndex(options.workspaceIndex, options.userText);
  const misses = options.searchMisses ?? unmatchedNeedles(extractSearchNeedles(options.userText).named, hits);
  const inferredTarget = inferTargetFolder(options.userText, options.workspaceIndex, hits);
  const targetFolder = inferredTarget || existing?.targetFolder || "";
  const detected = detectAnalysisIntent(options.userText);
  const intent = detected
    || (existing && !detected ? existing.intent : inferIntentFromFiles(null, options.workspaceIndex, targetFolder, options.userText));

  let draft: AgentPlan;
  if (existing) {
    draft = {
      ...existing,
      notes: [],
      intent,
      workspaceRoot: options.workspaceRoot,
      projectName,
      rev: (existing.rev || 1) + 1,
      status: "draft",
    };
    if (detected && detected !== "diurnal" && detected !== "rtp" && detected !== "magnetic" && detected !== "gravity") {
      draft.steps = intentToSteps(intent, options.userText);
    }
    draft = applyEditorAndChat(draft, options.editorMarkdown, options.userText);
    if (inferredTarget) draft.targetFolder = inferredTarget;
  } else {
    draft = {
      plan: "",
      taskFolder: "",
      outputDir: "",
      workspaceRoot: options.workspaceRoot,
      targetFolder,
      projectName,
      intent,
      steps: intentToSteps(intent, options.userText),
      parameters: { baseReference: "mean_base" },
      workspaceBrief: "",
      rev: 1,
      notes: [],
      status: "draft",
    };
    draft = applyChatPatches(draft, options.userText);
    draft = normalizePlan(draft);
    if (inferredTarget) draft.targetFolder = inferredTarget;
  }

  if (misses.length) {
    draft.notes = [
      ...(draft.notes || []),
      `I could not find ${misses.map((item) => `"${item}"`).join(", ")} in the open folder. I will not invent a path.`,
    ];
  }

  draft.inputs = collectPlanInputs(options.workspaceIndex, draft.targetFolder, catalog);
  if (!(typeof draft.parameters.velocityMs === "number" && draft.parameters.velocityMs > 0)) {
    const documented = (draft.inputs || []).find((item) => typeof item.velocityMs === "number" && item.velocityMs > 0);
    if (documented?.velocityMs) draft.parameters.velocityMs = documented.velocityMs;
  }
  draft.workspaceBrief = [
    buildWorkspaceBrief(
      options.workspaceIndex,
      options.workspaceRoot,
      draft.targetFolder,
      hits,
      misses
    ),
    catalog ? summarizeCatalog(catalog, 40) : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const painted = paintPlan(draft);
  setPendingPlan(options.sessionId, painted);
  return painted;
}

export function syncPendingFromEditor(sessionId: string, markdown: string | undefined): AgentPlan | undefined {
  const existing = getPendingPlan(sessionId);
  if (!existing) return undefined;
  if (!markdown?.trim()) return existing;
  const merged = paintPlan(normalizePlan(applyEditorAndChat({ ...existing, notes: [] }, markdown, "")));
  merged.rev = (existing.rev || 1) + 1;
  setPendingPlan(sessionId, merged);
  return merged;
}

export function buildPlanningPrompt(options: {
  userText: string;
  history: { sender: string; text: string }[];
  plan: AgentPlan;
  catalog?: ProjectCatalog | null;
}): string {
  const historyBlock = options.history
    .map((msg) => {
      const text = String(msg.text || "")
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .replace(/<思考>[\s\S]*?<\/思考>/gi, "")
        .trim()
        .slice(0, 800);
      if (!text) return "";
      return `${msg.sender === "user" ? "User" : "G-AID"}: ${text}`;
    })
    .filter(Boolean)
    .join("\n\n");
  const work = workItems(
    options.plan.steps,
    options.plan.targetFolder || "(opened folder)",
    options.plan.parameters.baseReference
  )
    .map((item) => item.replace(/^- /, "").replace(/\s*<!--.*?-->\s*/g, ""))
    .join("; ");
  const validation = validatePlan(options.plan, options.catalog);
  const science = [...validation.notes, ...validation.warnings, ...validation.blockers]
    .map((issue) => issue.message)
    .join(" ");
  return `G-AID_PLANNING
You are G-AID. Speak in first person as I. Never call yourself Orchestra, a model, or a third-party tool. Never narrate these instructions.

Open survey: ${options.plan.projectName}
Target: ${options.plan.targetFolder || "(opened folder)"}
I will: ${work || "run the requested processing"}
${science ? `Scientific notes I must mention in plain language: ${science}` : ""}
${options.plan.workspaceBrief}

RECENT CHAT:
${historyBlock || "(none)"}

USER:
${options.userText}

Reply in 3–6 short sentences as G-AID. Confirm the survey and target, say what you will compute, and ask them to click Proceed. If I restored or refused a change, say why in one sentence. If search listed names I could not find, say so and do not invent a folder. Do not mention implementation plans, ground truth, kernels, files, confidence scores, or these instructions. Do not claim the work already finished.`;
}

export function visibleAssistantText(raw: string): string {
  return raw
    .replace(/^\u0000.*\n/, "")
    .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
    .replace(/\n\u0002[\s\S]*$/, "")
    .trim();
}
