import type { VectorFeature, VectorLayerData } from "./types.ts";
import { PREVIEW_POLICY, previewNote } from "./preview.ts";
import { crsFromEpsg, resolveGeojsonCrs, type CrsInfo } from "./crs.ts";

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

function featuresFromGeometry(
  geom: { type?: string; coordinates?: unknown },
  extras?: { id?: unknown; properties?: Record<string, unknown> }
): VectorFeature[] {
  const type = geom?.type;
  const coordinates = geom?.coordinates;
  const meta = {
    id: extras?.id as string | number | undefined,
    properties: extras?.properties,
  };
  if (type === "Point") {
    const p = asCoord(coordinates);
    return p ? [{ type: "Point", coordinates: [p], ...meta }] : [];
  }
  if (type === "MultiPoint" && Array.isArray(coordinates)) {
    return coordinates
      .map((item) => asCoord(item))
      .filter((p): p is { x: number; y: number } => Boolean(p))
      .map((p) => ({ type: "Point" as const, coordinates: [p], ...meta }));
  }
  if (type === "LineString") {
    const pts = lineCoords(coordinates);
    return pts.length >= 2 ? [{ type: "LineString", coordinates: pts, ...meta }] : [];
  }
  if (type === "MultiLineString" && Array.isArray(coordinates)) {
    return coordinates
      .map((line) => lineCoords(line))
      .filter((pts) => pts.length >= 2)
      .map((pts) => ({ type: "LineString" as const, coordinates: pts, ...meta }));
  }
  if (type === "Polygon" && Array.isArray(coordinates)) {
    const rings = coordinates.map((ring) => lineCoords(ring)).filter((ring) => ring.length >= 3);
    if (!rings.length) return [];
    return [
      {
        type: rings.length && coordinates.length > 1 ? "Polygon" : "Polygon",
        coordinates: rings[0],
        rings,
        parts: [rings],
        ...meta,
      },
    ];
  }
  if (type === "MultiPolygon" && Array.isArray(coordinates)) {
    const parts: { x: number; y: number }[][][] = [];
    for (const poly of coordinates) {
      if (!Array.isArray(poly)) continue;
      const rings = poly.map((ring: unknown) => lineCoords(ring)).filter((ring) => ring.length >= 3);
      if (rings.length) parts.push(rings);
    }
    if (!parts.length) return [];
    return [
      {
        type: "MultiPolygon",
        coordinates: parts.flat(2),
        rings: parts[0],
        parts,
        ...meta,
      },
    ];
  }
  return [];
}

export function parseGeojson(text: string): { data: VectorLayerData; crs: CrsInfo } | null {
  if (text.length > PREVIEW_POLICY.maxGeojsonBytes) {
    return {
      crs: crsFromEpsg(undefined, "geojson"),
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
    features?: { geometry?: { type?: string; coordinates?: unknown }; id?: unknown; properties?: Record<string, unknown> }[];
    geometry?: { type?: string; coordinates?: unknown };
    id?: unknown;
    properties?: Record<string, unknown>;
    coordinates?: unknown;
  };
  const collected: VectorFeature[] = [];
  if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
    for (const feature of obj.features) {
      if (feature?.geometry) collected.push(...featuresFromGeometry(feature.geometry, { id: feature.id, properties: feature.properties }));
    }
  } else if (obj.type === "Feature" && obj.geometry) {
    collected.push(...featuresFromGeometry(obj.geometry, { id: obj.id, properties: obj.properties }));
  } else if (obj.type && obj.coordinates) {
    collected.push(...featuresFromGeometry(obj));
  } else {
    return null;
  }
  let bbox: { minX: number; minY: number; maxX: number; maxY: number } | undefined;
  for (const feature of collected) {
    for (const p of feature.coordinates) {
      if (!bbox) bbox = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
      else {
        bbox.minX = Math.min(bbox.minX, p.x);
        bbox.minY = Math.min(bbox.minY, p.y);
        bbox.maxX = Math.max(bbox.maxX, p.x);
        bbox.maxY = Math.max(bbox.maxY, p.y);
      }
    }
  }
  const resolved = resolveGeojsonCrs(parsed, { sourceText: text, bbox });
  const truncated = collected.length > PREVIEW_POLICY.maxGeojsonFeatures;
  return {
    crs: resolved.crs,
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
  return data.features.filter((feature) => feature.type === "LineString").map((feature) => feature.coordinates);
}

export type OverlayPolygon =
  | { x: number; y: number }[]
  | { exterior: { x: number; y: number }[]; holes?: { x: number; y: number }[][] };

export function normalizeOverlayPolygon(poly: OverlayPolygon): {
  exterior: { x: number; y: number }[];
  holes: { x: number; y: number }[][];
} {
  if (Array.isArray(poly)) return { exterior: poly, holes: [] };
  return { exterior: poly.exterior, holes: poly.holes || [] };
}

export function polygonsFromVector(data: VectorLayerData): OverlayPolygon[] {
  const out: OverlayPolygon[] = [];
  for (const feature of data.features) {
    if (feature.type !== "Polygon" && feature.type !== "MultiPolygon") continue;
    const parts = feature.parts?.length
      ? feature.parts
      : feature.rings?.length
        ? [feature.rings]
        : feature.coordinates.length
          ? [[feature.coordinates]]
          : [];
    for (const part of parts) {
      if (!part.length) continue;
      out.push({ exterior: part[0], holes: part.slice(1) });
    }
  }
  return out;
}
