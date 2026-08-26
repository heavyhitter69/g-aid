import type { CrsInfo, RasterGrid } from "./types.ts";
import { PREVIEW_POLICY, previewNote } from "./preview.ts";
import { crsFromEpsg } from "./crs.ts";

function subsampleGrid(grid: RasterGrid): RasterGrid {
  const stepX = Math.max(1, Math.ceil(grid.ncols / PREVIEW_POLICY.maxGridDimension));
  const stepY = Math.max(1, Math.ceil(grid.nrows / PREVIEW_POLICY.maxGridDimension));
  const step = Math.max(stepX, stepY);
  if (step <= 1 && grid.ncols * grid.nrows <= PREVIEW_POLICY.maxGridCells) return grid;
  const ncols = Math.max(1, Math.floor(grid.ncols / step));
  const nrows = Math.max(1, Math.floor(grid.nrows / step));
  const values = new Float64Array(ncols * nrows);
  for (let r = 0; r < nrows; r++) {
    for (let c = 0; c < ncols; c++) {
      values[r * ncols + c] = grid.values[(r * step) * grid.ncols + c * step];
    }
  }
  return {
    ...grid,
    ncols,
    nrows,
    cellsize: grid.cellsize * step,
    values,
    preview: true,
    previewNote: previewNote("subsampled-grid"),
  };
}

export interface GeoTiffDecode {
  grid: RasterGrid;
  crs?: CrsInfo;
  ascii: string;
}

function gridToAscii(grid: RasterGrid): string {
  const lines = [
    `ncols         ${grid.ncols}`,
    `nrows         ${grid.nrows}`,
    `xllcorner     ${grid.xllcorner}`,
    `yllcorner     ${grid.yllcorner}`,
    `cellsize      ${grid.cellsize}`,
    `NODATA_value  ${grid.nodata}`,
  ];
  for (let r = 0; r < grid.nrows; r++) {
    const row: string[] = [];
    for (let c = 0; c < grid.ncols; c++) {
      const v = grid.values[r * grid.ncols + c];
      row.push(Number.isFinite(v) ? String(v) : String(grid.nodata));
    }
    lines.push(row.join(" "));
  }
  return lines.join("\n");
}

function readEpsgFromGeoKeys(buf: Buffer, offset: number, count: number): number | undefined {
  if (offset + 8 > buf.length) return undefined;
  const nKeys = buf.readUInt16LE(offset + 6);
  const usable = Math.min(nKeys, Math.floor((count - 4) / 4));
  for (let i = 0; i < usable; i++) {
    const o = offset + 8 + i * 8;
    if (o + 8 > buf.length) break;
    const id = buf.readUInt16LE(o);
    const value = buf.readUInt16LE(o + 6);
    if (id === 3072 || id === 2048) return value;
  }
  return undefined;
}

/**
 * Decode uncompressed little-endian G-AID GeoTIFF 1.0 (float32 or int32).
 * Compressed COGs, tiled TIFFs, and BigTIFF are not decoded.
 */
export function parseGaidGeoTiff(buf: Buffer): GeoTiffDecode | null {
  if (buf.length < 8) return null;
  if (buf.toString("ascii", 0, 2) !== "II" || buf.readUInt16LE(2) !== 42) return null;
  const ifd = buf.readUInt32LE(4);
  if (ifd + 2 > buf.length) return null;
  const n = buf.readUInt16LE(ifd);
  const tags: Record<number, { typ: number; count: number; val: number }> = {};
  for (let i = 0; i < n; i++) {
    const o = ifd + 2 + i * 12;
    if (o + 12 > buf.length) return null;
    tags[buf.readUInt16LE(o)] = {
      typ: buf.readUInt16LE(o + 2),
      count: buf.readUInt32LE(o + 4),
      val: buf.readUInt32LE(o + 8),
    };
  }
  const nx = tags[256]?.val;
  const ny = tags[257]?.val;
  const strip = tags[273]?.val;
  const compression = tags[259]?.val ?? 1;
  const fmt = tags[339]?.val ?? 3;
  if (compression !== 1) return null;
  if (!nx || !ny || strip == null) return null;
  if (nx > PREVIEW_POLICY.maxGridDimension * 8 || ny > PREVIEW_POLICY.maxGridDimension * 8) return null;
  let dx = 1;
  let xmin = 0;
  let ymax = ny;
  if (tags[33550]?.typ === 12) dx = buf.readDoubleLE(tags[33550].val);
  if (tags[33922]?.typ === 12) {
    xmin = buf.readDoubleLE(tags[33922].val + 24);
    ymax = buf.readDoubleLE(tags[33922].val + 32);
  }
  let nodata = -99999;
  if (tags[42113]) {
    nodata = parseFloat(buf.toString("ascii", tags[42113].val, tags[42113].val + tags[42113].count)) || -99999;
  }
  let epsg: number | undefined;
  if (tags[34735]) {
    epsg = readEpsgFromGeoKeys(buf, tags[34735].val, tags[34735].count);
  }
  const values = new Float64Array(nx * ny);
  try {
    if (fmt === 3) {
      for (let i = 0; i < nx * ny; i++) values[i] = buf.readFloatLE(strip + i * 4);
    } else if (fmt === 2) {
      for (let i = 0; i < nx * ny; i++) values[i] = buf.readInt32LE(strip + i * 4);
    } else {
      return null;
    }
  } catch {
    return null;
  }
  const yll = ymax - dx * ny;
  let grid: RasterGrid = {
    ncols: nx,
    nrows: ny,
    xllcorner: xmin,
    yllcorner: yll,
    cellsize: dx,
    nodata,
    values,
    units: epsg === 4326 ? "degrees" : "metres",
  };
  grid = subsampleGrid(grid);
  return {
    grid,
    crs: crsFromEpsg(epsg, "geotiff"),
    ascii: gridToAscii(grid),
  };
}

/** Encode a small uncompressed LE float32 GeoTIFF for tests and round-trips. */
export function encodeGaidGeoTiff(options: {
  ncols: number;
  nrows: number;
  xmin: number;
  ymax: number;
  dx: number;
  nodata?: number;
  values: ArrayLike<number>;
  epsg?: number;
}): Buffer {
  const { ncols, nrows, xmin, ymax, dx } = options;
  const nodata = options.nodata ?? -9999;
  const raw = Buffer.alloc(ncols * nrows * 4);
  for (let i = 0; i < ncols * nrows; i++) raw.writeFloatLE(Number(options.values[i] ?? nodata), i * 4);
  const nTags = 14;
  const ifdStart = 8;
  const extraStart = ifdStart + 2 + nTags * 12 + 4;
  const extras: Buffer[] = [];
  let extraLen = 0;
  const add = (buf: Buffer) => {
    const off = extraStart + extraLen;
    extras.push(buf);
    extraLen += buf.length + (buf.length % 2);
    if (buf.length % 2) extras.push(Buffer.from([0]));
    return off;
  };
  const pixelScale = Buffer.alloc(24);
  pixelScale.writeDoubleLE(dx, 0);
  pixelScale.writeDoubleLE(dx, 8);
  pixelScale.writeDoubleLE(0, 16);
  const tie = Buffer.alloc(48);
  tie.writeDoubleLE(xmin, 24);
  tie.writeDoubleLE(ymax, 32);
  const geokeys = Buffer.alloc(32);
  geokeys.writeUInt16LE(1, 0);
  geokeys.writeUInt16LE(1, 2);
  geokeys.writeUInt16LE(0, 4);
  geokeys.writeUInt16LE(3, 6);
  const epsg = options.epsg ?? 32630;
  const modelType = epsg === 4326 ? 2 : 1;
  const crsKey = epsg === 4326 ? 2048 : 3072;
  geokeys.writeUInt16LE(1024, 8);
  geokeys.writeUInt16LE(0, 10);
  geokeys.writeUInt16LE(1, 12);
  geokeys.writeUInt16LE(modelType, 14);
  geokeys.writeUInt16LE(1025, 16);
  geokeys.writeUInt16LE(0, 18);
  geokeys.writeUInt16LE(1, 20);
  geokeys.writeUInt16LE(1, 22);
  geokeys.writeUInt16LE(crsKey, 24);
  geokeys.writeUInt16LE(0, 26);
  geokeys.writeUInt16LE(1, 28);
  geokeys.writeUInt16LE(epsg, 30);
  const nodataAscii = Buffer.from(`${nodata}\0`, "ascii");
  const offScale = add(pixelScale);
  const offTie = add(tie);
  const offGeo = add(geokeys);
  const offNodata = add(nodataAscii);
  const strip = extraStart + extraLen;

  const tagLong = (code: number, value: number) => {
    const b = Buffer.alloc(12);
    b.writeUInt16LE(code, 0);
    b.writeUInt16LE(4, 2);
    b.writeUInt32LE(1, 4);
    b.writeUInt32LE(value, 8);
    return b;
  };
  const tagShort = (code: number, value: number) => {
    const b = Buffer.alloc(12);
    b.writeUInt16LE(code, 0);
    b.writeUInt16LE(3, 2);
    b.writeUInt32LE(1, 4);
    b.writeUInt16LE(value, 8);
    b.writeUInt16LE(0, 10);
    return b;
  };
  const tagOff = (code: number, typ: number, count: number, off: number) => {
    const b = Buffer.alloc(12);
    b.writeUInt16LE(code, 0);
    b.writeUInt16LE(typ, 2);
    b.writeUInt32LE(count, 4);
    b.writeUInt32LE(off, 8);
    return b;
  };
  const entries = [
    tagLong(256, ncols),
    tagLong(257, nrows),
    tagShort(258, 32),
    tagShort(259, 1),
    tagShort(262, 1),
    tagLong(273, strip),
    tagShort(277, 1),
    tagLong(278, nrows),
    tagLong(279, raw.length),
    tagShort(339, 3),
    tagOff(33550, 12, 3, offScale),
    tagOff(33922, 12, 6, offTie),
    tagOff(34735, 3, 16, offGeo),
    tagOff(42113, 2, nodataAscii.length, offNodata),
  ];
  const header = Buffer.alloc(8);
  header.write("II", 0);
  header.writeUInt16LE(42, 2);
  header.writeUInt32LE(8, 4);
  const count = Buffer.alloc(2);
  count.writeUInt16LE(entries.length, 0);
  const next = Buffer.alloc(4);
  return Buffer.concat([header, count, ...entries, next, ...extras, raw]);
}

export function companionAsciiPath(path: string): string {
  return path.replace(/\.(tif|tiff|grd|ers|bil|npz|npy)$/i, ".asc");
}
