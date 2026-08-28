import type { ProjectCatalog } from "../catalog/types.ts";
import { inventoryAnswer } from "../catalog/summarize.ts";
import { isCrs84Key, overlayDecision } from "./crs.ts";
import { provenanceLabel } from "./compare.ts";
import { displayAdapterFor } from "./display.ts";
import type { MapLayerSpec } from "./types.ts";

export function isMapQuestion(message: string): boolean {
  const t = message.trim().toLowerCase();
  if (!t) return false;
  if (/\b(proceed|run diurnal|grid the|rtp)\b/.test(t)) return false;
  return (
    /\b(map|layer|layers|crs|overlay|on the map|coordinate|legend|compare runs?)\b/.test(t) ||
    /\bwhat (crs|datum|projection)\b/.test(t) ||
    /\bshow (the )?(dem|geojson|grid|tmi|rtp)\b/.test(t)
  );
}

export function mapWorkspaceAnswer(options: {
  catalog?: ProjectCatalog | null;
  layers?: MapLayerSpec[];
  message: string;
}): string {
  const layers = options.layers || [];
  const t = options.message.toLowerCase();
  if (/\bcompare runs?\b/.test(t)) {
    const runs = [...new Set(layers.filter((layer) => layer.runId).map((layer) => layer.runId))];
    if (runs.length < 2) {
      return "I can compare two versioned run folders when both have viewable map artifacts. I do not have two magnetic runs with map products yet.";
    }
    return `I can compare runs ${runs.slice(0, 8).join(", ")} by switching layers or transparency. A visual overlay is not geological proof.`;
  }
  if (/\bcrs|datum|projection\b/.test(t)) {
    const documented = (layer: (typeof layers)[number]) =>
      Boolean(layer.crs && !layer.crs.assumed && layer.crs.key !== "unknown" && (layer.crs.epsg || isCrs84Key(layer.crs.key)));
    const known = layers.filter(documented);
    const unknown = layers.filter((layer) => layer.displayStatus === "viewable" && !documented(layer));
    const lines = [
      known.length
        ? `Documented CRS: ${[...new Set(known.map((layer) => layer.crs?.label))].join("; ")}.`
        : "No layer on the map has a documented CRS (OGC:CRS84 or EPSG).",
      unknown.length ? `${unknown.length} viewable layer(s) have unknown CRS. Overlay is blocked until CRS is documented.` : "",
      "OGC:CRS84 is WGS 84 longitude-latitude degrees and is not EPSG:4326. I will not silently reproject or swap axes.",
    ];
    return lines.filter(Boolean).join(" ");
  }
  if (/\blayer|on the map|map\b/.test(t)) {
    const viewable = layers.filter((layer) => layer.displayStatus === "viewable");
    const blocked = layers.filter((layer) => layer.displayStatus !== "viewable" && layer.displayStatus !== "not-viewable");
    const lines = [
      viewable.length
        ? `Viewable map layers: ${viewable.slice(0, 12).map((layer) => `${layer.label} [${layer.origin}]`).join("; ")}.`
        : "No viewable map layers are loaded yet. Open a completed magnetic run or a catalog GeoJSON/DEM/ASCII record.",
      blocked.length
        ? `Recognised but not decoded: ${blocked.slice(0, 8).map((layer) => `${layer.label} (${layer.formatId})`).join("; ")}.`
        : "",
      "A visual overlay does not prove geological, mineral, or geophysical causation.",
    ];
    return lines.filter(Boolean).join(" ");
  }
  const spatial = (options.catalog?.records || []).filter(
    (record) => record.mediaClass === "raster" || record.mediaClass === "vector"
  );
  if (spatial.length && options.catalog) {
    return `${inventoryAnswer(options.catalog)}\n\nSpatial catalog records: ${spatial.length}. Display is not processing support.`;
  }
  return inventoryAnswer(options.catalog ?? null);
}

export function overlayWarning(a?: MapLayerSpec, b?: MapLayerSpec): string | undefined {
  if (!a || !b) return undefined;
  return overlayDecision(a.crs, b.crs).message;
}

export function interpretationLimit(): string {
  return "A visual overlay or colour scale does not prove geological, mineral, or geophysical causation.";
}

export function proposeDisplayAction(formatId: string): string {
  const adapter = displayAdapterFor(formatId);
  if (!adapter?.viewable) {
    return `${formatId} is not a display adapter in this release. I will not pretend to decode it.`;
  }
  return `I can add ${formatId} as a map layer (${adapter.reason}) without treating it as a processing input.`;
}

export { provenanceLabel };
