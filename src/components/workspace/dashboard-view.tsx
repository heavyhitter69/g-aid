"use client";

import Image from "next/image";
import { Box } from "lucide-react";

export function DashboardView() {
  return (
    <div className="h-full bg-[#1e1e1e] flex items-center justify-center select-none relative">
      <div className="flex flex-col items-center opacity-60">
        <div className="mb-12 flex items-center justify-center filter drop-shadow-[0_0_15px_rgba(0,122,204,0.3)]">
          <Image src="/g-aid logo.png" alt="G-AID" width={160} height={56} className="object-contain" priority />
        </div>

        <div className="grid grid-cols-[auto_auto] gap-x-8 gap-y-3 text-[#cccccc] text-[13px]">
          <div className="text-right font-sans">New Agent</div>
          <div className="font-mono text-[11px] flex items-center gap-1">
            <span className="bg-[#333333] px-1.5 py-0.5 rounded text-[#e1e1e1]">Ctrl</span> + <span className="bg-[#333333] px-1.5 py-0.5 rounded text-[#e1e1e1]">Shift</span> + <span className="bg-[#333333] px-1.5 py-0.5 rounded text-[#e1e1e1]">L</span>
          </div>
          
          <div className="text-right font-sans">Search Files</div>
          <div className="font-mono text-[11px] flex items-center gap-1">
            <span className="bg-[#333333] px-1.5 py-0.5 rounded text-[#e1e1e1]">Ctrl</span> + <span className="bg-[#333333] px-1.5 py-0.5 rounded text-[#e1e1e1]">P</span>
          </div>

          <div className="text-right font-sans">Maximize Chat</div>
          <div className="font-mono text-[11px] flex items-center gap-1">
            <span className="bg-[#333333] px-1.5 py-0.5 rounded text-[#e1e1e1]">Ctrl</span> + <span className="bg-[#333333] px-1.5 py-0.5 rounded text-[#e1e1e1]">Alt</span> + <span className="bg-[#333333] px-1.5 py-0.5 rounded text-[#e1e1e1]">E</span>
          </div>
        </div>
      </div>
    </div>
  );
}

