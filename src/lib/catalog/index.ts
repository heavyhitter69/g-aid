export type { CatalogAdapter, SniffContext, AdapterSniff, CatalogInspection, AdapterValidation } from "./adapters/types.ts";
export {
  CATALOG_FILENAME,
  CATALOG_SCHEMA_VERSION,
  MAX_CATALOG_FILES,
  PEEK_BYTES,
  SUPPORT_STATUSES,
  type CatalogRecord,
  type ProjectCatalog,
  type SupportStatus,
  type MediaClass,
  type DomainHint,
  type CatalogRunProvenance,
} from "./types.ts";
export { catalogRecordId } from "./ids.ts";
export { adapterRegistry, getAdapter, supportedAdapterIds } from "./registry.ts";
export { classifyPeek, isSupportedProcessingRecord } from "./classify.ts";
export { applyReviewedGravityMapping } from "./gravity-mapping.ts";
export { applyReviewedRadioMapping } from "./radio-mapping.ts";
export { applyReviewedVectorRole, mergeVectorRoleFromPrevious } from "./vector-role.ts";
export { applyReviewedGeochemMapping, mergeGeochemMappingFromPrevious } from "./geochem-mapping.ts";
export {
  GRAVITY_ADAPTER_IDS,
  inspectGravityText,
  isGravityAdapterId,
} from "./gravity-contract.ts";
export {
  RADIO_ADAPTER_IDS,
  inspectRadiometricText,
  isRadioAdapterId,
  ternaryJustified,
  ratioJustified,
} from "./radio-contract.ts";
export {
  GEOCHEM_ADAPTER_IDS,
  inspectGeochemText,
  isGeochemAdapterId,
  geochemReadyForSupport,
} from "./geochem-contract.ts";
export {
  VECTOR_ROLES,
  UNASSIGNED_VECTOR_ROLE,
  inspectGeojsonText,
  geojsonReadyForSupport,
  GEOJSON_ADAPTER_ID,
} from "./geojson-contract.ts";
export { inspectShapefilePath } from "./adapters/shapefile.ts";
export { shapefileReadyForSupport, SHAPEFILE_ADAPTER_ID } from "./shapefile-contract.ts";
export { buildProjectCatalog } from "./build.ts";
export { catalogFilePath, loadProjectCatalog, refreshProjectCatalog, writeProjectCatalog } from "./persist.ts";
export {
  countBySupport,
  findRecord,
  inventoryAnswer,
  recordsInTarget,
  summarizeCatalog,
  supportedProcessingRecords,
} from "./summarize.ts";
