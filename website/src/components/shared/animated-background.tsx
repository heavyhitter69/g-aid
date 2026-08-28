"use client";

import { motion } from "framer-motion";

export function AnimatedBackground({ variant = "default" }: { variant?: "default" | "grid" | "particles" }) {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-black" />
      {(variant === "default" || variant === "grid") && (
        <div className="absolute inset-0 grid-overlay opacity-40" />
      )}
      <motion.div
        className="absolute -left-1/4 top-1/4 h-[600px] w-[600px] rounded-full bg-white/5 blur-[120px]"
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity }}
      />
      <motion.div
        className="absolute -right-1/4 bottom-1/4 h-[500px] w-[500px] rounded-full bg-white/5 blur-[100px]"
        animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 10, repeat: Infinity }}
      />
      {variant === "particles" && (
        <>
          {Array.from({ length: 20 }).map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-1 w-1 rounded-full bg-white/20"
              style={{
                left: `${(i * 17) % 100}%`,
                top: `${(i * 23) % 100}%`,
              }}
              animate={{
                y: [0, -30, 0],
                opacity: [0.2, 0.8, 0.2],
              }}
              transition={{
                duration: 3 + (i % 5),
                repeat: Infinity,
                delay: i * 0.2,
              }}
            />
          ))}
        </>
      )}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#000000_70%)]" />
    </div>
  );
}
