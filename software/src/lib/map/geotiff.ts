import type { CrsInfo, RasterGrid } from "./types.ts";
import { PREVIEW_POLICY, previewNote } from "./preview.ts";
import { crsFromEpsg } from "./crs.ts";
import { inspectTiffBuffer } from "../catalog/raster-contract.ts";

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

function readSample(
  buf: Buffer,
  offset: number,
  bits: number,
  sampleFormat: number,
  endian: "LE" | "BE"
): number {
  if (bits === 8) {
    const v = buf[offset];
    return sampleFormat === 2 ? (v << 24) >> 24 : v;
  }
  if (bits === 16) {
    const v = endian === "LE" ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
    return sampleFormat === 2 ? (v << 16) >> 16 : v;
  }
  if (bits === 32 && sampleFormat === 3) {
    return endian === "LE" ? buf.readFloatLE(offset) : buf.readFloatBE(offset);
  }
  if (bits === 32 && sampleFormat === 2) {
    return endian === "LE" ? buf.readInt32LE(offset) : buf.readInt32BE(offset);
  }
  throw new Error("unsupported sample");
}

/**
 * Decode uncompressed Classic TIFF strips (uint8/uint16/int16/int32/float32).
 * Band 1 only when SamplesPerPixel > 1. Compressed, tiled, BigTIFF, and huge
 * rasters return null — catalog inspect still holds metadata and extent.
 */
export function parseGaidGeoTiff(buf: Buffer): GeoTiffDecode | null {
  const inspected = inspectTiffBuffer(buf);
  if (!inspected.pixelsDecodable || !inspected.width || !inspected.height) return null;
  if (inspected.stripOffset == null) return null;
  const nx = inspected.width;
  const ny = inspected.height;
  const bits = inspected.bitsPerSample || 32;
  const fmt = inspected.sampleFormat || 3;
  const samples = inspected.bandCount || 1;
  const endian = inspected.endian || "LE";
  const bytes = bits / 8;
  const stride = bytes * samples;
  const needed = nx * ny * stride;
  if (inspected.stripOffset + needed > buf.length) return null;
  const values = new Float64Array(nx * ny);
  try {
    for (let i = 0; i < nx * ny; i++) {
      values[i] = readSample(buf, inspected.stripOffset + i * stride, bits, fmt, endian);
    }
  } catch {
    return null;
  }
  const gt = inspected.geotransform;
  const dx = Math.abs(gt?.pixelWidth || 1);
  const xmin = gt?.originX ?? 0;
  const ymax = gt?.originY ?? ny * dx;
  const yll = ymax - dx * ny;
  const epsg = inspected.crs?.startsWith("EPSG:") ? Number(inspected.crs.slice(5)) : undefined;
  let grid: RasterGrid = {
    ncols: nx,
    nrows: ny,
    xllcorner: xmin,
    yllcorner: yll,
    cellsize: dx,
    nodata: inspected.nodata ?? -99999,
    values,
    units: inspected.units || (epsg === 4326 ? "degrees" : "metres"),
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
  samples?: number;
  compression?: number;
  tiled?: boolean;
  extraOverviewIfd?: boolean;
  omitCrs?: boolean;
  dummyPixels?: boolean;
}): Buffer {
  const { ncols, nrows, xmin, ymax, dx } = options;
  const nodata = options.nodata ?? -9999;
  const samples = Math.max(1, options.samples ?? 1);
  const compression = options.compression ?? 1;
  const tiled = Boolean(options.tiled);
  const writePixels = !options.dummyPixels && compression === 1 && !tiled;
  const raw = writePixels ? Buffer.alloc(ncols * nrows * 4 * samples) : Buffer.alloc(16, 0);
  if (writePixels) {
    for (let i = 0; i < ncols * nrows; i++) {
      const v = Number(options.values[i] ?? nodata);
      for (let s = 0; s < samples; s++) {
        raw.writeFloatLE(s === 0 ? v : 0, (i * samples + s) * 4);
      }
    }
  }
  const includeCrs = !options.omitCrs;
  const nTags = includeCrs ? 14 : 13;
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
  const offGeo = includeCrs ? add(geokeys) : 0;
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
  const layoutTags = tiled
    ? [tagLong(322, Math.min(ncols, 16)), tagLong(323, Math.min(nrows, 16)), tagLong(324, strip)]
    : [tagLong(273, strip), tagLong(278, nrows), tagLong(279, raw.length)];
  const entries = [
    tagLong(256, ncols),
    tagLong(257, nrows),
    tagShort(258, 32),
    tagShort(259, compression),
    tagShort(262, 1),
    ...layoutTags,
    tagShort(277, samples),
    tagShort(339, 3),
    tagOff(33550, 12, 3, offScale),
    tagOff(33922, 12, 6, offTie),
    ...(includeCrs ? [tagOff(34735, 3, 16, offGeo)] : []),
    tagOff(42113, 2, nodataAscii.length, offNodata),
  ];
  const header = Buffer.alloc(8);
  header.write("II", 0);
  header.writeUInt16LE(42, 2);
  header.writeUInt32LE(8, 4);
  const count = Buffer.alloc(2);
  count.writeUInt16LE(entries.length, 0);
  const next = Buffer.alloc(4);
  const extrasAndRawLen = extras.reduce((n, b) => n + b.length, 0) + raw.length;
  const overviewOffset = 8 + 2 + entries.length * 12 + 4 + extrasAndRawLen;
  if (options.extraOverviewIfd) next.writeUInt32LE(overviewOffset, 0);
  const body = Buffer.concat([header, count, ...entries, next, ...extras, raw]);
  if (!options.extraOverviewIfd) return body;
  const overviewIfd = Buffer.alloc(2 + 4 * 12 + 4);
  overviewIfd.writeUInt16LE(4, 0);
  const ovTags = [
    tagLong(256, Math.max(1, Math.floor(ncols / 2))),
    tagLong(257, Math.max(1, Math.floor(nrows / 2))),
    tagLong(322, 16),
    tagLong(323, 16),
  ];
  ovTags.forEach((tag, i) => tag.copy(overviewIfd, 2 + i * 12));
  next.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, count, ...entries, next, ...extras, raw, overviewIfd]);
}

export function companionAsciiPath(path: string): string {
  return path.replace(/\.(tif|tiff|grd|ers|bil|npz|npy)$/i, ".asc");
}
