"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isTemporaryWorkspaceFile } from "@/lib/workspace-file-ids";
import { cn } from "@/lib/utils";
import { buildFileTree, type FileTreeNode } from "@/lib/project-tree";
import type { ProjectFile } from "@/types/project";

const ROW = 22;
const INDENT = 8;
const BASE = 8;
const HEADER_ROWS = 1;

interface ExplorerTreeProps {
  files: ProjectFile[];
  activeFile?: string | null;
  selectedId?: string | null;
  onSelect?: (id: string, kind: "file" | "folder") => void;
  onOpenFile: (file: ProjectFile) => void;
  onOpenFolder?: (folderId: string) => void;
  onContextMenu: (e: React.MouseEvent, fileId: string, kind: "file" | "folder") => void;
  onMove?: (fromId: string, destFolderId: string) => void;
  collapseSignal?: number;
  creating?: "file" | "folder" | null;
  createPrefix?: string;
  createName?: string;
  onCreateNameChange?: (value: string) => void;
  onCreateSubmit?: () => void;
  onCreateCancel?: () => void;
  createError?: string;
  renameTarget?: string | null;
  renameValue?: string;
  onRenameValueChange?: (value: string) => void;
  onRenameSubmit?: () => void;
  onRenameCancel?: () => void;
}

function pathsMatch(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.replace(/\\/g, "/") === b.replace(/\\/g, "/");
}

function Twistie({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" className="shrink-0 text-[#c5c5c5]" aria-hidden>
      {open ? (
        <path d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z" />
      ) : (
        <path d="M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z" />
      )}
    </svg>
  );
}

function FileGlyph({ name }: { name: string }) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "csv" || ext === "dat" || ext === "xyz" || ext === "xlsx" || ext === "xls") {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" className="shrink-0" aria-hidden>
        <path fill="#89d185" d="M2.5 2.5h11v11h-11z" />
        <path fill="#1e1e1e" d="M3.5 4.5h9v1h-9zm0 3h9v1h-9zm0 3h9v1h-9zM6 3.5h1v10H6z" />
      </svg>
    );
  }
  if (ext === "ts" || ext === "tsx" || ext === "mts" || ext === "cts") {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" className="shrink-0" aria-hidden>
        <rect width="16" height="16" rx="2" fill="#3178c6" />
        <text x="8" y="11.5" textAnchor="middle" fill="#fff" fontSize="6.5" fontWeight="700" fontFamily="Segoe UI, sans-serif">
          {ext === "tsx" ? "TX" : "TS"}
        </text>
      </svg>
    );
  }
  if (ext === "js" || ext === "jsx" || ext === "mjs") {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" className="shrink-0" aria-hidden>
        <rect width="16" height="16" rx="2" fill="#cbcb41" />
        <text x="8" y="11.5" textAnchor="middle" fill="#1e1e1e" fontSize="6.5" fontWeight="700" fontFamily="Segoe UI, sans-serif">JS</text>
      </svg>
    );
  }
  if (ext === "json" || ext === "geojson") {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" fill="#cbcb41" className="shrink-0" aria-hidden>
        <path d="M5 3c-1.2 0-2 .8-2 2v1.2c0 .6-.4 1-1 1v1.6c.6 0 1 .4 1 1V11c0 1.2.8 2 2 2h.8v-1.2H5.2c-.4 0-.7-.3-.7-.8V9.4c0-1-.8-1.4-1.3-1.4.5 0 1.3-.4 1.3-1.4V5.8c0-.5.3-.8.7-.8H5.8V3H5zm6 0h.8v1.2h.6c.4 0 .7.3.7.8v1.8c0 1 .8 1.4 1.3 1.4-.5 0-1.3.4-1.3 1.4v1.8c0 .5-.3.8-.7.8h-.6V13H11c1.2 0 2-.8 2-2v-1.2c0-.6.4-1 1-1V7.2c-.6 0-1-.4-1-1V5c0-1.2-.8-2-2-2z" />
      </svg>
    );
  }
  if (ext === "grd" || ext === "tif" || ext === "tiff" || ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "npz" || ext === "asc") {
    return (
      <svg viewBox="0 0 16 16" width="16" height="16" className="shrink-0" aria-hidden>
        <path fill="#c586c0" d="M2 3h12v10H2z" />
        <path fill="#1e1e1e" d="M3.5 11 6 8l2 2 2.5-3.5L13 11H3.5z" />
        <circle cx="5" cy="6" r="1" fill="#1e1e1e" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className="shrink-0" aria-hidden>
      <path fill="#c5c5c5" d="M3.5 1.5h6.1L13.5 5.4V14.5h-10z" />
      <path fill="#1e1e1e" d="M9.2 2.2v3.6h3.6z" />
    </svg>
  );
}

function IndentGuides({ depth }: { depth: number }) {
  if (depth <= 0) return null;
  return (
    <span className="gaid-tree-indent" aria-hidden>
      {Array.from({ length: depth }, (_, i) => (
        <span key={i} className="gaid-tree-indent-guide" />
      ))}
    </span>
  );
}

function NameInput({
  value,
  placeholder,
  error,
  depth,
  onChange,
  onSubmit,
  onCancel,
}: {
  value: string;
  placeholder: string;
  error?: string;
  depth: number;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const done = useRef(false);
  const finish = (submit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (submit) onSubmit();
    else onCancel();
  };
  return (
    <div className="relative pr-2 pb-1" style={{ paddingLeft: BASE + depth * INDENT + 16 }}>
      <IndentGuides depth={depth} />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") finish(true);
          if (e.key === "Escape") finish(false);
        }}
        onBlur={() => finish(Boolean(value.trim()))}
        onClick={(e) => e.stopPropagation()}
        placeholder={placeholder}
        className="w-full bg-[#3c3c3c] text-[#cccccc] text-xs px-1.5 py-0.5 rounded-none border border-[#007acc] outline-none"
      />
      {error ? <p className="pt-0.5 text-[10px] text-[#f48771]">{error}</p> : null}
    </div>
  );
}

function TreeNode({
  node,
  depth,
  fileById,
  expanded,
  activeFile,
  selectedId,
  dropTarget,
  onToggle,
  onSelect,
  onOpenFile,
  onOpenFolder,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  creating,
  createFolder,
  createName,
  onCreateNameChange,
  onCreateSubmit,
  onCreateCancel,
  createError,
  renameTarget,
  renameValue,
  onRenameValueChange,
  onRenameSubmit,
  onRenameCancel,
}: {
  node: FileTreeNode;
  depth: number;
  fileById: Map<string, ProjectFile>;
  expanded: Set<string>;
  activeFile?: string | null;
  selectedId?: string | null;
  dropTarget?: string | null;
  onToggle: (id: string) => void;
  onSelect?: (id: string, kind: "file" | "folder") => void;
  onOpenFile: (file: ProjectFile) => void;
  onOpenFolder?: (folderId: string) => void;
  onContextMenu: (e: React.MouseEvent, fileId: string, kind: "file" | "folder") => void;
  onDragStart: (e: React.DragEvent, id: string, kind: "file" | "folder") => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (e: React.DragEvent, destFolderId: string) => void;
  creating?: "file" | "folder" | null;
  createFolder: string;
  createName: string;
  onCreateNameChange?: (value: string) => void;
  onCreateSubmit?: () => void;
  onCreateCancel?: () => void;
  createError?: string;
  renameTarget?: string | null;
  renameValue?: string;
  onRenameValueChange?: (value: string) => void;
  onRenameSubmit?: () => void;
  onRenameCancel?: () => void;
}) {
  const renaming = pathsMatch(renameTarget, node.id);
  const selected = pathsMatch(selectedId, node.id);
  const padLeft = BASE + depth * INDENT;

  const sharedTree = {
    fileById,
    expanded,
    activeFile,
    selectedId,
    dropTarget,
    onToggle,
    onSelect,
    onOpenFile,
    onOpenFolder,
    onContextMenu,
    onDragStart,
    onDragOver,
    onDrop,
    creating,
    createFolder,
    createName,
    onCreateNameChange,
    onCreateSubmit,
    onCreateCancel,
    createError,
    renameTarget,
    renameValue,
    onRenameValueChange,
    onRenameSubmit,
    onRenameCancel,
  };

  if (node.type === "folder") {
    const isOpen = expanded.has(node.id);
    const isDrop = dropTarget === node.id;
    return (
      <div className="gaid-tree-folder">
        <button
          type="button"
          draggable={!renaming}
          onClick={(e) => {
            if (e.detail === 2) return;
            onSelect?.(node.id, "folder");
            onToggle(node.id);
          }}
          onDoubleClick={() => onOpenFolder?.(node.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            onSelect?.(node.id, "folder");
            onContextMenu(e, node.id, "folder");
          }}
          onDragStart={(e) => onDragStart(e, node.id, "folder")}
          onDragOver={(e) => onDragOver(e, node.id)}
          onDrop={(e) => onDrop(e, node.id)}
          style={{
            paddingLeft: padLeft,
            top: (HEADER_ROWS + depth) * ROW,
            zIndex: 30 - depth,
          }}
          className={cn(
            "gaid-tree-row gaid-tree-sticky w-full flex items-center gap-0 text-[#cccccc] text-left text-[13px] leading-[22px] border-none cursor-pointer",
            selected || isDrop ? "bg-[#37373d] text-white" : "bg-[#181818] hover:bg-[#2a2d2e]"
          )}
        >
          <IndentGuides depth={depth} />
          <Twistie open={isOpen} />
          {renaming && onRenameValueChange && onRenameSubmit && onRenameCancel ? (
            <input
              autoFocus
              value={renameValue || ""}
              onChange={(e) => onRenameValueChange(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") onRenameSubmit();
                if (e.key === "Escape") onRenameCancel();
              }}
              onBlur={() => onRenameSubmit()}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 bg-[#3c3c3c] text-[#cccccc] text-xs px-1.5 py-0.5 rounded-none border border-[#007acc] outline-none"
            />
          ) : (
            <span className="truncate px-0.5">{node.name}</span>
          )}
        </button>
        {isOpen && (
          <>
            {creating && createFolder === node.id && onCreateNameChange && onCreateSubmit && onCreateCancel ? (
              <NameInput
                value={createName}
                placeholder={creating === "file" ? "New file name" : "New folder name"}
                error={createError}
                depth={depth + 1}
                onChange={onCreateNameChange}
                onSubmit={onCreateSubmit}
                onCancel={onCreateCancel}
              />
            ) : null}
            {node.children?.map((child) => (
              <TreeNode key={child.id} node={child} depth={depth + 1} {...sharedTree} />
            ))}
          </>
        )}
      </div>
    );
  }

  const projectFile = fileById.get(node.id);
  if (!projectFile) return null;
  const isActive = pathsMatch(activeFile, node.id) || pathsMatch(activeFile, projectFile.path);

  return (
    <button
      type="button"
      draggable={!renaming}
      onClick={() => {
        onSelect?.(node.id, "file");
        onOpenFile(projectFile);
      }}
      onContextMenu={(e) => {
        onSelect?.(node.id, "file");
        onContextMenu(e, node.id, "file");
      }}
      onDragStart={(e) => onDragStart(e, node.id, "file")}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        const parent = node.id.includes("/") ? node.id.replace(/\/[^/]+$/, "") : "";
        onDrop(e, parent);
      }}
      style={{ paddingLeft: padLeft }}
      className={cn(
        "gaid-tree-row relative w-full flex items-center gap-0 text-left text-[13px] leading-[22px] border-none cursor-pointer",
        selected || isActive
          ? "bg-[#37373d] text-white"
          : "bg-transparent text-[#cccccc] hover:bg-[#2a2d2e] hover:text-white"
      )}
    >
      <IndentGuides depth={depth} />
      <span className="w-4 shrink-0" />
      <FileGlyph name={node.name} />
      {renaming && onRenameValueChange && onRenameSubmit && onRenameCancel ? (
        <input
          autoFocus
          value={renameValue || ""}
          onChange={(e) => onRenameValueChange(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") onRenameSubmit();
            if (e.key === "Escape") onRenameCancel();
          }}
          onBlur={() => onRenameSubmit()}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-[#3c3c3c] text-[#cccccc] text-xs px-1.5 py-0.5 rounded-none border border-[#007acc] outline-none"
        />
      ) : (
        <span className="truncate px-1.5">{node.name}</span>
      )}
    </button>
  );
}

export function ExplorerTree({
  files,
  activeFile,
  selectedId,
  onSelect,
  onOpenFile,
  onOpenFolder,
  onContextMenu,
  onMove,
  collapseSignal,
  creating,
  createPrefix,
  createName,
  onCreateNameChange,
  onCreateSubmit,
  onCreateCancel,
  createError,
  renameTarget,
  renameValue,
  onRenameValueChange,
  onRenameSubmit,
  onRenameCancel,
}: ExplorerTreeProps) {
  const visible = useMemo(
    () =>
      files.filter(
        (file) => !isTemporaryWorkspaceFile(file.id) && !isTemporaryWorkspaceFile(file.name)
      ),
    [files]
  );
  const tree = useMemo(() => buildFileTree(visible), [visible]);
  const fileById = useMemo(() => new Map(visible.map((f) => [f.id, f])), [visible]);
  const createFolder = (createPrefix || "").replace(/\\/g, "/").replace(/\/$/, "");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  useEffect(() => {
    setExpanded(new Set());
  }, [collapseSignal]);

  useEffect(() => {
    if (!activeFile) return;
    const parts = activeFile.replace(/\\/g, "/").split("/").filter(Boolean);
    setExpanded((prev) => {
      const next = new Set(prev);
      let acc = "";
      for (let i = 0; i < parts.length - 1; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i];
        next.add(acc);
      }
      return next;
    });
  }, [activeFile]);

  useEffect(() => {
    if (!createFolder) return;
    const parts = createFolder.split("/").filter(Boolean);
    setExpanded((prev) => {
      const next = new Set(prev);
      let acc = "";
      for (const part of parts) {
        acc = acc ? `${acc}/${part}` : part;
        next.add(acc);
      }
      return next;
    });
  }, [createFolder]);

  const onToggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onDragStart = (e: React.DragEvent, id: string, kind: "file" | "folder") => {
    e.dataTransfer.setData("text/gaid-path", id);
    e.dataTransfer.setData("text/gaid-kind", kind);
    e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(id);
  };

  const onDrop = (e: React.DragEvent, destFolderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const fromId = e.dataTransfer.getData("text/gaid-path");
    if (!fromId || fromId === destFolderId) return;
    if (destFolderId && (destFolderId === fromId || destFolderId.startsWith(`${fromId}/`))) return;
    onMove?.(fromId, destFolderId);
  };

  const createInput =
    creating && !createFolder && onCreateNameChange && onCreateSubmit && onCreateCancel ? (
      <NameInput
        value={createName || ""}
        placeholder={creating === "file" ? "New file name" : "New folder name"}
        error={createError}
        depth={0}
        onChange={onCreateNameChange}
        onSubmit={onCreateSubmit}
        onCancel={onCreateCancel}
      />
    ) : null;

  if (!tree.length && !creating) {
    return (
      <p className="px-4 py-2 text-[10px] text-[#858585]">No files in this folder.</p>
    );
  }

  return (
    <div
      className="gaid-tree py-0 min-h-[120px]"
      onDragOver={(e) => {
        e.preventDefault();
        setDropTarget("");
      }}
      onDrop={(e) => onDrop(e, "")}
      onDragLeave={() => setDropTarget(null)}
    >
      {createInput}
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          fileById={fileById}
          expanded={expanded}
          activeFile={activeFile}
          selectedId={selectedId}
          dropTarget={dropTarget}
          onToggle={onToggle}
          onSelect={onSelect}
          onOpenFile={onOpenFile}
          onOpenFolder={onOpenFolder}
          onContextMenu={onContextMenu}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          creating={creating}
          createFolder={createFolder}
          createName={createName || ""}
          onCreateNameChange={onCreateNameChange}
          onCreateSubmit={onCreateSubmit}
          onCreateCancel={onCreateCancel}
          createError={createError}
          renameTarget={renameTarget}
          renameValue={renameValue}
          onRenameValueChange={onRenameValueChange}
          onRenameSubmit={onRenameSubmit}
          onRenameCancel={onRenameCancel}
        />
      ))}
    </div>
  );
}
