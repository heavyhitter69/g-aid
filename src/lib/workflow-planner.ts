/**
 * workflow-planner.ts
 * DAG compiler — delegates to the live magnetic capability registry.
 * There is no second workflow architecture.
 */

import { compileCapabilityDag, type CompiledDag } from "./capabilities/compile.ts";

export function compileDAG(capabilityIds: string[]): CompiledDag {
  return compileCapabilityDag(capabilityIds);
}

export function renderMarkdown(dag: CompiledDag): string {
  const lines = [
    `# Workflow Plan`,
    ``,
    `**Capabilities:** ${dag.requestedCapabilityIds.join(", ") || "(none)"}`,
    ``,
    `## Compiled nodes`,
    ``,
  ];
  for (const node of dag.nodes) {
    lines.push(`- \`${node.id}\` ${node.label}`);
  }
  if (!dag.nodes.length) {
    lines.push(`- (none — unregistered capabilities do not compile)`);
  }
  return lines.join("\n");
}
