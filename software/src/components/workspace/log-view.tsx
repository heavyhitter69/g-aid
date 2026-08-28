"use client";

import { useMemo, useState } from "react";
import type { BoreholeLog } from "@/lib/log/parse";
import { boreholeLogHeading, boreholeProductWarnings } from "@/lib/borehole-product";

export function LogView({
  log,
  extraWarnings = [],
}: {
  log: BoreholeLog;
  extraWarnings?: string[];
}) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(log.tracks.map((track) => [track.mnemonic, true]))
  );
  const visible = log.tracks.filter((track) => enabled[track.mnemonic] !== false);
  const warnings = [
    ...boreholeProductWarnings({
      depthReference: log.depthReference,
      trajectoryComputed: log.trajectoryComputed,
    }),
    ...log.warnings,
    ...extraWarnings,
  ];

  const layout = useMemo(() => {
    const depths = visible.flatMap((track) => track.samples.map((s) => s.depth).filter((d) => Number.isFinite(d)));
    const minD = depths.length ? Math.min(...depths) : 0;
    const maxD = depths.length ? Math.max(...depths) : 1;
    const pad = 8;
    const header = 28;
    const width = Math.max(360, visible.length * 140 + 72);
    const height = 520;
    const innerH = height - header - pad * 2;
    const scale = (d: number) => header + pad + ((d - minD) / (maxD - minD || 1)) * innerH;
    return { minD, maxD, pad, header, width, height, innerH, scale };
  }, [visible]);

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-[#cccccc]" data-testid="borehole-log">
      <header className="px-3 py-2 border-b border-[#2b2b2b]">
        <h2 className="text-sm font-medium" data-testid="log-heading">
          {boreholeLogHeading(log.depthReference)}
        </h2>
        <p className="text-[11px] text-[#9d9d9d]">
          Well {log.wellId || "(unnamed)"} · {log.depthIndex} [{log.depthUnits || "unit undocumented"}] · LAS {log.lasVersion || "2.0"} WRAP.{log.wrap || "NO"}
          {log.catalogId ? ` · catalog ${log.catalogId}` : ""}
        </p>
      </header>
      <div className="px-3 py-2 border-b border-[#2b2b2b] flex flex-wrap gap-2 text-[11px]">
        {log.tracks.map((track) => (
          <label key={track.mnemonic} className="flex items-center gap-1">
            <input
              type="checkbox"
              data-testid={`curve-${track.mnemonic}`}
              checked={enabled[track.mnemonic] !== false}
              onChange={(e) => setEnabled((current) => ({ ...current, [track.mnemonic]: e.target.checked }))}
            />
            <span>
              {track.mnemonic}
              <span className="text-[#858585]"> [{track.units || "?"}] unknown semantics</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <svg
          role="img"
          aria-label="Measured-depth borehole log tracks"
          width={layout.width}
          height={layout.height}
          className="block"
          data-testid="log-tracks"
        >
          <rect width={layout.width} height={layout.height} fill="#1e1e1e" />
          {ticks(layout.minD, layout.maxD).map((depth) => {
            const y = layout.scale(depth);
            return (
              <g key={depth}>
                <line x1={48} x2={layout.width - 8} y1={y} y2={y} stroke="#2b2b2b" />
                <text x={44} y={y + 3} textAnchor="end" fill="#858585" fontSize="10">
                  {depth}
                </text>
              </g>
            );
          })}
          <text x={8} y={16} fill="#858585" fontSize="10">
            MD {log.depthUnits || ""} ↓
          </text>
          {visible.map((track, index) => {
            const x0 = 56 + index * 140;
            const finite = track.samples.filter((s) => s.value != null && Number.isFinite(s.value as number));
            const vmin = finite.length ? Math.min(...finite.map((s) => s.value as number)) : 0;
            const vmax = finite.length ? Math.max(...finite.map((s) => s.value as number)) : 1;
            const xAt = (v: number) => x0 + ((v - vmin) / (vmax - vmin || 1)) * 120;
            const segments = polylines(track.samples);
            return (
              <g key={track.mnemonic} data-testid={`track-${track.mnemonic}`}>
                <text x={x0} y={18} fill="#cccccc" fontSize="11">
                  {track.mnemonic} {track.units}
                </text>
                {segments.map((seg, si) => (
                  <polyline
                    key={si}
                    fill="none"
                    stroke="#4fc1ff"
                    strokeWidth="1.5"
                    points={seg
                      .map((s) => `${xAt(s.value as number)},${layout.scale(s.depth)}`)
                      .join(" ")}
                  />
                ))}
              </g>
            );
          })}
        </svg>
        <dl className="px-3 py-2 text-[11px] grid grid-cols-2 gap-x-4 gap-y-1 border-t border-[#2b2b2b]" data-testid="log-metadata">
          <dt className="text-[#858585]">Depth reference</dt>
          <dd>{log.depthReference} (not TVD)</dd>
          <dt className="text-[#858585]">Null value</dt>
          <dd>{log.nullValue ?? "undocumented"}</dd>
          <dt className="text-[#858585]">Trajectory</dt>
          <dd>{log.trajectoryComputed ? "computed (invalid for this pack)" : "not computed"}</dd>
          <dt className="text-[#858585]">Provenance</dt>
          <dd>{log.checksum ? `checksum ${log.checksum.slice(0, 12)}…` : "run product"}</dd>
        </dl>
        <ul className="px-3 py-2 text-[11px] text-[#ce9178] space-y-1" data-testid="log-warnings">
          {warnings.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ticks(min: number, max: number): number[] {
  const span = max - min || 1;
  const step = niceStep(span / 8);
  const start = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step / 2; v += step) {
    if (v >= min - step / 10) out.push(Number(v.toPrecision(8)));
  }
  return out;
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.abs(raw) || 1));
  const n = raw / pow;
  if (n < 1.5) return pow;
  if (n < 3) return 2 * pow;
  if (n < 7) return 5 * pow;
  return 10 * pow;
}

function polylines(samples: BoreholeLog["tracks"][number]["samples"]): BoreholeLog["tracks"][number]["samples"][] {
  const segs: BoreholeLog["tracks"][number]["samples"][] = [];
  let cur: BoreholeLog["tracks"][number]["samples"] = [];
  for (const sample of samples) {
    if (sample.value == null || !Number.isFinite(sample.depth)) {
      if (cur.length) segs.push(cur);
      cur = [];
      continue;
    }
    cur.push(sample);
  }
  if (cur.length) segs.push(cur);
  return segs;
}
