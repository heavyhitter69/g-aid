"use client";

import { useMemo } from "react";
import type { SectionGrid } from "@/lib/section/parse";
import { gprSectionHeading } from "@/lib/gpr-product";

export function SectionView({
  section,
  extraWarnings = [],
}: {
  section: SectionGrid;
  extraWarnings?: string[];
}) {
  const { width, height, cells } = useMemo(() => {
    const xs = [...new Set(section.points.map((p) => p.x))].sort((a, b) => a - b);
    const zs = [...new Set(section.points.map((p) => p.z))].sort((a, b) => a - b);
    const lookup = new Map(section.points.map((p) => [`${p.x}:${p.z}`, p.value]));
    const values = section.points.map((p) => p.value);
    const vmin = values.length ? Math.min(...values) : 0;
    const vmax = values.length ? Math.max(...values) : 1;
    const gpr = section.kind === "gpr-radargram";
    const absMax = Math.max(Math.abs(vmin), Math.abs(vmax), 1e-12);
    const cells = zs.map((z) =>
      xs.map((x) => {
        const v = lookup.get(`${x}:${z}`);
        if (v == null) return "transparent";
        if (gpr) {
          const t = (v / absMax + 1) / 2;
          const g = Math.round(40 + t * 180);
          return `rgb(${g}, ${g}, ${g})`;
        }
        const t = vmax === vmin ? 0.5 : (Math.log10(Math.max(v, 1e-6)) - Math.log10(Math.max(vmin, 1e-6))) /
          (Math.log10(Math.max(vmax, 1e-6)) - Math.log10(Math.max(vmin, 1e-6)) || 1);
        const hue = 240 - t * 220;
        return `hsl(${hue} 70% 45%)`;
      })
    );
    return { width: xs.length, height: zs.length, cells };
  }, [section.points, section.kind]);

  const gpr = section.kind === "gpr-radargram";
  const heading = gpr
    ? gprSectionHeading(section.zReference, section.modelStatus)
    : section.kind === "pseudosection"
      ? "ERT pseudosection"
      : "Experimental ERT 2-D invert (not production)";
  const axisLabel = gpr
    ? /user velocity|depth m/i.test(section.zReference)
      ? "Vertical axis is user-velocity depth (0.5 v t), not a measured depth."
      : "Vertical axis is two-way travel time in ns, not depth."
    : `Depth/elevation: ${section.zReference}`;
  const warnings = [...section.warnings, ...extraWarnings.filter(Boolean)];

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-[#cccccc] p-4 gap-3 overflow-auto">
      <header>
        <p className="text-[10px] uppercase tracking-wide text-[#858585]">Section workspace</p>
        <h2 className="text-sm font-medium" data-testid={gpr ? "gpr-section-title" : "section-title"}>
          {heading}
        </h2>
        <p className="text-[11px] text-[#9d9d9d] mt-1" data-testid={gpr ? "gpr-z-axis" : "section-z-axis"}>
          Units: {section.units}. {axisLabel} Interpolation: {section.interpolation}. Model: {section.modelStatus}.
        </p>
      </header>
      <div
        className="border border-[#3c3c3c] rounded overflow-hidden"
        data-testid={gpr ? "gpr-radargram" : "section-grid"}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(width, 1)}, minmax(4px, 1fr))`,
          gridTemplateRows: `repeat(${Math.max(height, 1)}, 12px)`,
        }}
      >
        {cells.flatMap((row, i) =>
          row.map((color, j) => (
            <div key={`${i}-${j}`} style={{ background: color }} />
          ))
        )}
      </div>
      <ul className="text-[11px] text-[#c0c0c0] space-y-1" data-testid={gpr ? "gpr-warnings" : "section-warnings"}>
        {warnings.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
