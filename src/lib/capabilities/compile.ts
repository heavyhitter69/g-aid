import { getCapability, isRegisteredCapability } from "./registry.ts";
import type { CompiledDag, CompiledDagNode, UserCapabilityId } from "./types.ts";

/** Full magnetic pipeline order. Compiled DAGs are a subsequence, never extra nodes. */
export const MAGNETIC_NODE_ORDER = [
  "file_discovery",
  "flight_path_cleaner",
  "time_synchronizer",
  "diurnal_corrector",
  "qc_engine",
  "excel_export_adapter",
  "report_export_adapter",
  "igrf_corrector",
  "heading_lag_corrector",
  "tie_line_leveler",
  "microleveller",
  "mag_gridder",
  "rtp_filter",
  "fft_derivatives",
  "lineament_extractor",
  "euler_deconvolution",
  "gis_export",
] as const;

export const MAGNETIC_NODE_DEPS: Record<string, string[]> = {
  file_discovery: [],
  flight_path_cleaner: ["file_discovery"],
  time_synchronizer: ["flight_path_cleaner"],
  diurnal_corrector: ["time_synchronizer"],
  qc_engine: ["diurnal_corrector"],
  excel_export_adapter: ["qc_engine"],
  report_export_adapter: ["qc_engine"],
  igrf_corrector: ["diurnal_corrector"],
  heading_lag_corrector: ["igrf_corrector"],
  tie_line_leveler: ["heading_lag_corrector"],
  microleveller: ["tie_line_leveler"],
  mag_gridder: ["microleveller"],
  rtp_filter: ["mag_gridder"],
  fft_derivatives: ["rtp_filter"],
  lineament_extractor: ["fft_derivatives"],
  euler_deconvolution: ["fft_derivatives"],
  gis_export: ["fft_derivatives"],
};

const NODE_LABELS: Record<string, string> = {
  file_discovery: "Read bound MagArrow and GSM-19 catalog records",
  flight_path_cleaner: "Clean MagArrow flight path",
  time_synchronizer: "Synchronize rover and base times",
  diurnal_corrector: "Diurnal correction",
  qc_engine: "Diurnal quality control",
  excel_export_adapter: "Excel export",
  report_export_adapter: "Report export",
  igrf_corrector: "IGRF removal",
  heading_lag_corrector: "Heading and lag",
  tie_line_leveler: "Tie-line levelling",
  microleveller: "Microlevelling",
  mag_gridder: "Minimum-curvature grid",
  rtp_filter: "Reduction to the pole",
  fft_derivatives: "MAGMAP derivatives",
  lineament_extractor: "Lineament extraction",
  euler_deconvolution: "Euler deconvolution",
  gis_export: "GIS export",
};

export function expandCapabilityIds(requested: string[]): UserCapabilityId[] {
  const out: UserCapabilityId[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (!isRegisteredCapability(id) || seen.has(id)) return;
    seen.add(id);
    const capability = getCapability(id);
    if (!capability) return;
    for (const dep of capability.dependsOn) visit(dep);
    out.push(id);
  };
  for (const id of requested) visit(id);
  return out;
}

function ownerCapability(nodeId: string, expanded: UserCapabilityId[]): UserCapabilityId | "mag.prereq" {
  for (const id of expanded) {
    const capability = getCapability(id);
    if (capability?.kernelNodeIds.includes(nodeId)) return id;
  }
  return "mag.prereq";
}

function remapDeps(nodeId: string, compiled: Set<string>): string[] {
  const original = MAGNETIC_NODE_DEPS[nodeId] || [];
  const present = original.filter((dep) => compiled.has(dep));
  if (present.length) return present;
  const order = MAGNETIC_NODE_ORDER as unknown as string[];
  const index = order.indexOf(nodeId);
  for (let i = index - 1; i >= 0; i--) {
    if (compiled.has(order[i])) return [order[i]];
  }
  return [];
}

/**
 * Compile requested user capabilities into the minimum magnetic node set.
 * Unregistered ids are ignored (validator must refuse them before Proceed).
 */
export function compileCapabilityDag(requested: string[]): CompiledDag {
  const registeredRequested = requested.filter(isRegisteredCapability);
  const expanded = expandCapabilityIds(registeredRequested);
  const versions: Record<string, string> = {};
  const nodeSet = new Set<string>();
  for (const id of expanded) {
    const capability = getCapability(id);
    if (!capability) continue;
    versions[capability.id] = capability.version;
    for (const nodeId of capability.kernelNodeIds) nodeSet.add(nodeId);
  }

  const nodes: CompiledDagNode[] = [];
  for (const nodeId of MAGNETIC_NODE_ORDER) {
    if (!nodeSet.has(nodeId)) continue;
    const capabilityId = ownerCapability(nodeId, expanded);
    const capability = capabilityId === "mag.prereq" ? undefined : getCapability(capabilityId);
    nodes.push({
      id: nodeId,
      capabilityId,
      capabilityVersion: capability?.version,
      label: NODE_LABELS[nodeId] || nodeId,
      dependencies: remapDeps(nodeId, nodeSet),
    });
  }

  return {
    nodes,
    requestedCapabilityIds: registeredRequested,
    capabilityVersions: versions,
  };
}

export function compiledNodeIds(dag: CompiledDag | null | undefined): string[] {
  return dag?.nodes.map((node) => node.id) ?? [];
}
