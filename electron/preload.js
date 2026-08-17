const { contextBridge, ipcRenderer } = require("electron");

function installBootCover() {
  if (typeof location === "undefined") return;
  if (location.protocol !== "http:" && location.protocol !== "https:") return;
  if (document.getElementById("gaid-boot-cover")) return;

  const cover = document.createElement("div");
  cover.id = "gaid-boot-cover";
  cover.style.cssText = [
    "position:fixed",
    "inset:0",
    "background:#0b0b0b",
    "z-index:2147483647",
    "opacity:1",
    "pointer-events:none",
    "transition:opacity 480ms ease",
  ].join(";");
  document.documentElement.appendChild(cover);
}

function dismissBootCover() {
  const cover = document.getElementById("gaid-boot-cover");
  if (!cover) return;
  cover.style.opacity = "0";
  const remove = () => cover.remove();
  cover.addEventListener("transitionend", remove, { once: true });
  setTimeout(remove, 700);
}

try {
  installBootCover();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installBootCover, { once: true });
  }
} catch {
  /* ignore */
}

contextBridge.exposeInMainWorld("gaidDesktop", {
  isDesktop: true,
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  getAuthBaseUrl: () => ipcRenderer.invoke("get-auth-base-url"),
  getPendingAuthUrl: () => ipcRenderer.invoke("get-pending-auth"),
  openAuxWindow: (pathname) => ipcRenderer.invoke("open-aux-window", pathname),
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  indexWorkspace: (root) => ipcRenderer.invoke("index-workspace", root),
  readWorkspaceFile: (root, relativePath) =>
    ipcRenderer.invoke("read-workspace-file", root, relativePath),
  createWorkspaceFile: (root, relativePath, content) =>
    ipcRenderer.invoke("create-workspace-file", root, relativePath, content ?? ""),
  createWorkspaceFolder: (root, relativePath) =>
    ipcRenderer.invoke("create-workspace-folder", root, relativePath),
  dismissBootCover: () => dismissBootCover(),
  onAuthCallback: (callback) => {
    const listener = (_event, url) => callback(url);
    ipcRenderer.on("gaid-auth", listener);
    return () => ipcRenderer.removeListener("gaid-auth", listener);
  },
});
