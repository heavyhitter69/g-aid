"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChangeSection {
  heading: string;
  body: React.ReactNode;
}

interface ReleaseNote {
  version: string;
  label?: string;
  date: string;
  title: string;
  intro: React.ReactNode;
  sections: ChangeSection[];
}

// ─── Release data ─────────────────────────────────────────────────────────────

const RELEASES: ReleaseNote[] = [
  {
    version: "1.0",
    label: "Latest",
    date: "May 25, 2026",
    title: "G-AID 1.0 — General Availability",
    intro: (
      <>
        <p>
          This release marks the general availability of{" "}
          <span className="text-white font-medium">G-AID 1.0</span>, the first
          production-ready build of the Geophysical Agent Iteration Domain
          platform. It ships with a fully integrated{" "}
          <Link href="#ai-panel" className="text-[#7c9fc2] underline underline-offset-2 hover:text-[#a8c4de] transition-colors">
            AI Agent Panel
          </Link>{" "}
          and introduces support for seven geophysical disciplines including the
          newly added{" "}
          <span className="text-white font-medium">Geomatics</span> module.
        </p>
        <p className="mt-3">
          All discipline agents have been recalibrated with updated interpretation
          priors. Workflow pipelines now support real-time inversion monitoring
          with streaming QC metrics.
        </p>
      </>
    ),
    sections: [
      {
        heading: "AI Agent Panel",
        body: (
          <>
            <p>
              The Agent Panel is now available as a persistent side panel in the
              workspace, accessible via{" "}
              <kbd className="bg-white/10 border border-white/20 rounded px-1.5 py-0.5 text-[11px] font-mono">
                Ctrl+Shift+L
              </kbd>
              . Each discipline now boots its own pre-loaded agent with domain-specific
              priors, reducing cold-start interpretation latency by up to 60%.
            </p>
            <p className="mt-3">
              Multi-turn conversation history is persisted per project session and
              can be exported as a structured interpretation log.
            </p>
          </>
        ),
      },
      {
        heading: "Geomatics Discipline",
        body: (
          <>
            <p>
              G-AID now supports{" "}
              <span className="text-white font-medium">Geomatics</span> as a
              first-class discipline. The Geomatics agent specializes in spatial
              data acquisition, geodesy, and precision surveying workflows
              including LiDAR point cloud processing, GNSS baseline adjustment,
              and photogrammetry-based DEM generation.
            </p>
          </>
        ),
      },
      {
        heading: "Workflow Engine Improvements",
        body: (
          <ul className="list-disc list-inside space-y-2 text-zinc-400">
            <li>Pipeline nodes now support conditional branching on QC thresholds</li>
            <li>Inversion jobs can be paused, forked, and resumed without data loss</li>
            <li>Added support for joint multi-physics inversion across ERT and gravity datasets</li>
            <li>Workflow templates are now shareable via signed project URLs</li>
          </ul>
        ),
      },
      {
        heading: "Visualization Updates",
        body: (
          <ul className="list-disc list-inside space-y-2 text-zinc-400">
            <li>3D subsurface renderer now supports point-cloud and voxel dual display</li>
            <li>Cross-section builder exports to SVG and GeoTIFF</li>
            <li>Colour ramp editor with perceptually uniform palettes (Viridis, Turbo, Seismic)</li>
            <li>Anomaly overlays now support uncertainty-weighted opacity</li>
          </ul>
        ),
      },
      {
        heading: "Bug Fixes",
        body: (
          <ul className="list-disc list-inside space-y-2 text-zinc-400">
            <li>Fixed ERT profile loading crash on files larger than 500 MB</li>
            <li>Resolved session persistence bug causing discipline preference reset on refresh</li>
            <li>Corrected colour-bar alignment in split-view cross-section layout</li>
            <li>Fixed Seismology agent returning incorrect hypocenter depths for shallow events</li>
          </ul>
        ),
      },
    ],
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReleaseBlock({ note, index }: { note: ReleaseNote; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.45 }}
      className="flex gap-12"
    >
      {/* Left sidebar — version + date */}
      <div className="hidden md:flex flex-col items-end shrink-0 w-36 pt-1 gap-2">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-sm">{note.version}</span>
          {note.label && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-white/20 text-zinc-500">
              {note.label}
            </span>
          )}
        </div>
        <span className="text-zinc-600 text-xs font-mono text-right">{note.date}</span>
      </div>

      {/* Vertical rule */}
      <div className="hidden md:block w-px bg-white/10 shrink-0 mt-1" />

      {/* Main content */}
      <div className="flex-1 min-w-0 pb-16 border-b border-white/5 last:border-0">
        {/* Mobile version label */}
        <div className="flex items-center gap-2 mb-2 md:hidden">
          <span className="text-white font-bold text-sm">{note.version}</span>
          {note.label && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-white/20 text-zinc-500">
              {note.label}
            </span>
          )}
          <span className="text-zinc-600 text-xs font-mono">{note.date}</span>
        </div>

        <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">Changelog</p>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 leading-tight">
          {note.title}
        </h2>

        <div className="text-zinc-400 text-[14px] leading-relaxed mb-8">
          {note.intro}
        </div>

        {/* Change sections */}
        <div className="space-y-8">
          {note.sections.map((section) => (
            <div key={section.heading}>
              <h3 className="text-white font-bold text-base mb-3">{section.heading}</h3>
              <div className="text-zinc-400 text-[14px] leading-relaxed">
                {section.body}
              </div>
            </div>
          ))}
        </div>

        {/* Download link */}
        <div className="mt-10">
          <Link
            href="/download"
            className="inline-flex items-center gap-1.5 text-sm text-[#e8613a] hover:text-[#f07858] transition-colors"
          >
            Download v{note.version}
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </motion.article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReleaseNotesPage() {
  return (
    <main className="relative min-h-screen bg-[#0a0a0a] text-white">
      <AnimatedBackground variant="grid" />
      <Navbar />

      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-32 pb-24">
        {/* Back link */}
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-12"
        >
          <Link
            href="/download"
            className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Downloads
          </Link>
        </motion.div>

        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-16"
        >
          <h1 className="text-4xl font-bold text-white mb-3">Release Notes</h1>
          <p className="text-zinc-500 text-sm">
            A history of changes, improvements, and fixes shipped with each G-AID release.
          </p>
        </motion.div>

        {/* Release blocks */}
        <div className="flex flex-col gap-0">
          {RELEASES.map((note, i) => (
            <ReleaseBlock key={note.version} note={note} index={i} />
          ))}
        </div>
      </div>
      <Footer />
    </main>
  );
}
