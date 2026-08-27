import fs from "node:fs";
import { PEEK_BYTES } from "./types.ts";

export {
  firstLines,
  headerSummaryFromText,
  looksMostlyText,
  peekText,
  printableRatio,
  splitHeader,
} from "./peek-text.ts";

export function peekFile(absPath: string, size: number, maxBytes = PEEK_BYTES): Buffer {
  if (size <= 0) return Buffer.alloc(0);
  const fd = fs.openSync(absPath, "r");
  try {
    const buf = Buffer.alloc(Math.min(maxBytes, size));
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    return n === buf.length ? buf : buf.subarray(0, n);
  } finally {
    fs.closeSync(fd);
  }
}
