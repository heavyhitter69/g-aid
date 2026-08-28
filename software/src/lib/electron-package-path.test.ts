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
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

test("Electron main and builder paths stay inside software/", () => {
  assert.equal(pkg.main, "electron/main.js");
  assert.equal(fs.existsSync(path.join(root, "electron/main.js")), true);
  assert.equal(fs.existsSync(path.join(root, "electron/desktop-auth.js")), true);
  assert.equal(fs.existsSync(path.join(root, "electron/preload.js")), true);
  const files: string[] = pkg.build?.files ?? [];
  assert.equal(files.some((f: string) => f.includes("website/")), false);
  const extras = pkg.build?.extraResources ?? [];
  assert.ok(extras.some((e: { from?: string }) => e.from === "python/dist/g-aid-engine"));
  assert.ok(extras.some((e: { from?: string }) => e.from === "resources/ai"));
  const main = fs.readFileSync(path.join(root, "electron/main.js"), "utf8");
  assert.match(main, /dir: app\.getAppPath\(\)/);
  assert.match(main, /GAID_AUTH_BASE_URL/);
  assert.equal(main.includes("g-aid.io"), false);
  assert.match(main, /pendingAuthSession\.take/);
  assert.match(main, /isAllowedDesktopAuthIpc/);
});

test("desktop auth client does not return browser secrets to the renderer", () => {
  const desktopAuth = fs.readFileSync(path.join(root, "electron/desktop-auth.js"), "utf8");
  assert.match(desktopAuth, /return \{ started: true \}/);
  assert.match(desktopAuth, /redactSensitiveText/);
  assert.equal(desktopAuth.includes("g-aid.io"), false);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
