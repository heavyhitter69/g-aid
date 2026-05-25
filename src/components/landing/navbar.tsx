"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { useAppStore } from "@/store/app-store";
import { useRouter } from "next/navigation";
import { getAgentForDiscipline } from "@/lib/data";

export function Navbar() {
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

  const handleHashLinkClick = (e: React.MouseEvent, id: string) => {
    if (typeof window !== "undefined" && window.location.pathname === "/") {
      e.preventDefault();
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-black/40 backdrop-blur-xl"
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Logo />
        <div className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
          <Link 
            href="/#disciplines" 
            onClick={(e) => handleHashLinkClick(e, "disciplines")}
            className="hover:text-white transition-colors"
          >
            Disciplines
          </Link>
          <Link 
            href="/#features" 
            onClick={(e) => handleHashLinkClick(e, "features")}
            className="hover:text-white transition-colors"
          >
            Features
          </Link>
          <button onClick={handleEnterDemo} className="hover:text-white transition-colors text-zinc-400 bg-transparent border-none p-0 cursor-pointer text-sm font-sans font-medium">Demo Workspace</button>
        </div>
        <div className="flex items-center gap-3">
          <LinkButton href="/signin" variant="ghost" size="sm">Sign In</LinkButton>
          <LinkButton href="/download" size="sm">Download</LinkButton>
        </div>
      </nav>
    </motion.header>
  );
}



