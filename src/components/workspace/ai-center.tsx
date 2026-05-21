"use client";

import { motion } from "framer-motion";
import { Brain, Target, AlertTriangle, Layers, MapPin } from "lucide-react";
import { AI_INSIGHTS } from "@/lib/data";
import { PlotlyChart } from "@/components/charts/plotly-chart";

export function AICenter() {
  return (
    <section className="h-full overflow-y-auto p-6">
      <header className="mb-8">
        <h2 className="text-2xl font-bold flex items-center gap-3 text-white">
          <Brain className="h-7 w-7 text-white" />
          AI Interpretation Center
        </h2>
        <p className="text-zinc-400 mt-1">
          Automated subsurface analysis with confidence scoring and geological context
        </p>
      </header>
      <section className="grid lg:grid-cols-3 gap-6 mb-8">
        {[
          { label: "Anomalies Detected", value: "3", icon: AlertTriangle, color: "text-zinc-400" },
          { label: "Mean Confidence", value: "91%", icon: Target, color: "text-white" },
          { label: "Drill Targets", value: "1", icon: MapPin, color: "text-zinc-200" },
        ].map((stat, i) => (
          <motion.article
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-panel rounded-xl p-6 border border-white/5 shadow-sm"
          >
            <stat.icon className={`h-6 w-6 text-white mb-3`} />
            <p className="text-3xl font-bold text-white">{stat.value}</p>
            <p className="text-sm text-zinc-500">{stat.label}</p>
          </motion.article>
        ))}
      </section>
      <section className="grid lg:grid-cols-2 gap-6">
        <article className="glass-panel rounded-xl p-6 border border-white/5">
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-white">
            <Layers className="h-4 w-4 text-white" />
            Interpretation Summary
          </h3>
          <p className="text-sm text-zinc-400 leading-relaxed mb-4">
            The 2.5D ERT inversion of Line 4 reveals a laterally continuous conductive overburden
            (15–35 Ω·m) overlying a resistive basement ({">"}200 Ω·m). A discrete high-resistivity
            anomaly (450–520 Ω·m) at 12–18 m depth between stations 820–860E is interpreted as
            quartz vein mineralization based on correlation with known structural trends.
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            IP chargeability values (12–18 mV/V) support metallic sulfide association. Background
            resistivity statistics: μ = 87 Ω·m, σ = 34 Ω·m (n = 850).
          </p>
        </article>
        <figure className="glass-panel rounded-xl border border-white/5 overflow-hidden h-64">
          <PlotlyChart type="heatmap" className="w-full h-full" />
        </figure>
      </section>
      <section className="mt-8 space-y-4">
        <h3 className="font-semibold text-white">Detailed Findings</h3>
        {AI_INSIGHTS.map((insight, i) => (
          <motion.article
            key={insight.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.1 }}
            className="glass-panel rounded-xl p-6 border border-white/5"
          >
            <header className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-white">{insight.title}</h4>
              <span className="text-sm font-mono text-white">
                Confidence: {(insight.confidence * 100).toFixed(0)}%
              </span>
            </header>
            <p className="text-sm text-zinc-400 mb-3">{insight.summary}</p>
            <footer className="p-3 rounded-lg bg-white/5 border border-white/5">
              <p className="text-xs font-mono text-white/60 mb-1">RECOMMENDATION</p>
              <p className="text-sm text-zinc-400">{insight.recommendation}</p>
            </footer>
            <div className="mt-3 w-full h-1.5 rounded-full overflow-hidden bg-white/10">
              <div
                className="h-full bg-white rounded-full"
                style={{ width: `${insight.confidence * 100}%` }}
              />
            </div>
          </motion.article>
        ))}
      </section>
    </section>
  );
}
