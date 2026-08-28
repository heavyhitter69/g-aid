import fs from "node:fs";
import path from "node:path";
import { CATALOG_FILENAME, type ProjectCatalog } from "./types.ts";
import { GAID_OUTPUT_DIR } from "../workspace-index.ts";
import { buildProjectCatalog } from "./build.ts";

export function catalogFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, GAID_OUTPUT_DIR, CATALOG_FILENAME);
}

export function loadProjectCatalog(workspaceRoot: string): ProjectCatalog | null {
  const dest = catalogFilePath(workspaceRoot);
  if (!fs.existsSync(dest)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(dest, "utf8")) as ProjectCatalog;
    if (!parsed || !Array.isArray(parsed.records)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeProjectCatalog(catalog: ProjectCatalog): string {
  const dest = catalogFilePath(catalog.workspaceRoot);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const body = `${JSON.stringify(catalog, null, 2)}\n`;
  fs.writeFileSync(dest, body, "utf8");
  return dest;
}

export function refreshProjectCatalog(workspaceRoot: string): ProjectCatalog {
  const previous = loadProjectCatalog(workspaceRoot);
  const catalog = buildProjectCatalog(workspaceRoot, { previous });
  writeProjectCatalog(catalog);
  return catalog;
}
