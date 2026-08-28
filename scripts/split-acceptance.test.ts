import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

let failed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok  ${name}`);
    console.error(err);
  }
}

const root = process.cwd();
function exists(rel: string) {
  return fs.existsSync(path.join(root, rel));
}
function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("website contains public site, legal/docs/download, and public auth only", () => {
  assert.equal(exists("website/src/app/page.tsx"), true);
  assert.equal(exists("website/src/app/docs/page.tsx"), true);
  assert.equal(exists("website/src/app/download/page.tsx"), true);
  assert.equal(exists("website/src/app/signin/page.tsx"), true);
  assert.equal(exists("website/src/app/auth/desktop/confirm/page.tsx"), true);
  assert.equal(exists("website/src/app/api/auth/desktop/authorize/route.ts"), true);
  assert.equal(exists("website/src/app/api/auth/desktop/token/route.ts"), true);
  assert.equal(exists("website/src/app/workspace"), false);
  assert.equal(exists("website/src/lib/catalog"), false);
  assert.equal(exists("website/python"), false);
  assert.equal(exists("website/electron"), false);
  assert.equal(exists("website/src/app/api/agent"), false);
  assert.equal(exists("website/src/lib/supabase/storage.ts"), false);
});

test("software contains Electron, workspace, catalog, Python, tests, and packaging", () => {
  assert.equal(exists("software/electron/main.js"), true);
  assert.equal(exists("software/src/app/workspace/page.tsx"), true);
  assert.equal(exists("software/src/lib/catalog/index.ts"), true);
  assert.equal(exists("software/src/lib/capabilities/registry.ts"), true);
  assert.equal(exists("software/python/tests/conftest.py"), true);
  assert.equal(exists("software/docs/validation"), true);
  assert.equal(exists("software/tests/fixtures"), true);
  assert.equal(exists("software/package.json"), true);
  const pkg = JSON.parse(read("software/package.json"));
  assert.equal(pkg.main, "electron/main.js");
  assert.ok(pkg.build);
  const files: string[] = pkg.build.files ?? [];
  assert.ok(files.includes("!website/**/*"));
  assert.ok(files.includes("!tests/**/*"));
  assert.ok(files.includes("!docs/**/*"));
  assert.ok(files.includes("!python/tests/**/*"));
  assert.ok(files.includes("!public/env-gphy.jpg"));
  assert.equal(exists("software/src/app/docs"), false);
  assert.equal(exists("software/src/app/download"), false);
  assert.equal(exists("software/src/components/landing"), false);
  assert.equal(exists("software/src/app/api/auth/desktop"), false);
  assert.equal(exists("software/src/components/auth/public-login-unconfigured-notice.tsx"), true);
});

test("auth-contract is client-safe PKCE only", () => {
  const files = ["packages/auth-contract/src/contract.ts", "packages/auth-contract/src/sha256.ts", "packages/auth-contract/src/index.ts"];
  for (const rel of files) {
    const text = read(rel);
    assert.equal(/from ["']node:crypto["']/.test(text), false, rel);
    assert.equal(text.includes("DESKTOP_AUTH_TOKEN_KEY"), false, rel);
    assert.equal(text.includes("supabase"), false, rel);
    assert.equal(text.includes("g-aid.io"), false, rel);
  }
  assert.match(read("packages/auth-contract/src/contract.ts"), /code_challenge/);
});

test("branding stays within name and logo assets", () => {
  assert.equal(exists("packages/branding/src/index.ts"), true);
  assert.equal(exists("packages/branding/assets/g-aid-logo.png"), true);
  assert.equal(exists("packages/branding/assets/favicon.ico"), true);
  const branding = read("packages/branding/src/index.ts");
  assert.match(branding, /PRODUCT_NAME/);
  assert.equal(branding.includes("catalog"), false);
  assert.equal(branding.includes("PKCE"), false);
  assert.equal(branding.includes("supabase"), false);
});

test("PKCE remains fail-closed without a production domain", () => {
  const main = read("software/electron/main.js");
  assert.match(main, /GAID_AUTH_BASE_URL/);
  assert.equal(main.includes("g-aid.io"), false);
  const limiter = read("website/src/lib/desktop-auth/limiter.ts");
  assert.match(limiter, /rate_limit_unavailable/);
  assert.match(limiter, /nodeEnv === "production"/);
  const signin = read("software/src/app/signin/page.tsx");
  assert.match(signin, /Online sign-in is not configured yet|PublicLoginUnconfiguredNotice/);
  assert.equal(signin.includes("startPublicLogin"), true);
});

test("root workspaces expose separate website and software commands", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.deepEqual(pkg.workspaces, ["packages/branding", "packages/auth-contract", "website", "software"]);
  assert.equal(pkg.scripts["dev:website"], "npm run dev -w website");
  assert.equal(pkg.scripts["dev:software"], "npm run dev -w software");
  assert.equal(pkg.scripts["dev:electron"], "npm run dev:electron -w software");
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
