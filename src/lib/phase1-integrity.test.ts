import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { allocateApprovedRun, hashPlan, pendingPlansPath, writeFrozenPlanJson } from "./run-layout.ts";
import { copyToOutputRelative, shouldCopySourceSave } from "./source-file-safety.ts";
import { ACTIVITY_BAR_VIEWS, isDemoOnlySurface, isNormalWorkflowView } from "./demo-surfaces.ts";
import { rasterLayersFromPaths, listJobFolders } from "./raster-layers.ts";
import { EMPTY_STEPS, magneticStepsEnabled, registeredNodesForSteps, validatePlan, type AgentPlan } from "./plan-spec.ts";
import { inferIntentFromFiles, intentToSteps } from "./plan-intent.ts";
import { detectAnalysisIntent } from "./workspace-index.ts";

const require = createRequire(path.join(process.cwd(), "src/lib/phase1-integrity.test.ts"));

let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok  ${name}`);
    console.error(err);
  }
}

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-phase1-"));
}

function basePlan(root: string, overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    plan: "# Implementation Plan\n",
    taskFolder: "",
    outputDir: "",
    productsRel: "",
    workspaceRoot: root,
    targetFolder: "DAY 1",
    projectName: "SURVEY",
    intent: "magnetic",
    steps: { ...EMPTY_STEPS, diurnal: true },
    parameters: { baseReference: "mean_base" },
    workspaceBrief: "MagArrow airborne: 1\nGSM-19 base station: 1",
    rev: 1,
    notes: [],
    status: "draft",
    ...overrides,
  };
}

test("rerunning creates a new run folder without modifying the first", () => {
  const root = tmpWorkspace();
  try {
    const first = allocateApprovedRun(basePlan(root, { runId: "r-first" }));
    const run1 = path.join(first.outputDir, first.taskFolder);
    fs.mkdirSync(run1, { recursive: true });
    const marker = path.join(run1, "marker.txt");
    fs.writeFileSync(marker, "original-run\n");
    writeFrozenPlanJson({ ...first, status: "complete" });

    const second = allocateApprovedRun({ ...first, status: "complete" });
    assert.notEqual(second.runId, first.runId);
    assert.equal(second.parentRunId, first.runId);
    assert.equal(fs.readFileSync(marker, "utf8"), "original-run\n");
    assert.equal(fs.existsSync(path.join(second.outputDir, second.taskFolder)), false);
    assert.ok(fs.existsSync(path.join(run1, "plan.json")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("incomplete magnetic input blocks diurnal execution", () => {
  const roverOnly = validatePlan(
    basePlan("/surveys/TEMA", {
      workspaceBrief: "MagArrow airborne: 4\nGSM-19 base station: 0",
    })
  );
  assert.equal(roverOnly.ok, false);
  assert.equal(roverOnly.blockers.some((issue) => issue.code === "incomplete_mag"), true);

  const baseOnly = validatePlan(
    basePlan("/surveys/TEMA", {
      workspaceBrief: "MagArrow airborne: 0\nGSM-19 base station: 1",
    })
  );
  assert.equal(baseOnly.ok, false);
  assert.equal(baseOnly.blockers.some((issue) => issue.code === "incomplete_mag"), true);
});

test("a non-magnetic request does not create a magnetic plan", () => {
  const ert = intentToSteps("resistivity", "run ERT on line 4");
  assert.equal(ert.diurnal, false);
  assert.equal(ert.igrf, false);
  assert.equal(ert.grid, false);
  assert.equal(magneticStepsEnabled(ert), false);
  assert.equal(ert.ert, true);

  const detected = detectAnalysisIntent("process the ERT pseudosection on LINE 4");
  assert.equal(detected, "resistivity");
  const intent = inferIntentFromFiles(detected, {
    root: "/surveys/LINE",
    folders: ["LINE 4"],
    files: [{ relativePath: "LINE 4/pseudo.dat", name: "pseudo.dat", size: 20, ext: ".dat", kind: "tabular" }],
    truncated: false,
  }, "LINE 4", "process the ERT pseudosection on LINE 4");
  assert.equal(intent, "resistivity");
  const steps = intentToSteps(intent, "process the ERT pseudosection on LINE 4");
  assert.equal(magneticStepsEnabled(steps), false);
  const check = validatePlan(
    basePlan("/surveys/LINE", {
      intent,
      steps,
      targetFolder: "LINE 4",
      workspaceBrief: "MagArrow airborne: 0\nGSM-19 base station: 0",
    })
  );
  assert.equal(check.ok, false);
  assert.equal(check.blockers.some((issue) => issue.code === "unsupported_method"), true);
});

test("source-file overwrite is blocked and copied under G-AID Output", () => {
  assert.equal(shouldCopySourceSave("DAY 1/rover.csv", true), true);
  assert.equal(shouldCopySourceSave("G-AID Output/runs/r1/tmi_grid.asc", true), false);
  assert.equal(copyToOutputRelative("DAY 1/rover.csv"), "G-AID Output/edits/DAY 1/rover.csv");

  const root = tmpWorkspace();
  try {
    const srcRel = path.join("DAY 1", "rover.csv");
    fs.mkdirSync(path.join(root, "DAY 1"), { recursive: true });
    const src = path.join(root, srcRel);
    fs.writeFileSync(src, "original\n");
    const ws = require(path.join(process.cwd(), "electron/workspace-fs.js"));
    const written = ws.saveWorkspaceFile(root, srcRel.replace(/\\/g, "/"), "edited\n");
    assert.equal(fs.readFileSync(src, "utf8"), "original\n");
    assert.match(String(written).replace(/\\/g, "/"), /G-AID Output\/edits\//);
    assert.equal(fs.readFileSync(path.join(root, written), "utf8"), "edited\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a completed magnetic run can open a generated ASCII-grid map", () => {
  const files = [
    "G-AID Output/runs/r20260826-abcd/tmi_grid.tif",
    "G-AID Output/runs/r20260826-abcd/tmi_grid.asc",
    "G-AID Output/runs/r20260826-abcd/plan.json",
  ];
  const layers = rasterLayersFromPaths(files);
  assert.equal(layers.length, 1);
  assert.equal(layers[0].id.endsWith(".asc"), true);
  const jobs = listJobFolders(files, "G-AID Output");
  assert.deepEqual(jobs, ["G-AID Output/runs/r20260826-abcd"]);
});

test("fake/demo components are not reachable from the normal workflow", () => {
  assert.equal(isDemoOnlySurface("ai-center"), true);
  assert.equal(isDemoOnlySurface("seeded-ert-plotly"), true);
  assert.equal(isDemoOnlySurface("fake-upload-progress"), true);
  assert.equal(isDemoOnlySurface("mock-drill-targets"), true);
  assert.equal(isNormalWorkflowView("ai-center"), false);
  assert.equal(ACTIVITY_BAR_VIEWS.includes("ai-center" as (typeof ACTIVITY_BAR_VIEWS)[number]), false);

  const page = fs.readFileSync(path.join(process.cwd(), "src/app/workspace/page.tsx"), "utf8");
  assert.equal(page.includes("from \"@/components/workspace/ai-center\""), false);
  assert.equal(page.includes("AI_INSIGHTS"), false);
  assert.equal(page.includes("UploadModal"), false);

  const plotly = fs.readFileSync(path.join(process.cwd(), "src/components/charts/plotly-chart.tsx"), "utf8");
  assert.equal(plotly.includes("generateResistivityData"), false);
  assert.equal(plotly.includes("seededUnit"), false);

  const upload = fs.readFileSync(path.join(process.cwd(), "src/components/workspace/upload-modal.tsx"), "utf8");
  assert.equal(upload.includes("simulateUpload"), false);

  const orchestra = fs.readFileSync(path.join(process.cwd(), "src/lib/ollama-orchestra.ts"), "utf8");
  assert.equal(orchestra.includes("confidence: isAnalysis ? 0.95"), false);
});

test("tasks.md only lists registered magnetic nodes", () => {
  const impl = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/agent/orchestrate/implementation-plan.ts"),
    "utf8"
  );
  assert.equal(impl.includes("grid_microleveller"), false);
  assert.equal(impl.includes("map_composer"), false);
  assert.equal(/plan\.steps\.ert/.test(impl), false);
  assert.equal(/plan\.steps\.gravity/.test(impl), false);
  const nodes = registeredNodesForSteps({ ...EMPTY_STEPS, diurnal: true, level: true });
  assert.equal(nodes.includes("grid_microleveller"), false);
  assert.equal(nodes.includes("tie_line_leveler"), true);
  assert.equal(nodes.includes("file_discovery"), true);
});

test("completed-run record is plan.json in the run folder, not /tmp", () => {
  const root = tmpWorkspace();
  try {
    const plan = allocateApprovedRun(basePlan(root, { runId: "r-record" }));
    const frozen = writeFrozenPlanJson({ ...plan, status: "complete", planHash: hashPlan(plan) });
    assert.ok(frozen.includes(`${path.sep}G-AID Output${path.sep}runs${path.sep}r-record${path.sep}plan.json`));
    assert.equal(frozen.includes(`${path.sep}tmp${path.sep}g-aid-pending`), false);
    const pending = pendingPlansPath(root);
    assert.ok(pending.replace(/\\/g, "/").endsWith("G-AID Output/.pending-plans.json"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
