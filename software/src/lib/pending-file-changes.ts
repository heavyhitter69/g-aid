import { countLineDiff } from "@/lib/line-diff";
import { deleteWorkspaceEntry, refreshWorkspaceIndex } from "@/lib/open-workspace";
import { isTemporaryWorkspaceFile } from "@/lib/workspace-file-ids";
import { useAppStore, type PendingFileChange } from "@/store/app-store";

export const REVIEW_TAB_ID = "review-changes";

export function buildPendingChange(input: {
  id: string;
  name?: string;
  path?: string;
  previousContent: string;
  content: string;
  existed: boolean;
}): PendingFileChange {
  const content = input.content ?? "";
  const previousContent = input.existed ? input.previousContent : "";
  const { additions, deletions } = countLineDiff(previousContent, content);
  return {
    id: input.id,
    name: input.name || input.id.replace(/\\/g, "/").split("/").pop() || input.id,
    path: (input.path || input.id).replace(/\\/g, "/"),
    kind: input.existed ? "edited" : "created",
    previousContent,
    content,
    additions: input.existed ? additions : Math.max(additions, content ? content.split(/\r?\n/).length : 1),
    deletions: input.existed ? deletions : 0,
  };
}

async function writeToDisk(rel: string, content: string): Promise<string | void> {
  const root = useAppStore.getState().workspaceRoot;
  if (!root || !window.gaidDesktop) return;
  if (window.gaidDesktop.saveWorkspaceFile) {
    const written = await window.gaidDesktop.saveWorkspaceFile(root, rel, content);
    return written;
  }
  try {
    await window.gaidDesktop.createWorkspaceFile(root, rel, content);
    return rel;
  } catch {
    /* file already exists; keep in-memory content */
  }
}

function closeReviewIfEmpty(): void {
  const state = useAppStore.getState();
  if (state.pendingFileChanges.length > 0) return;
  if (state.workbenchTabs.some((tab) => tab.id === REVIEW_TAB_ID)) {
    state.closeWorkbenchTab(REVIEW_TAB_ID);
  }
}

export async function keepPendingFile(id: string): Promise<void> {
  const change = useAppStore.getState().pendingFileChanges.find((item) => item.id === id);
  if (!change || isTemporaryWorkspaceFile(change.id)) {
    useAppStore.getState().removePendingFileChange(id);
    closeReviewIfEmpty();
    return;
  }
  if (change.kind === "created" && change.content) {
    const written = await writeToDisk(change.id, change.content);
    if (written && written !== change.id) {
      useAppStore.getState().setFileContent(written, change.content);
    }
  } else if (change.kind === "edited") {
    const written = await writeToDisk(change.id, change.content);
    if (written && written !== change.id) {
      useAppStore.getState().setFileContent(written, change.content);
    }
  }
  useAppStore.getState().removePendingFileChange(id);
  closeReviewIfEmpty();
}

export async function undoPendingFile(id: string): Promise<void> {
  const state = useAppStore.getState();
  const change = state.pendingFileChanges.find((item) => item.id === id);
  if (!change) return;

  if (change.kind === "created") {
    try {
      await deleteWorkspaceEntry(change.id);
    } catch {
      const latest = useAppStore.getState();
      latest.setProjectFiles(latest.projectFiles.filter((file) => file.id !== change.id));
      const contents = { ...latest.fileContents };
      delete contents[change.id];
      useAppStore.setState({ fileContents: contents });
    }
  } else {
    state.setFileContent(change.id, change.previousContent);
    await writeToDisk(change.id, change.previousContent);
  }

  useAppStore.getState().removePendingFileChange(id);
  closeReviewIfEmpty();
}

export async function keepAllPendingFiles(): Promise<void> {
  const ids = useAppStore.getState().pendingFileChanges.map((item) => item.id);
  for (const id of ids) await keepPendingFile(id);
  await refreshWorkspaceIndex().catch(() => undefined);
}

export async function undoAllPendingFiles(): Promise<void> {
  const ids = useAppStore.getState().pendingFileChanges.map((item) => item.id);
  for (const id of ids) await undoPendingFile(id);
  await refreshWorkspaceIndex().catch(() => undefined);
}

export function openPendingChangesReview(): void {
  const count = useAppStore.getState().pendingFileChanges.length;
  if (count === 0) return;
  useAppStore.getState().openWorkbenchTab(REVIEW_TAB_ID, "view", "Pending Changes");
}
