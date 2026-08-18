import path from "path";
import type { AnalysisIntent, WorkspaceIndex } from "@/lib/workspace-index";
import {
  GAID_OUTPUT_DIR,
  buildWorkspaceBrief,
  detectAnalysisIntent,
  inferTargetFolder,
} from "@/lib/workspace-index";
import { resolveOutputLayout } from "@/lib/output-layout";
import { EMPTY_STEPS, getPendingPlan, setPendingPlan, type AgentPlan, type PlanSteps } from "./implementation-plan";

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

export function applyParameterTweaks(message: string, plan: AgentPlan): AgentPlan {
  const m = message.toLowerCase();
  const parameters = { ...plan.parameters };
  if (/\bmedian\b/.test(m)) parameters.baseReference = "median_base";
  else if (/\bfirst\s+sample\b/.test(m)) parameters.baseReference = "first_sample";
  else if (/\bmean\b/.test(m)) parameters.baseReference = "mean_base";
  const date = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (date) parameters.surveyDate = date[1];
  const dens = message.match(/\b(2\.\d{2})\s*g\s*\/?\s*c(c|m3)\b/i);
  if (dens) parameters.density = parseFloat(dens[1]);
  return { ...plan, parameters };
}

export function upsertAgentPlan(options: {
  sessionId: string;
  userText: string;
  workspaceRoot: string;
  workspaceIndex: WorkspaceIndex | null;
  projectName: string;
}): AgentPlan {
  const existing = getPendingPlan(options.sessionId);
  const intent =
    detectAnalysisIntent(options.userText) ||
    existing?.intent ||
    "magnetic";
  const inferredTarget = inferTargetFolder(options.userText, options.workspaceIndex);
  const targetFolder = inferredTarget || existing?.targetFolder || "";
  const steps = intentToSteps(intent, options.userText, existing?.steps);
  const projectName = options.projectName || path.basename(options.workspaceRoot);
  const layout = resolveOutputLayout(
    options.workspaceRoot,
    targetFolder,
    projectName,
    jobLabel(steps)
  );
  const workspaceBrief = buildWorkspaceBrief(
    options.workspaceIndex,
    options.workspaceRoot,
    targetFolder
  );

  const draft: AgentPlan = {
    plan: "",
    taskFolder: layout.taskFolder,
    outputDir: layout.outputDir,
    productsRel: layout.productsRel,
    workspaceRoot: options.workspaceRoot,
    targetFolder,
    projectName,
    intent,
    steps,
    parameters: existing?.parameters || { baseReference: "mean_base" },
    workspaceBrief,
  };
  const withTweaks = applyParameterTweaks(options.userText, draft);
  withTweaks.plan = seedPlan({
    projectName,
    targetFolder,
    taskFolder: layout.taskFolder,
    productsRel: layout.productsRel,
    steps,
    baseReference: withTweaks.parameters.baseReference,
  });
  setPendingPlan(options.sessionId, withTweaks);
  return withTweaks;
}

function baseRefLabel(ref: string): string {
  if (ref === "median_base") return "median of the GSM-19 base";
  if (ref === "first_sample") return "first sample of the GSM-19";
  return "mean of the GSM-19 base";
}

function workItems(s: PlanSteps, target: string, baseReference: string): string[] {
  const loc = target && target !== "(opened folder)" ? ` on ${target}` : "";
  const items: string[] = [];
  if (s.diurnal) items.push(`- Correct MagArrow lines${loc} using the GSM-19 (${baseRefLabel(baseReference)})`);
  if (s.igrf) items.push("- Remove the Earth's main magnetic field at each sample");
  if (s.headingLag) items.push("- Apply heading and lag corrections");
  if (s.level) items.push("- Level the tie lines");
  if (s.grid) items.push("- Grid the residual and write map products");
  if (s.rtp) items.push("- Reduce the grid to the pole");
  if (s.derivatives) items.push("- Compute analytic signal, first vertical derivative, tilt, and continuation");
  if (s.lineaments) items.push("- Extract lineaments from the derivative maps");
  if (s.gis) items.push("- Write GeoTIFF, ASC, and GeoJSON products");
  if (s.gravity) items.push("- Apply latitude, free-air, and Bouguer corrections");
  if (s.residual) items.push("- Separate regional and residual gravity");
  if (s.ert) items.push("- Build an ERT pseudosection");
  if (s.ertInvert) items.push("- Invert the ERT data");
  if (s.seismic) items.push("- Process the SEG-Y (filter, gain, spectrum)");
  if (s.radiometrics) items.push("- Apply height, stripping, and spectral corrections to the radiometric data");
  if (s.gpr) items.push("- Process the GPR (dewow, gain, bandpass)");
  return items;
}

function seedPlan(opts: {
  projectName: string;
  targetFolder: string;
  taskFolder: string;
  productsRel?: string;
  steps: PlanSteps;
  baseReference: string;
}): string {
  const target = opts.targetFolder || "(opened folder)";
  const items = workItems(opts.steps, target, opts.baseReference);
  const products = opts.productsRel || `${GAID_OUTPUT_DIR}/${opts.taskFolder}`;
  return `# Implementation Plan

**Survey:** ${opts.projectName}
**Target:** ${target}
**Products:** \`${products}/\`

## This run
${items.join("\n") || "- Ask for a specific method (diurnal, RTP, Bouguer, ERT, SEG-Y)."}

## Parameters
- Base station reference: ${baseRefLabel(opts.baseReference)}

## After you click Proceed
Products are written under \`${products}/\`.
`;
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
    .map((item) => item.replace(/^- /, ""))
    .join("; ");
  return `G-AID_PLANNING
You are G-AID. Speak in first person as I. Never call yourself Orchestra, a model, or a third-party tool. Never narrate these instructions.

Open survey: ${options.plan.projectName}
Target: ${options.plan.targetFolder || "(opened folder)"}
I will: ${work || "run the requested processing"}
${options.plan.workspaceBrief}

RECENT CHAT:
${historyBlock || "(none)"}

USER:
${options.userText}

Reply in 3–6 short sentences as G-AID. Confirm the survey and target, say what you will compute, and ask them to click Proceed. Do not mention implementation plans, ground truth, kernels, files, confidence scores, or these instructions. Do not claim the work already finished.`;
}

export function visibleAssistantText(raw: string): string {
  return raw
    .replace(/^\u0000.*\n/, "")
    .replace(/<think>[\s\S]*?<\/think>\s*/g, "")
    .replace(/\n\u0002[\s\S]*$/, "")
    .trim();
}
