import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildProjectCatalog } from "./catalog/build.ts";
import { inspectGeojsonText, geojsonReadyForSupport, roleFromFilenameNever } from "./catalog/geojson-contract.ts";
import { applyReviewedVectorRole } from "./catalog/vector-role.ts";
import { collectPlanInputs } from "./plan-intent.ts";
import {
  applyChatPatches,
  EMPTY_STEPS,
  gisVectorStepsEnabled,
  validatePlan,
  type AgentPlan,
} from "./plan-spec.ts";
import {
  compileCapabilityDag,
  isRegisteredCapability,
  proposeCapabilitiesFromMessage,
  unregisteredProposal,
} from "./capabilities/index.ts";
import { layersOverlappingVectors } from "./gis-product.ts";
import { parseGeojson, polygonsFromVector } from "./map/geojson.ts";
import { overlayDecision, crsFromEpsg } from "./map/crs.ts";
import { detectAnalysisIntent } from "./workspace-index.ts";
import type { CatalogRecord } from "./catalog/types.ts";

const fixtureSrc = path.join(process.cwd(), "tests/fixtures/gis-project");

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-phase9-gis-"));
  fs.cpSync(fixtureSrc, root, { recursive: true });
  return root;
}

function byPath(records: CatalogRecord[], rel: string): CatalogRecord {
  const record = records.find((item) => item.relativePath.replace(/\\/g, "/") === rel);
  assert.ok(record, `missing catalog record ${rel}`);
  return record;
}

function gisPlan(root: string, overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    plan: "# Implementation Plan\n",
    taskFolder: "",
    outputDir: "",
    productsRel: "",
    workspaceRoot: root,
    targetFolder: "overlap",
    projectName: "GIS",
    intent: "gis",
    steps: { ...EMPTY_STEPS, gisVector: true },
    parameters: { baseReference: "mean_base" },
    workspaceBrief: "",
    rev: 1,
    notes: [],
    status: "draft",
    capabilities: ["gis.vector_ingest", "gis.vector_view", "gis.interpret"],
    ...overrides,
  };
}

test("gis.* capabilities are registered; GisPipeline is not an execution route", () => {
  for (const id of ["gis.vector_ingest", "gis.vector_view", "gis.spatial_overlap", "gis.export_vector", "gis.interpret"]) {
    assert.equal(isRegisteredCapability(id), true);
  }
  const pipelineSrc = fs.readFileSync(path.join(process.cwd(), "src/pipeline/MagneticPreprocessingPipeline.ts"), "utf8");
  assert.match(pipelineSrc, /GIS vectors use this same engine/);
  assert.match(pipelineSrc, /class GisPipeline/);
  assert.doesNotMatch(pipelineSrc, /new GisPipeline/);
  assert.match(pipelineSrc, /vector_ingest: SCIENCE/);
  assert.equal(isRegisteredCapability("vector_ingest"), false);
});

test("default GIS chat grants ingest/view/interpret, not magnetics or shapefile parse", () => {
  const granted = proposeCapabilitiesFromMessage("process the geojson");
  assert.equal(granted.includes("gis.vector_ingest"), true);
  assert.equal(granted.includes("gis.vector_view"), true);
  assert.equal(granted.includes("gis.interpret"), true);
  assert.equal(granted.includes("gis.spatial_overlap"), false);
  assert.equal(granted.includes("mag.diurnal"), false);
  assert.equal(granted.includes("mag.gis"), false);
  assert.equal(granted.includes("borehole.ingest_las"), false);
  const overlap = proposeCapabilitiesFromMessage("compute spatial overlap of the geojson layers");
  assert.equal(overlap.includes("gis.spatial_overlap"), true);
  const exported = proposeCapabilitiesFromMessage("export the geojson vectors");
  assert.equal(exported.includes("gis.export_vector"), true);
});

test("process the geojson is GIS intent; mag and borehole stay distinct", () => {
  assert.equal(detectAnalysisIntent("process the geojson"), "gis");
  assert.equal(detectAnalysisIntent("process the geology layer geojson"), "gis");
  assert.equal(detectAnalysisIntent("process the las"), "borehole");
  assert.equal(detectAnalysisIntent("kirchhoff migrate the gpr"), "gpr");
  assert.equal(detectAnalysisIntent("process the MagArrow survey"), "magnetic");
});

test("unregistered prospectivity and geoprocessing proposals are refused", () => {
  assert.equal(unregisteredProposal("generate mineral targets from the overlay geojson"), "gis.prospectivity");
  assert.equal(unregisteredProposal("buffer the vector polygons"), "gis.geoprocess");
  assert.equal(unregisteredProposal("reproject the geojson layer"), "gis.geoprocess");
  const patched = applyChatPatches(gisPlan("/tmp"), "generate mineral targets from the overlay geojson");
  assert.equal(patched.reviewDecisions?.some((d) => d.capabilityId === "gis.prospectivity" && d.status === "refused"), true);
});

test("GIS DAG compiles without file_discovery or a GisPipeline", () => {
  const dag = compileCapabilityDag(["gis.vector_ingest", "gis.vector_view", "gis.interpret"]);
  assert.deepEqual(
    dag.nodes.map((node) => node.id),
    ["vector_ingest", "vector_view", "vector_interpret"]
  );
  assert.equal(dag.nodes.some((node) => node.id === "file_discovery"), false);
  const withOverlap = compileCapabilityDag([
    "gis.vector_ingest",
    "gis.vector_view",
    "gis.spatial_overlap",
    "gis.export_vector",
    "gis.interpret",
  ]);
  assert.deepEqual(
    withOverlap.nodes.map((node) => node.id),
    ["vector_ingest", "vector_view", "vector_overlap", "vector_export", "vector_interpret"]
  );
});

test("catalog classifies documented GeoJSON as supported and does not infer geology from filename", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const geology = byPath(catalog.records, "valid-polygons/geology.geojson");
  assert.equal(geology.adapterId, "geojson");
  assert.equal(geology.supportStatus, "supported");
  assert.equal(geology.crs, "EPSG:32734");
  assert.equal(geology.vectorRole?.role, "generic-vector");
  assert.equal(geology.vectorRole?.reviewed, false);
  assert.equal(roleFromFilenameNever("geology.geojson"), "generic-vector");
  const reviewed = applyReviewedVectorRole(geology, "geology");
  assert.equal(reviewed.vectorRole?.reviewed, true);
  assert.equal(reviewed.vectorRole?.role, "geology");
  assert.equal(reviewed.vectorRole?.source, "user-assigned");
  const pts = byPath(catalog.records, "valid-points/samples.geojson");
  assert.ok(pts.geometryTypes?.includes("Point"));
  assert.ok(pts.attributeNames?.includes("SAMPLE_ID"));
});

test("GeoJSON without CRS, malformed rings, shapefile sidecars, and GeoPackage stay recognised-unsupported", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const noCrs = byPath(catalog.records, "no-crs/clip.geojson");
  assert.equal(noCrs.formatId, "geojson");
  assert.equal(noCrs.supportStatus, "recognised-unsupported");
  assert.equal(noCrs.locationQuality, "missing");
  const malformed = byPath(catalog.records, "malformed/open-ring.geojson");
  assert.equal(malformed.supportStatus, "recognised-unsupported");
  const incomplete = byPath(catalog.records, "shapefile-incomplete/clip.shp");
  assert.equal(incomplete.formatId, "shapefile");
  assert.equal(incomplete.supportStatus, "recognised-unsupported");
  assert.equal(incomplete.shapefileSidecars?.shx, false);
  assert.equal(incomplete.shapefileSidecars?.dbf, false);
  assert.equal(incomplete.shapefileSidecars?.prj, false);
  assert.ok(incomplete.parseErrors?.some((line) => /sidecar/i.test(line)));
  const sidecars = byPath(catalog.records, "shapefile-sidecars/clip.shp");
  assert.equal(sidecars.shapefileSidecars?.shx, true);
  assert.equal(sidecars.shapefileSidecars?.dbf, true);
  assert.equal(sidecars.shapefileSidecars?.prj, true);
  assert.ok(sidecars.parseErrors?.some((line) => /EPSG/i.test(line) || /not parse/i.test(line)));
  const gpkg = byPath(catalog.records, "gpkg/dummy.gpkg");
  assert.equal(gpkg.formatId, "geopackage");
  assert.equal(gpkg.supportStatus, "recognised-unsupported");
});

test("plan binds only supported GeoJSON; shapefile and no-CRS GeoJSON are not processing inputs", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const overlapInputs = collectPlanInputs(null, "overlap", catalog);
  assert.equal(overlapInputs.every((item) => item.adapterId === "geojson"), true);
  assert.equal(overlapInputs.length, 2);
  const noCrsInputs = collectPlanInputs(null, "no-crs", catalog);
  assert.equal(noCrsInputs.length, 0);
  const shpInputs = collectPlanInputs(null, "shapefile-incomplete", catalog);
  assert.equal(shpInputs.length, 0);
});

test("validatePlan blocks GIS without GeoJSON and overlap without two same-CRS layers", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const empty = validatePlan(gisPlan(root, { targetFolder: "no-crs", inputs: collectPlanInputs(null, "no-crs", catalog) }), catalog);
  assert.equal(empty.ok, false);
  assert.ok(empty.blockers.some((item) => item.code === "no_geojson_files"));
  const one = validatePlan(
    gisPlan(root, {
      targetFolder: "valid-points",
      inputs: collectPlanInputs(null, "valid-points", catalog),
      capabilities: ["gis.vector_ingest", "gis.vector_view", "gis.spatial_overlap", "gis.interpret"],
    }),
    catalog
  );
  assert.equal(one.ok, false);
  assert.ok(one.blockers.some((item) => item.code === "gis_overlap_needs_two_layers"));
  const conflict = validatePlan(
    gisPlan(root, {
      targetFolder: "conflict-crs",
      inputs: collectPlanInputs(null, "conflict-crs", catalog),
      capabilities: ["gis.vector_ingest", "gis.spatial_overlap", "gis.interpret"],
    }),
    catalog
  );
  assert.equal(conflict.ok, false);
  assert.ok(conflict.blockers.some((item) => item.code === "gis_crs_conflict"));
  const ok = validatePlan(
    gisPlan(root, {
      inputs: collectPlanInputs(null, "overlap", catalog),
      capabilities: ["gis.vector_ingest", "gis.vector_view", "gis.spatial_overlap", "gis.interpret"],
    }),
    catalog
  );
  assert.equal(ok.ok, true);
  assert.equal(gisVectorStepsEnabled(gisPlan(root).steps), true);
});

test("map parser preserves MultiPolygon, attributes, and blocks unknown/conflicting CRS", () => {
  const text = fs.readFileSync(path.join(fixtureSrc, "valid-polygons", "geology.geojson"), "utf8");
  const parsed = parseGeojson(text);
  assert.ok(parsed);
  assert.equal(parsed.crs.key, "EPSG:32734");
  assert.equal(parsed.data.features[0].type, "Polygon");
  assert.equal(parsed.data.features[0].properties?.UNIT, "Qal");
  assert.ok(polygonsFromVector(parsed.data).length);
  const unknown = overlayDecision(undefined, crsFromEpsg(32734, "geojson"));
  assert.equal(unknown.allowed, false);
  const conflict = overlayDecision(crsFromEpsg(32734, "geojson"), crsFromEpsg(4326, "geojson"));
  assert.equal(conflict.allowed, false);
  const hits = layersOverlappingVectors([
    {
      path: "tenure.geojson",
      label: "tenure",
      formatId: "geojson",
      bbox: { minX: 260050, minY: 6240050, maxX: 260250, maxY: 6240250 },
      crs: "EPSG:32734",
    },
    {
      path: "samples.geojson",
      label: "samples",
      formatId: "geojson",
      bbox: { minX: 260100, minY: 6240100, maxX: 260180, maxY: 6240180 },
      crs: "EPSG:32734",
    },
    {
      path: "other.geojson",
      label: "other CRS",
      formatId: "geojson",
      bbox: { minX: 260100, minY: 6240100, maxX: 260180, maxY: 6240180 },
      crs: "EPSG:4326",
    },
  ]);
  assert.equal(hits.length, 1);
  assert.match(hits[0].reason, /coincidence/i);
});

test("contract inspect requires documented EPSG and does not assume RFC 7946", () => {
  const noCrs = inspectGeojsonText('{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[18, -33]},"properties":{}}]}');
  assert.equal(geojsonReadyForSupport(noCrs), false);
  assert.ok(noCrs.warnings.some((line) => /RFC 7946/i.test(line)));
  const ready = inspectGeojsonText(fs.readFileSync(path.join(fixtureSrc, "valid-points", "samples.geojson"), "utf8"));
  assert.equal(geojsonReadyForSupport(ready), true);
});

test("python kernels ingest, overlap, export, and refuse shapefile search", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const recs = catalog.records.filter((item) => item.relativePath.startsWith("overlap/") && item.supportStatus === "supported");
  const outRoot = path.join(root, "G-AID Output", "runs");
  fs.mkdirSync(path.join(outRoot, "r-gis"), { recursive: true });
  const payload = {
    parameters: {
      baseDir: root,
      outDir: outRoot,
      taskFolder: "r-gis",
      catalogInputs: recs.map((rec) => ({
        catalogId: rec.id,
        path: rec.relativePath,
        adapterId: rec.adapterId,
        formatId: rec.formatId,
        absPath: path.join(root, rec.relativePath),
        checksum: rec.checksum.value,
        vectorRole: rec.vectorRole,
      })),
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
        "dispatch('vector_ingest', payload)",
        "dispatch('vector_view', payload)",
        "dispatch('vector_overlap', payload)",
        "dispatch('vector_export', payload)",
        "dispatch('vector_interpret', payload)",
        "print('ok')",
      ].join("\n"),
      JSON.stringify(payload),
    ],
    { encoding: "utf8", cwd: process.cwd() }
  );
  assert.equal(py.status, 0, py.stderr || py.stdout);
  const run = path.join(outRoot, "r-gis");
  const overlap = JSON.parse(fs.readFileSync(path.join(run, "vector_overlap.json"), "utf8"));
  assert.ok(overlap.rows.length);
  const interp = JSON.parse(fs.readFileSync(path.join(run, "vector_interpretation.json"), "utf8"));
  assert.equal(interp.geological_certainty_improved, false);
  assert.ok(fs.existsSync(path.join(run, "vector_export_1.geojson")));
});

test("desktop verification fixtures cover catalog, points, lines, polygons, unknown CRS, conflict, overlap, and interpretation", () => {
  const runs = path.join(process.cwd(), "tests/fixtures/validation-ui/G-AID Output/runs");
  const tracks = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-gis-points", "vector_tracks.json"), "utf8"));
  assert.equal(tracks.kind, "gis-vector");
  const lines = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-gis-lines", "vector_tracks.json"), "utf8"));
  assert.ok(lines.layers[0].geometry_types.includes("LineString"));
  const poly = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-gis-polygons", "vector_tracks.json"), "utf8"));
  assert.ok(poly.layers[0].geometry_types.includes("Polygon"));
  const unknownQc = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-gis-unknown", "vector_overlap_qc.json"), "utf8"));
  assert.equal(unknownQc.skipped, true);
  assert.equal(unknownQc.reason, "gis_crs_required");
  const unknownIngest = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-gis-unknown", "vector_ingest_qc.json"), "utf8"));
  assert.equal(unknownIngest.n_layers, 0);
  const conflict = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-gis-conflict", "vector_overlap.json"), "utf8"));
  assert.ok(conflict.blocked.length);
  const overlap = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-gis-overlap", "vector_overlap.json"), "utf8"));
  assert.ok(overlap.rows.length);
  assert.ok(overlap.rows[0].reason.includes("does not establish geological"));
  const interp = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-gis-interpret", "vector_interpretation.json"), "utf8"));
  assert.equal(interp.geological_certainty_improved, false);
  assert.ok((interp.not_established as string[]).some((line) => /Prospectivity/i.test(line)));
});

if (failed) process.exit(1);
console.log("phase9-gis tests passed");
