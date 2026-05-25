"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { 
  BookOpen, 
  Terminal, 
  Cpu, 
  Layers, 
  HelpCircle, 
  ChevronRight,
  Code,
  ArrowLeft
} from "lucide-react";
import Link from "next/link";

// ─── Data ─────────────────────────────────────────────────────────────────────

const DOCS_SECTIONS = [
  {
    id: "getting-started",
    category: "Getting Started",
    items: [
      {
        id: "quick-start",
        title: "Quick Start Guide",
        desc: "Learn how to boot up G-AID, import subsurface datasets, and initiate agentic interpretation models in under five minutes.",
        content: (
          <div className="space-y-4 text-sm leading-relaxed">
            <p>
              Welcome to the **Geophysical Agent Iteration Domain (G-AID)**! To begin your first interpretation, you can either launch our cloud-based **Demo Workspace** directly or install G-AID onto your local environment.
            </p>
            <h4 className="font-bold text-white mt-4">1. Accessing the Workspace</h4>
            <p>
              Click **Launch Demo Workspace** in the top navigation or main landing hero to access our state-of-the-art interactive workspace instantly. You will be authenticated as a guest and equipped with explore-level simulation resources.
            </p>
            <h4 className="font-bold text-white mt-4">2. Loading Datasets</h4>
            <p>
              Open the file manager in the left workspace sidebar to import ERT profiles, seismic volumes, or point cloud baseline adjustments. G-AID natively parses standard formats including SegY, GeoTIFF, and XYZ text logs.
            </p>
          </div>
        ),
      },
      {
        id: "architecture",
        title: "System Architecture",
        desc: "An overview of G-AID's double-bounded physical verification framework and dynamic multi-agent system structure.",
        content: (
          <div className="space-y-4 text-sm leading-relaxed">
            <p>
              G-AID implements a **double-bounded physical verification model** to assist human interpreters. Our system comprises three main layers:
            </p>
            <ul className="list-disc list-inside space-y-2 text-[var(--text-secondary)] pl-2">
              <li><strong className="text-white">Scientific Agent Layer:</strong> Domain-specific LLM orchestrators initialized with geophysics-focused priors.</li>
              <li><strong className="text-white">Computation Layer:</strong> Advanced voxel and grid inversion pipelines bound tightly to standard mechanical priors.</li>
              <li><strong className="text-white">Visualization Layer:</strong> High-performance WebGL-based subsurface and cross-section mapping panels.</li>
            </ul>
          </div>
        ),
      },
    ],
  },
  {
    id: "core-features",
    category: "Core Features",
    items: [
      {
        id: "agentic-orchestration",
        title: "Agentic Orchestration",
        desc: "Using seven specialized AI agents calibrated with domain-specific priors for collaborative scientific interpretations.",
        content: (
          <div className="space-y-4 text-sm leading-relaxed">
            <p>
              G-AID features seven pre-loaded, specialized geophysics agents (Seismology, Magnetics, ERT, Geodesy, Geomatics, etc.). 
            </p>
            <p>
              Each agent works independently or collaboratively to resolve ambiguities. For example, joint inversions automatically orchestrate ERT and gravity agents to match shared density boundaries.
            </p>
          </div>
        ),
      },
      {
        id: "3d-visualization",
        title: "3D Subsurface Visualization",
        desc: "Harnessing 3D voxel dual renders, point-cloud displays, and interactive cross-section builders for deep analysis.",
        content: (
          <div className="space-y-4 text-sm leading-relaxed">
            <p>
              Render large-scale geological volumes smoothly using our dynamic canvas panel. You can easily toggle point-cloud densities, configure perceptually uniform palettes (Turbo, Seismic, Viridis), or slice deep profiles in real-time.
            </p>
          </div>
        ),
      },
    ],
  },
  {
    id: "troubleshooting",
    category: "Troubleshooting",
    items: [
      {
        id: "faq",
        title: "Frequently Asked Questions",
        desc: "Quick answers to common questions about G-AID usage bounds, data ownership, and desktop installation pipelines.",
        content: (
          <div className="space-y-4 text-sm leading-relaxed">
            <h4 className="font-bold text-white">Is my data secure?</h4>
            <p>
              Yes. All imported datasets are encrypted using state-of-the-art TLS 1.3 and stored within SOC 2 compliant physical boundaries. G-AID operates under zero-knowledge storage protocols.
            </p>
            <h4 className="font-bold text-white mt-4">Why does my agent interpretation timeout?</h4>
            <p>
              High-resolution 3D joint-inversion models can take up to several minutes to process. Check the activity status log in the workspace bottom bar to track computation queues.
            </p>
          </div>
        ),
      },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [activeSectionId, setActiveSectionId] = useState("quick-start");

  // Flat array of all items for simple search or lookup
  const currentItem = DOCS_SECTIONS.flatMap(s => s.items).find(item => item.id === activeSectionId) 
    || DOCS_SECTIONS[0].items[0];

  return (
    <main
      className="relative min-h-screen transition-colors duration-200"
      style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}
    >
      <AnimatedBackground variant="grid" />
      <Navbar />

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-24">
        {/* Header */}
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
            G-AID Knowledge Center
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
            Explore guides, technical specifications, and system manuals to optimize your agentic geophysics workflows.
          </p>
        </motion.div>

        <div className="flex flex-col lg:flex-row gap-12">
          {/* Sidebar navigation */}
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
                              fontWeight: isActive ? "600" : "400"
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

          {/* Core content block */}
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
              <h2
                className="text-2xl font-bold mb-3"
                style={{ color: "var(--text-primary)" }}
              >
                {currentItem.title}
              </h2>
              <p
                className="text-sm border-b pb-6 mb-6 font-medium italic"
                style={{ color: "var(--text-secondary)", borderColor: "var(--border-subtle)" }}
              >
                {currentItem.desc}
              </p>

              <div className="prose prose-invert max-w-none text-[14px]">
                {currentItem.content}
              </div>

              {/* Callout box */}
              <div
                className="mt-12 rounded-lg border p-4 bg-white/5 border-white/10 flex items-start gap-3"
              >
                <Terminal className="h-5 w-5 text-[#e8613a] shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white mb-1 uppercase tracking-wider font-mono">
                    Need Developer Support?
                  </h4>
                  <p className="text-xs text-[var(--text-muted)]">
                    Explore API bounds, developer environments, or joint-inversion pipelines in our developer forum or raise an issue.
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
