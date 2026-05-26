/**
 * tool-registry.ts
 * ScientificTool registry with execution contracts, reproducibility hashes, and simulation.
 * In Phase 1: all tools are simulated. In Phase 2+: tools dispatch to Python backend.
 */

import type { ScientificTool, ToolExecutionRecord, AgentId } from "@/types/scientific";

// ─── Utility: simple checksum (Phase 1 substitute for SHA-256) ────────────────

function simpleChecksum(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

function computeInputChecksum(inputs: Record<string, unknown>): string {
  return simpleChecksum(JSON.stringify(inputs, Object.keys(inputs).sort()));
}

function computeExecutionHash(toolId: string, version: string, inputChecksum: string): string {
  return simpleChecksum(`${toolId}@${version}:${inputChecksum}`);
}

// ─── Tool Registry ────────────────────────────────────────────────────────────

export const TOOL_REGISTRY: ScientificTool[] = [
  // ── Magnetic ──────────────────────────────────────────────────────────────
  {
    id: "rtp_filter",
    name: "Reduction to Pole (RTP)",
    version: "1.0.0",
    domain: "magnetic",
    description: "Removes inclination effects from magnetic data, transforming anomalies to appear as if acquired at the magnetic pole. Unstable at low latitudes.",
    inputs: {
      grid: { type: "object", required: true, description: "Input magnetic grid", units: "nT" },
      inclination: { type: "number", required: true, description: "Magnetic inclination (degrees)", units: "degrees" },
      declination: { type: "number", required: true, description: "Magnetic declination (degrees)", units: "degrees" },
    },
    outputs: {
      rtp_grid: { type: "grid", description: "RTP-transformed magnetic grid", units: "nT" },
    },
    deterministic: true,
    uncertaintyModel: "parametric",
    simulatable: true,
    phaseAvailable: 1,
  },
  {
    id: "analytic_signal",
    name: "Analytic Signal (Total Gradient)",
    version: "1.0.0",
    domain: "magnetic",
    description: "Computes the total horizontal gradient amplitude — inclination-independent. Preferred for low-latitude or remanence-affected surveys.",
    inputs: {
      grid: { type: "object", required: true, description: "Input magnetic grid", units: "nT" },
    },
    outputs: {
      as_grid: { type: "grid", description: "Analytic signal amplitude grid", units: "nT/m" },
    },
    deterministic: true,
    uncertaintyModel: "none",
    simulatable: true,
    phaseAvailable: 1,
  },
  {
    id: "lineament_extractor",
    name: "Structural Lineament Extraction",
    version: "1.0.0",
    domain: "magnetic",
    description: "Automatically extracts linear structural features (faults, dykes, contacts) from derivative grids using gradient analysis.",
    inputs: {
      grid: { type: "object", required: true, description: "Derivative grid (THD or VD)", units: "nT/m" },
      threshold: { type: "number", required: false, description: "Gradient threshold for lineament detection", defaultValue: 0.3 },
    },
    outputs: {
      lineaments: { type: "array", description: "Array of detected lineament polylines with azimuth statistics" },
      rose_diagram: { type: "object", description: "Azimuth frequency rose diagram data" },
    },
    deterministic: false,
    uncertaintyModel: "parametric",
    simulatable: true,
    phaseAvailable: 1,
  },
  // ── Resistivity ───────────────────────────────────────────────────────────
  {
    id: "pseudosection_gen",
    name: "Apparent Resistivity Pseudosection",
    version: "1.0.0",
    domain: "resistivity",
    description: "Generates 2D apparent resistivity pseudosection from ERT data for qualitative interpretation before inversion.",
    inputs: {
      data: { type: "object", required: true, description: "Raw ERT measurement data" },
      array_type: { type: "string", required: true, description: "Electrode array geometry", defaultValue: "dipole-dipole" },
    },
    outputs: {
      pseudosection: { type: "section", description: "2D apparent resistivity pseudosection", units: "Ohm.m" },
    },
    deterministic: true,
    uncertaintyModel: "none",
    simulatable: true,
    phaseAvailable: 1,
  },
  {
    id: "inversion_ert_2d",
    name: "ERT 2D Smooth-Model Inversion",
    version: "1.0.0",
    domain: "resistivity",
    description: "Least-squares smooth-model inversion of ERT data. Iterative convergence to minimum RMSE model.",
    inputs: {
      data: { type: "object", required: true, description: "Raw ERT measurement data" },
      initial_model: { type: "object", required: false, description: "Starting resistivity model" },
      damping_factor: { type: "number", required: false, description: "Regularisation damping factor", defaultValue: 0.1 },
      max_iterations: { type: "number", required: false, description: "Maximum inversion iterations", defaultValue: 10 },
    },
    outputs: {
      inverted_section: { type: "section", description: "Inverted resistivity model", units: "Ohm.m" },
      rmse: { type: "number", description: "Root mean square error at convergence", units: "%" },
      doi_index: { type: "section", description: "Depth of investigation index (0–1)" },
    },
    deterministic: false,
    uncertaintyModel: "monte-carlo",
    simulatable: true,
    phaseAvailable: 2,
  },
  // ── Gravity ───────────────────────────────────────────────────────────────
  {
    id: "bouguer_correction",
    name: "Complete Bouguer Anomaly",
    version: "1.0.0",
    domain: "gravity",
    description: "Applies free-air, Bouguer slab, and terrain corrections to raw gravity observations.",
    inputs: {
      raw_gravity: { type: "object", required: true, description: "Raw gravity observations", units: "mGal" },
      dem: { type: "object", required: true, description: "Digital elevation model", units: "m" },
      density: { type: "number", required: false, description: "Bouguer slab density", units: "g/cm3", defaultValue: 2.67 },
    },
    outputs: {
      bouguer_anomaly: { type: "grid", description: "Complete Bouguer anomaly grid", units: "mGal" },
    },
    deterministic: true,
    uncertaintyModel: "parametric",
    simulatable: true,
    phaseAvailable: 2,
  },
  {
    id: "regional_residual_separation",
    name: "Regional-Residual Gravity Separation",
    version: "1.0.0",
    domain: "gravity",
    description: "Separates long-wavelength regional gravity field from short-wavelength residual anomalies using polynomial or upward continuation.",
    inputs: {
      bouguer_grid: { type: "object", required: true, description: "Complete Bouguer anomaly grid", units: "mGal" },
      method: { type: "string", required: false, description: "Separation method: polynomial | upward_continuation", defaultValue: "upward_continuation" },
      continuation_height: { type: "number", required: false, description: "Upward continuation height (m)", defaultValue: 5000 },
    },
    outputs: {
      regional: { type: "grid", description: "Regional gravity field", units: "mGal" },
      residual: { type: "grid", description: "Residual gravity anomaly", units: "mGal" },
    },
    deterministic: true,
    uncertaintyModel: "parametric",
    simulatable: true,
    phaseAvailable: 1,
  },
  // ── Seismic ───────────────────────────────────────────────────────────────
  {
    id: "spectral_analysis",
    name: "Power Spectral Density Analysis",
    version: "1.0.0",
    domain: "seismic",
    description: "Computes power spectral density of seismic traces for frequency analysis and bandwidth assessment.",
    inputs: {
      traces: { type: "array", required: true, description: "Seismic trace array" },
      window_length: { type: "number", required: false, description: "FFT window length (samples)", defaultValue: 256 },
    },
    outputs: {
      psd: { type: "array", description: "Power spectral density curve" },
      dominant_frequency: { type: "number", description: "Dominant frequency", units: "Hz" },
      bandwidth: { type: "array", description: "Usable frequency bandwidth [min, max]", units: "Hz" },
    },
    deterministic: true,
    uncertaintyModel: "none",
    simulatable: true,
    phaseAvailable: 1,
  },
  {
    id: "horizon_picker",
    name: "Automatic Horizon Picking",
    version: "1.0.0",
    domain: "seismic",
    description: "Semi-automatic horizon picking using amplitude tracking and phase correlation.",
    inputs: {
      section: { type: "object", required: true, description: "Seismic section data" },
      seed_points: { type: "array", required: true, description: "User-defined seed picks to propagate" },
      tracking_method: { type: "string", required: false, description: "zero-crossing | peak | trough", defaultValue: "peak" },
    },
    outputs: {
      horizon_picks: { type: "array", description: "Picked horizon in TWT (ms)" },
      confidence_map: { type: "section", description: "Pick confidence 0–1 per trace" },
    },
    deterministic: false,
    uncertaintyModel: "parametric",
    simulatable: true,
    phaseAvailable: 2,
  },
  // ── Spatial ───────────────────────────────────────────────────────────────
  {
    id: "crs_harmonizer",
    name: "CRS Harmonisation",
    version: "1.0.0",
    domain: "spatial",
    description: "Reprojects all datasets to a common coordinate reference system with distortion assessment.",
    inputs: {
      datasets: { type: "array", required: true, description: "Array of GeoDataset objects" },
      target_crs: { type: "string", required: true, description: "Target EPSG code", defaultValue: "EPSG:4326" },
    },
    outputs: {
      reprojected_datasets: { type: "array", description: "Datasets in target CRS" },
      distortion_report: { type: "object", description: "CRS compatibility and distortion report" },
    },
    deterministic: true,
    uncertaintyModel: "none",
    simulatable: true,
    phaseAvailable: 1,
  },
];

// ─── Execution cache ──────────────────────────────────────────────────────────

const executionCache = new Map<string, ToolExecutionRecord>();

// ─── Simulated tool outputs ───────────────────────────────────────────────────

function simulateToolOutput(toolId: string, inputs: Record<string, unknown>): Record<string, unknown> {
  switch (toolId) {
    case "rtp_filter":
      return { rtp_grid: { type: "simulated_grid", rows: 100, cols: 100, unit: "nT", note: "RTP simulation — Phase 2 runs real FFT filter" } };
    case "analytic_signal":
      return { as_grid: { type: "simulated_grid", rows: 100, cols: 100, unit: "nT/m", note: "Analytic signal simulation" } };
    case "lineament_extractor":
      return {
        lineaments: [
          { id: "L1", azimuth: 47, length_km: 12.3, confidence: 0.78 },
          { id: "L2", azimuth: 315, length_km: 8.7, confidence: 0.65 },
          { id: "L3", azimuth: 51, length_km: 6.1, confidence: 0.71 },
        ],
        rose_diagram: { dominant_azimuth: 47, spread_degrees: 15 },
      };
    case "pseudosection_gen":
      return { pseudosection: { type: "simulated_section", stations: 24, max_depth_m: 80, unit: "Ohm.m", note: "Pseudosection simulation" } };
    case "inversion_ert_2d":
      return { inverted_section: { type: "simulated_section", rmse_percent: 2.1, iterations: 4 }, rmse: 2.1, doi_index: { min: 0.0, max: 0.85 } };
    case "bouguer_correction":
      return { bouguer_anomaly: { type: "simulated_grid", unit: "mGal", density_used: inputs.density ?? 2.67 } };
    case "regional_residual_separation":
      return {
        regional: { type: "simulated_grid", unit: "mGal", method: inputs.method ?? "upward_continuation" },
        residual: { type: "simulated_grid", unit: "mGal", note: "Residual after regional removal" },
      };
    case "spectral_analysis":
      return { psd: [0, 0.2, 0.8, 1.0, 0.9, 0.5, 0.1], dominant_frequency: 45, bandwidth: [10, 90] };
    case "horizon_picker":
      return { horizon_picks: Array.from({ length: 24 }, (_, i) => ({ trace: i + 1, twt_ms: 850 + Math.sin(i * 0.4) * 20 })), confidence_map: {} };
    case "crs_harmonizer":
      return { reprojected_datasets: [], distortion_report: { compatible: true, warnings: [] } };
    default:
      return { status: "simulated", toolId };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getTool(id: string): ScientificTool | undefined {
  return TOOL_REGISTRY.find((t) => t.id === id);
}

export function getToolsForDomain(domain: string): ScientificTool[] {
  return TOOL_REGISTRY.filter((t) => t.domain === domain);
}

export async function executeTool(
  toolId: string,
  inputs: Record<string, unknown>,
  agentId: AgentId,
  simulationMode = true
): Promise<ToolExecutionRecord> {
  const tool = getTool(toolId);
  if (!tool) throw new Error(`Tool not found: ${toolId}`);

  const inputChecksum = computeInputChecksum(inputs);
  const executionHash = computeExecutionHash(tool.id, tool.version, inputChecksum);

  // Cache hit for deterministic tools
  if (tool.deterministic && executionCache.has(executionHash)) {
    return executionCache.get(executionHash)!;
  }

  const record: ToolExecutionRecord = {
    id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    toolId,
    toolVersion: tool.version,
    inputs,
    inputChecksum,
    executionHash,
    reproducibilitySignature: tool.deterministic ? executionHash : `non-deterministic_${Date.now()}`,
    outputs: null,
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    agentId,
    simulationMode,
    errorMessage: null,
  };

  // Simulate execution delay
  await new Promise((r) => setTimeout(r, simulationMode ? 300 : 0));

  const outputs = simulationMode ? simulateToolOutput(toolId, inputs) : {};
  const completed: ToolExecutionRecord = {
    ...record,
    outputs,
    status: "complete",
    completedAt: new Date().toISOString(),
  };

  if (tool.deterministic) executionCache.set(executionHash, completed);
  return completed;
}

export function getExecutionFromHash(executionHash: string): ToolExecutionRecord | undefined {
  return executionCache.get(executionHash);
}
