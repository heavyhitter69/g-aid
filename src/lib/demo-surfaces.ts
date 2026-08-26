/**
 * Surfaces that are not part of the live survey workflow.
 * Phase 1 keeps them unreachable from activity-bar / Proceed / File → Open Folder.
 */

export const ACTIVITY_BAR_VIEWS = [
  "dashboard",
  "search",
  "source-control",
  "extensions",
  "profile",
  "settings",
] as const;

export const NORMAL_WORKFLOW_VIEWS = [
  ...ACTIVITY_BAR_VIEWS,
  "visualization",
  "file-editor",
  "datasets",
  "reports",
  "review-changes",
  "hypotheses",
  "workflow",
] as const;

export const DEMO_ONLY_SURFACES = [
  "ai-center",
  "seeded-ert-plotly",
  "fake-upload-progress",
  "mock-drill-targets",
  "fake-ai-confidence",
] as const;

export type DemoOnlySurface = (typeof DEMO_ONLY_SURFACES)[number];

export function isDemoOnlySurface(id: string): boolean {
  return (DEMO_ONLY_SURFACES as readonly string[]).includes(id);
}

export function isNormalWorkflowView(id: string): boolean {
  return (NORMAL_WORKFLOW_VIEWS as readonly string[]).includes(id);
}
