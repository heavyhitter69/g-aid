export type UserRole = "student" | "researcher" | "consultant" | "exploration";

export type DisciplineId =
  | "exploration"
  | "environmental"
  | "seismology"
  | "hydrogeophysics"
  | "data-analysis"
  | "geotechnical"
  | "geomatics";

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
  | "file-editor"
  | "hypotheses"
  | "plan-review";

// Re-export all scientific types for convenience
export type {
  AgentDomain,
  AgentId,
  ActorId,
  DataModality,
  HypothesisEpistemicType,
  ScientificEventType,
  ScientificEvent,
  GeoDataset,
  DataQualityMetrics,
  ConfidenceProvenance,
  HypothesisNode,
  EpistemicBranch,
  ScientificTool,
  ToolExecutionRecord,
  AgentCapability,
  StateOpportunity,
  ExecutionDAG,
  DAGNode,
  DAGNodeStatus,
  InferenceRule,
  GeologicalEntity,
  SpatialCompatibilityReport,
  AgentContext,
  InterpretationEntry,
  ScientificProjectSnapshot,
  StreamPreamble,
  ActivityEntry,
  HypothesisNodeViewModel,
  DatasetCardViewModel,
  OpportunityChipViewModel,
  DAGViewModel,
} from "./scientific";

export interface AIInsight {
  id: string;
  title: string;
  confidence: number;
  severity: "info" | "warning" | "critical";
  summary: string;
  recommendation: string;
}
