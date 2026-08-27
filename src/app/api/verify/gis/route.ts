import fs from "node:fs";
import path from "node:path";
import { layersOverlappingVectors } from "@/lib/gis-product";

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

function featureGeometry(feature: {
  geometry_type?: string;
  coordinates?: Array<{ x: number; y: number }>;
}) {
  const coords = feature.coordinates || [];
  const gtype = feature.geometry_type || "Point";
  if (gtype === "Point" && coords[0]) return { type: "Point", coordinates: [coords[0].x, coords[0].y] };
  if (gtype.includes("Line")) return { type: "LineString", coordinates: coords.map((p) => [p.x, p.y]) };
  return { type: "Polygon", coordinates: [coords.map((p) => [p.x, p.y])] };
}

function tracksToGeojson(tracks: { layers?: Array<Record<string, unknown>> } | null): string | null {
  const layer = tracks?.layers?.[0] as
    | {
        crs?: string;
        features?: Array<{ id?: unknown; properties?: Record<string, unknown>; geometry_type?: string; coordinates?: Array<{ x: number; y: number }> }>;
      }
    | undefined;
  if (!layer) return null;
  return JSON.stringify({
    type: "FeatureCollection",
    crs: { type: "name", properties: { name: layer.crs || "EPSG:0" } },
    features: (layer.features || []).map((feature) => ({
      type: "Feature",
      id: feature.id,
      properties: feature.properties || {},
      geometry: featureGeometry(feature),
    })),
  });
}

function pack(run: string) {
  const plan = JSON.parse(read(run, "plan.json")) as Record<string, unknown>;
  const tracks = optionalJson(run, "vector_tracks.json") as { layers?: Array<Record<string, unknown>> } | null;
  return {
    runId: run,
    planHash: plan.planHash,
    tracks,
    ingestQc: optionalJson(run, "vector_ingest_qc.json"),
    overlap: optionalJson(run, "vector_overlap.json"),
    overlapQc: optionalJson(run, "vector_overlap_qc.json"),
    interpretation: optionalJson(run, "vector_interpretation.json"),
    geojson: tracksToGeojson(tracks),
    plan,
  };
}

export async function GET(): Promise<Response> {
  const overlapPack = pack("r-verify-gis-overlap");
  const overlapLayers = ((overlapPack.tracks?.layers || []) as Array<{
    source_path?: string;
    bbox?: { minX: number; minY: number; maxX: number; maxY: number };
    crs?: string;
    role?: string;
  }>).map((layer) => ({
    path: layer.source_path || "",
    label: layer.role || layer.source_path || "layer",
    formatId: "geojson",
    bbox: layer.bbox,
    crs: layer.crs,
  }));
  const bboxHits = layersOverlappingVectors(overlapLayers);
  return Response.json({
    points: pack("r-verify-gis-points"),
    polygons: pack("r-verify-gis-polygons"),
    unknownCrs: pack("r-verify-gis-unknown"),
    conflict: pack("r-verify-gis-conflict"),
    overlap: { ...overlapPack, bboxHits },
    interpretation: pack("r-verify-gis-interpret"),
  });
}
