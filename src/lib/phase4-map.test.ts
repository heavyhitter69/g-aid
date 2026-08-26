import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildProjectCatalog } from "./catalog/build.ts";
import { isRegisteredCapability } from "./capabilities/index.ts";
import {
  PREVIEW_POLICY,
  artifactId,
  buildMapLayers,
  compareRunLayers,
  crsFromEpsg,
  crsFromPrj,
  decodeRasterLayer,
  decodeVectorLayer,
  encodeGaidGeoTiff,
  inspectRaster,
  isFalselyDecodable,
  isMapQuestion,
  listRunArtifactPaths,
  mapWorkspaceAnswer,
  overlayDecision,
  parseEsriAscii,
  parseGaidGeoTiff,
  parseGeojson,
  provenanceLabel,
  sampleProfile,
  selectLayerById,
  selectLayerByPath,
} from "./map/index.ts";

const fixtureSrc = path.join(process.cwd(), "tests/fixtures/catalog-project");

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

function asciiGrid(ncols: number, nrows: number, fill: number | number[] = 1, extra?: { xll?: number; yll?: number; cell?: number }): string {
  const values = Array.isArray(fill) ? fill : Array.from({ length: ncols * nrows }, () => fill);
  const rows: string[] = [];
  for (let r = 0; r < nrows; r++) {
    rows.push(values.slice(r * ncols, (r + 1) * ncols).join(" "));
  }
  return [
    `ncols ${ncols}`,
    `nrows ${nrows}`,
    `xllcorner ${extra?.xll ?? 500000}`,
    `yllcorner ${extra?.yll ?? 600000}`,
    `cellsize ${extra?.cell ?? 10}`,
    `NODATA_value -9999`,
    ...rows,
  ].join("\n");
}

function writePlan(dir: string, runId: string, extra?: { parentRunId?: string; planHash?: string }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "plan.json"),
    JSON.stringify({
      runId,
      parentRunId: extra?.parentRunId ?? null,
      status: "complete",
      approvedAt: "2026-08-26T12:00:00.000Z",
      productsRel: `G-AID Output/runs/${runId}`,
      intent: "magnetic",
      planHash: extra?.planHash || `${runId}-hash`,
    })
  );
}

function tmpProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-phase4-"));
  fs.cpSync(fixtureSrc, root, { recursive: true });
  const gis = path.join(root, "gis");
  fs.mkdirSync(gis, { recursive: true });
  const tiny = Buffer.alloc(16, 0);
  tiny[0] = 0x49;
  tiny[1] = 0x49;
  tiny[2] = 0x2a;
  tiny[3] = 0x00;
  fs.writeFileSync(path.join(gis, "tiny.tif"), tiny);
  const shp = Buffer.alloc(100, 0);
  shp.writeUInt32BE(9994, 0);
  fs.writeFileSync(path.join(gis, "clip.shp"), shp);
  const lasf = Buffer.concat([Buffer.from("LASF"), Buffer.alloc(64, 1)]);
  fs.writeFileSync(path.join(root, "logs", "cloud.las"), lasf);
  const segy = Buffer.alloc(3200, 0x40);
  segy[0] = 0xc3;
  segy[1] = 0x40;
  segy[2] = 0xf1;
  fs.mkdirSync(path.join(root, "seismic"), { recursive: true });
  fs.writeFileSync(path.join(root, "seismic", "line1.sgy"), segy);

  const runA = path.join(root, "G-AID Output", "runs", "run-a");
  const runB = path.join(root, "G-AID Output", "runs", "run-b");
  writePlan(runA, "run-a", { planHash: "plan-aaa" });
  writePlan(runB, "run-b", { parentRunId: "run-a", planHash: "plan-bbb" });
  fs.writeFileSync(path.join(runA, "tmi.asc"), asciiGrid(3, 2, [10, 20, 30, 40, 50, 60]));
  fs.writeFileSync(path.join(runB, "tmi.asc"), asciiGrid(3, 2, [11, 21, 31, 41, 51, 61]));
  const tiffA = encodeGaidGeoTiff({
    ncols: 2,
    nrows: 2,
    xmin: 500000,
    ymax: 600020,
    dx: 10,
    values: [1, 2, 3, 4],
    epsg: 32630,
  });
  const tiffB = encodeGaidGeoTiff({
    ncols: 2,
    nrows: 2,
    xmin: 500000,
    ymax: 600020,
    dx: 10,
    values: [5, 6, 7, 8],
    epsg: 32630,
  });
  fs.writeFileSync(path.join(runA, "rtp.tif"), tiffA);
  fs.writeFileSync(path.join(runB, "rtp.tif"), tiffB);
  fs.writeFileSync(
    path.join(runA, "flight_path.geojson"),
    JSON.stringify({
      type: "FeatureCollection",
      crs: { type: "name", properties: { name: "EPSG:32630" } },
      features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[500005, 600005], [500015, 600015]] } }],
    })
  );
  return root;
}

function byRel<T extends { relativePath: string }>(records: T[], rel: string): T {
  const record = records.find((item) => item.relativePath.replace(/\\/g, "/") === rel);
  assert.ok(record, `missing ${rel}`);
  return record;
}

test("completed magnetic ASCII and GeoTIFF outputs display through the map layer path", () => {
  const root = tmpProject();
  const catalog = buildProjectCatalog(root);
  const files = listRunArtifactPaths(root, catalog.runs);
  const layers = buildMapLayers({ catalog, files });

  const asciiId = artifactId("run-a", "G-AID Output/runs/run-a/tmi.asc");
  const asciiLayer = selectLayerById(layers, asciiId);
  assert.ok(asciiLayer, "ASCII run artifact should be selectable by artifact ID");
  assert.equal(asciiLayer.displayStatus, "viewable");
  assert.equal(asciiLayer.origin, "derived-run");
  assert.equal(asciiLayer.runId, "run-a");
  assert.match(provenanceLabel(asciiLayer), /run-a/);
  const asciiText = fs.readFileSync(path.join(root, asciiLayer.path), "utf8");
  const asciiGridDecoded = decodeRasterLayer({ formatId: asciiLayer.formatId, text: asciiText });
  assert.ok(asciiGridDecoded);
  assert.equal(asciiGridDecoded.ncols, 3);
  assert.equal(asciiGridDecoded.nrows, 2);
  assert.equal(asciiGridDecoded.values[0], 10);
  const parsed = parseEsriAscii(asciiText);
  assert.deepEqual([...parsed!.values], [...asciiGridDecoded.values]);

  const tiffId = artifactId("run-a", "G-AID Output/runs/run-a/rtp.tif");
  const tiffLayer = selectLayerById(layers, tiffId);
  assert.ok(tiffLayer, "GeoTIFF run artifact should be selectable by artifact ID");
  assert.equal(tiffLayer.displayStatus, "viewable");
  assert.equal(tiffLayer.formatId, "geotiff");
  const tiffBuf = fs.readFileSync(path.join(root, tiffLayer.path));
  const tiffDecoded = decodeRasterLayer({ formatId: tiffLayer.formatId, buffer: tiffBuf });
  assert.ok(tiffDecoded);
  assert.equal(tiffDecoded.ncols, 2);
  assert.equal(tiffDecoded.nrows, 2);
  assert.equal(tiffDecoded.values[0], 1);
  const roundTrip = parseGaidGeoTiff(tiffBuf);
  assert.ok(roundTrip);
  assert.equal(roundTrip.crs?.epsg, 32630);
  const fromAsciiCompanion = parseEsriAscii(roundTrip.ascii);
  assert.ok(fromAsciiCompanion);
  assert.equal(fromAsciiCompanion.values[0], 1);

  const byPath = selectLayerByPath(layers, "G-AID Output/runs/run-a/tmi.asc");
  assert.equal(byPath?.id, asciiId);
});

test("catalog GeoJSON and DEM records follow implemented display support", () => {
  const root = tmpProject();
  const catalog = buildProjectCatalog(root);
  const layers = buildMapLayers({ catalog, files: [] });

  const demRecord = byRel(catalog.records, "gis/dem.asc");
  const demLayer = selectLayerById(layers, demRecord.id);
  assert.ok(demLayer);
  assert.equal(demLayer.formatId, "dem-ascii");
  assert.equal(demLayer.displayStatus, "viewable");
  assert.equal(demLayer.origin, "source");
  assert.equal(demLayer.supportStatus, "recognised-unsupported");
  const demText = fs.readFileSync(path.join(root, "gis", "dem.asc"), "utf8");
  const demGrid = decodeRasterLayer({ formatId: demLayer.formatId, text: demText });
  assert.ok(demGrid);
  assert.equal(demGrid.ncols, 2);
  assert.equal(demGrid.values[0], 1);

  const geoRecord = byRel(catalog.records, "gis/clip.geojson");
  const geoLayer = selectLayerById(layers, geoRecord.id);
  assert.ok(geoLayer);
  assert.equal(geoLayer.formatId, "geojson");
  assert.equal(geoLayer.displayStatus, "viewable");
  assert.equal(geoLayer.origin, "source");
  const geoText = fs.readFileSync(path.join(root, "gis", "clip.geojson"), "utf8");
  const vector = decodeVectorLayer({ formatId: geoLayer.formatId, text: geoText });
  assert.ok(vector);
  assert.equal(vector.data.features[0].type, "Point");
  assert.equal(vector.crs.key, "unknown");
  assert.equal(vector.crs.assumed, true);
});

test("CRS warnings appear for unknown, assumed, and conflicting CRS", () => {
  const unknown = overlayDecision(undefined, crsFromEpsg(32630, "geotiff"));
  assert.equal(unknown.allowed, false);
  assert.equal(unknown.code, "unknown-crs");
  assert.match(unknown.message, /unknown/i);

  const assumed = overlayDecision(crsFromPrj('GEOGCS["WGS 84",DATUM["WGS_1984"]]'), crsFromEpsg(4326, "geojson"));
  assert.equal(assumed.allowed, false);
  assert.equal(assumed.code, "assumed-crs");

  const conflict = overlayDecision(crsFromEpsg(32630, "geotiff"), crsFromEpsg(4326, "geojson"));
  assert.equal(conflict.allowed, false);
  assert.equal(conflict.code, "conflicting-crs");
  assert.match(conflict.message, /not silently reproject/i);

  const same = overlayDecision(crsFromEpsg(32630, "prj"), crsFromEpsg(32630, "geotiff"));
  assert.equal(same.allowed, true);
  assert.equal(same.code, "same-crs");
});

test("run comparison references correct versioned artifacts", () => {
  const root = tmpProject();
  const catalog = buildProjectCatalog(root);
  const files = listRunArtifactPaths(root, catalog.runs);
  const layers = buildMapLayers({ catalog, files });
  const compared = compareRunLayers(layers, "run-a", "run-b", catalog.runs);
  assert.equal(compared.leftRunId, "run-a");
  assert.equal(compared.rightRunId, "run-b");
  const tmi = compared.matched.find((pair) => pair.left.path.endsWith("tmi.asc"));
  assert.ok(tmi);
  assert.equal(tmi.left.runId, "run-a");
  assert.equal(tmi.right.runId, "run-b");
  assert.equal(tmi.left.path, "G-AID Output/runs/run-a/tmi.asc");
  assert.equal(tmi.right.path, "G-AID Output/runs/run-b/tmi.asc");
  const rtp = compared.matched.find((pair) => pair.left.path.endsWith("rtp.tif"));
  assert.ok(rtp);
  assert.equal(rtp.right.artifactId, artifactId("run-b", "rtp.tif"));
  assert.ok(compared.warnings.some((warning) => /revision of run-a/.test(warning)));
  const leftTmi = fs.readFileSync(path.join(root, tmi.left.path), "utf8");
  const rightTmi = fs.readFileSync(path.join(root, tmi.right.path), "utf8");
  assert.notEqual(parseEsriAscii(leftTmi)!.values[0], parseEsriAscii(rightTmi)!.values[0]);
});

test("unsupported formats cannot appear as falsely decoded layers", () => {
  const root = tmpProject();
  const catalog = buildProjectCatalog(root);
  const layers = buildMapLayers({ catalog, files: [] });

  for (const formatId of ["shapefile", "las-point-cloud", "segy"]) {
    assert.equal(isFalselyDecodable(formatId), true);
  }

  const shp = byRel(catalog.records, "gis/clip.shp");
  const shpLayer = selectLayerById(layers, shp.id);
  assert.ok(shpLayer);
  assert.notEqual(shpLayer.displayStatus, "viewable");
  assert.equal(shpLayer.origin, "unsupported");
  assert.equal(decodeRasterLayer({ formatId: shpLayer.formatId, buffer: fs.readFileSync(path.join(root, shp.relativePath)) }), null);
  assert.equal(decodeVectorLayer({ formatId: shpLayer.formatId, text: "{}" }), null);

  const las = byRel(catalog.records, "logs/cloud.las");
  const lasLayer = selectLayerById(layers, las.id);
  assert.ok(lasLayer);
  assert.notEqual(lasLayer.displayStatus, "viewable");
  assert.equal(decodeRasterLayer({ formatId: lasLayer.formatId, buffer: fs.readFileSync(path.join(root, las.relativePath)) }), null);

  const segy = byRel(catalog.records, "seismic/line1.sgy");
  const segyLayer = selectLayerById(layers, segy.id);
  assert.ok(segyLayer);
  assert.notEqual(segyLayer.displayStatus, "viewable");
  assert.equal(decodeRasterLayer({ formatId: "segy", buffer: fs.readFileSync(path.join(root, segy.relativePath)) }), null);

  const tiny = byRel(catalog.records, "gis/tiny.tif");
  const tinyBuf = fs.readFileSync(path.join(root, tiny.relativePath));
  assert.equal(parseGaidGeoTiff(tinyBuf), null);
  assert.equal(decodeRasterLayer({ formatId: "geotiff", buffer: tinyBuf }), null);
});

test("large inputs use the declared preview/overview policy", () => {
  assert.match(PREVIEW_POLICY.label, /preview\/overview/);
  const wide = asciiGrid(PREVIEW_POLICY.maxGridDimension + 10, 2, 7);
  const preview = parseEsriAscii(wide);
  assert.ok(preview);
  assert.equal(preview.preview, true);
  assert.ok(preview.ncols <= PREVIEW_POLICY.maxGridDimension);
  assert.match(preview.previewNote || "", /preview\/overview/);
  assert.ok(preview.values.length <= PREVIEW_POLICY.maxGridCells);

  const refused = parseEsriAscii("ncols 1\nnrows 1\nxllcorner 0\nyllcorner 0\ncellsize 1\n1", {
    byteLength: PREVIEW_POLICY.maxAsciiBytes + 1,
  });
  assert.equal(refused, null);

  const oversizeGeo = parseGeojson("x".repeat(PREVIEW_POLICY.maxGeojsonBytes + 1));
  assert.ok(oversizeGeo);
  assert.equal(oversizeGeo.data.preview, true);
  assert.match(oversizeGeo.data.previewNote || "", /preview\/overview/);
  assert.equal(oversizeGeo.data.features.length, 0);
});

test("profile inspection names source, interpolation, units, and CRS", () => {
  const grid = parseEsriAscii(asciiGrid(2, 2, [1, 2, 3, 4]))!;
  const crs = crsFromEpsg(32630, "prj");
  const profile = sampleProfile(grid, { x: 500005, y: 600015 }, { x: 500015, y: 600005 }, {
    id: "art:run-a:tmi.asc",
    path: "G-AID Output/runs/run-a/tmi.asc",
    units: "nT",
    crs,
  });
  assert.equal(profile.interpolation, "nearest-neighbour");
  assert.equal(profile.units, "nT");
  assert.equal(profile.crs?.epsg, 32630);
  assert.equal(profile.sourcePath, "G-AID Output/runs/run-a/tmi.asc");
  assert.equal(profile.representation, "full");
  assert.ok(profile.samples.length > 1);
  const hit = inspectRaster(grid, 500005, 600015);
  assert.ok(hit);
  assert.equal(hit.nodata, false);
});

test("agent map answers stay inside catalog/artifact metadata and deny overlay-as-proof", () => {
  const root = tmpProject();
  const catalog = buildProjectCatalog(root);
  const files = listRunArtifactPaths(root, catalog.runs);
  const layers = buildMapLayers({ catalog, files });
  assert.equal(isMapQuestion("what CRS is on the map?"), true);
  assert.equal(isMapQuestion("proceed"), false);
  const answer = mapWorkspaceAnswer({ catalog, layers, message: "what layers are on the map?" });
  assert.match(answer, /does not prove geological, mineral, or geophysical causation/i);
  assert.equal(isRegisteredCapability("gis.reproject"), false);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nphase4 map ok");
