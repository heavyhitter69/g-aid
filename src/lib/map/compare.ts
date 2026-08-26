import type { CatalogRunProvenance } from "../catalog/types.ts";
import type { MapLayerSpec } from "./types.ts";

export interface RunCompare {
  leftRunId: string;
  rightRunId: string;
  left: MapLayerSpec[];
  right: MapLayerSpec[];
  matched: { left: MapLayerSpec; right: MapLayerSpec }[];
  warnings: string[];
}

function stem(path: string): string {
  const base = path.replace(/\\/g, "/").split("/").pop() || path;
  return base.replace(/\.(tif|tiff|asc|geojson|npz|npy)$/i, "").toLowerCase();
}

export function compareRunLayers(
  layers: MapLayerSpec[],
  leftRunId: string,
  rightRunId: string,
  runs: CatalogRunProvenance[] = []
): RunCompare {
  const left = layers.filter((layer) => layer.runId === leftRunId && layer.displayStatus === "viewable");
  const right = layers.filter((layer) => layer.runId === rightRunId && layer.displayStatus === "viewable");
  const rightByStem = new Map(right.map((layer) => [stem(layer.path), layer]));
  const matched: RunCompare["matched"] = [];
  for (const item of left) {
    const partner = rightByStem.get(stem(item.path));
    if (partner) matched.push({ left: item, right: partner });
  }
  const leftMeta = runs.find((run) => run.runId === leftRunId);
  const rightMeta = runs.find((run) => run.runId === rightRunId);
  const warnings: string[] = [];
  if (!left.length) warnings.push(`No viewable map artifacts in run ${leftRunId}.`);
  if (!right.length) warnings.push(`No viewable map artifacts in run ${rightRunId}.`);
  if (leftMeta?.planHash && rightMeta?.planHash && leftMeta.planHash === rightMeta.planHash) {
    warnings.push("Both runs share the same plan hash; they are not independent revisions.");
  }
  if (rightMeta?.parentRunId === leftRunId) {
    warnings.push(`${rightRunId} is a revision of ${leftRunId}.`);
  }
  return { leftRunId, rightRunId, left, right, matched, warnings };
}

export function provenanceLabel(layer: MapLayerSpec): string {
  if (layer.runId) {
    const parent = layer.parentRunId ? ` · parent ${layer.parentRunId}` : "";
    const hash = layer.planHash ? ` · plan ${layer.planHash.slice(0, 8)}` : "";
    return `Run ${layer.runId}${parent}${hash}`;
  }
  if (layer.catalogId) return `Catalog ${layer.catalogId}`;
  return layer.path;
}
