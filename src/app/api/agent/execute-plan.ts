import fs from "fs";
import path from "path";
import { TEMP_TASKS_ID } from "@/lib/workspace-file-ids";
import { workStepFromEvent } from "@/lib/work-steps";
import { checkNodeInTasks } from "@/lib/tasks-tick";
import { ertStepsEnabled, gprStepsEnabled, gravityStepsEnabled, magneticStepsEnabled, radiometricsStepsEnabled, validatePlan } from "@/lib/plan-spec";
import {
  allocateApprovedRun,
  appendRunLog,
  checksumPlanInputs,
  hashPlan,
  planHashMatches,
  RUN_PLAN_MD,
  RUN_TASKS_MD,
  writeFrozenPlanJson,
  writeRunFile,
} from "@/lib/run-layout";
import { loadProjectCatalog } from "@/lib/catalog";
import { compiledNodeIds } from "@/lib/capabilities/compile";
import { catalogInputsPayload, verifyBoundInputIdentity } from "@/lib/capabilities/inputs";
import { dagForPlan } from "@/lib/capabilities";
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

const RUN_DOC_SKIP = new Set([
  "implementation plan.md",
  "implementation-plan.md",
  "tasks.md",
  "plan.json",
]);

function relativeToWorkspace(workspaceRoot: string, absPath: string): string {
  return path.relative(workspaceRoot, absPath).replace(/\\/g, "/");
}

function collectTaskFiles(
  workspaceRoot: string,
  outputDir: string,
  taskFolder: string
): ProjectFileUpdate[] {
  const taskDir = path.join(outputDir, taskFolder);
  const projectFilesUpdates: ProjectFileUpdate[] = [];
  if (!fs.existsSync(taskDir)) return projectFilesUpdates;

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "logs") continue;
        walk(filePath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (RUN_DOC_SKIP.has(entry.name.toLowerCase())) continue;
      const rel = relativeToWorkspace(workspaceRoot, filePath);
      projectFilesUpdates.push({
        id: rel,
        name: entry.name,
        type: "file",
        path: rel,
      });
    }
  };
  walk(taskDir);
  return projectFilesUpdates;
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

function persistRunDocs(pending: AgentPlan, tasksContent: string): void {
  try {
    writeRunFile(pending, RUN_PLAN_MD, pending.plan || "");
    writeRunFile(pending, RUN_TASKS_MD, tasksContent);
    writeFrozenPlanJson(pending);
  } catch {
    /* checklist still runs */
  }
}

function logEvent(pending: AgentPlan, event: { type?: string; nodeId?: string; message?: string }): void {
  try {
    appendRunLog(
      pending,
      JSON.stringify({
        at: new Date().toISOString(),
        type: event.type,
        nodeId: event.nodeId,
        message: event.message,
      })
    );
  } catch {
    /* logs are best-effort */
  }
}

async function runDiurnalPipeline(
  pending: AgentPlan,
  enqueue: (s: string) => void,
  onTasks: (content: string) => void,
  tasksContent: { current: string }
): Promise<{ files: ProjectFileUpdate[]; ok: boolean }> {
  const { MagneticPreprocessingPipeline } = await import("@/pipeline/MagneticPreprocessingPipeline");
  const dag = dagForPlan(pending);
  const nodeIds = compiledNodeIds(dag);
  if (!nodeIds.length) {
    enqueue("- ❌ **No compiled processing nodes.** Unregistered methods are not executed.\n");
    return { files: [], ok: false };
  }
  const pipeline = new MagneticPreprocessingPipeline(nodeIds);
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
    surveyLatitude: pending.parameters.surveyLatitude,
    elevationDatum: pending.parameters.elevationDatum,
    gravityUnits: pending.parameters.gravityUnits,
    crsEpsg: pending.parameters.crsEpsg,
    applyBullardB: pending.parameters.applyBullardB,
    terrainRadiusM: pending.parameters.terrainRadiusM,
    useDemExtent: pending.parameters.useDemExtent,
    applyIntermediateZone: pending.parameters.applyIntermediateZone || pending.steps.intermediateZoneTerrain,
    applyFarZone: pending.parameters.applyFarZone || pending.steps.farZoneTerrain,
    intermediateRadiusM: pending.parameters.intermediateRadiusM,
    farRadiusM: pending.parameters.farRadiusM,
    outerCellSizeM: pending.parameters.outerCellSizeM,
    gravityMapping: pending.parameters.gravityMapping,
    columnMapping: pending.parameters.gravityMapping,
    columnMappingReviewed: pending.parameters.columnMappingReviewed,
    radioMapping: pending.parameters.radioMapping,
    radioQuantity: (pending.inputs || []).find((item) => item.radioQuantity)?.radioQuantity,
    correctionHistory: (pending.inputs || []).find((item) => item.correctionHistory)?.correctionHistory,
    velocityMs: pending.parameters.velocityMs,
    fLowHz: pending.parameters.fLowHz,
    fHighHz: pending.parameters.fHighHz,
    applyDewow: pending.parameters.applyDewow,
    dewowWindow: pending.parameters.dewowWindow,
    applyTimeZero: pending.parameters.applyTimeZero,
    timeZeroThreshold: pending.parameters.timeZeroThreshold,
    applySecGain: pending.parameters.applySecGain,
    secPower: pending.parameters.secPower,
    secExp: pending.parameters.secExp,
    applyBandpass: pending.parameters.applyBandpass,
    filterOrder: pending.parameters.filterOrder,
    selectedCurves: pending.parameters.selectedCurves,
    collarCrsConfirmed: pending.parameters.collarCrsConfirmed,
    steps: pending.steps,
    runId: pending.runId,
    parentRunId: pending.parentRunId,
    planHash: pending.planHash,
    capabilities: pending.capabilities,
    dagNodeIds: nodeIds,
    catalogInputs: catalogInputsPayload(pending.workspaceRoot, pending.inputs || []),
  };

  const checked = new Set<string>();
  let failed = false;
  const ok = await pipeline.runPipeline([], async (event) => {
    logEvent(pending, event);
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
          persistRunDocs(pending, tasksContent.current);
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

function freezeApprovedPlan(pending: AgentPlan): AgentPlan {
  const dag = dagForPlan(pending);
  const withDag: AgentPlan = {
    ...pending,
    dag,
    capabilities: dag.requestedCapabilityIds,
  };
  const allocated = allocateApprovedRun(withDag);
  const approvedAt = new Date().toISOString();
  const withHash: AgentPlan = {
    ...allocated,
    status: "approved",
    approvedAt,
    inputs: checksumPlanInputs(allocated),
  };
  withHash.planHash = hashPlan(withHash);
  fs.mkdirSync(path.join(withHash.outputDir, withHash.taskFolder), { recursive: true });
  persistRunDocs(withHash, generateTasksMarkdown(withHash));
  return withHash;
}

export function streamPlanDecision(
  sessionId: string,
  decision: "approve" | "reject",
  workspaceRoot?: string
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const enqueue = (s: string) => controller.enqueue(enc(s));
      const pending = getPendingPlan(sessionId, workspaceRoot);
      try {
        if (!pending) {
          enqueue(`\x00${JSON.stringify({ agentId: "orchestrator-agent", confidence: 0, showConfidence: false })}\n`);
          enqueue("No pending implementation plan found for this chat. Ask G-AID to plan the analysis first.");
          enqueue(`\n\x02${JSON.stringify({ type: "execution_failed" })}\n`);
          controller.close();
          return;
        }

        if (decision === "reject") {
          enqueue(`\x00${JSON.stringify({ agentId: "orchestrator-agent", confidence: 0, showConfidence: false })}\n`);
          await delay(40);
          enqueue("Plan cancelled.");
          clearPendingPlan(sessionId);
          enqueue(`\n\x02${JSON.stringify({ type: "execution_complete", awaitingApproval: false })}\n`);
          controller.close();
          return;
        }

        const catalog = loadProjectCatalog(pending.workspaceRoot);
        const check = validatePlan(pending, catalog);
        if (!check.ok) {
          enqueue(`\x00${JSON.stringify({ agentId: "orchestrator-agent", confidence: 0, showConfidence: false })}\n`);
          enqueue(
            `I can't start yet. ${check.blockers.map((issue) => issue.message).join(" ")} Edit the plan or tell me what to change.`
          );
          enqueue(`\n\x02${JSON.stringify({
            type: "execution_failed",
            awaitingApproval: true,
            taskFolder: pending.taskFolder,
            blockers: check.blockers,
          })}\n`);
          controller.close();
          return;
        }

        const identity = verifyBoundInputIdentity(pending.workspaceRoot, pending.inputs || []);
        if (!identity.ok) {
          enqueue(`\x00${JSON.stringify({ agentId: "orchestrator-agent", confidence: 0, showConfidence: false })}\n`);
          enqueue(
            `Bound catalog data changed or is missing. ${identity.issues.map((issue) => issue.message).join(" ")} Create a revision after re-cataloguing.`
          );
          enqueue(`\n\x02${JSON.stringify({
            type: "execution_failed",
            awaitingApproval: true,
            identityIssues: identity.issues,
          })}\n`);
          controller.close();
          return;
        }

        const frozen = freezeApprovedPlan(pending);
        if (!planHashMatches(frozen)) {
          enqueue(`\x00${JSON.stringify({ agentId: "orchestrator-agent", confidence: 0, showConfidence: false })}\n`);
          enqueue("Proceed can only execute a hash-frozen plan. The plan hash did not match; I will not run.");
          enqueue(`\n\x02${JSON.stringify({ type: "execution_failed", awaitingApproval: true })}\n`);
          controller.close();
          return;
        }
        frozen.status = "executing";
        setPendingPlan(sessionId, frozen);

        const tasksContent = { current: generateTasksMarkdown(frozen) };
        persistRunDocs(frozen, tasksContent.current);

        enqueue(`\x00${JSON.stringify({
          agentId: "magnetic-agent",
          confidence: 0,
          showConfidence: false,
          capabilityTrace: frozen.steps.diurnal ? ["diurnal-correction"] : ["planning"],
        })}\n`);
        enqueue(`\x02${JSON.stringify({
          type: "workspace_file",
          projectFilesUpdates: [tasksUpdate(tasksContent.current, true)],
        })}\n`);
        await delay(40);
        enqueue(`**Plan approved.** Working through the checklist in \`${frozen.productsRel}/\`. A previous run is never overwritten.\n\n`);

        const onTasks = (content: string) => {
          persistRunDocs(frozen, content);
          enqueue(`\x02${JSON.stringify({
            type: "workspace_file",
            projectFilesUpdates: [tasksUpdate(content)],
          })}\n`);
        };

        const projectFilesUpdates: ProjectFileUpdate[] = [];
        let ranOk = true;
        const mag = magneticStepsEnabled(frozen.steps);
        const grav = gravityStepsEnabled(frozen.steps);
        const ert = ertStepsEnabled(frozen.steps);
        const radio = radiometricsStepsEnabled(frozen.steps);
        const gpr = gprStepsEnabled(frozen.steps);

        if (!mag && !grav && !ert && !radio && !gpr) {
          ranOk = false;
          enqueue("- ❌ **No registered steps to execute.** Seismic is not in this release. Height correction, stripping, and NASVD are not live radiometric capabilities.\n");
        } else if (!(frozen.inputs || []).length) {
          ranOk = false;
          enqueue("- ❌ **No bound catalog records.** I will not search the folder by extension. Bind supported MagArrow/GSM-19, gravity-contract, dem-ascii, ERT-contract, RAD-contract, and/or GPR-contract catalog IDs first.\n");
        } else {
          const created = await runDiurnalPipeline(frozen, enqueue, onTasks, tasksContent);
          projectFilesUpdates.push(...created.files);
          ranOk = created.ok;
        }

        const latest = collectTaskFiles(frozen.workspaceRoot, frozen.outputDir, frozen.taskFolder);
        const seen = new Set(projectFilesUpdates.map((f) => f.path));
        for (const file of latest) {
          if (!seen.has(file.path)) projectFilesUpdates.push(file);
        }

        frozen.lineage = { products: projectFilesUpdates.map((file) => file.path) };

        if (!ranOk) {
          frozen.status = "failed";
          persistRunDocs(frozen, tasksContent.current);
          setPendingPlan(sessionId, frozen);
          onTasks(tasksContent.current);
          enqueue(`\n\nStopped. This run did not finish. Click Proceed to retry — a new run folder will be created and this one stays as-is.`);
          enqueue(`\n\x02${JSON.stringify({
            type: "execution_failed",
            agentId: "magnetic-agent",
            taskFolder: frozen.taskFolder,
            productsRel: frozen.productsRel,
            runId: frozen.runId,
            awaitingApproval: true,
            projectFilesUpdates,
          })}\n`);
          controller.close();
          return;
        }

        tasksContent.current = checkNodeInTasks(tasksContent.current, "write_products", "complete");
        frozen.status = "complete";
        persistRunDocs(frozen, tasksContent.current);
        onTasks(tasksContent.current);

        enqueue(`\n\nFinished. Results are on the map under \`${frozen.productsRel}/\`.`);
        enqueue(`\n\x02${JSON.stringify({
          type: "execution_complete",
          agentId: "magnetic-agent",
          taskFolder: frozen.taskFolder,
          productsRel: frozen.productsRel,
          runId: frozen.runId,
          parentRunId: frozen.parentRunId,
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
