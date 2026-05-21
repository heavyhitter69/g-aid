"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { PlotlyChart } from "@/components/charts/plotly-chart";

const chartTypes = [
  { id: "heatmap" as const, label: "Resistivity Heatmap" },
  { id: "contour" as const, label: "Contour Map" },
  { id: "histogram" as const, label: "Histogram" },
  { id: "waveform" as const, label: "Waveform" },
  { id: "scatter3d" as const, label: "3D Subsurface" },
];

export function VisualizationStudio() {
  const [active, setActive] = useState<typeof chartTypes[number]["id"]>("heatmap");
  const [loading, setLoading] = useState(false);

  const switchChart = (id: typeof active) => {
    setLoading(true);
    setActive(id);
    setTimeout(() => setLoading(false), 400);
  };

  return (
    <section className="h-full flex flex-col p-4">
      <header className="mb-4">
        <h2 className="text-lg font-semibold mb-1">Visualization Studio</h2>
        <p className="text-sm text-muted">Interactive scientific plots with anomaly overlays</p>
      </header>
      <nav className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {chartTypes.map((ct) => (
          <motion.button
            key={ct.id}
            whileHover={{ scale: 1.02 }}
            onClick={() => switchChart(ct.id)}
            className={`shrink-0 text-xs px-4 py-2 rounded-lg font-mono transition-all ${
              active === ct.id
                ? "bg-primary/10 border-primary/40 text-primary"
                : "bg-white/5 border border-white/10 text-secondary hover:text-primary transition-all"
            }`}
          >
            {ct.label}
          </motion.button>
        ))}
      </nav>
      <figure className="flex-1 min-h-[400px] glass-panel rounded-xl border border-white/5 overflow-hidden relative">
        {loading && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 flex items-center justify-center bg-black/50 z-10"
          >
            <span className="font-mono text-xs text-white animate-pulse">Rendering plot...</span>
          </motion.span>
        )}
        <PlotlyChart type={active} className="w-full h-full min-h-[400px]" />
      </figure>
    </section>
  );
}
