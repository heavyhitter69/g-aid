export type QCSeverity = "info" | "warning" | "critical" | "fatal";

export interface SurveySample {
  timestamp: number;
  x: number;
  y: number;
  altitude?: number;
  magneticField?: number;
  lineId?: string;
  fiducial?: number;
  source: "airborne" | "base_station";
}

export interface ScientificArtifact {
  id: string;
  type: "raw_dataset" | "processed_dataset" | "plot" | "qc_report" | "execution_metadata" | "interpolation_result";
  format: "csv" | "xlsx" | "png" | "json";
  lineage: string[]; // Parent artifacts
  generatedByNode: string;
  checksum: string;
  createdAt: string;
  path: string;
}

export interface ExecutionFingerprint {
  nodeId: string;
  codeVersion: string;
  parameterHash: string;
  inputChecksums: string[];
  environmentHash: string;
}

export interface PipelineNodeExecution {
  nodeId: string;
  inputArtifacts: ScientificArtifact[];
  outputArtifacts: ScientificArtifact[];
  parameters: Record<string, unknown>;
  executionFingerprint: ExecutionFingerprint;
}

export interface SegmentFeatures {
  meanHeading: number;
  headingVariance: number;
  meanVelocity: number;
  curvatureScore: number;
  lineSpacingConsistency: number;
  orientationCluster: number;
}

export interface InterpolationAudit {
  method: "linear" | "spline";
  airborneSampleRateHz: number;
  baseSampleRateHz: number;
  maxGapSeconds: number;
  meanGapSeconds: number;
  extrapolatedSamples: number;
  droppedSamples: number;
  duplicateTimestampCount: number;
  clockOffsetEstimateMs: number;
  temporalCoveragePercent: number;
  confidencePenalty: number;
  warnings: string[];
}

export interface DiurnalReference {
  method: "first_sample" | "mean_base" | "median_base" | "fixed_datum";
  referenceValue: number;
}

export interface PipelineEvent {
  type: "NODE_STARTED" | "NODE_PROGRESS" | "NODE_COMPLETED" | "QC_WARNING" | "PIPELINE_COMPLETE" | "PIPELINE_FAILED";
  nodeId?: string;
  message: string;
  severity?: QCSeverity;
  timestamp: string;
  payload?: any;
}
