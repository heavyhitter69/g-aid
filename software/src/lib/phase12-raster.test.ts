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
  gisRasterStepsEnabled,
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
import { buildMapLayers, decodeRasterLayer, overlayDecision, crsFromCatalog, parseGaidGeoTiff, encodeGaidGeoTiff } from "./map/index.ts";
import { isDemAscii } from "./map/display.ts";
import { detectAnalysisIntent } from "./workspace-index.ts";
import type { CatalogRecord } from "./catalog/types.ts";

const fixtureSrc = path.join(process.cwd(), "tests/fixtures/raster-project");

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-phase12-raster-"));
  fs.cpSync(fixtureSrc, root, { recursive: true });
  const multiband = encodeGaidGeoTiff({
    ncols: 2,
    nrows: 2,
    xmin: 500000,
    ymax: 6000020,
    dx: 10,
    values: [1, 2, 3, 4],
    epsg: 32630,
    samples: 3,
  });
  fs.mkdirSync(path.join(root, "multiband-pixels"), { recursive: true });
  fs.writeFileSync(path.join(root, "multiband-pixels", "grid.tif"), multiband);
  return root;
}

function byPath(records: CatalogRecord[], rel: string): CatalogRecord {
  const record = records.find((item) => item.relativePath.replace(/\\/g, "/") === rel);
  assert.ok(record, `missing catalog record ${rel}`);
  return record;
}

function rasterPlan(root: string, overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    plan: "# Implementation Plan\n",
    taskFolder: "",
    outputDir: "",
    productsRel: "",
    workspaceRoot: root,
    targetFolder: "valid-geotiff",
    projectName: "RASTER",
    intent: "raster",
    steps: { ...EMPTY_STEPS, gisRaster: true },
    parameters: { baseReference: "mean_base" },
    workspaceBrief: "",
    rev: 1,
    notes: [],
    status: "draft",
    capabilities: ["gis.raster_inspect", "gis.raster_view"],
    ...overrides,
  };
}

test("gis.raster_* and gis.terrain_view are registered; RasterPipeline is not an execution route", () => {
  for (const id of ["gis.raster_inspect", "gis.raster_view", "gis.terrain_view"]) {
    assert.equal(isRegisteredCapability(id), true);
  }
  const pipelineSrc = fs.readFileSync(path.join(process.cwd(), "src/pipeline/MagneticPreprocessingPipeline.ts"), "utf8");
  assert.match(pipelineSrc, /raster_inspect: SCIENCE/);
  assert.match(pipelineSrc, /Do not add a RasterPipeline/);
  assert.equal(isRegisteredCapability("raster_inspect"), false);
});

test("process the geotiff grants raster view, not shapefile ingest or mag GIS export", () => {
  const granted = proposeCapabilitiesFromMessage("process the geotiff");
  assert.equal(granted.includes("gis.raster_inspect"), true);
  assert.equal(granted.includes("gis.raster_view"), true);
  assert.equal(granted.includes("gis.vector_ingest"), false);
  assert.equal(granted.includes("mag.gis"), false);
  const terrain = proposeCapabilitiesFromMessage("view the dem terrain layer");
  assert.equal(terrain.includes("gis.terrain_view"), true);
  const ascii = proposeCapabilitiesFromMessage("inspect the esri ascii grid");
  assert.equal(ascii.includes("gis.raster_inspect"), true);
});

test("process the geotiff is raster intent; geojson stays gis", () => {
  assert.equal(detectAnalysisIntent("process the geotiff"), "raster");
  assert.equal(detectAnalysisIntent("process the geojson"), "gis");
  assert.equal(detectAnalysisIntent("process the MagArrow survey"), "magnetic");
});

test("unregistered hillshade, slope, NDVI, raster algebra, and reprojection are refused", () => {
  assert.equal(unregisteredProposal("compute hillshade of the geotiff"), "gis.raster_process");
  assert.equal(unregisteredProposal("NDVI spectral index on the raster"), "gis.raster_process");
  assert.equal(unregisteredProposal("reproject the geotiff to 4326"), "gis.reproject_raster");
  const patched = applyChatPatches(rasterPlan("/tmp"), "compute hillshade of the geotiff");
  assert.equal(patched.reviewDecisions?.some((d) => d.capabilityId === "gis.raster_process" && d.status === "refused"), true);
});

test("raster DAG compiles without vector_ingest or file_discovery", () => {
  const dag = compileCapabilityDag(["gis.raster_inspect", "gis.raster_view", "gis.terrain_view"]);
  assert.deepEqual(
    dag.nodes.map((node) => node.id),
    ["raster_inspect", "raster_view", "terrain_view"]
  );
  assert.equal(dag.nodes.some((node) => node.id === "vector_ingest"), false);
  assert.equal(dag.nodes.some((node) => node.id === "file_discovery"), false);
});

test("catalog classifies GeoTIFF/ASCII/DEM with honest support statuses", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const gtiff = byPath(catalog.records, "valid-geotiff/grid.tif");
    assert.equal(gtiff.formatId, "geotiff");
    assert.equal(gtiff.adapterId, "geotiff");
    assert.equal(gtiff.supportStatus, "supported");
    assert.equal(gtiff.mediaClass, "raster");
    assert.ok(gtiff.ncols && gtiff.nrows);
    assert.ok(gtiff.geotransform);
    assert.ok(gtiff.bbox);
    assert.equal(gtiff.crs, "EPSG:32630");
    assert.equal(gtiff.pixelsDecodable, true);
    assert.ok(gtiff.checksum.value);

    const ascii = byPath(catalog.records, "ascii-valid/grid.asc");
    assert.equal(ascii.formatId, "esri-ascii-grid");
    assert.equal(ascii.supportStatus, "supported");
    assert.equal(ascii.crs, "EPSG:32630");
    assert.equal(ascii.ncols, 3);
    assert.equal(ascii.nrows, 2);
    assert.equal(ascii.nodata, -9999);
    assert.equal(isDemAscii(ascii), false);

    const hugeAscii = byPath(catalog.records, "huge-ascii/grid.asc");
    assert.equal(hugeAscii.formatId, "esri-ascii-grid");
    assert.equal(hugeAscii.previewRequired, true);
    assert.equal(hugeAscii.pixelsDecodable, false);

    const nodataAsc = byPath(catalog.records, "nodata/grid.asc");
    assert.equal(nodataAsc.nodata, -9999);

    const incomplete = byPath(catalog.records, "ascii-incomplete/grid.asc");
    assert.equal(incomplete.formatId, "esri-ascii-grid");
    assert.equal(incomplete.supportStatus, "recognised-unsupported");

    const dem = byPath(catalog.records, "dem-valid/dem.asc");
    assert.equal(dem.formatId, "dem-ascii");
    assert.equal(dem.supportStatus, "supported");
    assert.equal(dem.elevationDatum, "orthometric");
    assert.equal(dem.units, "m");
    assert.equal(dem.nodata, -9999);

    const named = byPath(catalog.records, "dem-filename-only/dem.asc");
    assert.equal(named.formatId, "esri-ascii-grid");
    assert.equal(named.adapterId, "esri-ascii-grid");
    assert.equal(named.supportStatus, "supported");
    assert.equal(isDemAscii(named), false);
    assert.notEqual(named.elevationDatum, "orthometric");

    const missing = byPath(catalog.records, "missing-crs/grid.tif");
    assert.equal(missing.formatId, "geotiff");
    assert.equal(missing.supportStatus, "supported");
    assert.equal(missing.crs, undefined);
    assert.equal(missing.crsConfidence, "none");

    const compressed = byPath(catalog.records, "compressed/grid.tif");
    assert.equal(compressed.formatId, "geotiff");
    assert.equal(compressed.supportStatus, "supported");
    assert.equal(compressed.compression, "lzw");
    assert.equal(compressed.pixelsDecodable, false);

    const cog = byPath(catalog.records, "cog-tiled/grid.tif");
    assert.equal(cog.rasterLayout, "cog");
    assert.equal(cog.pixelsDecodable, false);
    assert.ok((cog.overviewCount || 0) >= 1);

    const huge = byPath(catalog.records, "huge/grid.tif");
    assert.equal(huge.previewRequired, true);
    assert.equal(huge.pixelsDecodable, false);
    assert.equal(huge.ncols, 8192);

    const big = byPath(catalog.records, "bigtiff/grid.tif");
    assert.equal(big.formatId, "geotiff");
    assert.equal(big.supportStatus, "recognised-unsupported");

    const unknown = byPath(catalog.records, "unknown/mystery.bin");
    assert.equal(unknown.supportStatus, "unknown");

    const multiband = byPath(catalog.records, "multiband/grid.tif");
    assert.ok((multiband.bandCount || 0) >= 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("map layers keep filename DEM inference off and block undocumented CRS overlays", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const layers = buildMapLayers({ catalog, files: [] });
    const named = layers.find((layer) => layer.path.replace(/\\/g, "/").endsWith("dem-filename-only/dem.asc"));
    assert.ok(named);
    assert.equal(named.formatId, "esri-ascii-grid");
    assert.notEqual(named.formatId, "dem-ascii");
    assert.notEqual(named.units, "m");

    const dem = layers.find((layer) => layer.path.replace(/\\/g, "/").endsWith("dem-valid/dem.asc"));
    assert.ok(dem);
    assert.equal(dem.formatId, "dem-ascii");
    assert.equal(dem.units, "m");

    const gtiff = byPath(catalog.records, "valid-geotiff/grid.tif");
    const buf = fs.readFileSync(path.join(root, gtiff.relativePath));
    const decoded = decodeRasterLayer({ formatId: "geotiff", buffer: buf });
    assert.ok(decoded);
    assert.equal(decoded.ncols, 2);
    const parsed = parseGaidGeoTiff(buf);
    assert.ok(parsed);
    assert.equal(parsed.crs?.epsg, 32630);

    const compressedBuf = fs.readFileSync(path.join(root, "compressed/grid.tif"));
    assert.equal(decodeRasterLayer({ formatId: "geotiff", buffer: compressedBuf }), null);

    const missing = layers.find((layer) => layer.path.replace(/\\/g, "/").endsWith("missing-crs/grid.tif"));
    const valid = layers.find((layer) => layer.path.replace(/\\/g, "/").endsWith("valid-geotiff/grid.tif"));
    assert.ok(missing && valid);
    const blocked = overlayDecision(missing.crs, valid.crs || crsFromCatalog("EPSG:32630", { source: "geotiff" }));
    assert.equal(blocked.allowed, false);

    const ascii4326 = crsFromCatalog("EPSG:4326", { source: "catalog" });
    const utm = crsFromCatalog("EPSG:32630", { source: "geotiff" });
    const conflict = overlayDecision(ascii4326, utm);
    assert.equal(conflict.allowed, false);
    assert.match(conflict.message, /not silently reproject/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("raster plans bind supported rasters and do not enable vector ingest", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "valid-geotiff", catalog);
    assert.ok(inputs.some((item) => item.adapterId === "geotiff"));
    const ok = validatePlan(rasterPlan(root, { inputs }), catalog);
    assert.equal(ok.ok, true);
    assert.equal(gisRasterStepsEnabled(ok.steps || rasterPlan(root).steps), true);
    assert.equal(gisVectorStepsEnabled(rasterPlan(root).steps), false);

    const named = collectPlanInputs(null, "dem-filename-only", catalog);
    const terrain = validatePlan(
      rasterPlan(root, {
        targetFolder: "dem-filename-only",
        inputs: named,
        capabilities: ["gis.raster_inspect", "gis.terrain_view"],
      }),
      catalog
    );
    assert.equal(terrain.ok, false);
    assert.ok(terrain.blockers.some((item) => item.code === "no_dem"));

    const empty = validatePlan(rasterPlan(root, { targetFolder: "unknown", inputs: [] }), catalog);
    assert.equal(empty.ok, false);
    assert.ok(empty.blockers.some((item) => item.code === "no_raster_files"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("python kernels inspect metadata without loading pixel cubes", () => {
  const py = spawnSync(
    "python3",
    [
      "-c",
      [
        "import json, os, tempfile, shutil, sys",
        "sys.path.insert(0, 'python')",
        "from kernels.raster import raster_inspect, raster_view, terrain_view",
        "from pathlib import Path",
        "root = Path('tests/fixtures/raster-project').resolve()",
        "out = tempfile.mkdtemp(prefix='g-aid-raster-kern-')",
        "gaid = os.path.join(out, 'G-AID Output', 'runs')",
        "os.makedirs(gaid, exist_ok=True)",
        "payload = {'parameters': {'baseDir': str(root), 'outDir': gaid, 'taskFolder': 'run', 'catalogInputs': [{'catalogId': 'a', 'path': 'valid-geotiff/grid.tif', 'adapterId': 'geotiff', 'formatId': 'geotiff', 'absPath': str(root/'valid-geotiff'/'grid.tif')}, {'catalogId': 'b', 'path': 'dem-valid/dem.asc', 'adapterId': 'dem-ascii', 'formatId': 'dem-ascii', 'absPath': str(root/'dem-valid'/'dem.asc')}]}}",
        "raster_inspect(payload)",
        "raster_view(payload)",
        "terrain_view(payload)",
        "qc = json.loads(Path(gaid,'run','raster_inspect_qc.json').read_text())",
        "assert qc['pixels_loaded'] is False",
        "assert qc['hillshade'] is False",
        "assert qc['filename_dem_inference'] is False",
        "tracks = json.loads(Path(gaid,'run','raster_tracks.json').read_text())",
        "assert tracks['silent_reprojection'] is False",
        "terrain = json.loads(Path(gaid,'run','terrain_tracks.json').read_text())",
        "assert terrain['hillshade'] is False",
        "assert any(l.get('source_format')=='dem-ascii' for l in terrain['layers'])",
        "print('kernel-ok')",
      ].join("; "),
    ],
    { cwd: process.cwd(), encoding: "utf8" }
  );
  if (py.status !== 0) {
    throw new Error(py.stderr || py.stdout || `python exit ${py.status}`);
  }
  assert.match(py.stdout, /kernel-ok/);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
