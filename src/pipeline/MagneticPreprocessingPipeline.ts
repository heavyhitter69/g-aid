import { ScientificArtifact, PipelineNodeExecution } from './interfaces';
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

export class MagneticPreprocessingPipeline extends PipelineEngine {
  constructor() {
    super();
    
    // Phase 1 Diurnal Correction DAG
    this.registerNode(new PythonNode("file_discovery", "python/nodes/file_discovery.py", []));
    
    this.registerNode(new PythonNode("flight_path_cleaner", "python/nodes/flight_path_cleaner.py", ["file_discovery"]));
    
    this.registerNode(new PythonNode("time_synchronizer", "python/nodes/time_synchronizer.py", ["flight_path_cleaner"]));
    
    this.registerNode(new PythonNode("diurnal_corrector", "python/nodes/diurnal_corrector.py", ["time_synchronizer"]));
    
    this.registerNode(new PythonNode("qc_engine", "python/nodes/qc_engine.py", ["diurnal_corrector"]));
    
    // Presentation Adapters
    this.registerNode(new PythonNode("excel_export_adapter", "python/adapters/excel_export_adapter.py", ["qc_engine"]));
    this.registerNode(new PythonNode("report_export_adapter", "python/adapters/report_export_adapter.py", ["qc_engine"]));
  }
}
