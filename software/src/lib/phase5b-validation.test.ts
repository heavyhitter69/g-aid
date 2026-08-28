import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseEsriAscii } from "./map/ascii.ts";
import { parseSectionCsv } from "./section/parse.ts";
import { layerLabel } from "./raster-layers.ts";
import { gravityProductWarnings, NEAR_ZONE_MAP_LABEL } from "./gravity-product.ts";
import { isRegisteredCapability } from "./capabilities/index.ts";
import { isUsableSupabaseConfig } from "./supabase/config.ts";

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
  assert.equal(isRegisteredCapability("grav.terrain_intermediate_zone"), true);
  assert.equal(isRegisteredCapability("grav.terrain_far_zone"), true);
  assert.equal(isRegisteredCapability("grav.terrain"), false);
});

test("placeholder Supabase env is treated as unconfigured so desktop verification can run", () => {
  assert.equal(isUsableSupabaseConfig(undefined, undefined), false);
  assert.equal(
    isUsableSupabaseConfig("https://placeholder.supabase.co", "eyJplaceholder"),
    false
  );
  assert.equal(
    isUsableSupabaseConfig("https://abcd.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.real"),
    true
  );
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

test("zoned terrain benchmarks pass and still refuse Complete Bouguer naming", () => {
  runPython(path.join(process.cwd(), "python/tests/test_gravity_zoned_terrain.py"));
  const report = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "docs/validation/results/gravity_zoned_terrain_benchmarks.json"), "utf8")
  );
  assert.equal(report.all_passed, true);
  assert.equal(report.not_complete_bouguer, true);
  assert.equal(report.complete_bouguer_justified, false);
  assert.equal(report.hayford_bowie_compartments, false);
  assert.equal(report.spherical_earth, false);
  assert.equal(report.atmospheric_correction, false);
  assert.equal(report.dem_download, false);
});

test("ERT historical Gaussian kernel still fails two-layer recovery (case preserved)", () => {
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

test("live ert.invert2d is experimental and has not earned production support", () => {
  runPython(path.join(process.cwd(), "python/tests/test_ert_invert2d_benchmarks.py"));
  const report = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "docs/validation/results/ert_invert2d_benchmarks.json"), "utf8")
  );
  assert.equal(report.support_level, "experimental");
  assert.equal(report.production_supported, false);
  assert.equal(report.not_res2dinv, true);
  const twoLayer = report.cases.find((c: { name: string }) => c.name === "two_layer_wenner_50_over_500_h8");
  assert.equal(twoLayer.polarity_recovered, true);
  assert.equal(twoLayer.true_resistivities_recovered, false);
  assert.equal(report.independent_2d_target_oracle, false);
  assert.ok(Array.isArray(report.remaining_failure_cases));
  assert.ok(report.remaining_failure_cases.some((c: { name: string }) => /two_layer_wenner_50_over_500_h8/.test(c.name)));
  const historical = report.cases.find((c: { name: string }) => c.name.startsWith("historical_gaussian"));
  assert.equal(historical.preserved_failure, true);
  assert.equal(historical.one_d_layer_recovery, false);
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
  assert.ok(warnings.some((line) => /spherical far-zone/i.test(line)));
  assert.ok(!warnings.some((line) => /complete bouguer/i.test(line)));
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
  assert.equal(qc.experimental, true);
  assert.equal(qc.production_supported, false);
  assert.ok(fs.existsSync(path.join(root, "plan.json")));
  assert.ok(fs.existsSync(path.join(root, "ert_synthetic_recovery.json")));
  assert.ok(fs.existsSync(path.join(root, "ert_invert2d_benchmarks.json")));
});

test("desktop UI verification is recorded and does not claim Complete Bouguer", () => {
  const report = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "docs/validation/results/phase5b_desktop_ui.json"), "utf8")
  );
  assert.equal(report.passed, true);
  assert.equal(report.source, "live-react-page");
  assert.equal(report.not_complete_bouguer, true);
  assert.equal(report.not_res2dinv, true);
  assert.equal(report.tabs.gravity.title, NEAR_ZONE_MAP_LABEL);
  assert.match(report.tabs.gravity.warnings, /Far-zone and intermediate-zone/);
  assert.match(report.tabs.gravity.warnings, /EPSG:32630 does not match EPSG:4326/);
  assert.equal(report.tabs.pseudo.heading, "ERT pseudosection");
  assert.equal(report.tabs.invert.heading, "Experimental ERT 2-D invert (not production)");
  assert.equal(report.tabs.provenance.gravity_run, "r-verify-grav");
  assert.equal(report.tabs.provenance.ert_run, "r-verify-ert");
  for (const name of ["gravity-map.webp", "ert-pseudosection.webp", "ert-invert.webp", "provenance-crs.webp"]) {
    assert.ok(fs.existsSync(path.join(process.cwd(), "docs/validation/results/screenshots", name)));
  }
  const gravRoot = path.join(process.cwd(), "tests/fixtures/validation-ui/G-AID Output/runs/r-verify-grav");
  const ertRoot = path.join(process.cwd(), "tests/fixtures/validation-ui/G-AID Output/runs/r-verify-ert");
  assert.ok(fs.existsSync(path.join(gravRoot, "phase5b_desktop_ui.json")));
  assert.ok(fs.existsSync(path.join(ertRoot, "phase5b_desktop_ui.json")));
});

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log("phase5b validation ok");
