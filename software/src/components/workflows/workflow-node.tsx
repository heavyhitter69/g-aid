"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { motion } from "framer-motion";
import {
  Upload, Filter, Wand2, Layers, Map, Brain, FileText, CheckCircle2, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const icons: Record<string, React.ElementType> = {
  upload: Upload, clean: Wand2, filter: Filter, inversion: Layers,
  map: Map, ai: Brain, report: FileText,
};

const statusStyles: Record<string, string> = {
  idle: "border-white/10",
  running: "border-white shadow-lg shadow-white/20",
  complete: "border-white/40",
};

export const WorkflowNode = memo(({ data }: NodeProps) => {
  const Icon = icons[data.type as string] || Upload;
  const status = (data.status as string) || "idle";

  return (
  <>
    <Handle type="target" position={Position.Left} className="!bg-white !w-2 !h-2 !border-0" />
    <motion.article
      animate={status === "running" ? { scale: [1, 1.02, 1] } : {}}
      transition={{ duration: 1.5, repeat: status === "running" ? Infinity : 0 }}
      className={cn(
        "px-4 py-3 rounded-lg border bg-zinc-900/90 min-w-[140px] transition-all duration-300",
        statusStyles[status]
      )}
    >
      <header className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-white" />
        <span className="text-xs font-mono text-white">{data.label as string}</span>
      </header>
      <footer className="mt-2 flex items-center gap-1">
        {status === "running" && <Loader2 className="h-3 w-3 animate-spin text-white" />}
        {status === "complete" && <CheckCircle2 className="h-3 w-3 text-white" />}
        <span className="text-[10px] text-zinc-500 uppercase">{status}</span>
      </footer>
    </motion.article>
    <Handle type="source" position={Position.Right} className="!bg-white !w-2 !h-2 !border-0" />
  </>
  );
});

WorkflowNode.displayName = "WorkflowNode";
