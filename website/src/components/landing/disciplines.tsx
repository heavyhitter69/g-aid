"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { DISCIPLINES } from "@/lib/data";
import type { Discipline } from "@/types";
import { useWebsiteTheme } from "@/components/shared/theme-provider";
import {
  Waves, Zap, Droplets, Fuel, Pickaxe, Compass, Leaf, Map, Activity, X, ChevronRight
} from "lucide-react";
import { hexToRgba, seededUnit } from "@/lib/utils";

/** Integer % heights — stable across SSR/client (no float serialization drift). */
function barHeight(disciplineId: string, barIndex: number): number {
  const wave = Math.sin(barIndex * 0.8) * 30;
  const noise = seededUnit(disciplineId, barIndex) * 20;
  return Math.max(8, Math.round(20 + wave + noise));
}

const icons: Record<string, React.ElementType> = {
  waves: Waves,
  zap: Zap,
  droplets: Droplets,
  fuel: Fuel,
  pickaxe: Pickaxe,
  compass: Compass,
  leaf: Leaf,
  map: Map,
  activity: Activity,
};

const DISCIPLINE_IMAGES: Record<string, string> = {
  environmental: "/env-gphy.jpg",
  exploration: "/exp-gphy.jpg",
  seismology: "/seis.jpg",
  hydrogeophysics: "/hydro.jpg",
  "data-analysis": "/data.jpg",
  geotechnical: "/gtech.jpg",
  geomatics: "/geo.jpg",
};

const DISCIPLINE_DETAILS: Record<string, {
  problem: string;
  traditionalApps: string[];
  aiProcess: string;
  speedupMultiplier: string;
  keyFeature: string;
  steps: { title: string; desc: string }[];
}> = {
  exploration: {
    problem: "Exploration teams often keep magnetics and gravity grids in separate tools from maps and QC notes.",
    traditionalApps: ["Oasis montaj", "Geosoft grids", "QGIS"],
    aiProcess: "The desktop workspace catalogs local survey files and runs magnetics plus gravity near-zone / zoned planar packs. It does not ingest production SEG-Y or replace a seismic interpretation suite.",
    speedupMultiplier: "Local files",
    keyFeature: "Magnetics and gravity grids in one local catalog",
    steps: [
      { title: "Open a local folder", desc: "The catalog indexes survey files on disk. Nothing is uploaded to a cloud workspace." },
      { title: "Magnetics pack", desc: "Process magnetic survey products that the catalog recognizes." },
      { title: "Gravity near-zone", desc: "Near-zone and zoned planar corrections. Complete Bouguer is not auto-granted." }
    ]
  },
  environmental: {
    problem: "Near-surface investigations mix GPR, resistivity, and simple site maps.",
    traditionalApps: ["GPR viewers", "ERT spreadsheets", "QGIS"],
    aiProcess: "GPR 1.0 and ERT ingest/pseudosection run locally. invert2d is experimental. This is not an automated UXO or plume-delineation product.",
    speedupMultiplier: "Ingest first",
    keyFeature: "GPR radargrams and ERT sections from local files",
    steps: [
      { title: "GPR 1.0", desc: "Ingest and display radargrams with stated QC limits." },
      { title: "ERT ingest", desc: "Load resistivity profiles and show pseudosections." },
      { title: "Experimental invert2d", desc: "2D inversion is labelled experimental, not a production solver." }
    ]
  },
  seismology: {
    problem: "Earthquake monitoring needs continuous waveforms, catalogs, and locators.",
    traditionalApps: ["SAC", "ObsPy", "Seisan"],
    aiProcess: "G-AID is not a seismology processing suite. Waveform picking, hypocenter location, and tomography are out of scope for Shipment 13.",
    speedupMultiplier: "Out of scope",
    keyFeature: "Not a seismology workstation",
    steps: [
      { title: "What exists", desc: "A local catalog and map workspace for supported survey types." },
      { title: "What does not", desc: "No continuous waveform pipeline, phase picker, or hypocenter engine." },
      { title: "If you need that", desc: "Use dedicated seismology tools. G-AID will not pretend to replace them." }
    ]
  },
  hydrogeophysics: {
    problem: "Aquifer work often starts from ERT profiles and well logs, not a full hydro model.",
    traditionalApps: ["Res2DInv", "LAS viewers", "Excel"],
    aiProcess: "ERT ingest and LAS 2.0 borehole logs are in scope. Coupled hydrogeologic inversion and TDEM sounding workflows are not.",
    speedupMultiplier: "Logs + ERT",
    keyFeature: "ERT sections and LAS borehole tracks locally",
    steps: [
      { title: "ERT profiles", desc: "Ingest resistivity data and view pseudosections." },
      { title: "LAS 2.0", desc: "Borehole logs with collar mapping when CRS is present." },
      { title: "Not included", desc: "No Modflow coupling and no production ERT inversion product." }
    ]
  },
  "data-analysis": {
    problem: "Survey processing is a mix of grids, QC, and maps rather than a generic inversion sandbox.",
    traditionalApps: ["Python notebooks", "GMT", "Excel"],
    aiProcess: "The workspace runs a local processing DAG with pack-specific nodes. Joint inversion across physics is not a shipped product.",
    speedupMultiplier: "Catalog DAG",
    keyFeature: "Local processing DAG with pack QC",
    steps: [
      { title: "Catalog", desc: "Discover files and register supported formats." },
      { title: "Pack nodes", desc: "Run the magnetics, gravity, GPR, LAS, GIS, and geochem nodes that exist." },
      { title: "Maps", desc: "Preview grids and vectors. This is 2D map UI, not a 3D voxel engine." }
    ]
  },
  geotechnical: {
    problem: "Site investigation files include GPR, resistivity, and simple GIS outlines.",
    traditionalApps: ["GPR viewers", "CAD", "Excel"],
    aiProcess: "GPR 1.0, ERT ingest, and shapefile/GeoJSON overlays help organize site files. MASW dispersion picking and SPT fusion are not implemented.",
    speedupMultiplier: "Site files",
    keyFeature: "GPR, ERT, and vector overlays for site folders",
    steps: [
      { title: "Open the site folder", desc: "Catalog local files; keep data on disk." },
      { title: "GPR and ERT", desc: "View radargrams and resistivity sections when the format is supported." },
      { title: "Vectors", desc: "GeoJSON CRS84 and shapefiles with topology-aware holes." }
    ]
  },
  geomatics: {
    problem: "Field programs need simple GIS vectors on maps, not a full remote-sensing stack.",
    traditionalApps: ["QGIS", "ArcGIS", "shapefile tools"],
    aiProcess: "GeoJSON CRS84 and shapefile ingest with topology-aware holes. LiDAR classification, GNSS adjustment, and photogrammetry DEMs are not in Shipment 13.",
    speedupMultiplier: "Vectors",
    keyFeature: "GeoJSON CRS84 and shapefile overlays",
    steps: [
      { title: "GeoJSON CRS84", desc: "RFC 7946 lon/lat GeoJSON on the map." },
      { title: "Shapefiles", desc: "Ingest shapefiles and keep polygon holes instead of exterior-only approximations." },
      { title: "Not included", desc: "No LiDAR point-cloud engine and no photogrammetry DEM pipeline." }
    ]
  }
};

export function Disciplines() {
  const theme = useWebsiteTheme().theme;
  const isDark = theme === "dark";
  const [selectedDetail, setSelectedDetail] = useState<Discipline | null>(null);

  return (
    <section id="disciplines" className="relative py-24 px-6 bg-black">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-primary">
            Geophysical <span className="text-primary">Disciplines</span>
          </h2>
          <p className="text-zinc-400 max-w-2xl mx-auto">
            Application areas. Click a card for what Shipment 13 actually supports — and what it does not.
          </p>
        </motion.div>
        
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 [&>*:last-child:nth-child(3n+1)]:lg:col-start-2">
          {DISCIPLINES.map((d, i) => {
            const Icon = icons[d.icon] || Waves;
            const cardImage = DISCIPLINE_IMAGES[d.id];
            return (
              <motion.div
                key={d.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ y: -6, scale: 1.02 }}
                onClick={() => setSelectedDetail(d)}
                className="group relative overflow-hidden rounded-xl border border-zinc-850 bg-zinc-950/40 p-6 cursor-pointer transition-all duration-300 hover:border-blue-500/30 hover:bg-zinc-900/10 flex flex-col min-h-[320px]"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `radial-gradient(circle at 50% 0%, ${d.color}12, transparent 70%)` }}
                />
                <Icon className="h-8 w-8 mb-4 transition-colors" style={{ color: d.color }} />
                <h3 className="font-semibold text-primary mb-2 transition-colors">{d.name}</h3>
                <p className="text-sm text-zinc-400 mb-4">{d.description}</p>
                
                <div className="relative -mx-6 -mb-6 px-6 pb-6 pt-4 mt-auto flex-1 flex flex-col justify-end">
                  {cardImage && (
                    <div className="absolute inset-0 z-0">
                      <Image 
                        src={cardImage} 
                        alt={d.name} 
                        fill 
                        className="object-cover opacity-35 group-hover:opacity-55 transition-opacity duration-500" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
                    </div>
                  )}

                  <div className="relative z-10">
                    {!cardImage ? (
                      <div className="h-16 rounded border border-zinc-900 bg-zinc-950/30 overflow-hidden relative">
                        <motion.div
                          className="absolute inset-0 flex items-end gap-px px-2 pb-2"
                          initial={{ opacity: 0.3 }}
                          whileHover={{ opacity: 1 }}
                        >
                          {Array.from({ length: 20 }).map((_, j) => (
                            <div
                              key={j}
                              className="flex-1 rounded-t-sm transition-all group-hover:opacity-100"
                              style={{
                                height: `${barHeight(d.id, j)}%`,
                                backgroundColor: hexToRgba(d.color, 0.38),
                              }}
                            />
                          ))}
                        </motion.div>
                      </div>
                    ) : (
                      <div className="h-16" />
                    )}
                    
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {d.workflows.slice(0, 2).map((w) => (
                        <span 
                          key={w} 
                          className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono"
                        >
                          {w}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {selectedDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedDetail(null)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.93, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.93, opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className={`relative max-w-4xl w-full rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row backdrop-blur-2xl transition-all duration-300 ${isDark ? "bg-zinc-950/65 border border-white/10" : "bg-white/80 border border-zinc-200"}`}
              style={{ 
                boxShadow: isDark 
                  ? `0 0 50px -10px ${selectedDetail.color}20` 
                  : `0 0 40px -10px rgba(0,0,0,0.15)`,
              }}
            >
              <div 
                className="absolute top-0 left-0 right-0 h-1 z-20" 
                style={{ backgroundColor: selectedDetail.color }} 
              />

              <button
                onClick={() => setSelectedDetail(null)}
                className={`absolute top-4 right-4 z-30 p-2 rounded-full border transition-all duration-200 cursor-pointer ${isDark ? "bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10" : "bg-zinc-100 border-zinc-200 text-zinc-650 hover:text-zinc-900 hover:bg-zinc-200"}`}
              >
                <X className="h-4 w-4" />
              </button>

              <div className={`md:w-1/2 p-6 md:p-8 flex flex-col border-b md:border-b-0 md:border-r ${isDark ? "border-white/5" : "border-zinc-200"}`}>
                <div className="flex items-center gap-3 mb-4">
                  <div 
                    className={`p-2.5 rounded-lg border animate-pulse ${isDark ? "bg-white/5 border-white/10" : "bg-zinc-100 border-zinc-200"}`}
                  >
                    {(() => {
                      const Icon = icons[selectedDetail.icon] || Waves;
                      return <Icon className="h-6 w-6" style={{ color: selectedDetail.color }} />;
                    })()}
                  </div>
                  <span className={`text-xs uppercase tracking-wider font-mono ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    Support snapshot
                  </span>
                </div>

                <h3 className={`text-2xl font-bold mb-2 leading-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
                  {selectedDetail.name}
                </h3>
                <p className={`text-sm mb-6 leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  {selectedDetail.description}
                </p>

                <div className="mb-6">
                  <h4 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    Standard Data & Inputs
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedDetail.datasets.map((ds) => (
                      <span key={ds} className={`text-xs px-2.5 py-1 rounded border font-mono ${isDark ? "bg-white/5 border-white/10 text-zinc-300" : "bg-zinc-100/80 border-zinc-200 text-zinc-700"}`}>
                        {ds}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                    What Shipment 13 does
                  </h4>
                  <div className="space-y-3">
                    {(DISCIPLINE_DETAILS[selectedDetail.id]?.steps || []).map((step, idx) => (
                      <div key={idx} className="flex gap-3 items-start">
                        <div className={`mt-0.5 flex items-center justify-center h-5 w-5 rounded-full border text-xs font-bold font-mono ${isDark ? "bg-white/5 border-white/10 text-zinc-200" : "bg-zinc-100 border-zinc-200 text-zinc-700"}`}>
                          {idx + 1}
                        </div>
                        <div>
                          <h5 className={`text-xs font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{step.title}</h5>
                          <p className={`text-[11px] leading-relaxed mt-0.5 ${isDark ? "text-zinc-400" : "text-zinc-550"}`}>{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="md:w-1/2 p-6 md:p-8 bg-white/[0.01] flex flex-col justify-between relative overflow-hidden">
                <div 
                  className={`absolute -right-20 -bottom-20 w-64 h-64 rounded-full blur-[100px] pointer-events-none ${isDark ? "opacity-15" : "opacity-10"}`}
                  style={{ backgroundColor: selectedDetail.color }}
                />

                <div>
                  <div className="flex justify-between items-start mb-6">
                    <span className={`text-xs uppercase tracking-wider font-mono ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                      Scope
                    </span>
                    <div 
                      className="px-3 py-1 rounded-full border text-xs font-semibold font-mono shadow-sm"
                      style={{ 
                        borderColor: selectedDetail.color, 
                        color: selectedDetail.color, 
                        backgroundColor: `${selectedDetail.color}10` 
                      }}
                    >
                      {DISCIPLINE_DETAILS[selectedDetail.id]?.speedupMultiplier || "See notes"}
                    </div>
                  </div>

                  <div className={`p-4 rounded-xl border mb-6 ${isDark ? "border-white/10 bg-white/[0.02]" : "border-zinc-200 bg-zinc-50/50"}`}>
                    <h4 className={`text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? "text-zinc-400" : "text-zinc-655"}`}>
                      Core Capability
                    </h4>
                    <p className="text-sm font-semibold" style={{ color: selectedDetail.color }}>
                      {DISCIPLINE_DETAILS[selectedDetail.id]?.keyFeature}
                    </p>
                  </div>

                  <div className="space-y-4 mb-8">
                    <div>
                      <h5 className={`text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${isDark ? "bg-zinc-600" : "bg-zinc-450"}`} />
                        Traditional Process (App-Hopping)
                      </h5>
                      <p className={`text-xs leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                        {DISCIPLINE_DETAILS[selectedDetail.id]?.problem}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] text-zinc-500 font-mono">Required:</span>
                        {(DISCIPLINE_DETAILS[selectedDetail.id]?.traditionalApps || []).map((app) => (
                          <span key={app} className={`text-[10px] px-2 py-0.5 rounded border font-mono ${isDark ? "bg-white/5 border-white/5 text-zinc-400" : "bg-zinc-100 border-zinc-200 text-zinc-600"}`}>
                            {app}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className={`pt-3 border-t ${isDark ? "border-white/5" : "border-zinc-200"}`}>
                      <h5 className={`text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: selectedDetail.color }} />
                        Unified AI-Agent Platform
                      </h5>
                      <p className={`text-xs leading-relaxed ${isDark ? "text-zinc-350" : "text-zinc-600"}`}>
                        {DISCIPLINE_DETAILS[selectedDetail.id]?.aiProcess}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 pt-4">
                  <Link
                    href="/signup"
                    onClick={() => setSelectedDetail(null)}
                    className={`group/btn w-full py-3 px-4 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer shadow-lg active:scale-[0.98] ${isDark ? "bg-white !text-black hover:bg-zinc-200 shadow-white/5" : "bg-zinc-900 !text-white hover:bg-zinc-800 shadow-zinc-950/10"}`}
                  >
                    <span className={isDark ? "!text-black" : "!text-white"}>Deploy Specialized Agent</span>
                    <ChevronRight className={`h-4 w-4 transition-transform group-hover/btn:translate-x-1 ${isDark ? "!text-black" : "!text-white"}`} />
                  </Link>
                  <p className="text-[10px] text-center text-zinc-500 mt-2 font-mono">
                    Integrate raw dataset parsing ➔ QC inversion ➔ interactive modeling
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
