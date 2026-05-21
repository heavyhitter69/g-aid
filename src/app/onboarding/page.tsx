"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { AnimatedBackground } from "@/components/shared/animated-background";
import { useAppStore } from "@/store/app-store";
import {
  Brain, CheckCircle2, Loader2, Database, BarChart3, GitBranch,
  Cpu, Shield, Wifi, Layers, ArrowRight, Sparkles, ChevronRight,
} from "lucide-react";

// ─── Cinematic init sequence ────────────────────────────────────────────────

interface InitCheck {
  id: string;
  label: string;
  subLabel: string;
  icon: React.ElementType;
  delay: number; // ms before this check starts revealing
  duration: number; // ms to go from "loading" to "done"
}

const INIT_CHECKS: InitCheck[] = [
  {
    id: "db",
    label: "Connecting dataset engines",
    subLabel: "Linking seismic, resistivity & potential field repositories",
    icon: Database,
    delay: 400,
    duration: 1100,
  },
  {
    id: "viz",
    label: "Initializing visualization systems",
    subLabel: "3-D subsurface renderer, cross-section builder, and QC dashboard",
    icon: BarChart3,
    delay: 1800,
    duration: 1200,
  },
  {
    id: "wf",
    label: "Loading workflow modules",
    subLabel: "Inversion pipelines, attribute extraction, and audit trail",
    icon: GitBranch,
    delay: 3300,
    duration: 1000,
  },
  {
    id: "ai",
    label: "Calibrating AI agent to your discipline",
    subLabel: "Specializing neural topology and loading interpretation priors",
    icon: Cpu,
    delay: 4600,
    duration: 1400,
  },
  {
    id: "sec",
    label: "Verifying security & data integrity",
    subLabel: "End-to-end encryption, provenance chain, and access policies",
    icon: Shield,
    delay: 6300,
    duration: 900,
  },
  {
    id: "net",
    label: "Establishing cloud workspace",
    subLabel: "Synchronising project files and collaborative session layer",
    icon: Wifi,
    delay: 7500,
    duration: 1000,
  },
  {
    id: "env",
    label: "Assembling scientific environment",
    subLabel: "All modules verified — workspace is ready",
    icon: Layers,
    delay: 8800,
    duration: 800,
  },
];

const TOTAL_DURATION = 9900; // ms until all checks are done

// ─── Component ───────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter();
  const {
    onboardingStep,
    setOnboardingStep,
    completeOnboarding,
    user,
    assignedAgent,
    selectedDiscipline,
  } = useAppStore();

  // workspace-init state
  const [checkStates, setCheckStates] = useState<Record<string, "hidden" | "loading" | "done">>(
    Object.fromEntries(INIT_CHECKS.map((c) => [c.id, "hidden"]))
  );
  const [workspaceReady, setWorkspaceReady] = useState(false);

  // Start init timers when entering workspace-init step
  useEffect(() => {
    if (onboardingStep !== "workspace-init") return;

    const timers: ReturnType<typeof setTimeout>[] = [];

    INIT_CHECKS.forEach((check) => {
      // Show loader
      timers.push(
        setTimeout(() => {
          setCheckStates((prev) => ({ ...prev, [check.id]: "loading" }));
        }, check.delay)
      );
      // Flip to done
      timers.push(
        setTimeout(() => {
          setCheckStates((prev) => ({ ...prev, [check.id]: "done" }));
        }, check.delay + check.duration)
      );
    });

    // Reveal "Enter Workspace" button after all checks
    timers.push(
      setTimeout(() => setWorkspaceReady(true), TOTAL_DURATION)
    );

    return () => timers.forEach(clearTimeout);
  }, [onboardingStep]);

  const handleEnterWorkspace = () => {
    completeOnboarding();
    router.push("/workspace");
  };

  const disciplineLabel =
    selectedDiscipline
      ? selectedDiscipline
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
      : "Geophysics";

  return (
    <main className="relative min-h-screen flex items-center justify-center p-6">
      <AnimatedBackground variant="grid" />

      <section className="relative z-10 w-full max-w-2xl">
        <AnimatePresence mode="wait">

          {/* ── WELCOME STEP ─────────────────────────────────────────────── */}
          {onboardingStep === "welcome" && (
            <motion.article
              key="welcome"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.45 }}
              className="glass-panel rounded-2xl border border-white/10 p-10 text-center shadow-2xl"
            >
              {/* Pulsing icon */}
              <motion.div
                className="inline-flex h-20 w-20 items-center justify-center rounded-full border border-white/20 mb-6 relative"
                animate={{
                  boxShadow: [
                    "0 0 0px rgba(255,255,255,0)",
                    "0 0 48px rgba(255,255,255,0.15)",
                    "0 0 0px rgba(255,255,255,0)",
                  ],
                }}
                transition={{ duration: 2.5, repeat: Infinity }}
              >
                <Brain className="h-9 w-9 text-white" />
                <Sparkles className="absolute top-1 right-1 w-4 h-4 text-white/40" />
              </motion.div>

              <p className="font-mono text-xs text-white/30 uppercase tracking-[0.3em] mb-3">
                Account Created
              </p>
              <h1 className="text-3xl font-bold text-white mb-3">
                Welcome, {user?.fullName?.split(" ")[0] ?? "Explorer"}
              </h1>
              <p className="text-zinc-400 mb-8 max-w-md mx-auto leading-relaxed">
                <Image src="/g-aid logo.png" alt="G-AID" width={52} height={18} className="inline object-contain align-middle" /> has created a{" "}
                <span className="text-white font-medium">{disciplineLabel}</span>-specialised
                AI agent tailored to your workflow. It will guide data interpretation,
                automate inversions, and surface insights specific to your domain — so you
                can focus on the science.
              </p>

              {/* Feature bullets */}
              <ul className="max-w-xs mx-auto space-y-3 mb-10 text-left">
                {[
                  "Discipline-aware anomaly detection",
                  "Natural-language interpretation reports",
                  "Automated workflow recommendations",
                  "Real-time inversion monitoring",
                ].map((item, i) => (
                  <motion.li
                    key={item}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.15 }}
                    className="flex items-center gap-3 text-sm text-zinc-400"
                  >
                    <CheckCircle2 className="w-4 h-4 text-white/50 shrink-0" />
                    {item}
                  </motion.li>
                ))}
              </ul>

              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                onClick={() => setOnboardingStep("workspace-init")}
                className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-zinc-100 active:bg-zinc-200 transition-all duration-200 group"
              >
                Continue
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </motion.button>
            </motion.article>
          )}

          {/* ── WORKSPACE-INIT STEP ───────────────────────────────────────── */}
          {onboardingStep === "workspace-init" && (
            <motion.article
              key="init"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="glass-panel rounded-2xl border border-white/10 p-10 shadow-2xl"
            >
              <header className="text-center mb-10">
                <p className="font-mono text-xs text-white/30 uppercase tracking-[0.3em] mb-3">
                  System Initialisation
                </p>
                <h1 className="text-2xl font-bold text-white">
                  Preparing your workspace
                </h1>
              </header>

              {/* Sequential check list */}
              <ul className="space-y-0 divide-y divide-white/5">
                {INIT_CHECKS.map((check) => {
                  const state = checkStates[check.id];
                  const Icon = check.icon;

                  return (
                    <AnimatePresence key={check.id}>
                      {state !== "hidden" && (
                        <motion.li
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          transition={{ duration: 0.35, ease: "easeOut" }}
                          className="flex items-center gap-4 py-4 overflow-hidden"
                        >
                          {/* Icon bubble */}
                          <div
                            className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 transition-all duration-500 ${
                              state === "done"
                                ? "border-white/30 bg-white/10"
                                : "border-white/10 bg-transparent"
                            }`}
                          >
                            <Icon
                              className={`w-4 h-4 transition-colors duration-500 ${
                                state === "done" ? "text-white" : "text-zinc-600"
                              }`}
                            />
                          </div>

                          {/* Labels */}
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm font-medium transition-colors duration-500 ${
                                state === "done" ? "text-white" : "text-zinc-400"
                              }`}
                            >
                              {check.label}
                            </p>
                            <p className="text-xs text-zinc-600 truncate">{check.subLabel}</p>
                          </div>

                          {/* Status indicator */}
                          <div className="shrink-0">
                            {state === "loading" ? (
                              <Loader2 className="w-4 h-4 text-zinc-500 animate-spin" />
                            ) : (
                              <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                              >
                                <CheckCircle2 className="w-4 h-4 text-white/70" />
                              </motion.div>
                            )}
                          </div>
                        </motion.li>
                      )}
                    </AnimatePresence>
                  );
                })}
              </ul>

              {/* Enter Workspace button */}
              <AnimatePresence>
                {workspaceReady && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: "easeOut" }}
                    className="mt-10 text-center"
                  >
                    <p className="font-mono text-xs text-white/30 uppercase tracking-widest mb-5">
                      All systems operational
                    </p>
                    <button
                      onClick={handleEnterWorkspace}
                      className="inline-flex items-center gap-2 px-10 py-3.5 rounded-xl bg-white text-black font-bold text-sm hover:bg-zinc-100 active:bg-zinc-200 transition-all duration-200 group shadow-lg shadow-white/5"
                    >
                      Enter Workspace
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.article>
          )}

        </AnimatePresence>
      </section>
    </main>
  );
}
