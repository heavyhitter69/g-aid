/**
 * Find folders and files the user named — path match first, then a bounded
 * header/content grep. The LLM never needs the whole tree.
 */

import fs from "fs";
import path from "path";
import type { WorkspaceIndex } from "./workspace-index";

export type SearchHitWhy = "path" | "name" | "kind" | "content";

export interface WorkspaceSearchHit {
  relativePath: string;
  name: string;
  kind: string;
  score: number;
  why: SearchHitWhy;
  snippet?: string;
}

export interface SearchNeedles {
  /** Tokens used to score paths (includes instruments, day N, filenames). */
  all: string[];
  /** Tokens the user appeared to name; report these if nothing matches. */
  named: string[];
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".tmp",
  "dist",
  "build",
  "out",
  "__pycache__",
  ".venv",
  "venv",
  ".vscode",
  ".idea",
  "tmp",
  "temp",
  "cache",
  "g-aid output",
]);

const STOP = new Set([
  "the", "and", "for", "with", "from", "this", "that", "please", "just", "only",
  "run", "do", "my", "a", "an", "of", "in", "on", "to", "i", "we", "you", "it",
  "is", "be", "or", "if", "at", "as", "by", "not", "no", "yes", "ok", "okay",
  "survey", "data", "folder", "file", "files", "dataset", "datasets", "open",
  "look", "analyse", "analyze", "analysis", "correct", "correction", "process",
  "processing", "perform", "apply", "start", "execute", "invert", "grid",
  "reduce", "plan", "full", "mean", "median", "base", "station", "airborne",
  "magnetic", "magnetics", "would", "could", "should", "want", "need", "make",
  "using", "into", "over", "under", "then", "than", "also", "here", "there",
  "what", "which", "when", "where", "how", "about", "your", "our", "their",
  "can", "will", "let", "get", "see", "use", "used", "work", "working",
]);

const KIND_ALIASES: Record<string, string[]> = {
  "gsm19-base": ["gsm-19", "gsm19", "base station", "base-station", "overhauser"],
  magarrow: ["magarrow", "mag-arrow", "airborne mag", "10hz"],
  tabular: ["csv", "txt", "table"],
};

const TEXT_EXTS = new Set([
  ".csv", ".txt", ".dat", ".xyz", ".las", ".json", ".geojson", ".md", ".prj",
  ".wkt", ".yaml", ".yml", ".asc", ".log",
]);

const PEEK_BYTES = 4096;
const GREP_FILE_CAP = 8000;
const DEFAULT_HIT_CAP = 40;

export function normalizeSearchText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[_./\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractSearchNeedles(message: string): SearchNeedles {
  const text = String(message || "").trim();
  const all: string[] = [];
  const named: string[] = [];

  const push = (value: string, isNamed = false) => {
    const trimmed = value.replace(/^[,.;:]+|[,.;:]+$/g, "").trim();
    if (!trimmed) return;
    if (!all.some((item) => item.toLowerCase() === trimmed.toLowerCase())) all.push(trimmed);
    if (isNamed && !named.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
      named.push(trimmed);
    }
  };

  for (const match of text.matchAll(/["'`]([^"'`]{1,120})["'`]/g)) {
    push(match[1], true);
  }

  const day = text.match(/\bday\s*0*(\d+)\b/i);
  if (day) {
    push(`day ${day[1]}`, true);
    push(`DAY ${day[1]}`, true);
  }

  for (const match of text.matchAll(
    /\b[\w.+()[\] -]{2,}\.(csv|txt|dat|xyz|las|sgy|segy|dzt|grd|tif|tiff|png|json|geojson)\b/gi
  )) {
    push(match[0], true);
  }

  for (const raw of text.split(/[^a-zA-Z0-9()+_-]+/)) {
    if (raw.length < 3) continue;
    const lower = raw.toLowerCase();
    if (STOP.has(lower)) continue;
    const looksNamed =
      raw.length >= 4 &&
      (/[0-9]/.test(raw) ||
        /[A-Z]/.test(raw) && /[a-z]/.test(raw) === false && raw.length >= 4 ||
        /[A-Z]/.test(raw) && raw.length >= 5);
    push(raw, looksNamed);
  }

  return { all, named };
}

function scoreHaystack(haystack: string, needles: string[]): number {
  const hay = normalizeSearchText(haystack);
  if (!hay) return 0;
  let score = 0;
  for (const needle of needles) {
    const query = normalizeSearchText(needle);
    if (!query) continue;
    if (hay === query) score += 120;
    else if (hay.includes(query)) score += 50;
    else if (query.includes(hay) && hay.length >= 3) score += 25;
    else {
      const parts = query.split(" ").filter(Boolean);
      if (parts.length > 1 && parts.every((part) => hay.includes(part))) score += 30;
    }
  }
  return score;
}

function kindScore(kind: string, needles: string[]): number {
  const aliases = KIND_ALIASES[kind] || [kind];
  const hay = aliases.join(" ");
  return scoreHaystack(`${kind} ${hay}`, needles);
}

function hitName(rel: string): string {
  const parts = rel.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] || rel;
}

function isSkippedRel(rel: string): boolean {
  return rel
    .replace(/\\/g, "/")
    .split("/")
    .some((part) => SKIP_DIRS.has(part.toLowerCase()));
}

export function mergeSearchHits(...lists: WorkspaceSearchHit[][]): WorkspaceSearchHit[] {
  const map = new Map<string, WorkspaceSearchHit>();
  for (const list of lists) {
    for (const hit of list) {
      const key = hit.relativePath.replace(/\\/g, "/");
      const prev = map.get(key);
      if (!prev || hit.score > prev.score) map.set(key, { ...hit, relativePath: key });
    }
  }
  return [...map.values()].sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath));
}

export function searchWorkspaceIndex(
  index: WorkspaceIndex | null,
  message: string,
  maxHits = DEFAULT_HIT_CAP
): WorkspaceSearchHit[] {
  if (!index) return [];
  const { all } = extractSearchNeedles(message);
  if (!all.length) return [];

  const hits: WorkspaceSearchHit[] = [];

  for (const folder of index.folders || []) {
    if (isSkippedRel(folder)) continue;
    const name = hitName(folder);
    const pathScore = scoreHaystack(folder, all);
    const nameScore = scoreHaystack(name, all);
    const score = Math.max(pathScore, nameScore);
    if (score <= 0) continue;
    hits.push({
      relativePath: folder.replace(/\\/g, "/"),
      name,
      kind: "folder",
      score: nameScore >= pathScore ? nameScore + 8 : pathScore,
      why: nameScore >= pathScore ? "name" : "path",
    });
  }

  for (const file of index.files || []) {
    if (isSkippedRel(file.relativePath)) continue;
    const pathScore = scoreHaystack(file.relativePath, all);
    const nameScore = scoreHaystack(file.name, all);
    const typeScore = kindScore(file.kind, all);
    const score = Math.max(pathScore, nameScore, typeScore);
    if (score <= 0) continue;
    const why: SearchHitWhy =
      typeScore > pathScore && typeScore > nameScore ? "kind" : nameScore >= pathScore ? "name" : "path";
    hits.push({
      relativePath: file.relativePath.replace(/\\/g, "/"),
      name: file.name,
      kind: file.kind,
      score,
      why,
    });
  }

  return hits.sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath)).slice(0, maxHits);
}

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
        if (SKIP_DIRS.has(ent.name.toLowerCase())) continue;
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

export function unmatchedNeedles(named: string[], hits: WorkspaceSearchHit[]): string[] {
  if (!named.length) return [];
  return named.filter((needle) => {
    const query = normalizeSearchText(needle);
    if (!query) return false;
    return !hits.some((hit) => {
      const hay = normalizeSearchText(`${hit.relativePath} ${hit.name} ${hit.kind} ${hit.snippet || ""}`);
      return hay.includes(query) || query.split(" ").every((part) => part && hay.includes(part));
    });
  });
}

export function formatSearchHits(hits: WorkspaceSearchHit[], misses: string[] = []): string {
  const lines: string[] = [];
  if (hits.length) {
    lines.push("Search hits (from the open folder, not a built-in catalog):");
    for (const hit of hits.slice(0, 24)) {
      const extra = hit.snippet ? ` — ${hit.snippet}` : "";
      lines.push(`- ${hit.relativePath} (${hit.kind}, ${hit.why}${extra})`);
    }
  }
  if (misses.length) {
    lines.push(`Named but not found in the open folder: ${misses.join(", ")}`);
  }
  return lines.join("\n");
}

function folderFromFileRel(rel: string): string {
  const parts = rel.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

/**
 * Pick the survey subfolder the user meant. Day N still wins when a matching
 * folder exists; otherwise the best search hit.
 */
export function inferTargetFolder(
  message: string,
  index: WorkspaceIndex | null,
  hits?: WorkspaceSearchHit[]
): string {
  const folders = (index?.folders ?? []).filter((folder) => !isSkippedRel(folder));
  const files = (index?.files ?? []).filter((file) => !isSkippedRel(file.relativePath));
  const names = [
    ...folders.map((folder) => folder.replace(/\\/g, "/")),
    ...files.map((file) => file.relativePath.replace(/\\/g, "/").split("/")[0]).filter(Boolean),
  ];
  const unique = [...new Set(names)];

  const dayMatch = message.match(/\bday\s*0*(\d+)\b/i);
  if (dayMatch) {
    const n = dayMatch[1];
    const re = new RegExp(`^day\\s*0*${n}$`, "i");
    const hit = unique.find((folder) => re.test(folder.split("/").pop() || folder));
    if (hit) return hit;
    const nested = files.find((file) =>
      file.relativePath.split(/[\\/]/).some((part) => re.test(part))
    );
    if (nested) {
      const parts = nested.relativePath.replace(/\\/g, "/").split("/");
      const idx = parts.findIndex((part) => re.test(part));
      if (idx >= 0) return parts.slice(0, idx + 1).join("/");
    }
  }

  const ranked = (hits ?? searchWorkspaceIndex(index, message)).filter((hit) => hit.score >= 25);
  const folderHit = ranked.find((hit) => hit.kind === "folder");
  if (folderHit) return folderHit.relativePath;
  const fileHit = ranked.find((hit) => hit.kind !== "folder");
  if (fileHit) {
    const parent = folderFromFileRel(fileHit.relativePath);
    if (parent) return parent;
  }
  return "";
}
