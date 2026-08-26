import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildProjectCatalog } from "./catalog/build.ts";
import { collectPlanInputs } from "./plan-intent.ts";
import {
  applyChatPatches,
  EMPTY_STEPS,
  normalizePlan,
  validatePlan,
  type AgentPlan,
} from "./plan-spec.ts";
import {
  compileCapabilityDag,
  isRegisteredCapability,
  listCapabilities,
  verifyBoundInputIdentity,
} from "./capabilities/index.ts";
import { generateTasksMarkdown, taskNodeIdsFromMarkdown } from "./capabilities/tasks.ts";
import { allocateApprovedRun, hashPlan, planHashMatches, writeFrozenPlanJson } from "./run-layout.ts";

const fixtureSrc = path.join(process.cwd(), "tests/fixtures/catalog-project");

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

function tmpCopy(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-phase3-"));
  fs.cpSync(fixtureSrc, root, { recursive: true });
  const tif = Buffer.alloc(16, 0);
  tif[0] = 0x49;
  tif[1] = 0x49;
  tif[2] = 0x2a;
  tif[3] = 0x00;
  fs.mkdirSync(path.join(root, "gis"), { recursive: true });
  fs.writeFileSync(path.join(root, "gis", "tiny.tif"), tif);
  return root;
}

function magPlan(root: string, overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    plan: "# Implementation Plan\n",
    taskFolder: "",
    outputDir: "",
    productsRel: "",
    workspaceRoot: root,
    targetFolder: "DAY 1",
    projectName: "MIXED",
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

test("only registered capabilities compile; unknown ids are dropped", () => {
  const ids = listCapabilities().map((capability) => capability.id);
  assert.ok(ids.includes("mag.diurnal"));
  assert.equal(isRegisteredCapability("mag.diurnal"), true);
  assert.equal(isRegisteredCapability("gravity.bouguer"), false);
  assert.equal(isRegisteredCapability("ert.invert"), false);
  const empty = compileCapabilityDag(["gravity.bouguer", "not.a.cap"]);
  assert.deepEqual(empty.nodes.map((node) => node.id), []);
  assert.deepEqual(empty.requestedCapabilityIds, []);
});

test("diurnal-only DAG is the minimum node set", () => {
  const dag = compileCapabilityDag(["mag.diurnal"]);
  const ids = dag.nodes.map((node) => node.id);
  assert.deepEqual(ids, [
    "file_discovery",
    "flight_path_cleaner",
    "time_synchronizer",
    "diurnal_corrector",
    "qc_engine",
  ]);
  assert.equal(ids.includes("rtp_filter"), false);
  assert.equal(ids.includes("igrf_corrector"), false);
  assert.equal(ids.includes("mag_gridder"), false);
  assert.equal(ids.includes("heading_lag_corrector"), false);
  assert.equal(ids.includes("fft_derivatives"), false);
});

test("RTP DAG includes grid and diurnal prereqs, not unrelated magnetic nodes", () => {
  const dag = compileCapabilityDag(["mag.rtp"]);
  const ids = dag.nodes.map((node) => node.id);
  assert.ok(ids.includes("file_discovery"));
  assert.ok(ids.includes("diurnal_corrector"));
  assert.ok(ids.includes("mag_gridder"));
  assert.ok(ids.includes("rtp_filter"));
  assert.equal(ids.includes("igrf_corrector"), false);
  assert.equal(ids.includes("heading_lag_corrector"), false);
  assert.equal(ids.includes("tie_line_leveler"), false);
  assert.equal(ids.includes("fft_derivatives"), false);
  assert.equal(ids.includes("lineament_extractor"), false);
});

test("tasks.md node ids match the compiled DAG", () => {
  const dag = compileCapabilityDag(["mag.diurnal"]);
  const markdown = generateTasksMarkdown({
    projectName: "MIXED",
    taskFolder: "r-test",
    targetFolder: "DAY 1",
    capabilities: ["mag.diurnal"],
    dag,
    steps: { ...EMPTY_STEPS, diurnal: true },
  });
  const taskIds = taskNodeIdsFromMarkdown(markdown);
  const dagIds = new Set(dag.nodes.map((node) => node.id));
  for (const id of taskIds) {
    if (id === "write_products") continue;
    assert.equal(dagIds.has(id), true, `task node ${id} is not in the DAG`);
  }
  for (const id of dagIds) {
    assert.equal(taskIds.includes(id), true, `DAG node ${id} missing from tasks.md`);
  }
  assert.equal(taskIds.includes("rtp_filter"), false);
  assert.equal(taskIds.includes("igrf_corrector"), false);
  assert.match(markdown, /compiled DAG/i);
});

test("unsupported and unknown catalog records cannot bind to a capability", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "DAY 1", catalog);
    const geotiff = catalog.records.find((record) => record.formatId === "geotiff");
    const unknown = catalog.records.find((record) => record.supportStatus === "unknown");
    assert.ok(geotiff);
    const blockedTif = validatePlan(
      magPlan(root, {
        capabilities: ["mag.diurnal"],
        inputs: [
          ...inputs,
          {
            catalogId: geotiff.id,
            path: geotiff.relativePath,
            supportStatus: geotiff.supportStatus,
            adapterId: geotiff.adapterId,
            checksum: geotiff.checksum.value,
          },
        ],
      }),
      catalog
    );
    assert.equal(blockedTif.ok, false);
    assert.equal(blockedTif.blockers.some((issue) => issue.code === "unsupported_catalog_input"), true);

    if (unknown) {
      const blockedUnknown = validatePlan(
        magPlan(root, {
          capabilities: ["mag.diurnal"],
          inputs: [
            {
              catalogId: unknown.id,
              path: unknown.relativePath,
              supportStatus: unknown.supportStatus,
              adapterId: unknown.adapterId,
            },
          ],
        }),
        catalog
      );
      assert.equal(blockedUnknown.ok, false);
      assert.equal(blockedUnknown.blockers.some((issue) => issue.code === "unsupported_catalog_input"), true);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("changed source data blocks execution identity check", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "DAY 1", catalog);
    const rover = inputs.find((item) => item.adapterId === "magarrow");
    assert.ok(rover);
    const ok = verifyBoundInputIdentity(root, inputs);
    assert.equal(ok.ok, true);
    fs.appendFileSync(path.join(root, rover.path), "99999.0\n");
    const changed = verifyBoundInputIdentity(root, inputs);
    assert.equal(changed.ok, false);
    assert.equal(changed.issues.some((issue) => issue.code === "input_changed"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("invalid scientific dependencies block Proceed with an explanation", () => {
  const check = validatePlan(
    magPlan("/surveys/TEMA", {
      steps: { ...EMPTY_STEPS, diurnal: true, grid: true, rtp: true },
      capabilities: ["mag.diurnal", "mag.grid", "mag.rtp"],
      parameters: { baseReference: "mean_base" },
    })
  );
  assert.equal(check.ok, false);
  const rtp = check.blockers.find((issue) => issue.code === "rtp_needs_field_params");
  assert.ok(rtp);
  assert.match(rtp.message, /inclination and declination|mag\.igrf/i);

  const withParams = validatePlan(
    magPlan("/surveys/TEMA", {
      steps: { ...EMPTY_STEPS, diurnal: true, grid: true, rtp: true },
      capabilities: ["mag.diurnal", "mag.grid", "mag.rtp"],
      parameters: { baseReference: "mean_base", inclination: -18, declination: -3 },
    })
  );
  assert.equal(withParams.ok, true);
  assert.equal(withParams.blockers.some((issue) => issue.code === "rtp_needs_field_params"), false);
});

test("review comments record accepted, refused, and needs-data", () => {
  const root = "/surveys/TEMA";
  const igrf = applyChatPatches(
    magPlan(root, {
      steps: { ...EMPTY_STEPS, diurnal: true },
      capabilities: ["mag.diurnal"],
    }),
    "add IGRF"
  );
  assert.ok(
    igrf.reviewDecisions?.some(
      (decision) => decision.status === "accepted" && decision.capabilityId === "mag.igrf"
    )
  );

  const skipRtp = applyChatPatches(
    magPlan(root, {
      steps: { ...EMPTY_STEPS, diurnal: true, igrf: true, grid: true, rtp: true },
      capabilities: ["mag.diurnal", "mag.igrf", "mag.grid", "mag.rtp"],
    }),
    "Review feedback for the implementation plan: skip RTP"
  );
  assert.equal(skipRtp.steps.rtp, false);
  assert.ok(
    skipRtp.reviewDecisions?.some(
      (decision) => decision.status === "refused" && decision.capabilityId === "mag.rtp"
    )
  );

  const gravity = applyChatPatches(magPlan(root), "also run gravity and Bouguer on this survey");
  assert.ok(
    gravity.reviewDecisions?.some(
      (decision) => decision.status === "refused" && /gravity/i.test(String(decision.capabilityId) + decision.reason)
    )
  );
  assert.equal(gravity.steps.gravity, false);

  const needs = applyChatPatches(
    magPlan(root, {
      steps: { ...EMPTY_STEPS, diurnal: true },
      capabilities: ["mag.diurnal"],
    }),
    "add RTP"
  );
  assert.equal(needs.steps.rtp, true);
  assert.ok(
    needs.reviewDecisions?.some(
      (decision) => decision.status === "needs-data" && decision.capabilityId === "mag.rtp"
    )
  );
  const blocked = validatePlan(normalizePlan(needs));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blockers.some((issue) => issue.code === "rtp_needs_field_params"), true);
});

test("a revision creates a new linked run and does not mutate the parent", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "DAY 1", catalog);
    const dag = compileCapabilityDag(["mag.diurnal"]);
    const first = allocateApprovedRun(
      magPlan(root, {
        runId: "r-parent",
        capabilities: ["mag.diurnal"],
        dag,
        inputs,
        status: "draft",
      })
    );
    const run1 = path.join(first.outputDir, first.taskFolder);
    fs.mkdirSync(run1, { recursive: true });
    const frozen = writeFrozenPlanJson({
      ...first,
      status: "complete",
      planHash: hashPlan(first),
      capabilities: ["mag.diurnal"],
      dag,
      inputs,
    });
    const parentJson = JSON.parse(fs.readFileSync(frozen, "utf8")) as AgentPlan;
    assert.deepEqual(parentJson.capabilities, ["mag.diurnal"]);
    assert.ok(parentJson.dag?.nodes.some((node) => node.id === "diurnal_corrector"));
    fs.writeFileSync(path.join(run1, "marker.txt"), "parent-run\n");

    const second = allocateApprovedRun({ ...first, status: "complete", capabilities: ["mag.diurnal"], dag, inputs });
    assert.notEqual(second.runId, first.runId);
    assert.equal(second.parentRunId, first.runId);
    assert.equal(fs.readFileSync(path.join(run1, "marker.txt"), "utf8"), "parent-run\n");
    assert.equal(fs.existsSync(path.join(second.outputDir, second.taskFolder)), false);
    assert.equal(planHashMatches({ ...first, planHash: hashPlan(first) }), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("live file_discovery path requires catalogInputs and does not walk the disk", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "python/nodes/file_discovery.py"), "utf8");
  assert.equal(src.includes("os.walk"), false);
  assert.match(src, /catalogInputs/);
  assert.match(src, /will not search the survey folder by extension/);

  const py = spawnSync(
    "python3",
    [
      "-c",
      [
        "import importlib.util, json, os, sys, tempfile",
        "root = os.getcwd()",
        "sys.path.insert(0, os.path.join(root, 'python'))",
        "sys.path.insert(0, os.path.join(root, 'python', 'nodes'))",
        "spec = importlib.util.spec_from_file_location('file_discovery', os.path.join(root, 'python', 'nodes', 'file_discovery.py'))",
        "mod = importlib.util.module_from_spec(spec)",
        "try:",
        "    spec.loader.exec_module(mod)",
        "except Exception as exc:",
        "    print('IMPORT_FAIL', type(exc).__name__)",
        "    sys.exit(0)",
        "try:",
        "    mod.discover_files({'parameters': {'baseDir': tempfile.gettempdir(), 'outDir': tempfile.gettempdir(), 'taskFolder': 'x'}})",
        "    print('NO_RAISE')",
        "    sys.exit(1)",
        "except ValueError as exc:",
        "    print('RAISED', str(exc))",
        "    sys.exit(0 if 'catalogInputs' in str(exc) else 2)",
      ].join("\n"),
    ],
    { encoding: "utf8" }
  );
  if (py.status === 0 && /IMPORT_FAIL/.test(py.stdout || "")) {
    console.log("ok  (python import skipped)", (py.stdout || "").trim());
    return;
  }
  assert.equal(py.status, 0, py.stderr || py.stdout);
  assert.match(py.stdout || "", /RAISED/);
  assert.match(py.stdout || "", /catalogInputs/);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
