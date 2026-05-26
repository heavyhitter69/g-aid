"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Table,
  Layers,
  Braces,
  FileCode,
  FileText,
  Folder,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildFileTree, type FileTreeNode } from "@/lib/project-tree";
import type { ProjectFile } from "@/types/project";

interface ExplorerTreeProps {
  files: ProjectFile[];
  onOpenFile: (file: ProjectFile) => void;
  onContextMenu: (e: React.MouseEvent, fileId: string) => void;
}

function fileIcon(name: string) {
  if (name.endsWith(".dat")) return { Icon: Table, color: "text-[#4fc1ff]" };
  if (name.endsWith(".grd")) return { Icon: Layers, color: "text-[#4ec9b0]" };
  if (name.endsWith(".json")) return { Icon: Braces, color: "text-[#d7ba7d]" };
  if (name.endsWith(".yaml") || name.endsWith(".yml"))
    return { Icon: FileCode, color: "text-[#ce9178]" };
  return { Icon: FileText, color: "text-[#9cdcfe]" };
}

function TreeNode({
  node,
  depth,
  fileById,
  expanded,
  onToggle,
  onOpenFile,
  onContextMenu,
}: {
  node: FileTreeNode;
  depth: number;
  fileById: Map<string, ProjectFile>;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onOpenFile: (file: ProjectFile) => void;
  onContextMenu: (e: React.MouseEvent, fileId: string) => void;
}) {
  const pad = { paddingLeft: `${depth * 12 + 8}px` };

  if (node.type === "folder") {
    const isOpen = expanded.has(node.id);
    return (
      <div>
        <button
          type="button"
          style={pad}
          onClick={() => onToggle(node.id)}
          className="w-full flex items-center gap-1 py-1 rounded hover:bg-[#2a2d2e] text-[#cccccc] text-left text-xs border-none bg-transparent cursor-pointer"
        >
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#858585]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#858585]" />
          )}
          <Folder className="h-3.5 w-3.5 shrink-0 text-[#dcb67a]" />
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen &&
          node.children?.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              fileById={fileById}
              expanded={expanded}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
              onContextMenu={onContextMenu}
            />
          ))}
      </div>
    );
  }

  const projectFile = fileById.get(node.id);
  if (!projectFile) return null;
  const { Icon, color } = fileIcon(node.name);

  return (
    <button
      type="button"
      style={pad}
      onClick={() => onOpenFile(projectFile)}
      onContextMenu={(e) => onContextMenu(e, node.id)}
      className="w-full flex items-center gap-2 py-1 rounded hover:bg-[#2a2d2e] text-[#cccccc] hover:text-white text-left text-xs border-none bg-transparent cursor-pointer"
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export function ExplorerTree({ files, onOpenFile, onContextMenu }: ExplorerTreeProps) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  const fileById = useMemo(() => new Map(files.map((f) => [f.id, f])), [files]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const onToggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!tree.length) {
    return (
      <p className="px-4 py-2 text-[10px] text-[#858585]">No files in this folder.</p>
    );
  }

  return (
    <div className="py-0.5">
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          fileById={fileById}
          expanded={expanded}
          onToggle={onToggle}
          onOpenFile={onOpenFile}
          onContextMenu={onContextMenu}
        />
      ))}
    </div>
  );
}
