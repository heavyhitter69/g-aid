import type { RasterGrid } from "./types.ts";
import { PREVIEW_POLICY, previewNote } from "./preview.ts";

export type { RasterGrid } from "./types.ts";

export interface AsciiCommentMeta {
  units?: string;
  quantity?: string;
  channel?: string;
}

function isCommentLine(raw: string): boolean {
  return raw.startsWith("/") || raw.startsWith("#") || raw.startsWith(";") || raw.startsWith("\\");
}

export function parseAsciiCommentMeta(text: string): AsciiCommentMeta {
  const out: AsciiCommentMeta = {};
  for (const line of text.split(/\r?\n/)) {
    const raw = line.trim();
    if (!raw || !isCommentLine(raw)) continue;
    const body = raw.replace(/^[\\/#;]+\s*/, "");
    const match = body.match(/^(Units|Quantity|Channel)\s*[=:]\s*(.+)$/i);
    if (!match) continue;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === "units") out.units = value;
    else if (key === "quantity") out.quantity = value;
    else if (key === "channel") out.channel = value;
  }
  return out;
}

export function parseGridSidecarMeta(text: string): AsciiCommentMeta {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    const units = typeof raw.units === "string" ? raw.units : undefined;
    const quantity = typeof raw.quantity === "string" ? raw.quantity : undefined;
    const channel = typeof raw.channel === "string" ? raw.channel : undefined;
    return { units, quantity, channel };
  } catch {
    return {};
  }
}

export function parseEsriAscii(text: string, options?: { byteLength?: number }): RasterGrid | null {
  if (options?.byteLength && options.byteLength > PREVIEW_POLICY.maxAsciiBytes) {
    return null;
  }
  const lines = text.split(/\r?\n/);
  const comments = parseAsciiCommentMeta(text);
  const meta: Record<string, number> = {};
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i].trim();
    if (!raw || isCommentLine(raw)) {
      i += 1;
      continue;
    }
    break;
  }
  let headerCount = 0;
  while (i < lines.length && headerCount < 12) {
    const parts = lines[i].trim().split(/\s+/);
    if (parts.length < 2) break;
    const key = parts[0].toLowerCase();
    if (!["ncols", "nrows", "xllcorner", "yllcorner", "xllcenter", "yllcenter", "cellsize", "nodata_value"].includes(key)) {
      break;
    }
    meta[key] = parseFloat(parts[1]);
    i += 1;
    headerCount += 1;
  }
  const ncols = meta.ncols;
  const nrows = meta.nrows;
  if (!ncols || !nrows) return null;
  const tooBig =
    ncols > PREVIEW_POLICY.maxGridDimension ||
    nrows > PREVIEW_POLICY.maxGridDimension ||
    ncols * nrows > PREVIEW_POLICY.maxGridCells;
  const stepX = tooBig ? Math.max(1, Math.ceil(ncols / PREVIEW_POLICY.maxGridDimension)) : 1;
  const stepY = tooBig ? Math.max(1, Math.ceil(nrows / PREVIEW_POLICY.maxGridDimension)) : 1;
  const step = Math.max(stepX, stepY);
  const outCols = Math.max(1, Math.floor(ncols / step));
  const outRows = Math.max(1, Math.floor(nrows / step));
  const values = new Float64Array(outCols * outRows);
  const total = ncols * nrows;
  let n = 0;
  for (; i < lines.length && n < total; i++) {
    const parts = lines[i].trim().split(/\s+/);
    for (const part of parts) {
      if (!part) continue;
      const srcRow = Math.floor(n / ncols);
      const srcCol = n % ncols;
      if (srcRow % step === 0 && srcCol % step === 0) {
        const outRow = srcRow / step;
        const outCol = srcCol / step;
        if (outRow < outRows && outCol < outCols) {
          values[outRow * outCols + outCol] = parseFloat(part);
        }
      }
      n += 1;
      if (n >= total) break;
    }
  }
  if (n < total * 0.5) return null;
  const cell = meta.cellsize ?? 1;
  const xll = meta.xllcorner ?? meta.xllcenter ?? 0;
  const yll = meta.yllcorner ?? meta.yllcenter ?? 0;
  const shared = {
    nodata: meta.nodata_value ?? -9999,
    units: comments.units,
    quantity: comments.quantity,
    channel: comments.channel,
  };
  if (step === 1) {
    return {
      ncols,
      nrows,
      xllcorner: xll,
      yllcorner: yll,
      cellsize: cell,
      values,
      ...shared,
    };
  }
  return {
    ncols: outCols,
    nrows: outRows,
    xllcorner: xll,
    yllcorner: yll,
    cellsize: cell * step,
    values,
    preview: true,
    previewNote: previewNote("subsampled-grid"),
    ...shared,
  };
}

export function inspectRaster(grid: RasterGrid, x: number, y: number): {
  col: number;
  row: number;
  value: number | null;
  nodata: boolean;
} | null {
  const col = Math.floor((x - grid.xllcorner) / grid.cellsize);
  const rowFromSouth = Math.floor((y - grid.yllcorner) / grid.cellsize);
  const row = grid.nrows - 1 - rowFromSouth;
  if (col < 0 || row < 0 || col >= grid.ncols || row >= grid.nrows) return null;
  const value = grid.values[row * grid.ncols + col];
  const nodata = !Number.isFinite(value) || value === grid.nodata;
  return { col, row, value: nodata ? null : value, nodata };
}
