import { ScientificArtifact } from './interfaces';
import { PipelineEngine, PipelineNode, ChildProcessRuntime, NodeResult } from './PipelineEngine';

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

export class MagneticPreprocessingPipeline extends PipelineEngine {
  constructor() {
    super();

    this.registerNode(new PythonNode("file_discovery", "python/nodes/file_discovery.py", []));
    this.registerNode(new PythonNode("flight_path_cleaner", "python/nodes/flight_path_cleaner.py", ["file_discovery"]));
    this.registerNode(new PythonNode("time_synchronizer", "python/nodes/time_synchronizer.py", ["flight_path_cleaner"]));
    this.registerNode(new PythonNode("diurnal_corrector", "python/nodes/diurnal_corrector.py", ["time_synchronizer"]));
    this.registerNode(new PythonNode("qc_engine", "python/nodes/qc_engine.py", ["diurnal_corrector"]));
    this.registerNode(new PythonNode("excel_export_adapter", "python/adapters/excel_export_adapter.py", ["qc_engine"]));
    this.registerNode(new PythonNode("report_export_adapter", "python/adapters/report_export_adapter.py", ["qc_engine"]));

    this.registerNode(new PythonNode("igrf_corrector", SCIENCE, ["diurnal_corrector"]));
    this.registerNode(new PythonNode("heading_lag_corrector", SCIENCE, ["igrf_corrector"]));
    this.registerNode(new PythonNode("tie_line_leveler", SCIENCE, ["heading_lag_corrector"]));
    this.registerNode(new PythonNode("microleveller", SCIENCE, ["tie_line_leveler"]));
    this.registerNode(new PythonNode("mag_gridder", SCIENCE, ["microleveller"]));
    this.registerNode(new PythonNode("rtp_filter", SCIENCE, ["mag_gridder"]));
    this.registerNode(new PythonNode("fft_derivatives", SCIENCE, ["rtp_filter"]));
    this.registerNode(new PythonNode("lineament_extractor", SCIENCE, ["fft_derivatives"]));
    this.registerNode(new PythonNode("euler_deconvolution", SCIENCE, ["fft_derivatives"]));
    this.registerNode(new PythonNode("gis_export", SCIENCE, ["fft_derivatives"]));
  }
}

export class GravityPipeline extends PipelineEngine {
  constructor() {
    super();
    this.registerNode(new PythonNode("xyz_ingest", SCIENCE, []));
    this.registerNode(new PythonNode("gravity_reduce", SCIENCE, ["xyz_ingest"]));
    this.registerNode(new PythonNode("regional_residual", SCIENCE, ["gravity_reduce"]));
    this.registerNode(new PythonNode("gis_export", SCIENCE, ["regional_residual"]));
  }
}

export class ResistivityPipeline extends PipelineEngine {
  constructor() {
    super();
    this.registerNode(new PythonNode("ert_pseudosection", SCIENCE, []));
    this.registerNode(new PythonNode("ert_invert", SCIENCE, ["ert_pseudosection"]));
  }
}

export class SeismicPipeline extends PipelineEngine {
  constructor() {
    super();
    this.registerNode(new PythonNode("seismic_process", SCIENCE, []));
  }
}

export class GprPipeline extends PipelineEngine {
  constructor() {
    super();
    this.registerNode(new PythonNode("gpr_process", SCIENCE, []));
  }
}

export class RadiometricPipeline extends PipelineEngine {
  constructor() {
    super();
    this.registerNode(new PythonNode("radiometric_correct", SCIENCE, []));
  }
}

export class WellLogPipeline extends PipelineEngine {
  constructor() {
    super();
    this.registerNode(new PythonNode("las_ingest", SCIENCE, []));
  }
}
