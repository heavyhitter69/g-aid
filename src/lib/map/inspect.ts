import { PREVIEW_POLICY } from "./preview.ts";
import type { CrsInfo, ProfileResult, RasterGrid } from "./types.ts";
import { inspectRaster } from "./ascii.ts";

export function sampleProfile(
  grid: RasterGrid,
  a: { x: number; y: number },
  b: { x: number; y: number },
  source: { id: string; path: string; units?: string; crs?: CrsInfo }
): ProfileResult {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const n = PREVIEW_POLICY.maxProfileSamples;
  const samples = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const x = a.x + dx * t;
    const y = a.y + dy * t;
    const hit = inspectRaster(grid, x, y);
    samples.push({
      distance: length * t,
      x,
      y,
      value: hit?.value ?? null,
      nodata: hit ? hit.nodata : true,
    });
  }
  return {
    samples,
    interpolation: "nearest-neighbour",
    units: source.units || grid.units || "unknown",
    crs: source.crs,
    sourceId: source.id,
    sourcePath: source.path,
    representation: grid.preview ? "preview" : "full",
  };
}
