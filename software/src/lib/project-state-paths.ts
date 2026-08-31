/**
 * Client-safe names for hidden project state. Node I/O lives in `project-state.ts`.
 */

export const GAID_STATE_DIR = ".g-aid";
export const STATE_CATALOG_NAME = "project.catalog.json";
export const STATE_PENDING_NAME = "pending-plans.json";
export const STATE_MIGRATION_NAME = "migration.json";
export const LEGACY_PENDING_NAME = ".pending-plans.json";

/** True for `.g-aid` itself or anything nested under it. */
export function isGaidStatePath(rel: string): boolean {
  return rel
    .replace(/\\/g, "/")
    .split("/")
    .some((part) => part === GAID_STATE_DIR);
}
