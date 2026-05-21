"use client";

import { XCircle, AlertTriangle, Bell, Radio } from "lucide-react";
import { useAppStore } from "@/store/app-store";

export function StatusBar() {
  const { currentProject } = useAppStore();

  return (
    <footer className="h-[22px] bg-[#181818] border-t border-[#2b2b2b] text-[#cccccc] flex items-center justify-between px-2 text-[11px] font-mono shrink-0 select-none">
      <div className="flex items-center h-full text-[#858585] text-[10px] font-sans px-2">
        geophysics - agent iteration domain
      </div>
      <div className="flex items-center h-full">
        <div className="flex items-center px-3 h-full text-[#858585] text-[10px] font-sans">
          v1.0
        </div>
      </div>
    </footer>
  );
}

function GitBranchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="6" y1="3" x2="6" y2="15"></line>
      <circle cx="18" cy="6" r="3"></circle>
      <circle cx="6" cy="18" r="3"></circle>
      <path d="M18 9a9 9 0 0 1-9 9"></path>
    </svg>
  );
}
