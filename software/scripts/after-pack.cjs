const fs = require("fs");
const path = require("path");

/**
 * AppImage FUSE mounts are nosuid, so chrome-sandbox can never be a valid
 * root SUID helper. Chromium then aborts if that binary is present.
 * Removing it lets Electron start (same as launching with --no-sandbox).
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "linux") return;
  const sandbox = path.join(context.appOutDir, "chrome-sandbox");
  if (fs.existsSync(sandbox)) {
    fs.unlinkSync(sandbox);
  }
};
