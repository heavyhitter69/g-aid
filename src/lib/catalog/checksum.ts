import { createHash } from "node:crypto";
import fs from "node:fs";
import { HEAD_HASH_BYTES, MAX_FULL_HASH_BYTES, type CatalogChecksum } from "./types.ts";

export function checksumFile(absPath: string, size: number): CatalogChecksum {
  try {
    if (size <= 0) return { strategy: "none" };
    if (size <= MAX_FULL_HASH_BYTES) {
      const value = createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
      return { strategy: "sha256", value };
    }
    const fd = fs.openSync(absPath, "r");
    try {
      const buf = Buffer.alloc(Math.min(HEAD_HASH_BYTES, size));
      fs.readSync(fd, buf, 0, buf.length, 0);
      return {
        strategy: "sha256-head-64k",
        value: createHash("sha256").update(buf).digest("hex"),
      };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return { strategy: "none" };
  }
}
