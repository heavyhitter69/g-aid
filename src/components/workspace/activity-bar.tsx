"use client";

import { Files, Search, GitBranch, Wrench, Settings, UserCircle } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

export function ActivityBar() {
  const { workspaceView, setWorkspaceView } = useAppStore();

  const topIcons = [
    { id: "dashboard", icon: Files, label: "explorer" },
    { id: "search", icon: Search, label: "search" },
    { id: "source-control", icon: GitBranch, label: "source control" },
    { id: "extensions", icon: Wrench, label: "tools" },
  ];

  const bottomIcons = [
    { id: "profile", icon: UserCircle, label: "profile" },
    { id: "settings", icon: Settings, label: "settings" },
  ];

  return (
    <nav className="w-12 shrink-0 bg-[#181818] border-r border-[#2b2b2b] flex flex-col justify-between py-2 z-50 overflow-visible">
      <div className="flex flex-col items-center gap-4">
        {topIcons.map((item) => {
          const Icon = item.icon;
          const active = workspaceView === item.id || (workspaceView === "dashboard" && item.id === "dashboard");
          return (
            <div key={item.id} className="relative group flex items-center">
              <button
                onClick={() => setWorkspaceView(item.id as any)}
                className={cn(
                  "relative p-2 text-[#858585] hover:text-[#e1e1e1] transition-colors",
                  active && "text-[#e1e1e1]"
                )}
              >
                {active && (
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white" />
                )}
                <Icon className="h-6 w-6 stroke-[1.5]" />
              </button>
              <div className="absolute left-[110%] top-1/2 -translate-y-1/2 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap font-sans font-medium">
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col items-center gap-4">
        {bottomIcons.map((item) => {
          const Icon = item.icon;
          const active = workspaceView === item.id;
          return (
            <div key={item.id} className="relative group flex items-center">
              <button
                onClick={() => setWorkspaceView(item.id as any)}
                className={cn(
                  "relative p-2 text-[#858585] hover:text-[#e1e1e1] transition-colors",
                  active && "text-[#e1e1e1]"
                )}
              >
                {active && (
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white" />
                )}
                <Icon className="h-6 w-6 stroke-[1.5]" />
              </button>
              <div className="absolute left-[110%] top-1/2 -translate-y-1/2 bg-[#1e1e1e] border border-[#2b2b2b] text-[#cccccc] text-[10px] px-2 py-1 rounded shadow-2xl opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 z-50 whitespace-nowrap font-sans font-medium">
                {item.label}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
