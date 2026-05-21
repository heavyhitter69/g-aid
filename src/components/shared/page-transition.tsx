"use client";

import { motion } from "framer-motion";

/** Fade-in that won't leave content stuck at opacity 0 after route changes. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
