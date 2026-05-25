"use client";

import { motion } from "framer-motion";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { CuratedPill } from "@/components/landing/curated-pill";
import { 
  Compass, 
  Cpu, 
  Globe, 
  Layers, 
  ShieldAlert, 
  Zap, 
  ArrowUpRight 
} from "lucide-react";
import Link from "next/link";

// ─── Data ─────────────────────────────────────────────────────────────────────

const STATS = [
  { value: "7+", label: "Geophysical Disciplines" },
  { value: "60%", label: "Latency Reduction" },
  { value: "100%", label: "Physics-Calibrated" },
  { value: "24/7", label: "Agentic Orchestration" },
];

const PRINCIPLES = [
  {
    icon: Cpu,
    title: "Multi-Agent Orchestration",
    desc: "Every domain boots its own agent pre-loaded with specialized priors. Multiple agents work collaboratively to cross-validate interpretations.",
  },
  {
    icon: Layers,
    title: "Layered Visualization",
    desc: "3D subsurface renders, ERT inversion grids, and voxel point clouds dynamically layered together for unparalleled structural context.",
  },
  {
    icon: Globe,
    title: "Scientific Fidelity",
    desc: "All interpretations are strictly bound to thermodynamic, gravitational, and electromagnetic physical models for absolute reliability.",
  },
  {
    icon: Zap,
    title: "Autonomous Workflows",
    desc: "From raw data ingestion to inversion, agents automate repetitive QA/QC checks, allowing geophysicists to focus on the big picture.",
  },
];

const TIMELINE = [
  {
    year: "2024",
    title: "Conception",
    desc: "G-AID was founded with a singular focus: to bring agentic LLM architectures to highly specialized geophysical datasets.",
  },
  {
    year: "2025",
    title: "Alpha Release",
    desc: "Initial deployment of three core agents (Seismology, Magnetics, and ERT) showing 40% efficiency gains in pipeline configuration.",
  },
  {
    year: "2026",
    title: "General Availability (1.0)",
    desc: "Expansion to seven major disciplines, launching a fully modular desktop interface and general availability cloud framework.",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <main
      className="relative min-h-screen transition-colors duration-200 overflow-hidden"
      style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}
    >
      <AnimatedBackground variant="grid" />
      <Navbar />

      {/* Hero Section */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-16">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-mono text-[var(--text-secondary)] mb-6"
          >
            GEOPHYSICAL AGENT ITERATION DOMAIN
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6"
            style={{ color: "var(--text-primary)" }}
          >
            Empowering Earth Science with Intelligent Agents
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="text-lg leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            G-AID bridges specialized geophysical interpretation with cutting-edge multi-agent systems. We build robust tools that allow scientists to visualize, simulate, and automate complex subsurface exploration.
          </motion.p>
        </div>

        {/* Stats Grid */}
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

        {/* Divider */}
        <hr className="border-t mb-24" style={{ borderColor: "var(--border-subtle)" }} />

        {/* Core Principles */}
        <div className="mb-24">
          <div className="max-w-2xl mb-16">
            <h2 className="text-3xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              The Pillars of G-AID
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Our platform architecture is built around ensuring maximum precision, collaborative modeling, and modern visualization systems.
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

        {/* Story / Timeline */}
        <div className="mb-24">
          <div className="grid lg:grid-cols-3 gap-12">
            <div className="lg:col-span-1">
              <h2 className="text-3xl font-bold mb-4 animate-pulse" style={{ color: "var(--text-primary)" }}>
                Our Journey
              </h2>
              <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-secondary)" }}>
                From a bold prototype in a geophysics lab to a comprehensive multi-agent workspace used worldwide, we have consistently pushed computational boundaries.
              </p>
              <Link
                href="/download"
                className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#e8613a] hover:underline"
              >
                Get Started Today
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

        {/* Divider */}
        <hr className="border-t mb-24" style={{ borderColor: "var(--border-subtle)" }} />

        {/* Key Collaborators */}
        <div className="mb-24">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              Key Collaborators
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              G-AID is built and curated in close academic and technical collaboration with esteemed research leaders.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { name: "Daniel Amoah", role: "Lead Core Contributor" },
              { name: "Prof. Forson", role: "Academic & Science Advisor" },
              { name: "Prof. Amponsah", role: "Geophysical Inversion Director" }
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

            {/* Dev Pill Card */}
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
              <CuratedPill devHref="#" />
            </motion.div>
          </div>
        </div>

      </section>

      <Footer />
    </main>
  );
}
