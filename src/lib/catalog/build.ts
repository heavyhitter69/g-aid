import fs from "node:fs";
import path from "node:path";
import { checksumFile } from "./checksum.ts";
import { classifyPeek } from "./classify.ts";
import { catalogRecordId, fileExtension, posixRel } from "./ids.ts";
import { peekFile, peekText } from "./peek.ts";
import {
  CATALOG_SCHEMA_VERSION,
  MAX_CATALOG_FILES,
  PEEK_BYTES,
  SMALL_TEXT_COUNT_BYTES,
  type CatalogRecord,
  type CatalogRunProvenance,
  type ProjectCatalog,
} from "./types.ts";
import { isGaidOutputPath, GAID_OUTPUT_DIR } from "../workspace-index.ts";
import { RUNS_SUBDIR } from "../run-layout.ts";
import type { SniffContext } from "./adapters/types.ts";
import { mergeGravityMappingFromPrevious } from "./gravity-mapping.ts";

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
]);

function skipDirName(name: string): boolean {
  const lower = name.toLowerCase();
  if (SKIP_DIRS.has(lower)) return true;
  return lower === "g-aid output";
}

function countNewlines(absPath: string, size: number): number | undefined {
  if (size <= 0 || size > SMALL_TEXT_COUNT_BYTES) return undefined;
  try {
    const text = fs.readFileSync(absPath, "utf8");
    if (!text) return 0;
    return text.split(/\r?\n/).filter((line) => line.trim()).length;
  } catch {
    return undefined;
  }
}

function inspectRecord(absPath: string, relativePath: string, stat: fs.Stats): CatalogRecord {
  const filename = path.basename(relativePath);
  const extension = fileExtension(filename);
  const parseErrors: string[] = [];
  let peek = Buffer.alloc(0);
  try {
    peek = peekFile(absPath, stat.size);
  } catch (err) {
    parseErrors.push(`Peek failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const ctx: SniffContext = {
    relativePath,
    filename,
    extension,
    size: stat.size,
    peek,
    peekText: peekText(peek),
  };
  const classified = classifyPeek(ctx);
  if (classified.sniff?.parseErrors) parseErrors.push(...classified.sniff.parseErrors);
  if (classified.inspect.parseErrors) parseErrors.push(...classified.inspect.parseErrors);

  let recordCount = classified.inspect.recordCount;
  if (
    recordCount == null &&
    classified.mediaClass === "tabular-text" &&
    classified.supportStatus !== "unknown"
  ) {
    recordCount = countNewlines(absPath, stat.size);
    if (typeof recordCount === "number" && classified.inspect.columns?.length) {
      recordCount = Math.max(0, recordCount - 1);
    }
  }

  const notes = [...(classified.sniff?.notes || [])];
  if (stat.size > PEEK_BYTES) {
    notes.push(`Peeked first ${peek.length} of ${stat.size} bytes.`);
  }

  return {
    id: catalogRecordId(relativePath),
    relativePath,
    filename,
    extension,
    size: stat.size,
    modifiedTime: stat.mtime.toISOString(),
    checksum: checksumFile(absPath, stat.size),
    mediaClass: classified.mediaClass,
    domainHint: classified.domainHint,
    formatId: classified.formatId,
    supportStatus: classified.supportStatus,
    adapterId: classified.adapterId,
    sniffConfidence: classified.sniffConfidence,
    columns: classified.inspect.columns,
    headerSummary: classified.inspect.headerSummary,
    crs: classified.inspect.crs,
    units: classified.inspect.units,
    bbox: classified.inspect.bbox,
    cellSizeM: classified.inspect.cellSizeM,
    timeRange: classified.inspect.timeRange,
    recordCount,
    parseErrors: parseErrors.length ? parseErrors : undefined,
    columnMapping: classified.inspect.columnMapping,
    elevationDatum: classified.inspect.elevationDatum,
    gravityDatum: classified.inspect.gravityDatum,
    provenance: {
      method: classified.method,
      adapterId: classified.adapterId || undefined,
      peekedBytes: peek.length,
      notes: notes.length ? notes : undefined,
    },
  };
}

function collectRuns(root: string, previous?: ProjectCatalog | null): CatalogRunProvenance[] {
  const byId = new Map<string, CatalogRunProvenance>();
  for (const run of previous?.runs || []) {
    if (!run?.runId) continue;
    byId.set(run.runId, { ...run, source: "previous-catalog" });
  }
  const runsDir = path.join(root, GAID_OUTPUT_DIR, RUNS_SUBDIR);
  if (!fs.existsSync(runsDir)) return [...byId.values()];
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(runsDir, { withFileTypes: true });
  } catch {
    return [...byId.values()];
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const planPath = path.join(runsDir, ent.name, "plan.json");
    if (!fs.existsSync(planPath)) {
      if (!byId.has(ent.name)) {
        byId.set(ent.name, { runId: ent.name, source: "disk" });
      }
      continue;
    }
    try {
      const plan = JSON.parse(fs.readFileSync(planPath, "utf8")) as {
        runId?: string;
        parentRunId?: string;
        approvedAt?: string;
        status?: string;
        productsRel?: string;
        intent?: string;
        planHash?: string;
      };
      const runId = plan.runId || ent.name;
      byId.set(runId, {
        runId,
        parentRunId: plan.parentRunId,
        createdAt: plan.approvedAt,
        status: plan.status,
        productsRel: plan.productsRel,
        intent: typeof plan.intent === "string" ? plan.intent : undefined,
        planHash: plan.planHash,
        source: "disk",
      });
    } catch {
      if (!byId.has(ent.name)) byId.set(ent.name, { runId: ent.name, source: "disk" });
    }
  }
  return [...byId.values()].sort((a, b) => a.runId.localeCompare(b.runId));
}

export interface BuildCatalogOptions {
  previous?: ProjectCatalog | null;
  now?: Date;
  fileCountLimit?: number;
}

/** Walk source files read-only. Never writes outside G-AID Output. */
export function buildProjectCatalog(root: string, options: BuildCatalogOptions = {}): ProjectCatalog {
  if (typeof root !== "string" || !root.trim()) {
    throw new Error("workspace root is required");
  }
  const resolvedRoot = path.resolve(root);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
    throw new Error(`Folder not found: ${resolvedRoot}`);
  }

  const limit = options.fileCountLimit ?? MAX_CATALOG_FILES;
  const records: CatalogRecord[] = [];
  let truncated = false;
  let skippedFiles = 0;
  let scanned = 0;

  const walk = (dir: string) => {
    if (records.length >= limit) {
      truncated = true;
      return;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (records.length >= limit) {
        truncated = true;
        return;
      }
      if (!ent.name || ent.name.startsWith(".")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (skipDirName(ent.name)) continue;
        walk(full);
        continue;
      }
      if (!ent.isFile()) continue;
      const rel = posixRel(path.relative(resolvedRoot, full));
      if (isGaidOutputPath(rel)) {
        skippedFiles += 1;
        continue;
      }
      scanned += 1;
      try {
        const stat = fs.statSync(full);
        records.push(inspectRecord(full, rel, stat));
      } catch (err) {
        skippedFiles += 1;
        records.push({
          id: catalogRecordId(rel),
          relativePath: rel,
          filename: ent.name,
          extension: fileExtension(ent.name),
          size: 0,
          modifiedTime: new Date(0).toISOString(),
          checksum: { strategy: "none" },
          mediaClass: "unknown",
          domainHint: "unknown",
          formatId: "unknown",
          supportStatus: "unknown",
          adapterId: null,
          sniffConfidence: 0,
          parseErrors: [`Stat/classify failed: ${err instanceof Error ? err.message : String(err)}`],
          provenance: { method: "unknown", peekedBytes: 0 },
        });
      }
    }
  };

  walk(resolvedRoot);
  records.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  const merged = records.map((record) => mergeGravityMappingFromPrevious(record, options.previous));

  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    generatedAt: (options.now ?? new Date()).toISOString(),
    previousGeneratedAt: options.previous?.generatedAt,
    workspaceRoot: resolvedRoot,
    records: merged,
    runs: collectRuns(resolvedRoot, options.previous),
    truncated,
    truncationReason: truncated ? `Stopped after ${limit} source files.` : undefined,
    skippedOutputDir: true,
    fileCountLimit: limit,
    peekBytes: PEEK_BYTES,
    scannedFiles: scanned,
    skippedFiles,
  };
}
