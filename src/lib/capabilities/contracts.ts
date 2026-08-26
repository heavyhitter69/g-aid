import type { CatalogRecord, ProjectCatalog } from "../catalog/types.ts";
import { findRecord } from "../catalog/summarize.ts";
import { expandCapabilityIds } from "./compile.ts";
import { isRegisteredCapability } from "./registry.ts";
import type { BoundInput, CompiledDag } from "./types.ts";

export interface ContractIssue {
  level: "blocker" | "warning" | "note";
  code: string;
  message: string;
}

function hasIAndD(parameters: { inclination?: number; declination?: number }): boolean {
  return typeof parameters.inclination === "number" && typeof parameters.declination === "number";
}

function boundSupported(inputs: BoundInput[], adapterId: string): BoundInput[] {
  return inputs.filter(
    (item) =>
      item.supportStatus === "supported" &&
      (item.adapterId === adapterId || item.kind === adapterId || (adapterId === "gsm19" && item.kind === "gsm19-base"))
  );
}

export function unsupportedBoundInputs(inputs: BoundInput[], catalog?: ProjectCatalog | null): BoundInput[] {
  return inputs.filter((item) => {
    if (item.supportStatus && item.supportStatus !== "supported") return true;
    if (!item.catalogId) return true;
    if (!catalog) return false;
    const record = findRecord(catalog, item.catalogId);
    if (!record) return true;
    return record.supportStatus !== "supported";
  });
}

export function validateCapabilityContracts(options: {
  capabilityIds: string[];
  inputs: BoundInput[];
  parameters: {
    inclination?: number;
    declination?: number;
    surveyDate?: string;
    baseReference?: string;
    density?: number;
    surveyLatitude?: number;
    elevationDatum?: string;
    gravityUnits?: string;
    applyBullardB?: boolean;
    columnMappingReviewed?: boolean;
    terrainRadiusM?: number;
    useDemExtent?: boolean;
  };
  catalog?: ProjectCatalog | null;
  dag?: CompiledDag | null;
}): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const ids = options.capabilityIds.filter(Boolean);
  const expanded = expandCapabilityIds(ids);
  for (const id of ids) {
    if (!isRegisteredCapability(id)) {
      issues.push({
        level: "blocker",
        code: "unregistered_capability",
        message: `${id} is not a registered capability. Seismic, GPR, radiometrics, GIS processing, and other unregistered packs are not in this release.`,
      });
    }
  }

  const bad = unsupportedBoundInputs(options.inputs, options.catalog);
  if (bad.length) {
    issues.push({
      level: "blocker",
      code: "unsupported_catalog_input",
      message:
        "Recognised-unsupported and unknown catalog records cannot bind to a capability.",
    });
  }

  const magarrow = boundSupported(options.inputs, "magarrow");
  const gsm19 = boundSupported(options.inputs, "gsm19");
  const needsRoverBase = expanded.includes("mag.diurnal");
  if (needsRoverBase && options.inputs.length) {
    if (magarrow.length === 0 && gsm19.length === 0) {
      issues.push({
        level: "blocker",
        code: "no_mag_files",
        message: "Diurnal correction needs supported MagArrow and GSM-19 catalog records. I will not search the folder by extension.",
      });
    } else if (magarrow.length === 0 || gsm19.length === 0) {
      issues.push({
        level: "blocker",
        code: "incomplete_mag",
        message:
          magarrow.length === 0
            ? "Diurnal correction needs MagArrow rover catalog records as well as the GSM-19 base."
            : "Diurnal correction needs GSM-19 base-station catalog records as well as MagArrow rover data.",
      });
    }
  }

  if (ids.includes("mag.rtp")) {
    const hasIgrf = ids.includes("mag.igrf");
    if (!hasIgrf && !hasIAndD(options.parameters)) {
      issues.push({
        level: "blocker",
        code: "rtp_needs_field_params",
        message:
          "RTP needs a valid grid plus inclination and declination, or mag.igrf as the documented source of those field parameters. I will not invent I/D or silently add IGRF.",
      });
    }
  }

  if (expanded.includes("mag.grid") && options.inputs.length && magarrow.length === 0) {
    issues.push({
      level: "blocker",
      code: "grid_needs_corrected_spatial",
      message: "Gridding needs diurnally corrected MagArrow spatial data. I will not grid raw or unsupported tables.",
    });
  }

  const gravityInputs = [
    ...boundSupported(options.inputs, "gravity-xyz"),
    ...boundSupported(options.inputs, "gravity-csv"),
  ];
  const needsGravity = expanded.some((id) => id.startsWith("grav."));
  if (needsGravity && options.inputs.length && gravityInputs.length === 0) {
    issues.push({
      level: "blocker",
      code: "no_gravity_files",
      message:
        "Gravity processing needs a supported gravity-contract catalog record (named X/Y/Gravity plus documented CRS and units). I will not take the first .xyz file.",
    });
  }

  if (expanded.includes("grav.bouguer")) {
    const density = options.parameters.density;
    if (typeof density !== "number" || !Number.isFinite(density)) {
      issues.push({
        level: "blocker",
        code: "density_required",
        message: "Bouguer correction needs a user density in g/cm³. I will not assume 2.67.",
      });
    }
  }

  if (expanded.includes("grav.freeair")) {
    const records = catalogRecordsForInputs(gravityInputs, options.catalog || null);
    const datum =
      options.parameters.elevationDatum ||
      records.find((record) => record.elevationDatum)?.elevationDatum;
    const hasElevation = records.some(
      (record) =>
        Boolean(record.columnMapping?.elevation) ||
        (record.columns || []).some((col) => /^(elevation|elev|height|z|h)$/i.test(col.trim()))
    );
    if (!hasElevation && records.length) {
      issues.push({
        level: "blocker",
        code: "elevation_required",
        message:
          "Free-air correction needs an elevation/height column. I will not invent station heights.",
      });
    }
    if (!datum) {
      issues.push({
        level: "blocker",
        code: "elevation_datum_required",
        message:
          "Free-air correction needs a documented elevation datum (orthometric or ellipsoidal). I will not assume one.",
      });
    }
    const geographic = records.some((record) => record.crs === "EPSG:4326" || /4326/.test(record.crs || ""));
    if (!geographic && typeof options.parameters.surveyLatitude !== "number") {
      const hasLatColumn = records.some((record) => record.columnMapping?.latitude);
      if (!hasLatColumn) {
        issues.push({
          level: "blocker",
          code: "latitude_required",
          message:
            "Somigliana normal gravity needs geodetic latitude. Supply surveyLatitude or a geographic CRS. Easting/northing is not latitude.",
        });
      }
    }
  }

  if (expanded.includes("grav.ingest") && gravityInputs.some((item) => item.adapterId === "gravity-csv")) {
    const records = catalogRecordsForInputs(gravityInputs, options.catalog || null);
    const unreviewed = records.filter((record) => {
      const mapping = record.columnMapping;
      if (!mapping || mapping.reviewed || options.parameters.columnMappingReviewed) return false;
      const canonical = mapping.x === "X" && mapping.y === "Y" && mapping.gObs === "Gravity";
      return !canonical;
    });
    if (unreviewed.length) {
      issues.push({
        level: "blocker",
        code: "mapping_review_required",
        message:
          "CSV column names differ from X, Y, Gravity. Confirm a column mapping before Proceed. I will not guess columns.",
      });
    }
  }

  if (expanded.includes("grav.bouguer") || expanded.includes("grav.terrain")) {
    const density = options.parameters.density;
    if (typeof density === "number" && Number.isFinite(density) && (density < 1.2 || density > 3.5)) {
      issues.push({
        level: "blocker",
        code: "density_range",
        message: `Density ${density} g/cm³ is outside the physical range 1.2–3.5. I will not assume 2.67.`,
      });
    }
  }

  if (expanded.includes("grav.terrain")) {
    issues.push(...terrainContractIssues(options, gravityInputs));
  }

  const ertInputs = [...boundSupported(options.inputs, "ert-dat"), ...boundSupported(options.inputs, "ert-csv")];
  const needsErt = expanded.some((id) => id.startsWith("ert."));
  if (needsErt && options.inputs.length && ertInputs.length === 0) {
    issues.push({
      level: "blocker",
      code: "no_ert_files",
      message:
        "ERT processing needs a supported ERT-contract catalog record (G-AID ERT 1.0 .dat or reviewed ERT CSV). I will not take the first .dat file.",
    });
  }
  if (expanded.includes("ert.gis")) {
    const records = catalogRecordsForInputs(ertInputs, options.catalog || null);
    const hasCrs = records.some((record) => record.crs) || ertInputs.some((item) => item.crs);
    if (ertInputs.length && !hasCrs) {
      issues.push({
        level: "blocker",
        code: "ert_crs_required",
        message: "ERT GIS export needs a documented EPSG. Section-only viewing does not invent a map CRS.",
      });
    }
  }
  if (expanded.includes("ert.invert2d")) {
    const records = catalogRecordsForInputs(ertInputs, options.catalog || null);
    const n = records.reduce((sum, record) => sum + (record.recordCount || 0), 0);
    if (records.length && n > 0 && n < 8) {
      issues.push({
        level: "blocker",
        code: "ert_too_few_measurements",
        message: "2-D inversion needs at least 8 measurements. A smaller set can still build a labelled pseudosection.",
      });
    }
  }

  return issues;
}

function epsgOf(crs?: string | null): number | undefined {
  const match = (crs || "").match(/(\d{4,6})/);
  return match ? parseInt(match[1], 10) : undefined;
}

function bboxContains(
  outer: { minX: number; minY: number; maxX: number; maxY: number },
  inner: { minX: number; minY: number; maxX: number; maxY: number }
): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY;
}

function terrainContractIssues(
  options: Parameters<typeof validateCapabilityContracts>[0],
  gravityInputs: BoundInput[]
): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const catalog = options.catalog || null;
  const boundDem = boundSupported(options.inputs, "dem-ascii");
  const catalogDemsAll = (catalog?.records || []).filter((record) => record.adapterId === "dem-ascii");
  const gravityDirs = gravityInputs.map((item) => {
    const rel = (item.path || "").replace(/\\/g, "/");
    const idx = rel.lastIndexOf("/");
    return idx >= 0 ? rel.slice(0, idx) : "";
  }).filter(Boolean);
  const catalogDems = gravityDirs.length
    ? catalogDemsAll.filter((record) => {
        const rel = record.relativePath.replace(/\\/g, "/");
        return gravityDirs.some((dir) => rel === dir || rel.startsWith(`${dir}/`));
      })
    : catalogDemsAll;
  const gravityRecords = catalogRecordsForInputs(gravityInputs, catalog);
  const stationEpsg =
    epsgOf(gravityRecords.find((record) => record.crs)?.crs) ||
    epsgOf(gravityInputs.find((item) => item.crs)?.crs);
  const stationDatum =
    options.parameters.elevationDatum ||
    gravityRecords.find((record) => record.elevationDatum)?.elevationDatum ||
    gravityInputs.find((item) => item.elevationDatum)?.elevationDatum;
  const stationBbox =
    gravityRecords.find((record) => record.bbox)?.bbox ||
    gravityInputs.find((item) => item.bbox)?.bbox;

  if (!boundDem.length) {
    const missingDatum = catalogDems.filter((record) => !record.elevationDatum);
    const crsMismatch = catalogDems.filter((record) => {
      const demEpsg = epsgOf(record.crs);
      return stationEpsg && demEpsg && demEpsg !== stationEpsg;
    });
    if (missingDatum.length) {
      issues.push({
        level: "blocker",
        code: "dem_no_vertical_datum",
        message:
          "Complete Bouguer needs a DEM vertical datum (orthometric or ellipsoidal). I will not assume one or download a DEM.",
      });
    } else if (crsMismatch.length) {
      issues.push({
        level: "blocker",
        code: "dem_incompatible_crs",
        message: `DEM CRS ${crsMismatch[0].crs} does not match station CRS EPSG:${stationEpsg}. I will not reproject silently.`,
      });
    } else {
      issues.push({
        level: "blocker",
        code: "no_dem",
        message:
          "Complete Bouguer needs a supported dem-ascii catalog record (EPSG, Units=m, ElevationDatum). I will not download or invent a DEM.",
      });
    }
    return issues;
  }

  const demRecords = catalogRecordsForInputs(boundDem, catalog);
  const dem = demRecords[0] || null;
  const demEpsg = epsgOf(dem?.crs) || epsgOf(boundDem[0]?.crs);
  const demDatum = dem?.elevationDatum || boundDem[0]?.elevationDatum;
  const demBbox = dem?.bbox || boundDem[0]?.bbox;
  const cell = dem?.cellSizeM || boundDem[0]?.cellSizeM;

  if (!demDatum) {
    issues.push({
      level: "blocker",
      code: "dem_no_vertical_datum",
      message:
        "Complete Bouguer needs a DEM vertical datum (orthometric or ellipsoidal). I will not assume one.",
    });
  } else if (stationDatum && demDatum !== stationDatum) {
    issues.push({
      level: "blocker",
      code: "dem_datum_mismatch",
      message: `DEM vertical datum ${demDatum} does not match station datum ${stationDatum}.`,
    });
  }

  if (stationEpsg && demEpsg && stationEpsg !== demEpsg) {
    issues.push({
      level: "blocker",
      code: "dem_incompatible_crs",
      message: `DEM EPSG:${demEpsg} does not match station EPSG:${stationEpsg}. I will not reproject silently.`,
    });
  }

  const useExtent = Boolean(options.parameters.useDemExtent);
  const radius = options.parameters.terrainRadiusM;
  if (!useExtent && !(typeof radius === "number" && Number.isFinite(radius) && radius > 0)) {
    issues.push({
      level: "blocker",
      code: "terrain_radius_required",
      message:
        "Complete Bouguer needs a near-zone terrain radius in metres, or an explicit request to use the DEM extent. Far-zone is not implemented.",
    });
  }

  if (typeof cell === "number" && cell <= 0) {
    issues.push({
      level: "blocker",
      code: "dem_resolution_invalid",
      message: "DEM cell size must be a positive length in metres.",
    });
  }

  if (stationBbox && demBbox) {
    const pad = useExtent ? 0 : typeof radius === "number" && Number.isFinite(radius) ? radius : 0;
    const needed = {
      minX: stationBbox.minX - pad,
      minY: stationBbox.minY - pad,
      maxX: stationBbox.maxX + pad,
      maxY: stationBbox.maxY + pad,
    };
    if (!bboxContains(demBbox, useExtent ? stationBbox : needed)) {
      issues.push({
        level: "blocker",
        code: "dem_insufficient_coverage",
        message:
          "DEM extent does not cover the gravity stations plus the near-zone radius. I will not invent terrain outside the grid.",
      });
    }
  }

  return issues;
}

export function catalogRecordsForInputs(inputs: BoundInput[], catalog: ProjectCatalog | null): CatalogRecord[] {
  if (!catalog) return [];
  return inputs
    .map((item) => findRecord(catalog, item.catalogId))
    .filter((record): record is CatalogRecord => Boolean(record));
}

export type { UserCapabilityId };
