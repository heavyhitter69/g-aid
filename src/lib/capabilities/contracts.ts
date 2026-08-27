import type { CatalogRecord, ProjectCatalog } from "../catalog/types.ts";
import { findRecord } from "../catalog/summarize.ts";
import { GPR_MIGRATION_BENCHMARK_PASSED, resolveGprBandpass } from "../gpr-product.ts";
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
    applyIntermediateZone?: boolean;
    applyFarZone?: boolean;
    intermediateRadiusM?: number;
    farRadiusM?: number;
    outerCellSizeM?: number;
    radioMapping?: {
      x: string;
      y: string;
      line: string;
      k?: string;
      eu?: string;
      eth?: string;
      tc?: string;
      reviewed: boolean;
    };
    geochemMapping?: {
      sampleId: string;
      x: string;
      y: string;
      medium?: string;
      elements: Array<{ column: string; symbol: string; units: string }>;
      reviewed: boolean;
    };
    displayTransform?: string;
    displayTransformApproved?: boolean;
    approved?: boolean;
    velocityMs?: number;
    fLowHz?: number;
    fHighHz?: number;
    applyBandpass?: boolean;
    collarCrsConfirmed?: boolean;
    selectedCurves?: string;
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
        message: `${id} is not a registered capability. Seismic, GIS processing, and other unregistered packs are not in this release. Height correction, stripping, NASVD, and concentration conversion are not live radiometric capabilities.`,
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

  if (expanded.includes("grav.bouguer") || expanded.includes("grav.terrain_near_zone")) {
    const density = options.parameters.density;
    if (typeof density === "number" && Number.isFinite(density) && (density < 1.2 || density > 3.5)) {
      issues.push({
        level: "blocker",
        code: "density_range",
        message: `Density ${density} g/cm³ is outside the physical range 1.2–3.5. I will not assume 2.67.`,
      });
    }
  }

  if (expanded.includes("grav.terrain_near_zone")) {
    issues.push(...terrainContractIssues(options, gravityInputs));
  }
  if (expanded.includes("grav.terrain_intermediate_zone") || expanded.includes("grav.terrain_far_zone")) {
    issues.push(...outerZoneContractIssues(options, gravityInputs));
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
        message:
          "Experimental 2-D inversion needs at least 8 measurements. A smaller set can still build a labelled pseudosection. Invert is not in the default ERT workflow.",
      });
    }
  }

  const radioInputs = [
    ...boundSupported(options.inputs, "radiometric-csv"),
    ...boundSupported(options.inputs, "radiometric-xyz"),
  ];
  const needsRadio = expanded.some((id) => id.startsWith("rad."));
  if (needsRadio && options.inputs.length && radioInputs.length === 0) {
    issues.push({
      level: "blocker",
      code: "no_radio_files",
      message:
        "Radiometric processing needs a supported RAD-contract catalog record (documented already-corrected K/eU/eTh/TC). Assay tables and raw spectrometer files are not processing inputs.",
    });
  }
  if (needsRadio && radioInputs.length) {
    const records = catalogRecordsForInputs(radioInputs, options.catalog || null);
    const unreviewed = records.filter((record) => {
      const mapping = record.radioMapping || options.parameters.radioMapping;
      if (!mapping || mapping.reviewed || options.parameters.columnMappingReviewed) return false;
      const canonical =
        mapping.x === "X" &&
        mapping.y === "Y" &&
        mapping.line === "Line" &&
        (!mapping.k || mapping.k === "K") &&
        (!mapping.eu || mapping.eu === "eU") &&
        (!mapping.eth || mapping.eth === "eTh") &&
        (!mapping.tc || mapping.tc === "TC");
      return !canonical;
    });
    if (unreviewed.length) {
      issues.push({
        level: "blocker",
        code: "mapping_review_required",
        message:
          "Radiometric column names differ from X, Y, Line, K, eU, eTh, TC. Confirm a column mapping before Proceed. I will not guess columns.",
      });
    }
    if (expanded.includes("rad.ternary") || expanded.includes("rad.ratios")) {
      const quantity = records.find((record) => record.radioQuantity)?.radioQuantity;
      const mapping = records.find((record) => record.radioMapping)?.radioMapping;
      const hasKuth = Boolean(mapping?.k && mapping?.eu && mapping?.eth);
      const unitsBlob = records.map((record) => record.units || "").join(" ");
      const unitsMissing = records.some((record) => !record.units || /unknown/i.test(record.units));
      if (quantity && quantity !== "concentration") {
        issues.push({
          level: "warning",
          code: "ternary_not_justified",
          message:
            "Ternary K-eTh-eU display and concentration ratios need Quantity=concentration. Count-rate ternary/ratios will be skipped. I will not treat cps as concentrations.",
        });
      } else if (mapping && !hasKuth) {
        issues.push({
          level: "warning",
          code: "ternary_not_justified",
          message:
            "Ternary and ratios need concentration K, eU, and eTh. Incomplete channel sets skip those products. I will not invent a missing window.",
        });
      } else if (
        records.length &&
        (unitsMissing || (hasKuth && (!/%/.test(unitsBlob) || !/ppm/i.test(unitsBlob))))
      ) {
        issues.push({
          level: "warning",
          code: "radio_units_unknown",
          message:
            "Radiometric quantity/units are missing from the catalog record. Unit-specific legend, ternary, ratios, and interpretation claims are blocked until metadata is documented. I will not infer %K or cps from filenames.",
        });
      }
    }
  }

  const gprInputs = boundSupported(options.inputs, "gpr-csv");
  const needsGpr = expanded.some((id) => id.startsWith("gpr."));
  if (needsGpr && options.inputs.length && gprInputs.length === 0) {
    issues.push({
      level: "blocker",
      code: "no_gpr_files",
      message:
        "GPR processing needs a supported G-AID GPR 1.0 catalog record (Units, dt_ns, dx_m, AntennaMHz, Trace/Sample/Amplitude). An arbitrary .dzt file is not a processing input.",
    });
  }
  if (expanded.includes("gpr.process") && gprInputs.length) {
    const records = catalogRecordsForInputs(gprInputs, options.catalog || null);
    const dtNs =
      records.find((record) => typeof record.dtNs === "number")?.dtNs ||
      gprInputs.find((item) => typeof item.dtNs === "number")?.dtNs;
    const antennaMHz =
      records.find((record) => typeof record.antennaMHz === "number")?.antennaMHz ||
      gprInputs.find((item) => typeof item.antennaMHz === "number")?.antennaMHz;
    if (typeof dtNs === "number" && dtNs > 0) {
      const band = resolveGprBandpass({
        dtNs,
        antennaMHz,
        fLowHz: options.parameters.fLowHz,
        fHighHz: options.parameters.fHighHz,
        applyBandpass: options.parameters.applyBandpass,
      });
      if (band.bandpassRefused || band.bandpassAdjusted) {
        issues.push({
          level: "warning",
          code: "gpr_bandpass_nyquist",
          message:
            band.reason ||
            `Band-pass corners are not Nyquist-safe for dt_ns=${dtNs}. Sampling ${band.samplingHz?.toExponential(3)} Hz, Nyquist ${band.nyquistHz?.toExponential(3)} Hz.`,
        });
      }
    }
  }
  if (expanded.includes("gpr.migrate")) {
    if (!GPR_MIGRATION_BENCHMARK_PASSED) {
      issues.push({
        level: "blocker",
        code: "gpr_migration_benchmark",
        message:
          "gpr.migrate is unavailable until the documented diffraction/migration benchmark in docs/validation/results/gpr_migration_benchmark.json reports all_passed.",
      });
    }
    const vel = options.parameters.velocityMs;
    const fromInputs = options.inputs.some((item) => typeof item.velocityMs === "number" && item.velocityMs > 0);
    const fromCatalog = catalogRecordsForInputs(gprInputs, options.catalog || null).some(
      (record) => typeof record.velocityMs === "number" && record.velocityMs > 0
    );
    if (
      GPR_MIGRATION_BENCHMARK_PASSED &&
      !(typeof vel === "number" && Number.isFinite(vel) && vel > 0) &&
      !fromInputs &&
      !fromCatalog
    ) {
      issues.push({
        level: "blocker",
        code: "gpr_velocity_required",
        message:
          "Kirchhoff time migration needs a user-supplied velocity in m/s (or VelocityMns on the contract). I will not assume 0.1 m/ns or a dielectric constant.",
      });
    }
  }
  if (expanded.includes("gpr.gis")) {
    const records = catalogRecordsForInputs(gprInputs, options.catalog || null);
    const hasCrs = records.some((record) => record.crs) || gprInputs.some((item) => item.crs);
    if (gprInputs.length && !hasCrs) {
      issues.push({
        level: "blocker",
        code: "gpr_crs_required",
        message: "GPR GIS export needs a documented EPSG. Section viewing does not invent a map CRS.",
      });
    }
  }

  const lasInputs = boundSupported(options.inputs, "las-well");
  const needsLas = expanded.some((id) => id.startsWith("borehole."));
  if (needsLas && options.inputs.length && lasInputs.length === 0) {
    issues.push({
      level: "blocker",
      code: "no_las_files",
      message:
        "Borehole processing needs a supported CWLS LAS 2.0 WRAP.NO catalog record. An arbitrary .las or LASF point cloud is not a processing input.",
    });
  }
  if (expanded.includes("borehole.map_collar")) {
    const records = catalogRecordsForInputs(lasInputs, options.catalog || null);
    const hasXy = records.some(
      (record) => typeof record.collarX === "number" && typeof record.collarY === "number"
    ) || lasInputs.some((item) => typeof item.collarX === "number" && typeof item.collarY === "number");
    const hasCrs =
      records.some((record) => record.crs || record.collarMappable) ||
      lasInputs.some((item) => item.crs || item.collarMappable);
    const confirmed = Boolean(options.parameters.collarCrsConfirmed);
    if (lasInputs.length && !hasXy) {
      issues.push({
        level: "blocker",
        code: "borehole_collar_xy_required",
        message:
          "Collar mapping needs documented LATI/LONG or X/Y. A vertical log can still be viewed. I will not invent a map position.",
      });
    } else if (lasInputs.length && hasXy && !hasCrs && !confirmed) {
      issues.push({
        level: "blocker",
        code: "borehole_crs_required",
        message:
          "Collar mapping needs a documented EPSG or an explicit user-confirmed CRS. Log viewing does not invent a map CRS.",
      });
    }
  }

  const geojsonInputs = boundSupported(options.inputs, "geojson");
  const needsGis = expanded.some((id) => id.startsWith("gis."));
  if (needsGis && options.inputs.length && geojsonInputs.length === 0) {
    issues.push({
      level: "blocker",
      code: "no_geojson_files",
      message:
        "GIS vector processing needs a supported GeoJSON catalog record (RFC 7946 OGC:CRS84, legacy-GeoJSON with a validated CRS mapping, or a G-AID custom import). I will not take a shapefile or GeoPackage.",
    });
  }
  const shapefileBound = options.inputs.filter(
    (item) => item.adapterId === "shapefile" || item.formatId === "shapefile" || item.kind === "shapefile"
  );
  const gpkgBound = options.inputs.filter(
    (item) => item.adapterId === "geopackage" || item.formatId === "geopackage" || item.kind === "geopackage"
  );
  if (shapefileBound.length) {
    issues.push({
      level: "blocker",
      code: "shapefile_not_parsed",
      message:
        "Shapefile is recognised-unsupported. G-AID does not parse .shp/.shx/.dbf geometry or attributes in this pack. Convert to documented GeoJSON.",
    });
  }
  if (gpkgBound.length) {
    issues.push({
      level: "blocker",
      code: "geopackage_not_parsed",
      message: "GeoPackage is recognised-unsupported. Tables and geometries were not loaded.",
    });
  }
  if (expanded.includes("gis.spatial_overlap")) {
    const records = catalogRecordsForInputs(geojsonInputs, options.catalog || null);
    const crsKeys = [
      ...new Set(
        [
          ...records.map((record) => record.crs).filter(Boolean),
          ...geojsonInputs.map((item) => item.crs).filter(Boolean),
        ] as string[]
      ),
    ];
    if (geojsonInputs.length && geojsonInputs.length < 2) {
      issues.push({
        level: "blocker",
        code: "gis_overlap_needs_two_layers",
        message:
          "Spatial overlap needs at least two documented GeoJSON layers with compatible CRS. I will not invent a second layer or silently reproject.",
      });
    } else if (geojsonInputs.length >= 2 && crsKeys.length === 0) {
      issues.push({
        level: "blocker",
        code: "gis_crs_required",
        message: "Spatial overlap needs a documented CRS on every layer (OGC:CRS84, a validated legacy mapping, or a G-AID custom import EPSG).",
      });
    } else if (geojsonInputs.length >= 2 && crsKeys.length > 1) {
      const set = new Set(crsKeys);
      const crs84Vs4326 = set.size === 2 && set.has("OGC:CRS84") && set.has("EPSG:4326");
      const orders = [
        ...records.map((record) => record.coordinateOrder),
        ...geojsonInputs.map((item) => item.coordinateOrder),
      ].filter((value): value is NonNullable<typeof value> => Boolean(value));
      const lonLatStorage = orders.length >= 2 && orders.every((value) => value === "lon-lat");
      if (crs84Vs4326 && lonLatStorage) {
        issues.push({
          level: "warning",
          code: "gis_crs84_epsg4326_compat",
          message:
            "OGC:CRS84 and EPSG:4326 are different CRS identities. Documented compatibility uses stored GeoJSON [lon, lat] without an axis swap or reprojection. Decision id: geojson-lonlat-no-axis-swap. This is not CRS identity.",
        });
      } else {
        issues.push({
          level: "blocker",
          code: "gis_crs_conflict",
          message: `Conflicting CRS among vector layers (${crsKeys.join(", ")}). Overlay and overlap are blocked. Reprojection and silent axis swaps are not registered capabilities.`,
        });
      }
    }
  }

  const geochemInputs = [...boundSupported(options.inputs, "geochem-csv"), ...boundSupported(options.inputs, "geochem-xyz")];
  const needsGeochem = expanded.some((id) => id.startsWith("geochem."));
  if (needsGeochem && options.inputs.length && geochemInputs.length === 0) {
    issues.push({
      level: "blocker",
      code: "no_geochem_files",
      message:
        "Geochemistry processing needs a supported G-AID GEOCHEM 1.0 catalog record. I will not take the first CSV because it has Fe or Cu columns.",
    });
  }
  if (needsGeochem && geochemInputs.length) {
    const records = catalogRecordsForInputs(geochemInputs, options.catalog || null);
    const unreviewed = records.filter((record) => {
      const mapping = record.geochemMapping || options.parameters.geochemMapping;
      if (!mapping || mapping.reviewed || options.parameters.columnMappingReviewed) return false;
      const canonical =
        mapping.sampleId === "SampleID" &&
        mapping.x === "X" &&
        mapping.y === "Y" &&
        mapping.elements.every((el) => /_(ppm|ppb|pct|percent)$/i.test(el.column));
      return !canonical;
    });
    if (unreviewed.length) {
      issues.push({
        level: "blocker",
        code: "mapping_review_required",
        message:
          "Geochemistry column names differ from SampleID, X, Y, Medium, Element_unit. Confirm a column mapping before Proceed. I will not guess Au from gold.",
      });
    }
    if (expanded.includes("geochem.map_points")) {
      const anyCrs = records.some((record) => record.crs) || geochemInputs.some((item) => item.crs);
      if (!anyCrs) {
        issues.push({
          level: "blocker",
          code: "geochem_crs_required",
          message:
            "Sample-point mapping needs a documented CRS (/ CRS=EPSG:… or / CRS=OGC:CRS84). Ingest without a map CRS is not a processing input in this pack.",
        });
      }
    }
    const mixed = records.some((record) => /mixed/i.test(record.units || "")) || geochemInputs.some((item) => /mixed/i.test(item.units || ""));
    if (mixed) {
      issues.push({
        level: "warning",
        code: "geochem_mixed_units",
        message: "Mixed element units are present. Direct comparison of those elements is blocked.",
      });
    }
  }
  if (expanded.includes("geochem.display_transform")) {
    const transform = String(options.parameters.displayTransform || "").toLowerCase();
    const approved = Boolean(options.parameters.displayTransformApproved || options.parameters.approved);
    if (transform !== "log10" || !approved) {
      issues.push({
        level: "blocker",
        code: "geochem_transform_not_approved",
        message:
          "Display transforms require explicit approval and displayTransform=log10. I will not silently log-transform or impute below-detection values.",
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
          "Near-zone terrain-corrected Bouguer needs a DEM vertical datum (orthometric or ellipsoidal). I will not assume one or download a DEM.",
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
          "Near-zone terrain-corrected Bouguer needs a supported dem-ascii catalog record (EPSG, Units=m, ElevationDatum). I will not download or invent a DEM.",
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
        "Near-zone terrain-corrected Bouguer needs a DEM vertical datum (orthometric or ellipsoidal). I will not assume one.",
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
        "Near-zone terrain-corrected Bouguer needs a terrain radius in metres, or an explicit request to use the DEM extent.",
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

const HAYFORD_BOWIE_OUTER_M = 166700;

function outerZoneContractIssues(
  options: Parameters<typeof validateCapabilityContracts>[0],
  gravityInputs: BoundInput[]
): ContractIssue[] {
  const issues: ContractIssue[] = [];
  const expanded = expandCapabilityIds(options.capabilityIds.filter(Boolean));
  const wantIntermediate = expanded.includes("grav.terrain_intermediate_zone");
  const wantFar = expanded.includes("grav.terrain_far_zone");
  const catalog = options.catalog || null;
  const boundDem = boundSupported(options.inputs, "dem-ascii");
  const demRecords = catalogRecordsForInputs(boundDem, catalog);
  const dem = demRecords[0] || null;
  const demBbox = dem?.bbox || boundDem[0]?.bbox;
  const stationBbox =
    catalogRecordsForInputs(gravityInputs, catalog).find((record) => record.bbox)?.bbox ||
    gravityInputs.find((item) => item.bbox)?.bbox;

  if (wantIntermediate) {
    issues.push({
      level: "warning",
      code: "intermediate_zone_clipped",
      message:
        "Intermediate-zone terrain is planar Nagy on the bound DEM, clipped to DEM coverage (default outer radius 166.7 km). Hayford–Bowie compartments are not implemented.",
    });
  }

  if (wantFar) {
    const farRadius = options.parameters.farRadiusM;
    if (!(typeof farRadius === "number" && Number.isFinite(farRadius) && farRadius > HAYFORD_BOWIE_OUTER_M)) {
      issues.push({
        level: "warning",
        code: "far_radius_required",
        message:
          "Far-zone terrain needs farRadiusM greater than 166.7 km. G-AID will not assume a global radius or download ETOPO/SRTM. Far-zone will be skipped until that radius is documented.",
      });
    } else if (stationBbox && demBbox) {
      const needed = {
        minX: stationBbox.minX - farRadius,
        minY: stationBbox.minY - farRadius,
        maxX: stationBbox.maxX + farRadius,
        maxY: stationBbox.maxY + farRadius,
      };
      if (!bboxContains(demBbox, needed)) {
        issues.push({
          level: "warning",
          code: "far_zone_dem_insufficient",
          message: `Bound DEM does not cover farRadiusM ${farRadius} m beyond the stations. Far-zone terrain will not be applied or invented. Missing global DEM coverage is not a silent pass.`,
        });
      }
    } else {
      issues.push({
        level: "warning",
        code: "far_zone_dem_unverified",
        message:
          "Far-zone terrain is requested. A local survey DEM almost certainly cannot cover 166.7 km. Far-zone will be skipped unless the bound DEM actually covers farRadiusM. G-AID does not download a global DEM.",
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
