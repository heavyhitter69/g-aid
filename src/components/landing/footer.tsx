"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAppStore } from "@/store/app-store";
import { useRouter } from "next/navigation";
import { getAgentForDiscipline } from "@/lib/data";

// ─── Data ─────────────────────────────────────────────────────────────────────

const COLUMNS = [
  {
    heading: "Resources",
    links: [
      { label: "Download", href: "/download" },
      { label: "Release Notes", href: "/release-notes" },
      { label: "Docs", href: "/docs" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Disciplines", href: "/#disciplines" },
      { label: "Features", href: "/#features" },
      { label: "About", href: "/about" },
      { label: "Demo Workspace", href: "/workspace" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Terms of Service", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Data Use", href: "/data-use" },
      { label: "Security", href: "/security" },
    ],
  },
  {
    heading: "Connect",
    links: [
      { label: "X", href: "#" },
      { label: "LinkedIn", href: "#" },
      { label: "YouTube", href: "#" },
      { label: "GitHub", href: "#" },
    ],
  },
];

// ─── Icons ────────────────────────────────────────────────────────────────────

function DesktopIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
      <rect x="2" y="3" width="16" height="11" rx="1.5" />
      <path d="M6 17h8M10 14v3" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-3.5 h-3.5">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type ThemeMode = "system" | "light" | "dark";

export function Footer() {
  const { 
    theme, 
    setTheme,
    setAuthenticated, 
    setUser, 
    setDiscipline, 
    setAgent, 
    completeOnboarding,
    setCurrentProject,
    setProjectFiles
  } = useAppStore();
  
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleEnterDemo = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!mounted) return;
    
    // Ensure we start with the empty Start Screen, wiping any persisted state
    setCurrentProject(null);
    setProjectFiles([]);
    
    setAuthenticated(true);
    completeOnboarding();
    setUser({
      fullName: "Guest Geophysicist",
      institution: "Global Exploration Corp",
      email: "guest@example.com",
      role: "researcher",
      discipline: "exploration",
    });
    setDiscipline("exploration");
    setAgent(getAgentForDiscipline("exploration"));
    router.push("/workspace");
  };

  useEffect(() => {
    if (!mounted) return;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const systemTheme: "dark" | "light" = systemDark ? "dark" : "light";
    setMode(theme === systemTheme ? "system" : theme);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, theme]);

  useEffect(() => {
    if (!mounted || mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode, setTheme, mounted]);

  const handleSystem = () => {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setMode("system");
    setTheme(systemDark ? "dark" : "light");
  };
  const handleLight = () => { setMode("light"); setTheme("light"); };
  const handleDark  = () => { setMode("dark");  setTheme("dark");  };

  const handleHashLinkClick = (e: React.MouseEvent, id: string) => {
    if (typeof window !== "undefined" && window.location.pathname === "/") {
      e.preventDefault();
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  const btnBase     = "w-7 h-7 rounded flex items-center justify-center transition-all duration-150";
  const btnActive   = "text-[var(--text-primary)] bg-[var(--subtle)] ring-1 ring-[var(--border-subtle)]";
  const btnInactive = "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--subtle)]";

  return (
    <footer
      className="relative border-t transition-colors duration-200"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 pt-16 pb-8">

        {/* Top: logo + columns */}
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-8 mb-16">
          <div className="shrink-0 lg:w-48">
            <Link href="/" className="inline-block mb-3">
              <Image src="/g-aid logo.png" alt="G-AID" width={80} height={28} className="object-contain" />
            </Link>
            <p
              className="text-[11px] leading-relaxed font-mono transition-colors duration-200"
              style={{ color: "var(--text-muted)" }}
            >
              Geophysics - Agent<br />Iteration Domain
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8 flex-1">
            {COLUMNS.map((col) => (
              <div key={col.heading}>
                <p
                  className="text-[11px] font-semibold uppercase tracking-widest mb-4 transition-colors duration-200"
                  style={{ color: "var(--text-muted)" }}
                >
                  {col.heading}
                </p>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      {link.label === "Demo Workspace" ? (
                        <button
                          onClick={handleEnterDemo}
                          className="text-[13px] text-left transition-colors duration-150 bg-transparent border-none p-0 cursor-pointer font-medium"
                          style={{ color: "var(--text-secondary)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                        >
                          {link.label}
                        </button>
                      ) : (
                        <Link
                          href={link.href}
                          onClick={(e) => {
                            if (link.href.startsWith("/#")) {
                              handleHashLinkClick(e, link.href.substring(2));
                            }
                          }}
                          className="text-[13px] transition-colors duration-150"
                          style={{ color: "var(--text-secondary)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="border-t pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 transition-colors duration-200"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div
            className="flex items-center gap-3 text-[11px] font-mono transition-colors duration-200"
            style={{ color: "var(--text-muted)" }}
          >
            <span>© 2026 G-AID. All rights reserved.</span>
          </div>

          {/* Theme switcher */}
          <div
            className="flex items-center gap-0.5 rounded-lg p-0.5 transition-colors duration-200"
            style={{
              backgroundColor: "var(--subtle)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <button onClick={handleSystem} aria-label="System theme" title="System"
              className={`${btnBase} ${mode === "system" ? btnActive : btnInactive}`}>
              <DesktopIcon />
            </button>
            <button onClick={handleLight} aria-label="Light theme" title="Light"
              className={`${btnBase} ${mode === "light" ? btnActive : btnInactive}`}>
              <SunIcon />
            </button>
            <button onClick={handleDark} aria-label="Dark theme" title="Dark"
              className={`${btnBase} ${mode === "dark" ? btnActive : btnInactive}`}>
              <MoonIcon />
            </button>
          </div>
        </div>

      </div>
    </footer>
  );
}
