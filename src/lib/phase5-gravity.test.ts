import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildProjectCatalog } from "./catalog/build.ts";
import { applyReviewedGravityMapping } from "./catalog/gravity-mapping.ts";
import { inspectGravityText } from "./catalog/gravity-contract.ts";
import { collectPlanInputs } from "./plan-intent.ts";
import {
  applyChatPatches,
  EMPTY_STEPS,
  gravityStepsEnabled,
  normalizePlan,
  validatePlan,
  type AgentPlan,
} from "./plan-spec.ts";
import {
  compileCapabilityDag,
  isRegisteredCapability,
  verifyBoundInputIdentity,
} from "./capabilities/index.ts";
import { allocateApprovedRun, hashPlan, planHashMatches, writeFrozenPlanJson } from "./run-layout.ts";
import { buildMapLayers, mapValueUnits, selectLayerByPath } from "./map/index.ts";
import type { CatalogRecord } from "./catalog/types.ts";

const fixtureSrc = path.join(process.cwd(), "tests/fixtures/gravity-project");

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-phase5-grav-"));
  fs.cpSync(fixtureSrc, root, { recursive: true });
  return root;
}

function byPath(records: CatalogRecord[], rel: string): CatalogRecord {
  const record = records.find((item) => item.relativePath.replace(/\\/g, "/") === rel);
  assert.ok(record, `missing catalog record ${rel}`);
  return record;
}

function gravPlan(root: string, overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    plan: "# Implementation Plan\n",
    taskFolder: "",
    outputDir: "",
    productsRel: "",
    workspaceRoot: root,
    targetFolder: "valid",
    projectName: "GRAVITY",
    intent: "gravity",
    steps: { ...EMPTY_STEPS, gravity: true, residual: true },
    parameters: {
      baseReference: "mean_base",
      density: 2.67,
      surveyLatitude: 10.8,
      elevationDatum: "orthometric",
    },
    workspaceBrief: "",
    rev: 1,
    notes: [],
    status: "draft",
    capabilities: [
      "grav.ingest",
      "grav.freeair",
      "grav.bouguer",
      "grav.grid",
      "grav.gis",
      "grav.interpret",
      "grav.residual",
    ],
    ...overrides,
  };
}

test("grav.bouguer is registered; gravity.bouguer is not", () => {
  assert.equal(isRegisteredCapability("grav.bouguer"), true);
  assert.equal(isRegisteredCapability("grav.ingest"), true);
  assert.equal(isRegisteredCapability("gravity.bouguer"), false);
});

test("valid named XYZ with CRS/units/datum is a supported gravity-xyz record", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "valid/stations.xyz");
    assert.equal(rec.adapterId, "gravity-xyz");
    assert.equal(rec.formatId, "gravity-xyz");
    assert.equal(rec.supportStatus, "supported");
    assert.equal(rec.crs, "EPSG:32630");
    assert.equal(rec.units, "mGal");
    assert.equal(rec.elevationDatum, "orthometric");
    assert.equal(rec.columnMapping?.gObs, "Gravity");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("missing CRS stays recognised-unsupported", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "missing-crs/stations.xyz");
    assert.equal(rec.adapterId, "gravity-xyz");
    assert.equal(rec.supportStatus, "recognised-unsupported");
    assert.ok(rec.parseErrors?.some((err) => /CRS/i.test(err)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("mixed units are not a supported gravity input", () => {
  const text = fs.readFileSync(path.join(fixtureSrc, "mixed-units/stations.csv"), "utf8");
  const inspected = inspectGravityText(text);
  assert.equal(inspected.looksLikeGravity, true);
  assert.ok(inspected.errors.some((err) => /mixed gravity units/i.test(err)));
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "mixed-units/stations.csv");
    assert.notEqual(rec.supportStatus, "supported");
    assert.ok(rec.parseErrors?.some((err) => /mixed/i.test(err)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("missing elevation/datum metadata blocks free-air planning", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "missing-elevation/stations.xyz");
    assert.equal(rec.adapterId, "gravity-xyz");
    const inputs = [
      {
        catalogId: rec.id,
        path: rec.relativePath,
        adapterId: rec.adapterId,
        kind: "gravity-xyz",
        supportStatus: rec.supportStatus,
        checksum: rec.checksum.value,
        columnMapping: rec.columnMapping,
        elevationDatum: rec.elevationDatum,
      },
    ];
    const check = validatePlan(
      gravPlan(root, {
        targetFolder: "missing-elevation",
        parameters: { baseReference: "mean_base", density: 2.67, surveyLatitude: 10.8 },
        inputs,
      }),
      catalog
    );
    assert.equal(check.ok, false);
    assert.equal(check.blockers.some((issue) => issue.code === "elevation_required" || issue.code === "elevation_datum_required"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("alias CSV needs a reviewed mapping before it is a processing input", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "mapped-csv/stations.csv");
    assert.equal(rec.adapterId, "gravity-csv");
    assert.equal(rec.supportStatus, "recognised-unsupported");
    assert.equal(rec.columnMapping?.reviewed, false);
    assert.equal(rec.columnMapping?.x, "Easting");
    assert.equal(rec.columnMapping?.gObs, "Grav");

    const reviewed = applyReviewedGravityMapping(rec, {
      x: "Easting",
      y: "Northing",
      gObs: "Grav",
      elevation: "Height",
      stationId: "Site",
      reviewed: true,
    });
    assert.equal(reviewed.supportStatus, "supported");
    assert.equal(reviewed.columnMapping?.reviewed, true);

    catalog.records = catalog.records.map((item) => (item.id === rec.id ? reviewed : item));
    const inputs = collectPlanInputs(null, "mapped-csv", catalog);
    assert.equal(inputs.length, 1);
    assert.equal(inputs[0].adapterId, "gravity-csv");
    const check = validatePlan(
      gravPlan(root, { targetFolder: "mapped-csv", inputs }),
      catalog
    );
    assert.equal(check.ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("unnamed numeric XYZ is not gravity data", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "unsupported-xyz/random.xyz");
    assert.notEqual(rec.adapterId, "gravity-xyz");
    assert.notEqual(rec.adapterId, "gravity-csv");
    assert.notEqual(rec.supportStatus, "supported");
    const inputs = collectPlanInputs(null, "unsupported-xyz", catalog);
    assert.equal(inputs.some((item) => item.path.includes("random.xyz")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("gravity DAG compiles without magnetic file_discovery", () => {
  const dag = compileCapabilityDag([
    "grav.ingest",
    "grav.freeair",
    "grav.bouguer",
    "grav.grid",
    "grav.gis",
    "grav.interpret",
    "grav.residual",
  ]);
  const ids = dag.nodes.map((node) => node.id);
  assert.deepEqual(ids, [
    "gravity_ingest",
    "gravity_freeair",
    "gravity_bouguer",
    "grav_gridder",
    "regional_residual",
    "grav_gis_export",
    "grav_interpret",
  ]);
  assert.equal(ids.includes("file_discovery"), false);
  assert.equal(ids.includes("mag_gridder"), false);
});

test("density, CRS, units, and mapping review are planning blockers when missing", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "valid", catalog);
    const noDensity = validatePlan(
      gravPlan(root, { parameters: { baseReference: "mean_base", surveyLatitude: 10.8, elevationDatum: "orthometric" }, inputs }),
      catalog
    );
    assert.equal(noDensity.ok, false);
    assert.equal(noDensity.blockers.some((issue) => issue.code === "density_required"), true);

    const noLat = validatePlan(
      gravPlan(root, { parameters: { baseReference: "mean_base", density: 2.67, elevationDatum: "orthometric" }, inputs }),
      catalog
    );
    assert.equal(noLat.ok, false);
    assert.equal(noLat.blockers.some((issue) => issue.code === "latitude_required"), true);

    const missingCrsInputs = collectPlanInputs(null, "missing-crs", catalog);
    assert.equal(missingCrsInputs.length, 0);
    const noFile = validatePlan(
      gravPlan(root, { targetFolder: "missing-crs", inputs: [] }),
      catalog
    );
    assert.equal(noFile.ok, false);
    assert.equal(noFile.blockers.some((issue) => issue.code === "no_gravity_files"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("approved gravity DAG binds catalog IDs and writes a versioned run folder", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "valid", catalog);
    assert.ok(inputs.every((item) => item.catalogId && item.adapterId === "gravity-xyz"));
    const dag = compileCapabilityDag([
      "grav.ingest",
      "grav.freeair",
      "grav.bouguer",
      "grav.grid",
      "grav.gis",
      "grav.interpret",
    ]);
    const allocated = allocateApprovedRun(
      gravPlan(root, {
        runId: "r-grav-1",
        capabilities: dag.requestedCapabilityIds,
        dag,
        inputs,
        status: "draft",
      })
    );
    assert.match(allocated.productsRel || "", /G-AID Output\/runs\/r-grav-1/);
    const frozenPath = writeFrozenPlanJson({
      ...allocated,
      status: "approved",
      planHash: hashPlan(allocated),
    });
    assert.ok(frozenPath.includes(`${path.sep}G-AID Output${path.sep}runs${path.sep}r-grav-1${path.sep}plan.json`));
    const frozen = JSON.parse(fs.readFileSync(frozenPath, "utf8")) as AgentPlan;
    assert.ok(frozen.inputs?.every((item) => item.catalogId && item.checksum));
    assert.equal(frozen.parameters.density, 2.67);
    assert.equal(planHashMatches({ ...allocated, planHash: hashPlan(allocated) }), true);
    const identity = verifyBoundInputIdentity(root, inputs);
    assert.equal(identity.ok, true);
    const second = allocateApprovedRun({ ...allocated, status: "complete" });
    assert.notEqual(second.runId, allocated.runId);
    assert.equal(second.parentRunId, allocated.runId);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("gravity ASCII grids open as Phase 4 map layers with mGal units", () => {
  const root = tmpCopy();
  try {
    const runId = "r-grav-map";
    const runDir = path.join(root, "G-AID Output", "runs", runId);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, "bouguer_grid.asc"),
      [
        "ncols 3",
        "nrows 2",
        "xllcorner 450000",
        "yllcorner 1200000",
        "cellsize 200",
        "NODATA_value -9999",
        "1 2 3",
        "4 5 6",
      ].join("\n")
    );
    fs.writeFileSync(
      path.join(runDir, "plan.json"),
      JSON.stringify({ runId, intent: "gravity", planHash: "grav-hash", status: "complete" })
    );
    const catalog = buildProjectCatalog(root);
    const files = [
      `G-AID Output/runs/${runId}/bouguer_grid.asc`,
      `G-AID Output/runs/${runId}/plan.json`,
    ];
    const layers = buildMapLayers({ catalog, files });
    const grid = selectLayerByPath(layers, `G-AID Output/runs/${runId}/bouguer_grid.asc`);
    assert.ok(grid);
    assert.equal(grid.displayStatus, "viewable");
    assert.equal(grid.formatId, "esri-ascii-grid");
    assert.equal(grid.origin, "derived-run");
    assert.equal(grid.units, "mGal");
    assert.equal(mapValueUnits("G-AID Output/runs/r1/free_air_grid.asc"), "mGal");
    assert.equal(mapValueUnits("G-AID Output/runs/r1/tmi_grid.asc"), "nT");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("chat can accept gravity onto a magnetic plan without a GravityPipeline", () => {
  const patched = applyChatPatches(
    {
      ...gravPlan("/surveys/MIXED", {
        intent: "magnetic",
        steps: { ...EMPTY_STEPS, diurnal: true },
        capabilities: ["mag.diurnal"],
        parameters: { baseReference: "mean_base" },
      }),
    },
    "also run gravity and Bouguer at density 2.67 g/cm3 survey latitude 10.8 elevation datum orthometric"
  );
  assert.equal(patched.steps.gravity, true);
  assert.equal(gravityStepsEnabled(patched.steps), true);
  assert.equal(patched.steps.diurnal, true);
  assert.ok(patched.capabilities?.includes("grav.bouguer"));
  assert.ok(patched.reviewDecisions?.some((d) => d.capabilityId === "grav.bouguer" && (d.status === "accepted" || d.status === "needs-data")));
  assert.equal(patched.parameters.density, 2.67);
  assert.equal(patched.parameters.surveyLatitude, 10.8);
  const impl = fs.readFileSync(path.join(process.cwd(), "src/pipeline/MagneticPreprocessingPipeline.ts"), "utf8");
  assert.match(impl, /gravity_ingest: SCIENCE/);
  assert.match(impl, /Do not add a GravityPipeline execution route/);
});

test("end-to-end gravity ingest through the Python runtime when science deps exist", () => {
  const probe = spawnSync("python3", ["-c", "import numpy, pandas, scipy; print('ok')"], { encoding: "utf8" });
  if (probe.status !== 0) {
    const missing = probe.stderr || probe.stdout || "python import failed";
    console.log(`ok  (python gravity E2E skipped: ${missing.split("\n")[0]})`);
    return;
  }
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "valid/stations.xyz");
    const outDir = path.join(root, "G-AID Output", "runs");
    const taskFolder = "r-e2e-grav";
    fs.mkdirSync(path.join(outDir, taskFolder), { recursive: true });
    const payload = {
      node_id: "gravity_ingest",
      parameters: {
        baseDir: root,
        outDir,
        taskFolder,
        catalogInputs: [
          {
            catalogId: rec.id,
            path: rec.relativePath,
            adapterId: "gravity-xyz",
            absPath: path.join(root, rec.relativePath),
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
          "root = os.getcwd()",
          "sys.path.insert(0, os.path.join(root, 'python'))",
          "from kernels import dispatch",
          "payload = json.loads(sys.argv[1])",
          "result = dispatch(payload['node_id'], payload)",
          "print(json.dumps({'ok': True, 'n': len(result.get('artifacts') or [])}))",
        ].join("\n"),
        JSON.stringify(payload),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(py.status, 0, py.stderr || py.stdout);
    const canonical = path.join(outDir, taskFolder, "gravity_canonical.csv");
    assert.equal(fs.existsSync(canonical), true);
    const qc = JSON.parse(fs.readFileSync(path.join(outDir, taskFolder, "gravity_ingest_qc.json"), "utf8"));
    assert.equal(qc.n, 9);
    assert.equal(qc.files[0].crs_epsg, 32630);

    const fa = spawnSync(
      "python3",
      [
        "-c",
        [
          "import json, os, sys",
          "root = os.getcwd()",
          "sys.path.insert(0, os.path.join(root, 'python'))",
          "from kernels import dispatch",
          "payload = json.loads(sys.argv[1])",
          "dispatch('gravity_freeair', payload)",
          "dispatch('gravity_bouguer', payload)",
          "dispatch('grav_gridder', payload)",
          "dispatch('grav_gis_export', payload)",
          "dispatch('grav_interpret', payload)",
          "print('ok')",
        ].join("\n"),
        JSON.stringify({
          parameters: {
            baseDir: root,
            outDir,
            taskFolder,
            density: 2.67,
            surveyLatitude: 10.8,
            elevationDatum: "orthometric",
          },
        }),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(fa.status, 0, fa.stderr || fa.stdout);
    assert.equal(fs.existsSync(path.join(outDir, taskFolder, "bouguer_grid.asc")), true);
    assert.equal(fs.existsSync(path.join(outDir, taskFolder, "gravity_stations.geojson")), true);
    const report = JSON.parse(fs.readFileSync(path.join(outDir, taskFolder, "gravity_interpretation.json"), "utf8"));
    assert.ok(Array.isArray(report.not_established));
    assert.ok(report.not_established.some((line: string) => /lithology/i.test(line)));
    assert.ok(report.not_established.some((line: string) => /drill/i.test(line)));
    const lineage = fs.readFileSync(path.join(outDir, taskFolder, "lineage_gravity_bouguer.json"), "utf8");
    assert.match(lineage, /2\.67/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("normalizePlan no longer treats gravity as an unregistered method", () => {
  const next = normalizePlan(gravPlan("/tmp/g"));
  assert.equal(next.steps.gravity, true);
  assert.equal((next.notes || []).some((note) => /not compiled into the magnetic DAG/i.test(note)), false);
  assert.ok(next.dag?.nodes.some((node) => node.id === "gravity_ingest"));
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
