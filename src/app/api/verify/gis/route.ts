import fs from "node:fs";
import path from "node:path";
import { buildProjectCatalog } from "@/lib/catalog/build";
import { layersOverlappingVectors } from "@/lib/gis-product";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROOT = path.join(process.cwd(), "tests/fixtures/validation-ui/G-AID Output/runs");
const GIS_ROOT = path.join(process.cwd(), "tests/fixtures/gis-project");

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

type TrackLayer = {
  crs?: string;
  crs_source?: string;
  geojson_contract?: string;
  axis_order?: string;
  coordinate_order?: string;
  source_path?: string;
  role?: string;
  role_reviewed?: boolean;
  features?: Array<{
    id?: unknown;
    properties?: Record<string, unknown>;
    geometry_type?: string;
    coordinates?: Array<{ x: number; y: number }>;
  }>;
};

function tracksToGeojson(tracks: { layers?: TrackLayer[] } | null): string | null {
  const layers = tracks?.layers || [];
  if (!layers.length) return null;
  const crs = layers[0]?.crs;
  const fc: Record<string, unknown> = {
    type: "FeatureCollection",
    features: layers.flatMap((layer) =>
      (layer.features || []).map((feature) => ({
        type: "Feature",
        id: feature.id,
        properties: {
          ...(feature.properties || {}),
          _g_aid_source: layer.source_path,
          _g_aid_role: layer.role,
          _g_aid_role_reviewed: layer.role_reviewed,
          _g_aid_crs: layer.crs,
          _g_aid_geojson_contract: layer.geojson_contract,
          _g_aid_axis_order: layer.axis_order,
          _g_aid_coordinate_order: layer.coordinate_order,
        },
        geometry: featureGeometry(feature),
      }))
    ),
  };
  if (crs && crs !== "OGC:CRS84") {
    fc.crs = { type: "name", properties: { name: crs } };
  }
  return JSON.stringify(fc);
}

function pack(run: string) {
  const plan = JSON.parse(read(run, "plan.json")) as Record<string, unknown>;
  const tracks = optionalJson(run, "vector_tracks.json") as { layers?: TrackLayer[] } | null;
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

function catalogSnapshot() {
  const catalog = buildProjectCatalog(GIS_ROOT);
  return {
    root: "tests/fixtures/gis-project",
    records: catalog.records.map((record) => ({
      id: record.id,
      relativePath: record.relativePath,
      filename: record.filename,
      supportStatus: record.supportStatus,
      formatId: record.formatId,
      adapterId: record.adapterId,
      mediaClass: record.mediaClass,
      crs: record.crs || null,
      crsSource: record.crsSource || null,
      geojsonContract: record.geojsonContract || null,
      axisOrder: record.axisOrder || null,
      coordinateOrder: record.coordinateOrder || null,
      locationQuality: record.locationQuality,
      vectorRole: record.vectorRole,
      geometryTypes: record.geometryTypes,
      attributeNames: record.attributeNames,
      parseErrors: record.parseErrors,
      shapefileSidecars: record.shapefileSidecars,
    })),
  };
}

export async function GET(): Promise<Response> {
  const overlapPack = pack("r-verify-gis-overlap");
  const overlapLayers = ((overlapPack.tracks?.layers || []) as Array<{
    source_path?: string;
    bbox?: { minX: number; minY: number; maxX: number; maxY: number };
    crs?: string;
    role?: string;
    geojson_contract?: string;
    coordinate_order?: string;
  }>).map((layer) => ({
    path: layer.source_path || "",
    label: layer.role || layer.source_path || "layer",
    formatId: "geojson",
    bbox: layer.bbox,
    crs: layer.crs,
    geojsonContract: layer.geojson_contract,
    coordinateOrder: layer.coordinate_order,
  }));
  const bboxHits = layersOverlappingVectors(overlapLayers);
  return Response.json({
    catalog: catalogSnapshot(),
    points: pack("r-verify-gis-points"),
    lines: pack("r-verify-gis-lines"),
    polygons: pack("r-verify-gis-polygons"),
    rfc7946: pack("r-verify-gis-crs84"),
    legacy: pack("r-verify-gis-legacy"),
    customImport: pack("r-verify-gis-custom"),
    unknownCrs: pack("r-verify-gis-unknown"),
    conflict: pack("r-verify-gis-conflict"),
    compat: pack("r-verify-gis-compat"),
    overlap: { ...overlapPack, bboxHits },
    interpretation: pack("r-verify-gis-interpret"),
  });
}
