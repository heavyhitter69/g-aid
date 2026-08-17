"use client";

import { useAppStore } from "@/store/app-store";
import { isTemporaryWorkspaceFile, TEMP_PLAN_ID, TEMP_TASKS_ID } from "@/lib/workspace-file-ids";

export { TEMP_PLAN_ID, TEMP_TASKS_ID };

export interface WorkspaceFileUpdate {
  id: string;
  name?: string;
  type?: "file" | "folder";
  path?: string;
  content?: string;
  open?: boolean;
  temporary?: boolean;
}

/** Upsert a temporary workspace file (plan/tasks) or an output artifact into the explorer. */
export function applyWorkspaceFileUpdates(updates: WorkspaceFileUpdate[]): void {
  if (!updates.length) return;
  const state = useAppStore.getState();
  const files = [...state.projectFiles];
  for (const update of updates) {
    const temporary =
      Boolean(update.temporary) ||
      isTemporaryWorkspaceFile(update.id) ||
      isTemporaryWorkspaceFile(update.name || "");
    if (typeof update.content === "string") {
      state.setFileContent(update.id, update.content);
    }
    if (update.open) {
      state.openWorkbenchTab(
        `file:${update.id}`,
        "file",
        update.name || update.id
      );
    }
    if (temporary) {
      const idx = files.findIndex((file) => file.id === update.id);
      if (idx >= 0) files.splice(idx, 1);
      continue;
    }
    if (!files.some((file) => file.id === update.id)) {
      files.push({
        id: update.id,
        name: update.name || update.id.split("/").pop() || update.id,
        type: update.type || "file",
        path: update.path || update.id,
      });
    }
  }
  state.setProjectFiles(
    files.filter((file) => !isTemporaryWorkspaceFile(file.id) && !isTemporaryWorkspaceFile(file.name))
  );
}
