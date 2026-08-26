export type WorkspaceFileKind = "gsm19-base" | "magarrow" | "tabular" | "other";

export interface WorkspaceIndexFile {
  relativePath: string;
  name: string;
  size: number;
  ext: string;
  kind: WorkspaceFileKind | string;
}

export interface WorkspaceIndex {
  root: string;
  folders: string[];
  files: WorkspaceIndexFile[];
  truncated: boolean;
}

/** Search hit shape used in catalogs. Kept here so this file has no search import cycle. */
export interface WorkspaceCatalogHit {
  relativePath: string;
  name?: string;
  kind: string;
  why?: string;
  snippet?: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function kindLabel(kind: string): string {
  if (kind === "gsm19-base") return "GSM-19 base station";
  if (kind === "magarrow") return "MagArrow airborne";
  if (kind === "tabular") return "tabular";
  return kind;
}

function formatCatalogHits(hits: WorkspaceCatalogHit[], misses: string[] = []): string {
  const lines: string[] = [];
  if (hits.length) {
    lines.push("Search hits (from the open folder, not a built-in catalog):");
    for (const hit of hits.slice(0, 24)) {
      const extra = hit.snippet ? ` — ${hit.snippet}` : "";
      lines.push(`- ${hit.relativePath} (${hit.kind}${hit.why ? `, ${hit.why}` : ""}${extra})`);
    }
  }
  if (misses.length) {
    lines.push(`Named but not found in the open folder: ${misses.join(", ")}`);
  }
  return lines.join("\n");
}

/** Compact catalog for the orchestrator — paths and types, not file bodies. */
export function formatWorkspaceForAgent(
  index: WorkspaceIndex | null,
  maxFiles = 80,
  hits: WorkspaceCatalogHit[] = []
): string {
  if (!index) return "";
  const lines: string[] = [
    `Root: ${index.root}`,
    `Folders: ${index.folders.filter((f) => !isGaidOutputPath(f)).slice(0, 40).join(", ") || "(none)"}`,
    `Files indexed: ${index.files.filter((f) => !isGaidOutputPath(f.relativePath)).length}${index.truncated ? " (truncated; name a folder or file and I will search)" : ""}`,
  ];

  const searchBlock = formatCatalogHits(hits);
  if (searchBlock) lines.push(searchBlock);

  const surveyFiles = index.files.filter((f) => !isGaidOutputPath(f.relativePath));
  const hitPaths = new Set(hits.map((hit) => hit.relativePath.replace(/\\/g, "/")));
  const preferred = surveyFiles.filter((file) =>
    hitPaths.has(file.relativePath.replace(/\\/g, "/"))
  );
  const shown = (preferred.length ? preferred : surveyFiles).slice(0, maxFiles);
  for (const file of shown) {
    lines.push(`- ${file.relativePath} (${kindLabel(file.kind)}, ${formatSize(file.size)})`);
  }
  if (surveyFiles.length > shown.length) {
    lines.push(`- … ${surveyFiles.length - shown.length} more files (name one to search)`);
  }
  return lines.join("\n");
}

/** True for G-AID Output itself or anything nested under it. */
export function isGaidOutputPath(rel: string): boolean {
  return rel
    .replace(/\\/g, "/")
    .split("/")
    .some((part) => part.toLowerCase() === "g-aid output");
}

export const GAID_OUTPUT_DIR = "G-AID Output";

export type AnalysisIntent =
  | "diurnal"
  | "rtp"
  | "magnetic"
  | "gravity"
  | "resistivity"
  | "seismic"
  | "radiometrics"
  | "gpr";

export function splitUserAndContext(message: string): { userText: string; context: string } {
  const match = message.match(/\n\n--- (?:Workspace|File Context) ---/);
  if (!match || match.index === undefined) return { userText: message.trim(), context: "" };
  return {
    userText: message.slice(0, match.index).trim(),
    context: message.slice(match.index).trim(),
  };
}

export function detectAnalysisIntent(message: string): AnalysisIntent | null {
  const m = message.toLowerCase();
  const wantsWork =
    /\b(do|run|perform|apply|start|process|correct|execute|analyse|analyze|plan|invert|grid|reduce)\b/.test(m) ||
    /\bday\s*\d+\b/.test(m);
  if (/\b(segy|seismic|nmo|stack|kirchhoff)\b/.test(m)) return "seismic";
  if (/\b(ert|resistivity|wenner|schlumberger|dipole[\s-]?dipole|pseudosection)\b/.test(m)) return "resistivity";
  if (/\b(bouguer|free[\s-]?air|gravity|mgal)\b/.test(m)) return "gravity";
  if (/\b(radiometr|spectrometer|nasvd)\b/.test(m)) return "radiometrics";
  if (/\b(gpr|ground[\s-]?penetrating)\b/.test(m)) return "gpr";
  const diurnal =
    /\bdiurnal\b/.test(m) ||
    (/\bbase[\s-]?station\b/.test(m) && /\b(correct|correction|reduc)/.test(m));
  const rtp = /\brtp\b/.test(m) || /reduction to (the )?pole/.test(m);
  if (rtp && diurnal) return "magnetic";
  if (rtp) return "rtp";
  if (diurnal) return "diurnal";
  if (wantsWork && /\b(mag|magnetic|airborne|tmi|igrf|magarrow|gsm-?19)\b/.test(m)) return "magnetic";
  return null;
}

/** True when the user asked what the open folder contains, not to process it. */
export function isProjectInventoryQuestion(message: string): boolean {
  const t = message.trim().toLowerCase();
  if (!t) return false;
  if (isProceedPhrase(t) || detectAnalysisIntent(t)) return false;
  if (/what(?:'s| is|s) in (this|the|my) (project|folder|workspace|survey|directory)/.test(t)) return true;
  if (/\b(show|list|summarise|summarize)\b.*\b(catalog|dataset|files|inventory)\b/.test(t)) return true;
  if (/\bwhat files\b/.test(t) && /\b(project|folder|workspace|survey|here)\b/.test(t)) return true;
  if (/^(inventory|dataset explorer)\b/.test(t)) return true;
  return false;
}

/** True when the user asked a definition / explainer, not to work their files. */
export function isGeneralKnowledgeQuestion(message: string): boolean {
  const t = message.trim();
  if (!t || t.length > 220) return false;
  if (detectAnalysisIntent(t)) return false;
  if (/\b(my|this|the) (survey|data|folder|project|grid|file)s?\b/i.test(t)) return false;
  return /^(what(?:'s|s)?|who(?:'s|s)?|define|explain|how does|how do|tell me about|why (?:is|are|do|does))\b/i.test(t);
}

/** Attach the folder catalog only when the user is talking about those files. */
export function wantsWorkspaceContext(message: string): boolean {
  const t = message.trim();
  if (!t || isGeneralKnowledgeQuestion(t)) return false;
  if (detectAnalysisIntent(t) || isProceedPhrase(t) || isProjectInventoryQuestion(t)) return true;
  return /\b(survey|dataset|workspace|catalog|magarrow|gsm-?19|day\s*\d+|g-aid output|this (file|folder|project|grid)|my (data|survey|files)|look at (the |my )?(data|survey|files)|process (the |my |this )?(data|survey)|find |where is|search )\b/i.test(
    t
  ) || /["'`][^"'`]{2,}["'`]/.test(t) || /\b[A-Z][A-Z0-9_-]{3,}\b/.test(t) || /\.(csv|txt|dat|xyz|las|sgy|segy|dzt)\b/i.test(t);
}

export function isProceedPhrase(message: string): boolean {
  const t = message.trim().toLowerCase().replace(/[.!]+$/, "");
  if (/^(yes[, ]+)?(proceed|go ahead|looks good|sounds good|approved|approve it|do it|run it|execute|lgtm|ok proceed|okay proceed)$/.test(t)) {
    return true;
  }
  if (/^i approve the implementation plan/.test(t)) return true;
  if (/\bapprov/.test(t) && /\bplease proceed$/.test(t)) return true;
  return false;
}

export function isProcessingRequest(message: string): boolean {
  if (!message.trim() || isGeneralKnowledgeQuestion(message) || isProjectInventoryQuestion(message)) return false;
  if (detectAnalysisIntent(message)) return true;
  const t = message.toLowerCase();
  if (/\bday\s*\d+\b/.test(t) && /\b(do|run|perform|apply|start|process|correct|execute|analyse|analyze|plan|grid)\b/.test(t)) {
    return true;
  }
  return /\b(process|correct|grid|analyse|analyze)\b/.test(t) && /\b(day\s*\d+|survey|folder|magarrow|gsm-?19)\b/.test(t);
}

export function isDiurnalRunRequest(message: string): boolean {
  return detectAnalysisIntent(message) === "diurnal";
}

export function dayFolderNames(index: WorkspaceIndex | null): string[] {
  const names = new Set<string>();
  for (const folder of index?.folders ?? []) {
    if (isGaidOutputPath(folder)) continue;
    const leaf = folder.replace(/\\/g, "/").split("/").pop() || folder;
    if (/^day\s*\d+$/i.test(leaf)) names.add(leaf);
  }
  for (const file of index?.files ?? []) {
    if (isGaidOutputPath(file.relativePath)) continue;
    const leaf = file.relativePath.replace(/\\/g, "/").split("/")[0];
    if (leaf && /^day\s*\d+$/i.test(leaf)) names.add(leaf);
  }
  return [...names].sort((a, b) => {
    const na = parseInt(a.replace(/\D/g, ""), 10);
    const nb = parseInt(b.replace(/\D/g, ""), 10);
    return na - nb;
  });
}

export function filesInTarget(index: WorkspaceIndex | null, targetFolder: string): WorkspaceIndexFile[] {
  const files = (index?.files ?? []).filter((file) => !isGaidOutputPath(file.relativePath));
  if (!targetFolder) return files;
  const prefix = targetFolder.replace(/\\/g, "/").replace(/\/$/, "");
  return files.filter((file) => {
    const rel = file.relativePath.replace(/\\/g, "/");
    return rel === prefix || rel.startsWith(`${prefix}/`);
  });
}

export function buildWorkspaceBrief(
  index: WorkspaceIndex | null,
  root: string,
  targetFolder: string,
  hits: WorkspaceCatalogHit[] = [],
  misses: string[] = []
): string {
  const survey = root.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || root;
  const days = dayFolderNames(index);
  const target = targetFolder || "(entire opened folder)";
  const scoped = filesInTarget(index, targetFolder);
  const base = scoped.filter((f) => f.kind === "gsm19-base");
  const air = scoped.filter((f) => f.kind === "magarrow");
  const other = scoped.filter((f) => f.kind !== "gsm19-base" && f.kind !== "magarrow");
  const lines = [
    `Survey folder: ${survey}`,
    `Path: ${root}`,
    `Day folders: ${days.length ? days.join(", ") : "(none named DAY N)"}`,
    `Target for this job: ${target}`,
    `Files in target: ${scoped.length}`,
    `  GSM-19 base station: ${base.length}`,
    `  MagArrow airborne: ${air.length}`,
    `  Other: ${other.length}`,
  ];
  const searchBlock = formatCatalogHits(hits, misses);
  if (searchBlock) lines.push(searchBlock);
  const shown = [...base, ...air, ...other].slice(0, 40);
  for (const file of shown) {
    lines.push(`  - ${file.relativePath} (${kindLabel(file.kind)}, ${formatSize(file.size)})`);
  }
  if (scoped.length > shown.length) {
    lines.push(`  - … ${scoped.length - shown.length} more`);
  }
  return lines.join("\n");
}

export function isAbsoluteDiskPath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/");
}
