import type { ProjectFile } from "@/types/project";

export interface FileTreeNode {
  id: string;
  name: string;
  type: "file" | "folder";
  path?: string;
  children?: FileTreeNode[];
}

/** Build a nested folder tree from flat project file entries. */
export function buildFileTree(files: ProjectFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  const sorted = [...files].sort((a, b) => a.id.localeCompare(b.id));

  for (const file of sorted) {
    if (file.type !== "file") continue;
    const parts = file.id.split("/").filter(Boolean);
    if (!parts.length) continue;

    let level = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const nodeId = parts.slice(0, i + 1).join("/");

      let node = level.find((n) => n.id === nodeId);
      if (!node) {
        node = isFile
          ? { id: nodeId, name: part, type: "file", path: file.path }
          : { id: nodeId, name: part, type: "folder", children: [] };
        level.push(node);
      } else if (isFile) {
        node.path = file.path;
      }

      if (!isFile) {
        if (!node.children) node.children = [];
        level = node.children;
      }
    }
  }

  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] =>
    nodes
      .map((n) =>
        n.children ? { ...n, children: sortNodes(n.children) } : n
      )
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });

  return sortNodes(root);
}

/** Relative path inside the picked folder (strips top-level folder name). */
export function relativePathInProject(webkitRelativePath: string): string {
  const slash = webkitRelativePath.indexOf("/");
  return slash >= 0 ? webkitRelativePath.slice(slash + 1) : webkitRelativePath;
}

export function rootFolderName(webkitRelativePath: string): string {
  const slash = webkitRelativePath.indexOf("/");
  return slash >= 0 ? webkitRelativePath.slice(0, slash) : "Opened Folder";
}
