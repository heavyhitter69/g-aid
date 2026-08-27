/**
 * Documented GeoJSON vector contract.
 * RFC 7946 default CRS84 is not treated as a documented CRS.
 * Layer purpose is never inferred from filename or field names.
 */

import { parseEpsg } from "../map/crs.ts";

export const GEOJSON_ADAPTER_ID = "geojson";
export const GEOJSON_FORMAT = "geojson";

export const VECTOR_ROLES = [
  "geology",
  "structure",
  "tenure",
  "alteration",
  "mine-feature",
  "sample-location",
  "generic-vector",
] as const;

export type VectorRoleId = (typeof VECTOR_ROLES)[number];

export interface VectorRoleAssignment {
  role: VectorRoleId;
  reviewed: boolean;
  reviewedAt?: string;
  source: "user-assigned" | "unassigned";
}

export const UNASSIGNED_VECTOR_ROLE: VectorRoleAssignment = {
  role: "generic-vector",
  reviewed: false,
  source: "unassigned",
};

export interface VectorAttribute {
  name: string;
  semantics: "unknown";
}

export interface GeojsonInspect {
  looksLikeGeojson: boolean;
  geometryTypes: string[];
  featureCount: number;
  validFeatureCount: number;
  attributeNames: string[];
  bbox?: { minX: number; minY: number; maxX: number; maxY: number };
  crs?: string;
  crsSource?: "geojson-crs" | "companion-prj" | "epsg-comment" | "user-confirmed";
  locationQuality: "documented" | "user-confirmed" | "missing";
  errors: string[];
  warnings: string[];
}

const TYPE_RE = /"type"\s*:/;
const GEOM_RE = /FeatureCollection|Feature|Point|LineString|Polygon|MultiPoint|MultiLineString|MultiPolygon|GeometryCollection/;

export function looksLikeGeojsonText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  if (!TYPE_RE.test(trimmed)) return false;
  return GEOM_RE.test(trimmed);
}

function asCoord(pair: unknown): { x: number; y: number } | null {
  if (!Array.isArray(pair) || pair.length < 2) return null;
  const x = Number(pair[0]);
  const y = Number(pair[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function ringClosed(pts: { x: number; y: number }[]): boolean {
  if (pts.length < 4) return false;
  const a = pts[0];
  const b = pts[pts.length - 1];
  return a.x === b.x && a.y === b.y;
}

function linePts(coords: unknown): { x: number; y: number }[] {
  if (!Array.isArray(coords)) return [];
  const pts: { x: number; y: number }[] = [];
  for (const item of coords) {
    const p = asCoord(item);
    if (p) pts.push(p);
  }
  return pts;
}

function expandBbox(bbox: { minX: number; minY: number; maxX: number; maxY: number } | undefined, pts: { x: number; y: number }[]) {
  let next = bbox;
  for (const p of pts) {
    if (!next) next = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
    else {
      next.minX = Math.min(next.minX, p.x);
      next.minY = Math.min(next.minY, p.y);
      next.maxX = Math.max(next.maxX, p.x);
      next.maxY = Math.max(next.maxY, p.y);
    }
  }
  return next;
}

function validateGeometry(
  geom: { type?: string; coordinates?: unknown; geometries?: unknown } | null,
  errors: string[],
  types: Set<string>
): { ok: boolean; pts: { x: number; y: number }[] } {
  if (!geom || typeof geom !== "object" || !geom.type) {
    errors.push("Feature is missing a geometry object.");
    return { ok: false, pts: [] };
  }
  const type = geom.type;
  types.add(type);
  if (type === "GeometryCollection" && Array.isArray(geom.geometries)) {
    let ok = false;
    const pts: { x: number; y: number }[] = [];
    for (const child of geom.geometries) {
      const nested = validateGeometry(child as { type?: string; coordinates?: unknown }, errors, types);
      if (nested.ok) {
        ok = true;
        pts.push(...nested.pts);
      }
    }
    if (!ok) errors.push("GeometryCollection has no valid member geometries.");
    return { ok, pts };
  }
  const coordinates = geom.coordinates;
  if (type === "Point") {
    const p = asCoord(coordinates);
    if (!p) {
      errors.push("Point coordinates are missing or not finite.");
      return { ok: false, pts: [] };
    }
    return { ok: true, pts: [p] };
  }
  if (type === "MultiPoint" && Array.isArray(coordinates)) {
    const pts = coordinates.map(asCoord).filter((p): p is { x: number; y: number } => Boolean(p));
    if (!pts.length) {
      errors.push("MultiPoint has no finite coordinates.");
      return { ok: false, pts: [] };
    }
    return { ok: true, pts };
  }
  if (type === "LineString") {
    const pts = linePts(coordinates);
    if (pts.length < 2) {
      errors.push("LineString needs at least two finite positions.");
      return { ok: false, pts: [] };
    }
    return { ok: true, pts };
  }
  if (type === "MultiLineString" && Array.isArray(coordinates)) {
    const pts: { x: number; y: number }[] = [];
    let ok = false;
    for (const line of coordinates) {
      const linePtsVal = linePts(line);
      if (linePtsVal.length >= 2) {
        ok = true;
        pts.push(...linePtsVal);
      }
    }
    if (!ok) errors.push("MultiLineString has no valid line with two finite positions.");
    return { ok, pts };
  }
  if (type === "Polygon" && Array.isArray(coordinates)) {
    const ring = linePts(coordinates[0]);
    if (ring.length < 4 || !ringClosed(ring)) {
      errors.push("Polygon exterior ring must be closed with at least four finite positions.");
      return { ok: false, pts: [] };
    }
    return { ok: true, pts: ring };
  }
  if (type === "MultiPolygon" && Array.isArray(coordinates)) {
    const pts: { x: number; y: number }[] = [];
    let ok = false;
    for (const poly of coordinates) {
      if (!Array.isArray(poly)) continue;
      const ring = linePts(poly[0]);
      if (ring.length >= 4 && ringClosed(ring)) {
        ok = true;
        pts.push(...ring);
      }
    }
    if (!ok) errors.push("MultiPolygon has no valid closed exterior ring.");
    return { ok, pts };
  }
  errors.push(`Geometry type ${type} is not a supported GeoJSON processing geometry.`);
  return { ok: false, pts: [] };
}

function crsFromObject(obj: unknown): { crs?: string; source?: GeojsonInspect["crsSource"] } {
  if (!obj || typeof obj !== "object") return {};
  const rec = obj as { crs?: { properties?: { name?: string } }; properties?: Record<string, unknown> };
  const name = rec.crs?.properties?.name;
  const fromMember = parseEpsg(name);
  if (fromMember) return { crs: `EPSG:${fromMember}`, source: "geojson-crs" };
  const fromProp = parseEpsg(String(rec.properties?.EPSG || rec.properties?.crs || rec.properties?.CRS || ""));
  if (fromProp) return { crs: `EPSG:${fromProp}`, source: "epsg-comment" };
  return {};
}

function epsgFromText(text: string): string | undefined {
  const match = text.match(/\/\s*EPSG\s*=\s*(\d{4,6})/i) || text.match(/EPSG[:\s]+(\d{4,6})/i);
  return match ? `EPSG:${match[1]}` : undefined;
}

export function inspectGeojsonText(
  text: string,
  extras?: { companionPrjText?: string; filename?: string }
): GeojsonInspect {
  const errors: string[] = [];
  const warnings: string[] = [];
  const looks = looksLikeGeojsonText(text);
  const empty: GeojsonInspect = {
    looksLikeGeojson: looks,
    geometryTypes: [],
    featureCount: 0,
    validFeatureCount: 0,
    attributeNames: [],
    locationQuality: "missing",
    errors,
    warnings,
  };
  if (!looks) return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    errors.push("GeoJSON text is not valid JSON.");
    return empty;
  }
  if (!parsed || typeof parsed !== "object") {
    errors.push("GeoJSON root is not an object.");
    return empty;
  }

  const obj = parsed as {
    type?: string;
    features?: unknown[];
    geometry?: { type?: string; coordinates?: unknown };
    properties?: Record<string, unknown>;
    id?: unknown;
  };

  const features: Array<{
    geometry?: { type?: string; coordinates?: unknown; geometries?: unknown };
    properties?: Record<string, unknown>;
    id?: unknown;
    type?: string;
    coordinates?: unknown;
  }> = [];
  if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
    for (const item of obj.features) {
      if (item && typeof item === "object") features.push(item as (typeof features)[0]);
    }
  } else if (obj.type === "Feature") {
    features.push(obj);
  } else if (obj.type && obj.coordinates) {
    features.push({ type: "Feature", geometry: obj as { type?: string; coordinates?: unknown }, properties: {} });
  } else {
    errors.push("Root must be a FeatureCollection, Feature, or geometry object.");
    return { ...empty, errors };
  }

  const types = new Set<string>();
  const attr = new Set<string>();
  let bbox: GeojsonInspect["bbox"];
  let valid = 0;
  for (const feature of features) {
    const geom = feature.geometry || (feature.type && feature.coordinates ? feature : undefined);
    const result = validateGeometry(geom || null, errors, types);
    if (result.ok) {
      valid += 1;
      bbox = expandBbox(bbox, result.pts);
    }
    const props = feature.properties;
    if (props && typeof props === "object") {
      for (const key of Object.keys(props)) attr.add(key);
    }
  }

  if (!features.length) errors.push("GeoJSON has no features.");
  if (features.length && valid === 0) errors.push("No valid geometries after coordinate and ring checks.");

  let crsInfo = crsFromObject(parsed);
  if (!crsInfo.crs) {
    const comment = epsgFromText(text.slice(0, 2000));
    if (comment) crsInfo = { crs: comment, source: "epsg-comment" };
  }
  if (!crsInfo.crs && extras?.companionPrjText) {
    const epsg = parseEpsg(extras.companionPrjText);
    if (epsg) crsInfo = { crs: `EPSG:${epsg}`, source: "companion-prj" };
    else warnings.push("Companion .prj has no EPSG authority. Overlay is blocked until CRS is documented.");
  }
  if (!crsInfo.crs) {
    warnings.push("No documented EPSG. RFC 7946 lon/lat is not assumed. Overlay and processing stay blocked.");
  }
  warnings.push("Attribute names have unknown semantics. Geology, tenure, alteration, and sample meaning are not inferred from field names or filenames.");
  void extras?.filename;

  const uniqueErrors = [...new Set(errors)];
  return {
    looksLikeGeojson: true,
    geometryTypes: [...types],
    featureCount: features.length,
    validFeatureCount: valid,
    attributeNames: [...attr],
    bbox,
    crs: crsInfo.crs,
    crsSource: crsInfo.source,
    locationQuality: crsInfo.crs ? "documented" : "missing",
    errors: uniqueErrors,
    warnings: [...new Set(warnings)],
  };
}

export function geojsonReadyForSupport(inspected: GeojsonInspect): boolean {
  return (
    inspected.looksLikeGeojson &&
    inspected.validFeatureCount > 0 &&
    Boolean(inspected.crs) &&
    inspected.locationQuality !== "missing" &&
    inspected.errors.length === 0
  );
}

export function roleFromFilenameNever(filename: string): VectorRoleId {
  void filename;
  return "generic-vector";
}
