/**
 * Hidden project state: `{workspaceRoot}/.g-aid/`.
 * Visible products stay under `G-AID Output/runs/{runId}/` and are created only
 * after an approved plan is frozen.
 */

import { createHash } from "node:crypto";
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
  STATE_EDITS_SUBDIR,
  STATE_MIGRATION_NAME,
  STATE_PENDING_NAME,
  isGaidStatePath,
} from "./project-state-paths.ts";

export const MIGRATION_SCHEMA_VERSION = 1;

export type ProjectStateCopyKind = "catalog" | "pending-plans";
export type ProjectStateCopyStatus =
  | "copied"
  | "kept-existing"
  | "conflict"
  | "missing"
  | "remnant";

export interface ProjectStateCopy {
  kind: ProjectStateCopyKind;
  from: string;
  to: string;
  status: ProjectStateCopyStatus;
  detail?: string;
  sourceChecksum?: string;
  sourceBytes?: number;
}

export interface ProjectStateMigrationFile {
  kind: ProjectStateCopyKind;
  from: string;
  to: string;
  sourceChecksum: string;
  sourceBytes: number;
  migrated: boolean;
  status: ProjectStateCopyStatus;
  at: string;
}

export interface StoredProjectStateMigration {
  schemaVersion: number;
  at: string;
  workspaceRoot: string;
  files: Partial<Record<ProjectStateCopyKind, ProjectStateMigrationFile>>;
}

export interface ProjectStateMigration {
  at: string;
  recordedAt?: string;
  workspaceRoot: string;
  createdStateDir: boolean;
  copies: ProjectStateCopy[];
  conflicts: string[];
}

function isFile(abs: string): boolean {
  try {
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

function sha256File(abs: string): { checksum: string; bytes: number } | null {
  try {
    if (!isFile(abs)) return null;
    const buf = fs.readFileSync(abs);
    return {
      checksum: `sha256:${createHash("sha256").update(buf).digest("hex")}`,
      bytes: buf.length,
    };
  } catch {
    return null;
  }
}

function filesEqual(a: string, b: string): boolean {
  try {
    return fs.readFileSync(a).equals(fs.readFileSync(b));
  } catch {
    return false;
  }
}

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

function recordedFromLegacyCopies(parsed: {
  at?: string;
  workspaceRoot?: string;
  copies?: Array<{ kind?: string; from?: string; to?: string; status?: string }>;
}): StoredProjectStateMigration | null {
  const files: StoredProjectStateMigration["files"] = {};
  for (const copy of parsed.copies || []) {
    if (copy.kind !== "catalog" && copy.kind !== "pending-plans") continue;
    if (copy.status !== "copied" && copy.status !== "kept-existing") continue;
    files[copy.kind] = {
      kind: copy.kind,
      from: copy.from || "",
      to: copy.to || "",
      sourceChecksum: "",
      sourceBytes: 0,
      migrated: true,
      status: copy.status,
      at: parsed.at || new Date().toISOString(),
    };
  }
  if (!Object.keys(files).length) return null;
  return {
    schemaVersion: MIGRATION_SCHEMA_VERSION,
    at: parsed.at || new Date().toISOString(),
    workspaceRoot: parsed.workspaceRoot || "",
    files,
  };
}

export function loadStoredProjectStateMigration(
  workspaceRoot: string
): StoredProjectStateMigration | null {
  const dest = migrationResultPath(workspaceRoot);
  if (!isFile(dest)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(dest, "utf8")) as StoredProjectStateMigration & {
      copies?: Array<{ kind?: string; from?: string; to?: string; status?: string }>;
    };
    if (parsed?.schemaVersion === MIGRATION_SCHEMA_VERSION && parsed.files && typeof parsed.files === "object") {
      return parsed;
    }
    return recordedFromLegacyCopies(parsed);
  } catch {
    return null;
  }
}

function writeStoredMigration(store: StoredProjectStateMigration): void {
  fs.mkdirSync(path.dirname(migrationResultPath(store.workspaceRoot)), { recursive: true });
  fs.writeFileSync(
    migrationResultPath(store.workspaceRoot),
    `${JSON.stringify(store, null, 2)}\n`,
    "utf8"
  );
}

function processMetadataFile(
  kind: ProjectStateCopyKind,
  from: string,
  to: string,
  recorded: ProjectStateMigrationFile | undefined,
  now: string
): { copy: ProjectStateCopy; record?: ProjectStateMigrationFile } {
  const copy: ProjectStateCopy = { kind, from, to, status: "missing" };
  const leftover = sha256File(from);
  if (!leftover) return { copy };

  copy.sourceChecksum = leftover.checksum;
  copy.sourceBytes = leftover.bytes;

  if (!isFile(to)) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    copy.status = "copied";
    copy.detail = "copied from legacy G-AID Output; leftover source was not deleted";
    return {
      copy,
      record: {
        kind,
        from,
        to,
        sourceChecksum: leftover.checksum,
        sourceBytes: leftover.bytes,
        migrated: true,
        status: "copied",
        at: now,
      },
    };
  }

  if (recorded?.migrated && recorded.sourceChecksum) {
    if (leftover.checksum === recorded.sourceChecksum) {
      copy.status = "remnant";
      copy.sourceChecksum = recorded.sourceChecksum;
      copy.sourceBytes = recorded.sourceBytes;
      copy.detail = "legacy leftover unchanged since migration; .g-aid is authoritative";
      return { copy };
    }
    copy.status = "conflict";
    copy.detail =
      "legacy leftover changed after migration; kept existing .g-aid file; leftover was not overwritten";
    return { copy };
  }

  if (recorded?.migrated && !recorded.sourceChecksum) {
    copy.status = "remnant";
    copy.detail = "legacy leftover acknowledged from prior migration; .g-aid is authoritative";
    return {
      copy,
      record: {
        ...recorded,
        from: recorded.from || from,
        to: recorded.to || to,
        sourceChecksum: leftover.checksum,
        sourceBytes: leftover.bytes,
        status: "remnant",
      },
    };
  }

  if (filesEqual(from, to)) {
    copy.status = "kept-existing";
    copy.detail = "destination already matches legacy metadata";
    return {
      copy,
      record: {
        kind,
        from,
        to,
        sourceChecksum: leftover.checksum,
        sourceBytes: leftover.bytes,
        migrated: true,
        status: "kept-existing",
        at: recorded?.at || now,
      },
    };
  }

  copy.status = "conflict";
  copy.detail = "kept existing .g-aid file; did not overwrite from G-AID Output";
  return { copy };
}

let lastMigration: ProjectStateMigration | null = null;

export function lastProjectStateMigration(): ProjectStateMigration | null {
  return lastMigration;
}

/**
 * Copy legacy catalog/pending-plan files into `.g-aid/` when the destination
 * is missing. Never moves, deletes, or overwrites G-AID Output products.
 *
 * After a successful copy, leftover files are inactive remnants. Later opens
 * compare leftover bytes only to the checksum recorded at migration time, not
 * to the live `.g-aid/` catalog. Conflict is reserved for leftover files that
 * change after that snapshot.
 */
export function migrateLegacyProjectState(workspaceRoot: string): ProjectStateMigration {
  const resolved = path.resolve(workspaceRoot);
  const stateDir = gaidStateDir(resolved);
  const existed = fs.existsSync(stateDir);
  const now = new Date().toISOString();
  const stored = loadStoredProjectStateMigration(resolved);
  const specs: Array<{ kind: ProjectStateCopyKind; from: string; to: string }> = [
    { kind: "catalog", from: legacyCatalogFilePath(resolved), to: catalogFilePath(resolved) },
    { kind: "pending-plans", from: legacyPendingPlansPath(resolved), to: pendingPlansPath(resolved) },
  ];
  const copies: ProjectStateCopy[] = [];
  const recordUpdates: ProjectStateMigrationFile[] = [];
  for (const spec of specs) {
    const result = processMetadataFile(spec.kind, spec.from, spec.to, stored?.files[spec.kind], now);
    copies.push(result.copy);
    if (result.record) recordUpdates.push(result.record);
  }
  const conflicts = copies
    .filter((item) => item.status === "conflict")
    .map((item) => `${item.kind}: ${item.detail}`);
  if (recordUpdates.length) {
    const next: StoredProjectStateMigration = {
      schemaVersion: MIGRATION_SCHEMA_VERSION,
      at: stored?.at || now,
      workspaceRoot: resolved,
      files: { ...(stored?.files || {}) },
    };
    for (const rec of recordUpdates) {
      next.files[rec.kind] = rec;
    }
    try {
      writeStoredMigration(next);
    } catch {
      /* in-memory result still returned */
    }
  }
  const createdStateDir = !existed && fs.existsSync(stateDir);
  const result: ProjectStateMigration = {
    at: now,
    recordedAt: loadStoredProjectStateMigration(resolved)?.at || stored?.at,
    workspaceRoot: resolved,
    createdStateDir,
    copies,
    conflicts,
  };
  lastMigration = result;
  return result;
}
