/**
 * ScientificTool registry. Every tool dispatches to a Python kernel.
 * There is no simulation path. Missing kernels fail.
 */

import crypto from "crypto";
import type { ScientificTool, ToolExecutionRecord, AgentId } from "@/types/scientific";

function sha256Json(inputs: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(inputs, Object.keys(inputs).sort())).digest("hex");
}

function computeExecutionHash(toolId: string, version: string, inputChecksum: string): string {
  return crypto.createHash("sha256").update(`${toolId}@${version}:${inputChecksum}`).digest("hex");
}

const pythonNode: Record<string, string> = {
  rtp_filter: "rtp_filter",
  analytic_signal: "fft_derivatives",
  lineament_extractor: "lineament_extractor",
  pseudosection_gen: "ert_pseudosection",
  inversion_ert_2d: "ert_invert",
  bouguer_correction: "gravity_reduce",
  regional_residual_separation: "regional_residual",
  spectral_analysis: "seismic_process",
  horizon_picker: "seismic_process",
  crs_harmonizer: "crs_reproject",
};

export const TOOL_REGISTRY: ScientificTool[] = [
  {
    id: "rtp_filter",
    name: "Reduction to Pole (RTP)",
    version: "2.0.0",
    domain: "magnetic",
    description: "Blakely 1995 FFT RTP. Unstable at |I|<10°; writes RTE instead unless forceRtp is set.",
    inputs: {
      inclination: { type: "number", required: false, description: "Magnetic inclination (degrees). Default: IGRF at survey.", units: "degrees" },
      declination: { type: "number", required: false, description: "Magnetic declination (degrees).", units: "degrees" },
      outDir: { type: "string", required: true, description: "G-AID Output directory" },
      taskFolder: { type: "string", required: true, description: "Task folder containing tmi_grid.npz" },
    },
    outputs: { rtp_grid: { type: "grid", description: "RTP GeoTIFF/ASCII", units: "nT" } },
    deterministic: true,
    uncertaintyModel: "parametric",
    simulatable: false,
    phaseAvailable: 1,
  },
  {
    id: "analytic_signal",
    name: "Analytic Signal (Total Gradient)",
    version: "2.0.0",
    domain: "magnetic",
    description: "Roest et al. 1992 total gradient via FFT derivatives.",
    inputs: {
      outDir: { type: "string", required: true, description: "G-AID Output directory" },
      taskFolder: { type: "string", required: true, description: "Task folder" },
    },
    outputs: { as_grid: { type: "grid", description: "Analytic signal GeoTIFF", units: "nT/m" } },
    deterministic: true,
    uncertaintyModel: "none",
    simulatable: false,
    phaseAvailable: 1,
  },
  {
    id: "lineament_extractor",
    name: "Structural Lineament Extraction",
    version: "2.0.0",
    domain: "magnetic",
    description: "THD non-maximum suppression and 8-connected linking.",
    inputs: {
      outDir: { type: "string", required: true, description: "G-AID Output directory" },
      taskFolder: { type: "string", required: true, description: "Task folder" },
    },
    outputs: { lineaments: { type: "array", description: "GeoJSON polylines with azimuths" } },
    deterministic: true,
    uncertaintyModel: "parametric",
    simulatable: false,
    phaseAvailable: 1,
  },
  {
    id: "pseudosection_gen",
    name: "Apparent Resistivity Pseudosection",
    version: "2.0.0",
    domain: "resistivity",
    description: "ρa = K ΔV/I with published geometric factors (Telford et al. 1990).",
    inputs: {
      inputPath: { type: "string", required: true, description: "Res2DInv .dat path" },
      outDir: { type: "string", required: true, description: "Output directory" },
      taskFolder: { type: "string", required: true, description: "Task folder" },
    },
    outputs: { pseudosection: { type: "section", description: "Apparent resistivity points", units: "Ohm.m" } },
    deterministic: true,
    uncertaintyModel: "none",
    simulatable: false,
    phaseAvailable: 1,
  },
  {
    id: "inversion_ert_2d",
    name: "ERT 2D Smooth-Model Inversion",
    version: "2.0.0",
    domain: "resistivity",
    description: "Loke & Barker 1996 smoothness-constrained least squares. Reports misfit; does not invent a section.",
    inputs: {
      inputPath: { type: "string", required: true, description: "Res2DInv .dat path" },
      outDir: { type: "string", required: true, description: "Output directory" },
      taskFolder: { type: "string", required: true, description: "Task folder" },
      damping_factor: { type: "number", required: false, description: "Roughness weight λ", defaultValue: 0.2 },
      max_iterations: { type: "number", required: false, description: "Gauss-Newton iterations", defaultValue: 8 },
    },
    outputs: {
      inverted_section: { type: "section", description: "Resistivity model", units: "Ohm.m" },
      rmse: { type: "number", description: "Misfit percent" },
    },
    deterministic: true,
    uncertaintyModel: "parametric",
    simulatable: false,
    phaseAvailable: 1,
  },
  {
    id: "bouguer_correction",
    name: "Complete Bouguer Anomaly",
    version: "2.0.0",
    domain: "gravity",
    description: "Somigliana normal gravity, free-air 0.3086 h, 2πGρh slab, Bullard B (LaFehr 1991).",
    inputs: {
      inputPath: { type: "string", required: true, description: "CSV with value, y=lat, z=height" },
      density: { type: "number", required: false, description: "Bouguer density", units: "g/cm3", defaultValue: 2.67 },
      outDir: { type: "string", required: true, description: "Output directory" },
      taskFolder: { type: "string", required: true, description: "Task folder" },
    },
    outputs: { bouguer_anomaly: { type: "grid", description: "Bouguer values / grids", units: "mGal" } },
    deterministic: true,
    uncertaintyModel: "parametric",
    simulatable: false,
    phaseAvailable: 1,
  },
  {
    id: "regional_residual_separation",
    name: "Regional-Residual Gravity Separation",
    version: "2.0.0",
    domain: "gravity",
    description: "Polynomial or upward-continuation residual (Blakely 1995).",
    inputs: {
      outDir: { type: "string", required: true, description: "Output directory" },
      taskFolder: { type: "string", required: true, description: "Task folder" },
      method: { type: "string", required: false, description: "polynomial | upward_continuation", defaultValue: "upward_continuation" },
    },
    outputs: {
      regional: { type: "grid", description: "Regional field", units: "mGal" },
      residual: { type: "grid", description: "Residual anomaly", units: "mGal" },
    },
    deterministic: true,
    uncertaintyModel: "parametric",
    simulatable: false,
    phaseAvailable: 1,
  },
  {
    id: "spectral_analysis",
    name: "Power Spectral Density Analysis",
    version: "2.0.0",
    domain: "seismic",
    description: "Welch 1967 PSD of SEG-Y traces after real I/O.",
    inputs: {
      inputPath: { type: "string", required: true, description: "SEG-Y path" },
      outDir: { type: "string", required: true, description: "Output directory" },
      taskFolder: { type: "string", required: true, description: "Task folder" },
    },
    outputs: {
      psd: { type: "array", description: "Power spectral density" },
      dominant_frequency: { type: "number", description: "Dominant frequency", units: "Hz" },
    },
    deterministic: true,
    uncertaintyModel: "none",
    simulatable: false,
    phaseAvailable: 1,
  },
  {
    id: "horizon_picker",
    name: "Automatic Horizon Picking",
    version: "2.0.0",
    domain: "seismic",
    description: "Local amplitude tracking from a seed (Sheriff & Geldart). Requires processed traces.",
    inputs: {
      inputPath: { type: "string", required: true, description: "SEG-Y path" },
      outDir: { type: "string", required: true, description: "Output directory" },
      taskFolder: { type: "string", required: true, description: "Task folder" },
    },
    outputs: { horizon_picks: { type: "array", description: "Sample picks per trace" } },
    deterministic: true,
    uncertaintyModel: "parametric",
    simulatable: false,
    phaseAvailable: 1,
  },
  {
    id: "crs_harmonizer",
    name: "CRS Harmonisation",
    version: "2.0.0",
    domain: "spatial",
    description: "WGS-84 ↔ UTM Transverse Mercator (USGS PP 1395).",
    inputs: {
      outDir: { type: "string", required: true, description: "Output directory" },
      taskFolder: { type: "string", required: true, description: "Task folder" },
      target_crs: { type: "string", required: false, description: "Target EPSG integer", defaultValue: "auto UTM" },
    },
    outputs: { reprojected_datasets: { type: "array", description: "CSV with x_proj, y_proj, crs_epsg" } },
    deterministic: true,
    uncertaintyModel: "none",
    simulatable: false,
    phaseAvailable: 1,
  },
];

const executionCache = new Map<string, ToolExecutionRecord>();

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
  simulationMode = false
): Promise<ToolExecutionRecord> {
  const tool = getTool(toolId);
  if (!tool) throw new Error(`Tool not found: ${toolId}`);
  if (simulationMode) {
    throw new Error(`Refusing to simulate ${toolId}. All tools execute Python kernels.`);
  }

  const nodeId = pythonNode[toolId];
  if (!nodeId) throw new Error(`No Python kernel mapped for ${toolId}`);

  const inputChecksum = sha256Json(inputs);
  const executionHash = computeExecutionHash(tool.id, tool.version, inputChecksum);
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
    reproducibilitySignature: executionHash,
    outputs: null,
    status: "running",
    startedAt: new Date().toISOString(),
    completedAt: null,
    agentId,
    simulationMode: false,
    errorMessage: null,
  };

  try {
    const response = await fetch("http://127.0.0.1:8000/api/v1/run-node", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node_id: nodeId, parameters: inputs, input_artifacts: [] }),
    });
    const parsed = (await response.json()) as {
      success?: boolean;
      error?: string;
      artifacts?: unknown[];
      events?: unknown[];
      detail?: string;
    };
    if (!response.ok || parsed.success === false) {
      const message = parsed.error || parsed.detail || `run-node ${response.status}`;
      const failed: ToolExecutionRecord = {
        ...record,
        status: "failed",
        completedAt: new Date().toISOString(),
        errorMessage: message,
      };
      return failed;
    }
    const completed: ToolExecutionRecord = {
      ...record,
      outputs: { artifacts: parsed.artifacts ?? [], events: parsed.events ?? [] },
      status: "complete",
      completedAt: new Date().toISOString(),
    };
    if (tool.deterministic) executionCache.set(executionHash, completed);
    return completed;
  } catch (err) {
    return {
      ...record,
      status: "failed",
      completedAt: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

export function getExecutionFromHash(executionHash: string): ToolExecutionRecord | undefined {
  return executionCache.get(executionHash);
}
