import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROOT = path.join(process.cwd(), "tests/fixtures/validation-ui/G-AID Output/runs");

function read(run: string, file: string): string {
  return fs.readFileSync(path.join(ROOT, run, file), "utf8");
}

function readJson(run: string, file: string): unknown {
  return JSON.parse(read(run, file));
}

export async function GET(): Promise<Response> {
  const gravityQc = readJson("r-verify-grav", "near_zone_terrain_corrected_bouguer_qc.json") as Record<string, unknown>;
  const gravPlan = readJson("r-verify-grav", "plan.json") as Record<string, unknown>;
  const ertQc = readJson("r-verify-ert", "ert_invert_qc.json") as Record<string, unknown>;
  const ertPlan = readJson("r-verify-ert", "plan.json") as Record<string, unknown>;
  return Response.json({
    gravity: {
      runId: "r-verify-grav",
      planHash: gravPlan.planHash,
      ascii: read("r-verify-grav", "near_zone_terrain_corrected_bouguer_grid.asc"),
      qc: gravityQc,
      interpretation: readJson("r-verify-grav", "gravity_interpretation.json"),
      plan: gravPlan,
      crs: "EPSG:32630",
      units: "mGal",
      productName: "near-zone terrain-corrected Bouguer anomaly",
    },
    ert: {
      runId: "r-verify-ert",
      planHash: ertPlan.planHash,
      pseudosection: read("r-verify-ert", "ert_pseudosection.csv"),
      model: read("r-verify-ert", "ert_2d_model.csv"),
      qc: ertQc,
      interpretation: readJson("r-verify-ert", "ert_interpretation.json"),
      plan: ertPlan,
      units: "ohm.m",
    },
    crsConflict: {
      left: "EPSG:32630",
      right: "EPSG:4326",
      warning: "Overlay blocked: documented CRS EPSG:32630 does not match EPSG:4326. G-AID will not reproject silently.",
    },
  });
}
