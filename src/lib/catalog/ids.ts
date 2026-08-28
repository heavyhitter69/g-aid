import { sha256Utf8Hex } from "../sha256.ts";

export function posixRel(rel: string): string {
  return String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
}

/** Stable catalog id from the workspace-relative path, not file bytes. */
export function catalogRecordId(relativePath: string): string {
  const key = posixRel(relativePath).toLowerCase();
  const digest = sha256Utf8Hex(key);
  return `rec:${digest.slice(0, 16)}`;
}

export function fileExtension(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() || filename;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}
