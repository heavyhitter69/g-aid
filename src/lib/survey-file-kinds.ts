export const BINARY_MAP_EXTS = new Set(["tif", "tiff", "grd", "ers", "bil"]);
export const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp"]);
export const GRID_ASCII_EXTS = new Set(["asc", "grd"]);
export const XYZ_EXTS = new Set(["xyz"]);
export const VECTOR_EXTS = new Set(["geojson", "json"]);
export const CRS_EXTS = new Set(["prj", "wkt"]);
export const NUMPY_EXTS = new Set(["npz", "npy"]);

export function fileExt(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() || name;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

export function isNumpyFile(name: string): boolean {
  return NUMPY_EXTS.has(fileExt(name));
}

export function isBinaryMapFile(name: string): boolean {
  return BINARY_MAP_EXTS.has(fileExt(name));
}

export function isImageFile(name: string): boolean {
  return IMAGE_EXTS.has(fileExt(name));
}

export function companionAsciiPath(name: string): string | null {
  if (!isBinaryMapFile(name) && !isNumpyFile(name)) return null;
  return name.replace(/\.(tif|tiff|grd|ers|bil|npz|npy)$/i, ".asc");
}
