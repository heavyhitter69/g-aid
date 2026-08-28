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

function optionalJson(run: string, file: string): unknown | null {
  const dest = path.join(ROOT, run, file);
  if (!fs.existsSync(dest)) return null;
  return JSON.parse(fs.readFileSync(dest, "utf8"));
}

export async function GET(): Promise<Response> {
  const concPlan = readJson("r-verify-rad-conc", "plan.json") as Record<string, unknown>;
  const cpsPlan = readJson("r-verify-rad-cps", "plan.json") as Record<string, unknown>;
  const unknownPlan = readJson("r-verify-rad-unknown", "plan.json") as Record<string, unknown>;
  const concMeta = (optionalJson("r-verify-rad-conc", "rad_k_grid.meta.json") || {}) as Record<string, unknown>;
  const cpsMeta = (optionalJson("r-verify-rad-cps", "rad_k_grid.meta.json") || {}) as Record<string, unknown>;
  const unknownMeta = (optionalJson("r-verify-rad-unknown", "rad_k_grid.meta.json") || {}) as Record<string, unknown>;
  return Response.json({
    concentration: {
      runId: "r-verify-rad-conc",
      parentRunId: concPlan.parentRunId,
      planHash: concPlan.planHash,
      ascii: read("r-verify-rad-conc", "rad_k_grid.asc"),
      meta: concMeta,
      ternary: read("r-verify-rad-conc", "rad_ternary.json"),
      ratios: read("r-verify-rad-conc", "rad_ratios.csv"),
      ratioQc: readJson("r-verify-rad-conc", "rad_ratio_qc.json"),
      gridQc: readJson("r-verify-rad-conc", "rad_grid_qc.json"),
      interpretation: readJson("r-verify-rad-conc", "rad_interpretation.json"),
      plan: concPlan,
      crs: "EPSG:32630",
      units: String(concMeta.units || "unknown"),
      quantity: String(concMeta.quantity || "unknown"),
    },
    countRate: {
      runId: "r-verify-rad-cps",
      parentRunId: cpsPlan.parentRunId,
      planHash: cpsPlan.planHash,
      ascii: read("r-verify-rad-cps", "rad_k_grid.asc"),
      meta: cpsMeta,
      ternaryQc: readJson("r-verify-rad-cps", "rad_ternary_qc.json"),
      ratioQc: readJson("r-verify-rad-cps", "rad_ratio_qc.json"),
      gridQc: readJson("r-verify-rad-cps", "rad_grid_qc.json"),
      interpretation: readJson("r-verify-rad-cps", "rad_interpretation.json"),
      plan: cpsPlan,
      crs: "EPSG:32630",
      units: String(cpsMeta.units || "unknown"),
      quantity: String(cpsMeta.quantity || "unknown"),
    },
    unknownUnits: {
      runId: "r-verify-rad-unknown",
      parentRunId: unknownPlan.parentRunId,
      planHash: unknownPlan.planHash,
      ascii: read("r-verify-rad-unknown", "rad_k_grid.asc"),
      meta: unknownMeta,
      ternaryQc: optionalJson("r-verify-rad-unknown", "rad_ternary_qc.json"),
      ratioQc: optionalJson("r-verify-rad-unknown", "rad_ratio_qc.json"),
      interpretation: readJson("r-verify-rad-unknown", "rad_interpretation.json"),
      plan: unknownPlan,
      crs: "EPSG:32630",
      units: String(unknownMeta.units || "unknown"),
      quantity: String(unknownMeta.quantity || "unknown"),
    },
  });
}
