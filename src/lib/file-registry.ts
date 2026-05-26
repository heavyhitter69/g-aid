/**
 * Module-level Map of File objects from folder/file pickers.
 * Content is read lazily when a tab is opened (see read-file-content.ts).
 */

import { readFileForEditor } from "@/lib/read-file-content";

const registry = new Map<string, File>();

/** @param id Unique path within the project, e.g. `data/line4.dat` */
export function registerFile(id: string, file: File): void {
  registry.set(id, file);
}

export function clearRegistry(): void {
  registry.clear();
}

export async function readRegisteredFile(id: string): Promise<string | null> {
  const file = registry.get(id);
  if (!file) return null;
  return readFileForEditor(file, id);
}

export function hasRegisteredFile(id: string): boolean {
  return registry.has(id);
}

export function getRegisteredFile(id: string): File | undefined {
  return registry.get(id);
}
