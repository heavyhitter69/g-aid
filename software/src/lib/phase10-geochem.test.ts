import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildProjectCatalog } from "./catalog/build.ts";
import { inspectGeochemText, geochemReadyForSupport, parseCensoredToken } from "./catalog/geochem-contract.ts";
import { applyReviewedGeochemMapping } from "./catalog/geochem-mapping.ts";
import { collectPlanInputs } from "./plan-intent.ts";
import {
  applyChatPatches,
  EMPTY_STEPS,
  geochemStepsEnabled,
  validatePlan,
  type AgentPlan,
} from "./plan-spec.ts";
import {
  compileCapabilityDag,
  isRegisteredCapability,
  proposeCapabilitiesFromMessage,
  unregisteredProposal,
} from "./capabilities/index.ts";
import { comparisonBlocked } from "./geochem-product.ts";
import { overlayDecision, crsFromEpsg } from "./map/crs.ts";
import { detectAnalysisIntent } from "./workspace-index.ts";
import type { CatalogRecord } from "./catalog/types.ts";

const fixtureSrc = path.join(process.cwd(), "tests/fixtures/geochem-project");
const catalogProject = path.join(process.cwd(), "tests/fixtures/catalog-project");

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-phase10-geochem-"));
  fs.cpSync(fixtureSrc, root, { recursive: true });
  return root;
}

function byPath(records: CatalogRecord[], rel: string): CatalogRecord {
  const record = records.find((item) => item.relativePath.replace(/\\/g, "/") === rel);
  assert.ok(record, `missing catalog record ${rel}`);
  return record;
}

function geochemPlan(root: string, overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    plan: "# Implementation Plan\n",
    taskFolder: "",
    outputDir: "",
    productsRel: "",
    workspaceRoot: root,
    targetFolder: "valid",
    projectName: "GEOCHEM",
    intent: "geochemistry",
    steps: { ...EMPTY_STEPS, geochem: true },
    parameters: { baseReference: "mean_base" },
    workspaceBrief: "",
    rev: 1,
    notes: [],
    status: "draft",
    capabilities: ["geochem.ingest", "geochem.qc", "geochem.map_points", "geochem.summary", "geochem.interpret"],
    ...overrides,
  };
}

test("geochem.* capabilities are registered; GeochemPipeline is not an execution route", () => {
  for (const id of [
    "geochem.ingest",
    "geochem.qc",
    "geochem.map_points",
    "geochem.summary",
    "geochem.display_transform",
    "geochem.interpret",
  ]) {
    assert.equal(isRegisteredCapability(id), true);
  }
  const pipelineSrc = fs.readFileSync(path.join(process.cwd(), "src/pipeline/MagneticPreprocessingPipeline.ts"), "utf8");
  assert.match(pipelineSrc, /Geochemistry uses this same engine/);
  assert.match(pipelineSrc, /class GeochemPipeline/);
  assert.doesNotMatch(pipelineSrc, /new GeochemPipeline/);
  assert.match(pipelineSrc, /geochem_ingest: SCIENCE/);
  assert.equal(isRegisteredCapability("geochem_ingest"), false);
});

test("process the assays grants geochem, not radiometrics or GIS", () => {
  const granted = proposeCapabilitiesFromMessage("process the assays");
  assert.equal(granted.includes("geochem.ingest"), true);
  assert.equal(granted.includes("geochem.qc"), true);
  assert.equal(granted.includes("geochem.map_points"), true);
  assert.equal(granted.includes("geochem.summary"), true);
  assert.equal(granted.includes("geochem.interpret"), true);
  assert.equal(granted.includes("geochem.display_transform"), false);
  assert.equal(granted.includes("rad.ingest"), false);
  assert.equal(granted.includes("gis.vector_ingest"), false);
  assert.equal(granted.includes("mag.diurnal"), false);
  const logAsk = proposeCapabilitiesFromMessage("process the soil samples and approve the log10 display transform");
  assert.equal(logAsk.includes("geochem.display_transform"), true);
});

test("process the assays is geochemistry intent; radio and chemistry keywords stay distinct", () => {
  assert.equal(detectAnalysisIntent("process the assays"), "geochemistry");
  assert.equal(detectAnalysisIntent("process the soil samples"), "geochemistry");
  assert.equal(detectAnalysisIntent("process the radiometric survey"), "radiometrics");
  assert.equal(detectAnalysisIntent("process the geojson"), "gis");
});

test("unregistered anomaly, prospectivity, and targeting proposals are refused", () => {
  assert.equal(unregisteredProposal("detect anomalies in the soil assays"), "geochem.anomaly");
  assert.equal(unregisteredProposal("prospectivity scoring from geochem"), "geochem.anomaly");
  assert.equal(unregisteredProposal("mineral targets from the assay table"), "geochem.anomaly");
  const patched = applyChatPatches(geochemPlan("/tmp"), "detect anomalies in the soil assays");
  assert.equal(patched.reviewDecisions?.some((d) => d.capabilityId === "geochem.anomaly" && d.status === "refused"), true);
});

test("geochem DAG compiles without file_discovery or a GeochemPipeline", () => {
  const dag = compileCapabilityDag(["geochem.ingest", "geochem.qc", "geochem.map_points", "geochem.summary", "geochem.interpret"]);
  assert.deepEqual(
    dag.nodes.map((node) => node.id),
    ["geochem_ingest", "geochem_qc", "geochem_map_points", "geochem_summary", "geochem_interpret"]
  );
  assert.equal(dag.nodes.some((node) => node.id === "file_discovery"), false);
  const withTransform = compileCapabilityDag([
    "geochem.ingest",
    "geochem.qc",
    "geochem.map_points",
    "geochem.summary",
    "geochem.display_transform",
    "geochem.interpret",
  ]);
  assert.deepEqual(
    withTransform.nodes.map((node) => node.id),
    ["geochem_ingest", "geochem_qc", "geochem_map_points", "geochem_summary", "geochem_display_transform", "geochem_interpret"]
  );
});

test("catalog classifies documented GEOCHEM 1.0 and does not sniff Fe/Cu columns as geochemistry", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const valid = byPath(catalog.records, "valid/assays.csv");
  assert.equal(valid.adapterId, "geochem-csv");
  assert.equal(valid.supportStatus, "supported");
  assert.equal(valid.domainHint, "geochemistry");
  assert.equal(valid.crs, "EPSG:32734");
  assert.equal(valid.sampleMedium, "soil");
  assert.equal(valid.geochemMapping?.sampleId, "SampleID");
  const xyz = byPath(catalog.records, "xyz/assays.xyz");
  assert.equal(xyz.adapterId, "geochem-xyz");
  assert.equal(xyz.supportStatus, "supported");
  const overlayAssay = byPath(catalog.records, "overlay/assays.csv");
  assert.equal(overlayAssay.adapterId, "geochem-csv");
  const overlayGis = byPath(catalog.records, "overlay/geology.geojson");
  assert.equal(overlayGis.adapterId, "geojson");
  assert.notEqual(overlayGis.domainHint, "geochemistry");
  const chemRoot = buildProjectCatalog(catalogProject);
  const chem = chemRoot.records.find((item) => item.relativePath.replace(/\\/g, "/") === "tables/chemistry.csv");
  assert.ok(chem);
  assert.equal(chem.formatId, "delimited-table");
  assert.equal(chem.supportStatus, "recognised-unsupported");
  assert.notEqual(chem.adapterId, "geochem-csv");
  assert.equal(chem.domainHint, "unknown");
});

test("mixed units, BDL, duplicates, missing CRS, and unknown headers are classified distinctly", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const mixed = byPath(catalog.records, "mixed-units/assays.csv");
  assert.equal(mixed.supportStatus, "supported");
  assert.match(mixed.units || "", /mixed/i);
  const bdl = byPath(catalog.records, "bdl/assays.csv");
  assert.equal(bdl.supportStatus, "supported");
  const missing = byPath(catalog.records, "missing-crs/assays.csv");
  assert.equal(missing.supportStatus, "recognised-unsupported");
  assert.ok(missing.parseErrors?.some((line) => /CRS is not documented/i.test(line)));
  const unknown = byPath(catalog.records, "unknown-headers/assays.csv");
  assert.equal(unknown.supportStatus, "recognised-unsupported");
  assert.ok(unknown.parseErrors?.some((line) => /reviewed mapping|ambiguity/i.test(line)));
  const invalid = byPath(catalog.records, "invalid-mapping/assays.csv");
  assert.equal(invalid.supportStatus, "recognised-unsupported");
  const reviewed = applyReviewedGeochemMapping(unknown, {
    sampleId: "SITE",
    x: "Easting",
    y: "Northing",
    elements: [
      { column: "Au", symbol: "Au", units: "ppm" },
      { column: "Cu", symbol: "Cu", units: "ppm" },
    ],
    reviewed: true,
  });
  assert.equal(reviewed.supportStatus, "supported");
  assert.equal(reviewed.geochemMapping?.reviewed, true);
});

test("plan binds only supported geochem; chemistry.csv and missing CRS are not processing inputs", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const validInputs = collectPlanInputs(null, "valid", catalog);
  assert.equal(validInputs.every((item) => item.adapterId === "geochem-csv" || item.adapterId === "geochem-xyz"), true);
  assert.equal(validInputs.length, 1);
  const missing = collectPlanInputs(null, "missing-crs", catalog);
  assert.equal(missing.length, 0);
  const unknown = collectPlanInputs(null, "unknown-headers", catalog);
  assert.equal(unknown.length, 0);
  const chemCatalog = buildProjectCatalog(catalogProject);
  const chemInputs = collectPlanInputs(null, "tables", chemCatalog);
  assert.equal(chemInputs.some((item) => item.adapterId === "geochem-csv"), false);
});

test("validatePlan blocks geochem without GEOCHEM records and overlay is coincidence", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const empty = validatePlan(
    geochemPlan(root, { targetFolder: "missing-crs", inputs: collectPlanInputs(null, "missing-crs", catalog) }),
    catalog
  );
  assert.equal(empty.ok, false);
  assert.ok(empty.blockers.some((item) => item.code === "no_geochem_files"));
  const ok = validatePlan(geochemPlan(root, { inputs: collectPlanInputs(null, "valid", catalog) }), catalog);
  assert.equal(ok.ok, true);
  const mixed = validatePlan(
    geochemPlan(root, {
      targetFolder: "mixed-units",
      inputs: collectPlanInputs(null, "mixed-units", catalog),
    }),
    catalog
  );
  assert.equal(mixed.ok, true);
  assert.ok(mixed.warnings.some((item) => item.code === "geochem_mixed_units"));
  const transform = validatePlan(
    geochemPlan(root, {
      inputs: collectPlanInputs(null, "valid", catalog),
      capabilities: ["geochem.ingest", "geochem.qc", "geochem.display_transform", "geochem.interpret"],
    }),
    catalog
  );
  assert.equal(transform.ok, false);
  assert.ok(transform.blockers.some((item) => item.code === "geochem_transform_not_approved"));
  assert.equal(geochemStepsEnabled(geochemPlan(root).steps), true);
});

test("censored tokens are never zero; mixed units block comparison", () => {
  const bdl = parseCensoredToken("<0.01");
  assert.equal(bdl.censored, true);
  assert.equal(bdl.numeric, null);
  assert.notEqual(bdl.numeric, 0);
  const token = parseCensoredToken("BDL");
  assert.equal(token.censored, true);
  const cmp = comparisonBlocked("ppm", "pct");
  assert.equal(cmp.blocked, true);
  const same = comparisonBlocked("ppm", "ppm");
  assert.equal(same.blocked, false);
  const unknown = overlayDecision(undefined, crsFromEpsg(32734, "geojson"));
  assert.equal(unknown.allowed, false);
});

test("contract inspect does not treat chemistry.csv as GEOCHEM 1.0", () => {
  const text = fs.readFileSync(path.join(catalogProject, "tables", "chemistry.csv"), "utf8");
  const inspected = inspectGeochemText(text);
  assert.equal(inspected.looksLikeGeochem, false);
  assert.equal(geochemReadyForSupport(inspected), false);
  const valid = inspectGeochemText(fs.readFileSync(path.join(fixtureSrc, "valid", "assays.csv"), "utf8"));
  assert.equal(geochemReadyForSupport(valid), true);
  assert.equal(valid.canonical, true);
});

test("python kernels ingest, QC censored BDL, map points, block mixed-unit comparison, and refuse extension search", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const rec = catalog.records.find((item) => item.relativePath === "valid/assays.csv");
  assert.ok(rec);
  const outRoot = path.join(root, "G-AID Output", "runs");
  fs.mkdirSync(path.join(outRoot, "r-geochem"), { recursive: true });
  const payload = {
    parameters: {
      baseDir: root,
      outDir: outRoot,
      taskFolder: "r-geochem",
      catalogInputs: [
        {
          catalogId: rec.id,
          path: rec.relativePath,
          adapterId: rec.adapterId,
          formatId: rec.formatId,
          absPath: path.join(root, rec.relativePath),
          checksum: rec.checksum.value,
          geochemMapping: rec.geochemMapping,
          crs: rec.crs,
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
        "dispatch('geochem_ingest', payload)",
        "dispatch('geochem_qc', payload)",
        "dispatch('geochem_map_points', payload)",
        "dispatch('geochem_summary', payload)",
        "dispatch('geochem_interpret', payload)",
        "print('ok')",
      ].join("\n"),
      JSON.stringify(payload),
    ],
    { encoding: "utf8", cwd: process.cwd() }
  );
  assert.equal(py.status, 0, py.stderr || py.stdout);
  const run = path.join(outRoot, "r-geochem");
  const canonical = JSON.parse(fs.readFileSync(path.join(run, "geochem_canonical.json"), "utf8"));
  assert.equal(canonical.tables[0].replaced_bdl_with_zero, false);
  const qc = JSON.parse(fs.readFileSync(path.join(run, "geochem_qc.json"), "utf8"));
  assert.equal(qc.replaced_bdl_with_zero, false);
  assert.ok(fs.existsSync(path.join(run, "geochem_points.geojson")));
  const interp = JSON.parse(fs.readFileSync(path.join(run, "geochem_interpretation.json"), "utf8"));
  assert.equal(interp.geological_certainty_improved, false);
  assert.ok(interp.not_established.some((line: string) => /Ore is not established/i.test(line)));

  const mixedRec = catalog.records.find((item) => item.relativePath === "mixed-units/assays.csv");
  assert.ok(mixedRec);
  fs.mkdirSync(path.join(outRoot, "r-mixed"), { recursive: true });
  const mixedPayload = {
    parameters: {
      baseDir: root,
      outDir: outRoot,
      taskFolder: "r-mixed",
      elements: "Au_ppm,Fe_pct",
      catalogInputs: [
        {
          catalogId: mixedRec.id,
          path: mixedRec.relativePath,
          adapterId: mixedRec.adapterId,
          absPath: path.join(root, mixedRec.relativePath),
          geochemMapping: mixedRec.geochemMapping,
          crs: mixedRec.crs,
        },
      ],
    },
  };
  const mixedPy = spawnSync(
    "python3",
    [
      "-c",
      [
        "import json, os, sys",
        "sys.path.insert(0, os.path.join(os.getcwd(), 'python'))",
        "from kernels import dispatch",
        "payload = json.loads(sys.argv[1])",
        "dispatch('geochem_ingest', payload)",
        "dispatch('geochem_qc', payload)",
        "dispatch('geochem_summary', payload)",
        "print('ok')",
      ].join("\n"),
      JSON.stringify(mixedPayload),
    ],
    { encoding: "utf8", cwd: process.cwd() }
  );
  assert.equal(mixedPy.status, 0, mixedPy.stderr || mixedPy.stdout);
  const summary = JSON.parse(fs.readFileSync(path.join(outRoot, "r-mixed", "geochem_summary.json"), "utf8"));
  assert.equal(summary.comparisons[0].blocked, true);

  const bdlRec = catalog.records.find((item) => item.relativePath === "bdl/assays.csv");
  assert.ok(bdlRec);
  fs.mkdirSync(path.join(outRoot, "r-bdl"), { recursive: true });
  const bdlPayload = {
    parameters: {
      baseDir: root,
      outDir: outRoot,
      taskFolder: "r-bdl",
      catalogInputs: [
        {
          catalogId: bdlRec.id,
          path: bdlRec.relativePath,
          adapterId: bdlRec.adapterId,
          absPath: path.join(root, bdlRec.relativePath),
          geochemMapping: bdlRec.geochemMapping,
          crs: bdlRec.crs,
        },
      ],
    },
  };
  const bdlPy = spawnSync(
    "python3",
    [
      "-c",
      [
        "import json, os, sys",
        "sys.path.insert(0, os.path.join(os.getcwd(), 'python'))",
        "from kernels import dispatch",
        "payload = json.loads(sys.argv[1])",
        "dispatch('geochem_ingest', payload)",
        "dispatch('geochem_qc', payload)",
        "print('ok')",
      ].join("\n"),
      JSON.stringify(bdlPayload),
    ],
    { encoding: "utf8", cwd: process.cwd() }
  );
  assert.equal(bdlPy.status, 0, bdlPy.stderr || bdlPy.stdout);
  const bdlCanon = JSON.parse(fs.readFileSync(path.join(outRoot, "r-bdl", "geochem_canonical.json"), "utf8"));
  const first = bdlCanon.tables[0].samples[0].values.Au_ppm;
  assert.equal(first.censored, true);
  assert.equal(first.value, null);
  const bdlQc = JSON.parse(fs.readFileSync(path.join(outRoot, "r-bdl", "geochem_qc.json"), "utf8"));
  assert.ok(bdlQc.n_censored >= 3);

  const refuse = spawnSync(
    "python3",
    [
      "-c",
      [
        "import json, os, sys",
        "sys.path.insert(0, os.path.join(os.getcwd(), 'python'))",
        "from kernels import dispatch",
        "try:",
        "    dispatch('geochem_ingest', {'parameters': {'baseDir': '.', 'outDir': '/tmp', 'taskFolder': 'x', 'catalogInputs': []}})",
        "    raise SystemExit('should have refused empty catalogInputs')",
        "except ValueError as exc:",
        "    if 'catalogInputs' not in str(exc): raise",
        "print('ok')",
      ].join("\n"),
    ],
    { encoding: "utf8", cwd: process.cwd() }
  );
  assert.equal(refuse.status, 0, refuse.stderr || refuse.stdout);
});

test("desktop verification fixtures cover catalog, BDL, mixed units, QC, and interpretation", () => {
  const runs = path.join(process.cwd(), "tests/fixtures/validation-ui/G-AID Output/runs");
  if (!fs.existsSync(path.join(runs, "r-verify-geochem-valid", "geochem_canonical.json"))) {
    console.log("skip  desktop geochem fixtures (generated after kernel run)");
    return;
  }
  const canon = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-geochem-valid", "geochem_canonical.json"), "utf8"));
  assert.equal(canon.kind, "geochem-samples");
  const interp = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-geochem-valid", "geochem_interpretation.json"), "utf8"));
  assert.equal(interp.geological_certainty_improved, false);
  const mixed = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-geochem-mixed", "geochem_summary.json"), "utf8"));
  assert.equal(mixed.comparisons[0].blocked, true);
  const bdl = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-geochem-bdl", "geochem_qc.json"), "utf8"));
  assert.ok(bdl.n_censored >= 1);
  const qc = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-geochem-qc", "geochem_qc.json"), "utf8"));
  assert.ok(qc.qa_qc);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nphase10-geochem ok");
