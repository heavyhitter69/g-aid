/**
 * Source survey files are read-only. An explicit user save of a source file
 * writes a backup under hidden `.g-aid/edits/`. That folder is project state,
 * not analysis output, and is created only by that save action.
 */

import { isGaidOutputPath } from "./workspace-index.ts";
import { GAID_STATE_DIR, STATE_EDITS_SUBDIR } from "./project-state-paths.ts";

export const SOURCE_EDITS_SUBDIR = STATE_EDITS_SUBDIR;

export function posixRel(rel: string): string {
  return String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

/** True for `.g-aid/edits` itself or a file nested under it. */
export function isSourceEditBackupPath(rel: string): boolean {
  const parts = posixRel(rel).split("/").filter(Boolean);
  return parts[0] === GAID_STATE_DIR && parts[1] === STATE_EDITS_SUBDIR;
}

export function isWritableWorkspaceRel(rel: string): boolean {
  const cleaned = posixRel(rel);
  if (!cleaned) return false;
  return isGaidOutputPath(cleaned) || isSourceEditBackupPath(cleaned);
}

/** Destination for a copy of a source file the user tried to save. */
export function copyToOutputRelative(rel: string): string {
  const cleaned = posixRel(rel);
  if (!cleaned) return `${GAID_STATE_DIR}/${SOURCE_EDITS_SUBDIR}/untitled.txt`;
  if (isWritableWorkspaceRel(cleaned)) return cleaned;
  return `${GAID_STATE_DIR}/${SOURCE_EDITS_SUBDIR}/${cleaned}`;
}

export function shouldCopySourceSave(rel: string, exists: boolean): boolean {
  return exists && !isWritableWorkspaceRel(rel);
}
