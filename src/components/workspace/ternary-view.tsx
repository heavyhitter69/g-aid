"use client";

import type { RadioTernaryGrid } from "@/lib/radio/ternary";

export function TernaryView({ ternary }: { ternary: RadioTernaryGrid }) {
  const rows = ternary.rgb;
  const height = rows.length;
  const width = rows[0]?.length || 0;

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-[#cccccc] p-4 gap-3 overflow-auto">
      <header>
        <p className="text-[10px] uppercase tracking-wide text-[#858585]">Radiometric workspace</p>
        <h2 className="text-sm font-medium">K-eTh-eU ternary (not lithology)</h2>
        <p className="text-[11px] text-[#9d9d9d] mt-1">
          R={ternary.assignment.R}, G={ternary.assignment.G}, B={ternary.assignment.B}. Stretch: {ternary.p_lo}–{ternary.p_hi} percentile. Source: {ternary.source}.
        </p>
      </header>
      <div
        className="border border-[#3c3c3c] rounded overflow-hidden"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(width, 1)}, minmax(4px, 1fr))`,
          gridTemplateRows: `repeat(${Math.max(height, 1)}, 12px)`,
        }}
      >
        {rows.flatMap((row, i) =>
          row.map((rgb, j) => {
            const r = Math.round(Math.min(1, Math.max(0, rgb[0] || 0)) * 255);
            const g = Math.round(Math.min(1, Math.max(0, rgb[1] || 0)) * 255);
            const b = Math.round(Math.min(1, Math.max(0, rgb[2] || 0)) * 255);
            return <div key={`${i}-${j}`} style={{ background: `rgb(${r}, ${g}, ${b})` }} />;
          })
        )}
      </div>
      <p className="text-[11px] text-[#9d9d9d]">{ternary.formula}</p>
      <ul className="text-[11px] text-[#c0c0c0] space-y-1">
        {ternary.warnings.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
