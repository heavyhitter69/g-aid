import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildProjectCatalog } from "./catalog/build.ts";
import { inspectGprText } from "./catalog/gpr-contract.ts";
import { collectPlanInputs } from "./plan-intent.ts";
import {
  applyChatPatches,
  EMPTY_STEPS,
  gprStepsEnabled,
  validatePlan,
  type AgentPlan,
} from "./plan-spec.ts";
import {
  compileCapabilityDag,
  isRegisteredCapability,
  proposeCapabilitiesFromMessage,
  unregisteredProposal,
  verifyBoundInputIdentity,
} from "./capabilities/index.ts";
import { allocateApprovedRun, hashPlan, writeFrozenPlanJson } from "./run-layout.ts";
import { parseSectionCsv } from "./section/parse.ts";
import { gprProductWarnings } from "./gpr-product.ts";
import { detectAnalysisIntent } from "./workspace-index.ts";
import type { CatalogRecord } from "./catalog/types.ts";

const fixtureSrc = path.join(process.cwd(), "tests/fixtures/gpr-project");

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-phase7-gpr-"));
  fs.cpSync(fixtureSrc, root, { recursive: true });
  return root;
}

function byPath(records: CatalogRecord[], rel: string): CatalogRecord {
  const record = records.find((item) => item.relativePath.replace(/\\/g, "/") === rel);
  assert.ok(record, `missing catalog record ${rel}`);
  return record;
}

function gprPlan(root: string, overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    plan: "# Implementation Plan\n",
    taskFolder: "",
    outputDir: "",
    productsRel: "",
    workspaceRoot: root,
    targetFolder: "valid",
    projectName: "GPR",
    intent: "gpr",
    steps: { ...EMPTY_STEPS, gpr: true },
    parameters: { baseReference: "mean_base" },
    workspaceBrief: "",
    rev: 1,
    notes: [],
    status: "draft",
    capabilities: ["gpr.ingest", "gpr.process", "gpr.interpret"],
    ...overrides,
  };
}

test("gpr.* capabilities are registered as supported; GprPipeline is not an execution route", () => {
  for (const id of ["gpr.ingest", "gpr.process", "gpr.migrate", "gpr.gis", "gpr.interpret"]) {
    assert.equal(isRegisteredCapability(id), true);
  }
  assert.equal(isRegisteredCapability("gpr_process"), false);
});

test("default GPR chat grants ingest/process/interpret, not magnetics or migrate", () => {
  const granted = proposeCapabilitiesFromMessage("process the gpr");
  assert.equal(granted.includes("gpr.ingest"), true);
  assert.equal(granted.includes("gpr.process"), true);
  assert.equal(granted.includes("gpr.interpret"), true);
  assert.equal(granted.includes("gpr.migrate"), false);
  assert.equal(granted.includes("mag.diurnal"), false);
  assert.equal(granted.includes("mag.grid"), false);
  assert.equal(unregisteredProposal("process the gpr"), undefined);
  assert.equal(unregisteredProposal("process the seismic line"), "seismic");
  const migrated = proposeCapabilitiesFromMessage("migrate the gpr radargram");
  assert.equal(migrated.includes("gpr.migrate"), true);
});

test("kirchhoff + GPR is a GPR intent, not seismic", () => {
  assert.equal(detectAnalysisIntent("kirchhoff migrate the gpr"), "gpr");
  assert.equal(detectAnalysisIntent("process the seismic kirchhoff stack"), "seismic");
});

test("GPR DAG compiles without file_discovery or magnetics", () => {
  const dag = compileCapabilityDag(["gpr.ingest", "gpr.process", "gpr.interpret"]);
  const ids = dag.nodes.map((node) => node.id);
  assert.deepEqual(ids, ["gpr_ingest", "gpr_process", "gpr_interpret"]);
  assert.equal(ids.includes("file_discovery"), false);
  assert.equal(ids.includes("gpr_migrate"), false);
  const withMig = compileCapabilityDag(["gpr.ingest", "gpr.process", "gpr.migrate", "gpr.gis", "gpr.interpret"]);
  assert.deepEqual(
    withMig.nodes.map((node) => node.id),
    ["gpr_ingest", "gpr_process", "gpr_migrate", "gpr_gis_export", "gpr_interpret"]
  );
});

test("valid G-AID GPR 1.0 CSV is supported; DZT and missing dt_ns are not processing inputs", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "valid/section.csv");
    assert.equal(rec.adapterId, "gpr-csv");
    assert.equal(rec.formatId, "gpr-csv");
    assert.equal(rec.supportStatus, "supported");
    assert.equal(rec.crs, "EPSG:32630");
    assert.equal(rec.dtNs, 0.4);
    assert.equal(rec.dxM, 0.05);
    assert.equal(rec.antennaMHz, 400);
    const missing = byPath(catalog.records, "missing-dt/section.csv");
    assert.equal(missing.adapterId, "gpr-csv");
    assert.equal(missing.supportStatus, "recognised-unsupported");
    const dzt = byPath(catalog.records, "dzt-like/scan.dzt");
    assert.equal(dzt.adapterId, "gpr-dzt");
    assert.equal(dzt.supportStatus, "recognised-unsupported");
    const amp = byPath(catalog.records, "amplitude-only/traces.csv");
    assert.notEqual(amp.adapterId, "gpr-csv");
    assert.notEqual(amp.supportStatus, "supported");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("amplitude tables without the G-AID GPR 1.0 banner are not GPR data", () => {
  const text = fs.readFileSync(path.join(fixtureSrc, "amplitude-only/traces.csv"), "utf8");
  assert.equal(inspectGprText(text).looksLikeGpr, false);
});

test("planner binds supported gpr-csv ids and refuses DZT / amplitude-only folders", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "valid", catalog);
    assert.equal(inputs.some((item) => item.adapterId === "gpr-csv"), true);
    const ok = validatePlan(gprPlan(root, { inputs }), catalog);
    assert.equal(ok.ok, true);
    assert.equal(gprStepsEnabled(gprPlan(root).steps), true);

    const dztInputs = collectPlanInputs(null, "dzt-like", catalog);
    const dztCheck = validatePlan(gprPlan(root, { targetFolder: "dzt-like", inputs: dztInputs }), catalog);
    assert.equal(dztCheck.ok, false);
    assert.equal(dztCheck.blockers.some((issue) => issue.code === "no_gpr_files"), true);

    const ampInputs = collectPlanInputs(null, "amplitude-only", catalog);
    const ampCheck = validatePlan(gprPlan(root, { targetFolder: "amplitude-only", inputs: ampInputs }), catalog);
    assert.equal(ampCheck.ok, false);
    assert.equal(ampCheck.blockers.some((issue) => issue.code === "no_gpr_files"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migrate without a user velocity is needs-data / blocked; GIS without EPSG is blocked", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const patched = applyChatPatches(gprPlan(root), "migrate the gpr");
    assert.equal(patched.capabilities?.includes("gpr.migrate"), true);
    assert.equal(
      patched.reviewDecisions?.some((d) => d.capabilityId === "gpr.migrate" && d.status === "needs-data"),
      true
    );
    const validInputs = collectPlanInputs(null, "valid", catalog);
    const blocked = validatePlan(
      gprPlan(root, {
        inputs: validInputs,
        capabilities: ["gpr.ingest", "gpr.process", "gpr.migrate", "gpr.interpret"],
      }),
      catalog
    );
    assert.equal(blocked.ok, false);
    assert.equal(blocked.blockers.some((issue) => issue.code === "gpr_velocity_required"), true);

    const withVel = applyChatPatches(gprPlan(root, { inputs: validInputs }), "migrate the gpr with velocity 100000000 m/s");
    assert.equal(withVel.parameters.velocityMs, 100000000);
    const velOk = validatePlan(
      {
        ...withVel,
        inputs: validInputs,
        capabilities: ["gpr.ingest", "gpr.process", "gpr.migrate", "gpr.interpret"],
      },
      catalog
    );
    assert.equal(velOk.ok, true);

    const noCrs = collectPlanInputs(null, "no-crs", catalog);
    const gis = validatePlan(
      gprPlan(root, {
        targetFolder: "no-crs",
        inputs: noCrs,
        capabilities: ["gpr.ingest", "gpr.process", "gpr.gis", "gpr.interpret"],
      }),
      catalog
    );
    assert.equal(gis.ok, false);
    assert.equal(gis.blockers.some((issue) => issue.code === "gpr_crs_required"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("approved GPR plan freezes into a versioned run folder", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "valid", catalog);
    const allocated = allocateApprovedRun(
      gprPlan(root, { inputs, status: "approved", runId: "r-gpr-1" })
    );
    assert.match(allocated.productsRel || "", /G-AID Output\/runs\/r-gpr-1/);
    const frozenPath = writeFrozenPlanJson({
      ...allocated,
      status: "approved",
      planHash: hashPlan(allocated),
    });
    assert.ok(frozenPath.includes(`${path.sep}G-AID Output${path.sep}runs${path.sep}r-gpr-1${path.sep}plan.json`));
    const identity = verifyBoundInputIdentity(root, inputs);
    assert.equal(identity.ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("section parser reads a GPR radargram as two-way time, not utilities", () => {
  const csv = [
    "x,z,amplitude,z_reference,interpolation,model_status,units",
    "0,0,1,two-way time ns — not depth,none — discrete samples,processed radargram; not migrated; not utilities/voids/archaeology,amp",
    "0,0.4,2,two-way time ns — not depth,none — discrete samples,processed radargram; not migrated; not utilities/voids/archaeology,amp",
  ].join("\n");
  const section = parseSectionCsv(csv, "G-AID Output/runs/r1/gpr_radargram.csv");
  assert.equal(section.kind, "gpr-radargram");
  assert.match(section.zReference, /two-way time/i);
  assert.equal(section.warnings.some((line) => /utilities/i.test(line)), true);
  const warnings = gprProductWarnings({ path: "G-AID Output/runs/r1/gpr_radargram.csv" });
  assert.equal(warnings.some((line) => /Complete Bouguer/i.test(line)), false);
  assert.equal(warnings.some((line) => /not depth/i.test(line)), true);
  const migrated = parseSectionCsv(csv.replace(/two-way time ns — not depth/g, "depth m from user velocity (0.5 v t); not ground truth"), "gpr_migrated.csv");
  assert.equal(migrated.kind, "gpr-radargram");
  assert.match(migrated.zReference, /user velocity/i);
});

test("python kernels ingest → process → interpret; migrate requires velocity", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "valid/section.csv");
    const outDir = path.join(root, "G-AID Output", "runs");
    const taskFolder = "r-e2e-gpr";
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
            adapterId: "gpr-csv",
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
          "dispatch('gpr_ingest', payload)",
          "dispatch('gpr_process', payload)",
          "dispatch('gpr_gis_export', payload)",
          "dispatch('gpr_interpret', payload)",
          "print('ok')",
        ].join("\n"),
        JSON.stringify(payload),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(py.status, 0, py.stderr || py.stdout);
    assert.equal(fs.existsSync(path.join(outDir, taskFolder, "gpr_canonical.csv")), true);
    assert.equal(fs.existsSync(path.join(outDir, taskFolder, "gpr_radargram.csv")), true);
    const ingestQc = JSON.parse(fs.readFileSync(path.join(outDir, taskFolder, "gpr_ingest_qc.json"), "utf8"));
    assert.equal(ingestQc.files[0].dt_ns, 0.4);
    assert.equal(ingestQc.files[0].dzt_decoded, false);
    const processQc = JSON.parse(fs.readFileSync(path.join(outDir, taskFolder, "gpr_process_qc.json"), "utf8"));
    assert.equal(processQc.product_name, "G-AID GPR 1.0 processed radargram");
    assert.equal(processQc.migrated, false);
    assert.equal(processQc.bandpass_defaulted_from_antenna, true);
    assert.equal(processQc.vertical_axis, "two-way time ns");
    const radargram = parseSectionCsv(
      fs.readFileSync(path.join(outDir, taskFolder, "gpr_radargram.csv"), "utf8"),
      path.join(outDir, taskFolder, "gpr_radargram.csv")
    );
    assert.equal(radargram.kind, "gpr-radargram");
    assert.match(radargram.zReference, /two-way time/i);
    const report = JSON.parse(fs.readFileSync(path.join(outDir, taskFolder, "gpr_interpretation.json"), "utf8"));
    assert.equal(report.product_name.includes("Complete Bouguer"), false);
    for (const needle of ["utilities", "voids", "archaeology", "depth"]) {
      assert.ok(report.not_established.some((line: string) => line.toLowerCase().includes(needle)), needle);
    }
    const geo = JSON.parse(fs.readFileSync(path.join(outDir, taskFolder, "gpr_traces.geojson"), "utf8"));
    assert.ok(geo.features?.length > 0);

    const refuse = spawnSync(
      "python3",
      [
        "-c",
        [
          "import json, os, sys",
          "sys.path.insert(0, os.path.join(os.getcwd(), 'python'))",
          "from kernels import dispatch",
          "payload = json.loads(sys.argv[1])",
          "try:",
          "    dispatch('gpr_migrate', payload)",
          "    raise SystemExit('expected failure')",
          "except ValueError as err:",
          "    print(str(err))",
        ].join("\n"),
        JSON.stringify(payload),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(refuse.status, 0, refuse.stderr || refuse.stdout);
    assert.match(refuse.stdout, /velocityMs|0\.1 m\/ns/i);

    const migratePayload = {
      parameters: { ...payload.parameters, velocityMs: 1e8 },
    };
    const mig = spawnSync(
      "python3",
      [
        "-c",
        [
          "import json, os, sys",
          "sys.path.insert(0, os.path.join(os.getcwd(), 'python'))",
          "from kernels import dispatch",
          "payload = json.loads(sys.argv[1])",
          "dispatch('gpr_migrate', payload)",
          "print('ok')",
        ].join("\n"),
        JSON.stringify(migratePayload),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(mig.status, 0, mig.stderr || mig.stdout);
    const migQc = JSON.parse(fs.readFileSync(path.join(outDir, taskFolder, "gpr_migrate_qc.json"), "utf8"));
    assert.equal(migQc.velocity_assumed, false);
    assert.equal(migQc.velocity_ms, 1e8);
    const migrated = parseSectionCsv(
      fs.readFileSync(path.join(outDir, taskFolder, "gpr_migrated.csv"), "utf8"),
      path.join(outDir, taskFolder, "gpr_migrated.csv")
    );
    assert.match(migrated.zReference, /user velocity/i);

    const dztRefuse = spawnSync(
      "python3",
      [
        "-c",
        [
          "import os, sys",
          "sys.path.insert(0, os.path.join(os.getcwd(), 'python'))",
          "from formats import parse_dzt",
          "try:",
          "    parse_dzt('scan.dzt')",
          "    raise SystemExit('expected failure')",
          "except ValueError as err:",
          "    print(str(err))",
        ].join("\n"),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(dztRefuse.status, 0, dztRefuse.stderr || dztRefuse.stdout);
    assert.match(dztRefuse.stdout, /recognised-unsupported/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
