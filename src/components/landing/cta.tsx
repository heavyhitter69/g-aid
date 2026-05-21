"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { useAppStore } from "@/store/app-store";
import { useRouter } from "next/navigation";
import { getAgentForDiscipline } from "@/lib/data";

export function CTA() {
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

  const handleEnterDemo = (e: React.MouseEvent) => {
    e.preventDefault();
    setCurrentProject(null);
    setProjectFiles([]);
    setAuthenticated(true);
    completeOnboarding();
    setUser({
      fullName: "Guest Geophysicist",
      institution: "Global Exploration Corp",
      email: "guest@geophysics.demo",
      role: "specialist",
      discipline: "exploration",
    });
    setDiscipline("exploration");
    setAgent(getAgentForDiscipline("exploration"));
    router.push("/workspace");
  };

  return (
    <section className="relative py-24 px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="max-w-4xl mx-auto text-center glass-panel rounded-2xl p-12 border border-subtle"
      >
        <Rocket className="h-12 w-12 text-primary mx-auto mb-6" />
        <h2 className="text-3xl md:text-4xl font-bold mb-4 text-primary">
          Start Building Intelligent Geophysical Workflows
        </h2>
        <p className="text-zinc-300 mb-8 max-w-xl mx-auto">
          Join leading exploration teams using AI-assisted interpretation to accelerate subsurface discovery.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <LinkButton href="/signup" size="lg">
            Create Account <ChevronRight className="h-4 w-4" />
          </LinkButton>
          <button
            onClick={handleEnterDemo}
            className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-lg border border-white/10 bg-transparent text-sm font-semibold text-white hover:bg-white/5 hover:border-white/20 transition-all duration-200"
          >
            Enter Demo Workspace <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </section>
  );
}

