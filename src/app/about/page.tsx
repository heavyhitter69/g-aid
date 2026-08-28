"use client";

import { motion } from "framer-motion";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { CuratedPill } from "@/components/landing/curated-pill";
import {
  Compass,
  HardDrive,
  Layers,
  ShieldAlert,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";

const STATS = [
  { value: "Local", label: "Desktop workspace" },
  { value: "S13", label: "Shipment 13 packs" },
  { value: "2D", label: "Maps and sections" },
  { value: "No GA", label: "Installers unpublished" },
];

const PRINCIPLES = [
  {
    icon: HardDrive,
    title: "Local-first files",
    desc: "Survey data stays in folders on your machine. G-AID is an Electron desktop workspace, not a hosted cloud project system.",
  },
  {
    icon: Layers,
    title: "Packs with limits",
    desc: "Magnetics, gravity near-zone, ERT ingest, radiometrics, GPR, LAS, geochemistry, GeoJSON, and shapefiles. Experimental invert2d is labelled experimental. Complete Bouguer is not auto-granted.",
  },
  {
    icon: Compass,
    title: "Maps, not voxels",
    desc: "The live UI is 2D grids, vectors, radargrams, logs, and sections. There is no production 3D voxel or WebGL volume renderer.",
  },
  {
    icon: ShieldAlert,
    title: "Refuse rather than fake",
    desc: "Unsupported formats and unfinished physics are documented as out of scope instead of presented as finished cloud agents.",
  },
];

const TIMELINE = [
  {
    year: "Research",
    title: "Desktop prototype",
    desc: "G-AID started as a local workspace for geophysical survey files, maps, and processing packs — not as a public SaaS.",
  },
  {
    year: "Shipment 13",
    title: "Capability packs",
    desc: "Catalog/DAG foundation plus magnetics, gravity near-zone and zoned planar, ERT ingest, RAD 1.0, GPR 1.0, LAS 2.0, GEOCHEM 1.0, GeoJSON CRS84, and shapefiles with topology-aware holes.",
  },
  {
    year: "Now",
    title: "Public site integrity",
    desc: "This website describes that desktop software honestly. Public installers, billed accounts, and hosted inference are not available.",
  },
];

export default function AboutPage() {
  return (
    <main
      className="relative min-h-screen transition-colors duration-200 overflow-hidden"
      style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}
    >
      <AnimatedBackground variant="grid" />
      <Navbar />

      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-16">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-mono text-[var(--text-secondary)] mb-6"
          >
            LOCAL DESKTOP GEOPHYSICS WORKSPACE
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6"
            style={{ color: "var(--text-primary)" }}
          >
            A local workspace for earth-science survey files
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="text-lg leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            G-AID is built by Genie Platforms as an Electron + Next.js + Python desktop
            app. It helps you catalog, map, and process supported geophysical files on
            your own machine. It is not a general-availability cloud product.
          </motion.p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-24">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 + 0.3 }}
              className="rounded-xl border p-6 text-center transition-all duration-200"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div className="text-3xl md:text-4xl font-extrabold font-mono mb-1 text-[#e8613a]">
                {stat.value}
              </div>
              <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>

        <hr className="border-t mb-24" style={{ borderColor: "var(--border-subtle)" }} />

        <div className="mb-24">
          <div className="max-w-2xl mb-16">
            <h2 className="text-3xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              How G-AID is built
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              The public site describes the desktop software that exists today, including its limits.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {PRINCIPLES.map((p, i) => {
              const IconComp = p.icon;
              return (
                <motion.div
                  key={p.title}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -16 : 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className="flex gap-4 p-6 rounded-xl border transition-colors duration-200"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    borderColor: "var(--border-subtle)",
                  }}
                >
                  <div className="p-2.5 h-10 w-10 shrink-0 rounded-lg flex items-center justify-center bg-white/5 border border-white/10 text-[#e8613a]">
                    <IconComp className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base mb-2" style={{ color: "var(--text-primary)" }}>
                      {p.title}
                    </h3>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {p.desc}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <div className="mb-24">
          <div className="grid lg:grid-cols-3 gap-12">
            <div className="lg:col-span-1">
              <h2 className="text-3xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
                Status
              </h2>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-secondary)" }}>
                Shipment 13 is the current capability set. A public installer and hosted accounts are not part of that shipment.
              </p>
              <Link
                href="/download"
                className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#e8613a] hover:underline"
              >
                Desktop app status
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="lg:col-span-2 space-y-6 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-white/10">
              {TIMELINE.map((t, i) => (
                <motion.div
                  key={t.year}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.15 }}
                  className="relative pl-10"
                >
                  <div className="absolute left-[11px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[#e8613a] bg-black" />
                  <span className="text-xs font-mono text-[#e8613a] font-bold block mb-1">
                    {t.year}
                  </span>
                  <h3 className="font-bold text-lg mb-1" style={{ color: "var(--text-primary)" }}>
                    {t.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {t.desc}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        <hr className="border-t mb-24" style={{ borderColor: "var(--border-subtle)" }} />

        <div className="mb-24">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              Contributors
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              G-AID is developed at Genie Platforms with academic collaborators.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { name: "Daniel Amoah", role: "Lead Core Contributor" },
              { name: "Prof. Forson", role: "Academic & Science Advisor" },
              { name: "Prof. Amponsah", role: "Geophysical Inversion Director" },
            ].map((collab, i) => (
              <motion.div
                key={collab.name}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className="p-6 rounded-xl border transition-colors duration-200 text-center flex flex-col justify-between min-h-[160px]"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  borderColor: "var(--border-subtle)",
                }}
              >
                <div>
                  <div className="h-12 w-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4 text-[#e8613a] font-bold text-base">
                    {collab.name[0]}
                  </div>
                  <h3 className="font-bold text-base mb-1" style={{ color: "var(--text-primary)" }}>
                    {collab.name}
                  </h3>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {collab.role}
                </p>
              </motion.div>
            ))}

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="p-6 rounded-xl border transition-colors duration-200 flex flex-col items-center justify-center text-center min-h-[160px] sm:col-start-2"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>
                Curated By
              </div>
              <CuratedPill devHref={null} />
            </motion.div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
