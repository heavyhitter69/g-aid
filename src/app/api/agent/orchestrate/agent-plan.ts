import path from "path";
import {
  buildWorkspaceBrief,
  detectAnalysisIntent,
  isAbsoluteDiskPath,
  type AnalysisIntent,
  type WorkspaceIndex,
} from "@/lib/workspace-index";
import {
  extractSearchNeedles,
  grepWorkspaceRoot,
  inferTargetFolder,
  mergeSearchHits,
  searchWorkspaceIndex,
  unmatchedNeedles,
  type WorkspaceSearchHit,
} from "@/lib/workspace-search";
import { resolveOutputLayout } from "@/lib/output-layout";
import { EMPTY_STEPS, getPendingPlan, setPendingPlan, type AgentPlan, type PlanSteps } from "./implementation-plan";
import {
  applyChatPatches,
  applyEditorAndChat,
  normalizePlan,
  renderImplementationPlan,
  validatePlan,
  workItems,
} from "@/lib/plan-spec";

function magSuite(enabled: boolean): Pick<
  PlanSteps,
  "igrf" | "headingLag" | "level" | "grid" | "derivatives" | "lineaments" | "gis"
> {
  return {
    igrf: enabled,
    headingLag: enabled,
    level: enabled,
    grid: enabled,
    derivatives: enabled,
    lineaments: enabled,
    gis: enabled,
  };
}

function intentToSteps(intent: AnalysisIntent | null, message: string, previous?: PlanSteps): PlanSteps {
  const m = message.toLowerCase();
  const onlyDiurnal =
    /\b(only|just)\s+diurnal\b|\bdiurnal\s+only\b/.test(m) ||
    (intent === "diurnal" && !/\brtp\b|\bigrf\b|\bgrid\b|\bfull\s+(mag|magnetic)\b/.test(m));
  const next: PlanSteps = { ...(previous ?? EMPTY_STEPS) };

  if (intent === "gravity" || /\bbouguer\b|\bfree[\s-]?air\b/.test(m)) {
    next.gravity = true;
    next.residual = true;
    next.gis = true;
  }
  if (intent === "resistivity" || /\bert\b|\bpseudosection\b/.test(m)) {
    next.ert = true;
    next.ertInvert = !/\bpseudosection only\b/.test(m);
  }
  if (intent === "seismic") next.seismic = true;
  if (intent === "radiometrics") next.radiometrics = true;
  if (intent === "gpr") next.gpr = true;

  const mag =
    intent === "diurnal" ||
    intent === "rtp" ||
    intent === "magnetic" ||
    /\bdiurnal\b|\brtp\b|\bigrf\b|\bmagnetic\b/.test(m);

  if (mag) {
    next.diurnal = true;
    if (!onlyDiurnal) {
      Object.assign(next, magSuite(true));
      next.rtp = intent === "rtp" || intent === "magnetic" || /\brtp\b/.test(m) || previous?.rtp || false;
      if (intent === "magnetic" || intent === "rtp") next.rtp = true;
      if (intent === "diurnal" && !/\brtp\b/.test(m)) {
        next.rtp = previous?.rtp || false;
      }
    }
  }
  return next;
}

function jobLabel(steps: PlanSteps): string {
  const parts: string[] = [];
  if (steps.diurnal) parts.push("diurnal");
  if (steps.igrf) parts.push("IGRF");
  if (steps.rtp) parts.push("RTP");
  if (steps.gravity) parts.push("gravity");
  if (steps.ert) parts.push("ERT");
  if (steps.seismic) parts.push("seismic");
  if (steps.gpr) parts.push("GPR");
  if (steps.radiometrics) parts.push("rad");
  return parts.join("+") || "process";
}

function paintPlan(plan: AgentPlan): AgentPlan {
  const projectName = plan.projectName;
  const layout = resolveOutputLayout(
    plan.workspaceRoot,
    plan.targetFolder,
    projectName,
    jobLabel(plan.steps)
  );
  const next: AgentPlan = {
    ...plan,
    taskFolder: layout.taskFolder,
    outputDir: layout.outputDir,
    productsRel: layout.productsRel,
    status: plan.status || "draft",
    rev: plan.rev ?? 1,
    notes: plan.notes || [],
  };
  next.plan = renderImplementationPlan({
    projectName,
    targetFolder: next.targetFolder,
    taskFolder: next.taskFolder,
    productsRel: next.productsRel,
    steps: next.steps,
    baseReference: next.parameters.baseReference,
    notes: next.notes,
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
}): AgentPlan {
  const existing = getPendingPlan(options.sessionId);
  const projectName = options.projectName || path.basename(options.workspaceRoot);
  const intent =
    detectAnalysisIntent(options.userText) ||
    existing?.intent ||
    "magnetic";
  const hits = options.searchHits ?? searchWorkspaceIndex(options.workspaceIndex, options.userText);
  const misses = options.searchMisses ?? unmatchedNeedles(extractSearchNeedles(options.userText).named, hits);
  const inferredTarget = inferTargetFolder(options.userText, options.workspaceIndex, hits);

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
    draft = applyEditorAndChat(draft, options.editorMarkdown, options.userText);
    if (inferredTarget) draft.targetFolder = inferredTarget;
  } else {
    const targetFolder = inferredTarget || "";
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

  draft.workspaceBrief = buildWorkspaceBrief(
    options.workspaceIndex,
    options.workspaceRoot,
    draft.targetFolder,
    hits,
    misses
  );
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
  const validation = validatePlan(options.plan);
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
