/** Honest gravity product names. The partial zoned planar product never uses the phrase Complete Bouguer. */

export const NEAR_ZONE_TERRAIN_CAPABILITY = "grav.terrain_near_zone" as const;
export const INTERMEDIATE_ZONE_TERRAIN_CAPABILITY = "grav.terrain_intermediate_zone" as const;
export const FAR_ZONE_TERRAIN_CAPABILITY = "grav.terrain_far_zone" as const;
export const NEAR_ZONE_TERRAIN_STEP = "nearZoneTerrain" as const;
export const INTERMEDIATE_ZONE_TERRAIN_STEP = "intermediateZoneTerrain" as const;
export const FAR_ZONE_TERRAIN_STEP = "farZoneTerrain" as const;
export const HAYFORD_BOWIE_OUTER_M = 166700;

export const NEAR_ZONE_PRODUCT_NAME = "near-zone terrain-corrected Bouguer anomaly";
export const ZONED_PLANAR_PRODUCT_NAME = "zoned planar terrain-corrected Bouguer anomaly";
export const NEAR_ZONE_CSV = "near_zone_terrain_corrected_bouguer.csv";
export const NEAR_ZONE_GRID_STEM = "near_zone_terrain_corrected_bouguer_grid";
export const NEAR_ZONE_QC = "near_zone_terrain_corrected_bouguer_qc.json";
export const NEAR_ZONE_COLUMN = "near_zone_terrain_corrected_bouguer_mgal";
export const NEAR_ZONE_MAP_LABEL = "Near-zone terrain-corrected Bouguer";
export const ZONED_PLANAR_MAP_LABEL = "Zoned planar terrain-corrected Bouguer";

export const TERRAIN_EXCLUSIONS = [
  "spherical far-zone treatment",
  "Hayford–Bowie or equivalent compartment geometry",
  "global or otherwise adequate terrain coverage (no ETOPO/SRTM download)",
  "atmospheric correction (not implemented)",
  "isostatic compensation",
  "DEM uncertainty and near-station survey detail finer than the bound DEM",
] as const;

export const COMPLETE_BOUGUER_REFUSAL =
  "Complete Bouguer Anomaly is not supported. G-AID does not implement the required full convention and coverage: spherical far-zone treatment, Hayford–Bowie or equivalent geometry, global/adequate terrain coverage, and atmospheric correction are missing, along with isostatic compensation and DEM-uncertainty treatment. I will not grant or execute near/intermediate/far planar terrain capabilities under a Complete Bouguer request. Alternative implementation plan: zoned planar terrain-corrected Bouguer anomaly. Review that named plan and explicitly approve it before any terrain-correction capability is enabled.";

export const ZONED_PLANAR_OFFER =
  "Offered alternative implementation plan: zoned planar terrain-corrected Bouguer anomaly. Terrain-correction capabilities stay off until you explicitly approve that named plan.";

export const NEAR_ZONE_STATEMENTS = [
  "Terrain correction is limited to the configured DEM extent or radius. Cells outside that window are ignored.",
  "Far-zone and intermediate-zone terrain effects are not included. Hayford–Bowie compartments are not implemented.",
  "Spherical far-zone treatment, global terrain coverage, and atmospheric correction are excluded.",
] as const;

export const ZONED_TERRAIN_STATEMENTS = [
  "Intermediate-zone terrain is planar Nagy on the bound DEM, clipped to DEM coverage. Hayford–Bowie compartments are not implemented.",
  "Far-zone terrain is applied only when a bound DEM covers the requested radius beyond 166.7 km. G-AID does not download ETOPO/SRTM.",
  "Spherical far-zone treatment, atmospheric correction, and global terrain coverage are excluded.",
] as const;

export function isCompleteBouguerRequest(message: string): boolean {
  const m = message.toLowerCase();
  return (
    /\bcomplete\s+bouguer\b/.test(m) &&
    !/\b(skip|omit|without|no)\b.{0,40}\b(terrain|complete bouguer)\b/.test(m)
  );
}

export function isZonedPlanarApproval(message: string, offered = false): boolean {
  const m = message.toLowerCase();
  if (/\b(skip|omit|without|no|don't|dont|do not|reject|refuse)\b.{0,40}\bzoned planar\b/.test(m)) {
    return false;
  }
  if (/\bzoned planar terrain-corrected bouguer(?: anomaly)?\b/.test(m)) return true;
  if (/\b(approve|accept|confirm|run|use|enable)\b.{0,80}\bzoned planar\b/.test(m)) return true;
  if (offered && /\b(approve|accept|confirm|run)\b.{0,40}\b(the )?alternative\b/.test(m)) return true;
  return false;
}

export function terrainProductName(zoned: boolean): string {
  return zoned ? ZONED_PLANAR_PRODUCT_NAME : NEAR_ZONE_PRODUCT_NAME;
}

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
  intermediateZone?: boolean;
  farZone?: boolean;
  intermediateReason?: string;
  farReason?: string;
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
  const zoned = options.intermediateZone === true || options.farZone === true;
  const zoneLines = zoned
    ? [
        options.intermediateZone
          ? options.intermediateReason || ZONED_TERRAIN_STATEMENTS[0]
          : "Intermediate-zone terrain was not applied (incomplete DEM coverage or not requested).",
        options.farZone
          ? options.farReason || ZONED_TERRAIN_STATEMENTS[1]
          : "Far-zone terrain was not applied. Missing global DEM coverage is not a silent pass.",
        ZONED_TERRAIN_STATEMENTS[2],
      ]
    : [...NEAR_ZONE_STATEMENTS];
  const product = zoned ? `Product: ${ZONED_PLANAR_PRODUCT_NAME}.` : `Product: ${NEAR_ZONE_PRODUCT_NAME}.`;
  return [product, ...zoneLines, bullard, density, radius, dem, coverage, datum];
}
