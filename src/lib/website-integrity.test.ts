import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { catalogFromGithubRelease, emptyDownloadCatalog, matchPlatformAsset } from "./public-download.ts";
import { parseEsriAscii } from "./map/ascii.ts";
import { isUsableSupabaseConfig } from "./supabase/config.ts";
import { catalogRecordId } from "./catalog/ids.ts";
import { sha256Utf8Hex } from "./sha256.ts";

let failed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`ok  ${name}`);
    })
    .catch((err) => {
      failed += 1;
      console.error(`not ok  ${name}`);
      console.error(err);
    });
}

const root = process.cwd();

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, acc);
    else if (/\.(tsx|ts|jsx|js)$/.test(ent.name)) acc.push(full);
  }
  return acc;
}

const MARKETING_DIRS = [
  "src/app/about",
  "src/app/docs",
  "src/app/download",
  "src/app/release-notes",
  "src/app/privacy",
  "src/app/terms",
  "src/app/security",
  "src/app/data-use",
  "src/app/signin",
  "src/app/signup",
  "src/app/onboarding",
  "src/app/auth",
  "src/components/landing",
];

const FORBIDDEN_CLAIMS = [
  "SOC 2",
  "ISO 27001",
  "BYOK",
  "Stripe",
  "signed and notarized",
  "Launch Demo Workspace",
  "Cloud Workspaces",
  "zero-knowledge",
  "14x Faster",
  "Raw SEGY Ingestion",
  "G-AID Setup",
  "Hardware Security Module",
  "/workspace/verify",
  'href="#"',
];

await test("client catalog adapters do not import node:fs", () => {
  const adaptersDir = path.join(root, "src/lib/catalog/adapters");
  const hits: string[] = [];
  for (const name of fs.readdirSync(adaptersDir)) {
    if (!name.endsWith(".ts") || name.endsWith("-node.ts")) continue;
    const text = fs.readFileSync(path.join(adaptersDir, name), "utf8");
    if (text.includes("node:fs") || text.includes("node:crypto")) {
      hits.push(name);
    }
  }
  assert.deepEqual(hits, []);
  assert.equal(fs.existsSync(path.join(root, "src/lib/catalog/adapters/shapefile-node.ts")), true);
});

await test("catalog ids do not import node:crypto and stay SHA-256 stable", () => {
  const ids = read("src/lib/catalog/ids.ts");
  assert.equal(ids.includes("node:crypto"), false);
  assert.equal(ids.includes("node:fs"), false);
  assert.equal(sha256Utf8Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Utf8Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const key = "day 1/rover.csv";
  const node = createHash("sha256").update(key, "utf8").digest("hex");
  assert.equal(sha256Utf8Hex(key), node);
  assert.equal(catalogRecordId("DAY 1/rover.csv"), `rec:${node.slice(0, 16)}`);
});

await test("grid-map-view re-exports parseEsriAscii so workspace compile cannot 500 marketing", () => {
  const source = read("src/components/workspace/grid-map-view.tsx");
  assert.match(source, /export \{\s*parseEsriAscii\s*\}/);
  const editor = read("src/components/workspace/file-editor.tsx");
  assert.match(editor, /import \{ parseEsriAscii \} from "@\/lib\/map\/ascii"/);
  const sample = "ncols 1\nnrows 1\nxllcorner 0\nyllcorner 0\ncellsize 1\nNODATA_value -9999\n1\n";
  assert.ok(parseEsriAscii(sample));
});

await test("hero and CTA route downloads to /download, not a missing installer file", () => {
  const hero = read("src/components/landing/hero.tsx");
  const cta = read("src/components/landing/cta.tsx");
  const navbar = read("src/components/landing/navbar.tsx");
  assert.match(hero, /href="\/download"/);
  assert.equal(hero.includes(".exe"), false);
  assert.equal(hero.includes("Launch Demo Workspace"), false);
  assert.match(cta, /href="\/download"/);
  assert.match(navbar, /href="\/download"/);
  assert.equal(navbar.includes("Demo Workspace"), false);
  assert.equal(navbar.includes("handleEnterDemo"), false);
});

await test("download catalog is unpublished when GitHub has no assets", () => {
  const empty = catalogFromGithubRelease(null);
  assert.equal(empty.published, false);
  assert.equal(empty.platforms.win, undefined);
  assert.match(empty.message, /has been published yet/i);

  const noAssets = catalogFromGithubRelease({ tag_name: "v9.9.9", assets: [] });
  assert.equal(noAssets.published, false);

  const win = matchPlatformAsset(
    [{ name: "G-AID-Setup.exe", browser_download_url: "https://example.test/a.exe", size: 12 }],
    "win"
  );
  assert.equal(win?.url, "https://example.test/a.exe");

  const published = catalogFromGithubRelease({
    tag_name: "v0.2.0",
    published_at: "2026-08-28T00:00:00Z",
    assets: [{ name: "G-AID-Setup.exe", browser_download_url: "https://example.test/a.exe", size: 100 }],
  });
  assert.equal(published.published, true);
  assert.equal(published.version, "v0.2.0");
  assert.equal(emptyDownloadCatalog().published, false);
});

await test("download page shows unavailable copy until a release exists", () => {
  const page = read("src/app/download/page.tsx");
  assert.match(page, /Installers are not available yet/);
  assert.equal(page.includes("signed and notarized"), false);
  assert.equal(/version\s*1\.0/i.test(page), false);
  assert.equal(page.includes("May 2026"), false);
  assert.equal(page.includes(">1.0<"), false);
  assert.match(page, /\/api\/download\?info=1/);
});

await test("placeholder Supabase is unconfigured and sign-in surfaces that state", () => {
  assert.equal(isUsableSupabaseConfig("https://placeholder.supabase.co", "eyJplaceholder"), false);
  const signin = read("src/app/signin/page.tsx");
  assert.match(signin, /AuthUnavailableNotice/);
  assert.match(signin, /hasSupabaseConfig/);
  assert.match(signin, /PublicLoginUnconfiguredNotice/);
  assert.match(signin, /startPublicLogin/);
  assert.equal(signin.includes("Google"), false);
  assert.equal(/GitHub/.test(signin), false);
  const signup = read("src/app/signup/page.tsx");
  assert.match(signup, /AuthUnavailableNotice/);
  const notice = read("src/components/auth/auth-unavailable-notice.tsx");
  assert.match(notice, /data-testid="auth-unavailable"/);
  const unconfigured = read("src/components/auth/public-login-unconfigured-notice.tsx");
  assert.match(unconfigured, /data-testid="public-login-unconfigured"/);
  assert.match(unconfigured, /Online sign-in is not configured yet/);
  assert.equal(unconfigured.includes("Google"), true);
  assert.equal(/GitHub/.test(unconfigured), true);
});

await test("desktop auth no longer puts tokens in callback URLs", () => {
  const desktop = read("src/lib/desktop.ts");
  assert.equal(desktop.includes("access_token"), false);
  assert.equal(desktop.includes("desktopHandoffUrl"), false);
  const confirm = read("src/app/auth/desktop/confirm/page.tsx");
  assert.equal(confirm.includes("access_token"), false);
  assert.match(confirm, /\/api\/auth\/desktop\/authorize/);
  const done = read("src/app/auth/desktop/done/page.tsx");
  assert.equal(done.includes("access_token"), false);
  assert.equal(done.includes("g-aid.io"), false);
  const main = read("electron/main.js");
  assert.equal(main.includes("__gaid/auth"), false);
  assert.match(main, /GAID_AUTH_BASE_URL/);
  assert.equal(main.includes("g-aid.io"), false);
  assert.equal(read("src/app/auth/desktop/page.tsx").includes("Google"), false);
});

await test("marketing copy does not include unsupported product claims", () => {
  const files = [
    path.join(root, "src/app/page.tsx"),
    ...MARKETING_DIRS.flatMap((dir) => walkFiles(path.join(root, dir))),
    path.join(root, "src/lib/data.ts"),
  ];
  const hits: string[] = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const claim of FORBIDDEN_CLAIMS) {
      if (text.includes(claim)) hits.push(`${path.relative(root, file)}: ${claim}`);
    }
  }
  assert.deepEqual(hits, []);
});

await test("navbar/footer do not expose verify routes or placeholder socials", () => {
  const navbar = read("src/components/landing/navbar.tsx");
  const footer = read("src/components/landing/footer.tsx");
  assert.equal(navbar.includes("/workspace/verify"), false);
  assert.equal(footer.includes("/workspace/verify"), false);
  assert.equal(footer.includes('href="#"'), false);
  assert.equal(footer.includes("Demo Workspace"), false);
  assert.match(footer, /github.com\/heavyhitter69\/g-aid/);
});

await test("public serving path does not include leftover starter assets or internal tasks", () => {
  assert.equal(fs.existsSync(path.join(root, "public/g-aid output")), false);
  assert.equal(fs.existsSync(path.join(root, "public/vercel.svg")), false);
  assert.equal(fs.existsSync(path.join(root, "public/next.svg")), false);
  assert.equal(fs.existsSync(path.join(root, "public/file.svg")), false);
  assert.equal(fs.existsSync(path.join(root, "public/globe.svg")), false);
  assert.equal(fs.existsSync(path.join(root, "public/window.svg")), false);
  assert.equal(fs.existsSync(path.join(root, "src/app/favicon.ico")) || fs.existsSync(path.join(root, "public/favicon.ico")), true);
});

function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error("timeout"));
    });
  });
}

function pidCwd(pid: number): string | null {
  try {
    return fs.realpathSync(`/proc/${pid}/cwd`);
  } catch {
    return null;
  }
}

function killPid(pid: number) {
  if (!pid || pid === process.pid) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

function stopExistingDevServer() {
  const lockPath = path.join(root, ".next/dev/lock");
  if (fs.existsSync(lockPath)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8")) as { pid?: number };
      if (lock.pid) killPid(lock.pid);
    } catch {
      /* ignore */
    }
  }
  const rootReal = fs.realpathSync(root);
  for (const name of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    const pid = Number(name);
    const commPath = `/proc/${pid}/comm`;
    let comm = "";
    try {
      comm = fs.readFileSync(commPath, "utf8").trim();
    } catch {
      continue;
    }
    if (!comm.startsWith("next-server")) {
      let cmdline = "";
      try {
        cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8");
      } catch {
        continue;
      }
      if (!cmdline.includes("next/dist/bin/next")) continue;
    }
    if (pidCwd(pid) === rootReal) killPid(pid);
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on("error", reject);
  });
}

function waitForChildReady(readyHint: () => string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (/\bReady in\b/i.test(readyHint())) {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`dev server did not become Ready\n${readyHint().slice(-2000)}`));
        return;
      }
      setTimeout(tick, 400);
    };
    tick();
  });
}

await test("visiting /workspace does not 500 /, /download, or /api/download", async () => {
  stopExistingDevServer();
  await new Promise((r) => setTimeout(r, 1200));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const nextBin = path.join(root, "node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (d) => {
    output += d.toString();
  });
  child.stderr?.on("data", (d) => {
    output += d.toString();
  });
  try {
    await waitForChildReady(() => output, 90000);
    const workspace = await get(`${base}/workspace`);
    assert.notEqual(workspace.status, 500, workspace.body.slice(0, 800));
    assert.equal(workspace.body.includes("Failed to compile"), false, workspace.body.slice(0, 800));
    const home = await get(`${base}/`);
    assert.equal(home.status, 200, home.body.slice(0, 400));
    assert.equal(home.body.includes("Failed to compile"), false, home.body.slice(0, 400));
    const download = await get(`${base}/download`);
    assert.equal(download.status, 200, download.body.slice(0, 400));
    assert.equal(download.body.includes("Failed to compile"), false, download.body.slice(0, 400));
    const api = await get(`${base}/api/download?platform=win`);
    assert.notEqual(api.status, 500, api.body.slice(0, 400));
    assert.ok(api.status === 404 || api.status === 200 || api.status === 302);
  } finally {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 800));
    try {
      child.kill("SIGKILL");
    } catch {
      /* gone */
    }
  }
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
