/**
 * Versioned run folders: `{project}/G-AID Output/runs/{runId}/`.
 * Layout of G-AID Output itself stays survey-relative so later catalog/GIS
 * work can keep one output tree per opened folder.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { GAID_OUTPUT_DIR } from "./workspace-index.ts";
import { pendingPlansPath as statePendingPlansPath, STATE_PENDING_NAME } from "./project-state.ts";
import type { AgentPlan } from "./plan-spec.ts";

const DAY_LEAF = /^day\s*\d+$/i;
export const RUNS_SUBDIR = "runs";
export const PENDING_PLANS_NAME = STATE_PENDING_NAME;
export const RUN_PLAN_JSON = "plan.json";
export const RUN_PLAN_MD = "Implementation Plan.md";
export const RUN_TASKS_MD = "tasks.md";
export const RUN_LOG_DIR = "logs";
export const RUN_LOG_FILE = "pipeline.log";

function safeLeaf(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/]+/g, " ").trim();
  return cleaned || fallback;
}

/** Where `G-AID Output` lives for a target (survey folder or workspace root). */
export function resolveGaidOutputDir(workspaceRoot: string, targetFolder: string): string {
  const parts = (targetFolder || "").replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length >= 2) {
    return path.join(workspaceRoot, ...parts.slice(0, -1), GAID_OUTPUT_DIR);
  }
  if (parts.length === 1 && !DAY_LEAF.test(parts[0])) {
    return path.join(workspaceRoot, parts[0], GAID_OUTPUT_DIR);
  }
  return path.join(workspaceRoot, GAID_OUTPUT_DIR);
}

export function runsDir(workspaceRoot: string, targetFolder: string): string {
  return path.join(resolveGaidOutputDir(workspaceRoot, targetFolder), RUNS_SUBDIR);
}

export function pendingPlansPath(workspaceRoot: string): string {
  return statePendingPlansPath(workspaceRoot);
}

export function generateRunId(now: Date = new Date(), nonce?: string): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const extra = (nonce || Math.random().toString(36).slice(2, 6)).replace(/[^a-z0-9]/gi, "").slice(0, 6);
  return `r${stamp}-${extra || "run"}`;
}

export function uniquifyRunId(directory: string, runId: string): string {
  let candidate = runId.replace(/[\\/]+/g, "-").trim() || generateRunId();
  const base = candidate;
  let n = 2;
  while (fs.existsSync(path.join(directory, candidate))) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

export function resolveRunLayout(
  workspaceRoot: string,
  targetFolder: string,
  runId: string
): { outputDir: string; taskFolder: string; productsRel: string; runId: string } {
  const outputDir = runsDir(workspaceRoot, targetFolder);
  const taskFolder = runId;
  const productsRel = path
    .relative(workspaceRoot, path.join(outputDir, taskFolder))
    .replace(/\\/g, "/");
  return { outputDir, taskFolder, productsRel, runId };
}

/**
 * Mint or reuse a run id without creating the folder.
 * If a previous run folder already exists, allocate a new id and record it as parent.
 */
export function allocateApprovedRun(plan: AgentPlan): AgentPlan {
  const directory = runsDir(plan.workspaceRoot, plan.targetFolder);
  const priorId = plan.runId?.trim() || "";
  const priorExists = Boolean(priorId && fs.existsSync(path.join(directory, priorId)));
  const parentRunId = priorExists ? priorId : plan.parentRunId;
  let runId = priorExists ? generateRunId() : priorId || generateRunId();
  if (fs.existsSync(path.join(directory, runId))) {
    runId = uniquifyRunId(directory, runId);
  }
  const layout = resolveRunLayout(plan.workspaceRoot, plan.targetFolder, runId);
  return {
    ...plan,
    runId,
    parentRunId,
    taskFolder: layout.taskFolder,
    outputDir: layout.outputDir,
    productsRel: layout.productsRel,
  };
}

export function planHashMatches(
  plan: Pick<AgentPlan, "steps" | "parameters" | "targetFolder" | "intent" | "workspaceRoot" | "capabilities" | "inputs" | "dag" | "planHash">
): boolean {
  return Boolean(plan.planHash) && plan.planHash === hashPlan(plan);
}

export function hashPlan(plan: Pick<AgentPlan, "steps" | "parameters" | "targetFolder" | "intent" | "workspaceRoot" | "capabilities" | "inputs" | "dag">): string {
  const canonical = JSON.stringify({
    intent: plan.intent,
    steps: plan.steps,
    parameters: plan.parameters,
    targetFolder: plan.targetFolder,
    workspaceRoot: plan.workspaceRoot,
    capabilities: plan.capabilities || [],
    inputs: (plan.inputs || []).map((item) => ({
      catalogId: item.catalogId,
      path: item.path,
      checksum: item.checksum,
    })),
    dag: (plan.dag?.nodes || []).map((node) => node.id),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function sha256File(absPath: string): string | undefined {
  try {
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return undefined;
    return createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
  } catch {
    return undefined;
  }
}

export function checksumPlanInputs(plan: AgentPlan): AgentPlan["inputs"] {
  const root = plan.workspaceRoot;
  const listed = plan.inputs || [];
  return listed.map((item) => {
    const abs = path.isAbsolute(item.path) ? item.path : path.join(root, item.path);
    return {
      ...item,
      checksum: item.checksum || sha256File(abs),
    };
  });
}

export function runDirAbs(plan: Pick<AgentPlan, "outputDir" | "taskFolder">): string {
  return path.join(plan.outputDir, plan.taskFolder);
}

export function writeRunFile(plan: Pick<AgentPlan, "outputDir" | "taskFolder">, name: string, content: string): string {
  const dir = runDirAbs(plan);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, name);
  fs.writeFileSync(dest, content.endsWith("\n") ? content : `${content}\n`, "utf8");
  return dest;
}

export function appendRunLog(plan: Pick<AgentPlan, "outputDir" | "taskFolder">, line: string): void {
  const dir = path.join(runDirAbs(plan), RUN_LOG_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, RUN_LOG_FILE), line.endsWith("\n") ? line : `${line}\n`, "utf8");
}

export function writeFrozenPlanJson(plan: AgentPlan): string {
  const record = {
    ...plan,
    planHash: plan.planHash || hashPlan(plan),
    productsRel: plan.productsRel,
  };
  return writeRunFile(plan, RUN_PLAN_JSON, JSON.stringify(record, null, 2));
}

/** Job folders under G-AID Output, including `runs/{runId}` and legacy `{leaf} - {job}`. */
export function listJobFolders(allPaths: string[], outputFolder: string): string[] {
  const prefix = outputFolder.replace(/\\/g, "/").replace(/\/$/, "");
  const jobs = new Set<string>();
  for (const raw of allPaths) {
    const id = raw.replace(/\\/g, "/");
    if (id !== prefix && !id.startsWith(`${prefix}/`)) continue;
    const rest = id.slice(prefix.length + 1);
    const parts = rest.split("/").filter(Boolean);
    if (!parts.length) continue;
    if (parts[0] === RUNS_SUBDIR && parts[1]) {
      jobs.add(`${prefix}/${RUNS_SUBDIR}/${parts[1]}`);
    } else if (parts[0] && parts[0] !== RUNS_SUBDIR) {
      jobs.add(`${prefix}/${parts[0]}`);
    }
  }
  return [...jobs];
}

export { safeLeaf };
