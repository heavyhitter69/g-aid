"use client";

import { Brain } from "lucide-react";

/**
 * Demo interpretation centre is not part of the live workflow.
 * Kept as a gated empty state so a stale view id cannot show fake ERT/drill targets.
 */
export function AICenter() {
  return (
    <section className="h-full flex flex-col items-center justify-center gap-3 p-8 text-[#858585]">
      <Brain className="h-8 w-8" />
      <h2 className="text-lg font-semibold text-[#cccccc]">Interpretation centre</h2>
      <p className="text-sm max-w-md text-center">
        This view is not in the survey workflow. After Proceed, open the map from G-AID Output
        to see products from the magnetic run. G-AID does not invent confidence scores or drill targets.
      </p>
    </section>
  );
}
