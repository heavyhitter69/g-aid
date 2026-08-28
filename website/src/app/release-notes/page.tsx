"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { ArrowLeft, ArrowUpRight } from "lucide-react";

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

const RELEASES: ReleaseNote[] = [
  {
    version: "Shipment 13",
    label: "Current",
    date: "August 2026",
    title: "Shipment 13 — desktop capability packs",
    intro: (
      <>
        <p>
          Shipment 13 is the current G-AID desktop foundation: a local catalog and
          processing DAG plus the packs listed below. It is <span className="text-white font-medium">not</span> a
          public general-availability installer, a cloud workspace, or a seven-agent hosted platform.
        </p>
        <p className="mt-3">
          There is no GitHub Release for this shipment. When a public installer exists, the{" "}
          <Link href="/download" className="text-[#7c9fc2] underline underline-offset-2 hover:text-[#a8c4de]">
            download page
          </Link>{" "}
          will list it.
        </p>
      </>
    ),
    sections: [
      {
        heading: "In scope",
        body: (
          <ul className="list-disc list-inside space-y-2 text-zinc-400">
            <li>Local survey catalog and processing DAG on disk</li>
            <li>Magnetics pack</li>
            <li>Gravity near-zone and zoned planar corrections (Complete Bouguer is not auto-granted)</li>
            <li>ERT ingest and pseudosection; invert2d is experimental</li>
            <li>Radiometrics 1.0, GPR 1.0, LAS 2.0, GEOCHEM 1.0</li>
            <li>GeoJSON CRS84 and shapefile ingest with topology-aware polygon holes</li>
            <li>2D grid, vector, log, radargram, and section views</li>
            <li>Optional local Ollama assistant in the Electron app</li>
          </ul>
        ),
      },
      {
        heading: "Stated limitations",
        body: (
          <ul className="list-disc list-inside space-y-2 text-zinc-400">
            <li>No public Mac/Windows/Linux installer on this site until a GitHub Release exists</li>
            <li>No cloud workspaces, billed accounts, or hosted inference</li>
            <li>No native production SEG-Y interpretation suite</li>
            <li>No 3D voxel / WebGL volume renderer</li>
            <li>No seismology hypocenter or continuous-waveform pipeline</li>
            <li>No LiDAR, GNSS adjustment, or photogrammetry DEM product</li>
          </ul>
        ),
      },
    ],
  },
];

function ReleaseBlock({ note, index }: { note: ReleaseNote; index: number }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.45 }}
      className="flex gap-12"
    >
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

      <div className="hidden md:block w-px bg-white/10 shrink-0 mt-1" />

      <div className="flex-1 min-w-0 pb-16 border-b border-white/5 last:border-0">
        <div className="flex items-center gap-2 mb-2 md:hidden">
          <span className="text-white font-bold text-sm">{note.version}</span>
          {note.label && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-white/20 text-zinc-500">
              {note.label}
            </span>
          )}
          <span className="text-zinc-600 text-xs font-mono">{note.date}</span>
        </div>

        <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest mb-2">Capability notes</p>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-6 leading-tight">
          {note.title}
        </h2>

        <div className="text-zinc-400 text-[14px] leading-relaxed mb-8">{note.intro}</div>

        <div className="space-y-8">
          {note.sections.map((section) => (
            <div key={section.heading}>
              <h3 className="text-white font-bold text-base mb-3">{section.heading}</h3>
              <div className="text-zinc-400 text-[14px] leading-relaxed">{section.body}</div>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <Link
            href="/download"
            className="inline-flex items-center gap-1.5 text-sm text-[#e8613a] hover:text-[#f07858] transition-colors"
          >
            Desktop app status
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </motion.article>
  );
}

export default function ReleaseNotesPage() {
  return (
    <main className="relative min-h-screen bg-[#0a0a0a] text-white">
      <AnimatedBackground variant="grid" />
      <Navbar />

      <div className="relative z-10 max-w-4xl mx-auto px-6 pt-32 pb-24">
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

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-16"
        >
          <h1 className="text-4xl font-bold text-white mb-3">Release Notes</h1>
          <p className="text-zinc-500 text-sm">
            Honest capability notes for the desktop workspace. This is not a fictional 1.0 changelog.
          </p>
        </motion.div>

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
