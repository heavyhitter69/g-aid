"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function BootSplash({ animate = false }: { animate?: boolean }) {
  const [typed, setTyped] = useState(animate ? "" : "G-AID");
  const [done, setDone] = useState(!animate);

  useEffect(() => {
    if (!animate) return;
    const word = "G-AID";
    let index = 0;
    const id = window.setInterval(() => {
      index += 1;
      setTyped(word.slice(0, index));
      if (index >= word.length) {
        window.clearInterval(id);
        window.setTimeout(() => setDone(true), 80);
      }
    }, 150);
    return () => window.clearInterval(id);
  }, [animate]);

  return (
    <div className="fixed inset-0 z-[9999] bg-[#0b0b0b] flex items-center justify-center gaid-drag">
      <div
        className={cn(
          "text-center select-none transition-opacity duration-700 ease-out",
          done ? "opacity-100" : "opacity-55"
        )}
      >
        <img
          src="/app-icon.png"
          alt=""
          className="mx-auto h-[72px] w-[72px] rounded-[16px] gaid-boot-pulse"
        />
        <div className="mt-5 text-[28px] tracking-[0.18em] text-[#9fe8d0] font-normal h-[1.2em] leading-none">
          {typed}
          {!done && <span className="gaid-boot-caret" />}
        </div>
      </div>
    </div>
  );
}
