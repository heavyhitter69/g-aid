import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildProjectCatalog } from "./catalog/build.ts";
import { inspectLasText, isLasfSignature, lasReadyForSupport } from "./catalog/las-contract.ts";
import { collectPlanInputs } from "./plan-intent.ts";
import {
  applyChatPatches,
  boreholeStepsEnabled,
  EMPTY_STEPS,
  validatePlan,
  type AgentPlan,
} from "./plan-spec.ts";
import {
  compileCapabilityDag,
  isRegisteredCapability,
  proposeCapabilitiesFromMessage,
  unregisteredProposal,
} from "./capabilities/index.ts";
import { parseBoreholeTracks } from "./log/parse.ts";
import { layersOverlappingCollar } from "./borehole-product.ts";
import { detectAnalysisIntent } from "./workspace-index.ts";
import type { CatalogRecord } from "./catalog/types.ts";

const fixtureSrc = path.join(process.cwd(), "tests/fixtures/las-project");

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-phase8-las-"));
  fs.cpSync(fixtureSrc, root, { recursive: true });
  return root;
}

function byPath(records: CatalogRecord[], rel: string): CatalogRecord {
  const record = records.find((item) => item.relativePath.replace(/\\/g, "/") === rel);
  assert.ok(record, `missing catalog record ${rel}`);
  return record;
}

function lasPlan(root: string, overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    plan: "# Implementation Plan\n",
    taskFolder: "",
    outputDir: "",
    productsRel: "",
    workspaceRoot: root,
    targetFolder: "valid",
    projectName: "LAS",
    intent: "borehole",
    steps: { ...EMPTY_STEPS, borehole: true },
    parameters: { baseReference: "mean_base" },
    workspaceBrief: "",
    rev: 1,
    notes: [],
    status: "draft",
    capabilities: ["borehole.ingest_las", "borehole.view_logs", "borehole.interpret"],
    ...overrides,
  };
}

test("borehole.* capabilities are registered; WellLogPipeline is not an execution route", () => {
  for (const id of ["borehole.ingest_las", "borehole.view_logs", "borehole.map_collar", "borehole.interpret"]) {
    assert.equal(isRegisteredCapability(id), true);
  }
  const pipelineSrc = fs.readFileSync(path.join(process.cwd(), "src/pipeline/MagneticPreprocessingPipeline.ts"), "utf8");
  assert.match(pipelineSrc, /LAS borehole uses this same engine/);
  assert.match(pipelineSrc, /class WellLogPipeline/);
  assert.doesNotMatch(pipelineSrc, /new WellLogPipeline/);
  assert.match(pipelineSrc, /las_ingest: SCIENCE/);
  assert.equal(isRegisteredCapability("las_ingest"), false);
});

test("default LAS chat grants ingest/view/interpret, not magnetics or map_collar", () => {
  const granted = proposeCapabilitiesFromMessage("process the las");
  assert.equal(granted.includes("borehole.ingest_las"), true);
  assert.equal(granted.includes("borehole.view_logs"), true);
  assert.equal(granted.includes("borehole.interpret"), true);
  assert.equal(granted.includes("borehole.map_collar"), false);
  assert.equal(granted.includes("mag.diurnal"), false);
  assert.equal(granted.includes("gpr.ingest"), false);
  const mapped = proposeCapabilitiesFromMessage("map the borehole collar");
  assert.equal(mapped.includes("borehole.map_collar"), true);
});

test("LiDAR / point-cloud language is not a borehole intent; process the las is", () => {
  assert.equal(detectAnalysisIntent("process the las"), "borehole");
  assert.equal(detectAnalysisIntent("process the well log"), "borehole");
  assert.equal(detectAnalysisIntent("process the lidar las"), null);
  assert.equal(detectAnalysisIntent("kirchhoff migrate the gpr"), "gpr");
});

test("unregistered lithology and trajectory proposals are refused", () => {
  assert.equal(unregisteredProposal("classify lithology from the las"), "borehole.classify");
  assert.equal(unregisteredProposal("convert the log to true vertical depth"), "borehole-trajectory");
  const patched = applyChatPatches(lasPlan("/tmp"), "classify lithology from the las");
  assert.equal(patched.reviewDecisions?.some((d) => d.capabilityId === "borehole.classify" && d.status === "refused"), true);
});

test("LAS DAG compiles without file_discovery or a BoreholePipeline", () => {
  const dag = compileCapabilityDag(["borehole.ingest_las", "borehole.view_logs", "borehole.interpret"]);
  assert.deepEqual(
    dag.nodes.map((node) => node.id),
    ["las_ingest", "borehole_view", "borehole_interpret"]
  );
  assert.equal(dag.nodes.some((node) => node.id === "file_discovery"), false);
  const withMap = compileCapabilityDag([
    "borehole.ingest_las",
    "borehole.view_logs",
    "borehole.map_collar",
    "borehole.interpret",
  ]);
  assert.deepEqual(
    withMap.nodes.map((node) => node.id),
    ["las_ingest", "borehole_view", "borehole_map_collar", "borehole_interpret"]
  );
});

test("catalog: valid LAS 2.0 is supported; LiDAR, WRAP.YES, LAS3, missing units, malformed, duplicates are not", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const valid = byPath(catalog.records, "valid/well.las");
    assert.equal(valid.adapterId, "las-well");
    assert.equal(valid.formatId, "las-well");
    assert.equal(valid.supportStatus, "supported");
    assert.equal(valid.wellId, "DEMO-1");
    assert.deepEqual(valid.curves, ["DEPT", "GR", "RHOB", "NPHI"]);
    assert.equal(valid.collarMappable, false);

    const collar = byPath(catalog.records, "valid-collar/well.las");
    assert.equal(collar.supportStatus, "supported");
    assert.equal(collar.crs, "EPSG:4326");
    assert.equal(collar.collarMappable, true);
    assert.equal(collar.coordinateKind, "geographic");

    const cloud = byPath(catalog.records, "lidar/cloud.las");
    assert.equal(cloud.formatId, "las-point-cloud");
    assert.notEqual(cloud.adapterId, "las-well");
    assert.equal(isLasfSignature(fs.readFileSync(path.join(root, "lidar/cloud.las"))), true);

    assert.equal(byPath(catalog.records, "wrap-yes/well.las").supportStatus, "recognised-unsupported");
    assert.equal(byPath(catalog.records, "las3/well.las").supportStatus, "recognised-unsupported");
    assert.equal(byPath(catalog.records, "missing-units/well.las").supportStatus, "recognised-unsupported");
    assert.equal(byPath(catalog.records, "malformed-header/well.las").supportStatus, "recognised-unsupported");
    assert.equal(byPath(catalog.records, "duplicate-depth/well.las").supportStatus, "recognised-unsupported");

    const unknown = byPath(catalog.records, "unknown-curves/well.las");
    assert.equal(unknown.supportStatus, "supported");
    assert.equal(unknown.curves?.includes("FOO"), true);

    const ncrs = byPath(catalog.records, "missing-crs/well.las");
    assert.equal(ncrs.supportStatus, "supported");
    assert.equal(ncrs.collarMappable, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("FOO.XXX is a valid unknown-semantics curve in the contract", () => {
  const text = fs.readFileSync(path.join(fixtureSrc, "unknown-curves/well.las"), "utf8");
  const inspected = inspectLasText(text, "well.las");
  assert.equal(lasReadyForSupport(inspected), true);
  const foo = inspected.curves.find((c) => c.mnemonic === "FOO");
  assert.ok(foo);
  assert.equal(foo?.semantics, "unknown");
  assert.equal(foo?.unit, "XXX");
});

test("planner binds las-well and refuses LiDAR / wrap-yes folders", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "valid", catalog);
    assert.equal(inputs.some((item) => item.adapterId === "las-well"), true);
    const ok = validatePlan(lasPlan(root, { inputs }), catalog);
    assert.equal(ok.ok, true);
    assert.equal(boreholeStepsEnabled(lasPlan(root).steps), true);

    const lidarInputs = collectPlanInputs(null, "lidar", catalog);
    const lidarCheck = validatePlan(lasPlan(root, { targetFolder: "lidar", inputs: lidarInputs }), catalog);
    assert.equal(lidarCheck.ok, false);
    assert.equal(lidarCheck.blockers.some((issue) => issue.code === "no_las_files"), true);

    const wrapInputs = collectPlanInputs(null, "wrap-yes", catalog);
    const wrapCheck = validatePlan(lasPlan(root, { targetFolder: "wrap-yes", inputs: wrapInputs }), catalog);
    assert.equal(wrapCheck.ok, false);
    assert.equal(wrapCheck.blockers.some((issue) => issue.code === "no_las_files"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("map_collar without CRS is blocked; viewing is not", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "missing-crs", catalog);
    const view = validatePlan(
      lasPlan(root, {
        targetFolder: "missing-crs",
        inputs,
        capabilities: ["borehole.ingest_las", "borehole.view_logs", "borehole.interpret"],
      }),
      catalog
    );
    assert.equal(view.ok, true);
    const mapped = validatePlan(
      lasPlan(root, {
        targetFolder: "missing-crs",
        inputs,
        capabilities: ["borehole.ingest_las", "borehole.view_logs", "borehole.map_collar", "borehole.interpret"],
      }),
      catalog
    );
    assert.equal(mapped.ok, false);
    assert.equal(mapped.blockers.some((issue) => issue.code === "borehole_crs_required"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("python kernels ingest → view → interpret; collar maps only with CRS", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const rec = byPath(catalog.records, "valid/well.las");
    const collarRec = byPath(catalog.records, "valid-collar/well.las");
    const outDir = path.join(root, "G-AID Output", "runs");
    const taskFolder = "r-e2e-las";
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
            adapterId: "las-well",
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
          "dispatch('las_ingest', payload)",
          "dispatch('borehole_view', payload)",
          "dispatch('borehole_map_collar', payload)",
          "dispatch('borehole_interpret', payload)",
          "print('ok')",
        ].join("\n"),
        JSON.stringify(payload),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(py.status, 0, py.stderr || py.stdout);
    const tracks = parseBoreholeTracks(
      fs.readFileSync(path.join(outDir, taskFolder, "borehole_tracks.json"), "utf8"),
      "borehole_tracks.json"
    );
    assert.ok(tracks);
    assert.equal(tracks?.depthReference, "measured depth");
    assert.equal(tracks?.trajectoryComputed, false);
    const report = JSON.parse(fs.readFileSync(path.join(outDir, taskFolder, "borehole_interpretation.json"), "utf8"));
    for (const needle of ["lithology", "aquifer", "mineralisation", "trajectory"]) {
      assert.ok(report.not_established.some((line: string) => line.toLowerCase().includes(needle)), needle);
    }
    assert.equal(fs.existsSync(path.join(outDir, taskFolder, "borehole_collar.geojson")), false);

    const collarFolder = "r-e2e-collar";
    fs.mkdirSync(path.join(outDir, collarFolder), { recursive: true });
    const collarPayload = {
      parameters: {
        baseDir: root,
        outDir,
        taskFolder: collarFolder,
        catalogInputs: [
          {
            catalogId: collarRec.id,
            path: collarRec.relativePath,
            adapterId: "las-well",
            absPath: path.join(root, collarRec.relativePath),
            checksum: collarRec.checksum.value,
          },
        ],
      },
    };
    const py2 = spawnSync(
      "python3",
      [
        "-c",
        [
          "import json, os, sys",
          "sys.path.insert(0, os.path.join(os.getcwd(), 'python'))",
          "from kernels import dispatch",
          "payload = json.loads(sys.argv[1])",
          "dispatch('las_ingest', payload)",
          "dispatch('borehole_map_collar', payload)",
          "print('ok')",
        ].join("\n"),
        JSON.stringify(collarPayload),
      ],
      { encoding: "utf8", cwd: process.cwd() }
    );
    assert.equal(py2.status, 0, py2.stderr || py2.stdout);
    assert.equal(fs.existsSync(path.join(outDir, collarFolder, "borehole_collar.geojson")), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("overlapping layers require matching CRS and a containing bbox", () => {
  const hits = layersOverlappingCollar(
    [
      {
        path: "grids/tmi.asc",
        label: "TMI",
        formatId: "esri-ascii-grid",
        bbox: { minX: 18, minY: -34, maxX: 19, maxY: -33 },
        crs: "EPSG:4326",
      },
      {
        path: "grids/other.asc",
        label: "other",
        formatId: "esri-ascii-grid",
        bbox: { minX: 18, minY: -34, maxX: 19, maxY: -33 },
        crs: "EPSG:32734",
      },
    ],
    { x: 18.4241, y: -33.9249, crs: "EPSG:4326" }
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, "grids/tmi.asc");
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
