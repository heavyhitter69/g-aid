import type { CatalogRecord, ProjectCatalog } from "./types.ts";
import {
  mappingCoversRequired,
  mappingIsCanonical,
  radioReadyForSupport,
  type RadioColumnMapping,
  type RadioContractResult,
  type RadioQuantity,
} from "./radio-contract.ts";

export function applyReviewedRadioMapping(
  record: CatalogRecord,
  mapping: RadioColumnMapping,
  extras?: {
    crs?: string;
    units?: string;
    quantity?: string;
    correctionHistory?: string;
    acquisitionPlatform?: string;
    instrument?: string;
  }
): CatalogRecord {
  if (!mappingCoversRequired(mapping)) {
    throw new Error("Radiometric mapping must identify x, y, line, and at least one of K, eU, eTh, TC.");
  }
  const reviewed: RadioColumnMapping = {
    ...mapping,
    reviewed: true,
    reviewedAt: mapping.reviewedAt || new Date().toISOString(),
  };
  const quantity = (extras?.quantity || record.radioQuantity) as RadioQuantity | undefined;
  const columns = record.columns || [];
  const inspected: RadioContractResult = {
    looksLikeRadiometric: true,
    rawSpectrum: false,
    formatId: record.formatId === "radiometric-xyz" ? "radiometric-xyz" : "radiometric-csv",
    columns,
    canonical: mappingIsCanonical(reviewed, columns),
    suggestedMapping: reviewed,
    mappingComplete: mappingCoversRequired(reviewed),
    meta: {
      crs: extras?.crs || record.crs,
      quantity,
      units: extras?.units || record.units,
      correctionHistory: extras?.correctionHistory || record.correctionHistory,
      platform: extras?.acquisitionPlatform || record.acquisitionPlatform,
      instrument: extras?.instrument || record.instrument,
      comments: [],
    },
    errors: [],
    warnings: [],
    channels: [reviewed.k && "k", reviewed.eu && "eu", reviewed.eth && "eth", reviewed.tc && "tc"].filter(
      Boolean
    ) as RadioContractResult["channels"],
  };
  const synthetic: CatalogRecord = {
    ...record,
    crs: extras?.crs || record.crs,
    units: extras?.units || record.units,
    radioMapping: reviewed,
    radioQuantity: quantity,
    correctionHistory: extras?.correctionHistory || record.correctionHistory,
    acquisitionPlatform: extras?.acquisitionPlatform || record.acquisitionPlatform,
    instrument: extras?.instrument || record.instrument,
  };
  const ready =
    radioReadyForSupport(inspected, reviewed) &&
    Boolean(synthetic.crs && synthetic.radioQuantity && synthetic.correctionHistory);
  return {
    ...synthetic,
    supportStatus: ready ? "supported" : "recognised-unsupported",
    adapterId: record.formatId === "radiometric-xyz" ? "radiometric-xyz" : "radiometric-csv",
    formatId: record.formatId === "radiometric-xyz" ? "radiometric-xyz" : "radiometric-csv",
    parseErrors: ready
      ? undefined
      : [
          ...(record.parseErrors || []).filter((err) => !/reviewed mapping/i.test(err)),
          "Reviewed mapping is stored; CRS, quantity, units, acquisition, and correction history are still required before processing.",
        ].filter(Boolean),
    provenance: {
      ...record.provenance,
      notes: [...(record.provenance.notes || []), "User reviewed radiometric column mapping."],
    },
  };
}

export function mergeRadioMappingFromPrevious(
  record: CatalogRecord,
  previous?: ProjectCatalog | null
): CatalogRecord {
  const prior = previous?.records.find((item) => item.id === record.id);
  if (!prior?.radioMapping?.reviewed) return record;
  try {
    return applyReviewedRadioMapping(record, prior.radioMapping, {
      crs: prior.crs,
      units: prior.units,
      quantity: prior.radioQuantity,
      correctionHistory: prior.correctionHistory,
      acquisitionPlatform: prior.acquisitionPlatform,
      instrument: prior.instrument,
    });
  } catch {
    return record;
  }
}

export { radioReadyForSupport };
