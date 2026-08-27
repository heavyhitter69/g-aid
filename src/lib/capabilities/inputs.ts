import fs from "node:fs";
import path from "node:path";
import { checksumFile } from "../catalog/checksum.ts";
import type { CatalogChecksum } from "../catalog/types.ts";
import type { BoundInput } from "./types.ts";

export interface InputIdentityIssue {
  code: "input_changed" | "input_missing" | "missing_catalog_id";
  message: string;
  catalogId?: string;
  path?: string;
}

function matchesChecksum(expected: string | undefined, actual: CatalogChecksum): boolean {
  if (!expected) return false;
  return Boolean(actual.value && actual.value === expected);
}

/** Re-hash bound source files with the catalog strategy. Stop if identity changed. */
export function verifyBoundInputIdentity(
  workspaceRoot: string,
  inputs: BoundInput[]
): { ok: boolean; issues: InputIdentityIssue[] } {
  const issues: InputIdentityIssue[] = [];
  for (const item of inputs) {
    if (!item.catalogId) {
      issues.push({
        code: "missing_catalog_id",
        message: `${item.path || "(unnamed)"} has no catalog record ID.`,
        path: item.path,
      });
      continue;
    }
    const abs = path.isAbsolute(item.path) ? item.path : path.join(workspaceRoot, item.path);
    let size = 0;
    try {
      if (!fs.existsSync(abs)) {
        issues.push({
          code: "input_missing",
          catalogId: item.catalogId,
          path: item.path,
          message: `Bound catalog file is missing: ${item.path}`,
        });
        continue;
      }
      size = fs.statSync(abs).size;
    } catch {
      issues.push({
        code: "input_missing",
        catalogId: item.catalogId,
        path: item.path,
        message: `Bound catalog file is missing: ${item.path}`,
      });
      continue;
    }
    if (!item.checksum) {
      issues.push({
        code: "input_changed",
        catalogId: item.catalogId,
        path: item.path,
        message: `Frozen plan has no checksum for catalog record ${item.catalogId}. I will not run without a bound identity.`,
      });
      continue;
    }
    const actual = checksumFile(abs, size);
    if (!matchesChecksum(item.checksum, actual)) {
      issues.push({
        code: "input_changed",
        catalogId: item.catalogId,
        path: item.path,
        message: `Source data changed since the plan was frozen (${item.path}, ${item.catalogId}). I will not run against a different file.`,
      });
    }
  }
  return { ok: issues.length === 0, issues };
}

export function catalogInputsPayload(workspaceRoot: string, inputs: BoundInput[]) {
  return inputs.map((item) => ({
    catalogId: item.catalogId,
    path: item.path,
    kind: item.kind,
    adapterId: item.adapterId,
    checksum: item.checksum,
    size: item.size,
    absPath: path.isAbsolute(item.path) ? item.path : path.join(workspaceRoot, item.path),
    columnMapping: item.columnMapping,
    radioMapping: item.radioMapping,
    radioQuantity: item.radioQuantity,
    correctionHistory: item.correctionHistory,
    acquisitionPlatform: item.acquisitionPlatform,
    instrument: item.instrument,
    elevationDatum: item.elevationDatum,
    units: item.units,
    crs: item.crs,
    wellId: item.wellId,
    curves: item.curves,
    nullValue: item.nullValue,
    collarX: item.collarX,
    collarY: item.collarY,
    collarMappable: item.collarMappable,
    lasVersion: item.lasVersion,
    wrap: item.wrap,
  }));
}
