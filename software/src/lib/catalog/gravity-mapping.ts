import type { CatalogRecord, ProjectCatalog } from "./types.ts";
import {
  gravityReadyForSupport,
  inspectGravityText,
  mappingCoversRequired,
  type GravityColumnMapping,
} from "./gravity-contract.ts";

export function applyReviewedGravityMapping(
  record: CatalogRecord,
  mapping: GravityColumnMapping,
  extras?: { crs?: string; units?: string; elevationDatum?: string }
): CatalogRecord {
  if (!mappingCoversRequired(mapping)) {
    throw new Error("Gravity mapping must identify x, y, and observed gravity columns.");
  }
  const reviewed: GravityColumnMapping = {
    ...mapping,
    reviewed: true,
    reviewedAt: mapping.reviewedAt || new Date().toISOString(),
  };
  const inspected = inspectGravityText(record.headerSummary || "");
  const crs = extras?.crs || record.crs || inspected.meta.crs;
  const units = extras?.units || record.units || inspected.meta.units;
  const elevationDatum = extras?.elevationDatum || record.elevationDatum || inspected.meta.elevationDatum;
  const synthetic: CatalogRecord = {
    ...record,
    crs,
    units,
    elevationDatum,
    columnMapping: reviewed,
  };
  const ready = Boolean(crs && units && mappingCoversRequired(reviewed) && reviewed.reviewed);
  return {
    ...synthetic,
    supportStatus: ready ? "supported" : "recognised-unsupported",
    adapterId: record.formatId === "gravity-xyz" ? "gravity-xyz" : "gravity-csv",
    formatId: record.formatId === "gravity-xyz" ? "gravity-xyz" : "gravity-csv",
    parseErrors: ready
      ? undefined
      : [
          ...(record.parseErrors || []).filter((err) => !/reviewed mapping/i.test(err)),
          ready ? "" : "Reviewed mapping is stored; CRS and units are still required before processing.",
        ].filter(Boolean),
    provenance: {
      ...record.provenance,
      notes: [...(record.provenance.notes || []), "User reviewed gravity column mapping."],
    },
  };
}

export function mergeGravityMappingFromPrevious(
  record: CatalogRecord,
  previous?: ProjectCatalog | null
): CatalogRecord {
  const prior = previous?.records.find((item) => item.id === record.id);
  if (!prior?.columnMapping?.reviewed) return record;
  try {
    return applyReviewedGravityMapping(record, prior.columnMapping, {
      crs: prior.crs,
      units: prior.units,
      elevationDatum: prior.elevationDatum,
    });
  } catch {
    return record;
  }
}

export { gravityReadyForSupport };
