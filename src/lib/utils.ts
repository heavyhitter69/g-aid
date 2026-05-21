import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Deterministic 0–1 value from strings/indices (SSR-safe, no Math.random). */
export function seededUnit(...parts: (string | number)[]): number {
  const seed = parts.join("|");
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return (Math.abs(Math.sin(hash * 12.9898)) * 43758.5453) % 1;
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = Math.round(alpha * 100) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
