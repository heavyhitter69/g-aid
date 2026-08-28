import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { catalogFromGithubRelease, emptyDownloadCatalog, matchPlatformAsset } from "./public-download.ts";
import { isUsableSupabaseConfig } from "./supabase/config.ts";

let failed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`ok  ${name}`))
    .catch((err) => {
      failed += 1;
      console.error(`not ok  ${name}`);
      console.error(err);
    });
}

const root = process.cwd();
const repoRoot = path.resolve(root, "..");

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
});

await test("download catalog is unpublished when GitHub has no assets", () => {
  const empty = catalogFromGithubRelease(null);
  assert.equal(empty.published, false);
  assert.match(empty.message, /has been published yet/i);
  const win = matchPlatformAsset(
    [{ name: "G-AID-Setup.exe", browser_download_url: "https://example.test/a.exe", size: 12 }],
    "win"
  );
  assert.equal(win?.url, "https://example.test/a.exe");
  assert.equal(emptyDownloadCatalog().published, false);
});

await test("download page shows unavailable copy until a release exists", () => {
  const page = read("src/app/download/page.tsx");
  assert.match(page, /Installers are not available yet/);
  assert.equal(page.includes("signed and notarized"), false);
  assert.match(page, /\/api\/download\?info=1/);
});

await test("placeholder Supabase is unconfigured and sign-in surfaces that state", () => {
  assert.equal(isUsableSupabaseConfig("https://placeholder.supabase.co", "eyJplaceholder"), false);
  const signin = read("src/app/signin/page.tsx");
  assert.match(signin, /AuthUnavailableNotice/);
  assert.equal(signin.includes("Google"), false);
  assert.equal(/GitHub/.test(signin), false);
  const notice = read("src/components/auth/auth-unavailable-notice.tsx");
  assert.match(notice, /data-testid="auth-unavailable"/);
});

await test("desktop auth pages do not put tokens in callback URLs", () => {
  const confirm = read("src/app/auth/desktop/confirm/page.tsx");
  assert.equal(confirm.includes("access_token"), false);
  assert.match(confirm, /callbackRedirectMatchesAttempt/);
  const schema = fs.readFileSync(path.join(repoRoot, "supabase-schema.sql"), "utf8");
  assert.match(schema, /force row level security/i);
  assert.match(schema, /revoke all on table public\.desktop_auth_codes/i);
  assert.equal(read("src/app/auth/desktop/done/page.tsx").includes("g-aid.io"), false);
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
  assert.match(footer, /github.com\/heavyhitter69\/g-aid/);
});

await test("public serving path does not include leftover starter assets", () => {
  assert.equal(fs.existsSync(path.join(root, "public/vercel.svg")), false);
  assert.equal(
    fs.existsSync(path.join(root, "src/app/favicon.ico")) || fs.existsSync(path.join(root, "public/favicon.ico")),
    true
  );
});

function get(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("timeout")));
  });
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

await test("website has no workspace routes and public pages compile without software", async () => {
  assert.equal(fs.existsSync(path.join(root, "src/app/workspace")), false);
  assert.equal(fs.existsSync(path.join(root, "src/lib/catalog")), false);
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const nextBin = path.join(repoRoot, "node_modules/next/dist/bin/next");
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
  const start = Date.now();
  try {
    while (!/\bReady in\b/i.test(output)) {
      if (Date.now() - start > 90000) throw new Error(`dev server did not become Ready\n${output.slice(-2000)}`);
      await new Promise((r) => setTimeout(r, 400));
    }
    const home = await get(`${base}/`);
    assert.equal(home.status, 200, home.body.slice(0, 400));
    assert.equal(home.body.includes("Failed to compile"), false);
    const download = await get(`${base}/download`);
    assert.equal(download.status, 200, download.body.slice(0, 400));
    const workspace = await get(`${base}/workspace`);
    assert.notEqual(workspace.status, 200);
    const api = await get(`${base}/api/download?platform=win`);
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
