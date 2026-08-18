import path from "path";
import { GAID_OUTPUT_DIR } from "@/lib/workspace-index";

const DAY_LEAF = /^day\s*\d+$/i;

function safeLeaf(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/]+/g, " ").trim();
  return cleaned || fallback;
}

/**
 * Put G-AID Output inside the survey folder, with a single day/job folder under it.
 * SANBUSI/DAY 1 → {root}/SANBUSI/G-AID Output/DAY 1 - diurnal+IGRF
 * DAY 1 (workspace is SANBUSI) → {root}/G-AID Output/DAY 1 - diurnal+IGRF
 */
export function resolveOutputLayout(
  workspaceRoot: string,
  targetFolder: string,
  projectName: string,
  job: string
): { outputDir: string; taskFolder: string; productsRel: string } {
  const parts = targetFolder.replace(/\\/g, "/").split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  const leaf = safeLeaf(last || projectName || "survey", "survey");
  const taskFolder = `${leaf} - ${job}`;

  let outputDir: string;
  if (parts.length >= 2) {
    outputDir = path.join(workspaceRoot, ...parts.slice(0, -1), GAID_OUTPUT_DIR);
  } else if (parts.length === 1 && !DAY_LEAF.test(parts[0])) {
    outputDir = path.join(workspaceRoot, parts[0], GAID_OUTPUT_DIR);
  } else {
    outputDir = path.join(workspaceRoot, GAID_OUTPUT_DIR);
  }

  const productsRel = path
    .relative(workspaceRoot, path.join(outputDir, taskFolder))
    .replace(/\\/g, "/");

  return { outputDir, taskFolder, productsRel };
}
