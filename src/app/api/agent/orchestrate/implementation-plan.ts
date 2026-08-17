import fs from "fs";
import { GAID_OUTPUT_DIR, type AnalysisIntent } from "@/lib/workspace-index";

export type PlanSteps = {
  diurnal: boolean;
  igrf: boolean;
  headingLag: boolean;
  level: boolean;
  grid: boolean;
  rtp: boolean;
  derivatives: boolean;
  lineaments: boolean;
  gis: boolean;
  gravity: boolean;
  residual: boolean;
  ert: boolean;
  ertInvert: boolean;
  seismic: boolean;
  radiometrics: boolean;
  gpr: boolean;
};

export const EMPTY_STEPS: PlanSteps = {
  diurnal: false,
  igrf: false,
  headingLag: false,
  level: false,
  grid: false,
  rtp: false,
  derivatives: false,
  lineaments: false,
  gis: false,
  gravity: false,
  residual: false,
  ert: false,
  ertInvert: false,
  seismic: false,
  radiometrics: false,
  gpr: false,
};

export interface AgentPlan {
  plan: string;
  taskFolder: string;
  outputDir: string;
  workspaceRoot: string;
  targetFolder: string;
  projectName: string;
  intent: AnalysisIntent;
  steps: PlanSteps;
  parameters: {
    baseReference: "mean_base" | "median_base" | "first_sample";
    surveyDate?: string;
    density?: number;
    inclination?: number;
    declination?: number;
    inputPath?: string;
  };
  workspaceBrief: string;
}

const globalAny = global as any;
if (!globalAny.PENDING_APPROVAL) {
  globalAny.PENDING_APPROVAL = {};
}
const PENDING_APPROVAL: Record<string, AgentPlan> = globalAny.PENDING_APPROVAL;

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
  targetFolder?: string;
  steps: PlanSteps;
  parameters?: { baseReference?: string };
}): string => {
  const target = plan.targetFolder || plan.projectName;
  const lines = [
    `# Tasks`,
    ``,
    `**Project:** ${plan.projectName}`,
    `**Target:** ${target}`,
    `**Products:** \`${GAID_OUTPUT_DIR}/${plan.taskFolder}/\``,
    plan.parameters?.baseReference ? `**Base reference:** \`${plan.parameters.baseReference}\`` : "",
    ``,
    `This file is the working checklist. Items are checked off as G-AID finishes each step.`,
    ``,
    `## Tasks`,
    ``,
  ].filter((line, i, arr) => line !== "" || arr[i - 1] !== "");

  if (plan.steps.diurnal) {
    lines.push(
      `- [ ] Phase 1: Data Discovery`,
      `  - [ ] Scan ${target} for files`,
      `  - [ ] Classify airborne vs base station data`,
      `  - [ ] Generate canonical CSV outputs`,
      ``,
      `- [ ] Phase 2: Flight Path Cleaning`,
      `  - [ ] Filter spurious readings`,
      `  - [ ] Apply altitude thresholds`,
      `  - [ ] Remove noise outliers`,
      ``,
      `- [ ] Phase 3: Time Synchronization`,
      `  - [ ] Align timestamps`,
      `  - [ ] Interpolate base readings`,
      `  - [ ] Validate temporal alignment`,
      ``,
      `- [ ] Phase 4: Diurnal Correction`,
      `  - [ ] Compute reference value`,
      `  - [ ] Apply correction formula`,
      `  - [ ] Generate corrected dataset`,
      ``,
      `- [ ] Phase 5: Quality Control`,
      `  - [ ] Statistical validation`,
      `  - [ ] Generate QC report`,
      `  - [ ] Export maps and tables`,
      ``
    );
  }

  if (plan.steps.igrf) lines.push(`- [ ] IGRF removal`, `  - [ ] Evaluate IGRF-13 at each sample`, `  - [ ] Write residual and inclination/declination`, ``);
  if (plan.steps.headingLag) lines.push(`- [ ] Heading and lag correction`, ``);
  if (plan.steps.level) lines.push(`- [ ] Tie-line levelling`, ``);
  if (plan.steps.grid) lines.push(`- [ ] Minimum-curvature gridding`, `  - [ ] Write GeoTIFF / ASCII grid`, ``);
  if (plan.steps.rtp) lines.push(`- [ ] RTP`, `  - [ ] FFT reduction-to-pole (or RTE if |I|<10°)`, ``);
  if (plan.steps.derivatives) lines.push(`- [ ] FFT derivatives`, `  - [ ] Analytic signal, 1VD, THD, tilt, continuation`, ``);
  if (plan.steps.lineaments) lines.push(`- [ ] Lineament extraction`, ``);
  if (plan.steps.gis) lines.push(`- [ ] GIS export`, ``);
  if (plan.steps.gravity) lines.push(`- [ ] Gravity reduction`, `  - [ ] Somigliana, free-air, Bouguer, Bullard B`, ``);
  if (plan.steps.residual) lines.push(`- [ ] Regional-residual separation`, ``);
  if (plan.steps.ert) lines.push(`- [ ] ERT pseudosection`, ``);
  if (plan.steps.ertInvert) lines.push(`- [ ] ERT inversion`, ``);
  if (plan.steps.seismic) lines.push(`- [ ] Seismic processing`, ``);
  if (plan.steps.radiometrics) lines.push(`- [ ] Radiometric corrections`, ``);
  if (plan.steps.gpr) lines.push(`- [ ] GPR processing`, ``);

  lines.push(
    `- [ ] Write products to ${GAID_OUTPUT_DIR}`,
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
      if (inPhase && /^- \[[ x]\] (IGRF|Heading|Tie-line|Minimum-curvature|RTP|FFT derivatives|Lineament|GIS export|Gravity|Regional-residual|ERT|Seismic|Radiometric|GPR|Write products)/.test(line) && !headingRe.test(line)) {
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