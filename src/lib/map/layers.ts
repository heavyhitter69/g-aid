import type { CatalogRecord, CatalogRunProvenance, ProjectCatalog } from "../catalog/types.ts";
import { catalogRecordId } from "../catalog/ids.ts";
import { layerLabel } from "../raster-layers.ts";
import type { MapLayerSpec, RunArtifact } from "./types.ts";
import { displayAdapterFor, formatIdFromPath, isDemAscii } from "./display.ts";
import { crsFromEpsg, crsFromPrj } from "./crs.ts";

function posix(path: string): string {
  return path.replace(/\\/g, "/");
}

export function artifactId(runId: string, relativePath: string): string {
  return `art:${runId}:${posix(relativePath).split("/").pop()}`;
}

export function runIdFromPath(path: string): string | undefined {
  const match = posix(path).match(/G-AID Output\/runs\/([^/]+)/i);
  return match?.[1];
}

function originFor(path: string, displayStatus: MapLayerSpec["displayStatus"]): MapLayerSpec["origin"] {
  if (/G-AID Output\/runs\//i.test(posix(path))) return "derived-run";
  if (displayStatus === "preview") return "preview";
  if (displayStatus === "viewable") return "source";
  return "unsupported";
}

export function layerSpecFromCatalogRecord(record: CatalogRecord): MapLayerSpec {
  const adapter = displayAdapterFor(record.formatId);
  const dem = isDemAscii(record);
  const formatId = dem ? "dem-ascii" : record.formatId;
  const viewable = Boolean(adapter?.viewable);
  const decoded = Boolean(adapter?.decoded);
  let displayStatus: MapLayerSpec["displayStatus"] = "not-viewable";
  if (viewable && decoded) displayStatus = "viewable";
  else if (viewable) displayStatus = "recognised-not-decoded";
  else if (adapter && !adapter.decoded) displayStatus = "recognised-not-decoded";
  const crs = record.crs ? crsFromPrj(record.crs) : record.formatId === "esri-prj" ? crsFromPrj(record.headerSummary) : undefined;
  return {
    id: record.id,
    catalogId: record.id,
    path: record.relativePath,
    label: dem ? `DEM ${record.filename}` : record.filename,
    origin: originFor(record.relativePath, displayStatus),
    displayStatus,
    formatId,
    mediaClass: record.mediaClass,
    supportStatus: record.supportStatus,
    crs,
    units: record.units,
    reason: adapter?.reason,
    representation: decoded && viewable ? "full" : "undecoded",
  };
}

export function layerSpecFromArtifact(artifact: RunArtifact, run?: CatalogRunProvenance): MapLayerSpec {
  const adapter = displayAdapterFor(artifact.formatId);
  const viewable = Boolean(adapter?.viewable && adapter.decoded);
  return {
    id: artifact.artifactId,
    artifactId: artifact.artifactId,
    path: artifact.path,
    label: `${layerLabel(artifact.path)} (${artifact.runId})`,
    origin: "derived-run",
    displayStatus: viewable ? "viewable" : "recognised-not-decoded",
    formatId: artifact.formatId,
    mediaClass: adapter?.kind === "vector" ? "vector" : adapter?.kind === "raster" ? "raster" : "unknown",
    runId: artifact.runId,
    parentRunId: artifact.parentRunId || run?.parentRunId,
    planHash: artifact.planHash || run?.planHash,
    reason: adapter?.reason,
    representation: viewable ? "full" : "undecoded",
  };
}

export function runArtifactsFromPaths(
  paths: string[],
  runs: CatalogRunProvenance[] = []
): RunArtifact[] {
  const byId = new Map(runs.map((run) => [run.runId, run]));
  const out: RunArtifact[] = [];
  for (const raw of paths) {
    const path = posix(raw);
    const runId = runIdFromPath(path);
    if (!runId) continue;
    const formatId = formatIdFromPath(path);
    const adapter = displayAdapterFor(formatId);
    if (!adapter?.viewable) continue;
    const run = byId.get(runId);
    out.push({
      artifactId: artifactId(runId, path),
      runId,
      parentRunId: run?.parentRunId,
      planHash: run?.planHash,
      path,
      filename: path.split("/").pop() || path,
      formatId,
    });
  }
  return out;
}

export function buildMapLayers(options: {
  catalog?: ProjectCatalog | null;
  files?: string[];
}): MapLayerSpec[] {
  const layers: MapLayerSpec[] = [];
  const seen = new Set<string>();
  for (const record of options.catalog?.records || []) {
    const spec = layerSpecFromCatalogRecord(record);
    if (spec.displayStatus === "not-viewable") continue;
    layers.push(spec);
    seen.add(posix(spec.path).toLowerCase());
  }
  for (const artifact of runArtifactsFromPaths(options.files || [], options.catalog?.runs || [])) {
    if (seen.has(posix(artifact.path).toLowerCase())) continue;
    layers.push(layerSpecFromArtifact(artifact, options.catalog?.runs.find((run) => run.runId === artifact.runId)));
  }
  return layers;
}

export function selectLayerById(layers: MapLayerSpec[], id: string): MapLayerSpec | undefined {
  return layers.find((layer) => layer.id === id || layer.catalogId === id || layer.artifactId === id);
}

export function selectLayerByPath(layers: MapLayerSpec[], path: string): MapLayerSpec | undefined {
  const key = posix(path).toLowerCase();
  return layers.find((layer) => posix(layer.path).toLowerCase() === key);
}

/** Synthetic catalog-like id for a path that is not in the source catalog. */
export function displayRecordId(path: string): string {
  return catalogRecordId(path);
}
