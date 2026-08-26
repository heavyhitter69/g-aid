import { ScientificArtifact } from './interfaces';
import { PipelineEngine, PipelineNode, ChildProcessRuntime, NodeResult } from './PipelineEngine';
import { MAGNETIC_NODE_DEPS, MAGNETIC_NODE_ORDER } from "@/lib/capabilities/compile";

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
};

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

export class MagneticPreprocessingPipeline extends PipelineEngine {
  constructor(nodeIds?: string[]) {
    super();
    // Live path must pass compiled DAG node ids. An empty list registers nothing.
    const requested = nodeIds?.length ? nodeIds : [];
    const compiled = new Set(requested);
    for (const id of MAGNETIC_NODE_ORDER) {
      if (!compiled.has(id)) continue;
      const script = NODE_SCRIPTS[id];
      if (!script) continue;
      this.registerNode(new PythonNode(id, script, remapDeps(id, compiled)));
    }
  }
}

export class GravityPipeline extends PipelineEngine {
  constructor() {
    super();
  }
}

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
