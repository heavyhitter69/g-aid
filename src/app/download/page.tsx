"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Download, ChevronUp, ArrowRight, Check, Clock, Shield } from "lucide-react";
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
      <path d="M13.849 15.25c-0.509 0.26-1.188 0.832-1.438 1.072-0.188 0.179-0.964 0.269-1.402 0.045-0.509-0.26-0.241-0.671-1.027-0.696-0.393-0.010-0.777-0.010-1.161-0.010-0.339 0.010-0.678 0.027-1.027 0.035-1.178 0.027-1.294 0.787-2.054 0.76-0.518-0.018-1.169-0.429-2.295-0.66-0.786-0.162-1.544-0.205-1.706-0.554-0.16-0.349 0.197-0.741 0.223-1.080 0.027-0.456-0.339-1.072-0.071-1.305 0.232-0.205 0.723-0.054 1.044-0.231 0.339-0.196 0.482-0.349 0.482-0.768 0.125 0.427-0.009 0.775-0.286 0.945-0.17 0.107-0.482 0.161-0.742 0.135-0.205-0.019-0.33 0.008-0.384 0.089-0.080 0.098-0.054 0.277 0.045 0.509 0.098 0.232 0.214 0.384 0.196 0.669-0.009 0.286-0.33 0.626-0.276 0.867 0.018 0.090 0.107 0.17 0.33 0.232 0.357 0.098 1.009 0.196 1.643 0.349 0.706 0.178 1.438 0.499 1.894 0.437 1.357-0.188 0.58-1.643 0.366-1.99-1.152-1.805-1.911-2.983-2.518-2.519-0.152 0.125-0.161-0.304-0.152-0.474 0.027-0.59 0.322-0.803 0.5-1.259 0.339-0.867 0.598-1.857 1.116-2.366 0.387-0.501 0.994-1.313 1.111-1.741-0.099-0.929-0.126-1.911-0.143-2.767-0.018-0.92 0.125-1.725 1.161-2.286 0.249-0.135 0.579-0.188 0.928-0.188 0.616-0.010 1.303 0.17 1.741 0.491 0.697 0.518 1.134 1.616 1.081 2.401-0.036 0.616 0.071 1.25 0.268 1.911 0.232 0.777 0.599 1.321 1.188 1.946 0.706 0.75 1.259 2.223 1.42 3.16 0.143 0.877-0.054 1.421-0.241 1.448-0.286 0.043-0.464 0.945-1.357 0.91-0.571-0.027-0.625-0.366-0.786-0.661-0.259-0.455-0.518-0.312-0.616 0.17-0.054 0.241-0.019 0.599 0.062 0.865 0.161 0.563 0.107 1.090 0.009 1.742-0.188 1.232 0.866 1.464 1.572 0.874 0.696-0.579 0.848-0.669 1.723-0.973 1.33-0.456 0.884-0.857 0.169-1.098-0.643-0.215-0.669-1.296-0.438-1.501 0.054 1.161 0.661 1.331 0.911 1.491 1.098 0.681-0.411 1.244-1.063 1.574z" />
    </svg>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface DownloadEntry {
  label: string;
  href: string;
  available: boolean;
  fileSize?: string;
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
      { label: "Mac (Universal) — Setup", href: "/api/download?platform=mac", available: true },
    ],
  },
  {
    os: "Windows",
    icon: <WindowsIcon />,
    entries: [
      { label: "Windows (x64) — Setup", href: "/api/download?platform=win", available: true },
    ],
  },
  {
    os: "Linux",
    icon: <LinuxIcon />,
    entries: [
      { label: "Linux AppImage", href: "/api/download?platform=linux", available: true },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// ─── OS Column ────────────────────────────────────────────────────────────────

function OsColumn({ section, winSize }: { section: OsSection; winSize: string | null }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 text-white font-semibold text-sm mb-4 pb-3 border-b border-white/10">
        {section.icon}
        <span>{section.os}</span>
      </div>
      <ul className="divide-y divide-white/5">
        {section.entries.map((entry) => (
          <li key={entry.label}>
            {entry.available ? (
              <a
                href={entry.href}
                className="flex items-center justify-between py-3 px-1 text-[13px] text-zinc-400 hover:text-white group transition-colors duration-150"
              >
                <div className="flex items-center gap-2">
                  <span>{entry.label}</span>
                  {section.os === "Windows" && winSize && (
                    <span className="text-[11px] text-zinc-600 font-mono">({winSize})</span>
                  )}
                </div>
                <Download className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-3" />
              </a>
            ) : (
              <div className="flex items-center justify-between py-3 px-1 text-[13px] text-zinc-600 cursor-default">
                <div className="flex items-center gap-2">
                  <span>{entry.label}</span>
                </div>
                <span className="flex items-center gap-1 text-[11px] text-zinc-700 font-mono">
                  <Clock className="w-3 h-3" />
                  Soon
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DownloadPage() {
  const [winSize, setWinSize] = useState<string | null>(null);

  useEffect(() => {
    // Check if the Windows installer is available and get its size
    fetch("/api/download?platform=win&arch=x64", { method: "HEAD" })
      .then((res) => {
        if (res.ok) {
          const contentLength = res.headers.get("content-length");
          if (contentLength) {
            setWinSize(formatBytes(parseInt(contentLength, 10)));
          }
        }
      })
      .catch(() => {
        // Installer not available yet, that's fine
      });
  }, []);

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

        {/* Installer features */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="flex flex-wrap gap-6 mb-8"
        >
          {([] as { text: string; icon: React.ReactNode }[]).map((feature) => (
            <div
              key={feature.text}
              className="flex items-center gap-2 text-zinc-500 text-xs"
            >
              <span className="text-[#e8613a]">{feature.icon}</span>
              <span>{feature.text}</span>
            </div>
          ))}
        </motion.div>

        {/* Version block */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="border border-white/10 rounded-xl overflow-hidden bg-[#141414]"
        >
          {/* Version header */}
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
                <OsColumn key={section.os} section={section} winSize={section.os === "Windows" ? winSize : null} />
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

        {/* What gets installed */}
        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-10 text-zinc-600 text-xs"
        >
          By downloading G-AID you agree to the{" "}
          <Link href="/terms" className="text-zinc-500 hover:text-white underline underline-offset-2 transition-colors">
            License Agreement
          </Link>
          . Need help?{" "}
          <Link href="/docs" className="text-zinc-500 hover:text-white underline underline-offset-2 transition-colors">
            View the docs
          </Link>
          .
        </motion.p>
      </div>
        <Footer />
      </main>
    );
}
