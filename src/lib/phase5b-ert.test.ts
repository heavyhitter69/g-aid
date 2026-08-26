import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildProjectCatalog } from "./catalog/build.ts";
import { inspectErtText } from "./catalog/ert-contract.ts";
import { collectPlanInputs } from "./plan-intent.ts";
import { applyChatPatches, EMPTY_STEPS, validatePlan, type AgentPlan } from "./plan-spec.ts";
import { compileCapabilityDag, isRegisteredCapability, verifyBoundInputIdentity } from "./capabilities/index.ts";
import { allocateApprovedRun, hashPlan, writeFrozenPlanJson } from "./run-layout.ts";
import { parseSectionCsv, isErtSectionPath } from "./section/parse.ts";
import type { CatalogRecord } from "./catalog/types.ts";

const fixtureSrc = path.join(process.cwd(), "tests/fixtures/ert-project");

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-phase5b-ert-"));
  fs.cpSync(fixtureSrc, root, { recursive: true });
  return root;
}

function byPath(records: CatalogRecord[], rel: string): CatalogRecord {
  const record = records.find((item) => item.relativePath.replace(/\\/g, "/") === rel);
  assert.ok(record, `missing catalog record ${rel}`);
  return record;
}

function ertPlan(root: string, overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    plan: "# Implementation Plan\n",
    taskFolder: "",
    outputDir: "",
    productsRel: "",
    workspaceRoot: root,
    targetFolder: "valid",
    projectName: "ERT",
    intent: "resistivity",
    steps: { ...EMPTY_STEPS, ert: true, ertInvert: true },
    parameters: { baseReference: "mean_base" },
    workspaceBrief: "",
    rev: 1,
    notes: [],
    status: "draft",
    capabilities: ["ert.ingest", "ert.pseudosection", "ert.invert2d", "ert.interpret"],
    ...overrides,
  };
}

test("ert capabilities are registered; ert.invert is not a product id", () => {
  assert.equal(isRegisteredCapability("ert.ingest"), true);
  assert.equal(isRegisteredCapability("ert.pseudosection"), true);
  assert.equal(isRegisteredCapability("ert.invert2d"), true);
  assert.equal(isRegisteredCapability("ert.invert"), false);
});

test("ERT DAG compiles without magnetic file_discovery", () => {
  const dag = compileCapabilityDag(["ert.ingest", "ert.pseudosection", "ert.invert2d", "ert.interpret"]);
  const ids = dag.nodes.map((node) => node.id);
  assert.deepEqual(ids, ["ert_ingest", "ert_pseudosection", "ert_invert", "ert_interpret"]);
  assert.equal(ids.includes("file_discovery"), false);
  assert.equal(ids.includes("gravity_ingest"), false);
});

test("valid Res2DInv-style .dat with Units=ohm.m is a supported ert-dat record", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "valid/line.dat");
    assert.equal(rec.adapterId, "ert-dat");
    assert.equal(rec.supportStatus, "supported");
    assert.equal(rec.units, "ohm.m");
    assert.equal(rec.crs, "EPSG:32630");
    assert.ok((rec.recordCount || 0) >= 8);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an arbitrary .dat file is not identified as ERT from extension alone", () => {
  const text = fs.readFileSync(path.join(fixtureSrc, "unsupported-dat/random.dat"), "utf8");
  const inspected = inspectErtText(text, "random.dat");
  assert.equal(inspected.looksLikeErt, false);
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "unsupported-dat/random.dat");
    assert.notEqual(rec.adapterId, "ert-dat");
    assert.notEqual(rec.supportStatus, "supported");
    const inputs = collectPlanInputs(null, "unsupported-dat", catalog);
    assert.equal(inputs.some((item) => item.path.includes("random.dat")), false);
    const check = validatePlan(ertPlan(root, { targetFolder: "unsupported-dat", inputs }), catalog);
    assert.equal(check.ok, false);
    assert.equal(check.blockers.some((issue) => issue.code === "no_ert_files"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("bad geometry, missing array, invalid units, and bad topography are not supported", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const geo = byPath(catalog.records, "bad-geometry/line.dat");
    assert.equal(geo.adapterId, "ert-dat");
    assert.notEqual(geo.supportStatus, "supported");
    assert.ok(geo.parseErrors?.some((err) => /geometry|rhoa|spacing|a>0/i.test(err)));

    const arr = byPath(catalog.records, "missing-array/line.dat");
    assert.notEqual(arr.supportStatus, "supported");
    assert.ok(arr.parseErrors?.some((err) => /array/i.test(err)));

    const units = byPath(catalog.records, "invalid-units/line.dat");
    assert.notEqual(units.supportStatus, "supported");
    assert.ok(units.parseErrors?.some((err) => /ohm\.m|units/i.test(err)));

    const topo = byPath(catalog.records, "bad-topography/line.dat");
    assert.notEqual(topo.supportStatus, "supported");
    assert.ok(topo.parseErrors?.some((err) => /topograph/i.test(err)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("chat requesting ERT does not create a magnetic plan", () => {
  const plan = ertPlan("/tmp", { steps: { ...EMPTY_STEPS }, capabilities: [] });
  const patched = applyChatPatches(plan, "process the ERT pseudosection and invert");
  assert.ok(patched.capabilities?.includes("ert.ingest"));
  assert.ok(patched.capabilities?.includes("ert.invert2d"));
  assert.equal(patched.steps.diurnal, false);
  assert.equal(patched.capabilities?.includes("mag.diurnal"), false);
});

test("approved ERT DAG binds catalog IDs and writes a versioned run folder", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "valid", catalog);
    assert.ok(inputs.every((item) => item.catalogId && item.adapterId === "ert-dat"));
    const check = validatePlan(ertPlan(root, { inputs }), catalog);
    assert.equal(check.ok, true, check.blockers.map((b) => b.code + ": " + b.message).join("; "));
    const dag = compileCapabilityDag(ertPlan(root).capabilities || []);
    const allocated = allocateApprovedRun(ertPlan(root, { runId: "r-ert-1", dag, inputs, status: "draft" }));
    const frozenPath = writeFrozenPlanJson({ ...allocated, status: "approved", planHash: hashPlan(allocated) });
    const frozen = JSON.parse(fs.readFileSync(frozenPath, "utf8")) as AgentPlan;
    assert.ok(frozen.inputs?.every((item) => item.catalogId && item.checksum));
    assert.equal(verifyBoundInputIdentity(root, inputs).ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("section parser labels pseudosection vs smoothness model", () => {
  assert.equal(isErtSectionPath("G-AID Output/runs/r1/ert_pseudosection.csv"), true);
  const pseudo = parseSectionCsv("x,z,rhoa_ohm_m\n0,2.5,100\n5,2.5,110\n", "ert_pseudosection.csv");
  assert.equal(pseudo.kind, "pseudosection");
  assert.equal(pseudo.units, "ohm.m");
  assert.match(pseudo.zReference, /pseudo-depth/i);
  assert.ok(pseudo.warnings.some((w) => /not a depth model/i.test(w)));
  const model = parseSectionCsv("x,z,resistivity_ohm_m\n0,2,90\n5,2,95\n", "ert_2d_model.csv");
  assert.equal(model.kind, "resistivity-model");
  assert.match(model.modelStatus, /not Res2DInv/i);
});

test("end-to-end ERT ingest, pseudosection, invert, and failed inversion when science deps exist", () => {
  const probe = spawnSync("python3", ["-c", "import numpy, pandas, scipy; print('ok')"], { encoding: "utf8" });
  if (probe.status !== 0) {
    console.log("ok  (python ERT E2E skipped)");
    return;
  }
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "valid/line.dat");
    const outDir = path.join(root, "G-AID Output", "runs");
    const taskFolder = "r-e2e-ert";
    fs.mkdirSync(path.join(outDir, taskFolder), { recursive: true });
    const payload = {
      parameters: {
        baseDir: root,
        outDir,
        taskFolder,
        catalogInputs: [
          {
            catalogId: rec.id,
            path: rec.relativePath,
            adapterId: "ert-dat",
            absPath: path.join(root, rec.relativePath),
            checksum: rec.checksum.value,
          },
        ],
      },
    };
    const py = spawnSync(
      "python3",
      [
        "-c",
        [
          "import json, os, sys",
          "sys.path.insert(0, os.path.join(os.getcwd(), 'python'))",
          "from kernels import dispatch",
          "payload = json.loads(sys.argv[1])",
          "dispatch('ert_ingest', payload)",
          "dispatch('ert_pseudosection', payload)",
          "dispatch('ert_invert', payload)",
          "dispatch('ert_interpret', payload)",
          "print('ok')",
        ].join("; "),
        JSON.stringify(payload),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(py.status, 0, py.stderr || py.stdout);
    const run = path.join(outDir, taskFolder);
    assert.equal(fs.existsSync(path.join(run, "ert_canonical.csv")), true);
    assert.equal(fs.existsSync(path.join(run, "ert_pseudosection.csv")), true);
    assert.equal(fs.existsSync(path.join(run, "ert_2d_model.csv")), true);
    const qc = JSON.parse(fs.readFileSync(path.join(run, "ert_invert_qc.json"), "utf8"));
    assert.equal(qc.converged, true);
    assert.equal(qc.topography_used, false);
    assert.equal(qc.not_res2dinv, true);
    const report = JSON.parse(fs.readFileSync(path.join(run, "ert_interpretation.json"), "utf8"));
    assert.ok(report.not_established.some((line: string) => /groundwater/i.test(line)));
    assert.ok(report.not_established.some((line: string) => /drill/i.test(line)));
    const section = parseSectionCsv(fs.readFileSync(path.join(run, "ert_pseudosection.csv"), "utf8"), "ert_pseudosection.csv");
    assert.ok(section.points.length >= 8);

    const bad = byPath(catalog.records, "nonconvergent/line.dat");
    const failFolder = "r-e2e-ert-fail";
    fs.mkdirSync(path.join(outDir, failFolder), { recursive: true });
    const failPayload = {
      parameters: {
        baseDir: root,
        outDir,
        taskFolder: failFolder,
        catalogInputs: [
          {
            catalogId: bad.id,
            path: bad.relativePath,
            adapterId: "ert-dat",
            absPath: path.join(root, bad.relativePath),
          },
        ],
      },
    };
    const fail = spawnSync(
      "python3",
      [
        "-c",
        [
          "import json, os, sys",
          "sys.path.insert(0, os.path.join(os.getcwd(), 'python'))",
          "from kernels import dispatch",
          "payload = json.loads(sys.argv[1])",
          "try:",
          "    dispatch('ert_ingest', payload)",
          "    dispatch('ert_invert', payload)",
          "    raise SystemExit('should have failed')",
          "except ValueError as exc:",
          "    if 'converge' not in str(exc).lower() and 'misfit' not in str(exc).lower():",
          "        raise",
          "    print('RAISED')",
        ].join("\n"),
        JSON.stringify(failPayload),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(fail.status, 0, fail.stderr || fail.stdout);
    assert.match(fail.stdout || "", /RAISED/);
    assert.equal(fs.existsSync(path.join(outDir, failFolder, "ert_2d_model.csv")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("phase5b ert ok");
