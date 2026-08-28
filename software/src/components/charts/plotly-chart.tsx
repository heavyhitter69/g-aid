"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

const Plot = dynamic(() => import("react-plotly.js"), { ssr: false });

interface PlotlyChartProps {
  type: "heatmap" | "contour" | "histogram" | "waveform" | "scatter3d";
  className?: string;
  /** Real grid values. Without this the chart stays empty — no seeded demo data. */
  z?: number[][];
  x?: number[];
  y?: number[];
  title?: string;
}

export function PlotlyChart({ type, className, z, x, y, title }: PlotlyChartProps) {
  const hasData =
    (Array.isArray(z) && z.length > 0) ||
    (Array.isArray(x) && x.length > 0) ||
    (Array.isArray(y) && y.length > 0);

  const { data, layout } = useMemo(() => {
    const darkLayout = {
      paper_bgcolor: "transparent",
      plot_bgcolor: "rgba(0,0,0,0.2)",
      font: { color: "#a1a1aa", family: "monospace", size: 10 },
      margin: { l: 50, r: 20, t: 30, b: 40 },
      xaxis: { gridcolor: "rgba(255,255,255,0.05)", zerolinecolor: "rgba(255,255,255,0.1)" },
      yaxis: { gridcolor: "rgba(255,255,255,0.05)", zerolinecolor: "rgba(255,255,255,0.1)" },
    };

    if (!hasData) {
      return {
        data: [],
        layout: {
          ...darkLayout,
          title: { text: title || "No survey grid loaded", font: { color: "#e2e8f0", size: 12 } },
          annotations: [
            {
              text: "Open a completed magnetic run to plot real values.",
              showarrow: false,
              font: { color: "#71717a", size: 11 },
              xref: "paper",
              yref: "paper",
              x: 0.5,
              y: 0.5,
            },
          ],
        },
      };
    }

    if (type === "heatmap" || type === "contour") {
      return {
        data: [{
          z: z || [],
          type: type === "contour" ? ("contour" as const) : ("heatmap" as const),
          colorscale: "Viridis",
        }],
        layout: { ...darkLayout, title: { text: title || "Grid", font: { color: "#e2e8f0", size: 12 } } },
      };
    }

    if (type === "histogram") {
      return {
        data: [{
          x: x || (z || []).flat(),
          type: "histogram" as const,
          marker: { color: "rgba(255,255,255,0.4)" },
          nbinsx: 40,
        }],
        layout: { ...darkLayout, title: { text: title || "Distribution", font: { color: "#e2e8f0", size: 12 } } },
      };
    }

    return {
      data: [{
        x: x || [],
        y: y || [],
        type: "scatter" as const,
        mode: "lines" as const,
        line: { color: "#ffffff", width: 1 },
      }],
      layout: { ...darkLayout, title: { text: title || "Series", font: { color: "#e2e8f0", size: 12 } } },
    };
  }, [hasData, type, title, z, x, y]);

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
