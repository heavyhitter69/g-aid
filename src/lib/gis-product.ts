import { crsFromCatalog, overlayDecision, type CrsInfo } from "./map/crs.ts";

export const GIS_PRODUCT_NAME = "G-AID documented GIS vector layer";
export const GIS_SUPPORTED_FORMAT =
  "RFC 7946 GeoJSON (OGC:CRS84), legacy-GeoJSON with a validated CRS mapping, a G-AID custom import (.prj / EPSG=), or a documented ESRI shapefile (.shp/.shx/.dbf with .prj EPSG)";

export const GIS_STATEMENTS = [
  "Product: G-AID documented GIS vector layer. Geometry and attributes are source information, not an AI-confirmed interpretation.",
  "RFC 7946 GeoJSON with no crs member is documented OGC:CRS84 (WGS 84 longitude-latitude degrees). It is not EPSG:4326.",
  "A legacy GeoJSON crs member is not RFC 7946. Projected files with .prj or / EPSG= are a G-AID custom import contract.",
  "Supported vector ingest is documented GeoJSON and parsed ESRI shapefile (.shp/.shx/.dbf with .prj EPSG). GeoPackage stays recognised-unsupported.",
  "Shapefile sidecar names alone are not support. Geometry records, DBF attributes, encoding, and CRS must parse.",
  "Layer purpose (geology, structure, tenure, alteration, mine feature, sample location) is user-assigned. Filenames and field names do not establish geology or mineral meaning.",
  "Overlay and spatial-overlap queries require documented CRS compatibility. G-AID will not silently reproject or swap axes.",
  "Spatial overlap is a geometric relationship table using even-odd filled topology (exterior minus holes). A point in a hole is not contained. It does not establish geological, mineral, or causal relationships.",
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
  geojsonContract?: string;
  crsSource?: string;
  crsConfidence?: string;
  axisOrder?: string;
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
  } else if (opts.crs === "OGC:CRS84") {
    warnings.push("CRS is OGC:CRS84 (lon, lat degrees). This is not EPSG:4326 and was not reprojected.");
  } else if (opts.geojsonContract === "legacy-geojson") {
    warnings.push("This is legacy-GeoJSON. The crs member is not the RFC 7946 CRS mechanism.");
  } else if (opts.geojsonContract === "g-aid-custom-import") {
    warnings.push("This is a G-AID custom import contract, not standard RFC 7946 GeoJSON.");
  } else if (opts.crsSource === "shapefile-prj") {
    warnings.push(
      `CRS is from shapefile .prj (${opts.crs}${opts.crsConfidence ? `, confidence ${opts.crsConfidence}` : ""}). Coordinates were not reprojected.`
    );
  }
  if (opts.crs === "EPSG:4326") {
    warnings.push("EPSG:4326 OGC axis order is lat-lon. GeoJSON coordinates remain [lon, lat]. G-AID will not silently swap axes.");
  }
  if (opts.overlapComputed) {
    warnings.push("Spatial overlap is geometric coincidence using filled topology (exterior minus holes), not a joint geological or mineral interpretation.");
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

function crsInfoOf(
  crs?: CrsInfo | string,
  extras?: { geojsonContract?: CrsInfo["geojsonContract"]; coordinateOrder?: CrsInfo["coordinateOrder"] }
): CrsInfo | undefined {
  if (!crs) return undefined;
  if (typeof crs === "string") {
    return crsFromCatalog(crs, {
      source: "catalog",
      geojsonContract: extras?.geojsonContract,
      coordinateOrder: extras?.coordinateOrder,
    });
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
    geojsonContract?: CrsInfo["geojsonContract"];
    coordinateOrder?: CrsInfo["coordinateOrder"];
  }>
): VectorOverlapHit[] {
  const hits: VectorOverlapHit[] = [];
  for (let i = 0; i < layers.length; i++) {
    for (let j = i + 1; j < layers.length; j++) {
      const left = layers[i];
      const right = layers[j];
      const decision = overlayDecision(
        crsInfoOf(left.crs, { geojsonContract: left.geojsonContract, coordinateOrder: left.coordinateOrder }),
        crsInfoOf(right.crs, { geojsonContract: right.geojsonContract, coordinateOrder: right.coordinateOrder })
      );
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
