import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildProjectCatalog } from "./catalog/build.ts";
import { applyReviewedRadioMapping } from "./catalog/radio-mapping.ts";
import { inspectRadiometricText } from "./catalog/radio-contract.ts";
import { collectPlanInputs } from "./plan-intent.ts";
import {
  applyChatPatches,
  EMPTY_STEPS,
  normalizePlan,
  radiometricsStepsEnabled,
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
import { buildMapLayers, mapValueUnits, selectLayerByPath } from "./map/index.ts";
import { layerLabel } from "./raster-layers.ts";
import { isRadioTernaryPath, parseRadioTernaryJson } from "./radio/ternary.ts";
import type { CatalogRecord } from "./catalog/types.ts";

const fixtureSrc = path.join(process.cwd(), "tests/fixtures/radio-project");

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-phase6-rad-"));
  fs.cpSync(fixtureSrc, root, { recursive: true });
  return root;
}

function byPath(records: CatalogRecord[], rel: string): CatalogRecord {
  const record = records.find((item) => item.relativePath.replace(/\\/g, "/") === rel);
  assert.ok(record, `missing catalog record ${rel}`);
  return record;
}

function radioPlan(root: string, overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    plan: "# Implementation Plan\n",
    taskFolder: "",
    outputDir: "",
    productsRel: "",
    workspaceRoot: root,
    targetFolder: "valid",
    projectName: "RAD",
    intent: "radiometrics",
    steps: { ...EMPTY_STEPS, radiometrics: true },
    parameters: { baseReference: "mean_base" },
    workspaceBrief: "",
    rev: 1,
    notes: [],
    status: "draft",
    capabilities: ["rad.ingest", "rad.grid", "rad.ternary", "rad.ratios", "rad.gis", "rad.interpret"],
    ...overrides,
  };
}

test("rad.* capabilities are registered as supported; rad.correct is not", () => {
  for (const id of ["rad.ingest", "rad.grid", "rad.ternary", "rad.ratios", "rad.gis", "rad.interpret"]) {
    assert.equal(isRegisteredCapability(id), true);
  }
  assert.equal(isRegisteredCapability("rad.correct"), false);
  assert.equal(isRegisteredCapability("radiometric_correct"), false);
});

test("default radiometrics chat grants rad pack, not magnetics, and does not match bare K/U/Th", () => {
  const granted = proposeCapabilitiesFromMessage("process the radiometrics");
  assert.equal(granted.includes("rad.ingest"), true);
  assert.equal(granted.includes("rad.grid"), true);
  assert.equal(granted.includes("rad.interpret"), true);
  assert.equal(granted.includes("mag.diurnal"), false);
  assert.equal(granted.includes("mag.grid"), false);
  const assay = proposeCapabilitiesFromMessage("process the K U Th assay table");
  assert.equal(assay.includes("rad.ingest"), false);
  assert.equal(unregisteredProposal("apply NASVD and stripping"), "rad.correct");
  assert.equal(unregisteredProposal("process the radiometrics"), undefined);
});

test("radiometric DAG compiles without file_discovery or radiometric_correct", () => {
  const dag = compileCapabilityDag(["rad.ingest", "rad.grid", "rad.ternary", "rad.ratios", "rad.gis", "rad.interpret"]);
  const ids = dag.nodes.map((node) => node.id);
  assert.deepEqual(ids, ["rad_ingest", "rad_grid", "rad_ternary", "rad_ratios", "rad_gis_export", "rad_interpret"]);
  assert.equal(ids.includes("file_discovery"), false);
  assert.equal(ids.includes("radiometric_correct"), false);
  assert.equal(ids.includes("gravity_ingest"), false);
});

test("valid G-AID RAD 1.0 CSV with CRS, quantity, history, and canonical names is supported", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "valid/stations.csv");
    assert.equal(rec.adapterId, "radiometric-csv");
    assert.equal(rec.formatId, "radiometric-csv");
    assert.equal(rec.supportStatus, "supported");
    assert.equal(rec.crs, "EPSG:32630");
    assert.equal(rec.radioQuantity, "concentration");
    assert.ok(rec.correctionHistory);
    assert.equal(rec.radioMapping?.x, "X");
    assert.equal(rec.radioMapping?.line, "Line");
    const xyz = byPath(catalog.records, "valid-xyz/stations.xyz");
    assert.equal(xyz.adapterId, "radiometric-xyz");
    assert.equal(xyz.supportStatus, "supported");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("documented count-rate tables are supported; ternary is not justified", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "count-rate/stations.csv");
    assert.equal(rec.supportStatus, "supported");
    assert.equal(rec.radioQuantity, "count_rate");
    const inputs = collectPlanInputs(null, "count-rate", catalog);
    const check = validatePlan(radioPlan(root, { targetFolder: "count-rate", inputs }), catalog);
    assert.equal(check.blockers.some((issue) => issue.code === "no_radio_files"), false);
    assert.equal(check.warnings.some((issue) => issue.code === "ternary_not_justified"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("missing CRS, correction history, or Line stay recognised-unsupported", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    for (const rel of ["missing-crs/stations.csv", "missing-history/stations.csv", "missing-line/stations.csv"]) {
      const rec = byPath(catalog.records, rel);
      assert.equal(rec.adapterId, "radiometric-csv");
      assert.equal(rec.supportStatus, "recognised-unsupported");
    }
    const counts = byPath(catalog.records, "counts/stations.csv");
    assert.equal(counts.supportStatus, "recognised-unsupported");
    assert.ok(counts.parseErrors?.some((err) => /Quantity=counts/i.test(err)));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("K/U/Th assay columns are not radiometric data", () => {
  const assay = fs.readFileSync(path.join(fixtureSrc, "assay-not-radio/assays.csv"), "utf8");
  assert.equal(inspectRadiometricText(assay).looksLikeRadiometric, false);
  const xy = fs.readFileSync(path.join(fixtureSrc, "assay-xy/assays.csv"), "utf8");
  const inspected = inspectRadiometricText(xy);
  assert.equal(inspected.looksLikeRadiometric, false);
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "assay-xy/assays.csv");
    assert.notEqual(rec.adapterId, "radiometric-csv");
    assert.notEqual(rec.supportStatus, "supported");
    const inputs = collectPlanInputs(null, "assay-xy", catalog);
    assert.equal(inputs.some((item) => item.path.includes("assays.csv")), false);
    const check = validatePlan(radioPlan(root, { targetFolder: "assay-xy", inputs }), catalog);
    assert.equal(check.ok, false);
    assert.equal(check.blockers.some((issue) => issue.code === "no_radio_files"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("raw spectrometer channels are recognised-unsupported, not a live pack", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "raw-spectrum/spectra.csv");
    assert.equal(rec.adapterId, "radiometric-spectrum");
    assert.equal(rec.supportStatus, "recognised-unsupported");
    assert.equal(rec.formatId, "radiometric-spectrum");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("alias column names need a reviewed mapping before Proceed", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "mapped/stations.csv");
    assert.equal(rec.supportStatus, "recognised-unsupported");
    assert.ok(rec.parseErrors?.some((err) => /reviewed mapping/i.test(err)));
    const reviewed = applyReviewedRadioMapping(rec, {
      x: "Easting",
      y: "Northing",
      line: "Line",
      k: "Potassium",
      eu: "Uranium",
      eth: "Thorium",
      tc: "TotalCount",
      reviewed: true,
    });
    assert.equal(reviewed.supportStatus, "supported");
    assert.equal(reviewed.radioMapping?.reviewed, true);
    const inputs = collectPlanInputs(null, "mapped", { ...catalog, records: catalog.records.map((item) => (item.id === rec.id ? reviewed : item)) });
    const check = validatePlan(
      radioPlan(root, {
        targetFolder: "mapped",
        inputs,
        parameters: { baseReference: "mean_base", radioMapping: reviewed.radioMapping },
      }),
      { ...catalog, records: catalog.records.map((item) => (item.id === rec.id ? reviewed : item)) }
    );
    assert.equal(check.blockers.some((issue) => issue.code === "mapping_review_required"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("unnamed numeric XYZ is not a radiometric contract", () => {
  const text = fs.readFileSync(path.join(fixtureSrc, "unnamed-xyz/random.xyz"), "utf8");
  assert.equal(inspectRadiometricText(text).looksLikeRadiometric, false);
});

test("versioned run layout binds catalog ids for radiometrics", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "valid/stations.csv");
    const inputs = collectPlanInputs(null, "valid", catalog);
    assert.equal(inputs.length >= 1, true);
    assert.equal(inputs[0].adapterId, "radiometric-csv");
    const allocated = allocateApprovedRun(
      radioPlan(root, {
        inputs,
        runId: "r-rad-1",
      })
    );
    assert.match(allocated.productsRel || "", /G-AID Output\/runs\/r-rad-1/);
    const frozenPath = writeFrozenPlanJson({
      ...allocated,
      status: "approved",
      planHash: hashPlan(allocated),
    });
    assert.ok(frozenPath.includes(`${path.sep}G-AID Output${path.sep}runs${path.sep}r-rad-1${path.sep}plan.json`));
    const identity = verifyBoundInputIdentity(root, inputs);
    assert.equal(identity.ok, true);
    assert.equal(rec.checksum.value, inputs[0].checksum);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("radiometric ASCII grids open as map layers with channel units, not nT", () => {
  const root = tmpCopy();
  try {
    const runId = "r-rad-map";
    const runDir = path.join(root, "G-AID Output", "runs", runId);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(
      path.join(runDir, "rad_k_grid.asc"),
      ["ncols 3", "nrows 2", "xllcorner 450000", "yllcorner 1200000", "cellsize 200", "NODATA_value -9999", "1 2 3", "4 5 6"].join("\n")
    );
    fs.writeFileSync(path.join(runDir, "plan.json"), JSON.stringify({ runId, intent: "radiometrics", planHash: "rad-hash", status: "complete" }));
    const catalog = buildProjectCatalog(root);
    const layers = buildMapLayers({
      catalog,
      files: [`G-AID Output/runs/${runId}/rad_k_grid.asc`, `G-AID Output/runs/${runId}/plan.json`],
    });
    const grid = selectLayerByPath(layers, `G-AID Output/runs/${runId}/rad_k_grid.asc`);
    assert.ok(grid);
    assert.equal(grid.displayStatus, "viewable");
    assert.equal(grid.units, "%K");
    assert.equal(mapValueUnits("G-AID Output/runs/r1/rad_eu_grid.asc"), "ppm eU");
    assert.equal(mapValueUnits("G-AID Output/runs/r1/rad_eth_grid.asc"), "ppm eTh");
    assert.equal(mapValueUnits("G-AID Output/runs/r1/rad_tc_grid.asc"), "nGy/h");
    assert.notEqual(mapValueUnits("G-AID Output/runs/r1/rad_k_grid.asc"), "nT");
    assert.match(layerLabel("rad_ternary.json"), /ternary/i);
    assert.equal(isRadioTernaryPath("G-AID Output/runs/r1/rad_ternary.json"), true);
    const ternary = parseRadioTernaryJson(
      JSON.stringify({
        source: "grids",
        nx: 1,
        ny: 1,
        rgb: [[[0.2, 0.4, 0.8]]],
        assignment: { R: "K %", G: "eTh ppm", B: "eU ppm" },
        formula: "stretch",
        p_lo: 2,
        p_hi: 98,
      })
    );
    assert.equal(ternary.assignment.R, "K %");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("chat can accept radiometrics without a RadiometricsPipeline", () => {
  const patched = applyChatPatches(
    radioPlan("/surveys/RAD", {
      intent: "magnetic",
      steps: { ...EMPTY_STEPS, diurnal: true },
      capabilities: ["mag.diurnal"],
    }),
    "also process the radiometrics"
  );
  assert.equal(patched.steps.radiometrics, true);
  assert.equal(radiometricsStepsEnabled(patched.steps), true);
  assert.equal(patched.steps.diurnal, true);
  assert.ok(patched.capabilities?.includes("rad.ingest"));
  assert.ok(
    patched.reviewDecisions?.some((d) => d.capabilityId === "rad.ingest" && (d.status === "accepted" || d.status === "needs-data"))
  );
  const impl = fs.readFileSync(path.join(process.cwd(), "src/pipeline/MagneticPreprocessingPipeline.ts"), "utf8");
  assert.match(impl, /rad_ingest: SCIENCE/);
  assert.match(impl, /Do not add a RadiometricsPipeline execution route/);
});

test("normalizePlan compiles radiometrics instead of refusing it", () => {
  const next = normalizePlan(radioPlan("/tmp/r"));
  assert.equal(next.steps.radiometrics, true);
  assert.equal((next.notes || []).some((note) => /not compiled into the DAG/i.test(note)), false);
  assert.ok(next.dag?.nodes.some((node) => node.id === "rad_ingest"));
});

test("end-to-end radiometric ingest through the Python runtime when science deps exist", () => {
  const probe = spawnSync("python3", ["-c", "import numpy, pandas, scipy; print('ok')"], { encoding: "utf8" });
  if (probe.status !== 0) {
    const missing = probe.stderr || probe.stdout || "python import failed";
    console.log(`ok  (python radiometrics E2E skipped: ${missing.split("\n")[0]})`);
    return;
  }
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "valid/stations.csv");
    const outDir = path.join(root, "G-AID Output", "runs");
    const taskFolder = "r-e2e-rad";
    fs.mkdirSync(path.join(outDir, taskFolder), { recursive: true });
    const payload = {
      node_id: "rad_ingest",
      parameters: {
        baseDir: root,
        outDir,
        taskFolder,
        catalogInputs: [
          {
            catalogId: rec.id,
            path: rec.relativePath,
            adapterId: "radiometric-csv",
            absPath: path.join(root, rec.relativePath),
            radioMapping: rec.radioMapping,
            radioQuantity: rec.radioQuantity,
            correctionHistory: rec.correctionHistory,
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
    assert.equal(fs.existsSync(path.join(outDir, taskFolder, "rad_canonical.csv")), true);
    const ingestQc = JSON.parse(fs.readFileSync(path.join(outDir, taskFolder, "rad_ingest_qc.json"), "utf8"));
    assert.equal(ingestQc.quantity, "concentration");
    assert.equal(ingestQc.corrections_applied_in_g_aid, false);

    const rest = spawnSync(
      "python3",
      [
        "-c",
        [
          "import json, os, sys",
          "root = os.getcwd()",
          "sys.path.insert(0, os.path.join(root, 'python'))",
          "from kernels import dispatch",
          "payload = json.loads(sys.argv[1])",
          "dispatch('rad_grid', payload)",
          "dispatch('rad_ternary', payload)",
          "dispatch('rad_ratios', payload)",
          "dispatch('rad_gis_export', payload)",
          "dispatch('rad_interpret', payload)",
          "print('ok')",
        ].join("\n"),
        JSON.stringify({ parameters: { baseDir: root, outDir, taskFolder } }),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(rest.status, 0, rest.stderr || rest.stdout);
    assert.equal(fs.existsSync(path.join(outDir, taskFolder, "rad_k_grid.asc")), true);
    assert.equal(fs.existsSync(path.join(outDir, taskFolder, "rad_stations.geojson")), true);
    const ternaryQc = JSON.parse(fs.readFileSync(path.join(outDir, taskFolder, "rad_ternary_qc.json"), "utf8"));
    assert.equal(ternaryQc.skipped, false);
    assert.equal(ternaryQc.justified, true);
    const ratios = fs.readFileSync(path.join(outDir, taskFolder, "rad_ratios.csv"), "utf8");
    assert.match(ratios, /eu_eth/);
    const report = JSON.parse(fs.readFileSync(path.join(outDir, taskFolder, "rad_interpretation.json"), "utf8"));
    assert.ok(report.not_established.some((line: string) => /mineralisation/i.test(line)));
    assert.ok(report.not_established.some((line: string) => /lithology/i.test(line)));
    assert.ok(report.not_established.some((line: string) => /alteration/i.test(line)));
    assert.ok(report.not_established.some((line: string) => /drill/i.test(line)));
    assert.equal(report.corrections_applied_in_g_aid, false);
    assert.equal(report.affirmative_language_allowed, false);

    const refuse = spawnSync(
      "python3",
      [
        "-c",
        [
          "import os, sys",
          "sys.path.insert(0, os.path.join(os.getcwd(), 'python'))",
          "from kernels import dispatch",
          "try:",
          "    dispatch('radiometric_correct', {'parameters': {}})",
          "    raise SystemExit('expected failure')",
          "except ValueError as err:",
          "    print(str(err))",
        ].join("\n"),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(refuse.status, 0, refuse.stderr || refuse.stdout);
    assert.match(refuse.stdout, /not a live capability/i);

    const cr = byPath(catalog.records, "count-rate/stations.csv");
    const crFolder = "r-e2e-rad-cps";
    fs.mkdirSync(path.join(outDir, crFolder), { recursive: true });
    const crPayload = {
      parameters: {
        baseDir: root,
        outDir,
        taskFolder: crFolder,
        catalogInputs: [
          {
            catalogId: cr.id,
            path: cr.relativePath,
            adapterId: "radiometric-csv",
            absPath: path.join(root, cr.relativePath),
          },
        ],
      },
    };
    const crRun = spawnSync(
      "python3",
      [
        "-c",
        [
          "import json, os, sys",
          "root = os.getcwd()",
          "sys.path.insert(0, os.path.join(root, 'python'))",
          "from kernels import dispatch",
          "payload = json.loads(sys.argv[1])",
          "dispatch('rad_ingest', payload)",
          "dispatch('rad_ternary', payload)",
          "dispatch('rad_ratios', payload)",
          "print('ok')",
        ].join("\n"),
        JSON.stringify(crPayload),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(crRun.status, 0, crRun.stderr || crRun.stdout);
    const crTernary = JSON.parse(fs.readFileSync(path.join(outDir, crFolder, "rad_ternary_qc.json"), "utf8"));
    assert.equal(crTernary.skipped, true);
    const crRatio = JSON.parse(fs.readFileSync(path.join(outDir, crFolder, "rad_ratio_qc.json"), "utf8"));
    assert.equal(crRatio.skipped, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
