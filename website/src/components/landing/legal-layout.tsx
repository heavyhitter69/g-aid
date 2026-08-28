"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { AnimatedBackground } from "@/components/shared/animated-background";

export interface LegalSection {
  id: string;
  heading: string;
  body: ReactNode;
}

interface LegalPageProps {
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: LegalSection[];
}

const LEGAL_NAV = [
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy",   href: "/privacy" },
  { label: "Data Use",         href: "/data-use" },
  { label: "Security",         href: "/security" },
];

export function LegalLayout({ title, subtitle, lastUpdated, sections }: LegalPageProps) {
  return (
    <main
      className="relative min-h-screen transition-colors duration-200"
      style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}
    >
      <AnimatedBackground variant="grid" />
      <Navbar />

      <div className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-0">
        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-12"
        >
          <p
            className="text-[11px] font-mono uppercase tracking-widest mb-3 transition-colors duration-200"
            style={{ color: "var(--text-muted)" }}
          >
            Legal
          </p>
          <h1 className="text-4xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>
            {title}
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
          <p className="text-xs font-mono mt-2" style={{ color: "var(--text-muted)" }}>
            Last updated: {lastUpdated}
          </p>
        </motion.div>

        <div className="flex gap-12 pb-0">
          {/* Sticky sidebar — table of contents + legal nav */}
          <motion.aside
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="hidden lg:block shrink-0 w-52"
          >
            {/* TOC */}
            <div className="sticky top-28">
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                style={{ color: "var(--text-muted)" }}
              >
                On this page
              </p>
              <ul className="space-y-1.5 mb-10">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="text-[12px] block transition-colors duration-150 leading-snug"
                      style={{ color: "var(--text-secondary)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                    >
                      {s.heading}
                    </a>
                  </li>
                ))}
              </ul>

              {/* Other legal pages */}
              <p
                className="text-[10px] font-semibold uppercase tracking-widest mb-3"
                style={{ color: "var(--text-muted)" }}
              >
                Legal
              </p>
              <ul className="space-y-1.5">
                {LEGAL_NAV.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-[12px] block transition-colors duration-150"
                      style={{ color: title === item.label ? "var(--text-primary)" : "var(--text-secondary)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = title === item.label ? "var(--text-primary)" : "var(--text-secondary)")}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </motion.aside>

          {/* Main content */}
          <motion.article
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 }}
            className="flex-1 min-w-0 pb-24"
          >
            <div
              className="rounded-xl border p-8 md:p-12 transition-colors duration-200"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-subtle)",
              }}
            >
              {sections.map((section, i) => (
                <section
                  key={section.id}
                  id={section.id}
                  className={i < sections.length - 1 ? "mb-10 pb-10 border-b" : ""}
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <h2
                    className="text-lg font-bold mb-4"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {section.heading}
                  </h2>
                  <div
                    className="text-[14px] leading-relaxed space-y-3 legal-prose"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {section.body}
                  </div>
                </section>
              ))}
            </div>
          </motion.article>
        </div>
      </div>

      <Footer />
    </main>
  );
}
