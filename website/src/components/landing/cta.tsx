"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Download } from "lucide-react";

export function CTA() {
  return (
    <section className="relative py-28 px-6 bg-black text-center flex flex-col items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-4xl mx-auto"
      >
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-4 font-sans">
          Desktop app status
        </h2>
        <p className="text-zinc-500 text-sm mb-8 max-w-xl mx-auto">
          Public installers are not published yet. The download page reports GitHub Release availability honestly.
        </p>
        <Link
          href="/download"
          className="inline-flex items-center gap-2 rounded-full bg-white text-black px-6 py-2.5 text-[14px] font-sans font-medium hover:bg-zinc-200 active:scale-95 transition-all duration-200 shadow-lg"
        >
          Check download availability
          <Download className="h-3.5 w-3.5 stroke-[2.5]" />
        </Link>
      </motion.div>
    </section>
  );
}
