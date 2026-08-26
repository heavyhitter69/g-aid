import type { PreviewPolicy } from "./types.ts";

/** Declared preview/overview policy. Large rasters, point clouds, and seismic are not loaded whole. */
export const PREVIEW_POLICY: PreviewPolicy = {
  maxGridCells: 2_000_000,
  maxGridDimension: 4000,
  maxAsciiBytes: 32 * 1024 * 1024,
  maxGeojsonBytes: 8 * 1024 * 1024,
  maxGeojsonFeatures: 20_000,
  maxProfileSamples: 128,
  label: "preview/overview — not the full dataset",
};

export function previewNote(kind: "subsampled-grid" | "truncated-geojson" | "byte-limit"): string {
  if (kind === "subsampled-grid") {
    return `${PREVIEW_POLICY.label}: raster subsampled to ≤ ${PREVIEW_POLICY.maxGridDimension} cells per side.`;
  }
  if (kind === "truncated-geojson") {
    return `${PREVIEW_POLICY.label}: first ${PREVIEW_POLICY.maxGeojsonFeatures} features only.`;
  }
  return `${PREVIEW_POLICY.label}: read stopped at the declared byte limit.`;
}
