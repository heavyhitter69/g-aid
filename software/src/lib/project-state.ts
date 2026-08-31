/**
 * Hidden project state: `{workspaceRoot}/.g-aid/`.
 * Visible products stay under `G-AID Output/runs/{runId}/` and are created only
 * after an approved plan is frozen.
 */

import fs from "node:fs";
import path from "node:path";
import { GAID_OUTPUT_DIR } from "./workspace-index.ts";
import {
  GAID_STATE_DIR,
  LEGACY_PENDING_NAME,
  STATE_CATALOG_NAME,
  STATE_MIGRATION_NAME,
  STATE_PENDING_NAME,
} from "./project-state-paths.ts";

export {
  GAID_STATE_DIR,
  LEGACY_PENDING_NAME,
  STATE_CATALOG_NAME,
  STATE_MIGRATION_NAME,
  STATE_PENDING_NAME,
  isGaidStatePath,
} from "./project-state-paths.ts";

export interface ProjectStateCopy {
  kind: "catalog" | "pending-plans";
  from: string;
  to: string;
  status: ProjectStateCopyStatus;
  detail?: string;
}

export interface ProjectStateMigration {
  at: string;
  workspaceRoot: string;
  createdStateDir: boolean;
  copies: ProjectStateCopy[];
  conflicts: string[];
}

export type ProjectStateCopyStatus = "copied" | "kept-existing" | "conflict" | "missing";

export function gaidStateDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, GAID_STATE_DIR);
}

export function catalogFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, GAID_STATE_DIR, STATE_CATALOG_NAME);
}

export function pendingPlansPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, GAID_STATE_DIR, STATE_PENDING_NAME);
}

export function writePendingPlansFile(
  workspaceRoot: string,
  plans: Record<string, unknown>
): string {
  const dest = pendingPlansPath(workspaceRoot);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${JSON.stringify(plans, null, 2)}\n`, "utf8");
  return dest;
}

export function migrationResultPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, GAID_STATE_DIR, STATE_MIGRATION_NAME);
}

export function legacyCatalogFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, GAID_OUTPUT_DIR, STATE_CATALOG_NAME);
}

export function legacyPendingPlansPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, GAID_OUTPUT_DIR, LEGACY_PENDING_NAME);
}

function filesEqual(a: string, b: string): boolean {
  try {
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
}

function copyMetadataFile(
  kind: ProjectStateCopy["kind"],
  from: string,
  to: string
): ProjectStateCopy {
  const copy: ProjectStateCopy = { kind, from, to, status: "missing" };
  if (!fs.existsSync(from) || !fs.statSync(from).isFile()) {
    return copy;
  }
  if (fs.existsSync(to) && fs.statSync(to).isFile()) {
    if (filesEqual(from, to)) {
      copy.status = "kept-existing";
      copy.detail = "destination already matches legacy metadata";
      return copy;
    }
    copy.status = "conflict";
    copy.detail = "kept existing .g-aid file; did not overwrite from G-AID Output";
    return copy;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copy.status = "copied";
  copy.detail = "copied from legacy G-AID Output; leftover source was not deleted";
  return copy;
}

let lastMigration: ProjectStateMigration | null = null;

export function lastProjectStateMigration(): ProjectStateMigration | null {
  return lastMigration;
}

/**
 * Copy legacy catalog/pending-plan files into `.g-aid/` when the destination
 * is missing. Never moves, deletes, or overwrites G-AID Output products.
 */
export function migrateLegacyProjectState(workspaceRoot: string): ProjectStateMigration {
  const resolved = path.resolve(workspaceRoot);
  const stateDir = gaidStateDir(resolved);
  const existed = fs.existsSync(stateDir);
  const copies = [
    copyMetadataFile("catalog", legacyCatalogFilePath(resolved), catalogFilePath(resolved)),
    copyMetadataFile("pending-plans", legacyPendingPlansPath(resolved), pendingPlansPath(resolved)),
  ];
  const conflicts = copies
    .filter((item) => item.status === "conflict")
    .map((item) => `${item.kind}: ${item.detail}`);
  const createdStateDir = !existed && fs.existsSync(stateDir);
  const result: ProjectStateMigration = {
    at: new Date().toISOString(),
    workspaceRoot: resolved,
    createdStateDir,
    copies,
    conflicts,
  };
  try {
    if (copies.some((item) => item.status === "copied" || item.status === "conflict" || item.status === "kept-existing")) {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(migrationResultPath(resolved), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
  } catch {
    /* migration still returned in-memory */
  }
  lastMigration = result;
  return result;
}
