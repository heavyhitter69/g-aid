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
export {
  GRAVITY_ADAPTER_IDS,
  inspectGravityText,
  isGravityAdapterId,
} from "./gravity-contract.ts";
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
