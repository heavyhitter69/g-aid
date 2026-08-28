import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const iss = path.join(root, "build", "g-aid.iss");
const unpacked = path.join(root, "dist_desktop", "win-unpacked", "G-AID.exe");

if (!fs.existsSync(unpacked)) {
  console.error("Missing unpacked app at dist_desktop/win-unpacked/G-AID.exe");
  process.exit(1);
}

const candidates = [
  path.join(process.env["ProgramFiles(x86)"] || "", "Inno Setup 6", "ISCC.exe"),
  path.join(process.env.ProgramFiles || "", "Inno Setup 6", "ISCC.exe"),
  path.join(process.env.LOCALAPPDATA || "", "Programs", "Inno Setup 6", "ISCC.exe"),
];

const iscc = candidates.find((p) => p && fs.existsSync(p));
if (!iscc) {
  console.error("Inno Setup 6 compiler (ISCC.exe) was not found. Install it, then rerun npm run dist:inno.");
  process.exit(1);
}

console.log("Compiling Inno Setup installer with", iscc);
const result = spawnSync(iscc, [iss], { stdio: "inherit", cwd: root });
process.exit(result.status ?? 1);
