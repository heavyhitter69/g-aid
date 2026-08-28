import fs from "node:fs";
import {
  inspectTiffBuffer,
  inspectTiffTags,
  tiffSignature,
  type RasterEndian,
  type RasterInspect,
  type TiffTagValue,
} from "../raster-contract.ts";

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

function readAt(fd: number, offset: number, size: number): Buffer {
  const buf = Buffer.alloc(size);
  const n = fs.readSync(fd, buf, 0, size, offset);
  return Buffer.from(buf.subarray(0, n));
}

function readU16(buf: Buffer, offset: number, endian: RasterEndian): number {
  return endian === "LE" ? buf.readUInt16LE(offset) : buf.readUInt16BE(offset);
}

function readU32(buf: Buffer, offset: number, endian: RasterEndian): number {
  return endian === "LE" ? buf.readUInt32LE(offset) : buf.readUInt32BE(offset);
}

/**
 * Node-only GeoTIFF IFD inspect. Seeks header, IFD, and extra tag payloads.
 * Strip/tile pixel bytes are never read.
 */
export function inspectGeoTiffPath(absPath: string): RasterInspect {
  let fd: number;
  try {
    fd = fs.openSync(absPath, "r");
  } catch (err) {
    const failed = inspectTiffBuffer(Buffer.alloc(0));
    failed.errors = [`GeoTIFF could not be opened: ${err instanceof Error ? err.message : String(err)}`];
    return failed;
  }
  try {
    const stat = fs.fstatSync(fd);
    const header = readAt(fd, 0, 8);
    const sig = tiffSignature(header);
    if (!sig.looksLikeTiff || !sig.endian) {
      return inspectTiffBuffer(header);
    }
    if (sig.isBigTiff) {
      return inspectTiffTags({
        endian: sig.endian,
        isBigTiff: true,
        tags: [],
        extraIfdCount: 0,
        fileSize: stat.size,
      });
    }
    const endian = sig.endian;
    const ifd = readU32(header, 4, endian);
    if (!ifd || ifd + 2 > stat.size) {
      const inspected = inspectTiffBuffer(header);
      inspected.ifdBeyondBuffer = true;
      inspected.errors.push("TIFF IFD offset is missing or past end of file.");
      return inspected;
    }
    const countBuf = readAt(fd, ifd, 2);
    if (countBuf.length < 2) {
      const inspected = inspectTiffBuffer(header);
      inspected.ifdBeyondBuffer = true;
      return inspected;
    }
    const n = readU16(countBuf, 0, endian);
    const entries = readAt(fd, ifd + 2, n * 12 + 4);
    const tags: TiffTagValue[] = [];
    for (let i = 0; i < n; i++) {
      const o = i * 12;
      if (o + 12 > entries.length) break;
      const code = readU16(entries, o, endian);
      const typ = readU16(entries, o + 2, endian);
      const count = readU32(entries, o + 4, endian);
      const valueOrOffset = readU32(entries, o + 8, endian);
      const size = (TYPE_SIZE[typ] || 1) * count;
      let extra: Buffer | undefined;
      if (size > 4 && valueOrOffset + size <= stat.size) {
        extra = readAt(fd, valueOrOffset, Math.min(size, 64 * 1024));
      }
      tags.push({ code, typ, count, valueOrOffset, extra });
    }
    let extraIfdCount = 0;
    if (n * 12 + 4 <= entries.length) {
      let next = readU32(entries, n * 12, endian);
      while (next && extraIfdCount < 16 && next + 2 <= stat.size) {
        extraIfdCount += 1;
        const nextCountBuf = readAt(fd, next, 2);
        if (nextCountBuf.length < 2) break;
        const cn = readU16(nextCountBuf, 0, endian);
        const nextPtrBuf = readAt(fd, next + 2 + cn * 12, 4);
        if (nextPtrBuf.length < 4) break;
        next = readU32(nextPtrBuf, 0, endian);
      }
    }
    return inspectTiffTags({
      endian,
      isBigTiff: false,
      tags,
      extraIfdCount,
      fileSize: stat.size,
    });
  } finally {
    fs.closeSync(fd);
  }
}
