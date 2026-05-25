"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Download } from "lucide-react";
import { LinkButton } from "@/components/ui/link-button";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/app-store";
import { getAgentForDiscipline } from "@/lib/data";

function GlobeViz() {
  return (
    <div className="relative h-[400px] w-full max-w-lg mx-auto">
      <motion.div
        className="absolute inset-0 rounded-full border border-primary/10"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute inset-8 rounded-full border border-primary/5"
        animate={{ rotate: -360 }}
        transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute inset-16 rounded-full border border-primary/10 bg-primary/5"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 4, repeat: Infinity }}
      />
      {Array.from({ length: 8 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute left-1/2 top-1/2 h-px w-32 origin-left bg-primary/20"
          style={{ rotate: `${i * 45}deg` }}
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity, delay: i * 0.25 }}
        />
      ))}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="font-mono text-xs text-primary/60 mb-2 uppercase tracking-widest">
            GEOPHYSICS - AGENT ITERATION DOMAIN
          </div>
          <div className="h-24 w-48 mx-auto relative overflow-hidden rounded border border-primary/10 bg-background/40">
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute left-0 right-0 h-px bg-primary/20"
                style={{ top: `${i * 8 + 4}%` }}
                animate={{ opacity: [0.2, 0.9, 0.2], scaleX: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.1 }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  const { 
    setAuthenticated, 
    setUser, 
    setDiscipline, 
    setAgent, 
    completeOnboarding,
    setCurrentProject,
    setProjectFiles
  } = useAppStore();

  const router = useRouter();
  const [os, setOs] = useState("Windows");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const userAgent = window.navigator.userAgent.toLowerCase();
      if (userAgent.indexOf("win") !== -1) setOs("Windows");
      else if (userAgent.indexOf("mac") !== -1) setOs("macOS");
      else if (userAgent.indexOf("linux") !== -1) setOs("Linux");
    }
  }, []);

  const handleEnterDemo = (e: React.MouseEvent) => {
    e.preventDefault();
    
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

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16">
      <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-12 items-center">
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-mono text-white/80 mb-6"
          >
            GEOPHYSICS - AGENT ITERATION DOMAIN
          </motion.div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="block text-white"
            >
              Geophysical interpretation and visualization assisted by multi-agent
              orchestration
            </motion.span>
          </h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-lg text-zinc-400 max-w-xl mb-8"
          >
            Scientific interpretation, visualization, workflow automation, and
            collaborative analysis for modern geophysics.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75 }}
            className="flex flex-wrap gap-4"
          >
            <LinkButton href="/download" size="lg" variant="default" className="gap-2">
              Download for {os} <Download className="h-4 w-4" />
            </LinkButton>
            <Button onClick={handleEnterDemo} size="lg" variant="outline">
              Launch Demo Workspace <ChevronRight className="h-4 w-4" />
            </Button>
          </motion.div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.3 }}
        >
          <GlobeViz />
        </motion.div>
      </div>
    </section>
  );
}
