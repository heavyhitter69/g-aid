/**
 * scientific.ts
 * Core domain type system for the AI-Native Geoscientific Operating System.
 * Primary abstraction: scientific state transition — NOT agents, NOT conversations.
 *
 * All agents, UI, reasoning, and workflows are interfaces to this state.
 */

// ─── Agent Identity ──────────────────────────────────────────────────────────

export type AgentDomain =
  | "magnetic"
  | "resistivity"
  | "gravity"
  | "seismic"
  | "geological"
  | "workflow"
  | "orchestrator"
  | "spatial";

export type AgentId =
  | "magnetic-agent"
  | "resistivity-agent"
  | "gravity-agent"
  | "seismic-agent"
  | "geological-agent"
  | "workflow-agent"
  | "orchestrator-agent";

export type ActorId = AgentId | "system" | "human";

// ─── Data Modalities ─────────────────────────────────────────────────────────

export type DataModality =
  | "magnetic"
  | "resistivity"
  | "gravity"
  | "seismic"
  | "well-log"
  | "geochemical"
  | "dem"
  | "remote-sensing";

// ─── Epistemic Types ─────────────────────────────────────────────────────────

export type HypothesisEpistemicType =
  | "observation"           // directly measured / detected
  | "interpretation"        // inferred from observations
  | "geological_model"      // structural or lithological model
  | "processing_assumption" // assumed for a computation (e.g. RTP latitude)
  | "uncertainty_warning"   // confidence constraint or data gap flag
  | "recommendation";       // suggested next action

// ─── Event Sourcing ──────────────────────────────────────────────────────────

export type ScientificEventType =
  | "DATASET_INGESTED"
  | "DATASET_CLASSIFIED"
  | "HYPOTHESIS_CREATED"
  | "HYPOTHESIS_UPDATED"
  | "HYPOTHESIS_LINKED"           // graph edge created between two nodes
  | "HYPOTHESIS_SUPERSEDED"
  | "EPISTEMIC_BRANCH_CREATED"
  | "EPISTEMIC_BRANCH_UPDATED"
  | "TOOL_INVOKED"
  | "TOOL_COMPLETED"
  | "TOOL_FAILED"
  | "DAG_CREATED"
  | "DAG_NODE_STARTED"
  | "DAG_NODE_COMPLETED"
  | "DAG_NODE_INVALIDATED"
  | "DAG_NODE_BLOCKED"
  | "DAG_APPROVED"
  | "INTERPRETATION_ADDED"
  | "SPATIAL_OVERLAP_DETECTED"
  | "OPPORTUNITY_DETECTED"
  | "OPPORTUNITY_DISMISSED"
  | "HUMAN_REVIEW_REQUESTED"
  | "HUMAN_APPROVED"
  | "KERNEL_RULES_MATCHED"
  | "AGENT_CONTEXT_SNAPSHOT"
  | "CONFIDENCE_UPDATED";

export interface ScientificEvent<T = unknown> {
  id: string;
  sequenceNumber: number;          // monotonically increasing — ordering guarantee
  type: ScientificEventType;
  actorId: ActorId;
  timestamp: string;               // ISO 8601
  sessionId: string;               // conversation / session that produced this event
  payload: T;
  causationEventId: string | null; // which prior event triggered this
  correlationId: string;           // groups related events within one agent turn
}

// ─── Bounding Box ────────────────────────────────────────────────────────────

export interface BoundingBox {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

export interface GeoPoint {
  lon: number;
  lat: number;
  elevationM?: number;
}

// ─── Dataset Ontology ────────────────────────────────────────────────────────

export interface DataQualityMetrics {
  signalToNoise: number | null;       // dB
  coveragePercent: number | null;     // 0–100
  tieLineRMSE: number | null;         // physical units (nT, mGal, etc.)
  samplingUniformity: number | null;  // 0–1, 1 = perfectly uniform
  knownArtifacts: string[];           // e.g. "cultural noise at station 220E"
}

export interface DatasetLineageEntry {
  step: string;                // e.g. "RTP filter applied"
  toolId: string | null;
  toolExecutionId: string | null;
  timestamp: string;
  actorId: ActorId;
}

export interface GeoDataset {
  id: string;
  name: string;
  modality: DataModality;
  acquisitionMethod: string;
  crs: string;                         // EPSG code, e.g. "EPSG:4326"
  units: string;                       // e.g. "nT", "mGal", "Ohm.m"
  spatialExtent: BoundingBox;
  samplingDensity: number | null;      // metres — line spacing
  qualityMetrics: DataQualityMetrics;
  lineage: DatasetLineageEntry[];      // full provenance chain
  inferredSurveyType: string | null;   // e.g. "airborne regional mag"
  spatialIndexId: string | null;       // reference to SpatialEngine entry
  uploadedAt: string;
  fileSize: number | null;             // bytes
  fileExtension: string;
}

// ─── Confidence Provenance ───────────────────────────────────────────────────

export interface ConfidenceProvenance {
  dataQualityScore: number | null;        // derived from SNR
  crossMethodAgreement: number | null;    // multi-dataset spatial agreement
  modelConvergence: number | null;        // inversion RMSE normalised
  geologicalConsistency: number | null;   // ontology rule satisfaction score
  spatialCoverage: number | null;         // coverage of area of interest
  spatialCompatibility: number | null;    // from SpatialCompatibilityReport
  linespacing: number | null;             // normalised (tighter = better)
  derivedConfidence: number;              // deterministic composite (0–1)
  computedAt: string;
  computedByKernel: string;              // which kernel produced this
}

// ─── Hypothesis Graph ────────────────────────────────────────────────────────

export interface EvidenceLink {
  datasetId: string;
  description: string;
  weight: number;  // 0–1
}

export interface HypothesisRevision {
  revisedAt: string;
  previousConfidence: number;
  newConfidence: number;
  reason: string;
  triggeredByEventId: string;
}

export interface HypothesisNode {
  id: string;
  statement: string;
  epistemicType: HypothesisEpistemicType;
  confidence: number;                        // 0–1, provenance-derived ONLY
  confidenceProvenance: ConfidenceProvenance;
  evidence: EvidenceLink[];
  contradictions: EvidenceLink[];
  parentIds: string[];                       // supports graph hierarchy
  childIds: string[];
  epistemicBranchId: string | null;          // which competing model this belongs to
  agentId: AgentId | "human";
  datasetIds: string[];
  ontologyEntityIds: string[];               // geological entities this relates to
  createdAt: string;
  revisedAt: string;
  revisionHistory: HypothesisRevision[];
  status: "active" | "superseded" | "confirmed" | "rejected";
}

// ─── Epistemic Branches (competing models) ───────────────────────────────────

export interface EpistemicBranch {
  id: string;
  name: string;                      // e.g. "Model A — Mafic Intrusion"
  description: string;
  rootHypothesisIds: string[];
  supportingDatasetIds: string[];
  derivedDAGId: string | null;       // each branch can have its own DAG
  overallConfidence: number;         // aggregate of branch hypotheses
  createdBy: AgentId | "human";
  createdAt: string;
  status: "active" | "favoured" | "disfavoured" | "eliminated";
}

// ─── Scientific Tool Contracts ───────────────────────────────────────────────

export interface ToolParameterSchema {
  type: "number" | "string" | "boolean" | "array" | "object";
  required: boolean;
  description: string;
  defaultValue?: unknown;
  units?: string;
}

export interface ToolOutputSchema {
  type: "number" | "string" | "array" | "object" | "grid" | "section";
  description: string;
  units?: string;
}

export interface ScientificTool {
  id: string;
  name: string;
  version: string;
  domain: AgentDomain;
  description: string;
  inputs: Record<string, ToolParameterSchema>;
  outputs: Record<string, ToolOutputSchema>;
  deterministic: boolean;
  uncertaintyModel: "none" | "monte-carlo" | "bayesian" | "parametric";
  simulatable: boolean;
  phaseAvailable: 1 | 2 | 3;         // which platform phase enables real execution
}

export interface ToolExecutionRecord {
  id: string;
  toolId: string;
  toolVersion: string;
  inputs: Record<string, unknown>;
  inputChecksum: string;              // SHA-256 of canonical inputs JSON
  executionHash: string;             // toolId + version + inputChecksum
  reproducibilitySignature: string;  // deterministic: same inputs → same result
  outputs: Record<string, unknown> | null;
  status: "pending" | "running" | "complete" | "failed";
  startedAt: string;
  completedAt: string | null;
  agentId: AgentId;
  simulationMode: boolean;
  errorMessage: string | null;
}

// ─── Capability Graph ────────────────────────────────────────────────────────

export type OpportunityCondition =
  | "datasets_overlap"
  | "modality_combination"
  | "hypothesis_contradiction"
  | "confidence_below_threshold"
  | "dag_node_invalidated"
  | "missing_complementary_dataset"
  | "high_uncertainty_hypothesis";

export interface StateOpportunityTrigger {
  condition: OpportunityCondition;
  threshold?: number;
  requiredModalities?: DataModality[];
  description: string;
}

export interface AgentCapability {
  id: string;
  description: string;
  requiredTools: string[];
  requiredAgents: AgentId[];
  inputModalities: DataModality[];
  stateOpportunityTriggers: StateOpportunityTrigger[];
  estimatedDurationMs: number;       // for UI planning estimates
}

// ─── Proactive Opportunities ─────────────────────────────────────────────────

export interface StateOpportunity {
  id: string;
  title: string;
  description: string;
  triggeredBy: StateOpportunityTrigger;
  requiredCapabilityIds: string[];
  datasetIds: string[];
  confidence: number;
  dismissed: boolean;
  createdAt: string;
}

// ─── Execution DAG ───────────────────────────────────────────────────────────

export type DAGNodeStatus =
  | "pending"
  | "running"
  | "complete"
  | "failed"
  | "skipped"
  | "invalidated"             // upstream dependency changed → must recompute
  | "superseded"             // replaced by a revised step
  | "recompute-required"     // result exists but inputs changed
  | "blocked"                // missing prerequisite data
  | "awaiting-human-review"; // human checkpoint before proceeding

export interface DAGEdge {
  from: string;  // DAGNode id
  to: string;    // DAGNode id
  label?: string;
}

export interface DAGConditional {
  nodeId: string;
  condition: string;
  truePath: string;   // DAGNode id
  falsePath: string;  // DAGNode id
}

export interface DAGNode {
  id: string;
  label: string;
  description: string;
  agentId: AgentId | null;
  toolIds: string[];
  status: DAGNodeStatus;
  invalidationReason: string | null;
  conditional: DAGConditional | null;
  inputs: string[];              // dataset ids consumed
  outputs: string[];             // dataset ids produced
  toolExecutionIds: string[];    // ToolExecutionRecord ids
  humanReviewNote: string | null;
  estimatedDurationMs: number;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ExecutionDAG {
  id: string;
  nodes: DAGNode[];
  edges: DAGEdge[];
  status: "draft" | "approved" | "running" | "complete" | "failed" | "partially-invalid";
  generatedFromCapabilities: string[];   // capability ids that produced this DAG
  epistemicBranchId: string | null;      // which branch this DAG serves
  createdAt: string;
  approvedAt: string | null;
  approvedBy: ActorId | null;
  markdownRepresentation: string;        // always kept in sync with machine layer
}

// ─── Inference Rules ─────────────────────────────────────────────────────────

export type RuleConditionType =
  | "anomaly_shape"
  | "anomaly_polarity"
  | "coincident_anomaly"
  | "gradient_character"
  | "remanence_flag"
  | "cultural_noise_probability"
  | "dataset_present"
  | "dataset_quality"
  | "hypothesis_exists"
  | "spatial_relationship"
  | "acquisition_method"
  | "depth_estimate"
  | "amplitude_range";

export interface RuleCondition {
  type: RuleConditionType;
  value: string | number | boolean;
  modality?: DataModality;
  threshold?: number;
  operator?: "eq" | "gt" | "lt" | "gte" | "lte" | "contains";
}

export interface RuleConclusion {
  geologicalEntityId: string;           // ontology entity id
  hypothesisStatement: string;          // template — may use {{variable}} placeholders
  confidenceModifier: number;           // +/- applied to base provenance confidence
  epistemicType: HypothesisEpistemicType;
  additionalRecommendations?: string[];
}

export interface InferenceRule {
  id: string;
  domain: AgentDomain;
  name: string;
  description: string;
  conditions: RuleCondition[];          // ANDed together
  exclusions: RuleCondition[];          // UNLESS conditions — any match voids rule
  conclusion: RuleConclusion;
  priority: number;                     // higher = evaluated first
  version: string;
}

export interface RuleMatchResult {
  rule: InferenceRule;
  matchedConditions: RuleCondition[];
  excludedBy: RuleCondition | null;
  score: number;                        // 0–1, how strongly conditions matched
}

// ─── Geological Ontology ─────────────────────────────────────────────────────

export type GeologicalCategory =
  | "structure"
  | "lithology"
  | "process"
  | "anomaly"
  | "property"
  | "fluid"
  | "economic";

export interface GeophysicalSignature {
  modality: DataModality;
  expectedResponse: "high" | "low" | "variable" | "none" | "contrast";
  shapePrediction: "circular" | "elongated" | "irregular" | "layered" | "point" | "linear";
  amplitudeQualifier: "strong" | "moderate" | "weak" | "variable";
  notes: string;
}

export interface OntologyRelationship {
  targetEntityId: string;
  relationshipType: "may_cause" | "often_associated" | "contradicts" | "requires" | "modifies";
  confidence: number;
  notes: string;
}

export interface GeologicalEntity {
  id: string;
  name: string;
  aliases: string[];
  category: GeologicalCategory;
  description: string;
  geophysicalSignatures: GeophysicalSignature[];
  relationships: OntologyRelationship[];
  depthRange: { minM: number; maxM: number } | null;
  scaleRange: { minKm: number; maxKm: number } | null;
}

// ─── Spatial Engine ──────────────────────────────────────────────────────────

export interface SpatialWarning {
  type: "resolution_mismatch" | "crs_distortion" | "epoch_delta" | "interpolation_method" | "coverage_gap";
  severity: "low" | "medium" | "high";
  description: string;
}

export interface SpatialCompatibilityReport {
  datasetPairIds: [string, string];
  overlapAreaKm2: number;
  resolutionCompatibility: number;        // 0–1 (1 = identical resolution)
  acquisitionEpochDeltaYears: number;
  crsDistortionScore: number;             // 0–1 (1 = no distortion difference)
  interpolationMethodMatch: boolean;
  overallCompatibilityScore: number;      // weighted composite
  warnings: SpatialWarning[];
  recommendation: "safe" | "caution" | "incompatible";
}

export interface SpatialIndexSummary {
  registeredDatasets: number;
  overlapPairs: Array<{ datasetIds: [string, string]; overlapAreaKm2: number }>;
  crsSet: string[];                       // all CRS codes present
  dominantCRS: string | null;
  totalCoverageAreaKm2: number;
  compatibilityIssues: SpatialCompatibilityReport[];
}

// ─── Context Engine ──────────────────────────────────────────────────────────

export interface AgentContext {
  agentId: AgentId;
  tokenEstimate: number;
  datasetSummary: string;
  relevantHypotheses: string;             // top-5 ranked by salience
  recentCausalChain: string;             // last 10 causally-linked events
  activeOpportunities: string;
  spatialSummary: string;
  matchedRules: string;                  // rules that triggered for this query
  generatedAt: string;
}

// ─── Interpretation Entries ──────────────────────────────────────────────────

export interface InterpretationEntry {
  id: string;
  agentId: AgentId | "human";
  content: string;                        // structured markdown
  datasetIds: string[];
  hypothesisIds: string[];
  confidence: number;
  confidenceProvenance: ConfidenceProvenance;
  toolsUsed: string[];
  createdAt: string;
  epistemicBranchId: string | null;
}

// ─── Scientific Project Snapshot (derived — never mutated directly) ──────────

export interface ScientificProjectSnapshot {
  projectId: string;
  snapshotSequenceNumber: number;         // matches latest event sequence number
  datasets: GeoDataset[];
  hypothesisGraph: HypothesisNode[];
  epistemicBranches: EpistemicBranch[];
  executionDAG: ExecutionDAG | null;
  toolExecutions: ToolExecutionRecord[];
  opportunities: StateOpportunity[];
  interpretations: InterpretationEntry[];
  spatialIndexSummary: SpatialIndexSummary;
  lastModified: string;
}

// ─── Stream Protocol ─────────────────────────────────────────────────────────

export interface StreamPreamble {
  type: "preamble";
  agentId: AgentId;
  confidence: number;
  confidenceProvenance: ConfidenceProvenance;
  toolsInvoked: string[];
  capabilityTrace: string[];
  rulesMatched: string[];
  hypothesesUpdated: string[];
  epistemicTypesProduced: HypothesisEpistemicType[];
}

export interface ActivityEntry {
  id: string;
  actorId: ActorId;
  description: string;
  status: "running" | "complete" | "failed";
  startedAt: string;
  completedAt?: string | null;
  relatedToolId: string | null;
}

// ─── View Models (UI-facing, flat shapes) ────────────────────────────────────

export interface HypothesisNodeViewModel {
  id: string;
  statement: string;
  epistemicType: HypothesisEpistemicType;
  confidence: number;
  status: HypothesisNode["status"];
  parentIds: string[];
  childIds: string[];
  epistemicBranchId: string | null;
  evidenceCount: number;
  contradictionCount: number;
  agentLabel: string;
  tooltipProvenance: string;             // formatted provenance for tooltip
}

export interface DatasetCardViewModel {
  id: string;
  name: string;
  modality: DataModality;
  crs: string;
  units: string;
  qualityLabel: "good" | "moderate" | "poor" | "unknown";
  overlappingDatasetNames: string[];
  lineageSteps: number;
  opportunityCount: number;
}

export interface OpportunityChipViewModel {
  id: string;
  title: string;
  description: string;
  confidence: number;
  capabilityIds: string[];
}

export interface DAGViewModel {
  nodes: Array<{
    id: string;
    label: string;
    status: DAGNodeStatus;
    agentDomain: AgentDomain | null;
    toolCount: number;
    isConditional: boolean;
  }>;
  edges: DAGEdge[];
  invalidatedCount: number;
  awaitingReviewCount: number;
}
