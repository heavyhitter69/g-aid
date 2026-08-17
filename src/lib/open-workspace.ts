"use client";

import { clearRegistry } from "@/lib/file-registry";
import { isDesktop } from "@/lib/desktop";
import { useAppStore } from "@/store/app-store";
import type { ProjectFile } from "@/types/project";
import type { WorkspaceIndex } from "@/lib/workspace-index";
import { isTemporaryWorkspaceFile } from "@/lib/workspace-file-ids";

function folderNameFromRoot(root: string): string {
  const trimmed = root.replace(/[\\/]+$/, "");
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || "Survey";
}

export function indexToProjectFiles(index: WorkspaceIndex): ProjectFile[] {
  const folders: ProjectFile[] = (index.folders || []).map((rel) => ({
    id: rel,
    name: rel.split("/").pop() || rel,
    type: "folder",
    path: rel,
  }));
  const files: ProjectFile[] = index.files
    .filter(
      (file) =>
        !isTemporaryWorkspaceFile(file.relativePath) &&
        !isTemporaryWorkspaceFile(file.name)
    )
    .map((file) => ({
      id: file.relativePath,
      name: file.name,
      type: "file" as const,
      path: file.relativePath,
    }));
  return [...folders, ...files];
}

export function applyWorkspaceIndex(index: WorkspaceIndex): void {
  const files = indexToProjectFiles(index);
  const name = folderNameFromRoot(index.root);
  const store = useAppStore.getState();
  clearRegistry();
  store.setWorkspaceRoot(index.root, index);
  store.setCurrentProject(name, index.root, files.filter((f) => f.type === "file").length);
  store.setProjectFiles(files);
  useAppStore.setState({
    workbenchTabs: [],
    fileContents: {},
    activeFile: null,
    activeWorkbenchTabId: null,
    workspaceView: "dashboard",
  });
}

/** Re-index the open folder without closing tabs or wiping file contents. */
export async function refreshWorkspaceIndex(): Promise<boolean> {
  const store = useAppStore.getState();
  const root = store.workspaceRoot;
  if (!root || !window.gaidDesktop?.indexWorkspace) return false;
  const index = await window.gaidDesktop.indexWorkspace(root);
  const indexed = indexToProjectFiles(index);
  const extras = store.projectFiles.filter((file) => {
    if (isTemporaryWorkspaceFile(file.id) || isTemporaryWorkspaceFile(file.name)) return false;
    const p = (file.path || file.id).replace(/\\/g, "/").toLowerCase();
    return p.startsWith("g-aid output/") || p.includes("/g-aid output/");
  });
  const byId = new Map(indexed.map((file) => [file.id, file]));
  for (const extra of extras) {
    if (!byId.has(extra.id)) byId.set(extra.id, extra);
  }
  const merged = [...byId.values()];
  store.setWorkspaceRoot(index.root, index);
  store.setCurrentProject(
    folderNameFromRoot(index.root),
    index.root,
    merged.filter((f) => f.type === "file").length
  );
  store.setProjectFiles(merged);
  return true;
}

export function sanitizeWorkspaceRelativePath(name: string): string {
  const cleaned = name.replace(/\\/g, "/").replace(/^\/+/, "").trim();
  const parts = cleaned.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Enter a name inside the open folder");
  }
  const joined = parts.join("/");
  if (isTemporaryWorkspaceFile(joined) || isTemporaryWorkspaceFile(parts[parts.length - 1])) {
    throw new Error("That name is reserved");
  }
  return joined;
}

export async function createWorkspaceEntry(
  kind: "file" | "folder",
  name: string
): Promise<string> {
  const rel = sanitizeWorkspaceRelativePath(name);
  const store = useAppStore.getState();
  const root = store.workspaceRoot;
  if (root && window.gaidDesktop?.createWorkspaceFile && window.gaidDesktop.createWorkspaceFolder) {
    if (kind === "file") {
      await window.gaidDesktop.createWorkspaceFile(root, rel, "");
    } else {
      await window.gaidDesktop.createWorkspaceFolder(root, rel);
    }
    await refreshWorkspaceIndex();
    if (kind === "file") {
      store.setFileContent(rel, "");
      store.openWorkbenchTab(`file:${rel}`, "file", rel.split("/").pop() || rel);
    }
    return rel;
  }
  if (kind === "file") {
    const files = store.projectFiles.filter((file) => file.id !== rel);
    files.push({
      id: rel,
      name: rel.split("/").pop() || rel,
      type: "file",
      path: rel,
    });
    store.setProjectFiles(files);
    store.setFileContent(rel, "");
    store.openWorkbenchTab(`file:${rel}`, "file", rel.split("/").pop() || rel);
  } else if (!store.projectFiles.some((file) => file.id === rel)) {
    store.setProjectFiles([
      ...store.projectFiles,
      { id: rel, name: rel.split("/").pop() || rel, type: "folder", path: rel },
    ]);
  }
  return rel;
}

export async function openWorkspaceAt(root: string): Promise<boolean> {
  if (!window.gaidDesktop?.indexWorkspace) return false;
  const index = await window.gaidDesktop.indexWorkspace(root);
  applyWorkspaceIndex(index);
  return true;
}

export async function openWorkspaceFolder(): Promise<boolean> {
  if (isDesktop() && window.gaidDesktop?.pickFolder) {
    const root = await window.gaidDesktop.pickFolder();
    if (!root) return false;
    return openWorkspaceAt(root);
  }
  document.getElementById("native-folder-picker")?.click();
  return false;
}
