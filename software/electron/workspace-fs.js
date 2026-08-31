const fs = require("fs");
const path = require("path");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".tmp",
  "dist",
  "build",
  "out",
  "__pycache__",
  ".venv",
  "venv",
  ".vscode",
  ".idea",
  ".g-aid",
  "tmp",
  "temp",
  "cache",
]);

const MAX_FILES = 20000;
const PEEK_BYTES = 4096;
const MAX_READ_BYTES = 2 * 1024 * 1024;
const TABULAR_READ_BYTES = 64 * 1024 * 1024;
const GRID_READ_BYTES = 32 * 1024 * 1024;

function isInsideRoot(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const rel = path.relative(resolvedRoot, resolvedTarget);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function classifyPeek(name, peek) {
  const lower = String(peek || "").toLowerCase();
  const n = String(name || "").toLowerCase();
  if (lower.includes("time nt sq")) return "gsm19-base";
  if (lower.includes("latitude") && lower.includes("longitude") && lower.includes("mag")) {
    return "magarrow";
  }
  if (n.endsWith(".csv") || n.endsWith(".txt") || n.endsWith(".dat")) return "tabular";
  return "other";
}

function peekFile(fullPath, size) {
  try {
    const fd = fs.openSync(fullPath, "r");
    const buf = Buffer.alloc(Math.min(PEEK_BYTES, size));
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    return buf.toString("utf8");
  } catch {
    return "";
  }
}

function indexWorkspace(root) {
  if (typeof root !== "string" || !root.trim()) {
    throw new Error("workspace root is required");
  }
  const resolvedRoot = path.resolve(root);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
    throw new Error(`Folder not found: ${resolvedRoot}`);
  }

  const files = [];
  const folders = new Set();
  let truncated = false;

  function walk(dir) {
    if (files.length >= MAX_FILES) {
      truncated = true;
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      if (!ent.name || ent.name.startsWith(".")) continue;
      if (ent.name === "Implementation Plan.md" || ent.name === "tasks.md") continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name.toLowerCase())) continue;
        const rel = path.relative(resolvedRoot, full).replace(/\\/g, "/");
        folders.add(rel);
        walk(full);
      } else if (ent.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          continue;
        }
        const rel = path.relative(resolvedRoot, full).replace(/\\/g, "/");
        const ext = path.extname(ent.name).toLowerCase();
        let kind = "other";
        if (ext === ".csv" || ext === ".txt" || ext === ".dat") {
          kind = classifyPeek(ent.name, peekFile(full, size));
        }
        files.push({
          relativePath: rel,
          name: ent.name,
          size,
          ext,
          kind,
        });
      }
    }
  }

  walk(resolvedRoot);
  return {
    root: resolvedRoot,
    folders: [...folders].sort(),
    files,
    truncated,
  };
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const BINARY_MAP_EXTS = new Set([".tif", ".tiff", ".grd", ".ers", ".bil"]);
const NUMPY_EXTS = new Set([".npz", ".npy"]);
const zlib = require("zlib");

function gridToAscii(ncols, nrows, xll, yll, cell, nodata, values) {
  const lines = [
    `ncols         ${ncols}`,
    `nrows         ${nrows}`,
    `xllcorner     ${xll}`,
    `yllcorner     ${yll}`,
    `cellsize      ${cell}`,
    `NODATA_value  ${nodata}`,
  ];
  for (let r = 0; r < nrows; r++) {
    const row = [];
    for (let c = 0; c < ncols; c++) {
      const v = values[r * ncols + c];
      row.push(Number.isFinite(v) ? String(v) : String(nodata));
    }
    lines.push(row.join(" "));
  }
  return lines.join("\n");
}

function parseGaidGeoTiff(buf) {
  if (buf.toString("ascii", 0, 2) !== "II" || buf.readUInt16LE(2) !== 42) return null;
  const ifd = buf.readUInt32LE(4);
  if (ifd + 2 > buf.length) return null;
  const n = buf.readUInt16LE(ifd);
  const tags = {};
  for (let i = 0; i < n; i++) {
    const o = ifd + 2 + i * 12;
    if (o + 12 > buf.length) return null;
    tags[buf.readUInt16LE(o)] = {
      typ: buf.readUInt16LE(o + 2),
      count: buf.readUInt32LE(o + 4),
      val: buf.readUInt32LE(o + 8),
    };
  }
  const nx = tags[256] && tags[256].val;
  const ny = tags[257] && tags[257].val;
  const strip = tags[273] && tags[273].val;
  const fmt = tags[339] ? tags[339].val : 3;
  if (!nx || !ny || strip == null || nx * ny > 4000 * 4000) return null;
  let dx = 1;
  let xmin = 0;
  let ymax = ny;
  if (tags[33550] && tags[33550].typ === 12) {
    dx = buf.readDoubleLE(tags[33550].val);
  }
  if (tags[33922] && tags[33922].typ === 12) {
    xmin = buf.readDoubleLE(tags[33922].val + 24);
    ymax = buf.readDoubleLE(tags[33922].val + 32);
  }
  let nodata = -99999;
  if (tags[42113]) {
    nodata = parseFloat(buf.toString("ascii", tags[42113].val, tags[42113].val + tags[42113].count)) || -99999;
  }
  const values = new Float64Array(nx * ny);
  if (fmt === 3) {
    for (let i = 0; i < nx * ny; i++) values[i] = buf.readFloatLE(strip + i * 4);
  } else if (fmt === 2) {
    for (let i = 0; i < nx * ny; i++) values[i] = buf.readInt32LE(strip + i * 4);
  } else {
    return null;
  }
  const yll = ymax - dx * ny;
  return gridToAscii(nx, ny, xmin, yll, dx, nodata, values);
}

function parseNpy(buf) {
  if (buf.toString("ascii", 0, 6) !== "\x93NUMPY") return null;
  const major = buf[6];
  const headerLen = major === 1 ? buf.readUInt16LE(8) : buf.readUInt32LE(8);
  const headerOff = major === 1 ? 10 : 12;
  const header = buf.toString("ascii", headerOff, headerOff + headerLen);
  const descr = header.match(/'descr':\s*'([^']+)'/);
  const shapeMatch = header.match(/'shape':\s*\(([^)]*)\)/);
  if (!descr || !shapeMatch) return null;
  const dtype = descr[1];
  const shapeParts = shapeMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);
  const shape = shapeParts.length ? shapeParts : [];
  let n = 1;
  for (const d of shape) n *= d || 1;
  if (!shape.length) n = 1;
  const dataOff = headerOff + headerLen;
  const le = dtype[0] === "<" || dtype[0] === "|";
  const code = dtype.slice(-2);
  const out = new Float64Array(n);
  if (code === "f8") {
    for (let i = 0; i < n; i++) out[i] = le ? buf.readDoubleLE(dataOff + i * 8) : buf.readDoubleBE(dataOff + i * 8);
  } else if (code === "f4") {
    for (let i = 0; i < n; i++) out[i] = le ? buf.readFloatLE(dataOff + i * 4) : buf.readFloatBE(dataOff + i * 4);
  } else if (code === "i8" || code === "u8" || code === "i4") {
    const w = code[1] === "8" ? 8 : 4;
    for (let i = 0; i < n; i++) {
      out[i] = w === 8 ? Number(buf.readBigInt64LE(dataOff + i * 8)) : buf.readInt32LE(dataOff + i * 4);
    }
  } else {
    return null;
  }
  return { shape, values: out };
}

function parseZipEntries(buf) {
  const files = {};
  let o = 0;
  while (o + 30 <= buf.length) {
    const sig = buf.readUInt32LE(o);
    if (sig !== 0x04034b50) break;
    const method = buf.readUInt16LE(o + 8);
    const comp = buf.readUInt32LE(o + 18);
    const uncomp = buf.readUInt32LE(o + 22);
    const nameLen = buf.readUInt16LE(o + 26);
    const extraLen = buf.readUInt16LE(o + 28);
    const name = buf.toString("utf8", o + 30, o + 30 + nameLen);
    const dataOff = o + 30 + nameLen + extraLen;
    let data = buf.subarray(dataOff, dataOff + comp);
    if (method === 8) {
      try {
        data = zlib.inflateRawSync(data);
      } catch {
        try {
          data = zlib.inflateSync(data);
        } catch {
          data = null;
        }
      }
    } else if (method !== 0) {
      data = null;
    }
    if (data) files[name] = Buffer.from(data);
    o = dataOff + comp;
  }
  return files;
}

function parseNpzToAscii(buf) {
  const files = parseZipEntries(buf);
  const names = Object.keys(files);
  const valuesName = names.find((n) => n === "values.npy" || n.endsWith("/values.npy"));
  const tracesName = names.find((n) => n === "traces.npy" || n === "bandpassed.npy" || n === "dewow.npy");
  if (valuesName) {
    const grid = parseNpy(files[valuesName]);
    if (!grid || grid.shape.length !== 2) return null;
    const ny = grid.shape[0];
    const nx = grid.shape[1];
    const scalar = (key) => {
      const hit = names.find((n) => n === `${key}.npy` || n.endsWith(`/${key}.npy`));
      if (!hit) return null;
      const parsed = parseNpy(files[hit]);
      return parsed ? parsed.values[0] : null;
    };
    const x0 = scalar("x0") ?? 0;
    const y0 = scalar("y0") ?? 0;
    const dx = scalar("dx") ?? 1;
    return gridToAscii(nx, ny, x0, y0, dx, -99999, grid.values);
  }
  if (tracesName) {
    const traces = parseNpy(files[tracesName]);
    if (!traces || traces.shape.length !== 2) return null;
    const ntr = traces.shape[0];
    const ns = traces.shape[1];
    const stepT = Math.max(1, Math.ceil(ntr / 800));
    const stepS = Math.max(1, Math.ceil(ns / 600));
    const nx = Math.ceil(ntr / stepT);
    const ny = Math.ceil(ns / stepS);
    const values = new Float64Array(nx * ny);
    for (let r = 0; r < ny; r++) {
      for (let c = 0; c < nx; c++) {
        values[r * nx + c] = traces.values[(c * stepT) * ns + r * stepS];
      }
    }
    return gridToAscii(nx, ny, 0, 0, 1, -99999, values);
  }
  return null;
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 4096);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function readWorkspaceFile(root, relativePath, maxBytes = MAX_READ_BYTES) {
  if (typeof root !== "string" || typeof relativePath !== "string") {
    throw new Error("root and relativePath are required");
  }
  const resolvedRoot = path.resolve(root);
  const full = path.resolve(resolvedRoot, relativePath);
  if (!isInsideRoot(resolvedRoot, full)) {
    throw new Error("Path is outside the open workspace");
  }
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    throw new Error(`File not found: ${relativePath}`);
  }
  const size = fs.statSync(full).size;
  const ext = path.extname(full).toLowerCase();
  let readLimit = maxBytes;
  if (ext === ".csv" || ext === ".txt" || ext === ".dat" || ext === ".tsv") {
    readLimit = TABULAR_READ_BYTES;
  } else if (ext === ".asc" || ext === ".xyz" || ext === ".geojson") {
    readLimit = GRID_READ_BYTES;
  }

  if (IMAGE_EXTS.has(ext)) {
    const buf = fs.readFileSync(full);
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".gif" ? "image/gif" : ext === ".webp" ? "image/webp" : "image/png";
    return {
      text: "",
      size,
      truncated: false,
      binary: true,
      media: `data:${mime};base64,${buf.toString("base64")}`,
    };
  }

  if (BINARY_MAP_EXTS.has(ext)) {
    const asc = full.replace(/\.(tif|tiff|grd|ers|bil)$/i, ".asc");
    if (fs.existsSync(asc) && fs.statSync(asc).isFile()) {
      const relAsc = path.relative(resolvedRoot, asc).replace(/\\/g, "/");
      const ascii = readWorkspaceFile(root, relAsc, GRID_READ_BYTES);
      return { ...ascii, companion: relAsc, kind: "geotiff" };
    }
    try {
      const buf = fs.readFileSync(full);
      const text = parseGaidGeoTiff(buf);
      if (text) return { text, size, truncated: false, kind: "geotiff" };
    } catch {
      /* fall through */
    }
    return { text: "", size, truncated: false, binary: true, kind: "geotiff" };
  }

  if (NUMPY_EXTS.has(ext)) {
    const asc = full.replace(/\.(npz|npy)$/i, ".asc");
    if (fs.existsSync(asc) && fs.statSync(asc).isFile()) {
      const relAsc = path.relative(resolvedRoot, asc).replace(/\\/g, "/");
      const ascii = readWorkspaceFile(root, relAsc, GRID_READ_BYTES);
      return { ...ascii, companion: relAsc, kind: "numpy" };
    }
    try {
      const buf = fs.readFileSync(full);
      const text = ext === ".npy" ? (() => {
        const parsed = parseNpy(buf);
        if (!parsed || parsed.shape.length !== 2) return null;
        return gridToAscii(parsed.shape[1], parsed.shape[0], 0, 0, 1, -99999, parsed.values);
      })() : parseNpzToAscii(buf);
      if (text) return { text, size, truncated: false, kind: "numpy" };
    } catch {
      /* fall through */
    }
    return { text: "", size, truncated: false, binary: true, kind: "numpy" };
  }

  const fd = fs.openSync(full, "r");
  const toRead = Math.min(readLimit, size);
  const buf = Buffer.alloc(toRead);
  fs.readSync(fd, buf, 0, toRead, 0);
  fs.closeSync(fd);
  if (looksBinary(buf)) {
    return { text: "", size, truncated: false, binary: true, kind: "binary" };
  }
  let text = buf.toString("utf8");
  if (size > readLimit) {
    text += `\n\n[Truncated: showing first ${readLimit} of ${size} bytes]`;
  }
  return { text, size, truncated: size > readLimit };
}

function sanitizeRelative(relativePath) {
  const cleaned = String(relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
  const parts = cleaned.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) {
    throw new Error("Enter a name inside the open folder");
  }
  return parts.join("/");
}

function resolveWorkspacePath(root, relativePath) {
  if (typeof root !== "string" || typeof relativePath !== "string") {
    throw new Error("root and relativePath are required");
  }
  relativePath = sanitizeRelative(relativePath);
  const resolvedRoot = path.resolve(root);
  const full = path.resolve(resolvedRoot, relativePath);
  if (!isInsideRoot(resolvedRoot, full) || full === resolvedRoot) {
    throw new Error("Path is outside the open workspace");
  }
  return { resolvedRoot, full, relativePath };
}

function writeWorkspaceFile(root, relativePath, content = "") {
  if (typeof root !== "string" || typeof relativePath !== "string") {
    throw new Error("root and relativePath are required");
  }
  relativePath = sanitizeRelative(relativePath);
  const name = path.basename(relativePath);
  if (name === "Implementation Plan.md" || name === "tasks.md") {
    throw new Error("That name is reserved for workspace UI documents");
  }
  const resolvedRoot = path.resolve(root);
  const full = path.resolve(resolvedRoot, relativePath);
  if (!isInsideRoot(resolvedRoot, full)) {
    throw new Error("Path is outside the open workspace");
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  if (fs.existsSync(full)) {
    throw new Error(`Already exists: ${relativePath}`);
  }
  fs.writeFileSync(full, content, "utf8");
  return path.relative(resolvedRoot, full).replace(/\\/g, "/");
}

function isGaidOutputRel(relativePath) {
  return String(relativePath || "")
    .replace(/\\/g, "/")
    .split("/")
    .some((part) => part.toLowerCase() === "g-aid output");
}

function copyToOutputRel(relativePath) {
  const cleaned = sanitizeRelative(relativePath);
  if (isGaidOutputRel(cleaned)) return cleaned;
  return ["G-AID Output", "edits", ...cleaned.split("/")].join("/");
}

function saveWorkspaceFile(root, relativePath, content = "") {
  if (typeof root !== "string" || typeof relativePath !== "string") {
    throw new Error("root and relativePath are required");
  }
  relativePath = sanitizeRelative(relativePath);
  const name = path.basename(relativePath);
  if (name === "Implementation Plan.md" || name === "tasks.md") {
    throw new Error("That name is reserved for workspace UI documents");
  }
  const resolvedRoot = path.resolve(root);
  const full = path.resolve(resolvedRoot, relativePath);
  if (!isInsideRoot(resolvedRoot, full)) {
    throw new Error("Path is outside the open workspace");
  }
  if (fs.existsSync(full) && !isGaidOutputRel(relativePath)) {
    return saveWorkspaceFile(root, copyToOutputRel(relativePath), content);
  }
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  return path.relative(resolvedRoot, full).replace(/\\/g, "/");
}

function mkdirWorkspace(root, relativePath) {
  if (typeof root !== "string" || typeof relativePath !== "string") {
    throw new Error("root and relativePath are required");
  }
  relativePath = sanitizeRelative(relativePath);
  const resolvedRoot = path.resolve(root);
  const full = path.resolve(resolvedRoot, relativePath);
  if (!isInsideRoot(resolvedRoot, full)) {
    throw new Error("Path is outside the open workspace");
  }
  fs.mkdirSync(full, { recursive: true });
  return path.relative(resolvedRoot, full).replace(/\\/g, "/");
}

function uniqueName(dir, base) {
  if (!fs.existsSync(path.join(dir, base))) return base;
  const ext = path.extname(base);
  const stem = ext ? base.slice(0, -ext.length) : base;
  let n = 2;
  while (fs.existsSync(path.join(dir, `${stem} ${n}${ext}`))) n += 1;
  return `${stem} ${n}${ext}`;
}

function resolveDestFolder(root, destFolderRel) {
  const resolvedRoot = path.resolve(root);
  const cleaned = String(destFolderRel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
  if (!cleaned) return { resolvedRoot, full: resolvedRoot, relativePath: "" };
  return resolveWorkspacePath(root, cleaned);
}

function moveWorkspacePath(root, fromRel, destFolderRel) {
  const src = resolveWorkspacePath(root, fromRel);
  const destFolder = resolveDestFolder(root, destFolderRel);
  const base = path.basename(src.full);
  const samePlace = path.resolve(destFolder.full, base) === src.full;
  if (samePlace) return src.relativePath;
  if (destFolder.full === src.full || destFolder.full.startsWith(src.full + path.sep)) {
    throw new Error("Cannot move a folder into itself");
  }
  const name = uniqueName(destFolder.full, base);
  const dest = path.join(destFolder.full, name);
  if (!isInsideRoot(src.resolvedRoot, dest) || dest === src.resolvedRoot) {
    throw new Error("Path is outside the open workspace");
  }
  try {
    fs.renameSync(src.full, dest);
  } catch (err) {
    if (err && err.code === "EXDEV") {
      fs.cpSync(src.full, dest, { recursive: true });
      fs.rmSync(src.full, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
  return path.relative(src.resolvedRoot, dest).replace(/\\/g, "/");
}

function copyWorkspacePath(root, fromRel, destFolderRel) {
  const src = resolveWorkspacePath(root, fromRel);
  const destFolder = resolveDestFolder(root, destFolderRel);
  if (destFolder.full === src.full || destFolder.full.startsWith(src.full + path.sep)) {
    throw new Error("Cannot copy a folder into itself");
  }
  const name = uniqueName(destFolder.full, path.basename(src.full));
  const dest = path.join(destFolder.full, name);
  if (!isInsideRoot(src.resolvedRoot, dest) || dest === src.resolvedRoot) {
    throw new Error("Path is outside the open workspace");
  }
  fs.cpSync(src.full, dest, { recursive: true });
  return path.relative(src.resolvedRoot, dest).replace(/\\/g, "/");
}

function searchWorkspace(root, query, options = {}) {
  const maxHits = Math.min(Number(options.maxHits) || 40, 80);
  const resolvedRoot = path.resolve(root);
  if (!resolvedRoot || !fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) {
    throw new Error(`Folder not found: ${resolvedRoot}`);
  }
  const raw = String(query || "").trim();
  if (!raw) return [];

  const tokens = raw
    .toLowerCase()
    .split(/[^a-z0-9()+_-]+/)
    .filter((tok) => tok.length >= 2);
  const hits = [];
  let seen = 0;
  const PEEK = 4096;
  const FILE_CAP = 8000;

  function score(hay) {
    const h = String(hay || "").toLowerCase();
    let n = 0;
    for (const tok of tokens) {
      if (h.includes(tok)) n += tok.length >= 4 ? 40 : 20;
    }
    return n;
  }

  function walk(dir) {
    if (hits.length >= 400 || seen >= FILE_CAP) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (hits.length >= 400 || seen >= FILE_CAP) return;
      if (!ent.name || ent.name.startsWith(".")) continue;
      const full = path.join(dir, ent.name);
      const rel = path.relative(resolvedRoot, full).replace(/\\/g, "/");
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name.toLowerCase()) || ent.name.toLowerCase() === "g-aid output") continue;
        const folderScore = Math.max(score(rel), score(ent.name));
        if (folderScore > 0) {
          hits.push({
            relativePath: rel,
            name: ent.name,
            kind: "folder",
            score: folderScore,
            why: "name",
          });
        }
        walk(full);
      } else if (ent.isFile()) {
        seen += 1;
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch {
          continue;
        }
        const pathScore = Math.max(score(rel), score(ent.name));
        let contentScore = 0;
        let snippet;
        const ext = path.extname(ent.name).toLowerCase();
        if ([".csv", ".txt", ".dat", ".xyz", ".las", ".json", ".md", ".log", ".asc"].includes(ext)) {
          const peek = peekFile(full, size).slice(0, PEEK);
          contentScore = score(peek);
          if (contentScore > 0) {
            const lower = peek.toLowerCase();
            const tok = tokens.find((t) => lower.includes(t));
            if (tok) {
              const at = lower.indexOf(tok);
              snippet = peek.slice(Math.max(0, at - 24), at + tok.length + 40).replace(/\s+/g, " ").trim();
            }
          }
        }
        const best = Math.max(pathScore, contentScore);
        if (best <= 0) continue;
        hits.push({
          relativePath: rel,
          name: ent.name,
          kind: classifyPeek(ent.name, contentScore ? peekFile(full, size) : ""),
          score: best,
          why: contentScore > pathScore ? "content" : "path",
          snippet,
        });
      }
    }
  }

  walk(resolvedRoot);
  hits.sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath));
  return hits.slice(0, maxHits);
}

function renameWorkspacePath(root, fromRel, newName) {
  const name = String(newName || "").trim();
  if (!name || /[\\/]/.test(name) || name === "." || name === "..") {
    throw new Error("Enter a valid name");
  }
  const src = resolveWorkspacePath(root, fromRel);
  const dest = path.join(path.dirname(src.full), name);
  if (!isInsideRoot(src.resolvedRoot, dest) || dest === src.resolvedRoot) {
    throw new Error("Path is outside the open workspace");
  }
  if (path.resolve(dest) !== src.full && fs.existsSync(dest)) {
    throw new Error(`Already exists: ${name}`);
  }
  fs.renameSync(src.full, dest);
  return path.relative(src.resolvedRoot, dest).replace(/\\/g, "/");
}

module.exports = {
  isInsideRoot,
  indexWorkspace,
  readWorkspaceFile,
  writeWorkspaceFile,
  saveWorkspaceFile,
  mkdirWorkspace,
  resolveWorkspacePath,
  moveWorkspacePath,
  copyWorkspacePath,
  renameWorkspacePath,
  searchWorkspace,
};
