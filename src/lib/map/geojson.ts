import type { VectorFeature, VectorLayerData } from "./types.ts";
import { PREVIEW_POLICY, previewNote } from "./preview.ts";
import { crsFromGeojson, type CrsInfo } from "./crs.ts";

function asCoord(pair: unknown): { x: number; y: number } | null {
  if (!Array.isArray(pair) || pair.length < 2) return null;
  const x = Number(pair[0]);
  const y = Number(pair[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function lineCoords(coords: unknown): { x: number; y: number }[] {
  if (!Array.isArray(coords)) return [];
  const pts: { x: number; y: number }[] = [];
  for (const item of coords) {
    const p = asCoord(item);
    if (p) pts.push(p);
  }
  return pts;
}

function featuresFromGeometry(geom: { type?: string; coordinates?: unknown }): VectorFeature[] {
  const type = geom?.type;
  const coordinates = geom?.coordinates;
  if (type === "Point") {
    const p = asCoord(coordinates);
    return p ? [{ type: "Point", coordinates: [p] }] : [];
  }
  if (type === "MultiPoint" && Array.isArray(coordinates)) {
    return coordinates
      .map((item) => asCoord(item))
      .filter((p): p is { x: number; y: number } => Boolean(p))
      .map((p) => ({ type: "Point" as const, coordinates: [p] }));
  }
  if (type === "LineString") {
    const pts = lineCoords(coordinates);
    return pts.length >= 2 ? [{ type: "LineString", coordinates: pts }] : [];
  }
  if (type === "MultiLineString" && Array.isArray(coordinates)) {
    return coordinates
      .map((line) => lineCoords(line))
      .filter((pts) => pts.length >= 2)
      .map((pts) => ({ type: "LineString" as const, coordinates: pts }));
  }
  if (type === "Polygon" && Array.isArray(coordinates)) {
    const ring = lineCoords(coordinates[0]);
    return ring.length >= 3 ? [{ type: "Polygon", coordinates: ring }] : [];
  }
  return [];
}

export function parseGeojson(text: string): { data: VectorLayerData; crs: CrsInfo } | null {
  if (text.length > PREVIEW_POLICY.maxGeojsonBytes) {
    return {
      crs: crsFromGeojson(null),
      data: {
        features: [],
        featureCount: 0,
        preview: true,
        previewNote: previewNote("byte-limit"),
      },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as {
    type?: string;
    features?: { geometry?: { type?: string; coordinates?: unknown } }[];
    geometry?: { type?: string; coordinates?: unknown };
  };
  const crs = crsFromGeojson(parsed);
  const collected: VectorFeature[] = [];
  if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
    for (const feature of obj.features) {
      if (feature?.geometry) collected.push(...featuresFromGeometry(feature.geometry));
    }
  } else if (obj.type === "Feature" && obj.geometry) {
    collected.push(...featuresFromGeometry(obj.geometry));
  } else if (obj.type && obj.coordinates) {
    collected.push(...featuresFromGeometry(obj));
  } else {
    return null;
  }
  const truncated = collected.length > PREVIEW_POLICY.maxGeojsonFeatures;
  return {
    crs,
    data: {
      features: collected.slice(0, PREVIEW_POLICY.maxGeojsonFeatures),
      featureCount: collected.length,
      preview: truncated,
      previewNote: truncated ? previewNote("truncated-geojson") : undefined,
    },
  };
}

export function pointsFromVector(data: VectorLayerData): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const feature of data.features) {
    if (feature.type === "Point") pts.push(...feature.coordinates);
  }
  return pts;
}

export function linesFromVector(data: VectorLayerData): { x: number; y: number }[][] {
  return data.features
    .filter((feature) => feature.type === "LineString" || feature.type === "Polygon")
    .map((feature) => feature.coordinates);
}
