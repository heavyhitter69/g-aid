"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { parseEsriAscii, type RasterGrid } from "@/lib/map/ascii";

export type AsciiGrid = RasterGrid;
export { parseEsriAscii };

function colorFor(t: number, ramp: "jet" | "gray" | "viridis" = "jet"): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  if (ramp === "gray") {
    const g = Math.round(x * 255);
    return [g, g, g];
  }
  if (ramp === "viridis") {
    const stops: [number, number, number, number][] = [
      [0, 68, 1, 84],
      [0.33, 49, 104, 142],
      [0.66, 53, 183, 121],
      [1, 253, 231, 37],
    ];
    let i = 0;
    while (i < stops.length - 2 && x > stops[i + 1][0]) i += 1;
    const a = stops[i];
    const b = stops[i + 1];
    const u = (x - a[0]) / (b[0] - a[0] || 1);
    return [
      Math.round(a[1] + (b[1] - a[1]) * u),
      Math.round(a[2] + (b[2] - a[2]) * u),
      Math.round(a[3] + (b[3] - a[3]) * u),
    ];
  }
  if (x < 0.25) {
    const u = x / 0.25;
    return [0, Math.round(80 + 140 * u), 180];
  }
  if (x < 0.5) {
    const u = (x - 0.25) / 0.25;
    return [0, Math.round(220 + 35 * u), Math.round(180 - 180 * u)];
  }
  if (x < 0.75) {
    const u = (x - 0.5) / 0.25;
    return [Math.round(255 * u), 255, 0];
  }
  const u = (x - 0.75) / 0.25;
  return [255, Math.round(255 * (1 - u)), 0];
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

function niceMetres(metresPerPixel: number, targetPx = 110): number {
  const want = Math.max(1, metresPerPixel * targetPx);
  const exp = Math.pow(10, Math.floor(Math.log10(want)));
  let best = exp;
  for (const n of [1, 2, 5, 10]) {
    const c = n * exp;
    if (Math.abs(c - want) < Math.abs(best - want)) best = c;
  }
  return best;
}

function drawMapChrome(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  cellsize: number,
  scale: number,
  ramp: "jet" | "gray" | "viridis",
  lo: number,
  hi: number
) {
  const metresPerPx = cellsize / Math.max(scale, 0.0001);
  const barM = niceMetres(metresPerPx);
  const barPx = barM / metresPerPx;
  const x0 = 18;
  const y0 = h - 28;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x0 - 8, y0 - 18, barPx + 16, 32);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + barPx, y0);
  ctx.moveTo(x0, y0 - 5);
  ctx.lineTo(x0, y0 + 5);
  ctx.moveTo(x0 + barPx, y0 - 5);
  ctx.lineTo(x0 + barPx, y0 + 5);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(barM >= 1000 ? `${barM / 1000} km` : `${Math.round(barM)} m`, x0 + barPx / 2, y0 - 6);

  const nx = w - 28;
  const ny = 36;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.arc(nx, ny, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(nx, ny - 12);
  ctx.lineTo(nx - 6, ny + 8);
  ctx.lineTo(nx, ny + 3);
  ctx.lineTo(nx + 6, ny + 8);
  ctx.closePath();
  ctx.fill();
  ctx.font = "10px ui-sans-serif, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("N", nx, ny + 22);

  const barX = w - 22;
  const barY = 64;
  const barH = Math.min(160, h - 120);
  const barW = 10;
  const grad = ctx.createLinearGradient(0, barY + barH, 0, barY);
  for (let i = 0; i <= 8; i++) {
    const [r, g, b] = colorFor(i / 8, ramp);
    grad.addColorStop(i / 8, `rgb(${r},${g},${b})`);
  }
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(barX - 8, barY - 8, 28, barH + 16);
  ctx.fillStyle = grad;
  ctx.fillRect(barX, barY, barW, barH);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);
  ctx.fillStyle = "#ffffff";
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.fillText(hi.toFixed(0), barX - 10, barY + 8);
  ctx.fillText(lo.toFixed(0), barX - 10, barY + barH);
}

function hillshadeAt(grid: AsciiGrid, col: number, row: number, azimuthDeg = 315, altitudeDeg = 45): number {
  const z = (c: number, r: number) => {
    if (c < 0 || r < 0 || c >= grid.ncols || r >= grid.nrows) return null;
    const v = grid.values[r * grid.ncols + c];
    if (!Number.isFinite(v) || v === grid.nodata) return null;
    return v;
  };
  const dzdx =
    ((z(col + 1, row - 1) ?? 0) + 2 * (z(col + 1, row) ?? 0) + (z(col + 1, row + 1) ?? 0) -
      ((z(col - 1, row - 1) ?? 0) + 2 * (z(col - 1, row) ?? 0) + (z(col - 1, row + 1) ?? 0))) /
    (8 * grid.cellsize);
  const dzdy =
    ((z(col - 1, row + 1) ?? 0) + 2 * (z(col, row + 1) ?? 0) + (z(col + 1, row + 1) ?? 0) -
      ((z(col - 1, row - 1) ?? 0) + 2 * (z(col, row - 1) ?? 0) + (z(col + 1, row - 1) ?? 0))) /
    (8 * grid.cellsize);
  const slope = Math.atan(Math.hypot(dzdx, dzdy));
  const aspect = Math.atan2(dzdy, -dzdx);
  const zenith = ((90 - altitudeDeg) * Math.PI) / 180;
  const azimuth = (azimuthDeg * Math.PI) / 180;
  const shade = Math.cos(zenith) * Math.cos(slope) + Math.sin(zenith) * Math.sin(slope) * Math.cos(azimuth - aspect);
  return Math.max(0, Math.min(1, shade));
}

function contourPolylines(grid: AsciiGrid, lo: number, hi: number, n = 8): { x: number; y: number }[][] {
  const levels: number[] = [];
  for (let i = 1; i < n; i++) levels.push(lo + ((hi - lo) * i) / n);
  const lines: { x: number; y: number }[][] = [];
  const at = (c: number, r: number) => grid.values[r * grid.ncols + c];
  const valid = (c: number, r: number) => {
    const v = at(c, r);
    return Number.isFinite(v) && v !== grid.nodata;
  };
  const toXY = (c: number, r: number) => ({
    x: grid.xllcorner + (c + 0.5) * grid.cellsize,
    y: grid.yllcorner + (grid.nrows - r - 0.5) * grid.cellsize,
  });
  for (const level of levels) {
    for (let r = 0; r < grid.nrows - 1; r++) {
      for (let c = 0; c < grid.ncols - 1; c++) {
        if (!valid(c, r) || !valid(c + 1, r) || !valid(c, r + 1) || !valid(c + 1, r + 1)) continue;
        const v = [at(c, r), at(c + 1, r), at(c + 1, r + 1), at(c, r + 1)];
        const corners = [
          [c, r],
          [c + 1, r],
          [c + 1, r + 1],
          [c, r + 1],
        ];
        const pts: { x: number; y: number }[] = [];
        for (let e = 0; e < 4; e++) {
          const a = v[e];
          const b = v[(e + 1) % 4];
          if ((a - level) * (b - level) > 0) continue;
          if (a === b) continue;
          const t = (level - a) / (b - a);
          const [c0, r0] = corners[e];
          const [c1, r1] = corners[(e + 1) % 4];
          pts.push(toXY(c0 + (c1 - c0) * t, r0 + (r1 - r0) * t));
        }
        if (pts.length >= 2) lines.push(pts.slice(0, 2));
      }
    }
  }
  return lines;
}

export function extractLineStrings(text: string): { x: number; y: number }[][] {
  const lines: { x: number; y: number }[][] = [];
  const re = /\[\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  const coords = [...text.matchAll(/"coordinates"\s*:\s*\[/g)];
  if (text.includes("LineString")) {
    const blockRe = /"coordinates"\s*:\s*\[\[([\s\S]*?)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(text))) {
      const pts: { x: number; y: number }[] = [];
      const inner = m[1];
      let p: RegExpExecArray | null;
      const pre = /\[\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
      while ((p = pre.exec(inner))) pts.push({ x: parseFloat(p[1]), y: parseFloat(p[2]) });
      if (pts.length >= 2) lines.push(pts);
    }
  }
  if (!lines.length && coords.length) {
    void re;
  }
  return lines;
}

export function GridMapView({
  title,
  grid,
  note,
  overlay,
  overlayLines,
  units = "nT",
  warnings,
  opacity = 1,
  crsLabel,
  onInspect,
  onProfile,
}: {
  title: string;
  grid: AsciiGrid | null;
  note?: string;
  overlay?: { x: number; y: number }[];
  overlayLines?: { x: number; y: number }[][];
  units?: string;
  warnings?: string[];
  opacity?: number;
  crsLabel?: string;
  onInspect?: (hit: { x: number; y: number; value: number | null; nodata: boolean }) => void;
  onProfile?: (a: { x: number; y: number }, b: { x: number; y: number }) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<HTMLCanvasElement>(null);
  const rasterRef = useRef<HTMLCanvasElement | null>(null);
  const viewState = useRef({ scale: 1, panX: 0, panY: 0, dragging: false, lastX: 0, lastY: 0 });
  const [ramp, setRamp] = useState<"jet" | "gray" | "viridis">("jet");
  const [stretch, setStretch] = useState<"minmax" | "pct">("pct");
  const [showPath, setShowPath] = useState(true);
  const [showHillshade, setShowHillshade] = useState(true);
  const [showContours, setShowContours] = useState(true);
  const [showLineaments, setShowLineaments] = useState(true);
  const [cursor, setCursor] = useState<string>("");
  const [fitted, setFitted] = useState(0);
  const profileA = useRef<{ x: number; y: number } | null>(null);

  const stats = useMemo(() => {
    if (!grid) return null;
    const sample: number[] = [];
    let min = Infinity;
    let max = -Infinity;
    const step = Math.max(1, Math.floor(grid.values.length / 80000));
    for (let i = 0; i < grid.values.length; i++) {
      const v = grid.values[i];
      if (!Number.isFinite(v) || v === grid.nodata) continue;
      if (v < min) min = v;
      if (v > max) max = v;
      if (i % step === 0) sample.push(v);
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    sample.sort((a, b) => a - b);
    return {
      min,
      max,
      p2: percentile(sample, 2),
      p98: percentile(sample, 98),
    };
  }, [grid]);

  const sampledOverlay = useMemo(() => downsample(overlay || [], 40000), [overlay]);
  const sampledLines = useMemo(() => (overlayLines || []).slice(0, 4000), [overlayLines]);
  const contourCache = useMemo(() => {
    if (!grid || !stats) return [];
    const lo = stretch === "pct" ? stats.p2 : stats.min;
    const hi = stretch === "pct" ? stats.p98 : stats.max;
    return contourPolylines(grid, lo, hi, 8);
  }, [grid, stats, stretch]);

  useEffect(() => {
    if (!grid || !stats) return;
    const raster = document.createElement("canvas");
    raster.width = grid.ncols;
    raster.height = grid.nrows;
    const ctx = raster.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(grid.ncols, grid.nrows);
    const lo = stretch === "pct" ? stats.p2 : stats.min;
    const hi = stretch === "pct" ? stats.p98 : stats.max;
    const span = hi - lo || 1;
    for (let i = 0; i < grid.values.length; i++) {
      const v = grid.values[i];
      const p = i * 4;
      if (!Number.isFinite(v) || v === grid.nodata) {
        image.data[p] = 18;
        image.data[p + 1] = 18;
        image.data[p + 2] = 18;
        image.data[p + 3] = 255;
        continue;
      }
      const [r, g, b] = colorFor((v - lo) / span, ramp);
      let shade = 1;
      if (showHillshade) {
        const col = i % grid.ncols;
        const row = Math.floor(i / grid.ncols);
        shade = 0.35 + 0.65 * hillshadeAt(grid, col, row);
      }
      image.data[p] = Math.round(r * shade);
      image.data[p + 1] = Math.round(g * shade);
      image.data[p + 2] = Math.round(b * shade);
      image.data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    rasterRef.current = raster;
    setFitted((n) => n + 1);
  }, [grid, stats, ramp, stretch, showHillshade]);

  const paint = useCallback(() => {
    const canvas = viewRef.current;
    const raster = rasterRef.current;
    const host = hostRef.current;
    if (!canvas || !raster || !host || !grid || !stats) return;
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { scale, panX, panY } = viewState.current;
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(scale, 0, 0, scale, panX, panY);
    ctx.globalAlpha = Math.max(0.15, Math.min(1, opacity));
    ctx.drawImage(raster, 0, 0);
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (showPath && sampledOverlay.length) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      for (const p of sampledOverlay) {
        const col = (p.x - grid.xllcorner) / grid.cellsize;
        const row = grid.nrows - (p.y - grid.yllcorner) / grid.cellsize;
        ctx.fillRect(panX + col * scale - 0.75, panY + row * scale - 0.75, 1.5, 1.5);
      }
    }
    if (showContours && contourCache.length) {
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      for (const line of contourCache) {
        if (line.length < 2) continue;
        ctx.beginPath();
        line.forEach((p, i) => {
          const col = (p.x - grid.xllcorner) / grid.cellsize;
          const row = grid.nrows - (p.y - grid.yllcorner) / grid.cellsize;
          const sx = panX + col * scale;
          const sy = panY + row * scale;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }
    }
    if (showLineaments && sampledLines.length) {
      ctx.strokeStyle = "rgba(255, 214, 102, 0.95)";
      ctx.lineWidth = 1.5;
      for (const line of sampledLines) {
        if (line.length < 2) continue;
        ctx.beginPath();
        line.forEach((p, i) => {
          const col = (p.x - grid.xllcorner) / grid.cellsize;
          const row = grid.nrows - (p.y - grid.yllcorner) / grid.cellsize;
          const sx = panX + col * scale;
          const sy = panY + row * scale;
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
      }
    }
    const lo = stretch === "pct" ? stats.p2 : stats.min;
    const hi = stretch === "pct" ? stats.p98 : stats.max;
    drawMapChrome(ctx, w, h, grid.cellsize, scale, ramp, lo, hi);
  }, [grid, sampledOverlay, sampledLines, showPath, showContours, showLineaments, contourCache, stats, stretch, ramp, opacity]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = viewRef.current;
    const raster = rasterRef.current;
    if (!host || !canvas || !raster || !grid) return;
    const w = host.clientWidth;
    const h = host.clientHeight;
    const scale = Math.min(w / grid.ncols, h / grid.nrows) * 0.96;
    viewState.current.scale = Math.max(0.05, scale);
    viewState.current.panX = (w - grid.ncols * viewState.current.scale) / 2;
    viewState.current.panY = (h - grid.nrows * viewState.current.scale) / 2;
    paint();
  }, [fitted, grid, paint]);

  useEffect(() => {
    paint();
  }, [paint, showPath]);

  const paintRef = useRef(paint);
  paintRef.current = paint;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => paintRef.current());
    ro.observe(host);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const canvas = viewRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const vs = viewState.current;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = Math.min(64, Math.max(0.05, vs.scale * factor));
      const gx = (mx - vs.panX) / vs.scale;
      const gy = (my - vs.panY) / vs.scale;
      vs.scale = next;
      vs.panX = mx - gx * next;
      vs.panY = my - gy * next;
      paintRef.current();
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      ro.disconnect();
      host.removeEventListener("wheel", onWheel);
    };
  }, [fitted]);

  const toGrid = (clientX: number, clientY: number) => {
    const canvas = viewRef.current;
    if (!canvas || !grid) return null;
    const rect = canvas.getBoundingClientRect();
    const { scale, panX, panY } = viewState.current;
    const col = Math.floor((clientX - rect.left - panX) / scale);
    const row = Math.floor((clientY - rect.top - panY) / scale);
    if (col < 0 || row < 0 || col >= grid.ncols || row >= grid.nrows) return null;
    const v = grid.values[row * grid.ncols + col];
    const x = grid.xllcorner + (col + 0.5) * grid.cellsize;
    const y = grid.yllcorner + (grid.nrows - row - 0.5) * grid.cellsize;
    return { col, row, x, y, v };
  };

  if (!grid || !stats) {
    return (
      <div className="flex-1 bg-[#1e1e1e] flex flex-col items-center justify-center gap-3 text-[#858585] p-8">
        <MapIcon className="h-8 w-8" />
        <p className="text-sm text-[#cccccc]">{title}</p>
        <p className="text-xs max-w-md text-center leading-relaxed">
          {note || "No grid data in this file. If this is a GeoTIFF, keep the matching .asc beside it."}
        </p>
      </div>
    );
  }

  const lo = stretch === "pct" ? stats.p2 : stats.min;
  const hi = stretch === "pct" ? stats.p98 : stats.max;

  return (
    <div className="flex-1 bg-[#1e1e1e] flex flex-col h-full overflow-hidden">
      <div className="h-[45px] border-b border-[#2b2b2b] shrink-0 flex items-center justify-between px-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <MapIcon className="h-4 w-4 text-[#4ec9b0] shrink-0" />
          <span className="text-[#cccccc] text-[13px] font-medium truncate">{title}</span>
          {crsLabel ? <span className="text-[10px] text-[#858585] font-mono truncate">{crsLabel}</span> : null}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[#cccccc] shrink-0">
          <select
            value={ramp}
            onChange={(e) => setRamp(e.target.value as typeof ramp)}
            className="bg-[#2a2d2e] border border-[#3c3c3c] rounded px-1.5 py-0.5 text-[11px]"
          >
            <option value="jet">Jet</option>
            <option value="viridis">Viridis</option>
            <option value="gray">Grey</option>
          </select>
          <select
            value={stretch}
            onChange={(e) => setStretch(e.target.value as typeof stretch)}
            className="bg-[#2a2d2e] border border-[#3c3c3c] rounded px-1.5 py-0.5 text-[11px]"
          >
            <option value="pct">2–98%</option>
            <option value="minmax">Min–max</option>
          </select>
          {sampledOverlay.length > 0 && (
            <label className="flex items-center gap-1 text-[#858585]">
              <input type="checkbox" checked={showPath} onChange={(e) => setShowPath(e.target.checked)} />
              Flight path
            </label>
          )}
          <label className="flex items-center gap-1 text-[#858585]">
            <input type="checkbox" checked={showHillshade} onChange={(e) => setShowHillshade(e.target.checked)} />
            Hillshade
          </label>
          <label className="flex items-center gap-1 text-[#858585]">
            <input type="checkbox" checked={showContours} onChange={(e) => setShowContours(e.target.checked)} />
            Contours
          </label>
          {sampledLines.length > 0 && (
            <label className="flex items-center gap-1 text-[#858585]">
              <input type="checkbox" checked={showLineaments} onChange={(e) => setShowLineaments(e.target.checked)} />
              Lineaments
            </label>
          )}
          <span className="text-[#858585] font-mono hidden sm:inline">
            {grid.ncols} × {grid.nrows} · {grid.cellsize.toFixed(2)} m
          </span>
        </div>
      </div>
      {warnings?.length ? (
        <div className="px-3 py-1.5 bg-[#3a2a12] text-[#f0c674] text-[11px] leading-snug border-b border-[#2b2b2b]">
          {warnings.join(" ")}
        </div>
      ) : null}
      {grid.preview ? (
        <div className="px-3 py-1 bg-[#252526] text-[#858585] text-[11px] border-b border-[#2b2b2b]">
          {grid.previewNote || "Preview/overview — not the full dataset."}
        </div>
      ) : null}
      <div
        ref={hostRef}
        className="flex-1 min-h-0 relative cursor-crosshair"
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          if (e.shiftKey && onProfile) {
            const hit = toGrid(e.clientX, e.clientY);
            if (!hit) return;
            const pt = { x: hit.x, y: hit.y };
            if (!profileA.current) {
              profileA.current = pt;
              setCursor("Profile start set. Shift-click the end point.");
              return;
            }
            onProfile(profileA.current, pt);
            profileA.current = null;
            return;
          }
          viewState.current.dragging = true;
          viewState.current.lastX = e.clientX;
          viewState.current.lastY = e.clientY;
        }}
        onMouseMove={(e) => {
          const vs = viewState.current;
          if (vs.dragging) {
            vs.panX += e.clientX - vs.lastX;
            vs.panY += e.clientY - vs.lastY;
            vs.lastX = e.clientX;
            vs.lastY = e.clientY;
            paint();
          }
          const hit = toGrid(e.clientX, e.clientY);
          if (!hit) {
            setCursor("");
            return;
          }
          const nodata = !Number.isFinite(hit.v) || hit.v === grid.nodata;
          const val = nodata ? "nodata" : `${hit.v.toFixed(2)} ${units}`;
          setCursor(`${hit.x.toFixed(1)}, ${hit.y.toFixed(1)} · ${val}${crsLabel ? ` · ${crsLabel}` : ""}`);
          onInspect?.({ x: hit.x, y: hit.y, value: nodata ? null : hit.v, nodata });
        }}
        onMouseUp={() => {
          viewState.current.dragging = false;
        }}
        onMouseLeave={() => {
          viewState.current.dragging = false;
          setCursor("");
        }}
        onDoubleClick={() => setFitted((n) => n + 1)}
      >
        <canvas ref={viewRef} className="absolute inset-0 w-full h-full" />
      </div>
      <div className="px-4 py-1.5 border-t border-[#2b2b2b] text-[11px] text-[#858585] font-mono flex justify-between gap-3">
        <span>
          {lo.toFixed(2)} – {hi.toFixed(2)} {units}
        </span>
        <span className="truncate">{cursor || "Scroll to zoom · drag to pan · double-click to fit · Shift-click two points for a profile"}</span>
      </div>
    </div>
  );
}

function downsample<T>(items: T[], max = 40000): T[] {
  if (items.length <= max) return items;
  const step = items.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.floor(i * step)]);
  return out;
}

export function extractLonLat(text: string): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const re = /\[\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*,\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) && pts.length < 120000) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
  }
  return pts;
}

export function parseXyzPoints(text: string): { x: number; y: number; z: number }[] {
  const pts: { x: number; y: number; z: number }[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[a-zA-Z]/.test(trimmed)) continue;
    const parts = trimmed.split(/[,\s]+/);
    if (parts.length < 3) continue;
    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    const z = parseFloat(parts[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    pts.push({ x, y, z });
    if (pts.length >= 120000) break;
  }
  return pts;
}

export function PointsMapView({
  title,
  points,
  note,
  colorByZ = false,
}: {
  title: string;
  points: { x: number; y: number; z?: number }[];
  note?: string;
  colorByZ?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sampled = useMemo(() => downsample(points), [points]);
  const stats = useMemo(() => {
    if (!sampled.length) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of sampled) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (typeof p.z === "number") {
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
    }
    return { minX, maxX, minY, maxY, minZ, maxZ, hasZ: Number.isFinite(minZ) && Number.isFinite(maxZ) };
  }, [sampled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !stats || !sampled.length) return;
    const w = 720;
    const h = 540;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, w, h);
    const spanX = stats.maxX - stats.minX || 1;
    const spanY = stats.maxY - stats.minY || 1;
    const spanZ = stats.hasZ ? stats.maxZ - stats.minZ || 1 : 1;
    const pad = 16;
    const drawW = w - pad * 2;
    const drawH = h - pad * 2;
    for (const p of sampled) {
      const px = pad + ((p.x - stats.minX) / spanX) * drawW;
      const py = pad + (1 - (p.y - stats.minY) / spanY) * drawH;
      if (colorByZ && stats.hasZ && typeof p.z === "number") {
        const [r, g, b] = colorFor((p.z - stats.minZ) / spanZ);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
      } else {
        ctx.fillStyle = "#4ec9b0";
      }
      ctx.fillRect(px, py, 2, 2);
    }
  }, [sampled, stats, colorByZ]);

  if (!stats) {
    return (
      <div className="flex-1 bg-[#1e1e1e] flex flex-col items-center justify-center gap-3 text-[#858585] p-8">
        <MapIcon className="h-8 w-8" />
        <p className="text-sm text-[#cccccc]">{title}</p>
        <p className="text-xs max-w-md text-center leading-relaxed">
          {note || "No map coordinates found in this file."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#1e1e1e] flex flex-col h-full overflow-hidden">
      <div className="h-[45px] border-b border-[#2b2b2b] shrink-0 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <MapIcon className="h-4 w-4 text-[#4ec9b0]" />
          <span className="text-[#cccccc] text-[13px] font-medium">{title}</span>
        </div>
        <span className="text-[11px] text-[#858585] font-mono">
          {points.length.toLocaleString()} points
        </span>
      </div>
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full border border-[#2b2b2b] rounded bg-[#111]"
          style={{ width: "min(100%, 720px)", height: "auto" }}
        />
      </div>
      <div className="px-4 py-2 border-t border-[#2b2b2b] text-[11px] text-[#858585] font-mono flex justify-between">
        <span>
          X {stats.minX.toFixed(2)} – {stats.maxX.toFixed(2)}
        </span>
        {stats.hasZ ? (
          <span>
            Z {stats.minZ.toFixed(2)} – {stats.maxZ.toFixed(2)}
          </span>
        ) : (
          <span>
            Y {stats.minY.toFixed(2)} – {stats.maxY.toFixed(2)}
          </span>
        )}
      </div>
    </div>
  );
}

export function JsonCard({ title, text }: { title: string; text: string }) {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const rows =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? Object.entries(parsed as Record<string, unknown>)
      : [];
  const scalars = rows.filter(([, value]) => value === null || typeof value !== "object");
  const nested = rows.filter(([, value]) => value !== null && typeof value === "object");

  return (
    <div className="flex-1 bg-[#1e1e1e] flex flex-col h-full overflow-hidden">
      <div className="h-[45px] border-b border-[#2b2b2b] flex items-center gap-2 px-4">
        <MapIcon className="h-4 w-4 text-[#d7ba7d]" />
        <span className="text-[#cccccc] text-[13px]">{title}</span>
      </div>
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {scalars.length > 0 && (
          <table className="text-[12px] text-[#cccccc] border-collapse">
            <tbody>
              {scalars.map(([key, value]) => (
                <tr key={key} className="border-b border-[#2b2b2b]">
                  <td className="py-1.5 pr-6 text-[#858585] font-mono">{key}</td>
                  <td className="py-1.5 font-mono text-[#9cdcfe]">{String(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {nested.map(([key, value]) => (
          <div key={key}>
            <p className="text-[11px] text-[#858585] font-mono mb-1">{key}</p>
            <pre className="text-[11px] text-[#9cdcfe] whitespace-pre-wrap bg-[#181818] border border-[#2b2b2b] rounded p-3 max-h-[30vh] overflow-auto">
              {JSON.stringify(value, null, 2).slice(0, 8000)}
            </pre>
          </div>
        ))}
        {!scalars.length && !nested.length && (
          <pre className="text-[11px] text-[#9cdcfe] whitespace-pre-wrap">
            {(text || "").slice(0, 8000)}
          </pre>
        )}
      </div>
    </div>
  );
}

export function NumpyCard({ title }: { title: string }) {
  return (
    <div className="flex-1 bg-[#1e1e1e] flex flex-col items-center justify-center gap-3 text-[#858585] p-8">
      <MapIcon className="h-8 w-8" />
      <p className="text-sm text-[#cccccc]">{title}</p>
      <p className="text-xs max-w-md text-center leading-relaxed">
        This is a NumPy grid archive. If the map is blank, the decoder could not read this file; open the matching .tif or .asc in this folder.
      </p>
    </div>
  );
}

export function CrsCard({ title, wkt }: { title: string; wkt: string }) {
  const epsg = wkt.match(/AUTHORITY\["EPSG","(\d+)"\]/g);
  const last = epsg?.[epsg.length - 1]?.match(/\d+/)?.[0];
  const name = wkt.match(/PROJCS\["([^"]+)"/)?.[1] || wkt.match(/GEOGCS\["([^"]+)"/)?.[1] || "Coordinate system";
  return (
    <div className="flex-1 bg-[#1e1e1e] flex flex-col h-full">
      <div className="h-[45px] border-b border-[#2b2b2b] flex items-center gap-2 px-4">
        <MapIcon className="h-4 w-4 text-[#d7ba7d]" />
        <span className="text-[#cccccc] text-[13px]">{title}</span>
      </div>
      <div className="p-6 max-w-xl space-y-3">
        <p className="text-[15px] text-white">{name}</p>
        {last && <p className="text-[12px] text-[#858585] font-mono">EPSG:{last}</p>}
        <pre className="text-[11px] text-[#9cdcfe] whitespace-pre-wrap bg-[#181818] border border-[#2b2b2b] rounded p-3 max-h-[50vh] overflow-auto">
          {wkt.trim()}
        </pre>
      </div>
    </div>
  );
}
