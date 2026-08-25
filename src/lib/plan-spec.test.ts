import assert from "node:assert/strict";
import { checkNodeInTasks } from "./tasks-tick.ts";
import { isProceedPhrase } from "./workspace-index.ts";
import {
  applyChatPatches,
  applyEditorAndChat,
  EMPTY_STEPS,
  mergePlanMarkdown,
  normalizePlan,
  parsePlanMarkdown,
  renderImplementationPlan,
  validateEditorMarkdown,
  validatePlan,
  type AgentPlan,
} from "./plan-spec.ts";

function plan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    plan: "",
    taskFolder: "DAY 2 - diurnal",
    outputDir: "/tmp/out",
    productsRel: "G-AID Output/DAY 2 - diurnal",
    workspaceRoot: "/surveys/TEMA",
    targetFolder: "DAY 2",
    projectName: "TEMA SURVEY",
    intent: "magnetic",
    steps: { ...EMPTY_STEPS, diurnal: true, igrf: true, headingLag: true, level: true, grid: true, rtp: true, derivatives: true, lineaments: true, gis: true },
    parameters: { baseReference: "mean_base" },
    workspaceBrief: "MagArrow airborne: 4\nGSM-19 base station: 1",
    rev: 1,
    notes: [],
    status: "draft",
    ...overrides,
  };
}

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

test("render/parse round-trip keeps steps and median base", () => {
  const markdown = renderImplementationPlan({
    projectName: "TEMA SURVEY",
    targetFolder: "DAY 2",
    taskFolder: "DAY 2 - diurnal+IGRF",
    productsRel: "G-AID Output/DAY 2 - diurnal+IGRF",
    steps: { ...EMPTY_STEPS, diurnal: true, igrf: true, grid: true },
    baseReference: "median_base",
  });
  const parsed = parsePlanMarkdown(markdown);
  assert.equal(parsed.thisRunFound, true);
  assert.equal(parsed.steps.diurnal, true);
  assert.equal(parsed.steps.igrf, true);
  assert.equal(parsed.steps.grid, true);
  assert.equal(parsed.steps.rtp, false);
  assert.equal(parsed.steps.level, false);
  assert.equal(parsed.baseReference, "median_base");
  assert.equal(parsed.targetFolder, "DAY 2");
});

test("deleting RTP from the editor disables RTP only", () => {
  const current = plan();
  const markdown = renderImplementationPlan({
    projectName: current.projectName,
    targetFolder: current.targetFolder,
    taskFolder: current.taskFolder,
    productsRel: current.productsRel,
    steps: { ...current.steps, rtp: false },
    baseReference: current.parameters.baseReference,
  });
  const merged = mergePlanMarkdown(current, markdown);
  assert.equal(merged.steps.rtp, false);
  assert.equal(merged.steps.diurnal, true);
  assert.equal(merged.steps.grid, true);
});

test("chat 'no rtp' on an existing plan does not rebuild the mag suite", () => {
  const existing = plan({
    steps: { ...EMPTY_STEPS, diurnal: true, igrf: true, headingLag: true, level: true, grid: true, rtp: true, gis: true },
  });
  const patched = applyChatPatches(existing, "skip levelling and no RTP, use median base");
  assert.equal(patched.steps.rtp, false);
  assert.equal(patched.steps.level, false);
  assert.equal(patched.steps.diurnal, true);
  assert.equal(patched.steps.igrf, true);
  assert.equal(patched.parameters.baseReference, "median_base");
});

test("only diurnal patch disables later mag products", () => {
  const patched = applyChatPatches(plan(), "only diurnal");
  assert.equal(patched.steps.diurnal, true);
  assert.equal(patched.steps.rtp, false);
  assert.equal(patched.steps.igrf, false);
  assert.equal(patched.steps.grid, false);
});

test("scientist restores IGRF when RTP is requested without it", () => {
  const next = normalizePlan(
    plan({
      steps: { ...EMPTY_STEPS, diurnal: true, rtp: true, grid: true },
    })
  );
  assert.equal(next.steps.igrf, true);
  assert.ok((next.notes || []).some((note) => /IGRF/i.test(note)));
});

test("Proceed is blocked when This run is empty", () => {
  const check = validateEditorMarkdown("# Implementation Plan\n\n## This run\n\n## Parameters\n");
  assert.equal(check.ok, false);
  assert.equal(check.blockers[0].code, "no_steps");
});

test("validatePlan blocks missing mag files for diurnal", () => {
  const check = validatePlan(
    plan({
      workspaceBrief: "MagArrow airborne: 0\nGSM-19 base station: 0",
      steps: { ...EMPTY_STEPS, diurnal: true },
    })
  );
  assert.equal(check.ok, false);
  assert.equal(check.blockers.some((issue) => issue.code === "no_mag_files"), true);
});

test("editor+chat: markdown no-RTP then chat skip levelling", () => {
  const markdown = renderImplementationPlan({
    projectName: "TEMA",
    targetFolder: "DAY 2",
    taskFolder: "DAY 2 - process",
    steps: { ...EMPTY_STEPS, diurnal: true, igrf: true, headingLag: true, level: true, grid: true, gis: true },
    baseReference: "mean_base",
  });
  const next = applyEditorAndChat(plan(), markdown, "Review feedback for the implementation plan: skip levelling");
  assert.equal(next.steps.rtp, false);
  assert.equal(next.steps.level, false);
  assert.equal(next.steps.diurnal, true);
});

test("tasks.md ticks only the completed node", () => {
  const tasks = [
    "# Tasks",
    "- [ ] IGRF removal <!-- node:igrf_corrector -->",
    "  - [ ] Evaluate IGRF-13",
    "- [ ] RTP <!-- node:rtp_filter -->",
    "  - [ ] FFT",
    "",
  ].join("\n");
  const done = checkNodeInTasks(tasks, "igrf_corrector", "complete");
  assert.match(done, /- \[x\] IGRF removal/);
  assert.match(done, /  - \[x\] Evaluate IGRF-13/);
  assert.match(done, /- \[ \] RTP/);
  const skipped = checkNodeInTasks(tasks, "rtp_filter", "skipped");
  assert.match(skipped, /- \[~\] RTP/);
});

test("approve phrase is recognised without treating review feedback as Proceed", () => {
  assert.equal(isProceedPhrase("I approve the implementation plan, please proceed."), true);
  assert.equal(isProceedPhrase("proceed"), true);
  assert.equal(isProceedPhrase("Review feedback for the implementation plan: skip levelling"), false);
  assert.equal(isProceedPhrase("how should I proceed with RTP?"), false);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
