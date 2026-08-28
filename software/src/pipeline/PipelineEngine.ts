import { PipelineEvent, ScientificArtifact } from './interfaces';
import { executePythonNode, type NodeResult } from '@/lib/python-runtime';

export type { NodeResult };

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

export async function streamAgentOrchestration(prompt: string, sessionId: string, onToken: (agent: string, text: string) => void) {
  try {
    const response = await fetch('http://127.0.0.1:8000/api/v1/orchestrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, session_id: sessionId })
    });

    if (!response.body) throw new Error("No response body received from Python Core Engine");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep partial line in buffer

      for (const line of lines) {
        if (line.startsWith('\x00') && line.endsWith('\x02')) {
          const cleanLine = line.slice(1, -1); // Strip control bytes
          const match = cleanLine.match(/^\[(.*?)\] (.*)$/);
          if (match) {
            const [_, agentName, content] = match;
            onToken(agentName, content);
          }
        }
      }
    }
  } catch (error) {
    console.error("FastAPI streaming failed:", error);
    onToken("SYSTEM", `Error communicating with Python backend: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export class ChildProcessRuntime {
  static async execute(
    nodeId: string,
    scriptPath: string,
    inputArtifacts: ScientificArtifact[],
    parameters: Record<string, unknown>
  ): Promise<NodeResult> {
    const started: PipelineEvent = {
      type: "NODE_STARTED",
      nodeId,
      message: `Started node ${nodeId} via ChildProcessRuntime`,
      timestamp: new Date().toISOString(),
    };
    const result = await executePythonNode(nodeId, scriptPath, inputArtifacts, parameters);
    const events = [started, ...(result.events || [])];
    if (result.success) {
      const skipped =
        (result.artifacts || []).length === 0 &&
        (result.events || []).some((event) => /skipped:/i.test(event.message || ""));
      events.push({
        type: "NODE_COMPLETED",
        nodeId,
        message: skipped ? `Skipped node ${nodeId}` : `Completed node ${nodeId}`,
        timestamp: new Date().toISOString(),
        payload: {
          artifacts: result.artifacts || [],
          skipped,
        },
      });
    }
    return {
      ...result,
      events,
    };
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
          result.events.forEach((event) =>
            onEvent({ ...event, nodeId: event.nodeId || node.id })
          );

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
