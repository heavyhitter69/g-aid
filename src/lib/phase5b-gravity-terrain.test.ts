import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildProjectCatalog } from "./catalog/build.ts";
import { inspectDemText } from "./catalog/dem-contract.ts";
import { collectPlanInputs } from "./plan-intent.ts";
import {
  applyChatPatches,
  EMPTY_STEPS,
  renderImplementationPlan,
  validatePlan,
  type AgentPlan,
} from "./plan-spec.ts";
import {
  compileCapabilityDag,
  isRegisteredCapability,
  unregisteredProposal,
} from "./capabilities/index.ts";
import { verifyBoundInputIdentity } from "./capabilities/inputs.ts";
import { allocateApprovedRun, hashPlan, writeFrozenPlanJson } from "./run-layout.ts";
import { buildMapLayers, mapValueUnits } from "./map/index.ts";
import { layerLabel } from "./raster-layers.ts";
import { gravityProductWarnings } from "./gravity-product.ts";
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-phase5b-grav-"));
  fs.cpSync(fixtureSrc, root, { recursive: true });
  return root;
}

function byPath(records: CatalogRecord[], rel: string): CatalogRecord {
  const record = records.find((item) => item.relativePath.replace(/\\/g, "/") === rel);
  assert.ok(record, `missing catalog record ${rel}`);
  return record;
}

function terrainPlan(root: string, overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    plan: "# Implementation Plan\n",
    taskFolder: "",
    outputDir: "",
    productsRel: "",
    workspaceRoot: root,
    targetFolder: "valid",
    projectName: "GRAVITY",
    intent: "gravity",
    steps: { ...EMPTY_STEPS, gravity: true, nearZoneTerrain: true },
    parameters: {
      baseReference: "mean_base",
      density: 2.67,
      surveyLatitude: 10.8,
      elevationDatum: "orthometric",
      terrainRadiusM: 150,
    },
    workspaceBrief: "",
    rev: 1,
    notes: [],
    status: "draft",
    capabilities: [
      "grav.ingest",
      "grav.freeair",
      "grav.bouguer",
      "grav.terrain_near_zone",
      "grav.grid",
      "grav.gis",
      "grav.interpret",
    ],
    ...overrides,
  };
}

test("grav.terrain_near_zone is registered; grav.terrain is not; default gravity DAG still omits terrain", () => {
  assert.equal(isRegisteredCapability("grav.terrain_near_zone"), true);
  assert.equal(isRegisteredCapability("grav.terrain_intermediate_zone"), true);
  assert.equal(isRegisteredCapability("grav.terrain_far_zone"), true);
  assert.equal(isRegisteredCapability("grav.terrain"), false);
  const simple = compileCapabilityDag([
    "grav.ingest",
    "grav.freeair",
    "grav.bouguer",
    "grav.grid",
    "grav.gis",
    "grav.interpret",
  ]);
  const ids = simple.nodes.map((node) => node.id);
  assert.equal(ids.includes("gravity_terrain"), false);
  assert.equal(ids.includes("file_discovery"), false);
  const complete = compileCapabilityDag([
    "grav.ingest",
    "grav.freeair",
    "grav.bouguer",
    "grav.terrain_near_zone",
    "grav.grid",
    "grav.gis",
    "grav.interpret",
  ]);
  assert.deepEqual(complete.nodes.map((node) => node.id), [
    "gravity_ingest",
    "gravity_freeair",
    "gravity_bouguer",
    "gravity_terrain",
    "grav_gridder",
    "grav_gis_export",
    "grav_interpret",
  ]);
  assert.equal(complete.nodes.find((n) => n.id === "grav_gridder")?.dependencies.includes("gravity_terrain"), true);
});

test("catalog-project gis/dem.asc stays recognised-unsupported esri-ascii-grid", () => {
  const catalogRoot = path.join(process.cwd(), "tests/fixtures/catalog-project");
  const catalog = buildProjectCatalog(catalogRoot);
  const dem = catalog.records.find((item) => item.relativePath.replace(/\\/g, "/") === "gis/dem.asc");
  assert.ok(dem);
  assert.equal(dem.formatId, "esri-ascii-grid");
  assert.equal(dem.adapterId, "esri-ascii-grid");
  assert.equal(dem.supportStatus, "recognised-unsupported");
});

test("documented DEM ASCII is a supported dem-ascii terrain source", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "valid/dem.asc");
    assert.equal(rec.adapterId, "dem-ascii");
    assert.equal(rec.formatId, "dem-ascii");
    assert.equal(rec.supportStatus, "supported");
    assert.equal(rec.crs, "EPSG:32630");
    assert.equal(rec.units, "m");
    assert.equal(rec.elevationDatum, "orthometric");
    assert.ok(rec.bbox);
    assert.ok((rec.cellSizeM || 0) > 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("missing DEM blocks near-zone terrain-corrected Bouguer", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "missing-elevation", catalog);
    const check = validatePlan(terrainPlan(root, { targetFolder: "missing-elevation", inputs }), catalog);
    assert.equal(check.ok, false);
    assert.equal(check.blockers.some((issue) => issue.code === "no_dem"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("incompatible DEM CRS blocks near-zone terrain-corrected Bouguer", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "incompatible-crs-dem", catalog);
    const check = validatePlan(terrainPlan(root, { targetFolder: "incompatible-crs-dem", inputs }), catalog);
    assert.equal(check.ok, false);
    assert.equal(check.blockers.some((issue) => issue.code === "dem_incompatible_crs"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("absent vertical datum blocks near-zone terrain-corrected Bouguer", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const dem = byPath(catalog.records, "missing-datum-dem/dem.asc");
    assert.equal(dem.adapterId, "dem-ascii");
    assert.notEqual(dem.supportStatus, "supported");
    assert.ok(dem.parseErrors?.some((err) => /ElevationDatum|vertical datum/i.test(err)));
    const inputs = collectPlanInputs(null, "missing-datum-dem", catalog);
    const check = validatePlan(terrainPlan(root, { targetFolder: "missing-datum-dem", inputs }), catalog);
    assert.equal(check.ok, false);
    assert.equal(check.blockers.some((issue) => issue.code === "dem_no_vertical_datum"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("insufficient DEM coverage blocks near-zone terrain-corrected Bouguer", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "insufficient-coverage-dem", catalog);
    const check = validatePlan(terrainPlan(root, { targetFolder: "insufficient-coverage-dem", inputs }), catalog);
    assert.equal(check.ok, false);
    assert.equal(check.blockers.some((issue) => issue.code === "dem_insufficient_coverage"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("invalid density and mixed units still block", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "valid", catalog);
    const bad = validatePlan(
      terrainPlan(root, { parameters: { baseReference: "mean_base", density: 9.1, surveyLatitude: 10.8, elevationDatum: "orthometric", terrainRadiusM: 150 }, inputs }),
      catalog
    );
    assert.equal(bad.ok, false);
    assert.equal(bad.blockers.some((issue) => issue.code === "density_range"), true);
    const mixed = byPath(catalog.records, "mixed-units/stations.csv");
    assert.notEqual(mixed.supportStatus, "supported");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("chat requesting Complete Bouguer refuses terrain until the named zoned planar plan is approved", () => {
  const plan = terrainPlan("/tmp", {
    steps: { ...EMPTY_STEPS, gravity: true },
    capabilities: ["grav.ingest", "grav.freeair", "grav.bouguer", "grav.grid", "grav.gis", "grav.interpret"],
    parameters: { baseReference: "mean_base" },
  });
  const refused = applyChatPatches(plan, "also run complete Bouguer with terrain correction radius 150 m density 2.67 g/cm3");
  assert.equal(refused.capabilities?.includes("grav.terrain_near_zone"), false);
  assert.equal(refused.capabilities?.includes("grav.terrain_intermediate_zone"), false);
  assert.equal(refused.capabilities?.includes("grav.terrain_far_zone"), false);
  assert.equal(refused.steps.nearZoneTerrain, false);
  assert.equal(refused.steps.intermediateZoneTerrain, false);
  assert.equal(refused.steps.farZoneTerrain, false);
  assert.equal(refused.parameters.density, 2.67);
  assert.equal(refused.parameters.terrainRadiusM, 150);
  assert.equal(refused.parameters.zonedPlanarOffered, true);
  assert.equal(refused.parameters.zonedPlanarApproved, false);
  assert.equal(refused.parameters.requestIntent, "simple Bouguer");
  const refusal = refused.reviewDecisions?.find((d) => d.capabilityId === "complete-bouguer");
  assert.equal(refusal?.status, "refused");
  assert.match(refusal?.reason || "", /Complete Bouguer Anomaly is not supported/i);
  assert.match(refusal?.reason || "", /spherical far-zone/i);
  assert.match(refusal?.reason || "", /Hayford/);
  assert.match(refusal?.reason || "", /global\/adequate terrain coverage/i);
  assert.match(refusal?.reason || "", /atmospheric/i);
  assert.match(refusal?.reason || "", /zoned planar terrain-corrected Bouguer anomaly/);
  assert.ok(refused.notes?.some((line) => /zoned planar terrain-corrected Bouguer anomaly/.test(line)));

  const approved = applyChatPatches(refused, "approve zoned planar terrain-corrected Bouguer anomaly");
  assert.ok(approved.capabilities?.includes("grav.terrain_near_zone"));
  assert.ok(approved.capabilities?.includes("grav.terrain_intermediate_zone"));
  assert.ok(approved.capabilities?.includes("grav.terrain_far_zone"));
  assert.equal(approved.steps.nearZoneTerrain, true);
  assert.equal(approved.steps.intermediateZoneTerrain, true);
  assert.equal(approved.steps.farZoneTerrain, true);
  assert.equal(approved.parameters.zonedPlanarApproved, true);
  assert.equal(approved.parameters.requestIntent, "zoned planar terrain-corrected Bouguer anomaly");
  assert.equal(approved.parameters.productName, "zoned planar terrain-corrected Bouguer anomaly");
  assert.ok(
    approved.reviewDecisions?.some(
      (d) =>
        d.capabilityId === "grav.terrain_near_zone" &&
        d.status !== "refused" &&
        /zoned planar terrain-corrected Bouguer anomaly/.test(d.reason) &&
        !/Complete Bouguer/.test(d.reason)
    )
  );
  const noDensity = applyChatPatches(plan, "add terrain correction");
  assert.ok(noDensity.reviewDecisions?.some((d) => d.capabilityId === "grav.terrain_near_zone" && d.status === "needs-data"));
});

test("implementation plan names near-zone terrain-corrected Bouguer and refuses Complete Bouguer product copy", () => {
  const md = renderImplementationPlan({
    projectName: "GRAVITY",
    targetFolder: "valid",
    taskFolder: "r1",
    steps: { ...EMPTY_STEPS, gravity: true, nearZoneTerrain: true },
    baseReference: "mean_base",
    capabilities: [
      "grav.ingest",
      "grav.freeair",
      "grav.bouguer",
      "grav.terrain_near_zone",
      "grav.grid",
      "grav.interpret",
    ],
    density: 2.67,
    surveyLatitude: 10.8,
    elevationDatum: "orthometric",
    applyBullardB: false,
    terrainRadiusM: 150,
  });
  assert.match(md, /near-zone terrain-corrected Bouguer/i);
  assert.match(md, /Far-zone and intermediate-zone/i);
  assert.match(md, /Bullard B/);
  assert.ok(!/complete bouguer/i.test(md));
});

test("valid terrain-corrected plan binds DEM provenance and a versioned run folder", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "valid", catalog);
    assert.ok(inputs.some((item) => item.adapterId === "dem-ascii"));
    assert.ok(inputs.some((item) => item.adapterId === "gravity-xyz"));
    const check = validatePlan(terrainPlan(root, { inputs }), catalog);
    assert.equal(check.ok, true, check.blockers.map((b) => b.code + ": " + b.message).join("; "));
    const dag = compileCapabilityDag(terrainPlan(root).capabilities || []);
    const allocated = allocateApprovedRun(terrainPlan(root, { runId: "r-cba-1", dag, inputs, status: "draft" }));
    const frozenPath = writeFrozenPlanJson({ ...allocated, status: "approved", planHash: hashPlan(allocated) });
    const frozen = JSON.parse(fs.readFileSync(frozenPath, "utf8")) as AgentPlan;
    assert.ok(frozen.inputs?.some((item) => item.adapterId === "dem-ascii" && item.catalogId && item.checksum));
    assert.equal(frozen.parameters.density, 2.67);
    assert.equal(frozen.parameters.terrainRadiusM, 150);
    assert.equal(verifyBoundInputIdentity(root, inputs).ok, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("near-zone terrain-corrected grids are labelled separately from simple Bouguer and not as Complete Bouguer", () => {
  const nz = "G-AID Output/runs/r1/near_zone_terrain_corrected_bouguer_grid.asc";
  assert.equal(mapValueUnits(nz), "mGal");
  assert.equal(mapValueUnits("G-AID Output/runs/r1/bouguer_grid.asc"), "mGal");
  assert.match(layerLabel(nz), /near-zone terrain-corrected Bouguer/i);
  assert.ok(!/complete bouguer/i.test(layerLabel(nz)));
  const warnings = gravityProductWarnings({ path: nz, densityGcc: 2.67, terrainRadiusM: 150, bullardB: false });
  assert.ok(warnings.some((line) => /spherical far-zone/i.test(line)));
  assert.ok(warnings.some((line) => /Hayford/i.test(line)));
  assert.ok(warnings.some((line) => /far-zone/i.test(line)));
  assert.ok(warnings.some((line) => /Bullard B/i.test(line)));
  assert.ok(!warnings.some((line) => /complete bouguer/i.test(line)));
  const layers = buildMapLayers({
    catalog: null,
    files: [nz, "G-AID Output/runs/r1/bouguer_grid.asc"],
  });
  assert.ok(layers.some((layer) => /near_zone_terrain_corrected_bouguer/.test(layer.path)));
  assert.ok(layers.some((layer) => /near-zone terrain-corrected Bouguer/i.test(layer.label)));
  assert.ok(!layers.some((layer) => /complete bouguer/i.test(layer.label)));
});

test("inspectDemText requires documented CRS, metres, and vertical datum", () => {
  const inspected = inspectDemText("ncols 2\nnrows 2\nxllcorner 0\nyllcorner 0\ncellsize 10\n1 2\n3 4\n");
  assert.equal(inspected.looksLikeDem, false);
  const ready = inspectDemText("/ EPSG=32630\n/ Units=m\n/ ElevationDatum=orthometric\nncols 2\nnrows 2\nxllcorner 0\nyllcorner 0\ncellsize 10\n1 2\n3 4\n");
  assert.equal(ready.looksLikeDem, true);
  assert.equal(ready.epsg, 32630);
});

test("end-to-end near-zone terrain-corrected Bouguer when science deps exist", () => {
  const probe = spawnSync("python3", ["-c", "import numpy, pandas, scipy; print('ok')"], { encoding: "utf8" });
  if (probe.status !== 0) {
    console.log(`ok  (python terrain E2E skipped)`);
    return;
  }
  const nagy = spawnSync("python3", [path.join(process.cwd(), "python/tests/test_gravity_terrain.py")], {
    encoding: "utf8",
    cwd: process.cwd(),
    env: { ...process.env, PYTHONPATH: path.join(process.cwd(), "python") },
  });
  assert.equal(nagy.status, 0, nagy.stderr || nagy.stdout);

  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const stations = byPath(catalog.records, "valid/stations.xyz");
    const dem = byPath(catalog.records, "valid/dem.asc");
    const outDir = path.join(root, "G-AID Output", "runs");
    const taskFolder = "r-e2e-cba";
    fs.mkdirSync(path.join(outDir, taskFolder), { recursive: true });
    const payload = {
      parameters: {
        baseDir: root,
        outDir,
        taskFolder,
        density: 2.67,
        surveyLatitude: 10.8,
        elevationDatum: "orthometric",
        terrainRadiusM: 150,
        catalogInputs: [
          {
            catalogId: stations.id,
            path: stations.relativePath,
            adapterId: "gravity-xyz",
            absPath: path.join(root, stations.relativePath),
            checksum: stations.checksum.value,
          },
          {
            catalogId: dem.id,
            path: dem.relativePath,
            adapterId: "dem-ascii",
            absPath: path.join(root, dem.relativePath),
            checksum: dem.checksum.value,
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
          "dispatch('gravity_ingest', payload)",
          "dispatch('gravity_freeair', payload)",
          "dispatch('gravity_bouguer', payload)",
          "dispatch('gravity_terrain', payload)",
          "dispatch('grav_gridder', payload)",
          "dispatch('grav_gis_export', payload)",
          "dispatch('grav_interpret', payload)",
          "print('ok')",
        ].join("; "),
        JSON.stringify(payload),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(py.status, 0, py.stderr || py.stdout);
    const run = path.join(outDir, taskFolder);
    assert.equal(fs.existsSync(path.join(run, "near_zone_terrain_corrected_bouguer.csv")), true);
    assert.equal(fs.existsSync(path.join(run, "near_zone_terrain_corrected_bouguer_grid.asc")), true);
    const qc = JSON.parse(fs.readFileSync(path.join(run, "near_zone_terrain_corrected_bouguer_qc.json"), "utf8"));
    assert.equal(qc.far_zone, false);
    assert.equal(qc.intermediate_zone, false);
    assert.equal(qc.not_complete_bouguer, true);
    assert.equal(qc.dem_catalog_id, dem.id);
    assert.match(qc.convention, /near-zone terrain-corrected Bouguer/i);
    assert.ok(!/complete Bouguer Anomaly/i.test(qc.product_name));
    const report = JSON.parse(fs.readFileSync(path.join(run, "gravity_interpretation.json"), "utf8"));
    assert.ok(report.observations.some((line: string) => /near-zone terrain-corrected Bouguer/i.test(line)));
    assert.ok(report.not_established.some((line: string) => /drill/i.test(line)));
    assert.ok(report.not_established.some((line: string) => /spherical far-zone/i.test(line)));
    assert.ok(report.not_established.some((line: string) => /Hayford/i.test(line)));
    assert.ok(report.not_established.some((line: string) => /atmospheric/i.test(line)));
    assert.ok(!report.not_established.some((line: string) => /Complete Bouguer/i.test(line)));
    assert.ok(!/complete bouguer/i.test(report.product_name));
    const simpleQc = JSON.parse(fs.readFileSync(path.join(run, "gravity_bouguer_qc.json"), "utf8"));
    assert.match(simpleQc.convention, /simple Bouguer/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("hayford/far-zone chat grants registered zoned caps and does not treat them as unregistered", () => {
  assert.equal(unregisteredProposal("hayford bowie 167 km far-zone terrain"), undefined);
  const plan = terrainPlan("/tmp", {
    steps: { ...EMPTY_STEPS, gravity: true },
    capabilities: ["grav.ingest", "grav.freeair", "grav.bouguer", "grav.grid", "grav.gis", "grav.interpret"],
    parameters: { baseReference: "mean_base", density: 2.67, terrainRadiusM: 150 },
  });
  const patched = applyChatPatches(plan, "also apply intermediate-zone and far-zone terrain with far radius 200 km");
  assert.ok(patched.capabilities?.includes("grav.terrain_intermediate_zone"));
  assert.ok(patched.capabilities?.includes("grav.terrain_far_zone"));
  assert.equal(patched.parameters.farRadiusM, 200000);
  assert.equal(patched.parameters.applyFarZone, true);
  assert.ok(
    patched.reviewDecisions?.every(
      (d) => d.capabilityId !== "grav.terrain_far_zone" || d.status !== "refused"
    )
  );
  const dag = compileCapabilityDag(patched.capabilities || []);
  assert.deepEqual(
    dag.nodes.filter((n) => n.id === "gravity_terrain").map((n) => n.id),
    ["gravity_terrain"]
  );
  assert.match(dag.nodes.find((n) => n.id === "gravity_terrain")?.label || "", /planar Nagy/i);
  assert.ok(!/complete bouguer/i.test(dag.nodes.find((n) => n.id === "gravity_terrain")?.label || ""));
});

test("implementation plan for zoned terrain still refuses Complete Bouguer product copy", () => {
  const md = renderImplementationPlan({
    projectName: "GRAVITY",
    targetFolder: "valid",
    taskFolder: "r1",
    steps: { ...EMPTY_STEPS, gravity: true, nearZoneTerrain: true, intermediateZoneTerrain: true, farZoneTerrain: true },
    baseReference: "mean_base",
    capabilities: [
      "grav.ingest",
      "grav.freeair",
      "grav.bouguer",
      "grav.terrain_near_zone",
      "grav.terrain_intermediate_zone",
      "grav.terrain_far_zone",
      "grav.grid",
      "grav.interpret",
    ],
    density: 2.67,
    surveyLatitude: 10.8,
    elevationDatum: "orthometric",
    applyBullardB: false,
    terrainRadiusM: 150,
    farRadiusM: 200000,
  });
  assert.match(md, /planar Nagy/i);
  assert.match(md, /zoned planar terrain-corrected Bouguer anomaly/);
  assert.ok(!/complete bouguer/i.test(md));
  const warnings = gravityProductWarnings({
    path: "G-AID Output/runs/r1/near_zone_terrain_corrected_bouguer_grid.asc",
    densityGcc: 2.67,
    terrainRadiusM: 150,
    intermediateZone: true,
    farZone: false,
  });
  assert.ok(warnings.some((line) => /zoned planar terrain-corrected Bouguer anomaly/.test(line)));
  assert.ok(warnings.some((line) => /Hayford/i.test(line)));
  assert.ok(warnings.some((line) => /spherical far-zone/i.test(line)));
  assert.ok(!warnings.some((line) => /complete bouguer/i.test(line)));
});

test("end-to-end zoned request on a local DEM skips far-zone and never claims Complete Bouguer", () => {
  const probe = spawnSync("python3", ["-c", "import numpy, pandas, scipy; print('ok')"], { encoding: "utf8" });
  if (probe.status !== 0) {
    console.log(`ok  (python zoned terrain E2E skipped)`);
    return;
  }
  const zoned = spawnSync("python3", [path.join(process.cwd(), "python/tests/test_gravity_zoned_terrain.py")], {
    encoding: "utf8",
    cwd: process.cwd(),
    env: { ...process.env, PYTHONPATH: path.join(process.cwd(), "python") },
  });
  assert.equal(zoned.status, 0, zoned.stderr || zoned.stdout);
  const bench = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "docs/validation/results/gravity_zoned_terrain_benchmarks.json"), "utf8")
  );
  assert.equal(bench.all_passed, true);
  assert.equal(bench.complete_bouguer_justified, false);
  assert.equal(bench.hayford_bowie_compartments, false);

  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const stations = byPath(catalog.records, "valid/stations.xyz");
    const dem = byPath(catalog.records, "valid/dem.asc");
    const outDir = path.join(root, "G-AID Output", "runs");
    const taskFolder = "r-e2e-zoned";
    fs.mkdirSync(path.join(outDir, taskFolder), { recursive: true });
    const payload = {
      parameters: {
        baseDir: root,
        outDir,
        taskFolder,
        density: 2.67,
        surveyLatitude: 10.8,
        elevationDatum: "orthometric",
        terrainRadiusM: 150,
        applyIntermediateZone: true,
        applyFarZone: true,
        farRadiusM: 200000,
        capabilities: ["grav.terrain_near_zone", "grav.terrain_intermediate_zone", "grav.terrain_far_zone"],
        catalogInputs: [
          {
            catalogId: stations.id,
            path: stations.relativePath,
            adapterId: "gravity-xyz",
            absPath: path.join(root, stations.relativePath),
            checksum: stations.checksum.value,
          },
          {
            catalogId: dem.id,
            path: dem.relativePath,
            adapterId: "dem-ascii",
            absPath: path.join(root, dem.relativePath),
            checksum: dem.checksum.value,
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
          "dispatch('gravity_ingest', payload)",
          "dispatch('gravity_freeair', payload)",
          "dispatch('gravity_bouguer', payload)",
          "dispatch('gravity_terrain', payload)",
          "dispatch('grav_gridder', payload)",
          "dispatch('grav_gis_export', payload)",
          "dispatch('grav_interpret', payload)",
          "print('ok')",
        ].join("; "),
        JSON.stringify(payload),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(py.status, 0, py.stderr || py.stdout);
    const run = path.join(outDir, taskFolder);
    const qc = JSON.parse(fs.readFileSync(path.join(run, "near_zone_terrain_corrected_bouguer_qc.json"), "utf8"));
    assert.equal(qc.complete_bouguer, false);
    assert.equal(qc.complete_bouguer_justified, false);
    assert.equal(qc.far_zone, false);
    assert.ok(/does not cover|not invented|farRadiusM/i.test(qc.far.reason));
    assert.equal(qc.product_name, "zoned planar terrain-corrected Bouguer anomaly");
    assert.ok(!/complete bouguer/i.test(qc.product_name));
    assert.equal(fs.existsSync(path.join(run, "near_zone_terrain_corrected_bouguer_grid.asc")), true);
    const report = JSON.parse(fs.readFileSync(path.join(run, "gravity_interpretation.json"), "utf8"));
    assert.ok(report.not_established.some((line: string) => /spherical far-zone/i.test(line)));
    assert.ok(report.not_established.some((line: string) => /Hayford/i.test(line)));
    assert.ok(!report.not_established.some((line: string) => /Complete Bouguer/i.test(line)));
    assert.ok(!/complete bouguer/i.test(report.product_name));
    const gridQc = JSON.parse(fs.readFileSync(path.join(run, "gravity_grid_qc.json"), "utf8"));
    assert.ok(
      gridQc.source_column === "zoned_terrain_corrected_bouguer_mgal" ||
        gridQc.source_column === "near_zone_terrain_corrected_bouguer_mgal"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("phase5b gravity terrain ok");
