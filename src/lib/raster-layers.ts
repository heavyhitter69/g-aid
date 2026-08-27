const GRID_RE = /\.(tif|tiff|asc|npz|npy)$/i;

function posix(path: string): string {
  return path.replace(/\\/g, "/");
}

export function isGridPath(path: string): boolean {
  return GRID_RE.test(posix(path));
}

/** Job folders under G-AID Output, including `runs/{runId}` and legacy `{leaf} - {job}`. */
export function listJobFolders(allPaths: string[], outputFolder: string): string[] {
  const prefix = posix(outputFolder).replace(/\/$/, "");
  const jobs = new Set<string>();
  for (const raw of allPaths) {
    const id = posix(raw);
    if (id !== prefix && !id.startsWith(`${prefix}/`)) continue;
    const rest = id.slice(prefix.length + 1);
    const parts = rest.split("/").filter(Boolean);
    if (!parts.length) continue;
    if (parts[0] === "runs" && parts[1]) {
      jobs.add(`${prefix}/runs/${parts[1]}`);
    } else if (parts[0] && parts[0] !== "runs") {
      jobs.add(`${prefix}/${parts[0]}`);
    }
  }
  return [...jobs];
}

function basename(path: string): string {
  const n = posix(path);
  return n.split("/").pop() || n;
}

function stem(path: string): string {
  return basename(path).replace(/\.(tif|tiff|asc|npz|npy)$/i, "").toLowerCase();
}

function extRank(path: string): number {
  const n = path.toLowerCase();
  if (n.endsWith(".asc")) return 0;
  if (n.endsWith(".tif") || n.endsWith(".tiff")) return 1;
  return 2;
}

function layerOrder(base: string): number {
  if (base.includes("tmi_microleveled") || base.includes("tmi")) return 0;
  if (base.includes("rtp")) return 1;
  if (base.includes("map_")) return 35;
  if (base.includes("thd")) return 2;
  if (base.includes("analytic")) return 3;
  if (base.includes("tilt")) return 4;
  if (base.includes("1vd") || base.includes("vertical")) return 5;
  if (base.includes("pseudo_gravity")) return 6;
  if (base.includes("2vd")) return 7;
  if (base.includes("section") || base.includes("pseudosection") || base.includes("rad_ternary")) return 80;
  return 40;
}

export function layerLabel(pathOrStem: string): string {
  const base = stem(pathOrStem);
  if (base.includes("tmi_microleveled")) return "TMI microleveled";
  if (base.includes("tmi")) return "TMI";
  if (base.includes("rtp")) return "RTP";
  if (base.includes("pseudo_gravity")) return "Pseudo-gravity";
  if (base.includes("near_zone_terrain_corrected_bouguer")) {
    return "Near-zone terrain-corrected Bouguer (not complete Bouguer)";
  }
  if (base.includes("complete_bouguer")) {
    return "Do not use — mislabelled complete Bouguer";
  }
  if (base.includes("bouguer") && !base.includes("pseudo")) return "Simple Bouguer";
  if (base.includes("2vd")) return "2VD";
  if (/\bthd\b/.test(base) || base.includes("thd")) return "THD";
  if (base.includes("analytic")) return "Analytic signal";
  if (base.includes("tilt")) return "Tilt";
  if (base.includes("1vd")) return "1VD";
  if (base.includes("seismic")) return "Seismic section";
  if (base.includes("gpr")) return "GPR section";
  if (base.includes("pseudosection") || base.includes("pseudo")) return "Pseudosection";
  if (base.includes("rad_k_grid")) return "K channel";
  if (base.includes("rad_eu_grid")) return "eU channel";
  if (base.includes("rad_eth_grid")) return "eTh channel";
  if (base.includes("rad_tc_grid")) return "TC channel";
  if (base.includes("rad_ternary")) return "K-eTh-eU ternary (not lithology)";
  return base.replace(/_/g, " ");
}

export function rasterLayersFromPaths(paths: string[]): { id: string; label: string }[] {
  const byBase = new Map<string, { id: string; rank: number }>();
  for (const raw of paths) {
    const id = posix(raw);
    if (!GRID_RE.test(id)) continue;
    const base = stem(id);
    const rank = extRank(id);
    const prev = byBase.get(base);
    if (!prev || rank < prev.rank) byBase.set(base, { id, rank });
  }
  return [...byBase.entries()]
    .sort((a, b) => layerOrder(a[0]) - layerOrder(b[0]) || a[0].localeCompare(b[0]))
    .map(([, { id }]) => ({ id, label: layerLabel(id) }));
}

export function folderOf(path: string): string {
  const n = posix(path);
  const i = n.lastIndexOf("/");
  return i >= 0 ? n.slice(0, i) : "";
}

export function posixPath(path: string): string {
  return posix(path);
}

export function fileStem(path: string): string {
  return stem(path);
}

export function fileBasename(path: string): string {
  return basename(path);
}

export function pathsUnder(files: string[], folder: string): string[] {
  const prefix = posix(folder);
  return files.filter((raw) => {
    const id = posix(raw);
    return id === prefix || id.startsWith(`${prefix}/`);
  });
}
