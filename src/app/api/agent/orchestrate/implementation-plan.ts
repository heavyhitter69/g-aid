import fs from "fs";

const globalAny = global as any;
if (!globalAny.PENDING_APPROVAL) {
  globalAny.PENDING_APPROVAL = {};
}
const PENDING_APPROVAL: Record<string, { plan: string; taskFolder: string; outputDir: string }> = globalAny.PENDING_APPROVAL;

const generateImplementationPlan = (projectName: string, targetFolder: string, taskFolder: string): string => {
  return `# Diurnal Analysis Implementation Plan

This plan outlines the design and implementation for correcting diurnal variations in magnetic survey data using the magnetic-agent kernel. The goal is to ingest raw survey files, align timestamps, and apply accurate diurnal corrections.

## User Review Required

> [!IMPORTANT]
> The diurnal correction formula assumes standard GSM-19 base and MagArrow airborne formats. If your data uses a different format, please notify before proceeding so we can adjust the parsing logic.

> [!TIP]
> To ensure maximum accuracy, the Time Synchronizer will linearly interpolate base station readings. The final output will include a detailed QC report with statistical outlier analysis.

## Open Questions

- **Base Reference Value**: Should we use the \`mean_base\` reference method or a specific numerical baseline value for the correction?
- **Filtering Thresholds**: Do you have specific altitude or signal quality thresholds for the Flight Path Cleaner?

## Proposed Changes

We will create a new task directory at \`g-aid output/${taskFolder}\` for project \`${projectName}\` and target dataset \`${targetFolder}\`.

### Phase 1: Data Discovery
- Scan \`${targetFolder}\` for airborne and base station data
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

const generateTasksMarkdown = (projectName: string, taskFolder: string): string => {
  return `# Diurnal Analysis Tasks

**Project:** ${projectName}
**Task Folder:** ${taskFolder}

## Tasks

- [ ] Phase 1: Data Discovery
  - [ ] Scan survey directory for files
  - [ ] Classify airborne vs base station data
  - [ ] Generate canonical CSV outputs

- [ ] Phase 2: Flight Path Cleaning
  - [ ] Filter spurious readings
  - [ ] Apply altitude thresholds
  - [ ] Remove noise outliers

- [ ] Phase 3: Time Synchronization
  - [ ] Align timestamps
  - [ ] Interpolate base readings
  - [ ] Validate temporal alignment

- [ ] Phase 4: Diurnal Correction
  - [ ] Compute reference value
  - [ ] Apply correction formula
  - [ ] Generate corrected dataset

- [ ] Phase 5: Quality Control
  - [ ] Statistical validation
  - [ ] Generate QC report
  - [ ] Export final artifacts

---

*Execution started: ${new Date().toISOString()}*
`;
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
export { generateImplementationPlan, generateTasksMarkdown, updateTaskProgress, PENDING_APPROVAL };