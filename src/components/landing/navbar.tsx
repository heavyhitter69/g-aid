"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/app-store";

export function Navbar() {
  const router = useRouter();
  const { isAuthenticated, setCurrentProject, setProjectFiles, setAuthenticated, setUser } = useAppStore();

  const handleEnterDemo = (e: React.MouseEvent) => {
    e.preventDefault();
    setAuthenticated(false);
    setUser(null);
    setCurrentProject(null);
    setProjectFiles([]);
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
          <div className="relative group">
            <button className="hover:text-white transition-colors text-zinc-400 bg-transparent border-none p-0 cursor-pointer text-sm font-sans font-medium py-2">
              Workspace
            </button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0 w-48 rounded-md bg-[#1e1e1e] border border-[#2b2b2b] shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 py-1 flex flex-col">
              <button
                onClick={handleEnterDemo}
                className="w-full text-left px-4 py-2 text-sm text-[#cccccc] hover:text-white hover:bg-[#2a2d2e] transition-colors cursor-pointer bg-transparent border-none font-sans"
              >
                Demo Workspace
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  router.push("/signin");
                }}
                className="w-full text-left px-4 py-2 text-sm text-[#cccccc] hover:text-white hover:bg-[#2a2d2e] transition-colors cursor-pointer bg-transparent border-none font-sans"
              >
                Workspace
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <LinkButton href="/workspace" variant="ghost" size="sm">Workspace</LinkButton>
          ) : (
            <LinkButton href="/signin" variant="ghost" size="sm">Sign In</LinkButton>
          )}
          <LinkButton href="/download" size="sm">Download</LinkButton>
        </div>
      </nav>
    </motion.header>
  );
}



