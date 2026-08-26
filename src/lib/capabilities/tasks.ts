import { GAID_OUTPUT_DIR } from "../workspace-index.ts";
import { compileCapabilityDag } from "./compile.ts";
import { capabilitiesFromSteps } from "./propose.ts";
import type { CompiledDag } from "./types.ts";

export function taskNodeIdsFromMarkdown(markdown: string): string[] {
  return [...markdown.matchAll(/<!--\s*node:([^\s]+)\s*-->/g)].map((match) => match[1]);
}

export function dagForPlan(plan: {
  steps?: Record<string, boolean>;
  capabilities?: string[];
  dag?: CompiledDag | null;
}): CompiledDag {
  if (plan.dag?.nodes?.length) return plan.dag;
  const ids = plan.capabilities?.length
    ? plan.capabilities
    : capabilitiesFromSteps(plan.steps || {});
  return compileCapabilityDag(ids);
}

export function generateTasksMarkdown(plan: {
  projectName: string;
  taskFolder: string;
  productsRel?: string;
  targetFolder?: string;
  steps?: Record<string, boolean>;
  parameters?: { baseReference?: string };
  runId?: string;
  capabilities?: string[];
  dag?: CompiledDag | null;
}): string {
  const target = plan.targetFolder || plan.projectName;
  const dag = dagForPlan(plan);
  const nodeTag = (id: string): string => `<!-- node:${id} -->`;

  const lines = [
    `# Tasks`,
    ``,
    `**Project:** ${plan.projectName}`,
    `**Target:** ${target}`,
    `**Products:** \`${plan.productsRel || `${GAID_OUTPUT_DIR}/runs/${plan.taskFolder}`}/\``,
    plan.runId ? `**Run:** \`${plan.runId}\`` : "",
    plan.parameters?.baseReference ? `**Base reference:** \`${plan.parameters.baseReference}\`` : "",
    plan.capabilities?.length ? `**Capabilities:** ${plan.capabilities.join(", ")}` : "",
    ``,
    `This checklist is generated from the compiled DAG. Items tick when the matching kernel finishes.`,
    ``,
    `## Tasks`,
    ``,
  ].filter((line, i, arr) => line !== "" || arr[i - 1] !== "");

  if (!dag.nodes.length) {
    lines.push(`- [ ] No registered magnetic nodes to execute`, ``);
  } else {
    for (const node of dag.nodes) {
      lines.push(`- [ ] ${node.label} ${nodeTag(node.id)}`);
    }
    lines.push(``);
  }

  lines.push(
    `- [ ] Write products to ${GAID_OUTPUT_DIR}/runs ${nodeTag("write_products")}`,
    ``,
    `---`,
    ``,
    `*Execution started: ${new Date().toISOString()}*`
  );
  return lines.join("\n");
}
