import { getCapability, isRegisteredCapability } from "./registry.ts";
import type { CompiledDag, CompiledDagNode, UserCapabilityId } from "./types.ts";

export type { CompiledDag, CompiledDagNode, UserCapabilityId };

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

export const GRAVITY_NODE_ORDER = [
  "gravity_ingest",
  "gravity_freeair",
  "gravity_bouguer",
  "gravity_terrain",
  "grav_gridder",
  "regional_residual",
  "grav_gis_export",
  "grav_interpret",
] as const;

export const ERT_NODE_ORDER = [
  "ert_ingest",
  "ert_pseudosection",
  "ert_invert",
  "ert_gis_export",
  "ert_interpret",
] as const;

export const RADIO_NODE_ORDER = [
  "rad_ingest",
  "rad_grid",
  "rad_ternary",
  "rad_ratios",
  "rad_gis_export",
  "rad_interpret",
] as const;

export const GPR_NODE_ORDER = [
  "gpr_ingest",
  "gpr_process",
  "gpr_migrate",
  "gpr_gis_export",
  "gpr_interpret",
] as const;

export const LAS_NODE_ORDER = [
  "las_ingest",
  "borehole_view",
  "borehole_map_collar",
  "borehole_interpret",
] as const;

export const GIS_NODE_ORDER = [
  "vector_ingest",
  "vector_view",
  "vector_overlap",
  "vector_export",
  "vector_interpret",
] as const;

export const GEOCHEM_NODE_ORDER = [
  "geochem_ingest",
  "geochem_qc",
  "geochem_map_points",
  "geochem_summary",
  "geochem_display_transform",
  "geochem_interpret",
] as const;

export const KERNEL_NODE_ORDER = [
  ...MAGNETIC_NODE_ORDER,
  ...GRAVITY_NODE_ORDER,
  ...ERT_NODE_ORDER,
  ...RADIO_NODE_ORDER,
  ...GPR_NODE_ORDER,
  ...LAS_NODE_ORDER,
  ...GIS_NODE_ORDER,
  ...GEOCHEM_NODE_ORDER,
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

export const GRAVITY_NODE_DEPS: Record<string, string[]> = {
  gravity_ingest: [],
  gravity_freeair: ["gravity_ingest"],
  gravity_bouguer: ["gravity_freeair"],
  gravity_terrain: ["gravity_bouguer"],
  grav_gridder: ["gravity_terrain"],
  regional_residual: ["grav_gridder"],
  grav_gis_export: ["gravity_terrain"],
  grav_interpret: ["grav_gis_export"],
};

export const ERT_NODE_DEPS: Record<string, string[]> = {
  ert_ingest: [],
  ert_pseudosection: ["ert_ingest"],
  ert_invert: ["ert_pseudosection"],
  ert_gis_export: ["ert_ingest"],
  ert_interpret: ["ert_pseudosection"],
};

export const RADIO_NODE_DEPS: Record<string, string[]> = {
  rad_ingest: [],
  rad_grid: ["rad_ingest"],
  rad_ternary: ["rad_grid"],
  rad_ratios: ["rad_ingest"],
  rad_gis_export: ["rad_ingest"],
  rad_interpret: ["rad_ingest"],
};

export const GPR_NODE_DEPS: Record<string, string[]> = {
  gpr_ingest: [],
  gpr_process: ["gpr_ingest"],
  gpr_migrate: ["gpr_process"],
  gpr_gis_export: ["gpr_ingest"],
  gpr_interpret: ["gpr_process", "gpr_migrate"],
};

export const LAS_NODE_DEPS: Record<string, string[]> = {
  las_ingest: [],
  borehole_view: ["las_ingest"],
  borehole_map_collar: ["las_ingest"],
  borehole_interpret: ["las_ingest", "borehole_view", "borehole_map_collar"],
};

export const GIS_NODE_DEPS: Record<string, string[]> = {
  vector_ingest: [],
  vector_view: ["vector_ingest"],
  vector_overlap: ["vector_ingest"],
  vector_export: ["vector_ingest"],
  vector_interpret: ["vector_ingest", "vector_view", "vector_overlap"],
};

export const GEOCHEM_NODE_DEPS: Record<string, string[]> = {
  geochem_ingest: [],
  geochem_qc: ["geochem_ingest"],
  geochem_map_points: ["geochem_ingest"],
  geochem_summary: ["geochem_qc"],
  geochem_display_transform: ["geochem_qc"],
  geochem_interpret: ["geochem_summary", "geochem_map_points", "geochem_display_transform"],
};

export const KERNEL_NODE_DEPS: Record<string, string[]> = {
  ...MAGNETIC_NODE_DEPS,
  ...GRAVITY_NODE_DEPS,
  ...ERT_NODE_DEPS,
  ...RADIO_NODE_DEPS,
  ...GPR_NODE_DEPS,
  ...LAS_NODE_DEPS,
  ...GIS_NODE_DEPS,
  ...GEOCHEM_NODE_DEPS,
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
  gravity_ingest: "Read bound gravity catalog records",
  gravity_freeair: "Free-air anomaly",
  gravity_bouguer: "Simple Bouguer correction",
  gravity_terrain: "Zoned planar Nagy terrain correction",
  grav_gridder: "Grid gravity stations",
  regional_residual: "Regional-residual gravity",
  grav_gis_export: "Gravity GIS export",
  grav_interpret: "Gravity interpretation limits",
  ert_ingest: "Read bound ERT catalog records",
  ert_pseudosection: "ERT pseudosection (not a depth model)",
  ert_invert: "Experimental ERT 2-D invert (not production)",
  ert_gis_export: "ERT electrode GIS export",
  ert_interpret: "ERT interpretation limits",
  rad_ingest: "Read bound radiometric catalog records",
  rad_grid: "Radiometric channel grids",
  rad_ternary: "K-eTh-eU ternary (concentrations only)",
  rad_ratios: "Radiometric concentration ratios",
  rad_gis_export: "Radiometric GIS export",
  rad_interpret: "Radiometric interpretation limits",
  gpr_ingest: "Read bound G-AID GPR 1.0 catalog records",
  gpr_process: "Dewow, time-zero, SEC gain, and Nyquist-safe bandpass",
  gpr_migrate: "Kirchhoff time migration (user velocity only)",
  gpr_gis_export: "GPR trace GIS export",
  gpr_interpret: "GPR interpretation limits",
  las_ingest: "Read bound CWLS LAS 2.0 WRAP.NO catalog records",
  borehole_view: "Build measured-depth log tracks",
  borehole_map_collar: "Map borehole collar when coordinates and CRS are documented",
  borehole_interpret: "Borehole interpretation limits",
  vector_ingest: "Read bound documented GeoJSON catalog records",
  vector_view: "Build source vector viewer metadata",
  vector_overlap: "Same-CRS geometric overlap table (not geological proof)",
  vector_export: "Export ingested vectors as GeoJSON",
  vector_interpret: "GIS interpretation limits",
  geochem_ingest: "Read bound G-AID GEOCHEM 1.0 catalog records",
  geochem_qc: "Geochemistry QC (duplicates, mixed units, censored BDL)",
  geochem_map_points: "Map sample points when CRS is documented",
  geochem_summary: "Summary statistics of uncensored assays",
  geochem_display_transform: "Approved display-only log10 of positive uncensored values",
  geochem_interpret: "Geochemistry interpretation limits",
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

function ownerCapability(
  nodeId: string,
  expanded: UserCapabilityId[]
): UserCapabilityId | "mag.prereq" | "grav.prereq" | "ert.prereq" | "rad.prereq" | "gpr.prereq" | "borehole.prereq" | "gis.prereq" | "geochem.prereq" {
  for (const id of expanded) {
    const capability = getCapability(id);
    if (capability?.kernelNodeIds.includes(nodeId)) return id;
  }
  if (nodeFamily(nodeId) === "geochem") return "geochem.prereq";
  if (nodeFamily(nodeId) === "gis") return "gis.prereq";
  if (nodeFamily(nodeId) === "borehole") return "borehole.prereq";
  if (nodeFamily(nodeId) === "gpr") return "gpr.prereq";
  if (nodeFamily(nodeId) === "rad") return "rad.prereq";
  if (nodeFamily(nodeId) === "ert") return "ert.prereq";
  if (nodeFamily(nodeId) === "grav") return "grav.prereq";
  return "mag.prereq";
}

function nodeFamily(nodeId: string): "mag" | "grav" | "ert" | "rad" | "gpr" | "borehole" | "gis" | "geochem" {
  if ((GEOCHEM_NODE_ORDER as readonly string[]).includes(nodeId)) return "geochem";
  if ((GIS_NODE_ORDER as readonly string[]).includes(nodeId)) return "gis";
  if ((LAS_NODE_ORDER as readonly string[]).includes(nodeId)) return "borehole";
  if ((GPR_NODE_ORDER as readonly string[]).includes(nodeId)) return "gpr";
  if ((RADIO_NODE_ORDER as readonly string[]).includes(nodeId)) return "rad";
  if ((ERT_NODE_ORDER as readonly string[]).includes(nodeId)) return "ert";
  if ((GRAVITY_NODE_ORDER as readonly string[]).includes(nodeId)) return "grav";
  return "mag";
}

/** Remap declared deps onto the compiled subset. Mag, gravity, ERT, radiometrics, GPR, borehole, GIS, and geochemistry never wait on each other. */
export function remapKernelDeps(nodeId: string, compiled: Set<string>): string[] {
  const original = KERNEL_NODE_DEPS[nodeId] || [];
  const present = original.filter((dep) => compiled.has(dep));
  if (present.length) return present;
  const order = KERNEL_NODE_ORDER as unknown as string[];
  const index = order.indexOf(nodeId);
  const family = nodeFamily(nodeId);
  for (let i = index - 1; i >= 0; i--) {
    const prev = order[i];
    if (compiled.has(prev) && nodeFamily(prev) === family) return [prev];
  }
  return [];
}

/**
 * Compile requested user capabilities into the minimum kernel node set.
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
  for (const nodeId of KERNEL_NODE_ORDER) {
    if (!nodeSet.has(nodeId)) continue;
    const capabilityId = ownerCapability(nodeId, expanded);
    const capability =
      capabilityId === "mag.prereq" ||
      capabilityId === "grav.prereq" ||
      capabilityId === "ert.prereq" ||
      capabilityId === "rad.prereq" ||
      capabilityId === "gpr.prereq" ||
      capabilityId === "borehole.prereq" ||
      capabilityId === "gis.prereq" ||
      capabilityId === "geochem.prereq"
        ? undefined
        : getCapability(capabilityId);
    nodes.push({
      id: nodeId,
      capabilityId,
      capabilityVersion: capability?.version,
      label: NODE_LABELS[nodeId] || nodeId,
      dependencies: remapKernelDeps(nodeId, nodeSet),
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
