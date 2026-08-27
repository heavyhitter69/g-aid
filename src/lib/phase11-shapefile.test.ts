import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { buildProjectCatalog } from "./catalog/build.ts";
import { inspectShapefilePath } from "./catalog/adapters/shapefile.ts";
import { shapefileReadyForSupport } from "./catalog/shapefile-contract.ts";
import { applyReviewedVectorRole } from "./catalog/vector-role.ts";
import { collectPlanInputs } from "./plan-intent.ts";
import { EMPTY_STEPS, validatePlan, type AgentPlan } from "./plan-spec.ts";
import { compileCapabilityDag, isRegisteredCapability } from "./capabilities/index.ts";
import { decodeVectorLayer, isFalselyDecodable } from "./map/index.ts";
import { layersOverlappingVectors } from "./gis-product.ts";
import type { CatalogRecord } from "./catalog/types.ts";

const fixtureSrc = path.join(process.cwd(), "tests/fixtures/shapefile-project");

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-phase11-shp-"));
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
    projectName: "SHP",
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

test("GIS capabilities remain shared; no ShapefilePipeline", () => {
  for (const id of ["gis.vector_ingest", "gis.vector_view", "gis.spatial_overlap", "gis.export_vector", "gis.interpret"]) {
    assert.equal(isRegisteredCapability(id), true);
  }
  assert.equal(isRegisteredCapability("gis.shapefile_ingest"), false);
  const dag = compileCapabilityDag(["gis.vector_ingest", "gis.vector_view", "gis.spatial_overlap", "gis.export_vector", "gis.interpret"]);
  assert.deepEqual(
    dag.nodes.map((node) => node.id),
    ["vector_ingest", "vector_view", "vector_overlap", "vector_export", "vector_interpret"]
  );
});

test("catalog parses valid point, polyline, and polygon shapefiles and does not infer geology", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const pts = byPath(catalog.records, "points/samples.shp");
  assert.equal(pts.adapterId, "shapefile");
  assert.equal(pts.supportStatus, "supported");
  assert.equal(pts.crs, "EPSG:32734");
  assert.equal(pts.crsSource, "shapefile-prj");
  assert.equal(pts.crsConfidence, "high");
  assert.ok(pts.geometryTypes?.includes("Point"));
  assert.ok(pts.attributeNames?.includes("SAMPLE_ID"));
  assert.equal(pts.vectorRole?.role, "generic-vector");
  assert.equal(pts.vectorRole?.reviewed, false);
  const poly = byPath(catalog.records, "polygons/geology.shp");
  assert.equal(poly.supportStatus, "supported");
  assert.equal(poly.vectorRole?.role, "generic-vector");
  assert.ok(poly.attributeNames?.includes("UNIT"));
  const reviewed = applyReviewedVectorRole(poly, "geology");
  assert.equal(reviewed.vectorRole?.role, "geology");
  assert.equal(reviewed.vectorRole?.source, "user-assigned");
  const lines = byPath(catalog.records, "lines/faults.shp");
  assert.equal(lines.supportStatus, "supported");
  assert.ok(lines.geometryTypes?.includes("LineString"));
  const shx = catalog.records.find((item) => item.relativePath.replace(/\\/g, "/") === "points/samples.shx");
  assert.ok(shx);
  assert.notEqual(shx.adapterId, "shapefile");
  assert.notEqual(shx.formatId, "shapefile");
});

test("missing sidecars, unknown CRS, corrupt DBF, PointZ, and invalid geometry stay recognised-unsupported", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const missingDbf = byPath(catalog.records, "missing-dbf/samples.shp");
  assert.equal(missingDbf.supportStatus, "recognised-unsupported");
  assert.equal(missingDbf.shapefileSidecars?.dbf, false);
  const missingShx = byPath(catalog.records, "missing-shx/samples.shp");
  assert.equal(missingShx.shapefileSidecars?.shx, false);
  const missingPrj = byPath(catalog.records, "missing-prj/samples.shp");
  assert.ok(missingPrj.parseErrors?.some((line) => /\.prj/i.test(line)));
  const unknown = byPath(catalog.records, "unknown-crs/geology.shp");
  assert.equal(unknown.supportStatus, "recognised-unsupported");
  assert.ok(unknown.parseErrors?.some((line) => /EPSG/i.test(line)));
  const corrupt = byPath(catalog.records, "corrupt-dbf/samples.shp");
  assert.equal(corrupt.supportStatus, "recognised-unsupported");
  const pointz = byPath(catalog.records, "pointz/elevated.shp");
  assert.equal(pointz.supportStatus, "recognised-unsupported");
  const invalid = byPath(catalog.records, "invalid-geometry/open-ring.shp");
  assert.equal(invalid.supportStatus, "recognised-unsupported");
});

test("CP1252 .cpg decodes; invalid UTF-8 declaration is unsupported", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const encoded = byPath(catalog.records, "encoding-cp1252/labels.shp");
  assert.equal(encoded.supportStatus, "supported");
  assert.equal(encoded.encodingSource, "cpg");
  const inspected = inspectShapefilePath(path.join(root, "encoding-cp1252", "labels.shp"));
  assert.equal(shapefileReadyForSupport(inspected), true);
  assert.equal(inspected.features?.[0]?.properties?.NAME, "café");
  const bad = byPath(catalog.records, "encoding-utf8-invalid/labels.shp");
  assert.equal(bad.supportStatus, "recognised-unsupported");
});

test("plan binds supported shapefiles through gis.* capabilities; incomplete sidecars bind nothing", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const overlap = collectPlanInputs(null, "overlap", catalog);
  assert.equal(overlap.length, 2);
  assert.equal(overlap.every((item) => item.adapterId === "shapefile"), true);
  const missing = collectPlanInputs(null, "missing-dbf", catalog);
  assert.equal(missing.length, 0);
  const unknown = collectPlanInputs(null, "unknown-crs", catalog);
  assert.equal(unknown.length, 0);
  const ok = validatePlan(
    gisPlan(root, {
      inputs: overlap,
      capabilities: ["gis.vector_ingest", "gis.vector_view", "gis.spatial_overlap", "gis.interpret"],
    }),
    catalog
  );
  assert.equal(ok.ok, true);
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
});

test("catalog retains polygon holes and rejects self-intersecting / crossing rings", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const holed = byPath(catalog.records, "topology/hole-polygon.shp");
  assert.equal(holed.supportStatus, "supported");
  const inspected = inspectShapefilePath(path.join(root, "topology", "hole-polygon.shp"));
  assert.equal(inspected.features?.[0]?.topology?.hole_count, 1);
  assert.equal((inspected.features?.[0]?.parts?.[0] || []).length, 2);
  assert.equal(byPath(catalog.records, "topology/multipolygon.shp").supportStatus, "supported");
  assert.equal(byPath(catalog.records, "topology/self-intersect.shp").supportStatus, "recognised-unsupported");
  assert.equal(byPath(catalog.records, "topology/crossing-hole.shp").supportStatus, "recognised-unsupported");
});

test("map decode keeps hole rings for even-odd fill", () => {
  const root = tmpCopy();
  const decoded = decodeVectorLayer({
    formatId: "shapefile",
    shp: fs.readFileSync(path.join(root, "topology", "hole-polygon.shp")),
    shx: fs.readFileSync(path.join(root, "topology", "hole-polygon.shx")),
    dbf: fs.readFileSync(path.join(root, "topology", "hole-polygon.dbf")),
    prjText: fs.readFileSync(path.join(root, "topology", "hole-polygon.prj"), "utf8"),
  });
  assert.ok(decoded);
  assert.equal(decoded.data.features[0].type, "Polygon");
  assert.equal((decoded.data.features[0].rings || []).length, 2);
});

test("map decode uses parsed shapefile sidecars; incomplete shp is not viewable", () => {
  assert.equal(isFalselyDecodable("shapefile"), false);
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const pts = byPath(catalog.records, "points/samples.shp");
  const decoded = decodeVectorLayer({
    formatId: "shapefile",
    shp: fs.readFileSync(path.join(root, pts.relativePath)),
    shx: fs.readFileSync(path.join(root, "points", "samples.shx")),
    dbf: fs.readFileSync(path.join(root, "points", "samples.dbf")),
    prjText: fs.readFileSync(path.join(root, "points", "samples.prj"), "utf8"),
  });
  assert.ok(decoded);
  assert.equal(decoded.data.features.length, 2);
  assert.equal(decoded.data.features[0].type, "Point");
  assert.equal(decoded.crs.key, "EPSG:32734");
  assert.equal(decodeVectorLayer({ formatId: "shapefile", text: "{}" }), null);
  const missing = byPath(catalog.records, "missing-dbf/samples.shp");
  assert.notEqual(missing.supportStatus, "supported");
});

test("overlap provenance is geometric coincidence across shapefile layers", () => {
  const hits = layersOverlappingVectors([
    {
      path: "tenure.shp",
      label: "tenure",
      formatId: "shapefile",
      bbox: { minX: 260100, minY: 6240100, maxX: 260500, maxY: 6240400 },
      crs: "EPSG:32734",
      coordinateOrder: "east-north",
    },
    {
      path: "samples.shp",
      label: "samples",
      formatId: "shapefile",
      bbox: { minX: 260150, minY: 6240150, maxX: 260180, maxY: 6240180 },
      crs: "EPSG:32734",
      coordinateOrder: "east-north",
    },
  ]);
  assert.equal(hits.length, 1);
  assert.match(hits[0].reason, /coincidence/i);
});

test("python kernels ingest shapefile through gis.vector_* and export GeoJSON with provenance", () => {
  const root = tmpCopy();
  const catalog = buildProjectCatalog(root);
  const recs = catalog.records.filter((item) => item.relativePath.startsWith("overlap/") && item.supportStatus === "supported");
  const outRoot = path.join(root, "G-AID Output", "runs");
  fs.mkdirSync(path.join(outRoot, "r-shp"), { recursive: true });
  const payload = {
    parameters: {
      baseDir: root,
      outDir: outRoot,
      taskFolder: "r-shp",
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
  const run = path.join(outRoot, "r-shp");
  const overlap = JSON.parse(fs.readFileSync(path.join(run, "vector_overlap.json"), "utf8"));
  assert.ok(overlap.rows.length);
  assert.equal(overlap.engine, "g-aid-evenodd-segment");
  assert.equal(overlap.exterior_ring_only, false);
  const exported = JSON.parse(fs.readFileSync(path.join(run, "vector_export_1.geojson"), "utf8"));
  assert.equal(exported.features[0].properties._g_aid_source_format, "shapefile");
  const meta = JSON.parse(fs.readFileSync(path.join(run, "vector_export.meta.json"), "utf8"));
  assert.equal(meta.shapefile, false);
  const interp = JSON.parse(fs.readFileSync(path.join(run, "vector_interpretation.json"), "utf8"));
  assert.equal(interp.geological_certainty_improved, false);
});

test("desktop verification fixtures cover shapefile catalog, blocked datasets, CRS conflict, and overlap", () => {
  const runs = path.join(process.cwd(), "tests/fixtures/validation-ui/G-AID Output/runs");
  const required = [
    "r-verify-shp-points",
    "r-verify-shp-lines",
    "r-verify-shp-polygons",
    "r-verify-shp-blocked",
    "r-verify-shp-conflict",
    "r-verify-shp-overlap",
    "r-verify-shp-holes",
    "r-verify-shp-interpret",
  ];
  for (const run of required) {
    assert.equal(fs.existsSync(path.join(runs, run, "plan.json")), true, run);
  }
  const tracks = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-shp-polygons", "vector_tracks.json"), "utf8"));
  assert.ok(tracks.layers[0].geometry_types.includes("Polygon"));
  assert.equal(tracks.layers[0].crs_source, "shapefile-prj");
  const blocked = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-shp-blocked", "vector_ingest_qc.json"), "utf8"));
  assert.equal(blocked.n_layers, 0);
  const conflict = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-shp-conflict", "vector_overlap.json"), "utf8"));
  assert.ok(conflict.blocked.length);
  const overlap = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-shp-overlap", "vector_overlap.json"), "utf8"));
  assert.ok(overlap.rows.length);
  assert.ok(overlap.rows[0].reason.includes("does not establish geological"));
  const holes = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-shp-holes", "vector_overlap.json"), "utf8"));
  assert.equal(holes.engine, "g-aid-evenodd-segment");
  assert.equal(holes.exterior_ring_only, false);
  const byId = Object.fromEntries((holes.rows as Array<{ right_id: string; relation: string }>).map((row) => [row.right_id, row.relation]));
  assert.equal(byId.shell, "contains");
  assert.equal(byId.hole, "disjoint");
  assert.equal(byId.ebound, "on-boundary");
  assert.equal(byId.hbound, "on-boundary");
  const interp = JSON.parse(fs.readFileSync(path.join(runs, "r-verify-shp-interpret", "vector_interpretation.json"), "utf8"));
  assert.equal(interp.geological_certainty_improved, false);
  const uiPath = path.join(process.cwd(), "docs/validation/results/shapefile_desktop_ui.json");
  if (fs.existsSync(uiPath)) {
    const ui = JSON.parse(fs.readFileSync(uiPath, "utf8"));
    assert.equal(ui.passed, true);
    assert.equal(ui.parser, "pyshp-2.3.1");
    assert.equal(ui.geopackage_parsed, false);
    assert.equal(ui.silent_reprojection, false);
    assert.equal(ui.filename_inferred_geology, false);
  }
});

if (failed) process.exit(1);
console.log("phase11-shapefile tests passed");
