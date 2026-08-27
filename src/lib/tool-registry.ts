/**
 * ScientificTool registry — kernel bindings from the live capability registry.
 * Seismic is not registered for execution. Radiometrics and GPR use the same
 * engine as magnetics/gravity/ERT. Do not add a RadiometricsPipeline or GprPipeline.
 */

import crypto from "crypto";
import { executePythonNode } from "@/lib/python-runtime";
import { listCapabilities } from "./capabilities/registry.ts";
import type { ScientificTool, ToolExecutionRecord, AgentId } from "@/types/scientific";

function sha256Json(inputs: Record<string, unknown>): string {
  return crypto.createHash("sha256").update(JSON.stringify(inputs, Object.keys(inputs).sort())).digest("hex");
}

function computeExecutionHash(toolId: string, version: string, inputChecksum: string): string {
  return crypto.createHash("sha256").update(`${toolId}@${version}:${inputChecksum}`).digest("hex");
}

const SCIENCE = "python/nodes/science_node.py";

const NODE_SCRIPTS: Record<string, string> = {
  file_discovery: "python/nodes/file_discovery.py",
  flight_path_cleaner: "python/nodes/flight_path_cleaner.py",
  time_synchronizer: "python/nodes/time_synchronizer.py",
  diurnal_corrector: "python/nodes/diurnal_corrector.py",
  qc_engine: "python/nodes/qc_engine.py",
  excel_export_adapter: "python/adapters/excel_export_adapter.py",
  report_export_adapter: "python/adapters/report_export_adapter.py",
  igrf_corrector: SCIENCE,
  heading_lag_corrector: SCIENCE,
  tie_line_leveler: SCIENCE,
  microleveller: SCIENCE,
  mag_gridder: SCIENCE,
  rtp_filter: SCIENCE,
  fft_derivatives: SCIENCE,
  lineament_extractor: SCIENCE,
  euler_deconvolution: SCIENCE,
  gis_export: SCIENCE,
  gravity_ingest: SCIENCE,
  gravity_freeair: SCIENCE,
  gravity_bouguer: SCIENCE,
  grav_gridder: SCIENCE,
  regional_residual: SCIENCE,
  grav_gis_export: SCIENCE,
  grav_interpret: SCIENCE,
  gravity_terrain: SCIENCE,
  ert_ingest: SCIENCE,
  ert_pseudosection: SCIENCE,
  ert_invert: SCIENCE,
  ert_gis_export: SCIENCE,
  ert_interpret: SCIENCE,
  rad_ingest: SCIENCE,
  rad_grid: SCIENCE,
  rad_ternary: SCIENCE,
  rad_ratios: SCIENCE,
  rad_gis_export: SCIENCE,
  rad_interpret: SCIENCE,
  gpr_ingest: SCIENCE,
  gpr_process: SCIENCE,
  gpr_migrate: SCIENCE,
  gpr_gis_export: SCIENCE,
  gpr_interpret: SCIENCE,
};

function toolsFromLiveRegistry(): ScientificTool[] {
  const seen = new Set<string>();
  const tools: ScientificTool[] = [];
  for (const capability of listCapabilities()) {
    for (const nodeId of capability.kernelNodeIds) {
      if (seen.has(nodeId) || !NODE_SCRIPTS[nodeId]) continue;
      seen.add(nodeId);
      tools.push({
        id: nodeId,
        name: capability.title,
        version: capability.version,
        domain:
          capability.domain === "gravity"
            ? "gravity"
            : capability.domain === "resistivity"
              ? "resistivity"
              : capability.domain === "radiometrics"
                ? "spatial"
                : capability.domain === "gpr"
                  ? "spatial"
                : "magnetic",
        description: `${capability.description} (kernel ${nodeId})`,
        inputs: Object.fromEntries(
          Object.entries(capability.parameters).map(([key, parameter]) => [
            key,
            {
              type: parameter.type,
              required: parameter.required,
              description: parameter.description,
              defaultValue: parameter.defaultValue,
              units: parameter.units,
            },
          ])
        ),
        outputs: Object.fromEntries(
          capability.outputs.map((output) => [
            output.id,
            { type: output.type === "grid" ? "grid" : output.type === "vector" ? "array" : "grid", description: output.description },
          ])
        ),
        deterministic: true,
        uncertaintyModel: "parametric",
        simulatable: false,
        phaseAvailable: 1,
      });
    }
  }
  return tools;
}

export const TOOL_REGISTRY: ScientificTool[] = toolsFromLiveRegistry();

const executionCache = new Map<string, ToolExecutionRecord>();

export function getTool(id: string): ScientificTool | undefined {
  return TOOL_REGISTRY.find((tool) => tool.id === id);
}

export function getToolsForDomain(domain: string): ScientificTool[] {
  if (domain !== "magnetic" && domain !== "magnetics") return [];
  return TOOL_REGISTRY.filter((tool) => tool.domain === "magnetic");
}

export async function executeTool(
  toolId: string,
  inputs: Record<string, unknown>,
  agentId: AgentId,
  simulationMode = false
): Promise<ToolExecutionRecord> {
  const tool = getTool(toolId);
  if (!tool) throw new Error(`Tool not found: ${toolId}. Only registered magnetic kernels execute.`);
  if (simulationMode) {
    throw new Error(`Refusing to simulate ${toolId}. All tools execute Python kernels.`);
  }

  const scriptPath = NODE_SCRIPTS[toolId];
  if (!scriptPath) throw new Error(`No Python kernel mapped for ${toolId}`);

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
    const result = await executePythonNode(toolId, scriptPath, [], inputs);
    if (!result.success) {
      return {
        ...record,
        status: "failed",
        completedAt: new Date().toISOString(),
        errorMessage: result.error || `${toolId} failed`,
      };
    }
    const completed: ToolExecutionRecord = {
      ...record,
      outputs: { artifacts: result.artifacts ?? [], events: result.events ?? [] },
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
