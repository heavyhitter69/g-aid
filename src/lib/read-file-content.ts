/**
 * Load file bytes for the editor with size/type guards to avoid freezing the UI.
 */

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "svg",
  "pdf", "zip", "gz", "tar", "7z", "rar",
  "exe", "dll", "so", "dylib",
  "parquet", "feather", "h5", "hdf5", "nc",
  "grd", "bin", "wasm",
]);

/** Hard reject — avoids loading multi‑hundred‑MB files into memory */
const MAX_TEXT_BYTES = 16 * 1024 * 1024;
const MAX_EXCEL_ROWS = 500;

function extension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function readExcelPreview(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", sheetRows: MAX_EXCEL_ROWS + 1 });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return "[]";
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
  const capped = rows.slice(0, MAX_EXCEL_ROWS);
  return JSON.stringify(capped);
}

async function readDocxPreview(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  return result.value;
}

/** Read a File for display in the editor. */
export async function readFileForEditor(file: File, fileId: string): Promise<string> {
  const ext = extension(fileId);

  if (BINARY_EXTENSIONS.has(ext)) {
    return `[Binary file — preview not available for .${ext} (${formatSize(file.size)}).\nOpen in a dedicated tool or sign in to download from cloud storage.]`;
  }

  if (file.size > MAX_TEXT_BYTES) {
    return `[File too large to open in the browser editor (${formatSize(file.size)}). Limit is ${formatSize(MAX_TEXT_BYTES)}. Use a smaller export or sign in for cloud download.]`;
  }

  if (ext === "xlsx" || ext === "xls") {
    try {
      return await readExcelPreview(file);
    } catch {
      return "[Could not parse spreadsheet.]";
    }
  }

  if (ext === "docx" || ext === "doc") {
    try {
      return await readDocxPreview(file);
    } catch {
      return "[Could not parse Word document.]";
    }
  }

  try {
    return await file.text();
  } catch {
    return "[Could not read file as text.]";
  }
}

export const EDITOR_PREVIEW_ROW_CAP = MAX_EXCEL_ROWS;
/** Line numbers in the gutter are virtualized above this count */
export const LARGE_FILE_LINE_THRESHOLD = 8_000;
