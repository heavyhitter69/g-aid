import fs from "fs";
import path from "path";
import { TEMP_TASKS_ID } from "@/lib/workspace-file-ids";
import { workStepFromEvent } from "@/lib/work-steps";
import { checkNodeInTasks } from "@/lib/tasks-tick";
import {
  generateTasksMarkdown,
  getPendingPlan,
  clearPendingPlan,
  setPendingPlan,
  type AgentPlan,
} from "./orchestrate/implementation-plan";

export interface ProjectFileUpdate {
  id: string;
  name: string;
  type: "file" | "folder";
  path: string;
  content?: string;
  open?: boolean;
  temporary?: boolean;
}

const encoder = new TextEncoder();
const enc = (s: string) => encoder.encode(s);
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function uniquifyFolder(outputDir: string, name: string): string {
  let candidate = name.replace(/[\\/]+/g, " ").trim() || "results";
  const base = candidate;
  let n = 2;
  while (fs.existsSync(path.join(outputDir, candidate))) {
    candidate = `${base} ${n}`;
    n += 1;
  }
  return candidate;
}

function relativeToWorkspace(workspaceRoot: string, absPath: string): string {
  return path.relative(workspaceRoot, absPath).replace(/\\/g, "/");
}

function collectTaskFiles(
  workspaceRoot: string,
  outputDir: string,
  taskFolder: string
): ProjectFileUpdate[] {
  const skip = new Set(["implementation-plan.md", "tasks.md"]);
  const taskDir = path.join(outputDir, taskFolder);
  const projectFilesUpdates: ProjectFileUpdate[] = [];
  if (!fs.existsSync(taskDir)) return projectFilesUpdates;
  for (const fName of fs.readdirSync(taskDir)) {
    if (skip.has(fName.toLowerCase())) continue;
    const filePath = path.join(taskDir, fName);
    if (!fs.statSync(filePath).isFile()) continue;
    const rel = relativeToWorkspace(workspaceRoot, filePath);
    projectFilesUpdates.push({
      id: rel,
      name: fName,
      type: "file",
      path: rel,
    });
  }
  return projectFilesUpdates;
}

function findWorkspaceFile(root: string, exts: string[]): string | undefined {
  if (!root || !fs.existsSync(root)) return undefined;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["g-aid output", ".git", "node_modules", ".venv"].includes(entry.name.toLowerCase())) continue;
        stack.push(full);
      } else if (exts.some((ext) => entry.name.toLowerCase().endsWith(ext))) {
        return full;
      }
    }
  }
  return undefined;
}

function tasksUpdate(content: string, open = false): ProjectFileUpdate {
  return {
    id: TEMP_TASKS_ID,
    name: TEMP_TASKS_ID,
    type: "file",
    path: TEMP_TASKS_ID,
    content,
    open,
    temporary: true,
  };
}

function tickFromEvent(
  content: string,
  event: { type?: string; nodeId?: string; message?: string; payload?: { skipped?: boolean; artifacts?: { path?: string }[] } }
): string | null {
  if (event.type !== "NODE_COMPLETED" || !event.nodeId) return null;
  const artifacts = event.payload?.artifacts || [];
  const skipped =
    Boolean(event.payload?.skipped) ||
    (/skipped:/i.test(event.message || "") && artifacts.length === 0);
  if (skipped) return checkNodeInTasks(content, event.nodeId, "skipped");
  const hasFiles = artifacts.some((artifact) => {
    const filePath = artifact?.path;
    return typeof filePath === "string" && filePath.length > 0 && fs.existsSync(filePath);
  });
  if (!hasFiles && artifacts.length === 0) return null;
  return checkNodeInTasks(content, event.nodeId, "complete");
}

async function runDiurnalPipeline(
  pending: AgentPlan,
  enqueue: (s: string) => void,
  onTasks: (content: string) => void,
  tasksContent: { current: string }
): Promise<{ files: ProjectFileUpdate[]; ok: boolean }> {
  const { MagneticPreprocessingPipeline } = await import("@/pipeline/MagneticPreprocessingPipeline");
  const pipeline = new MagneticPreprocessingPipeline();
  const pipelineParams = {
    projectName: pending.projectName,
    targetFolder: pending.targetFolder || "",
    taskFolder: pending.taskFolder,
    baseDir: pending.workspaceRoot,
    outDir: pending.outputDir,
    baseReference: pending.parameters.baseReference,
    surveyDate: pending.parameters.surveyDate,
    density: pending.parameters.density,
    inclination: pending.parameters.inclination,
    declination: pending.parameters.declination,
    inputPath: pending.parameters.inputPath,
    steps: pending.steps,
  };

  const checked = new Set<string>();
  let failed = false;
  const ok = await pipeline.runPipeline([], async (event) => {
    if (event.type === "NODE_PROGRESS") {
      const step = workStepFromEvent(event.nodeId, event.message || "");
      if (step) enqueue(`\x02${JSON.stringify({ type: "work_step", ...step })}\n`);
    } else if (event.type === "NODE_COMPLETED" && event.nodeId) {
      const skipped = Boolean(event.payload?.skipped) || /skipped:/i.test(event.message || "");
      if (!skipped) {
        enqueue(`\x02${JSON.stringify({ type: "work_step", id: event.nodeId, done: true })}\n`);
      }
      if (!checked.has(event.nodeId)) {
        const next = tickFromEvent(tasksContent.current, event);
        if (next) {
          checked.add(event.nodeId);
          tasksContent.current = next;
          onTasks(tasksContent.current);
        }
      }
    } else if (event.type === "QC_WARNING") {
      enqueue(`\x02${JSON.stringify({
        type: "work_step",
        id: `qc:${event.message?.slice(0, 40)}`,
        label: event.message || "Quality note",
        status: "warning",
      })}\n`);
    } else if (event.type === "PIPELINE_FAILED") {
      failed = true;
      enqueue(`- ❌ **Pipeline Error**: ${event.message}\n`);
    }
  }, pipelineParams);

  return {
    files: collectTaskFiles(pending.workspaceRoot, pending.outputDir, pending.taskFolder),
    ok: Boolean(ok) && !failed,
  };
}

export function streamPlanDecision(sessionId: string, decision: "approve" | "reject"): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => controller.enqueue(enc(s));
      const pending = getPendingPlan(sessionId);
      try {
        if (!pending) {
          enqueue(`\x00${JSON.stringify({ agentId: "orchestrator-agent", confidence: 0 })}\n`);
          enqueue("No pending implementation plan found for this chat. Ask G-AID to plan the analysis first.");
          enqueue(`\n\x02${JSON.stringify({ type: "execution_failed" })}\n`);
          controller.close();
          return;
        }

        if (decision === "reject") {
          enqueue(`\x00${JSON.stringify({ agentId: "orchestrator-agent", confidence: 0.8 })}\n`);
          await delay(40);
          enqueue("Plan cancelled.");
          clearPendingPlan(sessionId);
          enqueue(`\n\x02${JSON.stringify({ type: "execution_complete", awaitingApproval: false })}\n`);
          controller.close();
          return;
        }

        const dest = path.join(pending.outputDir, pending.taskFolder);
        if (!fs.existsSync(dest)) {
          pending.taskFolder = uniquifyFolder(pending.outputDir, pending.taskFolder);
        }
        pending.productsRel = path
          .relative(pending.workspaceRoot, path.join(pending.outputDir, pending.taskFolder))
          .replace(/\\/g, "/");
        fs.mkdirSync(path.join(pending.outputDir, pending.taskFolder), { recursive: true });
        try {
          fs.writeFileSync(
            path.join(pending.outputDir, pending.taskFolder, "plan.json"),
            `${JSON.stringify({ ...pending, status: "approved" }, null, 2)}\n`
          );
        } catch {
          /* checklist still runs */
        }
        pending.status = "executing";
        setPendingPlan(sessionId, pending);

        const tasksContent = { current: generateTasksMarkdown(pending) };

        enqueue(`\x00${JSON.stringify({
          agentId: "magnetic-agent",
          confidence: 0,
          showConfidence: false,
          capabilityTrace: pending.steps.diurnal ? ["diurnal-correction"] : ["planning"],
        })}\n`);
        enqueue(`\x02${JSON.stringify({
          type: "workspace_file",
          projectFilesUpdates: [tasksUpdate(tasksContent.current, true)],
        })}\n`);
        await delay(40);
        enqueue(`**Plan approved.** Working through the checklist.\n\n`);

        const onTasks = (content: string) => {
          enqueue(`\x02${JSON.stringify({
            type: "workspace_file",
            projectFilesUpdates: [tasksUpdate(content)],
          })}\n`);
        };

        const projectFilesUpdates: ProjectFileUpdate[] = [];

        const mag =
          pending.steps.diurnal ||
          pending.steps.igrf ||
          pending.steps.grid ||
          pending.steps.rtp;
        let ranOk = true;
        if (mag) {
          const created = await runDiurnalPipeline(pending, enqueue, onTasks, tasksContent);
          projectFilesUpdates.push(...created.files);
          ranOk = created.ok;
        }

        if (pending.steps.gravity || pending.steps.ert || pending.steps.seismic || pending.steps.gpr || pending.steps.radiometrics) {
          const { GravityPipeline, ResistivityPipeline, SeismicPipeline, GprPipeline, RadiometricPipeline } = await import(
            "@/pipeline/MagneticPreprocessingPipeline"
          );
          const { PipelineEngine } = await import("@/pipeline/PipelineEngine");
          if (!pending.parameters.inputPath) {
            if (pending.steps.gravity) pending.parameters.inputPath = findWorkspaceFile(pending.workspaceRoot, [".xyz", ".txt"]);
            else if (pending.steps.ert) pending.parameters.inputPath = findWorkspaceFile(pending.workspaceRoot, [".dat"]);
            else if (pending.steps.seismic) pending.parameters.inputPath = findWorkspaceFile(pending.workspaceRoot, [".sgy", ".segy"]);
            else if (pending.steps.gpr) pending.parameters.inputPath = findWorkspaceFile(pending.workspaceRoot, [".dzt"]);
            else if (pending.steps.radiometrics) pending.parameters.inputPath = findWorkspaceFile(pending.workspaceRoot, [".csv"]);
          }
          const extraParams = {
            projectName: pending.projectName,
            targetFolder: pending.targetFolder || "",
            taskFolder: pending.taskFolder,
            baseDir: pending.workspaceRoot,
            outDir: pending.outputDir,
            inputPath: pending.parameters.inputPath,
            density: pending.parameters.density,
            steps: pending.steps,
          };
          const runExtra = async (pipeline: InstanceType<typeof PipelineEngine>) => {
            const extraOk = await pipeline.runPipeline([], async (event) => {
              if (event.type === "NODE_PROGRESS") {
                const step = workStepFromEvent(event.nodeId, event.message || "");
                if (step) enqueue(`\x02${JSON.stringify({ type: "work_step", ...step })}\n`);
              } else if (event.type === "NODE_COMPLETED" && event.nodeId) {
                const skipped = Boolean(event.payload?.skipped) || /skipped:/i.test(event.message || "");
                if (!skipped) {
                  enqueue(`\x02${JSON.stringify({ type: "work_step", id: event.nodeId, done: true })}\n`);
                }
                const next = tickFromEvent(tasksContent.current, event);
                if (next) {
                  tasksContent.current = next;
                  onTasks(tasksContent.current);
                }
              } else if (event.type === "QC_WARNING") {
                enqueue(`\x02${JSON.stringify({
                  type: "work_step",
                  id: `qc:${event.message?.slice(0, 40)}`,
                  label: event.message || "Quality note",
                  status: "warning",
                })}\n`);
              } else if (event.type === "PIPELINE_FAILED") {
                ranOk = false;
                enqueue(`- ❌ **Pipeline Error**: ${event.message}\n`);
              }
            }, extraParams);
            if (!extraOk) ranOk = false;
          };
          if (pending.steps.gravity) await runExtra(new GravityPipeline());
          if (pending.steps.ert) await runExtra(new ResistivityPipeline());
          if (pending.steps.seismic) await runExtra(new SeismicPipeline());
          if (pending.steps.gpr) await runExtra(new GprPipeline());
          if (pending.steps.radiometrics) await runExtra(new RadiometricPipeline());
        }

        const latest = collectTaskFiles(pending.workspaceRoot, pending.outputDir, pending.taskFolder);
        const seen = new Set(projectFilesUpdates.map((f) => f.path));
        for (const file of latest) {
          if (!seen.has(file.path)) projectFilesUpdates.push(file);
        }

        if (!ranOk) {
          onTasks(tasksContent.current);
          enqueue(`\n\nStopped. This run did not finish. Click Proceed to retry — the plan is still here.`);
          enqueue(`\n\x02${JSON.stringify({
            type: "execution_failed",
            agentId: "magnetic-agent",
            taskFolder: pending.taskFolder,
            awaitingApproval: true,
            projectFilesUpdates,
          })}\n`);
          controller.close();
          return;
        }

        tasksContent.current = checkNodeInTasks(tasksContent.current, "write_products", "complete");
        onTasks(tasksContent.current);

        enqueue(`\n\nFinished. Results are on the map.`);
        enqueue(`\n\x02${JSON.stringify({
          type: "execution_complete",
          agentId: "magnetic-agent",
          taskFolder: pending.taskFolder,
          productsRel: pending.productsRel,
          awaitingApproval: false,
          projectFilesUpdates,
        })}\n`);
        clearPendingPlan(sessionId);
        controller.close();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error("Plan execution failed:", errorMsg);
        enqueue(`\n❌ **Execution Failed**: ${errorMsg}`);
        enqueue(`\n\x02${JSON.stringify({ type: "execution_failed", error: errorMsg, awaitingApproval: true })}\n`);
        controller.close();
      }
    },
  });
}
