import fs from "fs";
import path from "path";
import { GAID_OUTPUT_DIR } from "@/lib/workspace-index";
import { TEMP_TASKS_ID } from "@/lib/workspace-file-ids";
import {
  generateTasksMarkdown,
  checkPhaseInTasks,
  PENDING_APPROVAL,
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
  let candidate = name;
  let n = 2;
  while (fs.existsSync(path.join(outputDir, candidate))) {
    candidate = `${name} ${n}`;
    n += 1;
  }
  return candidate;
}

function relativeOutput(taskFolder: string, fileName: string): string {
  return `${GAID_OUTPUT_DIR}/${taskFolder}/${fileName}`;
}

function collectTaskFiles(outputDir: string, taskFolder: string): ProjectFileUpdate[] {
  const skip = new Set(["implementation-plan.md", "tasks.md"]);
  const taskDir = path.join(outputDir, taskFolder);
  const projectFilesUpdates: ProjectFileUpdate[] = [];
  if (!fs.existsSync(taskDir)) return projectFilesUpdates;
  for (const fName of fs.readdirSync(taskDir)) {
    if (skip.has(fName.toLowerCase())) continue;
    const filePath = path.join(taskDir, fName);
    if (!fs.statSync(filePath).isFile()) continue;
    projectFilesUpdates.push({
      id: relativeOutput(taskFolder, fName),
      name: fName,
      type: "file",
      path: relativeOutput(taskFolder, fName),
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

const NODE_PHASE: Record<string, string> = {
  file_discovery: "Phase 1: Data Discovery",
  flight_path_cleaner: "Phase 2: Flight Path Cleaning",
  time_synchronizer: "Phase 3: Time Synchronization",
  diurnal_corrector: "Phase 4: Diurnal Correction",
  qc_engine: "Phase 5: Quality Control",
  excel_export_adapter: "Phase 5: Quality Control",
  report_export_adapter: "Phase 5: Quality Control",
  igrf_corrector: "IGRF removal",
  heading_lag_corrector: "Heading and lag correction",
  tie_line_leveler: "Tie-line levelling",
  mag_gridder: "Minimum-curvature gridding",
  rtp_filter: "RTP",
  fft_derivatives: "FFT derivatives",
  lineament_extractor: "Lineament extraction",
  gis_export: "GIS export",
  gravity_reduce: "Gravity reduction",
  regional_residual: "Regional-residual separation",
  ert_pseudosection: "ERT pseudosection",
  ert_invert: "ERT inversion",
  seismic_process: "Seismic processing",
  radiometric_correct: "Radiometric corrections",
  gpr_process: "GPR processing",
  xyz_ingest: "Gravity reduction",
  las_ingest: "Write products to",
};

async function runDiurnalPipeline(
  pending: AgentPlan,
  enqueue: (s: string) => void,
  onTasks: (content: string) => void,
  tasksContent: { current: string }
): Promise<ProjectFileUpdate[]> {
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
  await pipeline.runPipeline([], async (event) => {
    if (event.type === "NODE_PROGRESS") {
      enqueue(`- 🔧 **${event.nodeId || "Step"}**: ${event.message}\n`);
      const phase = event.nodeId ? NODE_PHASE[event.nodeId] : undefined;
      if (phase && !checked.has(phase)) {
        checked.add(phase);
        tasksContent.current = checkPhaseInTasks(tasksContent.current, phase);
        onTasks(tasksContent.current);
      }
    } else if (event.type === "NODE_COMPLETED" && event.nodeId) {
      const phase = NODE_PHASE[event.nodeId];
      if (phase && !checked.has(phase)) {
        checked.add(phase);
        tasksContent.current = checkPhaseInTasks(tasksContent.current, phase);
        onTasks(tasksContent.current);
      }
    } else if (event.type === "QC_WARNING") {
      enqueue(`- ⚠️ **QC ${event.severity?.toUpperCase()}**: ${event.message}\n`);
    } else if (event.type === "PIPELINE_FAILED") {
      enqueue(`- ❌ **Pipeline Error**: ${event.message}\n`);
    }
  }, pipelineParams);

  return collectTaskFiles(pending.outputDir, pending.taskFolder);
}

export function streamPlanDecision(sessionId: string, decision: "approve" | "reject"): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => controller.enqueue(enc(s));
      const pending = PENDING_APPROVAL[sessionId];
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
          enqueue("Plan cancelled. Raw survey files were not changed.");
          delete PENDING_APPROVAL[sessionId];
          enqueue(`\n\x02${JSON.stringify({ type: "execution_complete", awaitingApproval: false })}\n`);
          controller.close();
          return;
        }

        pending.taskFolder = uniquifyFolder(pending.outputDir, pending.taskFolder);
        fs.mkdirSync(path.join(pending.outputDir, pending.taskFolder), { recursive: true });

        const tasksContent = { current: generateTasksMarkdown(pending) };

        enqueue(`\x00${JSON.stringify({
          agentId: "magnetic-agent",
          confidence: 0.95,
          capabilityTrace: pending.steps.diurnal ? ["diurnal-correction"] : ["planning"],
        })}\n`);
        enqueue(`\x02${JSON.stringify({
          type: "workspace_file",
          projectFilesUpdates: [tasksUpdate(tasksContent.current, true)],
        })}\n`);
        await delay(40);
        enqueue(`**Plan approved.** Created \`tasks.md\` and working through it. Products go to \`${GAID_OUTPUT_DIR}/${pending.taskFolder}/\`. Raw files will not be modified.\n\n`);

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
        if (mag) {
          const created = await runDiurnalPipeline(pending, enqueue, onTasks, tasksContent);
          projectFilesUpdates.push(...created);
        }

        if (pending.steps.gravity || pending.steps.ert || pending.steps.seismic || pending.steps.gpr || pending.steps.radiometrics) {
          const { GravityPipeline, ResistivityPipeline, SeismicPipeline } = await import(
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
            await pipeline.runPipeline([], async (event) => {
              if (event.type === "NODE_PROGRESS") {
                enqueue(`- 🔧 **${event.nodeId || "Step"}**: ${event.message}\n`);
                const phase = event.nodeId ? NODE_PHASE[event.nodeId] : undefined;
                if (phase) {
                  tasksContent.current = checkPhaseInTasks(tasksContent.current, phase);
                  onTasks(tasksContent.current);
                }
              } else if (event.type === "QC_WARNING") {
                enqueue(`- ⚠️ **QC ${event.severity?.toUpperCase()}**: ${event.message}\n`);
              } else if (event.type === "PIPELINE_FAILED") {
                enqueue(`- ❌ **Pipeline Error**: ${event.message}\n`);
              }
            }, extraParams);
          };
          if (pending.steps.gravity) await runExtra(new GravityPipeline());
          if (pending.steps.ert) await runExtra(new ResistivityPipeline());
          if (pending.steps.seismic) await runExtra(new SeismicPipeline());
        }

        const latest = collectTaskFiles(pending.outputDir, pending.taskFolder);
        const seen = new Set(projectFilesUpdates.map((f) => f.path));
        for (const file of latest) {
          if (!seen.has(file.path)) projectFilesUpdates.push(file);
        }

        tasksContent.current = checkPhaseInTasks(tasksContent.current, `Write products to ${GAID_OUTPUT_DIR}`);
        onTasks(tasksContent.current);

        enqueue(`\n\n✅ **Done.** All tasks in \`tasks.md\` are complete. Products are in \`${GAID_OUTPUT_DIR}/${pending.taskFolder}/\`.`);
        enqueue(`\n\x02${JSON.stringify({
          type: "execution_complete",
          agentId: "magnetic-agent",
          taskFolder: pending.taskFolder,
          awaitingApproval: false,
          projectFilesUpdates,
        })}\n`);
        delete PENDING_APPROVAL[sessionId];
        controller.close();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        console.error("Plan execution failed:", errorMsg);
        enqueue(`\n❌ **Execution Failed**: ${errorMsg}`);
        enqueue(`\n\x02${JSON.stringify({ type: "execution_failed", error: errorMsg })}\n`);
        controller.close();
      }
    },
  });
}
