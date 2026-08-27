import { ScientificArtifact } from './interfaces';
import { PipelineEngine, PipelineNode, ChildProcessRuntime, NodeResult } from './PipelineEngine';
import { KERNEL_NODE_ORDER, remapKernelDeps } from "@/lib/capabilities/compile";

class PythonNode extends PipelineNode {
  scriptPath: string;

  constructor(id: string, scriptPath: string, dependencies: string[] = []) {
    super(id, dependencies);
    this.scriptPath = scriptPath;
  }

  async execute(inputArtifacts: ScientificArtifact[], parameters: Record<string, unknown>): Promise<NodeResult> {
    return ChildProcessRuntime.execute(this.id, this.scriptPath, inputArtifacts, parameters);
  }
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
};

export class MagneticPreprocessingPipeline extends PipelineEngine {
  constructor(nodeIds?: string[]) {
    super();
    // Live path must pass compiled DAG node ids. An empty list registers nothing.
    // Gravity uses this same engine. Do not add a GravityPipeline execution route.
    // ERT uses this same engine. Do not add a ResistivityPipeline execution route.
    // Radiometrics uses this same engine. Do not add a RadiometricsPipeline execution route.
    const requested = nodeIds?.length ? nodeIds : [];
    const compiled = new Set(requested);
    for (const id of KERNEL_NODE_ORDER) {
      if (!compiled.has(id)) continue;
      const script = NODE_SCRIPTS[id];
      if (!script) continue;
      this.registerNode(new PythonNode(id, script, remapKernelDeps(id, compiled)));
    }
  }
}

/** Unused stub. Gravity executes through MagneticPreprocessingPipeline + compileCapabilityDag. */
export class GravityPipeline extends PipelineEngine {
  constructor() {
    super();
  }
}

/** Unused stub. ERT executes through MagneticPreprocessingPipeline + compileCapabilityDag. */
export class ResistivityPipeline extends PipelineEngine {
  constructor() {
    super();
  }
}

export class SeismicPipeline extends PipelineEngine {
  constructor() {
    super();
  }
}

export class GprPipeline extends PipelineEngine {
  constructor() {
    super();
  }
}

export class RadiometricPipeline extends PipelineEngine {
  constructor() {
    super();
  }
}

export class WellLogPipeline extends PipelineEngine {
  constructor() {
    super();
  }
}
