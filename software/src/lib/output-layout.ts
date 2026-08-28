/**
 * Put G-AID Output inside the survey folder. Versioned products live in
 * `G-AID Output/runs/{runId}/` — see `run-layout.ts`.
 */

export {
  resolveGaidOutputDir,
  resolveRunLayout,
  runsDir,
  RUNS_SUBDIR,
} from "@/lib/run-layout";
