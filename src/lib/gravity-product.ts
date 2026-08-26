/** Honest gravity product names. Never label near-zone TC as Complete Bouguer. */

export const NEAR_ZONE_TERRAIN_CAPABILITY = "grav.terrain_near_zone" as const;
export const NEAR_ZONE_TERRAIN_STEP = "nearZoneTerrain" as const;

export const NEAR_ZONE_PRODUCT_NAME = "near-zone terrain-corrected Bouguer anomaly";
export const NEAR_ZONE_CSV = "near_zone_terrain_corrected_bouguer.csv";
export const NEAR_ZONE_GRID_STEM = "near_zone_terrain_corrected_bouguer_grid";
export const NEAR_ZONE_QC = "near_zone_terrain_corrected_bouguer_qc.json";
export const NEAR_ZONE_COLUMN = "near_zone_terrain_corrected_bouguer_mgal";
export const NEAR_ZONE_MAP_LABEL = "Near-zone terrain-corrected Bouguer (not complete Bouguer)";

export const NEAR_ZONE_STATEMENTS = [
  "Terrain correction is limited to the configured DEM extent or radius. Cells outside that window are ignored.",
  "Far-zone and intermediate-zone terrain effects are not included. Hayford–Bowie compartments are not implemented.",
  "This anomaly is not equivalent to a fully regional or commercial Complete Bouguer product.",
] as const;

export function isNearZoneTerrainPath(path: string): boolean {
  const n = path.replace(/\\/g, "/").toLowerCase();
  return n.includes("near_zone_terrain_corrected_bouguer");
}

export function isSimpleBouguerPath(path: string): boolean {
  const n = path.replace(/\\/g, "/").toLowerCase();
  if (isNearZoneTerrainPath(n)) return false;
  return /bouguer_grid|gravity_bouguer/.test(n) && !/complete_bouguer/.test(n);
}

export function gravityProductWarnings(options: {
  path: string;
  bullardB?: boolean;
  densityGcc?: number;
  terrainRadiusM?: number;
  useDemExtent?: boolean;
  demCellSizeM?: number;
  coverageFraction?: number;
  elevationDatum?: string;
}): string[] {
  const n = options.path.replace(/\\/g, "/").toLowerCase();
  if (!isNearZoneTerrainPath(n) && !/gravity_terrain|complete_bouguer/.test(n)) return [];
  const bullard =
    options.bullardB === true
      ? "Bullard B / spherical-cap curvature: applied (LaFehr 1991)."
      : "Bullard B / spherical-cap curvature: off unless requested.";
  const density =
    typeof options.densityGcc === "number"
      ? `Reduction density: ${options.densityGcc} g/cm³ (user-confirmed).`
      : "Reduction density: recorded on the frozen plan; never silently 2.67.";
  const radius = options.useDemExtent
    ? "Near-zone window: bound DEM extent (still not far-zone)."
    : typeof options.terrainRadiusM === "number"
      ? `Near-zone radius: ${options.terrainRadiusM} m.`
      : "Near-zone window: configured DEM radius or extent.";
  const dem =
    typeof options.demCellSizeM === "number"
      ? `DEM cell size: ${options.demCellSizeM} m.`
      : "DEM resolution is recorded in terrain QC.";
  const coverage =
    typeof options.coverageFraction === "number"
      ? `DEM coverage inside the near-zone window: ${(options.coverageFraction * 100).toFixed(1)}%.`
      : "DEM coverage is recorded in terrain QC (Proceed requires ≥ 95%).";
  const datum = options.elevationDatum
    ? `Vertical datum: ${options.elevationDatum}.`
    : "Vertical datum must be documented on stations and DEM.";
  return [
    `Product: ${NEAR_ZONE_PRODUCT_NAME}.`,
    ...NEAR_ZONE_STATEMENTS,
    bullard,
    density,
    radius,
    dem,
    coverage,
    datum,
  ];
}
