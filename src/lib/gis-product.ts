import { overlayDecision, parseEpsg, type CrsInfo } from "./map/crs.ts";

export const GIS_PRODUCT_NAME = "G-AID documented GeoJSON vector layer";
export const GIS_SUPPORTED_FORMAT = "GeoJSON Feature/FeatureCollection with documented EPSG";

export const GIS_STATEMENTS = [
  "Product: G-AID documented GeoJSON vector layer. Geometry and attributes are source information, not an AI-confirmed interpretation.",
  "GeoJSON is the only supported vector ingest. Shapefile and GeoPackage stay recognised-unsupported (no geometry/attribute parser in this pack).",
  "Layer purpose (geology, structure, tenure, alteration, mine feature, sample location) is user-assigned. Filenames and field names do not establish geology or mineral meaning.",
  "Overlay and spatial-overlap queries require matching documented CRS. G-AID will not silently reproject.",
  "Spatial overlap is a geometric relationship table. It does not establish geological, mineral, or causal relationships.",
  "Buffer, clip, dissolve, reprojection, geoprocessing, and attribute editing are not registered capabilities.",
  "Mineral targets, prospectivity maps, resource/reserve claims, and drill recommendations are not established from overlays.",
];

export function gisLayerHeading(role?: string, reviewed?: boolean): string {
  if (reviewed && role && role !== "generic-vector") {
    return `Vector layer (user-assigned ${role}; source information, not an interpretation)`;
  }
  return "Vector layer (generic; role unassigned)";
}

export function gisProductWarnings(opts: {
  path?: string;
  role?: string;
  roleReviewed?: boolean;
  crs?: string;
  overlapComputed?: boolean;
}): string[] {
  const warnings = [
    "This layer is source geometry and attributes. It is not an AI-confirmed geological interpretation.",
    "Attribute names have unknown semantics unless the user supplied meaning.",
  ];
  if (!opts.roleReviewed) {
    warnings.push("Layer purpose is unassigned. Geology/tenure/structure were not inferred from the filename.");
  } else if (opts.role) {
    warnings.push(`User-assigned role '${opts.role}' is a catalog label, not proof of ${opts.role}.`);
  }
  if (!opts.crs) {
    warnings.push("CRS is undocumented. Overlay and overlap queries are blocked.");
  }
  if (opts.overlapComputed) {
    warnings.push("Spatial overlap is geometric coincidence, not a joint geological or mineral interpretation.");
  }
  return warnings;
}

export interface VectorOverlapHit {
  leftPath: string;
  rightPath: string;
  leftId?: string;
  rightId?: string;
  relation: "intersects" | "contains" | "within" | "bbox-overlap";
  reason: string;
}

function crsInfoOf(crs?: CrsInfo | string): CrsInfo | undefined {
  if (!crs) return undefined;
  if (typeof crs === "string") {
    const epsg = parseEpsg(crs);
    return {
      key: epsg ? `EPSG:${epsg}` : crs,
      label: crs,
      source: "catalog",
      assumed: !epsg,
      epsg,
    };
  }
  return crs;
}

function bboxOverlap(
  a?: { minX: number; minY: number; maxX: number; maxY: number },
  b?: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  if (!a || !b) return false;
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * Same-CRS bbox overlap table. Matching CRS is required. No silent reprojection.
 * Not a blended geological proof overlay.
 */
export function layersOverlappingVectors(
  layers: Array<{
    path: string;
    label: string;
    formatId: string;
    bbox?: { minX: number; minY: number; maxX: number; maxY: number };
    crs?: CrsInfo | string;
    id?: string;
  }>
): VectorOverlapHit[] {
  const hits: VectorOverlapHit[] = [];
  for (let i = 0; i < layers.length; i++) {
    for (let j = i + 1; j < layers.length; j++) {
      const left = layers[i];
      const right = layers[j];
      const decision = overlayDecision(crsInfoOf(left.crs), crsInfoOf(right.crs));
      if (!decision.allowed) continue;
      if (!bboxOverlap(left.bbox, right.bbox)) continue;
      hits.push({
        leftPath: left.path,
        rightPath: right.path,
        leftId: left.id,
        rightId: right.id,
        relation: "bbox-overlap",
        reason: `${left.label} and ${right.label} share ${decision.message} Bounding boxes overlap. This is geometric coincidence, not a joint interpretation.`,
      });
    }
  }
  return hits;
}
