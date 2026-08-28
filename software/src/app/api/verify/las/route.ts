import fs from "node:fs";
import path from "node:path";
import { layersOverlappingCollar } from "@/lib/borehole-product";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROOT = path.join(process.cwd(), "tests/fixtures/validation-ui/G-AID Output/runs");

function read(run: string, file: string): string {
  return fs.readFileSync(path.join(ROOT, run, file), "utf8");
}

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
  const plan = JSON.parse(read(run, "plan.json")) as Record<string, unknown>;
  return {
    runId: run,
    planHash: plan.planHash,
    tracks: JSON.parse(read(run, "borehole_tracks.json")),
    ingestQc: optionalJson(run, "borehole_ingest_qc.json"),
    collarQc: optionalJson(run, "borehole_collar_qc.json"),
    collarGeojson: optional(run, "borehole_collar.geojson"),
    collarMeta: optionalJson(run, "borehole_collar.meta.json"),
    interpretation: optionalJson(run, "borehole_interpretation.json"),
    plan,
  };
}

export async function GET(): Promise<Response> {
  const collar = pack("r-verify-las-collar");
  const geo = collar.collarGeojson ? JSON.parse(collar.collarGeojson) : null;
  const coords = geo?.features?.[0]?.geometry?.coordinates;
  const overlap = Array.isArray(coords)
    ? layersOverlappingCollar(
        [
          {
            path: "grids/tmi.asc",
            label: "TMI grid",
            formatId: "esri-ascii-grid",
            bbox: { minX: 18.0, minY: -34.2, maxX: 18.8, maxY: -33.6 },
            crs: "EPSG:4326",
          },
          {
            path: "grids/wrong-crs.asc",
            label: "other CRS grid",
            formatId: "esri-ascii-grid",
            bbox: { minX: 18.0, minY: -34.2, maxX: 18.8, maxY: -33.6 },
            crs: "EPSG:32734",
          },
        ],
        { x: Number(coords[0]), y: Number(coords[1]), crs: "EPSG:4326" }
      )
    : [];
  return Response.json({
    log: pack("r-verify-las"),
    collar: { ...collar, overlap },
    missingCrs: pack("r-verify-las-ncrs"),
  });
}
