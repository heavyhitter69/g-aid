"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { DISCIPLINES } from "@/lib/data";
import {
  Waves, Zap, Droplets, Fuel, Pickaxe, Compass, Leaf,
} from "lucide-react";
import { hexToRgba, seededUnit } from "@/lib/utils";

/** Integer % heights — stable across SSR/client (no float serialization drift). */
function barHeight(disciplineId: string, barIndex: number): number {
  const wave = Math.sin(barIndex * 0.8) * 30;
  const noise = seededUnit(disciplineId, barIndex) * 20;
  return Math.max(8, Math.round(20 + wave + noise));
}

const icons: Record<string, React.ElementType> = {
  waves: Waves, zap: Zap, droplets: Droplets, fuel: Fuel,
  pickaxe: Pickaxe, compass: Compass, leaf: Leaf,
};

const DISCIPLINE_IMAGES: Record<string, string> = {
  environmental: "/env-gphy.jpg",
  exploration: "/exp-gphy.jpg",
  seismology: "/seis.jpg",
  hydrogeophysics: "/hydro.jpg",
  "data-analysis": "/data.jpg",
};

export function Disciplines() {
  return (
    <section id="disciplines" className="relative py-24 px-6">
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
          <p className="text-zinc-300 max-w-2xl mx-auto">
            Specialized agents and workflows to assist in branches of applied geophysics
          </p>
        </motion.div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
                className="group relative overflow-hidden rounded-xl border border-subtle bg-primary/[0.02] p-6 cursor-pointer transition-all duration-300 hover:border-primary/30 hover:bg-primary/[0.05] flex flex-col"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: `radial-gradient(circle at 50% 0%, ${d.color}15, transparent 70%)` }}
                />
                <Icon className="h-8 w-8 mb-4 transition-colors" style={{ color: d.color }} />
                <h3 className="font-semibold text-primary mb-2">{d.name}</h3>
                <p className="text-sm text-zinc-400 mb-4">{d.description}</p>
                <div className="relative -mx-6 -mb-6 px-6 pb-6 pt-4 mt-auto flex-1 flex flex-col justify-end">
                  {cardImage && (
                    <div className="absolute inset-0 z-0">
                      <Image 
                        src={cardImage} 
                        alt={d.name} 
                        fill 
                        className="object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-500" 
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    </div>
                  )}

                  <div className="relative z-10">
                    {!cardImage ? (
                      <div className="h-16 rounded border border-subtle bg-background/30 overflow-hidden relative">
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
                    <div className="mt-3 flex flex-wrap gap-1">
                      {d.workflows.slice(0, 2).map((w) => (
                        <span 
                          key={w} 
                          className={cardImage
                            ? "text-[10px] px-2 py-0.5 rounded-full bg-black/50 text-white/90 border border-white/20 backdrop-blur-sm font-mono" 
                            : "text-[10px] px-2 py-0.5 rounded-full bg-primary/5 text-muted font-mono"}
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
    </section>
  );
}

