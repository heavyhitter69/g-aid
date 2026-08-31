import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { refreshProjectCatalog, catalogFilePath } from "./catalog/persist.ts";
import {
  allocateApprovedRun,
  hashPlan,
  pendingPlansPath,
  writeFrozenPlanJson,
} from "./run-layout.ts";
import {
  isGaidStatePath,
  migrateLegacyProjectState,
  pendingPlansPath as statePendingPath,
  writePendingPlansFile,
} from "./project-state.ts";
import { EMPTY_STEPS, type AgentPlan } from "./plan-spec.ts";

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

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-state-"));
}

function writeSurvey(root: string) {
  fs.mkdirSync(path.join(root, "DAY 1"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "DAY 1", "rover.csv"),
    "latitude,longitude,mag\n1,2,3\n"
  );
}

function gaidOutputExists(root: string): boolean {
  return fs.existsSync(path.join(root, "G-AID Output"));
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
    workspaceBrief: "",
    rev: 1,
    notes: [],
    status: "draft",
    ...overrides,
  };
}

test("open/refresh catalog writes only .g-aid and does not create G-AID Output", () => {
  const root = tmpRoot();
  try {
    writeSurvey(root);
    const catalog = refreshProjectCatalog(root);
    assert.ok(catalog.records.length >= 1);
    assert.match(catalogFilePath(root).replace(/\\/g, "/"), /\/\.g-aid\/project\.catalog.json$/);
    assert.equal(fs.existsSync(catalogFilePath(root)), true);
    assert.equal(gaidOutputExists(root), false);
    assert.equal(fs.existsSync(path.join(root, "G-AID Output", "runs")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("pending plan and revision store only under .g-aid, not G-AID Output", () => {
  const root = tmpRoot();
  try {
    writeSurvey(root);
    refreshProjectCatalog(root);
    const first = writePendingPlansFile(root, { s1: basePlan(root, { status: "draft", rev: 1 }) });
    assert.equal(first, pendingPlansPath(root));
    assert.equal(fs.existsSync(pendingPlansPath(root)), true);
    assert.match(pendingPlansPath(root).replace(/\\/g, "/"), /\/\.g-aid\/pending-plans.json$/);
    assert.equal(gaidOutputExists(root), false);
    assert.equal(fs.existsSync(path.join(root, "G-AID Output", "Implementation Plan.md")), false);
    assert.equal(fs.existsSync(path.join(root, "G-AID Output", "tasks.md")), false);
    assert.equal(fs.existsSync(path.join(root, "G-AID Output", ".pending-plans.json")), false);

    writePendingPlansFile(root, { s1: basePlan(root, { status: "draft", rev: 2, notes: ["skip levelling"] }) });
    const stored = JSON.parse(fs.readFileSync(pendingPlansPath(root), "utf8"));
    assert.equal(stored.s1.rev, 2);
    assert.equal(gaidOutputExists(root), false);

    const impl = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/agent/orchestrate/implementation-plan.ts"),
      "utf8"
    );
    assert.match(impl, /writePendingPlansFile\(workspaceRoot, plans\)/);
    assert.match(impl, /migrateLegacyProjectState\(workspaceRoot\)/);
    assert.equal(impl.includes("G-AID Output/.pending-plans.json"), false);
    const agentPlan = fs.readFileSync(
      path.join(process.cwd(), "src/app/api/agent/orchestrate/agent-plan.ts"),
      "utf8"
    );
    assert.match(agentPlan, /setPendingPlan\(/);
    assert.equal(agentPlan.includes("mkdirSync"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("legacy catalog and pending plans copy into .g-aid without deleting G-AID Output products", () => {
  const root = tmpRoot();
  try {
    writeSurvey(root);
    const output = path.join(root, "G-AID Output");
    const runDir = path.join(output, "runs", "r-prior-1");
    fs.mkdirSync(runDir, { recursive: true });
    const product = path.join(runDir, "tmi_grid.asc");
    fs.writeFileSync(product, "ncols 1\n");
    const mapNote = path.join(output, "edits", "note.txt");
    fs.mkdirSync(path.dirname(mapNote), { recursive: true });
    fs.writeFileSync(mapNote, "user edit\n");
    const legacyCatalog = JSON.stringify({
      schemaVersion: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      workspaceRoot: root,
      records: [],
      runs: [{ runId: "r-prior-1", source: "disk" }],
    });
    fs.writeFileSync(path.join(output, "project.catalog.json"), `${legacyCatalog}\n`);
    const leftoverPending = JSON.stringify({ s1: { plan: "legacy", workspaceRoot: root } });
    fs.writeFileSync(path.join(output, ".pending-plans.json"), `${leftoverPending}\n`);

    const first = migrateLegacyProjectState(root);
    assert.equal(first.copies.find((item) => item.kind === "catalog")?.status, "copied");
    assert.equal(first.copies.find((item) => item.kind === "pending-plans")?.status, "copied");
    assert.equal(fs.existsSync(path.join(root, ".g-aid", "project.catalog.json")), true);
    assert.equal(fs.existsSync(statePendingPath(root)), true);
    assert.equal(fs.readFileSync(product, "utf8"), "ncols 1\n");
    assert.equal(fs.readFileSync(mapNote, "utf8"), "user edit\n");
    assert.equal(fs.existsSync(path.join(output, "project.catalog.json")), true);
    assert.equal(fs.existsSync(path.join(output, ".pending-plans.json")), true);
    assert.equal(fs.existsSync(path.join(root, ".g-aid", "migration.json")), true);

    const second = migrateLegacyProjectState(root);
    assert.equal(second.copies.find((item) => item.kind === "catalog")?.status, "kept-existing");
    assert.equal(second.copies.find((item) => item.kind === "pending-plans")?.status, "kept-existing");
    assert.equal(fs.readFileSync(product, "utf8"), "ncols 1\n");
    assert.equal(fs.readFileSync(mapNote, "utf8"), "user edit\n");

    const catalog = refreshProjectCatalog(root);
    assert.ok(catalog.runs.some((run) => run.runId === "r-prior-1"));
    assert.match(catalogFilePath(root).replace(/\\/g, "/"), /\/\.g-aid\/project\.catalog.json$/);
    assert.equal(fs.existsSync(path.join(output, "project.catalog.json")), true);
    assert.equal(fs.existsSync(path.join(output, ".pending-plans.json")), true);
    assert.equal(fs.readFileSync(product, "utf8"), "ncols 1\n");
    assert.equal(fs.readFileSync(mapNote, "utf8"), "user edit\n");
    assert.equal(fs.existsSync(path.join(output, "project.catalog.json")), true);
    // Refresh rewrites .g-aid catalog; leftover G-AID Output metadata is left in place.
    const afterRefresh = migrateLegacyProjectState(root);
    assert.equal(afterRefresh.copies.find((item) => item.kind === "catalog")?.status, "conflict");
    assert.equal(fs.readFileSync(path.join(root, ".g-aid", "project.catalog.json"), "utf8").includes("r-prior-1"), true);
    assert.equal(fs.readFileSync(path.join(output, "project.catalog.json"), "utf8"), `${legacyCatalog}\n`);
    assert.equal(fs.readFileSync(product, "utf8"), "ncols 1\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("conflicting .g-aid metadata is kept and leftover G-AID Output is not overwritten", () => {
  const root = tmpRoot();
  try {
    const stateDir = path.join(root, ".g-aid");
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, "project.catalog.json"), "{\"keep\":\"state\"}\n");
    fs.mkdirSync(path.join(root, "G-AID Output"), { recursive: true });
    fs.writeFileSync(path.join(root, "G-AID Output", "project.catalog.json"), "{\"keep\":\"legacy\"}\n");
    const result = migrateLegacyProjectState(root);
    const catalogCopy = result.copies.find((item) => item.kind === "catalog");
    assert.equal(catalogCopy?.status, "conflict");
    assert.ok(result.conflicts.length >= 1);
    assert.equal(fs.readFileSync(path.join(stateDir, "project.catalog.json"), "utf8"), "{\"keep\":\"state\"}\n");
    assert.equal(fs.readFileSync(path.join(root, "G-AID Output", "project.catalog.json"), "utf8"), "{\"keep\":\"legacy\"}\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Proceed freeze creates G-AID Output/runs/{runId} with plan docs, not before", () => {
  const root = tmpRoot();
  try {
    writeSurvey(root);
    refreshProjectCatalog(root);
    writePendingPlansFile(root, { "s-run": basePlan(root, { runId: "r-freeze-1", status: "draft" }) });
    assert.equal(gaidOutputExists(root), false);
    const allocated = allocateApprovedRun(basePlan(root, { runId: "r-freeze-1", status: "draft" }));
    assert.equal(gaidOutputExists(root), false);
    const frozen = writeFrozenPlanJson({ ...allocated, status: "approved", planHash: hashPlan(allocated) });
    assert.match(frozen.replace(/\\/g, "/"), /G-AID Output\/runs\/r-freeze-1\/plan.json$/);
    assert.equal(fs.existsSync(path.join(root, "G-AID Output", "runs", "r-freeze-1", "plan.json")), true);
    const execute = fs.readFileSync(path.join(process.cwd(), "src/app/api/agent/execute-plan.ts"), "utf8");
    const freezeFn = execute.indexOf("function freezeApprovedPlan");
    const mkdirAt = execute.indexOf("fs.mkdirSync(path.join(withHash.outputDir, withHash.taskFolder)");
    const persistDocs = execute.indexOf("persistRunDocs(withHash");
    assert.ok(freezeFn > 0 && mkdirAt > freezeFn && persistDocs > mkdirAt);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("no Python dispatch before frozen approval", () => {
  const execute = fs.readFileSync(path.join(process.cwd(), "src/app/api/agent/execute-plan.ts"), "utf8");
  const freezeAt = execute.indexOf("const frozen = freezeApprovedPlan(pending);");
  const pipelineAt = execute.indexOf("await runDiurnalPipeline(frozen");
  assert.ok(freezeAt > 0);
  assert.ok(pipelineAt > freezeAt);
  assert.match(execute, /if \(!planHashMatches\(frozen\)\)/);
  const persist = fs.readFileSync(path.join(process.cwd(), "src/lib/catalog/persist.ts"), "utf8");
  assert.equal(persist.includes("MagneticPreprocessingPipeline"), false);
  assert.equal(persist.includes("run-node"), false);
  const agentPlan = fs.readFileSync(path.join(process.cwd(), "src/app/api/agent/orchestrate/agent-plan.ts"), "utf8");
  assert.equal(agentPlan.includes("MagneticPreprocessingPipeline"), false);
  assert.equal(agentPlan.includes("runDiurnalPipeline"), false);
});

test("Dataset Explorer and file index hide .g-aid", () => {
  const explorer = fs.readFileSync(path.join(process.cwd(), "src/components/workspace/dataset-explorer.tsx"), "utf8");
  assert.match(explorer, /isGaidStatePath/);
  assert.match(explorer, /\.g-aid\/project\.catalog\.json/);
  assert.equal(explorer.includes("G-AID Output/project.catalog.json"), false);
  const openWorkspace = fs.readFileSync(path.join(process.cwd(), "src/lib/open-workspace.ts"), "utf8");
  assert.match(openWorkspace, /isGaidStatePath/);
  assert.match(openWorkspace, /filter\(\(rel\) => !isGaidStatePath\(rel\)\)/);
  const fsMain = fs.readFileSync(path.join(process.cwd(), "electron/workspace-fs.js"), "utf8");
  assert.match(fsMain, /\.g-aid/);
  assert.equal(isGaidStatePath(".g-aid/project.catalog.json"), true);
  assert.equal(isGaidStatePath(".g-aid/pending-plans.json"), true);
  assert.equal(isGaidStatePath("DAY 1/rover.csv"), false);
  assert.equal(isGaidStatePath("G-AID Output/runs/r1/plan.json"), false);
  const folders = [".g-aid", "DAY 1"].filter((rel) => !isGaidStatePath(rel));
  const files = [
    { relativePath: ".g-aid/project.catalog.json" },
    { relativePath: "DAY 1/rover.csv" },
    { relativePath: "G-AID Output/runs/r1/tmi_grid.asc" },
  ].filter((file) => !isGaidStatePath(file.relativePath));
  assert.deepEqual(folders, ["DAY 1"]);
  assert.equal(files.some((file) => file.relativePath.includes(".g-aid")), false);
  assert.equal(files.some((file) => file.relativePath === "DAY 1/rover.csv"), true);
  assert.equal(files.some((file) => file.relativePath === "G-AID Output/runs/r1/tmi_grid.asc"), true);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}

console.log("project-state tests passed");
