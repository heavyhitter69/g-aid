"use client";

import { clearRegistry } from "@/lib/file-registry";
import { isDesktop } from "@/lib/desktop";
import { useAppStore } from "@/store/app-store";
import type { ProjectFile } from "@/types/project";
import type { WorkspaceIndex } from "@/lib/workspace-index";
import { isTemporaryWorkspaceFile } from "@/lib/workspace-file-ids";
import { writeWindowSession } from "@/lib/window-session";

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
  writeWindowSession({ workspaceRoot: index.root, currentProject: name });
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
  const keep = store.projectFiles.filter(
    (file) => isTemporaryWorkspaceFile(file.id) || isTemporaryWorkspaceFile(file.name)
  );
  const byId = new Map(indexed.map((file) => [file.id, file]));
  for (const extra of keep) {
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

export async function deleteWorkspaceEntry(rel: string): Promise<void> {
  const prefix = sanitizeWorkspaceRelativePath(rel);
  const store = useAppStore.getState();
  const root = store.workspaceRoot;
  if (root && window.gaidDesktop?.deleteWorkspacePath) {
    await window.gaidDesktop.deleteWorkspacePath(root, prefix);
    await refreshWorkspaceIndex();
  } else {
    store.setProjectFiles(
      store.projectFiles.filter((file) => {
        const id = file.id.replace(/\\/g, "/");
        return id !== prefix && !id.startsWith(`${prefix}/`);
      })
    );
  }

  const latest = useAppStore.getState();
  const contents = { ...latest.fileContents };
  for (const key of Object.keys(contents)) {
    const id = key.replace(/\\/g, "/");
    if (id === prefix || id.startsWith(`${prefix}/`)) delete contents[key];
  }
  const tabs = [...latest.workbenchTabs];
  for (const tab of tabs) {
    if (tab.type !== "file") continue;
    const fileId = tab.id.replace(/^file:/, "").replace(/\\/g, "/");
    if (fileId === prefix || fileId.startsWith(`${prefix}/`)) {
      latest.closeWorkbenchTab(tab.id);
    }
  }
  const job = latest.lastJobResults;
  if (job) {
    const jobFolder = job.productsRel.replace(/\\/g, "/");
    const removedJob = jobFolder === prefix || jobFolder.startsWith(`${prefix}/`);
    if (removedJob) {
      latest.closeWorkbenchTab("visualization");
      useAppStore.setState({ lastJobResults: null });
    } else if (prefix.startsWith(`${jobFolder}/`)) {
      const files = job.files.filter((file: string) => {
        const id = file.replace(/\\/g, "/");
        return id !== prefix && !id.startsWith(`${prefix}/`);
      });
      useAppStore.setState({ lastJobResults: { ...job, files } });
    }
  }
  useAppStore.setState({ fileContents: contents });
}

function posixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function remapId(id: string, fromPrefix: string, toPrefix: string): string {
  const n = posixPath(id);
  if (n === fromPrefix) return toPrefix;
  if (n.startsWith(`${fromPrefix}/`)) return `${toPrefix}${n.slice(fromPrefix.length)}`;
  return id;
}

export function remapWorkspacePaths(fromPrefix: string, toPrefix: string): void {
  const from = posixPath(fromPrefix);
  const to = posixPath(toPrefix);
  if (!from || from === to) return;
  const state = useAppStore.getState();
  const fileContents: Record<string, string> = {};
  for (const [key, value] of Object.entries(state.fileContents)) {
    fileContents[remapId(key, from, to)] = value;
  }
  const workbenchTabs = state.workbenchTabs.map((tab) => {
    if (tab.type !== "file") return tab;
    const old = tab.id.replace(/^file:/, "");
    const next = remapId(old, from, to);
    if (next === old) return tab;
    return { ...tab, id: `file:${next}`, title: next.split("/").pop() || tab.title };
  });
  let activeFile = state.activeFile;
  if (activeFile) activeFile = remapId(activeFile, from, to);
  let activeWorkbenchTabId = state.activeWorkbenchTabId;
  if (activeWorkbenchTabId?.startsWith("file:")) {
    activeWorkbenchTabId = `file:${remapId(activeWorkbenchTabId.replace(/^file:/, ""), from, to)}`;
  }
  let lastJobResults = state.lastJobResults;
  if (lastJobResults) {
    lastJobResults = {
      ...lastJobResults,
      productsRel: remapId(lastJobResults.productsRel, from, to),
      files: lastJobResults.files.map((file: string) => remapId(file, from, to)),
      activeLayerId: lastJobResults.activeLayerId
        ? remapId(lastJobResults.activeLayerId, from, to)
        : undefined,
    };
  }
  useAppStore.setState({
    fileContents,
    workbenchTabs,
    activeFile,
    activeWorkbenchTabId,
    lastJobResults,
  });
}

export async function moveWorkspaceEntry(fromRel: string, destFolderRel: string): Promise<string> {
  const from = sanitizeWorkspaceRelativePath(fromRel);
  const dest = destFolderRel ? sanitizeWorkspaceRelativePath(destFolderRel) : "";
  const store = useAppStore.getState();
  const root = store.workspaceRoot;
  if (!root || !window.gaidDesktop?.moveWorkspacePath) {
    throw new Error("Open a folder on disk first");
  }
  const next = await window.gaidDesktop.moveWorkspacePath(root, from, dest);
  remapWorkspacePaths(from, next);
  await refreshWorkspaceIndex();
  return next;
}

export async function copyWorkspaceEntry(fromRel: string, destFolderRel: string): Promise<string> {
  const from = sanitizeWorkspaceRelativePath(fromRel);
  const dest = destFolderRel ? sanitizeWorkspaceRelativePath(destFolderRel) : "";
  const store = useAppStore.getState();
  const root = store.workspaceRoot;
  if (!root || !window.gaidDesktop?.copyWorkspacePath) {
    throw new Error("Open a folder on disk first");
  }
  const next = await window.gaidDesktop.copyWorkspacePath(root, from, dest);
  await refreshWorkspaceIndex();
  return next;
}

export async function renameWorkspaceEntry(fromRel: string, newName: string): Promise<string> {
  const from = sanitizeWorkspaceRelativePath(fromRel);
  const store = useAppStore.getState();
  const root = store.workspaceRoot;
  if (!root || !window.gaidDesktop?.renameWorkspacePath) {
    throw new Error("Open a folder on disk first");
  }
  const next = await window.gaidDesktop.renameWorkspacePath(root, from, newName.trim());
  remapWorkspacePaths(from, next);
  await refreshWorkspaceIndex();
  return next;
}

export async function cloneGitRepoAndOpen(url: string): Promise<boolean> {
  const desktop = window.gaidDesktop;
  if (!desktop?.cloneGitRepo || !desktop.pickFolder) {
    throw new Error("Clone is available in the G-AID desktop app");
  }
  const destParent = await desktop.pickFolder({ title: "Choose a folder to clone into" });
  if (!destParent) return false;
  const cloned = await desktop.cloneGitRepo(url, destParent);
  return openWorkspaceAt(cloned);
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
