export type TaskTickStatus = "in_progress" | "complete" | "skipped";

function checkboxFor(status: TaskTickStatus): string {
  if (status === "in_progress") return "- [!s] ";
  if (status === "skipped") return "- [~] ";
  return "- [x] ";
}

function replaceCheckbox(line: string, status: TaskTickStatus): string {
  return line.replace(/^(\s*)- \[[^\]]*\] /, `$1${checkboxFor(status)}`);
}

/** Tick a task by kernel node id (`<!-- node:igrf_corrector -->`). Nested items follow the parent. */
export function checkNodeInTasks(content: string, nodeId: string, status: TaskTickStatus = "complete"): string {
  const marker = `<!-- node:${nodeId} -->`;
  const lines = content.split("\n");
  let inPhase = false;
  let parentIndent = 0;
  return lines
    .map((line) => {
      if (line.includes(marker)) {
        inPhase = true;
        parentIndent = line.match(/^\s*/)?.[0].length ?? 0;
        return replaceCheckbox(line, status);
      }
      if (inPhase) {
        const indent = line.match(/^\s*/)?.[0].length ?? 0;
        if (/^- \[[^\]]*\] /.test(line) && indent <= parentIndent) {
          inPhase = false;
          return line;
        }
        if (indent > parentIndent && /- \[[^\]]*\] /.test(line)) {
          return replaceCheckbox(line, status === "in_progress" ? "in_progress" : status);
        }
        if (line.startsWith("---") || (line.startsWith("##") && !line.includes(marker))) {
          inPhase = false;
        }
      }
      return line;
    })
    .join("\n");
}
