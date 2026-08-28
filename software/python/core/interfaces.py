from dataclasses import dataclass
from typing import List, Dict, Any, Optional, Literal

QCSeverity = Literal["info", "warning", "critical", "fatal"]

@dataclass
class SurveySample:
    timestamp: float
    x: float
    y: float
    source: Literal["airborne", "base_station"]
    altitude: Optional[float] = None
    magnetic_field: Optional[float] = None
    line_id: Optional[str] = None
    fiducial: Optional[float] = None

@dataclass
class ScientificArtifact:
    id: str
    type: Literal["raw_dataset", "processed_dataset", "plot", "qc_report", "execution_metadata", "interpolation_result"]
    format: Literal["csv", "xlsx", "png", "json"]
    lineage: List[str]
    generated_by_node: str
    checksum: str
    created_at: str
    path: str

@dataclass
class ExecutionFingerprint:
    node_id: str
    code_version: str
    parameter_hash: str
    input_checksums: List[str]
    environment_hash: str

@dataclass
class PipelineNodeExecution:
    node_id: str
    input_artifacts: List[ScientificArtifact]
    output_artifacts: List[ScientificArtifact]
    parameters: Dict[str, Any]
    execution_fingerprint: ExecutionFingerprint

@dataclass
class SegmentFeatures:
    mean_heading: float
    heading_variance: float
    mean_velocity: float
    curvature_score: float
    line_spacing_consistency: float
    orientation_cluster: int

@dataclass
class InterpolationAudit:
    method: Literal["linear", "spline"]
    airborne_sample_rate_hz: float
    base_sample_rate_hz: float
    max_gap_seconds: float
    mean_gap_seconds: float
    extrapolated_samples: int
    dropped_samples: int
    duplicate_timestamp_count: int
    clock_offset_estimate_ms: float
    temporal_coverage_percent: float
    confidence_penalty: float
    warnings: List[str]

@dataclass
class DiurnalReference:
    method: Literal["first_sample", "mean_base", "median_base", "fixed_datum"]
    reference_value: float
