/**
 * Raster catalog contract. Metadata-first: IFD / ASCII headers are parsed;
 * full pixel arrays are never loaded into the catalog or the LLM.
 *
 * Supported inspect: Classic TIFF/GeoTIFF (strips or tiles) with dimensions and
 * a geotransform, and ESRI ASCII grids with ncols/nrows/cellsize/origin.
 * Pixel decode for map viewing is a separate, narrower path.
 *
 * A filename containing "dem" is not a DEM. DEM support requires the documented
 * ASCII elevation contract (EPSG, Units=m, ElevationDatum).
 */

import type { CatalogBBox } from "./types.ts";
import { firstLines, headerSummaryFromText } from "./peek-text.ts";

export const GEOTIFF_ADAPTER_ID = "geotiff";
export const GEOTIFF_FORMAT = "geotiff";
export const ASCII_GRID_ADAPTER_ID = "esri-ascii-grid";
export const ASCII_GRID_FORMAT = "esri-ascii-grid";

/** Match map PREVIEW_POLICY. Catalog inspect never allocates pixel arrays this large. */
export const RASTER_PREVIEW_LIMITS = {
  maxGridCells: 2_000_000,
  maxGridDimension: 4000,
  maxAsciiBytes: 32 * 1024 * 1024,
};

export type RasterEndian = "LE" | "BE";
export type RasterLayout = "strips" | "tiled" | "ascii" | "unknown";
export type RasterCompressionName =
  | "uncompressed"
  | "lzw"
  | "deflate"
  | "jpeg"
  | "packbits"
  | "other"
  | "unknown";
export type RasterContractKind = "geotiff-classic" | "cog-layout" | "esri-ascii" | "bigtiff" | "unknown";

export interface RasterGeotransform {
  /** GDAL affine: X = [0] + col*[1] + row*[2]; Y = [3] + col*[4] + row*[5]. */
  affine: [number, number, number, number, number, number];
  originX: number;
  originY: number;
  pixelWidth: number;
  pixelHeight: number;
}

export interface TiffTagValue {
  code: number;
  typ: number;
  count: number;
  valueOrOffset: number;
  extra?: Buffer;
}

export interface RasterInspect {
  looksLikeTiff: boolean;
  looksLikeAscii: boolean;
  isBigTiff: boolean;
  endian?: RasterEndian;
  width?: number;
  height?: number;
  bandCount?: number;
  bitsPerSample?: number;
  sampleFormat?: number;
  dataType?: string;
  photometric?: number;
  compression?: RasterCompressionName;
  compressionCode?: number;
  layout?: RasterLayout;
  tileWidth?: number;
  tileLength?: number;
  overviewCount: number;
  cogLike: boolean;
  geotransform?: RasterGeotransform;
  bbox?: CatalogBBox;
  cellSizeM?: number;
  crs?: string;
  crsConfidence?: "high" | "medium" | "none";
  crsSource?: "geotiff-geokeys" | "epsg-comment";
  nodata?: number;
  nodataPresent: boolean;
  units?: string;
  valueMin?: number;
  valueMax?: number;
  statisticsSource?: "header-sample" | "none";
  pixelsDecodable: boolean;
  previewRequired: boolean;
  ifdBeyondBuffer: boolean;
  rasterContract?: RasterContractKind;
  stripOffset?: number;
  stripByteCount?: number;
  planarConfiguration?: number;
  errors: string[];
  warnings: string[];
  notes: string[];
}

const TYPE_SIZE: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
};

function emptyRasterInspect(): RasterInspect {
  return {
    looksLikeTiff: false,
    looksLikeAscii: false,
    isBigTiff: false,
    overviewCount: 0,
    cogLike: false,
    nodataPresent: false,
    pixelsDecodable: false,
    previewRequired: false,
    ifdBeyondBuffer: false,
    errors: [],
    warnings: [],
    notes: [],
  };
}

export function tiffSignature(buf: Buffer): {
  looksLikeTiff: boolean;
  isBigTiff: boolean;
  endian?: RasterEndian;
} {
  if (buf.length < 4) return { looksLikeTiff: false, isBigTiff: false };
  const le = buf[0] === 0x49 && buf[1] === 0x49;
  const be = buf[0] === 0x4d && buf[1] === 0x4d;
  if (!le && !be) return { looksLikeTiff: false, isBigTiff: false };
  const endian: RasterEndian = le ? "LE" : "BE";
  const magic = endian === "LE" ? buf.readUInt16LE(2) : buf.readUInt16BE(2);
  if (magic === 42) return { looksLikeTiff: true, isBigTiff: false, endian };
  if (magic === 43) return { looksLikeTiff: true, isBigTiff: true, endian };
  return { looksLikeTiff: false, isBigTiff: false };
}

function readU16(buf: Buffer, offset: number, endian: RasterEndian): number {
  return endian === "LE" ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
}

function readU32(buf: Buffer, offset: number, endian: RasterEndian): number {
  return endian === "LE" ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
}

function readU16Extra(extra: Buffer | undefined, endian: RasterEndian, index = 0): number | undefined {
  if (!extra || extra.length < (index + 1) * 2) return undefined;
  return endian === "LE" ? extra.readUInt16LE(index * 2) : extra.readUInt16BE(index * 2);
}

function compressionName(code: number | undefined): RasterCompressionName {
  if (code == null) return "unknown";
  if (code === 1) return "uncompressed";
  if (code === 5) return "lzw";
  if (code === 7) return "jpeg";
  if (code === 8 || code === 32946) return "deflate";
  if (code === 32773) return "packbits";
  return "other";
}

function dataTypeName(bits: number | undefined, sampleFormat: number | undefined, photometric?: number): string {
  const fmt = sampleFormat ?? 1;
  if (bits === 8 && fmt === 1) return photometric === 2 ? "uint8-rgb" : "uint8";
  if (bits === 8 && fmt === 2) return "int8";
  if (bits === 16 && fmt === 1) return "uint16";
  if (bits === 16 && fmt === 2) return "int16";
  if (bits === 32 && fmt === 1) return "uint32";
  if (bits === 32 && fmt === 2) return "int32";
  if (bits === 32 && fmt === 3) return "float32";
  if (bits === 64 && fmt === 3) return "float64";
  if (bits) return `bits${bits}-fmt${fmt}`;
  return "unknown";
}

function tagNumber(tag: TiffTagValue | undefined, endian: RasterEndian): number | undefined {
  if (!tag) return undefined;
  const size = TYPE_SIZE[tag.typ] || 1;
  if (tag.count * size <= 4) {
    if (tag.typ === 3) return tag.valueOrOffset & 0xffff;
    return tag.valueOrOffset;
  }
  if (tag.extra) {
    if (tag.typ === 3) return readU16(tag.extra, 0, endian);
    if (tag.typ === 4) return readU32(tag.extra, 0, endian);
  }
  return tag.valueOrOffset;
}

function readDoubles(extra: Buffer | undefined, endian: RasterEndian, count: number): number[] {
  if (!extra) return [];
  const out: number[] = [];
  const n = Math.min(count, Math.floor(extra.length / 8));
  for (let i = 0; i < n; i++) {
    out.push(endian === "LE" ? extra.readDoubleLE(i * 8) : extra.readDoubleBE(i * 8));
  }
  return out;
}

function epsgFromGeoKeys(extra: Buffer | undefined, endian: RasterEndian): number | undefined {
  if (!extra || extra.length < 8) return undefined;
  const nKeys = readU16(extra, 6, endian);
  const usable = Math.min(nKeys, Math.floor((extra.length - 8) / 8));
  for (let i = 0; i < usable; i++) {
    const o = 8 + i * 8;
    const id = readU16(extra, o, endian);
    const value = readU16(extra, o + 6, endian);
    if (id === 3072 || id === 2048) return value;
  }
  return undefined;
}

function asciiFromTag(tag: TiffTagValue | undefined): string | undefined {
  if (!tag) return undefined;
  if (tag.extra) {
    return tag.extra.toString("ascii").replace(/\0+$/, "").trim();
  }
  if (tag.typ === 2 && tag.count <= 4) {
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(tag.valueOrOffset, 0);
    return buf.toString("ascii").replace(/\0+$/, "").trim();
  }
  return undefined;
}

export function inspectTiffTags(options: {
  endian: RasterEndian;
  isBigTiff: boolean;
  tags: TiffTagValue[];
  extraIfdCount: number;
  fileSize?: number;
}): RasterInspect {
  const out = emptyRasterInspect();
  out.looksLikeTiff = true;
  out.endian = options.endian;
  out.isBigTiff = options.isBigTiff;
  if (options.isBigTiff) {
    out.rasterContract = "bigtiff";
    out.errors.push("BigTIFF is recognised. Classic TIFF IFD parsing is not applied; pixels were not loaded.");
    out.notes.push("BigTIFF stays recognised-unsupported until a BigTIFF reader is registered.");
    return out;
  }

  const byCode = new Map<number, TiffTagValue>();
  for (const tag of options.tags) byCode.set(tag.code, tag);
  const endian = options.endian;
  const width = tagNumber(byCode.get(256), endian);
  const height = tagNumber(byCode.get(257), endian);
  const bits = tagNumber(byCode.get(258), endian) ?? readU16Extra(byCode.get(258)?.extra, endian);
  const compressionCode = tagNumber(byCode.get(259), endian) ?? 1;
  const photometric = tagNumber(byCode.get(262), endian);
  const samples = tagNumber(byCode.get(277), endian) ?? 1;
  const sampleFormat = tagNumber(byCode.get(339), endian) ?? 1;
  const tileWidth = tagNumber(byCode.get(322), endian);
  const tileLength = tagNumber(byCode.get(323), endian);
  const tiled = Boolean(tileWidth && tileLength);
  const hasStrips = byCode.has(273);
  const stripOffset = tagNumber(byCode.get(273), endian);
  const stripByteCount = tagNumber(byCode.get(279), endian);
  const planarConfiguration = tagNumber(byCode.get(284), endian) ?? 1;

  out.width = width;
  out.height = height;
  out.bandCount = samples;
  out.bitsPerSample = bits;
  out.sampleFormat = sampleFormat;
  out.photometric = photometric;
  out.compressionCode = compressionCode;
  out.compression = compressionName(compressionCode);
  out.layout = tiled ? "tiled" : hasStrips ? "strips" : "unknown";
  out.tileWidth = tileWidth;
  out.tileLength = tileLength;
  out.stripOffset = stripOffset;
  out.stripByteCount = stripByteCount;
  out.planarConfiguration = planarConfiguration;
  out.overviewCount = options.extraIfdCount;
  out.cogLike = tiled && options.extraIfdCount > 0;
  out.dataType = dataTypeName(bits, sampleFormat, photometric);
  out.rasterContract = out.cogLike ? "cog-layout" : "geotiff-classic";

  const scale = readDoubles(byCode.get(33550)?.extra, endian, 3);
  const tie = readDoubles(byCode.get(33922)?.extra, endian, 6);
  const transform = readDoubles(byCode.get(34264)?.extra, endian, 16);
  if (transform.length >= 16) {
    const affine: RasterGeotransform["affine"] = [
      transform[3],
      transform[0],
      transform[1],
      transform[7],
      transform[4],
      transform[5],
    ];
    out.geotransform = {
      affine,
      originX: affine[0],
      originY: affine[3],
      pixelWidth: affine[1],
      pixelHeight: affine[5],
    };
  } else if (scale.length >= 2 && tie.length >= 6) {
    const pixelWidth = scale[0];
    const pixelHeight = -Math.abs(scale[1] || scale[0]);
    const originX = tie[3];
    const originY = tie[4];
    out.geotransform = {
      affine: [originX, pixelWidth, 0, originY, 0, pixelHeight],
      originX,
      originY,
      pixelWidth,
      pixelHeight,
    };
  }

  if (out.geotransform && width && height) {
    const gt = out.geotransform;
    const x0 = gt.originX;
    const y0 = gt.originY;
    const x1 = gt.originX + width * gt.pixelWidth;
    const y1 = gt.originY + height * gt.pixelHeight;
    out.bbox = {
      minX: Math.min(x0, x1),
      minY: Math.min(y0, y1),
      maxX: Math.max(x0, x1),
      maxY: Math.max(y0, y1),
    };
    const cell = Math.abs(gt.pixelWidth);
    if (Number.isFinite(cell) && cell > 0) out.cellSizeM = cell;
  }

  const nodataText = asciiFromTag(byCode.get(42113));
  if (nodataText != null && nodataText !== "") {
    const nodata = Number(nodataText);
    if (Number.isFinite(nodata)) {
      out.nodata = nodata;
      out.nodataPresent = true;
    }
  }

  const epsg = epsgFromGeoKeys(byCode.get(34735)?.extra, endian);
  if (epsg) {
    out.crs = `EPSG:${epsg}`;
    out.crsConfidence = "high";
    out.crsSource = "geotiff-geokeys";
    out.units = epsg === 4326 ? "degrees" : "metres";
  } else {
    out.crsConfidence = "none";
    out.warnings.push("GeoTIFF CRS GeoKeys were not found. Overlay is blocked until a CRS is documented. Coordinates were not assumed.");
  }

  const decodableDtype =
    (bits === 8 && (sampleFormat === 1 || sampleFormat === 2)) ||
    (bits === 16 && (sampleFormat === 1 || sampleFormat === 2)) ||
    (bits === 32 && (sampleFormat === 2 || sampleFormat === 3));
  out.pixelsDecodable =
    out.compression === "uncompressed" &&
    out.layout === "strips" &&
    Boolean(width && height && hasStrips) &&
    Boolean(decodableDtype);
  if (samples > 1 && out.pixelsDecodable) {
    out.warnings.push(`Multiband raster (${samples} samples). Map display samples band 1 only.`);
  }
  if (out.compression !== "uncompressed") {
    out.notes.push(`Compression ${out.compression} (${compressionCode}). Pixel decode is not registered.`);
  }
  if (tiled) {
    out.notes.push("Tiled TIFF/COG layout. Pixel tiles are not decoded in this pack.");
  }
  if (out.cogLike) {
    out.notes.push(`COG-like layout: tiled raster with ${options.extraIfdCount} extra IFD(s) treated as overviews. Overview pixels were not loaded.`);
  }

  const cells = (width || 0) * (height || 0);
  out.previewRequired =
    Boolean(width && height) &&
    (width! > RASTER_PREVIEW_LIMITS.maxGridDimension ||
      height! > RASTER_PREVIEW_LIMITS.maxGridDimension ||
      cells > RASTER_PREVIEW_LIMITS.maxGridCells);
  if (out.previewRequired) {
    out.notes.push(
      `Raster is ${width}×${height}. Catalog inspect is metadata-only. Map display uses a declared preview/overview limit; the full raster is not loaded into memory.`
    );
    out.pixelsDecodable = false;
  }

  if (!width || !height) {
    out.errors.push("TIFF ImageWidth/ImageLength tags were not parsed.");
  }
  if (!out.geotransform) {
    out.errors.push("GeoTIFF geotransform (ModelPixelScale/Tiepoint or ModelTransformation) was not parsed.");
  }
  out.statisticsSource = "none";
  out.notes.push("Pixel values were not loaded during catalog inspect.");
  return out;
}

function extractTiffTagsFromBuffer(buf: Buffer, endian: RasterEndian): { tags: TiffTagValue[]; extraIfdCount: number; ifdBeyondBuffer: boolean } {
  if (buf.length < 8) return { tags: [], extraIfdCount: 0, ifdBeyondBuffer: true };
  const ifd = readU32(buf, 4, endian);
  if (ifd === 0 || ifd + 2 > buf.length) return { tags: [], extraIfdCount: 0, ifdBeyondBuffer: true };
  const n = readU16(buf, ifd, endian);
  const tags: TiffTagValue[] = [];
  for (let i = 0; i < n; i++) {
    const o = ifd + 2 + i * 12;
    if (o + 12 > buf.length) return { tags, extraIfdCount: 0, ifdBeyondBuffer: true };
    const code = readU16(buf, o, endian);
    const typ = readU16(buf, o + 2, endian);
    const count = readU32(buf, o + 4, endian);
    const valueOrOffset = readU32(buf, o + 8, endian);
    const size = (TYPE_SIZE[typ] || 1) * count;
    let extra: Buffer | undefined;
    if (size > 4) {
      if (valueOrOffset + size <= buf.length) extra = Buffer.from(buf.subarray(valueOrOffset, valueOrOffset + size));
    }
    tags.push({ code, typ, count, valueOrOffset, extra });
  }
  let extraIfdCount = 0;
  const nextOff = ifd + 2 + n * 12;
  if (nextOff + 4 <= buf.length) {
    let next = readU32(buf, nextOff, endian);
    while (next && extraIfdCount < 16 && next + 2 <= buf.length) {
      extraIfdCount += 1;
      const cn = readU16(buf, next, endian);
      const nptr = next + 2 + cn * 12;
      if (nptr + 4 > buf.length) break;
      next = readU32(buf, nptr, endian);
    }
  }
  return { tags, extraIfdCount, ifdBeyondBuffer: false };
}

/** Parse Classic TIFF IFD metadata from a buffer. Does not decode pixels. */
export function inspectTiffBuffer(buf: Buffer): RasterInspect {
  const sig = tiffSignature(buf);
  if (!sig.looksLikeTiff || !sig.endian) {
    const out = emptyRasterInspect();
    out.errors.push("Not a TIFF signature.");
    return out;
  }
  if (sig.isBigTiff) {
    return inspectTiffTags({ endian: sig.endian, isBigTiff: true, tags: [], extraIfdCount: 0, fileSize: buf.length });
  }
  const parsed = extractTiffTagsFromBuffer(buf, sig.endian);
  const inspected = inspectTiffTags({
    endian: sig.endian,
    isBigTiff: false,
    tags: parsed.tags,
    extraIfdCount: parsed.extraIfdCount,
    fileSize: buf.length,
  });
  inspected.ifdBeyondBuffer = parsed.ifdBeyondBuffer;
  if (parsed.ifdBeyondBuffer) {
    inspected.errors.push("TIFF IFD is beyond the peeked bytes. Disk inspect seeks the IFD without loading pixels.");
    inspected.notes.push("Peek-only classify cannot confirm GeoTIFF tags until the catalog walks the file on disk.");
  }
  return inspected;
}

export function geotiffReadyForSupport(result: RasterInspect): boolean {
  return (
    result.looksLikeTiff &&
    !result.isBigTiff &&
    !result.ifdBeyondBuffer &&
    Boolean(result.width && result.height) &&
    Boolean(result.geotransform) &&
    result.errors.filter((line) => /ImageWidth|geotransform/i.test(line)).length === 0
  );
}

export interface AsciiGridInspect {
  looksLikeAscii: boolean;
  ncols?: number;
  nrows?: number;
  cellsize?: number;
  xll?: number;
  yll?: number;
  nodata?: number;
  nodataPresent: boolean;
  bbox?: CatalogBBox;
  crs?: string;
  crsConfidence?: "high" | "medium" | "none";
  crsSource?: "epsg-comment";
  units?: string;
  valueMin?: number;
  valueMax?: number;
  statisticsSource?: "header-sample" | "none";
  previewRequired: boolean;
  errors: string[];
  warnings: string[];
  notes: string[];
}

function parseAsciiNumericHeader(text: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^[/#;]/.test(trimmed)) continue;
    const match = trimmed.match(
      /^(ncols|nrows|xllcorner|yllcorner|xllcenter|yllcenter|cellsize|nodata_value)\s+([-+0-9.eE]+)/i
    );
    if (!match) {
      if (Object.keys(map).length) break;
      continue;
    }
    map[match[1].toLowerCase()] = Number(match[2]);
  }
  return map;
}

function parseOptionalAsciiComments(text: string): { epsg?: number; units?: string } {
  const found: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.trim().match(/^(?:\/\s*|#\s*|;\s*)?(EPSG|CRS|Units)\s*=\s*(.+)$/i);
    if (!match) continue;
    found[match[1].toLowerCase()] = match[2].trim();
  }
  let epsg: number | undefined;
  const epsgRaw = found.epsg || found.crs;
  if (epsgRaw) {
    const m = epsgRaw.match(/(\d{4,6})/);
    if (m) epsg = parseInt(m[1], 10);
  }
  return { epsg, units: found.units };
}

function sampleAsciiValues(text: string, ncols?: number, nrows?: number): { min?: number; max?: number } {
  if (!ncols || !nrows) return {};
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i].trim();
    if (!raw || /^[/#;]/.test(raw)) {
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
    i += 1;
    headerCount += 1;
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let seen = 0;
  const cap = Math.min(4096, ncols * nrows);
  for (; i < lines.length && seen < cap; i++) {
    const parts = lines[i].trim().split(/\s+/);
    for (const part of parts) {
      if (!part) continue;
      const v = Number(part);
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
      seen += 1;
      if (seen >= cap) break;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return {};
  return { min, max };
}

export function inspectAsciiGridText(text: string, fileBytes?: number): AsciiGridInspect {
  const map = parseAsciiNumericHeader(text);
  const ncols = map.ncols;
  const nrows = map.nrows;
  const cell = map.cellsize;
  let xll = map.xllcorner;
  let yll = map.yllcorner;
  if (xll == null && map.xllcenter != null && Number.isFinite(cell)) xll = map.xllcenter - cell / 2;
  if (yll == null && map.yllcenter != null && Number.isFinite(cell)) yll = map.yllcenter - cell / 2;
  const looksLikeAscii = Number.isFinite(ncols) && Number.isFinite(nrows);
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = ["ESRI ASCII grid. Cell values were not fully loaded into the catalog."];
  if (!looksLikeAscii) {
    return {
      looksLikeAscii: false,
      nodataPresent: false,
      previewRequired: false,
      errors: ["Not an ESRI ASCII grid header."],
      warnings,
      notes,
    };
  }
  if (!Number.isFinite(cell) || (cell as number) <= 0) errors.push("ASCII grid cellsize is missing or invalid.");
  if (!Number.isFinite(xll) || !Number.isFinite(yll)) errors.push("ASCII grid origin (xll/yll) is missing.");

  let bbox: CatalogBBox | undefined;
  if (Number.isFinite(ncols) && Number.isFinite(nrows) && Number.isFinite(cell) && Number.isFinite(xll) && Number.isFinite(yll)) {
    bbox = {
      minX: xll as number,
      minY: yll as number,
      maxX: (xll as number) + (ncols as number) * (cell as number),
      maxY: (yll as number) + (nrows as number) * (cell as number),
    };
  }
  const comments = parseOptionalAsciiComments(text);
  const nodataPresent = Number.isFinite(map.nodata_value);
  const cells = (ncols as number) * (nrows as number);
  const previewRequired =
    (ncols as number) > RASTER_PREVIEW_LIMITS.maxGridDimension ||
    (nrows as number) > RASTER_PREVIEW_LIMITS.maxGridDimension ||
    cells > RASTER_PREVIEW_LIMITS.maxGridCells ||
    (typeof fileBytes === "number" && fileBytes > RASTER_PREVIEW_LIMITS.maxAsciiBytes);
  if (previewRequired) {
    notes.push(
      `ASCII grid is ${ncols}×${nrows}. Catalog inspect is metadata-first. Map display uses a declared preview/overview limit.`
    );
  }
  const sample = sampleAsciiValues(text, ncols, nrows);
  if (comments.epsg) {
    notes.push(`CRS from / EPSG= comment (${comments.epsg}). Coordinates were not reprojected.`);
  } else {
    warnings.push("ASCII grid has no / EPSG= comment. Overlay is blocked until a CRS is documented.");
  }
  notes.push("A filename containing 'dem' does not make this a DEM. DEM support requires EPSG, Units=m, and ElevationDatum.");
  return {
    looksLikeAscii: true,
    ncols,
    nrows,
    cellsize: cell,
    xll,
    yll,
    nodata: nodataPresent ? map.nodata_value : undefined,
    nodataPresent,
    bbox,
    crs: comments.epsg ? `EPSG:${comments.epsg}` : undefined,
    crsConfidence: comments.epsg ? "high" : "none",
    crsSource: comments.epsg ? "epsg-comment" : undefined,
    units: comments.units,
    valueMin: sample.min,
    valueMax: sample.max,
    statisticsSource: sample.min != null ? "header-sample" : "none",
    previewRequired,
    errors,
    warnings,
    notes,
  };
}

export function asciiGridReadyForSupport(result: AsciiGridInspect): boolean {
  return (
    result.looksLikeAscii &&
    Boolean(result.ncols && result.nrows) &&
    typeof result.cellsize === "number" &&
    result.cellsize > 0 &&
    Number.isFinite(result.xll) &&
    Number.isFinite(result.yll) &&
    result.errors.length === 0
  );
}

export function rasterHeaderSummary(text: string): string | undefined {
  const lines = firstLines(text, 8).filter((line) => line.trim());
  return lines.length ? lines.slice(0, 4).join(" | ") : headerSummaryFromText(text);
}

export function rasterInspectNotes(inspected: RasterInspect): string[] {
  return [...inspected.notes, ...inspected.warnings];
}
