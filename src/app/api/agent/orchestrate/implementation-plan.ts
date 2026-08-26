import fs from "fs";
import path from "path";
import { GAID_OUTPUT_DIR } from "@/lib/workspace-index";
import { EMPTY_STEPS, MAGNETIC_STEP_KEYS, REGISTERED_MAG_NODE_IDS, STEP_NODE_IDS, type AgentPlan, type PlanSteps } from "@/lib/plan-spec";
import { pendingPlansPath } from "@/lib/run-layout";
import { checkNodeInTasks } from "@/lib/tasks-tick";

export { EMPTY_STEPS, type AgentPlan, type PlanSteps, checkNodeInTasks };

const globalAny = global as any;
if (!globalAny.PENDING_APPROVAL) {
  globalAny.PENDING_APPROVAL = {};
}
const PENDING_APPROVAL: Record<string, AgentPlan> = globalAny.PENDING_APPROVAL;

function loadPlansFromDisk(workspaceRoot?: string): Record<string, AgentPlan> {
  if (!workspaceRoot) return {};
  try {
    const store = pendingPlansPath(workspaceRoot);
    if (!fs.existsSync(store)) return {};
    const parsed = JSON.parse(fs.readFileSync(store, "utf8")) as Record<string, AgentPlan>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePlansToDisk(workspaceRoot: string, plans: Record<string, AgentPlan>): void {
  try {
    const store = pendingPlansPath(workspaceRoot);
    fs.mkdirSync(path.dirname(store), { recursive: true });
    fs.writeFileSync(store, `${JSON.stringify(plans, null, 2)}\n`);
  } catch {
    /* in-memory pending plan still works in this process */
  }
}

export function getPendingPlan(sessionId: string, workspaceRoot?: string): AgentPlan | undefined {
  if (PENDING_APPROVAL[sessionId]) return PENDING_APPROVAL[sessionId];
  const root = workspaceRoot || Object.values(PENDING_APPROVAL).find((plan) => plan.workspaceRoot)?.workspaceRoot;
  if (!root) return undefined;
  const disk = loadPlansFromDisk(root);
  if (disk[sessionId]) {
    PENDING_APPROVAL[sessionId] = disk[sessionId];
    return disk[sessionId];
  }
  return undefined;
}

export function setPendingPlan(sessionId: string, plan: AgentPlan): void {
  PENDING_APPROVAL[sessionId] = plan;
  if (!plan.workspaceRoot) return;
  savePlansToDisk(plan.workspaceRoot, { ...loadPlansFromDisk(plan.workspaceRoot), [sessionId]: plan });
}

export function clearPendingPlan(sessionId: string): void {
  const existing = PENDING_APPROVAL[sessionId];
  delete PENDING_APPROVAL[sessionId];
  const root = existing?.workspaceRoot;
  if (!root) return;
  const disk = loadPlansFromDisk(root);
  delete disk[sessionId];
  savePlansToDisk(root, disk);
}

const generateImplementationPlan = (
  projectName: string,
  targetFolder: string,
  taskFolder: string,
  workspaceRoot?: string
): string => {
  const scanTarget = targetFolder || "(opened folder)";
  const rootLine = workspaceRoot ? `\n**Workspace:** \`${workspaceRoot}\`\n` : "\n";
  return `# Diurnal Analysis Implementation Plan

This plan outlines the design and implementation for correcting diurnal variations in magnetic survey data using the magnetic-agent kernel. The goal is to ingest raw survey files, align timestamps, and apply accurate diurnal corrections.
${rootLine}
## User Review Required

> [!IMPORTANT]
> The diurnal correction formula assumes standard GSM-19 base and MagArrow airborne formats. If your data uses a different format, please notify before proceeding so we can adjust the parsing logic.

> [!TIP]
> To ensure maximum accuracy, the Time Synchronizer will linearly interpolate base station readings. The final output will include a detailed QC report with statistical outlier analysis.

## Open Questions

- **Base Reference Value**: Should we use the \`mean_base\` reference method or a specific numerical baseline value for the correction?
- **Filtering Thresholds**: Do you have specific altitude or signal quality thresholds for the Flight Path Cleaner?

## Proposed Changes

We will create a new task directory at \`${GAID_OUTPUT_DIR}/${taskFolder}\` for project \`${projectName}\` and target dataset \`${scanTarget}\`.

### Phase 1: Data Discovery
- Scan \`${scanTarget}\` for airborne and base station data
- Auto-classify files by format (GSM-19 base, MagArrow airborne)

### Phase 2: Data Cleaning
- Remove spurious readings and noise
- Filter by altitude and signal quality thresholds

### Phase 3: Time Synchronization
- Align airborne and base station timestamps
- Interpolate base readings to airborne times

### Phase 4: Diurnal Correction
- Apply correction formula: \`CorrectedMag = AirborneMag - BaseInterpolated + BaseReferenceValue\`

### Phase 5: Quality Control
- Validate corrected data and check for statistical outliers
- Generate \`qc_report.json\` and \`diurnal_analysis.xlsx\`
`;
};

function nextTaskFolder(outputDir: string): string {
  let next = 1;
  try {
    if (fs.existsSync(outputDir)) {
      const nums = fs
        .readdirSync(outputDir)
        .map((name) => {
          const match = name.match(/^task\s+(\d+)/i);
          return match ? parseInt(match[1], 10) : NaN;
        })
        .filter((n) => Number.isFinite(n));
      if (nums.length) next = Math.max(...nums) + 1;
    }
  } catch {
    /* start at 1 */
  }
  return `task ${next}`;
}

const generateTasksMarkdown = (plan: {
  projectName: string;
  taskFolder: string;
  productsRel?: string;
  targetFolder?: string;
  steps: PlanSteps;
  parameters?: { baseReference?: string };
  runId?: string;
}): string => {
  const target = plan.targetFolder || plan.projectName;
  const registered = new Set<string>(REGISTERED_MAG_NODE_IDS);
  const nodeTag = (ids: string[]): string =>
    ids
      .filter((id) => registered.has(id))
      .map((id) => `<!-- node:${id} -->`)
      .join(" ");

  const lines = [
    `# Tasks`,
    ``,
    `**Project:** ${plan.projectName}`,
    `**Target:** ${target}`,
    `**Products:** \`${plan.productsRel || `${GAID_OUTPUT_DIR}/runs/${plan.taskFolder}`}/\``,
    plan.runId ? `**Run:** \`${plan.runId}\`` : "",
    plan.parameters?.baseReference ? `**Base reference:** \`${plan.parameters.baseReference}\`` : "",
    ``,
    `This file is the working checklist. Items are checked off as G-AID finishes each registered step.`,
    ``,
    `## Tasks`,
    ``,
  ].filter((line, i, arr) => line !== "" || arr[i - 1] !== "");

  if (plan.steps.diurnal) {
    lines.push(
      `- [ ] Phase 1: Data Discovery ${nodeTag(STEP_NODE_IDS.diurnal.slice(0, 1))}`,
      `  - [ ] Scan ${target} for MagArrow and GSM-19 files`,
      `  - [ ] Classify airborne vs base station data`,
      `  - [ ] Generate canonical CSV outputs`,
      ``,
      `- [ ] Phase 2: Flight Path Cleaning ${nodeTag(["flight_path_cleaner"])}`,
      `  - [ ] Filter spurious readings`,
      `  - [ ] Apply altitude thresholds`,
      `  - [ ] Remove noise outliers`,
      ``,
      `- [ ] Phase 3: Time Synchronization ${nodeTag(["time_synchronizer"])}`,
      `  - [ ] Align timestamps`,
      `  - [ ] Interpolate base readings`,
      `  - [ ] Validate temporal alignment`,
      ``,
      `- [ ] Phase 4: Diurnal Correction ${nodeTag(["diurnal_corrector"])}`,
      `  - [ ] Compute reference value`,
      `  - [ ] Apply correction formula`,
      `  - [ ] Generate corrected dataset`,
      ``,
      `- [ ] Phase 5: Quality Control ${nodeTag(["qc_engine", "excel_export_adapter", "report_export_adapter"])}`,
      `  - [ ] Statistical validation`,
      `  - [ ] Generate QC report`,
      `  - [ ] Export maps and tables`,
      ``
    );
  }

  if (plan.steps.igrf) lines.push(`- [ ] IGRF removal ${nodeTag(STEP_NODE_IDS.igrf)}`, `  - [ ] Evaluate IGRF-13 at each sample`, `  - [ ] Write residual and inclination/declination`, ``);
  if (plan.steps.headingLag) lines.push(`- [ ] Heading and lag correction ${nodeTag(STEP_NODE_IDS.headingLag)}`, ``);
  if (plan.steps.level) {
    lines.push(
      `- [ ] Tie-line levelling ${nodeTag(STEP_NODE_IDS.level)}`,
      `  - [ ] Classify traverse vs tie`,
      `  - [ ] Hold ties, shift traverses`,
      ``
    );
  }
  if (plan.steps.grid) lines.push(`- [ ] Minimum-curvature gridding ${nodeTag(STEP_NODE_IDS.grid)}`, `  - [ ] Write GeoTIFF / ASCII grid`, ``);
  if (plan.steps.rtp) lines.push(`- [ ] RTP ${nodeTag(STEP_NODE_IDS.rtp)}`, `  - [ ] FFT reduction-to-pole (or RTE if |I|<10°)`, ``);
  if (plan.steps.derivatives) {
    lines.push(
      `- [ ] MAGMAP ${nodeTag(["fft_derivatives"])}`,
      `  - [ ] RTP/TMI, 1VD, 2VD, AS, THD, tilt, pseudo-gravity, continuation`,
      `- [ ] Euler deconvolution ${nodeTag(["euler_deconvolution"])}`,
      ``
    );
  }
  if (plan.steps.lineaments) lines.push(`- [ ] Lineament extraction ${nodeTag(STEP_NODE_IDS.lineaments)}`, ``);
  if (plan.steps.gis) lines.push(`- [ ] GIS export ${nodeTag(["gis_export"])}`, ``);

  const magAsked = MAGNETIC_STEP_KEYS.some((key) => plan.steps[key]);
  if (!magAsked) {
    lines.push(`- [ ] No registered magnetic nodes to execute`, ``);
  }

  lines.push(
    `- [ ] Write products to ${GAID_OUTPUT_DIR}/runs <!-- node:write_products -->`,
    ``,
    `---`,
    ``,
    `*Execution started: ${new Date().toISOString()}*`
  );
  return lines.join("\n");
};

/** Check a top-level task and its nested items. */
const checkPhaseInTasks = (content: string, phaseHeading: string): string => {
  const lines = content.split("\n");
  let inPhase = false;
  const heading = phaseHeading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingRe = new RegExp(`^- \\[ \\] ${heading}\\b`);
  return lines
    .map((line) => {
      if (headingRe.test(line)) {
        inPhase = true;
        return line.replace("- [ ] ", "- [x] ");
      }
      if (inPhase && /^- \[[ x]\] Phase /.test(line)) {
        inPhase = false;
      }
      if (inPhase && /^- \[[ x]\] (IGRF|Heading|Tie-line|Minimum-curvature|RTP|MAGMAP|FFT derivatives|Lineament|GIS export|Report maps|2-D microlevelling|Gravity|Regional-residual|ERT|Seismic|Radiometric|GPR|Write products)/.test(line) && !headingRe.test(line)) {
        inPhase = false;
      }
      if (inPhase && /^- \[[ x]\] Write products/.test(line) && !phaseHeading.startsWith("Write products")) {
        inPhase = false;
      }
      if (inPhase && /^  - \[ \] /.test(line)) {
        return line.replace("- [ ] ", "- [x] ");
      }
      if (line.startsWith("---")) inPhase = false;
      return line;
    })
    .join("\n");
};

const updateTaskProgress = (tasksPath: string, completedPhase: string, status: "in_progress" | "complete"): string => {
  let content = fs.readFileSync(tasksPath, "utf-8");
  const checkbox = status === "in_progress" ? "- [!s] " : "- [x] ";
  const oldBox = "- [ ] ";
  content = content.replace(oldBox + completedPhase, checkbox + completedPhase);
  fs.writeFileSync(tasksPath, content);
  return content;
};

// Export for external use
export { generateImplementationPlan, generateTasksMarkdown, updateTaskProgress, checkPhaseInTasks, PENDING_APPROVAL, nextTaskFolder };