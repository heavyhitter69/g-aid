"use client";

import { useAppStore } from "@/store/app-store";

export interface JobResults {
  taskFolder: string;
  productsRel: string;
  files: string[];
  activeLayerId?: string;
}

const GRID_RE = /\.(tif|tiff|asc|npz|npy)$/i;

export function isGridPath(path: string): boolean {
  return GRID_RE.test(posix(path));
}

function posix(path: string): string {
  return path.replace(/\\/g, "/");
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
  if (n.endsWith(".tif") || n.endsWith(".tiff")) return 0;
  if (n.endsWith(".asc")) return 1;
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
  if (base.includes("section") || base.includes("pseudosection")) return 80;
  return 40;
}

export function layerLabel(pathOrStem: string): string {
  const base = stem(pathOrStem);
  if (base.includes("tmi_microleveled")) return "TMI microleveled";
  if (base.includes("tmi")) return "TMI";
  if (base.includes("rtp")) return "RTP";
  if (base.includes("pseudo_gravity")) return "Pseudo-gravity";
  if (base.includes("2vd")) return "2VD";
  if (/\bthd\b/.test(base) || base.includes("thd")) return "THD";
  if (base.includes("analytic")) return "Analytic signal";
  if (base.includes("tilt")) return "Tilt";
  if (base.includes("1vd")) return "1VD";
  if (base.includes("seismic")) return "Seismic section";
  if (base.includes("gpr")) return "GPR section";
  if (base.includes("pseudosection") || base.includes("pseudo")) return "Pseudosection";
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

export function jobFilesFromEpilogue(epilogue: {
  taskFolder?: string;
  productsRel?: string;
  projectFilesUpdates?: { id?: string; path?: string }[];
}): JobResults | null {
  const files = (epilogue.projectFilesUpdates || [])
    .map((file) => posix(file.path || file.id || ""))
    .filter(Boolean);
  if (!files.length) return null;
  const productsRel =
    (epilogue.productsRel && posix(epilogue.productsRel)) ||
    folderOf(files[0]);
  return {
    taskFolder: epilogue.taskFolder || basename(productsRel) || "Results",
    productsRel,
    files,
  };
}

export function presentJobResultsFromEpilogue(epilogue: {
  type?: string;
  taskFolder?: string;
  productsRel?: string;
  projectFilesUpdates?: { id?: string; path?: string }[];
}): void {
  if (epilogue.type !== "execution_complete") return;
  const results = jobFilesFromEpilogue(epilogue);
  if (!results) return;
  useAppStore.getState().presentJobResults(results);
}

function pathsUnder(files: string[], folder: string): string[] {
  const prefix = posix(folder);
  return files.filter((raw) => {
    const id = posix(raw);
    return id === prefix || id.startsWith(`${prefix}/`);
  });
}

export function openJobMapFromPath(relPath: string, kind: "file" | "folder" = "file"): boolean {
  const store = useAppStore.getState();
  const prefix = posix(relPath);
  const all = store.projectFiles
    .map((file) => posix(file.path || file.id))
    .filter(Boolean);
  let folder = kind === "folder" ? prefix : folderOf(prefix);
  if (!folder && kind === "file") folder = prefix;

  const leaf = basename(folder).toLowerCase();
  if (leaf === "g-aid output") {
    const last = store.lastJobResults;
    if (last?.productsRel && posix(last.productsRel).startsWith(`${folder}/`)) {
      folder = posix(last.productsRel);
    } else {
      const jobs = [
        ...new Set(
          all
            .filter((p) => p.startsWith(`${folder}/`))
            .map((p) => p.slice(folder.length + 1).split("/")[0])
            .filter(Boolean)
        ),
      ].map((name) => `${folder}/${name}`);
      const withGrids = jobs.filter((job) => rasterLayersFromPaths(pathsUnder(all, job)).length);
      folder = withGrids[withGrids.length - 1] || folder;
    }
  }

  const files = pathsUnder(all, folder).filter((id) => id !== folder);
  const layers = rasterLayersFromPaths(files);
  if (!layers.length) return false;
  const preferred =
    kind === "file"
      ? layers.find((layer) => stem(layer.id) === stem(prefix))?.id
      : undefined;
  store.presentJobResults({
    taskFolder: basename(folder) || "Results",
    productsRel: folder,
    files,
    activeLayerId: preferred,
  });
  return true;
}
