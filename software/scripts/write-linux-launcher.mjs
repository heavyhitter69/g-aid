import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist_desktop");
const unpacked = path.join(distDir, "linux-unpacked", "g-aid");
const iconSrc = path.join(root, "build", "icons", "512x512.png");
const iconDest = path.join(distDir, "g-aid.png");
const appImage = path.join(distDir, "G-AID-0.1.0.AppImage");

if (!fs.existsSync(unpacked) && !fs.existsSync(appImage)) {
  console.error("No Linux build in dist_desktop");
  process.exit(1);
}

if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, iconDest);
}

const launcher = path.join(distDir, "launch-g-aid.sh");
fs.writeFileSync(
  launcher,
  `#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
UNPACKED="$DIR/linux-unpacked/g-aid"
APPIMAGE="$DIR/G-AID-0.1.0.AppImage"

# AppImages need libfuse.so.2. Ubuntu 24+ often ships only FUSE 3, so
# double-clicking the .AppImage silently fails. Prefer the unpacked binary.
if [[ -x "$UNPACKED" ]]; then
  cd "$DIR/linux-unpacked"
  exec env -u ELECTRON_RUN_AS_NODE "$UNPACKED" --no-sandbox "$@"
fi

if [[ -x "$APPIMAGE" ]]; then
  if ldconfig -p 2>/dev/null | grep -q 'libfuse.so.2'; then
    exec env -u ELECTRON_RUN_AS_NODE "$APPIMAGE" --no-sandbox "$@"
  fi
  exec env -u ELECTRON_RUN_AS_NODE APPIMAGE_EXTRACT_AND_RUN=1 "$APPIMAGE" --no-sandbox "$@"
fi

echo "G-AID Linux build not found in $DIR" >&2
exit 1
`
);
fs.chmodSync(launcher, 0o755);

const desktop = path.join(distDir, "G-AID.desktop");
fs.writeFileSync(
  desktop,
  `[Desktop Entry]
Type=Application
Name=G-AID
Comment=Geophysics AI desktop workspace
Exec=${launcher}
Icon=${iconDest}
Path=${distDir}
Terminal=false
Categories=Science;Education;
StartupWMClass=g-aid
`
);
fs.chmodSync(desktop, 0o755);

const home = process.env.HOME;
if (home) {
  const appsDir = path.join(home, ".local", "share", "applications");
  const iconDir = path.join(home, ".local", "share", "icons", "hicolor", "512x512", "apps");
  fs.mkdirSync(appsDir, { recursive: true });
  fs.mkdirSync(iconDir, { recursive: true });
  if (fs.existsSync(iconDest)) {
    fs.copyFileSync(iconDest, path.join(iconDir, "g-aid.png"));
  }
  const installed = path.join(appsDir, "g-aid.desktop");
  fs.writeFileSync(
    installed,
    `[Desktop Entry]
Type=Application
Name=G-AID
Comment=Geophysics AI desktop workspace
Exec=${launcher}
Icon=g-aid
Path=${distDir}
Terminal=false
Categories=Science;Education;
StartupWMClass=g-aid
`
  );
  fs.chmodSync(installed, 0o755);
  console.log("Installed", installed);
}

console.log("Wrote", desktop);
console.log("Wrote", launcher);
