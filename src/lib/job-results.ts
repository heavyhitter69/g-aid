"use client";

import { useAppStore } from "@/store/app-store";
import {
  fileBasename,
  fileStem,
  folderOf,
  isGridPath,
  layerLabel,
  listJobFolders,
  pathsUnder,
  posixPath,
  rasterLayersFromPaths,
} from "./raster-layers";
import { runIdFromPath } from "./map/layers";

export interface JobResults {
  taskFolder: string;
  productsRel: string;
  files: string[];
  activeLayerId?: string;
  runId?: string;
  compareRunId?: string;
}

export {
  folderOf,
  isGridPath,
  layerLabel,
  listJobFolders,
  rasterLayersFromPaths,
};

export function jobFilesFromEpilogue(epilogue: {
  taskFolder?: string;
  productsRel?: string;
  projectFilesUpdates?: { id?: string; path?: string }[];
}): JobResults | null {
  const files = (epilogue.projectFilesUpdates || [])
    .map((file) => posixPath(file.path || file.id || ""))
    .filter(Boolean);
  if (!files.length) return null;
  const productsRel =
    (epilogue.productsRel && posixPath(epilogue.productsRel)) ||
    folderOf(files[0]);
  return {
    taskFolder: epilogue.taskFolder || fileBasename(productsRel) || "Results",
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

export function openJobMapFromPath(relPath: string, kind: "file" | "folder" = "file"): boolean {
  const store = useAppStore.getState();
  const prefix = posixPath(relPath);
  const all = store.projectFiles
    .map((file) => posixPath(file.path || file.id))
    .filter(Boolean);
  let folder = kind === "folder" ? prefix : folderOf(prefix);
  if (!folder && kind === "file") folder = prefix;

  const leaf = fileBasename(folder).toLowerCase();
  if (leaf === "g-aid output") {
    const last = store.lastJobResults;
    if (last?.productsRel && posixPath(last.productsRel).startsWith(`${folder}/`)) {
      folder = posixPath(last.productsRel);
    } else {
      const jobs = listJobFolders(all, folder);
      const withGrids = jobs.filter((job) => rasterLayersFromPaths(pathsUnder(all, job)).length);
      folder = withGrids[withGrids.length - 1] || folder;
    }
  }

  const files = pathsUnder(all, folder).filter((id) => id !== folder);
  const layers = rasterLayersFromPaths(files);
  const vectors = files.filter((id) => /\.geojson$/i.test(id));
  if (!layers.length && !vectors.length) return false;
  const preferred =
    kind === "file"
      ? layers.find((layer) => fileStem(layer.id) === fileStem(prefix))?.id ||
        vectors.find((id) => fileStem(id) === fileStem(prefix))
      : undefined;
  store.presentJobResults({
    taskFolder: fileBasename(folder) || "Results",
    productsRel: folder,
    files,
    activeLayerId: preferred,
    runId: runIdFromPath(folder),
  });
  return true;
}
