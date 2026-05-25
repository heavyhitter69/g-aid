"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Download, ChevronUp, ArrowRight } from "lucide-react";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import Link from "next/link";

// ─── OS Icon Components ───────────────────────────────────────────────────────

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.14-2.2 1.28-2.18 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.35 2.77M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function WindowsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 shrink-0">
      <path d="M3 12V6.75l6-1.32v6.57H3zm17 0V4.5l-9 1.59V12h9zM3 13h6v6.57l-6-1.32V13zm17 0h-9v6.91l9 1.59V13z" />
    </svg>
  );
}

function LinuxIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 17" fill="currentColor" className="w-4 h-4 shrink-0">
      <path d="M13.849 15.25c-0.509 0.26-1.188 0.832-1.438 1.072-0.188 0.179-0.964 0.269-1.402 0.045-0.509-0.26-0.241-0.671-1.027-0.696-0.393-0.010-0.777-0.010-1.161-0.010-0.339 0.010-0.678 0.027-1.027 0.035-1.178 0.027-1.294 0.787-2.054 0.76-0.518-0.018-1.169-0.429-2.295-0.66-0.786-0.162-1.544-0.205-1.706-0.554-0.16-0.349 0.197-0.741 0.223-1.080 0.027-0.456-0.339-1.072-0.071-1.305 0.232-0.205 0.723-0.054 1.044-0.231 0.339-0.196 0.482-0.349 0.482-0.768 0.125 0.427-0.009 0.775-0.286 0.945-0.17 0.107-0.482 0.161-0.742 0.135-0.205-0.019-0.33 0.008-0.384 0.089-0.080 0.098-0.054 0.277 0.045 0.509 0.098 0.232 0.214 0.384 0.196 0.669-0.009 0.286-0.33 0.626-0.276 0.867 0.018 0.090 0.107 0.17 0.33 0.232 0.357 0.098 1.009 0.196 1.643 0.349 0.706 0.178 1.438 0.499 1.894 0.437 1.357-0.188 0.58-1.643 0.366-1.99-1.152-1.805-1.911-2.983-2.518-2.519-0.152 0.125-0.161-0.304-0.152-0.474 0.027-0.59 0.322-0.803 0.5-1.259 0.339-0.867 0.598-1.857 1.116-2.366 0.387-0.501 0.994-1.313 1.111-1.741-0.099-0.929-0.126-1.911-0.143-2.767-0.018-0.92 0.125-1.725 1.161-2.286 0.249-0.135 0.579-0.188 0.928-0.188 0.616-0.010 1.303 0.17 1.741 0.491 0.697 0.518 1.134 1.616 1.081 2.401-0.036 0.616 0.071 1.25 0.268 1.911 0.232 0.777 0.599 1.321 1.188 1.946 0.706 0.75 1.259 2.223 1.42 3.16 0.143 0.877-0.054 1.421-0.241 1.448-0.286 0.043-0.464 0.945-1.357 0.91-0.571-0.027-0.625-0.366-0.786-0.661-0.259-0.455-0.518-0.312-0.616 0.17-0.054 0.241-0.019 0.599 0.062 0.865 0.161 0.563 0.107 1.090 0.009 1.742-0.188 1.232 0.866 1.464 1.572 0.874 0.696-0.579 0.848-0.669 1.723-0.973 1.33-0.456 0.884-0.857 0.169-1.098-0.643-0.215-0.669-1.296-0.438-1.501 0.054 1.161 0.661 1.331 0.911 1.491 1.098 0.681-0.411 1.244-1.063 1.574zM12.349 10.938c0.241-0.805 0.134-1.125-0.026-1.885-0.125-0.571-0.652-1.349-1.063-1.589 0.107 0.089 0.304 0.348 0.509 0.74 0.357 0.671 0.714 1.661 0.482 2.483-0.089 0.32-0.303 0.365-0.446 0.374-0.625 0.072-0.259-0.75-0.518-1.865-0.295-1.251-0.598-1.34-0.669-1.438-0.368-1.624-0.769-1.463-0.886-2.070-0.098-0.545 0.474-0.991-0.303-1.143-0.241-0.045-0.58-0.286-0.714-0.304-0.134-0.017-0.206-0.902 0.294-0.929 0.491-0.036 0.581 0.554 0.491 0.787-0.142 0.231 0.009 0.321 0.251 0.24 0.196-0.062 0.071-0.58 0.116-0.651-0.125-0.75-0.438-0.857-0.759-0.92-1.233 0.098-0.679 1.456-0.804 1.331-0.179-0.188-0.696-0.018-0.696-0.135 0.009-0.696-0.224-1.098-0.545-1.107-0.357-0.009-0.5 0.491-0.518 0.776-0.027 0.268 0.152 0.832 0.286 0.787 0.089-0.027 0.241-0.206 0.080-0.196-0.080 0-0.205-0.197-0.223-0.429-0.009-0.233 0.081-0.465 0.384-0.456 0.348 0.009 0.348 0.705 0.312 0.732-0.115 0.080-0.259 0.233-0.277 0.259-0.115 0.188-0.338 0.24-0.428 0.322-0.152 0.16-0.187 0.339-0.071 0.401 0.41 0.232 0.276 0.499 0.848 0.519 0.375 0.018 0.651-0.054 0.911-0.134 0.196-0.062 0.831-0.196 0.964-0.429 0.062-0.098 0.134-0.098 0.178-0.071 0.089 0.044 0.107 0.214-0.116 0.268-0.312 0.090-0.625 0.26-0.91 0.367-0.277 0.115-0.366 0.16-0.625 0.204-0.589 0.107-1.026-0.214-0.634 0.17 0.134 0.125 0.259 0.205 0.598 0.197 0.75-0.027 1.581-0.93 1.661-0.528 0.017 0.089-0.233 0.196-0.429 0.295-0.696 0.339-1.187 1.018-1.634 0.785-0.402-0.214-0.803-1.206-0.795-0.758 0.009 0.687-0.902 1.294-0.482 2.080-0.277 0.070-0.893 1.384-0.982 2.062-0.054 0.393 0.036 0.875-0.063 1.143-0.134 0.393-0.741-0.375-0.544-1.312 0.035-0.16 0-0.197-0.045-0.115-0.241 0.437-0.107 1.053 0.089 1.481 0.081 0.188 0.286 0.268 0.438 0.429 0.312 0.356 1.544 1.268 1.759 1.491 0.277 0.259 0.197 0.865-0.375 0.928 0.295 0.554 0.58 0.608 0.572 1.509 0.339-0.178 0.206-0.571 0.062-0.82-0.099-0.18-0.223-0.26-0.197-0.304 0.018-0.027 0.197-0.18 0.295-0.062 0.303 0.339 0.875 0.401 1.482 0.321 0.616-0.072 1.277-0.286 1.58-0.777 0.143-0.232 0.241-0.312 0.304-0.268 0.071 0.035 0.099 0.196 0.089 0.464-0.009 0.286-0.125 0.581-0.205 0.822-0.081 0.277-0.107 0.464 0.161 0.474 0.071-0.501 0.214-0.992 0.25-1.492 0.045-0.571-0.366-1.624 0.081-2.152 0.116-0.143 0.258-0.16 0.455-0.16 0.026-0.715 1.125-0.66 1.491-0.366 0-0.162-0.348-0.313-0.491-0.376zM5.063 8.367c-0.063 0.115-0.223 0.204-0.099 0.223 0.045 0.009 0.17-0.1 0.224-0.223 0.044-0.152 0.089-0.233 0.018-0.26-0.081-0.026-0.063 0.134-0.143 0.26zM7.107 3.527c-0.107-0.027-0.089 0.133-0.035 0.116 0.036 0 0.081 0.054 0.062 0.134-0.018 0.107-0.009 0.18 0.072 0.18 0.009 0 0.026 0 0.026-0.027 0.037-0.225-0.071-0.385-0.125-0.403zM7.349 4.348c-0.089 0.009-0.072-0.197 0.214-0.179-0.179 0.018-0.116 0.179-0.214 0.179zM8.081 4.196c0.259-0.115 0.348 0.063 0.259 0.099-0.090 0.026-0.099-0.144-0.259-0.099zM9.161 3.473c-0.116 0.010-0.080 0.062-0.026 0.080 0.071 0.020 0.143 0.144 0.161 0.277 0 0.018 0.089-0.018 0.089-0.045 0.008-0.213-0.179-0.32-0.224-0.312zM9.679 1.545c-0.071-0.072-0.143-0.135-0.214-0.135-0.179 0.018-0.090 0.205-0.116 0.295-0.036 0.098-0.169 0.179-0.080 0.25 0.081 0.062 0.134-0.098 0.304-0.16 0.044-0.019 0.25 0.008 0.294-0.090 0.008-0.045-0.107-0.098-0.188-0.16zM10.67 5.49c-0.169-0.106-0.205-0.285-0.267-0.223-0.188 0.205 0.232 0.634 0.41 0.671 0.107 0.018 0.188-0.126 0.161-0.251-0.036-0.169-0.161-0.107-0.304-0.197z" />
    </svg>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DownloadEntry {
  label: string;
  href: string;
}

interface OsSection {
  os: "macOS" | "Windows" | "Linux";
  icon: React.ReactNode;
  entries: DownloadEntry[];
}

// ─── Data ────────────────────────────────────────────────────────────────────

const OS_SECTIONS: OsSection[] = [
  {
    os: "macOS",
    icon: <AppleIcon />,
    entries: [
      { label: "Mac (ARM64)", href: "#" },
      { label: "Mac (x64)", href: "#" },
      { label: "Mac Universal", href: "#" },
    ],
  },
  {
    os: "Windows",
    icon: <WindowsIcon />,
    entries: [
      { label: "Windows (x64) (System)", href: "#" },
      { label: "Windows (x64) (User)", href: "#" },
      { label: "Windows (ARM64) (System)", href: "#" },
      { label: "Windows (ARM64) (User)", href: "#" },
    ],
  },
  {
    os: "Linux",
    icon: <LinuxIcon />,
    entries: [
      { label: "Linux .deb (ARM64)", href: "#" },
      { label: "Linux .deb (x64)", href: "#" },
      { label: "Linux RPM (ARM64)", href: "#" },
      { label: "Linux RPM (x64)", href: "#" },
      { label: "Linux AppImage (ARM64)", href: "#" },
      { label: "Linux AppImage (x64)", href: "#" },
    ],
  },
];

// ─── OS Column ────────────────────────────────────────────────────────────────

function OsColumn({ section }: { section: OsSection }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 text-white font-semibold text-sm mb-4 pb-3 border-b border-white/10">
        {section.icon}
        <span>{section.os}</span>
      </div>
      <ul className="divide-y divide-white/5">
        {section.entries.map((entry) => (
          <li key={entry.label}>
            <a
              href={entry.href}
              className="flex items-center justify-between py-3 px-1 text-[13px] text-zinc-400 hover:text-white group transition-colors duration-150"
            >
              <span>{entry.label}</span>
              <Download className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-3" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DownloadPage() {
  return (
    <main className="relative min-h-screen bg-[#0a0a0a] text-white">
      <AnimatedBackground variant="grid" />
      <Navbar />

      <div className="relative z-10 max-w-5xl mx-auto px-6 pt-32 pb-20">
        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-10"
        >
          <div className="flex items-center gap-3 mb-4">
            <Image src="/g-aid logo.png" alt="G-AID" width={90} height={32} className="object-contain" priority />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Download</h1>
          <p className="text-zinc-500 text-sm">
            Available for macOS, Windows, and Linux. All builds are signed and notarized.
          </p>
        </motion.div>

        {/* Version block */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="border border-white/10 rounded-xl overflow-hidden bg-[#141414]"
        >
          {/* Version header — always open, no toggle needed for single version */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-3">
              <span className="text-white font-bold text-base">1.0</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full border border-white/20 text-zinc-400">
                Latest
              </span>
              <span className="text-zinc-600 text-xs font-mono">May 2026</span>
            </div>
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          </div>

          {/* OS columns */}
          <div className="px-6 pb-6 pt-4">
            <div className="flex gap-6">
              {OS_SECTIONS.map((section) => (
                <OsColumn key={section.os} section={section} />
              ))}
            </div>

            {/* Release notes link */}
            <div className="mt-6">
              <Link
                href="/release-notes"
                className="inline-flex items-center gap-1.5 text-sm text-[#e8613a] hover:text-[#f07858] transition-colors"
              >
                View release notes
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </motion.div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-10 text-zinc-600 text-xs"
        >
          By downloading G-AID you agree to the{" "}
          <a href="#" className="text-zinc-500 hover:text-white underline underline-offset-2 transition-colors">
            License Agreement
          </a>
          . Need help?{" "}
          <a href="#" className="text-zinc-500 hover:text-white underline underline-offset-2 transition-colors">
            View the docs
          </a>
          .
        </motion.p>
      </div>
        <Footer />
      </main>
    );
}
