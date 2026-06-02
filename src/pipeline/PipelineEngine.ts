import { PipelineEvent, PipelineNodeExecution, ScientificArtifact } from './interfaces';

export interface NodeResult {
  artifacts: ScientificArtifact[];
  events: PipelineEvent[];
  success: boolean;
  error?: string;
}

export abstract class PipelineNode {
  id: string;
  dependencies: string[];

  constructor(id: string, dependencies: string[] = []) {
    this.id = id;
    this.dependencies = dependencies;
  }

  abstract execute(
    inputArtifacts: ScientificArtifact[],
    parameters: Record<string, unknown>
  ): Promise<NodeResult>;
}

import { spawn } from 'child_process';

export class ChildProcessRuntime {
  static async execute(
    nodeId: string,
    scriptPath: string,
    inputArtifacts: ScientificArtifact[],
    parameters: Record<string, unknown>
  ): Promise<NodeResult> {
    return new Promise((resolve) => {
      const payload = {
        node_id: nodeId,
        input_artifacts: inputArtifacts,
        parameters: parameters
      };

      const pythonProcess = spawn('python', [scriptPath]);
      const events: PipelineEvent[] = [];
      const artifacts: ScientificArtifact[] = [];
      let errorMessage = "";

      events.push({
        type: "NODE_STARTED",
        nodeId,
        message: `Started node ${nodeId} via ChildProcessRuntime`,
        timestamp: new Date().toISOString()
      });

      // Pass payload to python via stdin
      pythonProcess.stdin.write(JSON.stringify(payload) + "\n");
      pythonProcess.stdin.end();

      let stdoutData = "";
      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        errorMessage += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          resolve({
            artifacts: [],
            events: events,
            success: false,
            error: `Python process exited with code ${code}. Stderr: ${errorMessage}`
          });
          return;
        }

        try {
          // Parse the final JSON output from python node
          // The node might output debugging prints. We look for the last valid JSON block.
          const lines = stdoutData.trim().split('\n');
          let parsedResult = null;
          for (let i = lines.length - 1; i >= 0; i--) {
            try {
              parsedResult = JSON.parse(lines[i]);
              break;
            } catch (e) {
              // Ignore lines that aren't JSON
            }
          }

          if (parsedResult) {
            if (parsedResult.artifacts) artifacts.push(...parsedResult.artifacts);
            if (parsedResult.events) events.push(...parsedResult.events);
          } else {
             // Fallback if no valid JSON found
             errorMessage = "No valid JSON returned from python node. stdout: " + stdoutData;
             resolve({ artifacts: [], events, success: false, error: errorMessage });
             return;
          }

          events.push({
            type: "NODE_COMPLETED",
            nodeId,
            message: `Completed node ${nodeId}`,
            timestamp: new Date().toISOString()
          });

          resolve({
            artifacts,
            events,
            success: true
          });
        } catch (e: any) {
          resolve({
            artifacts: [],
            events,
            success: false,
            error: `Failed to parse python output: ${e.message}`
          });
        }
      });
    });
  }
}

export class PipelineEngine {
  private nodes: Map<string, PipelineNode> = new Map();

  registerNode(node: PipelineNode) {
    this.nodes.set(node.id, node);
  }

  /**
   * Traverses the DAG and executes nodes whose dependencies have been met.
   * Emits events using the provided callback for real-time telemetry (SSE).
   */
  async runPipeline(
    initialArtifacts: ScientificArtifact[],
    onEvent: (event: PipelineEvent) => void,
    globalParameters: Record<string, unknown> = {}
  ): Promise<boolean> {
    onEvent({
      type: "NODE_STARTED",
      message: "Pipeline orchestration started.",
      timestamp: new Date().toISOString()
    });

    const completedNodes = new Set<string>();
    const artifactRegistry = [...initialArtifacts];

    // Simple BFS/Topological execution stub
    let remainingNodes = Array.from(this.nodes.values());

    while (remainingNodes.length > 0) {
      // Find all nodes whose dependencies are satisfied
      const readyNodes = remainingNodes.filter(node =>
        node.dependencies.every(dep => completedNodes.has(dep))
      );

      if (readyNodes.length === 0) {
        onEvent({
          type: "PIPELINE_FAILED",
          message: "Pipeline deadlocked. Unmet dependencies.",
          severity: "fatal",
          timestamp: new Date().toISOString()
        });
        return false;
      }

      // Execute all ready nodes concurrently (or sequentially for safety)
      for (const node of readyNodes) {
        onEvent({
          type: "NODE_STARTED",
          nodeId: node.id,
          message: `Executing node: ${node.id}`,
          timestamp: new Date().toISOString()
        });

        try {
          // Pass relevant artifacts downstream. A real implementation
          // might filter artifactRegistry for only the ones this node needs.
          const result = await node.execute(artifactRegistry, globalParameters);

          // Bubble up events
          result.events.forEach(onEvent);

          if (!result.success) {
            onEvent({
              type: "PIPELINE_FAILED",
              nodeId: node.id,
              message: `Node ${node.id} failed: ${result.error}`,
              severity: "fatal",
              timestamp: new Date().toISOString()
            });
            return false;
          }

          // Register generated artifacts
          artifactRegistry.push(...result.artifacts);
          completedNodes.add(node.id);

        } catch (error: any) {
          onEvent({
            type: "PIPELINE_FAILED",
            nodeId: node.id,
            message: `Exception in node ${node.id}: ${error.message}`,
            severity: "fatal",
            timestamp: new Date().toISOString()
          });
          return false;
        }
      }

      // Remove completed nodes from remaining pool
      remainingNodes = remainingNodes.filter(n => !completedNodes.has(n.id));
    }

    onEvent({
      type: "PIPELINE_COMPLETE",
      message: "Pipeline completed successfully.",
      timestamp: new Date().toISOString()
    });

    return true;
  }
}
