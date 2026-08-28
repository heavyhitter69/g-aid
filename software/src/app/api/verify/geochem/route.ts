import fs from "node:fs";
import path from "node:path";
import { buildProjectCatalog } from "@/lib/catalog/build";
import { comparisonBlocked, geochemProductWarnings } from "@/lib/geochem-product";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROOT = path.join(process.cwd(), "tests/fixtures/validation-ui/G-AID Output/runs");
const GEOCHEM_ROOT = path.join(process.cwd(), "tests/fixtures/geochem-project");

function optional(run: string, file: string): string | null {
  const dest = path.join(ROOT, run, file);
  if (!fs.existsSync(dest)) return null;
  return fs.readFileSync(dest, "utf8");
}

function optionalJson(run: string, file: string): unknown | null {
  const text = optional(run, file);
  return text ? JSON.parse(text) : null;
}

function pack(run: string) {
  const planText = optional(run, "plan.json");
  const plan = planText ? (JSON.parse(planText) as Record<string, unknown>) : { planHash: `hash-${run}` };
  return {
    runId: run,
    planHash: plan.planHash,
    geojson: optional(run, "geochem_points.geojson"),
    ingestQc: optionalJson(run, "geochem_ingest_qc.json"),
    qc: optionalJson(run, "geochem_qc.json"),
    summary: optionalJson(run, "geochem_summary.json"),
    pointsMeta: optionalJson(run, "geochem_points.meta.json"),
    interpretation: optionalJson(run, "geochem_interpretation.json"),
    mapping: optionalJson(run, "geochem_mapping.json"),
    displayMeta: optionalJson(run, "geochem_display.meta.json"),
    geologyGeojson: run === "r-verify-geochem-overlay" ? optionalGeology() : null,
    plan,
  };
}

function optionalGeology(): string | null {
  const dest = path.join(GEOCHEM_ROOT, "overlay", "geology.geojson");
  if (!fs.existsSync(dest)) return null;
  return fs.readFileSync(dest, "utf8");
}

export async function GET(): Promise<Response> {
  const catalog = buildProjectCatalog(GEOCHEM_ROOT);
  const records = catalog.records.map((record) => ({
    id: record.id,
    relativePath: record.relativePath,
    filename: record.filename,
    supportStatus: record.supportStatus,
    formatId: record.formatId,
    adapterId: record.adapterId,
    mediaClass: record.mediaClass,
    domainHint: record.domainHint,
    crs: record.crs || null,
    units: record.units || null,
    sampleMedium: record.sampleMedium || null,
    geochemMapping: record.geochemMapping,
    parseErrors: record.parseErrors,
  }));
  const mixedSummary = optionalJson("r-verify-geochem-mixed", "geochem_summary.json") as
    | { comparisons?: Array<{ left?: string; right?: string; blocked?: boolean; reason?: string }> }
    | null;
  const comparison = mixedSummary?.comparisons?.[0];
  return Response.json({
    catalog: { root: GEOCHEM_ROOT, records },
    valid: pack("r-verify-geochem-valid"),
    bdl: pack("r-verify-geochem-bdl"),
    mixed: pack("r-verify-geochem-mixed"),
    qc: pack("r-verify-geochem-qc"),
    overlay: pack("r-verify-geochem-overlay"),
    comparison: comparison
      ? { ...comparison, ...comparisonBlocked("ppm", "pct") }
      : comparisonBlocked("ppm", "pct"),
    warnings: geochemProductWarnings({
      element: "Au",
      units: "ppm",
      censored: true,
      qualifierVisible: true,
      medium: "soil",
      crs: "EPSG:32734",
    }),
  });
}
