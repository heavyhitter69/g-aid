import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseEsriAscii } from "./map/ascii.ts";
import { parseSectionCsv } from "./section/parse.ts";
import { layerLabel } from "./raster-layers.ts";
import { gravityProductWarnings, NEAR_ZONE_MAP_LABEL } from "./gravity-product.ts";
import { isRegisteredCapability } from "./capabilities/index.ts";

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

function runPython(script: string) {
  const result = spawnSync("python3", [script], {
    encoding: "utf8",
    cwd: process.cwd(),
    env: { ...process.env, PYTHONPATH: path.join(process.cwd(), "python") },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

test("grav.terrain is not a live capability id", () => {
  assert.equal(isRegisteredCapability("grav.terrain_near_zone"), true);
  assert.equal(isRegisteredCapability("grav.terrain"), false);
});

test("independent gravity terrain benchmarks pass and refuse Complete Bouguer naming", () => {
  runPython(path.join(process.cwd(), "python/tests/test_gravity_terrain_benchmarks.py"));
  const report = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "docs/validation/results/gravity_terrain_benchmarks.json"), "utf8")
  );
  assert.equal(report.all_passed, true);
  assert.equal(report.not_complete_bouguer, true);
  assert.equal(report.far_zone, false);
  assert.match(report.product_name, /near-zone terrain-corrected Bouguer/i);
});

test("ERT synthetic recovery records homogeneous recovery and 1-D layering limits", () => {
  runPython(path.join(process.cwd(), "python/tests/test_ert_synthetic_recovery.py"));
  const report = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "docs/validation/results/ert_synthetic_recovery.json"), "utf8")
  );
  assert.equal(report.all_passed, true);
  assert.equal(report.not_res2dinv, true);
  const homo = report.cases.find((c: { name: string }) => c.name.startsWith("homogeneous"));
  const layers = report.cases.find((c: { name: string }) => c.name.startsWith("two_layer"));
  assert.ok(homo.relative_error < 0.15);
  assert.equal(layers.one_d_layer_recovery, false);
});

test("validation-ui gravity fixture is a near-zone grid with honest QC and map label", () => {
  const root = path.join(process.cwd(), "tests/fixtures/validation-ui/G-AID Output/runs/r-verify-grav");
  const ascii = fs.readFileSync(path.join(root, "near_zone_terrain_corrected_bouguer_grid.asc"), "utf8");
  const grid = parseEsriAscii(ascii);
  assert.ok(grid && grid.ncols > 0);
  const qc = JSON.parse(fs.readFileSync(path.join(root, "near_zone_terrain_corrected_bouguer_qc.json"), "utf8"));
  assert.equal(qc.not_complete_bouguer, true);
  assert.equal(qc.far_zone, false);
  assert.equal(qc.intermediate_zone, false);
  assert.ok(fs.existsSync(path.join(root, "plan.json")));
  assert.ok(fs.existsSync(path.join(root, "gravity_terrain_benchmarks.json")));
  const label = layerLabel("near_zone_terrain_corrected_bouguer_grid.asc");
  assert.equal(label, NEAR_ZONE_MAP_LABEL);
  const warnings = gravityProductWarnings({
    path: "G-AID Output/runs/r-verify-grav/near_zone_terrain_corrected_bouguer_grid.asc",
    densityGcc: qc.density_gcc,
    terrainRadiusM: qc.terrain_radius_m,
    demCellSizeM: qc.dem_cellsize_m,
    coverageFraction: qc.mean_coverage_fraction,
    elevationDatum: qc.dem_elevation_datum,
    bullardB: qc.apply_bullard_b,
  });
  assert.ok(warnings.some((line) => /Bullard B/i.test(line)));
  assert.ok(warnings.some((line) => /not equivalent/i.test(line)));
});

test("validation-ui ERT fixtures parse as labelled sections with invert QC", () => {
  const root = path.join(process.cwd(), "tests/fixtures/validation-ui/G-AID Output/runs/r-verify-ert");
  const pseudo = parseSectionCsv(fs.readFileSync(path.join(root, "ert_pseudosection.csv"), "utf8"), "ert_pseudosection.csv");
  const model = parseSectionCsv(fs.readFileSync(path.join(root, "ert_2d_model.csv"), "utf8"), "ert_2d_model.csv");
  assert.equal(pseudo.kind, "pseudosection");
  assert.ok(pseudo.warnings.some((line) => /not a depth model/i.test(line)));
  assert.equal(model.kind, "resistivity-model");
  assert.ok(model.warnings.some((line) => /not Res2DInv/i.test(line)));
  const qc = JSON.parse(fs.readFileSync(path.join(root, "ert_invert_qc.json"), "utf8"));
  assert.equal(qc.topography_used, false);
  assert.equal(qc.not_res2dinv, true);
  assert.ok(fs.existsSync(path.join(root, "plan.json")));
  assert.ok(fs.existsSync(path.join(root, "ert_synthetic_recovery.json")));
});

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("phase5b validation ok");
