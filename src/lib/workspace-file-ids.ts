export const TEMP_PLAN_ID = "Implementation Plan.md";
export const TEMP_TASKS_ID = "tasks.md";

const TEMP_NAMES = new Set([TEMP_PLAN_ID, TEMP_TASKS_ID, "Implementation Plan"]);

export function isTemporaryWorkspaceFile(idOrName: string): boolean {
  const base = idOrName.replace(/\\/g, "/").split("/").pop() || idOrName;
  return TEMP_NAMES.has(idOrName) || TEMP_NAMES.has(base);
}
