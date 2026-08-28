"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { BookOpen, Terminal } from "lucide-react";
import Link from "next/link";

const DOCS_SECTIONS = [
  {
    id: "getting-started",
    category: "Getting Started",
    items: [
      {
        id: "quick-start",
        title: "Quick Start Guide",
        desc: "How G-AID actually runs today: a local Electron desktop workspace, not a cloud demo.",
        content: (
          <div className="space-y-4 text-sm leading-relaxed">
            <p>
              G-AID is a desktop application (Electron + Next.js + Python). Public
              installers are not published yet. When they exist, they will appear on the{" "}
              <Link href="/download" className="text-white underline underline-offset-2">
                download page
              </Link>{" "}
              from a GitHub Release.
            </p>
            <h4 className="font-bold text-white mt-4">1. Local workspace</h4>
            <p>
              Open a survey folder on disk. The catalog indexes supported files.
              This website does not provide a guest cloud workspace or a public browser demo.
            </p>
            <h4 className="font-bold text-white mt-4">2. Supported files (Shipment 13)</h4>
            <p>
              Magnetics products, gravity grids (near-zone / zoned planar), ERT ingest and
              pseudosections, radiometrics 1.0, GPR 1.0, LAS 2.0, GEOCHEM 1.0, GeoJSON CRS84,
              and shapefiles (topology-aware holes). Native SEG-Y volumes and GeoTIFF-as-a-product
              are not claimed here.
            </p>
          </div>
        ),
      },
      {
        id: "architecture",
        title: "System Architecture",
        desc: "What actually runs: local catalog, processing DAG, Python engine, optional Ollama.",
        content: (
          <div className="space-y-4 text-sm leading-relaxed">
            <p>G-AID is a local stack, not a hosted multi-agent cloud:</p>
            <ul className="list-disc list-inside space-y-2 text-[var(--text-secondary)] pl-2">
              <li>
                <strong className="text-white">Desktop shell:</strong> Electron loads the Next.js UI and talks to a local Python engine.
              </li>
              <li>
                <strong className="text-white">Catalog and DAG:</strong> Files on disk are classified and processed by registered pack nodes.
              </li>
              <li>
                <strong className="text-white">Maps:</strong> 2D grids, vectors, logs, radargrams, and sections. Not a 3D WebGL voxel engine.
              </li>
              <li>
                <strong className="text-white">Optional assistant:</strong> Local Ollama on the desktop machine. There is no hosted inference product.
              </li>
            </ul>
          </div>
        ),
      },
    ],
  },
  {
    id: "core-features",
    category: "Capability packs",
    items: [
      {
        id: "agentic-orchestration",
        title: "Processing packs",
        desc: "Shipment 13 packs and their limits — not seven complete cloud agents.",
        content: (
          <div className="space-y-4 text-sm leading-relaxed">
            <p>
              In scope: magnetics; gravity near-zone and zoned planar (Complete Bouguer is not
              auto-granted); ERT ingest/pseudosection with experimental invert2d; radiometrics 1.0;
              GPR 1.0; LAS 2.0; GEOCHEM 1.0; GeoJSON CRS84; shapefiles.
            </p>
            <p>
              Out of scope: production SEG-Y interpretation, seismology hypocenter location,
              LiDAR classification, billed cloud workspaces, and hosted model APIs.
            </p>
          </div>
        ),
      },
      {
        id: "3d-visualization",
        title: "Visualization",
        desc: "2D maps and sections in the desktop workspace.",
        content: (
          <div className="space-y-4 text-sm leading-relaxed">
            <p>
              The live UI shows grid maps, vector overlays, ERT pseudosections, GPR radargrams,
              LAS tracks, and geochem plots. Colour ramps exist for those 2D views. A production
              3D voxel / point-cloud dual renderer is not shipped.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: "troubleshooting",
    category: "Limits",
    items: [
      {
        id: "faq",
        title: "Frequently Asked Questions",
        desc: "Data location, accounts, and what this site will not promise.",
        content: (
          <div className="space-y-4 text-sm leading-relaxed">
            <h4 className="font-bold text-white">Where does my data go?</h4>
            <p>
              Survey files stay in the folder you open on disk. This site does not operate a
              certified cloud object store for customer surveys.
            </p>
            <h4 className="font-bold text-white mt-4">Can I download an installer?</h4>
            <p>
              Only if a GitHub Release with installer assets exists. Until then the download page
              shows that installers are unavailable.
            </p>
            <h4 className="font-bold text-white mt-4">Is there a browser demo?</h4>
            <p>
              No. The desktop workspace route is for the Electron app, not a public guest demo.
            </p>
          </div>
        ),
      },
    ],
  },
];

export default function DocsPage() {
  const [activeSectionId, setActiveSectionId] = useState("quick-start");
  const currentItem =
    DOCS_SECTIONS.flatMap((s) => s.items).find((item) => item.id === activeSectionId) ||
    DOCS_SECTIONS[0].items[0];

  return (
    <main
      className="relative min-h-screen transition-colors duration-200"
      style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}
    >
      <AnimatedBackground variant="grid" />
      <Navbar />

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-12 border-b pb-8"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="h-5 w-5 text-[#e8613a]" />
            <span className="text-xs font-mono uppercase tracking-widest text-[#e8613a]">
              Documentation
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold" style={{ color: "var(--text-primary)" }}>
            G-AID documentation
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
            Honest notes for the Shipment 13 desktop workspace.
          </p>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-12">
          <motion.aside
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="w-full lg:w-64 shrink-0"
          >
            <div className="sticky top-28 space-y-6">
              {DOCS_SECTIONS.map((section) => (
                <div key={section.id}>
                  <h3
                    className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {section.category}
                  </h3>
                  <ul className="space-y-1.5">
                    {section.items.map((item) => {
                      const isActive = activeSectionId === item.id;
                      return (
                        <li key={item.id}>
                          <button
                            onClick={() => setActiveSectionId(item.id)}
                            className="text-[13px] block w-full text-left transition-colors duration-150 py-1"
                            style={{
                              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                              fontWeight: isActive ? "600" : "400",
                            }}
                          >
                            {item.title}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </motion.aside>

          <motion.article
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="flex-1 min-w-0"
          >
            <div
              className="rounded-xl border p-8 md:p-10 transition-colors duration-200"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-subtle)",
              }}
            >
              <h2 className="text-2xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>
                {currentItem.title}
              </h2>
              <p
                className="text-sm border-b pb-6 mb-6 font-medium italic"
                style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)" }}
              >
                {currentItem.desc}
              </p>

              <div className="prose prose-invert max-w-none text-[14px]">{currentItem.content}</div>

              <div className="mt-12 rounded-lg border p-4 bg-white/5 border-white/10 flex items-start gap-3">
                <Terminal className="h-5 w-5 text-[#e8613a] shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white mb-1 uppercase tracking-wider font-mono">
                    Source
                  </h4>
                  <p className="text-xs text-[var(--text-muted)]">
                    Development happens in the public repository. Internal verify routes are for
                    desktop QA, not public documentation.
                  </p>
                </div>
              </div>
            </div>
          </motion.article>
        </div>
      </div>

      <Footer />
    </main>
  );
}
