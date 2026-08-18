"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { doneLabel, type WorkStep } from "@/lib/work-steps";

export function WorkingLog({
  steps,
  isWorking,
}: {
  steps: WorkStep[];
  isWorking?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [steps, open]);

  if (!steps.length && !isWorking) return null;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 text-[13px] text-[#c8c8c8] hover:text-white transition-colors"
      >
        <span className={isWorking ? "gaid-thinking-shimmer font-medium select-none" : "font-medium"}>
          {isWorking ? "Working" : "Worked"}
        </span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        )}
      </button>
      {open && (
        <div
          ref={listRef}
          className="mt-2 ml-2 text-[12px] text-[#a0a0a0] leading-relaxed border-l-2 border-[#333] pl-3 max-h-[240px] overflow-y-auto"
        >
          {steps.map((step) => (
            <div key={step.id} className="flex items-start gap-2 py-0.5">
              {step.status === "running" ? (
                <Loader2 className="h-3 w-3 mt-0.5 shrink-0 animate-spin text-[#007acc]" />
              ) : step.status === "warning" ? (
                <span className="mt-0.5 shrink-0 text-[#cca700]">!</span>
              ) : (
                <Check className="h-3 w-3 mt-0.5 shrink-0 text-[#89d185]" />
              )}
              <span className={step.status === "running" ? "text-[#cccccc]" : ""}>
                {step.status === "done" ? doneLabel(step) : step.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
