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

function pack(run: string, csvName: string) {
  const plan = readJson(run, "plan.json") as Record<string, unknown>;
  return {
    runId: run,
    parentRunId: plan.parentRunId,
    planHash: plan.planHash,
    csv: read(run, csvName),
    qc: optionalJson(run, csvName.replace(/\.csv$/i, "_qc.json")) || optionalJson(run, csvName.includes("migrated") ? "gpr_migrate_qc.json" : "gpr_process_qc.json"),
    meta: optionalJson(run, csvName.replace(/\.csv$/i, ".meta.json")),
    interpretation: optionalJson(run, "gpr_interpretation.json"),
    plan,
  };
}

export async function GET(): Promise<Response> {
  return Response.json({
    radargram: pack("r-verify-gpr", "gpr_radargram.csv"),
    nyquistAdjust: pack("r-verify-gpr-nyquist", "gpr_radargram.csv"),
    nyquistRefuse: pack("r-verify-gpr-refuse", "gpr_radargram.csv"),
    migrated: pack("r-verify-gpr-mig", "gpr_migrated.csv"),
  });
}
