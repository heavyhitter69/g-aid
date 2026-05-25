"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Download } from "lucide-react";

export function CTA() {
  const [os, setOs] = useState("Windows");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const userAgent = window.navigator.userAgent.toLowerCase();
      if (userAgent.indexOf("win") !== -1) setOs("Windows");
      else if (userAgent.indexOf("mac") !== -1) setOs("macOS");
      else if (userAgent.indexOf("linux") !== -1) setOs("Linux");
    }
  }, []);

  return (
    <section className="relative py-28 px-6 bg-black text-center flex flex-col items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-4xl mx-auto"
      >
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-8 font-sans">
          Try G-AID now.
        </h2>
        <Link
          href="/download"
          className="inline-flex items-center gap-2 rounded-full bg-white text-black px-6 py-2.5 text-[14px] font-sans font-medium hover:bg-zinc-200 active:scale-95 transition-all duration-200 shadow-lg"
        >
          Download for {os}
          <Download className="h-3.5 w-3.5 stroke-[2.5]" />
        </Link>
      </motion.div>
    </section>
  );
}
