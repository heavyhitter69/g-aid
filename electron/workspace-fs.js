const fs = require("fs");
const path = require("path");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  "__pycache__",
  ".venv",
  "venv",
  ".vscode",
  ".idea",
  "tmp",
  "temp",
  "cache",
]);

const MAX_FILES = 4000;
const PEEK_BYTES = 4096;
const MAX_READ_BYTES = 2 * 1024 * 1024;

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
        if (ent.name.toLowerCase() === "g-aid output") continue;
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
  const fd = fs.openSync(full, "r");
  const toRead = Math.min(maxBytes, size);
  const buf = Buffer.alloc(toRead);
  fs.readSync(fd, buf, 0, toRead, 0);
  fs.closeSync(fd);
  let text = buf.toString("utf8");
  if (size > maxBytes) {
    text += `\n\n[Truncated: showing first ${maxBytes} of ${size} bytes]`;
  }
  return { text, size, truncated: size > maxBytes };
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

module.exports = {
  isInsideRoot,
  indexWorkspace,
  readWorkspaceFile,
  writeWorkspaceFile,
  mkdirWorkspace,
};
