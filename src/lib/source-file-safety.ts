/**
 * Source survey files are read-only. Edits land under `G-AID Output/`.
 */

import { GAID_OUTPUT_DIR, isGaidOutputPath } from "./workspace-index.ts";

export const SOURCE_EDITS_SUBDIR = "edits";

export function posixRel(rel: string): string {
  return String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

export function isWritableWorkspaceRel(rel: string): boolean {
  const cleaned = posixRel(rel);
  if (!cleaned) return false;
  return isGaidOutputPath(cleaned);
}

/** Destination under G-AID Output for a copy of a source file the user tried to save. */
export function copyToOutputRelative(rel: string): string {
  const cleaned = posixRel(rel);
  if (!cleaned) return `${GAID_OUTPUT_DIR}/${SOURCE_EDITS_SUBDIR}/untitled.txt`;
  if (isGaidOutputPath(cleaned)) return cleaned;
  return `${GAID_OUTPUT_DIR}/${SOURCE_EDITS_SUBDIR}/${cleaned}`;
}

export function shouldCopySourceSave(rel: string, exists: boolean): boolean {
  return exists && !isWritableWorkspaceRel(rel);
}
