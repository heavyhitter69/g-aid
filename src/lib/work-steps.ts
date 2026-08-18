export type WorkStepStatus = "running" | "done" | "warning";

export interface WorkStep {
  id: string;
  label: string;
  status: WorkStepStatus;
}

const NODE_LABELS: Record<string, { running: string; done: string }> = {
  file_discovery: { running: "Reading survey files", done: "Read survey files" },
  flight_path_cleaner: { running: "Cleaning flight path", done: "Cleaned flight path" },
  time_synchronizer: { running: "Synchronizing times", done: "Synchronized times" },
  diurnal_corrector: { running: "Applying diurnal correction", done: "Applied diurnal correction" },
  qc_engine: { running: "Checking quality", done: "Quality check" },
  igrf_corrector: { running: "Removing Earth's main field", done: "Removed Earth's main field" },
  heading_lag_corrector: { running: "Applying heading and lag", done: "Applied heading and lag" },
  tie_line_leveler: { running: "Levelling traverses to ties", done: "Levelled traverses to ties" },
  mag_gridder: { running: "Gridding", done: "Gridded the residual" },
  grid_microleveller: { running: "2-D microlevelling the grid", done: "Microlevelled the TMI grid" },
  rtp_filter: { running: "Reducing to pole", done: "Reduced to pole" },
  fft_derivatives: { running: "Computing MAGMAP products", done: "Wrote MAGMAP products" },
  map_composer: { running: "Composing report maps", done: "Wrote report maps" },
  lineament_extractor: { running: "Extracting lineaments", done: "Extracted lineaments" },
  gis_export: { running: "Writing maps", done: "Wrote maps" },
  microleveller: { running: "Microlevelling flight lines", done: "Microlevelled flight lines" },
  euler_deconvolution: { running: "Euler deconvolution", done: "Wrote Euler solutions" },
  gravity_reduce: { running: "Bouguer reduction", done: "Bouguer reduced" },
  regional_residual: { running: "Separating regional-residual", done: "Separated regional-residual" },
  ert_pseudosection: { running: "Building ERT pseudosection", done: "Wrote ERT pseudosection" },
  ert_invert: { running: "Inverting ERT", done: "Inverted ERT" },
  seismic_process: { running: "Processing seismic", done: "Processed seismic" },
  gpr_process: { running: "Processing GPR", done: "Processed GPR" },
  radiometric_correct: { running: "Correcting radiometrics", done: "Corrected radiometrics" },
  las_ingest: { running: "Reading well log", done: "Wrote well log" },
  excel_export_adapter: { running: "Writing tables", done: "Wrote tables" },
  report_export_adapter: { running: "Writing QC notes", done: "Wrote QC notes" },
};

export function workStepFromEvent(nodeId: string | undefined, message: string): WorkStep | null {
  if (!message || /skipped:/i.test(message)) return null;
  const asMatch = message.match(/^Read (.+) as /);
  const parenMatch = message.match(/^Read (.+) \(/);
  const name = asMatch?.[1] || parenMatch?.[1];
  if (name) {
    return { id: `read:${name}`, label: `Reading ${name}`, status: "running" };
  }
  const classified = message.match(/^Classified (.+?) as /);
  if (classified) {
    const name = classified[1];
    return { id: `read:${name}`, label: `Reading ${name}`, status: "running" };
  }
  const key = nodeId || "step";
  const mapped = NODE_LABELS[key];
  if (mapped) return { id: key, label: mapped.running, status: "running" };
  return { id: `${key}:${message.slice(0, 40)}`, label: message.replace(/^Wrote /, "Writing "), status: "running" };
}

export function doneLabel(step: WorkStep): string {
  if (step.label.startsWith("Reading ")) return `Read ${step.label.slice("Reading ".length)}`;
  const mapped = NODE_LABELS[step.id];
  if (mapped) return mapped.done;
  if (step.label.startsWith("Writing ")) return `Wrote ${step.label.slice("Writing ".length)}`;
  if (step.label.startsWith("Applying ")) return `Applied ${step.label.slice("Applying ".length)}`;
  if (step.label.startsWith("Cleaning ")) return `Cleaned ${step.label.slice("Cleaning ".length)}`;
  if (step.label.startsWith("Synchronizing ")) return `Synchronized ${step.label.slice("Synchronizing ".length)}`;
  if (step.label.startsWith("Computing ")) return `Computed ${step.label.slice("Computing ".length)}`;
  if (step.label.startsWith("Extracting ")) return `Extracted ${step.label.slice("Extracting ".length)}`;
  if (step.label.startsWith("Levelling ")) return `Levelled ${step.label.slice("Levelling ".length)}`;
  if (step.label.startsWith("Removing ")) return `Removed ${step.label.slice("Removing ".length)}`;
  if (step.label.startsWith("Reducing ")) return `Reduced ${step.label.slice("Reducing ".length)}`;
  if (step.label.startsWith("Gridding")) return "Gridded the residual";
  if (step.label.startsWith("Checking ")) return step.label.replace("Checking ", "Checked ");
  return step.label;
}

export function upsertWorkStep(steps: WorkStep[], next: WorkStep): WorkStep[] {
  const completed = steps.map((step) =>
    step.status === "running" ? { ...step, status: "done" as const } : step
  );
  const existing = completed.findIndex((step) => step.id === next.id);
  if (existing >= 0) {
    const copy = [...completed];
    copy[existing] = next;
    return copy;
  }
  return [...completed, next];
}
