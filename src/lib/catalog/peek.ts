import fs from "node:fs";
import { MAX_HEADER_SUMMARY, PEEK_BYTES } from "./types.ts";

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

export function peekText(peek: Buffer): string {
  return peek.toString("utf8");
}

export function looksMostlyText(peek: Buffer): boolean {
  if (!peek.length) return false;
  let odd = 0;
  const n = Math.min(peek.length, 512);
  for (let i = 0; i < n; i++) {
    const b = peek[i];
    if (b === 0) return false;
    if (b < 9 || (b > 13 && b < 32)) odd += 1;
  }
  return odd / n < 0.1;
}

export function firstLines(text: string, count = 12): string[] {
  return text.split(/\r?\n/).slice(0, count);
}

export function headerSummaryFromText(text: string): string | undefined {
  const line = text.split(/\r?\n/).find((entry) => entry.trim());
  if (!line) return undefined;
  const cleaned = line.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  return cleaned.length > MAX_HEADER_SUMMARY ? `${cleaned.slice(0, MAX_HEADER_SUMMARY)}…` : cleaned;
}

export function splitHeader(line: string): string[] {
  const trimmed = line.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return [];
  if (trimmed.includes("\t")) return trimmed.split("\t").map((part) => part.trim()).filter(Boolean);
  if (trimmed.includes(",")) return trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  if (trimmed.includes(";")) return trimmed.split(";").map((part) => part.trim()).filter(Boolean);
  return trimmed.split(/\s+/).filter(Boolean);
}

export function printableRatio(text: string): number {
  if (!text) return 0;
  let ok = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code < 127)) ok += 1;
  }
  return ok / text.length;
}
