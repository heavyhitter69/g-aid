"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { lineDiff } from "@/lib/line-diff";
import {
  keepAllPendingFiles,
  keepPendingFile,
  openPendingChangesReview,
  undoAllPendingFiles,
  undoPendingFile,
} from "@/lib/pending-file-changes";
import { useAppStore, type PendingFileChange } from "@/store/app-store";

function fileBadge(name: string): { label: string; color: string } {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (ext === "ts") return { label: "TS", color: "#3178c6" };
  if (ext === "tsx") return { label: "TSX", color: "#3178c6" };
  if (ext === "js") return { label: "JS", color: "#f7df1e" };
  if (ext === "jsx") return { label: "JSX", color: "#61dafb" };
  if (ext === "py") return { label: "PY", color: "#4b8bbe" };
  if (ext === "json") return { label: "{ }", color: "#d7ba7d" };
  if (ext === "md") return { label: "MD", color: "#cccccc" };
  if (ext === "csv" || ext === "dat" || ext === "xyz") return { label: "CSV", color: "#9cdcfe" };
  if (ext === "yaml" || ext === "yml") return { label: "YML", color: "#cb171e" };
  return { label: ext.slice(0, 3).toUpperCase() || "FILE", color: "#858585" };
}

function DiffStats({ change }: { change: PendingFileChange }) {
  return (
    <span className="shrink-0 font-mono text-[11px]">
      {change.additions > 0 ? <span className="text-[#89d185]">+{change.additions}</span> : null}
      {change.additions > 0 && change.deletions > 0 ? " " : null}
      {change.deletions > 0 ? <span className="text-[#f14c4c]">-{change.deletions}</span> : null}
      {change.additions === 0 && change.deletions === 0 ? (
        <span className="text-[#858585]">{change.kind === "created" ? "new" : "0"}</span>
      ) : null}
    </span>
  );
}

function FileRow({
  change,
  showActions,
}: {
  change: PendingFileChange;
  showActions?: boolean;
}) {
  const badge = fileBadge(change.name);
  return (
    <div className="flex items-center gap-2 min-w-0 px-1 py-0.5">
      <span
        className="shrink-0 w-[28px] text-center text-[9px] font-bold rounded-sm py-0.5"
        style={{ color: badge.color, background: `${badge.color}22` }}
      >
        {badge.label}
      </span>
      <span className="truncate text-[12px] text-[#cccccc] font-sans flex-1" title={change.path}>
        {change.name}
      </span>
      <DiffStats change={change} />
      {showActions ? (
        <span className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="text-[11px] text-[#858585] hover:text-[#cccccc] bg-transparent border-none cursor-pointer px-1"
            onClick={() => void undoPendingFile(change.id)}
          >
            Undo
          </button>
          <button
            type="button"
            className="text-[11px] text-[#89d185] hover:text-white bg-transparent border-none cursor-pointer px-1"
            onClick={() => void keepPendingFile(change.id)}
          >
            Keep
          </button>
        </span>
      ) : null}
    </div>
  );
}

export function PendingChangesCard() {
  const pendingFileChanges = useAppStore((state) => state.pendingFileChanges);
  const [open, setOpen] = useState(false);

  if (!pendingFileChanges.length) return null;

  return (
    <div className="mb-2 rounded-lg border border-[#3c3c3c] bg-[#252526] overflow-hidden">
      <div className="h-[34px] flex items-center gap-2 px-2">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex items-center gap-1 min-w-0 flex-1 bg-transparent border-none cursor-pointer text-[#cccccc] px-0"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 text-[#858585] transition-transform", open && "rotate-90")} />
          <span className="text-[12px] font-medium truncate">{pendingFileChanges.length} Files</span>
        </button>
        <button
          type="button"
          onClick={() => void undoAllPendingFiles()}
          className="text-[11px] text-[#858585] hover:text-[#cccccc] bg-transparent border-none cursor-pointer px-1.5"
        >
          Undo All
        </button>
        <button
          type="button"
          onClick={() => void keepAllPendingFiles()}
          className="text-[11px] text-[#858585] hover:text-[#cccccc] bg-transparent border-none cursor-pointer px-1.5"
        >
          Keep All
        </button>
        <button
          type="button"
          onClick={openPendingChangesReview}
          className="text-[11px] text-white bg-[#3c3c3c] hover:bg-[#4a4a4a] rounded-md px-2.5 py-0.5 border-none cursor-pointer"
        >
          Review
        </button>
      </div>
      {open ? (
        <div className="px-2 pb-2 max-h-[160px] overflow-y-auto flex flex-col gap-0.5">
          {pendingFileChanges.map((change) => (
            <FileRow key={change.id} change={change} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FileDiffCard({
  change,
  expanded,
  onToggle,
}: {
  change: PendingFileChange;
  expanded: boolean;
  onToggle: () => void;
}) {
  const rows = useMemo(
    () => lineDiff(change.previousContent, change.content),
    [change.previousContent, change.content]
  );
  const badge = fileBadge(change.name);
  const dir = change.path.includes("/") ? change.path.slice(0, change.path.lastIndexOf("/") + 1) : "";

  return (
    <section className="rounded-lg border border-[#2b2b2b] bg-[#1e1e1e] overflow-hidden">
      <header className="flex items-center gap-2 px-3 h-[40px] bg-[#252526] border-b border-[#2b2b2b]">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 min-w-0 flex-1 bg-transparent border-none cursor-pointer text-left"
        >
          <ChevronRight className={cn("h-3.5 w-3.5 text-[#858585] shrink-0 transition-transform", expanded && "rotate-90")} />
          <span
            className="shrink-0 w-[28px] text-center text-[9px] font-bold rounded-sm py-0.5"
            style={{ color: badge.color, background: `${badge.color}22` }}
          >
            {badge.label}
          </span>
          <span className="truncate text-[13px] text-white font-medium">{change.name}</span>
          {dir ? <span className="truncate text-[11px] text-[#858585]">{dir}</span> : null}
        </button>
        <DiffStats change={change} />
        <button
          type="button"
          onClick={() => void undoPendingFile(change.id)}
          className="text-[11px] text-[#858585] hover:text-[#cccccc] bg-transparent border-none cursor-pointer px-1.5"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => void keepPendingFile(change.id)}
          className="text-[11px] text-[#89d185] hover:text-white rounded-md px-2 py-0.5 bg-[#2d4a2d] border-none cursor-pointer"
        >
          Keep
        </button>
      </header>
      {expanded ? (
        <div className="max-h-[420px] overflow-auto font-mono text-[12px] leading-[18px]">
          {change.content || change.previousContent ? (
            rows.map((row, index) => (
              <div
                key={`${row.kind}-${index}`}
                className={cn(
                  "grid grid-cols-[44px_1fr] px-2 whitespace-pre",
                  row.kind === "add" && "bg-[#113a1c] text-[#d5f0d5]",
                  row.kind === "del" && "bg-[#3d1515] text-[#f0d5d5]",
                  row.kind === "equal" && "text-[#9d9d9d]"
                )}
              >
                <span className="text-[#6a6a6a] select-none">{index + 1}</span>
                <span>
                  {row.kind === "add" ? "+" : row.kind === "del" ? "-" : " "}
                  {row.text}
                </span>
              </div>
            ))
          ) : (
            <p className="px-3 py-3 text-[12px] text-[#858585] font-sans">
              {change.kind === "created" ? "New file created by the agent." : "No text diff available for this file."}
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}

export function PendingChangesReview() {
  const pendingFileChanges = useAppStore((state) => state.pendingFileChanges);
  const [openId, setOpenId] = useState<string | null>(pendingFileChanges[0]?.id ?? null);

  useEffect(() => {
    if (!pendingFileChanges.some((change) => change.id === openId)) {
      setOpenId(pendingFileChanges[0]?.id ?? null);
    }
  }, [pendingFileChanges, openId]);

  if (!pendingFileChanges.length) {
    return (
      <div className="h-full flex items-center justify-center text-[#858585] text-[13px] font-sans">
        No pending file changes.
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e] text-[#cccccc] font-sans">
      <div className="h-[44px] shrink-0 flex items-center gap-2 px-4 border-b border-[#2b2b2b] bg-[#181818]">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-[#2d2d2d] px-2.5 py-1 text-[12px] text-[#cccccc]">
          <GitBranch className="h-3.5 w-3.5" />
          {pendingFileChanges.length} Pending Changes
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void undoAllPendingFiles()}
            className="text-[12px] text-[#858585] hover:text-[#cccccc] bg-transparent border-none cursor-pointer px-2"
          >
            Undo All
          </button>
          <button
            type="button"
            onClick={() => void keepAllPendingFiles()}
            className="text-[12px] text-[#858585] hover:text-[#cccccc] bg-transparent border-none cursor-pointer px-2"
          >
            Keep All
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {pendingFileChanges.map((change) => (
          <FileDiffCard
            key={change.id}
            change={change}
            expanded={openId === change.id}
            onToggle={() => setOpenId((current) => (current === change.id ? null : change.id))}
          />
        ))}
      </div>
    </div>
  );
}
