import { overlayDecision, parseEpsg, type CrsInfo } from "./map/crs.ts";

export const BOREHOLE_PRODUCT_NAME = "G-AID LAS 2.0 measured-depth log";
export const BOREHOLE_COLLAR_LABEL = "Borehole collar (documented CRS)";
export const LAS_SUPPORTED_STANDARD = "CWLS LAS 2.0 WRAP.NO";

export const BOREHOLE_STATEMENTS = [
  "Product: G-AID LAS 2.0 measured-depth log. Measured depth is not true vertical depth or a spatial trajectory.",
  "CWLS LAS 2.0 WRAP.NO is the only supported well-log ingest. WRAP.YES and LAS 3.0 stay recognised-unsupported.",
  "LASF / LAZ LiDAR point clouds are not well logs.",
  "Unknown curve mnemonics are stored with unknown semantics. GR, resistivity, density, gamma, or sonic names are not lithology, water, ore, or reservoir.",
  "A collar is mapped only when coordinates and a documented or user-confirmed CRS exist. Vertical logs without location are viewable and are not given a fabricated map position.",
  "Deviation surveys and directional well paths are not computed.",
  "Automatic lithology classification, aquifer identification, mineralisation claims, correlations, resource estimation, and drill targeting are not registered capabilities.",
];

export function boreholeLogHeading(depthReference?: string): string {
  if (depthReference && /true vertical|tvd/i.test(depthReference)) {
    return "Measured-depth log (TVD was not computed)";
  }
  return "Borehole log (measured depth, not TVD or trajectory)";
}

export function boreholeProductWarnings(opts: {
  path?: string;
  depthReference?: string;
  collarMapped?: boolean;
  crs?: string;
  trajectoryComputed?: boolean;
}): string[] {
  const warnings = [
    "Depth is measured depth. It is not true vertical depth unless a validated survey contract exists (it does not).",
    "Curve mnemonics do not establish lithology, water, ore, or reservoir.",
  ];
  if (opts.trajectoryComputed) {
    warnings.push("A well trajectory was not supposed to be computed. Treat any path display as invalid.");
  }
  if (opts.collarMapped === false) {
    warnings.push("No map collar: coordinates and CRS were not both documented or user-confirmed.");
  }
  if (opts.path && /collar/i.test(opts.path) && !opts.crs) {
    warnings.push("Collar GeoJSON without a documented CRS must not be treated as a map position.");
  }
  return warnings;
}

export interface CollarOverlapHit {
  path: string;
  label: string;
  formatId: string;
  reason: string;
}

/**
 * List map layers whose bbox contains the collar when CRS keys match.
 * Matching CRS is required. No silent reprojection. Not a blended proof overlay.
 */
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

export function layersOverlappingCollar(
  layers: Array<{
    path: string;
    label: string;
    formatId: string;
    bbox?: { minX: number; minY: number; maxX: number; maxY: number };
    crs?: CrsInfo | string;
  }>,
  collar: { x: number; y: number; crs?: string }
): CollarOverlapHit[] {
  const collarEpsg = parseEpsg(collar.crs);
  if (!collarEpsg || !Number.isFinite(collar.x) || !Number.isFinite(collar.y)) return [];
  const collarCrs: CrsInfo = {
    key: `EPSG:${collarEpsg}`,
    label: `EPSG:${collarEpsg}`,
    source: "geojson",
    assumed: false,
    epsg: collarEpsg,
  };
  const hits: CollarOverlapHit[] = [];
  for (const layer of layers) {
    if (/borehole_collar/i.test(layer.path || "")) continue;
    if (!layer.bbox) continue;
    const layerCrs = crsInfoOf(layer.crs);
    const decision = overlayDecision(collarCrs, layerCrs);
    if (!decision.allowed) continue;
    const layerEpsg = layerCrs?.epsg || parseEpsg(layerCrs?.key);
    if (layerEpsg && layerEpsg !== collarEpsg) continue;
    const { minX, minY, maxX, maxY } = layer.bbox;
    if (collar.x >= minX && collar.x <= maxX && collar.y >= minY && collar.y <= maxY) {
      hits.push({
        path: layer.path,
        label: layer.label,
        formatId: layer.formatId,
        reason: `Collar EPSG:${collarEpsg} point lies inside this layer bbox. Overlay is geometric coincidence, not a joint interpretation.`,
      });
    }
  }
  return hits;
}
