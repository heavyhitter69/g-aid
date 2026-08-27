import fs from "node:fs";
import path from "node:path";
import type { CatalogRunProvenance } from "../catalog/types.ts";

export function listRunArtifactPaths(workspaceRoot: string, runs: CatalogRunProvenance[] = []): string[] {
  const files: string[] = [];
  for (const run of runs) {
    const rel = (run.productsRel || `G-AID Output/runs/${run.runId}`).replace(/\\/g, "/");
    const dir = path.join(workspaceRoot, rel);
    if (!fs.existsSync(dir)) continue;
    try {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (!fs.statSync(full).isFile()) continue;
        files.push(`${rel}/${name}`);
      }
    } catch {
      /* skip unreadable run folders */
    }
  }
  return files;
}
