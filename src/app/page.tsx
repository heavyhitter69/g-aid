import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { Disciplines } from "@/components/landing/disciplines";
import { CTA } from "@/components/landing/cta";

export default function Home() {
  return (
    <main className="min-h-screen bg-black">
      <Navbar />
      <Hero />
      <Disciplines />
      <Features />
      <CTA />
      <footer className="py-12 px-6 border-t border-white/5 text-center text-zinc-500 text-sm font-mono">
        &copy; 2026 GEOPHYSICAL AGENT INTERFACE. ALL RIGHTS RESERVED.
      </footer>
    </main>
  );
}
