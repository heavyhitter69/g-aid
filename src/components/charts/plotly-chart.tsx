"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { seededUnit } from "@/lib/utils";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface PlotlyChartProps {
  type: "heatmap" | "contour" | "histogram" | "waveform" | "scatter3d";
  className?: string;
}

function generateResistivityData() {
  const z: number[][] = [];
  for (let i = 0; i < 40; i++) {
    const row: number[] = [];
    for (let j = 0; j < 60; j++) {
      const anomaly = Math.exp(-((i - 20) ** 2 + (j - 35) ** 2) / 80) * 200;
      row.push(30 + seededUnit("ert", i, j) * 20 + anomaly);
    }
    z.push(row);
  }
  return z;
}

export function PlotlyChart({ type, className }: PlotlyChartProps) {
  const { data, layout } = useMemo(() => {
    const darkLayout = {
      paper_bgcolor: "transparent",
      plot_bgcolor: "rgba(0,0,0,0.2)",
      font: { color: "#a1a1aa", family: "monospace", size: 10 },
      margin: { l: 50, r: 20, t: 30, b: 40 },
      xaxis: { gridcolor: "rgba(255,255,255,0.05)", zerolinecolor: "rgba(255,255,255,0.1)" },
      yaxis: { gridcolor: "rgba(255,255,255,0.05)", zerolinecolor: "rgba(255,255,255,0.1)" },
    };

    if (type === "heatmap") {
      return {
        data: [{
          z: generateResistivityData(),
          type: "heatmap" as const,
          colorscale: "Viridis",
          colorbar: { title: "ρ (Ω·m)", titlefont: { color: "#a1a1aa" }, tickfont: { color: "#71717a" } },
        }],
        layout: { ...darkLayout, title: { text: "ERT Resistivity Section", font: { color: "#e2e8f0", size: 12 } } },
      };
    }

    if (type === "contour") {
      const z = generateResistivityData();
      return {
        data: [{ z, type: "contour" as const, colorscale: "Viridis", contours: { coloring: "heatmap" as const } }],
        layout: { ...darkLayout, title: { text: "Apparent Resistivity Contours", font: { color: "#e2e8f0", size: 12 } } },
      };
    }

    if (type === "histogram") {
      return {
        data: [{
          x: Array.from({ length: 500 }, (_, i) =>
            20 + seededUnit("hist", i) * 80 + (seededUnit("hist-outlier", i) > 0.9 ? 150 : 0)
          ),
          type: "histogram" as const,
          marker: { color: "rgba(255,255,255,0.4)" },
          nbinsx: 40,
        }],
        layout: { ...darkLayout, title: { text: "Resistivity Distribution", font: { color: "#e2e8f0", size: 12 } } },
      };
    }

    if (type === "waveform") {
      const t = Array.from({ length: 200 }, (_, i) => i * 0.004);
      return {
        data: [{
          x: t,
          y: t.map((ti, i) =>
            Math.sin(2 * Math.PI * 25 * ti) * Math.exp(-ti * 3) + (seededUnit("wave", i) - 0.5) * 0.1
          ),
          type: "scatter" as const,
          mode: "lines" as const,
          line: { color: "#ffffff", width: 1 },
        }],
        layout: { ...darkLayout, title: { text: "Induced Polarization Decay", font: { color: "#e2e8f0", size: 12 } }, xaxis: { ...darkLayout.xaxis, title: "Time (s)" }, yaxis: { ...darkLayout.yaxis, title: "mV/V" } },
      };
    }

    // scatter3d
    const n = 200;
    return {
      data: [{
        x: Array.from({ length: n }, (_, i) => seededUnit("3d-x", i) * 100),
        y: Array.from({ length: n }, (_, i) => seededUnit("3d-y", i) * 100),
        z: Array.from({ length: n }, (_, i) => -5 - seededUnit("3d-z", i) * 30),
        mode: "markers" as const,
        type: "scatter3d" as const,
        marker: {
          size: 3,
          color: Array.from({ length: n }, (_, i) => seededUnit("3d-c", i) * 100),
          colorscale: "Plasma",
          opacity: 0.8,
        },
      }],
      layout: {
        ...darkLayout,
        title: { text: "3D Subsurface Model Preview", font: { color: "#e2e8f0", size: 12 } },
        scene: {
          bgcolor: "transparent",
          xaxis: { title: "E (m)", gridcolor: "rgba(255,255,255,0.05)" },
          yaxis: { title: "N (m)", gridcolor: "rgba(255,255,255,0.05)" },
          zaxis: { title: "Depth (m)", gridcolor: "rgba(255,255,255,0.05)" },
        },
      },
    };
  }, [type]);

  return (
    <figure className={className}>
      <Plot
        data={data}
        layout={layout}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    </figure>
  );
}
