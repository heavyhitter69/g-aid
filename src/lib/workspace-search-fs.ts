/**
 * Bounded on-disk grep for named survey tokens. Server/API only — do not import
 * from client components.
 */

import fs from "node:fs";
import path from "node:path";
import {
  SEARCH_SKIP_DIRS,
  extractSearchNeedles,
  mergeSearchHits,
  scoreHaystack,
  type WorkspaceSearchHit,
} from "./workspace-search.ts";

const TEXT_EXTS = new Set([
  ".csv", ".txt", ".dat", ".xyz", ".las", ".json", ".geojson", ".md", ".prj",
  ".wkt", ".yaml", ".yml", ".asc", ".log",
]);

const PEEK_BYTES = 4096;
const GREP_FILE_CAP = 8000;

function peekTextFile(fullPath: string, size: number): string {
  try {
    const fd = fs.openSync(fullPath, "r");
    const buf = Buffer.alloc(Math.min(PEEK_BYTES, size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    return buf.toString("utf8");
  } catch {
    return "";
  }
}

export function grepWorkspaceRoot(
  root: string,
  message: string,
  maxHits = 30
): WorkspaceSearchHit[] {
  const resolved = path.resolve(root);
  if (!resolved || !fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return [];
  const { all } = extractSearchNeedles(message);
  if (!all.length) return [];

  const hits: WorkspaceSearchHit[] = [];
  let seen = 0;

  const walk = (dir: string) => {
    if (hits.length >= 400 || seen >= GREP_FILE_CAP) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (hits.length >= 400 || seen >= GREP_FILE_CAP) return;
      if (!ent.name || ent.name.startsWith(".")) continue;
      const full = path.join(dir, ent.name);
      const rel = path.relative(resolved, full).replace(/\\/g, "/");
      if (ent.isDirectory()) {
        if (SEARCH_SKIP_DIRS.has(ent.name.toLowerCase())) continue;
        const folderScore = Math.max(scoreHaystack(rel, all), scoreHaystack(ent.name, all));
        if (folderScore > 0) {
          hits.push({
            relativePath: rel,
            name: ent.name,
            kind: "folder",
            score: folderScore,
            why: "name",
          });
        }
        walk(full);
        continue;
      }
      if (!ent.isFile()) continue;
      seen += 1;
      const ext = path.extname(ent.name).toLowerCase();
      const pathScore = Math.max(scoreHaystack(rel, all), scoreHaystack(ent.name, all));
      let contentScore = 0;
      let snippet = "";
      if (TEXT_EXTS.has(ext)) {
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          continue;
        }
        const peek = peekTextFile(full, size);
        contentScore = scoreHaystack(peek.slice(0, PEEK_BYTES), all);
        if (contentScore > 0) {
          const lower = peek.toLowerCase();
          const needle = all.find((item) => lower.includes(item.toLowerCase()));
          if (needle) {
            const at = lower.indexOf(needle.toLowerCase());
            snippet = peek.slice(Math.max(0, at - 24), at + needle.length + 40).replace(/\s+/g, " ").trim();
          }
        }
      }
      const score = Math.max(pathScore, contentScore);
      if (score <= 0) continue;
      hits.push({
        relativePath: rel,
        name: ent.name,
        kind: contentScore > pathScore ? "content" : ext.replace(".", "") || "file",
        score: contentScore > pathScore ? contentScore : pathScore,
        why: contentScore > pathScore ? "content" : "path",
        snippet: snippet || undefined,
      });
    }
  };

  walk(resolved);
  return mergeSearchHits(hits).slice(0, maxHits);
}
