import fs from "node:fs";
import path from "node:path";
import { buildProjectCatalog } from "@/lib/catalog/build";
import { layersOverlappingVectors } from "@/lib/gis-product";
import type { CrsAxisOrder } from "@/lib/map/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROOT = path.join(process.cwd(), "tests/fixtures/validation-ui/G-AID Output/runs");
const SHP_ROOT = path.join(process.cwd(), "tests/fixtures/shapefile-project");

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
  rings?: Array<Array<{ x: number; y: number }>>;
  parts?: Array<Array<Array<{ x: number; y: number }>>>;
}) {
  const coords = feature.coordinates || [];
  const gtype = feature.geometry_type || "Point";
  if (gtype === "Point" && coords[0]) return { type: "Point", coordinates: [coords[0].x, coords[0].y] };
  if (gtype.includes("Line")) return { type: "LineString", coordinates: coords.map((p) => [p.x, p.y]) };
  const ringCoords = (ring: Array<{ x: number; y: number }>) => ring.map((p) => [p.x, p.y]);
  if (feature.parts?.length) {
    if (feature.parts.length === 1) {
      return { type: "Polygon", coordinates: feature.parts[0].map(ringCoords) };
    }
    return { type: "MultiPolygon", coordinates: feature.parts.map((part) => part.map(ringCoords)) };
  }
  if (feature.rings?.length) {
    return { type: "Polygon", coordinates: feature.rings.map(ringCoords) };
  }
  return { type: "Polygon", coordinates: [coords.map((p) => [p.x, p.y])] };
}

type TrackLayer = {
  crs?: string;
  crs_source?: string;
  crs_confidence?: string;
  source_format?: string;
  encoding?: string;
  encoding_source?: string;
  source_path?: string;
  role?: string;
  role_reviewed?: boolean;
  features?: Array<{
    id?: unknown;
    properties?: Record<string, unknown>;
    geometry_type?: string;
    coordinates?: Array<{ x: number; y: number }>;
    rings?: Array<Array<{ x: number; y: number }>>;
    parts?: Array<Array<Array<{ x: number; y: number }>>>;
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
          _g_aid_source_format: layer.source_format || "shapefile",
          _g_aid_role: layer.role,
          _g_aid_role_reviewed: layer.role_reviewed,
          _g_aid_crs: layer.crs,
          _g_aid_crs_source: layer.crs_source,
          _g_aid_crs_confidence: layer.crs_confidence,
          _g_aid_encoding: layer.encoding,
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
    exportMeta: optionalJson(run, "vector_export.meta.json"),
    geojson: tracksToGeojson(tracks),
    plan,
  };
}

function catalogSnapshot() {
  const catalog = buildProjectCatalog(SHP_ROOT);
  return {
    root: "tests/fixtures/shapefile-project",
    parser: "pyshp-2.3.1",
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
      crsConfidence: record.crsConfidence || null,
      encoding: record.encoding || null,
      encodingSource: record.encodingSource || null,
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
  const overlapPack = pack("r-verify-shp-overlap");
  const overlapLayers = ((overlapPack.tracks?.layers || []) as Array<{
    source_path?: string;
    bbox?: { minX: number; minY: number; maxX: number; maxY: number };
    crs?: string;
    role?: string;
    coordinate_order?: string;
  }>).map((layer) => ({
    path: layer.source_path || "",
    label: layer.role || layer.source_path || "layer",
    formatId: "shapefile",
    bbox: layer.bbox,
    crs: layer.crs,
    coordinateOrder: layer.coordinate_order as CrsAxisOrder | undefined,
  }));
  const bboxHits = layersOverlappingVectors(overlapLayers);
  return Response.json({
    catalog: catalogSnapshot(),
    points: pack("r-verify-shp-points"),
    lines: pack("r-verify-shp-lines"),
    polygons: pack("r-verify-shp-polygons"),
    blocked: pack("r-verify-shp-blocked"),
    conflict: pack("r-verify-shp-conflict"),
    overlap: { ...overlapPack, bboxHits },
    holes: pack("r-verify-shp-holes"),
    interpretation: pack("r-verify-shp-interpret"),
  });
}
