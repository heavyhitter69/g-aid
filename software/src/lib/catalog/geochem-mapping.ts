import type { CatalogRecord, ProjectCatalog } from "./types.ts";
import {
  geochemReadyForSupport,
  mappingCoversRequired,
  mappingIsCanonical,
  type GeochemColumnMapping,
  type GeochemContractResult,
} from "./geochem-contract.ts";

export function applyReviewedGeochemMapping(
  record: CatalogRecord,
  mapping: GeochemColumnMapping,
  extras?: {
    crs?: string;
    units?: string;
    medium?: string;
    lab?: string;
    method?: string;
  }
): CatalogRecord {
  if (!mappingCoversRequired(mapping)) {
    throw new Error("Geochemistry mapping must identify SampleID, X, Y, and at least one element with documented units.");
  }
  const reviewed: GeochemColumnMapping = {
    ...mapping,
    elements: mapping.elements.map((el) => ({ ...el })),
    reviewed: true,
    reviewedAt: mapping.reviewedAt || new Date().toISOString(),
  };
  const columns = record.columns || [];
  const inspected: GeochemContractResult = {
    looksLikeGeochem: true,
    formatId: record.formatId === "geochem-xyz" ? "geochem-xyz" : "geochem-csv",
    columns,
    canonical: mappingIsCanonical(reviewed, columns),
    suggestedMapping: reviewed,
    mappingComplete: mappingCoversRequired(reviewed),
    meta: {
      crs: extras?.crs || record.crs,
      medium: extras?.medium || record.sampleMedium,
      units: extras?.units || record.units,
      lab: extras?.lab || record.lab,
      method: extras?.method || record.analyticalMethod,
      comments: [],
    },
    errors: [],
    warnings: [],
    elements: reviewed.elements,
  };
  const synthetic: CatalogRecord = {
    ...record,
    crs: extras?.crs || record.crs,
    units: extras?.units || record.units,
    sampleMedium: extras?.medium || record.sampleMedium,
    lab: extras?.lab || record.lab,
    analyticalMethod: extras?.method || record.analyticalMethod,
    geochemMapping: reviewed,
  };
  const ready = geochemReadyForSupport(inspected, reviewed) && Boolean(synthetic.crs && (synthetic.sampleMedium || reviewed.medium));
  return {
    ...synthetic,
    supportStatus: ready ? "supported" : "recognised-unsupported",
    adapterId: record.formatId === "geochem-xyz" ? "geochem-xyz" : "geochem-csv",
    formatId: record.formatId === "geochem-xyz" ? "geochem-xyz" : "geochem-csv",
    parseErrors: ready
      ? undefined
      : [
          ...(record.parseErrors || []).filter((err) => !/reviewed mapping/i.test(err)),
          "Reviewed mapping is stored; CRS, sample medium, and documented element units are still required before processing.",
        ].filter(Boolean),
    provenance: {
      ...record.provenance,
      notes: [...(record.provenance.notes || []), "User reviewed geochemistry column mapping."],
    },
  };
}

export function mergeGeochemMappingFromPrevious(
  record: CatalogRecord,
  previous?: ProjectCatalog | null
): CatalogRecord {
  const prior = previous?.records.find((item) => item.id === record.id);
  if (!prior?.geochemMapping?.reviewed) return record;
  try {
    return applyReviewedGeochemMapping(record, prior.geochemMapping, {
      crs: prior.crs,
      units: prior.units,
      medium: prior.sampleMedium,
      lab: prior.lab,
      method: prior.analyticalMethod,
    });
  } catch {
    return record;
  }
}

export { geochemReadyForSupport };
