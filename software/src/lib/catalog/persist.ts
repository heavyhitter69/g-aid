/**
 * Catalog persist lives under `{workspaceRoot}/.g-aid/`.
 * This module never creates `G-AID Output/`.
 */

import fs from "node:fs";
import path from "node:path";
import { type ProjectCatalog } from "./types.ts";
import { buildProjectCatalog } from "./build.ts";
import {
  catalogFilePath,
  migrateLegacyProjectState,
} from "../project-state.ts";

export { catalogFilePath };

export function loadProjectCatalog(workspaceRoot: string): ProjectCatalog | null {
  migrateLegacyProjectState(workspaceRoot);
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
  migrateLegacyProjectState(workspaceRoot);
  const previous = loadProjectCatalog(workspaceRoot);
  const catalog = buildProjectCatalog(workspaceRoot, { previous });
  writeProjectCatalog(catalog);
  return catalog;
}
