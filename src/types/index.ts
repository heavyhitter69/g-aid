export type UserRole = "student" | "researcher" | "consultant" | "exploration";

export type DisciplineId =
  | "exploration"
  | "environmental"
  | "seismology"
  | "hydrogeophysics"
  | "data-analysis"
  | "geotechnical";

export interface Discipline {
  id: DisciplineId;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  color: string;
  datasets: string[];
  workflows: string[];
}

export interface AgentProfile {
  id: string;
  name: string;
  discipline: DisciplineId;
  capabilities: string[];
  workflows: string[];
  datasets: string[];
  tools: string[];
}

export interface UserProfile {
  fullName: string;
  institution: string;
  email: string;
  role: UserRole;
  /** Set after onboarding discipline selection */
  discipline: DisciplineId | null;
}

export type OnboardingStep =
  | "welcome"
  | "discipline"
  | "agent"
  | "workspace-init"
  | "complete";

export type WorkspaceView =
  | "dashboard"
  | "workflow"
  | "visualization"
  | "ai-center"
  | "datasets"
  | "settings"
  | "reports"
  | "file-editor";

export interface AIInsight {
  id: string;
  title: string;
  confidence: number;
  severity: "info" | "warning" | "critical";
  summary: string;
  recommendation: string;
}
