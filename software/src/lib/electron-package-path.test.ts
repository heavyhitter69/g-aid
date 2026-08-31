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

const MARKETING_PUBLIC = [
  "public/data.jpg",
  "public/env-gphy.jpg",
  "public/exp-gphy.jpg",
  "public/geo.jpg",
  "public/gtech.jpg",
  "public/hydro.jpg",
  "public/seis.jpg",
];

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, acc);
    else acc.push(full);
  }
  return acc;
}

function findUnpackedApp(): string | null {
  const dist = path.join(root, "dist_desktop");
  if (!fs.existsSync(dist)) return null;
  const candidates = [
    path.join(dist, "linux-unpacked", "resources", "app"),
    path.join(dist, "linux-unpacked"),
    path.join(dist, "mac", "G-AID.app", "Contents", "Resources", "app"),
    path.join(dist, "win-unpacked", "resources", "app"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "electron", "main.js")) || fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
    const nested = path.join(candidate, "resources", "app");
    if (fs.existsSync(path.join(nested, "electron", "main.js"))) return nested;
  }
  return null;
}

test("Electron main and builder paths stay inside software/", () => {
  assert.match(pkg.scripts["dev:electron"], /--no-sandbox/);
  assert.equal(pkg.main, "electron/main.js");
  assert.equal(fs.existsSync(path.join(root, "electron/main.js")), true);
  assert.equal(fs.existsSync(path.join(root, "electron/desktop-auth.js")), true);
  assert.equal(fs.existsSync(path.join(root, "electron/preload.js")), true);
  const files: string[] = pkg.build?.files ?? [];
  assert.equal(files.some((f: string) => f.includes("website/") && !f.startsWith("!")), false);
  assert.ok(files.includes("!website/**/*"));
  assert.ok(files.includes("!tests/**/*"));
  assert.ok(files.includes("!docs/**/*"));
  assert.ok(files.includes("!python/tests/**/*"));
  assert.ok(files.includes("!src/**/*.ts"));
  assert.ok(files.includes("!src/**/*.tsx"));
  for (const asset of MARKETING_PUBLIC) {
    assert.ok(files.includes(`!${asset}`), asset);
  }
  const extras = pkg.build?.extraResources ?? [];
  assert.ok(extras.some((e: { from?: string }) => e.from === "python/dist/g-aid-engine"));
  assert.ok(extras.some((e: { from?: string }) => e.from === "resources/ai"));
  const main = fs.readFileSync(path.join(root, "electron/main.js"), "utf8");
  assert.match(main, /dir: app\.getAppPath\(\)/);
  assert.match(main, /GAID_AUTH_BASE_URL/);
  assert.match(main, /requestSingleInstanceLock/);
  assert.equal(main.includes("g-aid.io"), false);
  assert.match(main, /pendingAuthSession\.take/);
  assert.match(main, /isAllowedDesktopAuthIpc/);
  assert.match(main, /const gotTheLock = app\.requestSingleInstanceLock\(\)/);
  assert.match(main, /if \(!gotTheLock\) \{\s*app\.quit\(\);/s);
  assert.match(main, /applyWindowIcon/);
  assert.match(main, /applyAppIcon/);
  assert.match(main, /app\.dock\.setIcon/);
  assert.match(main, /app\.setName\(APP_NAME\)/);
  assert.match(main, /app\.setDesktopName/);
  assert.match(main, /app\.setAppUserModelId\(APP_USER_MODEL_ID\)/);
  assert.match(main, /installLinuxDesktopIdentity/);
  assert.match(main, /installWindowsAppIdentity/);
  assert.match(main, /writeShortcutLink/);
  assert.match(main, /LINUX_WM_CLASS = "g-aid"/);
  assert.match(main, /appendSwitch\("class", LINUX_WM_CLASS\)/);
  assert.match(main, /CHROME_DESKTOP/);
  assert.match(main, /StartupWMClass=\$\{LINUX_WM_CLASS\}/);
  assert.match(main, /iconPath: icon/);
  assert.equal(main.includes("iconPath: program"), false);
  assert.equal(main.includes("if (process.platform !== \"linux\" || dev) return"), false);
  assert.match(main, /app-icon\.png/);
  assert.equal(pkg.productName, "G-AID");
  assert.equal(pkg.build?.productName, "G-AID");
  assert.equal(pkg.name, "g-aid-software");
  assert.match(main, /GAID_OPEN_DEVTOOLS/);
  assert.match(main, /toggleDevTools/);
  assert.equal(main.includes('if (dev) {\n    mainWindow.webContents.openDevTools'), false);
});

test("workspace Settings tab renders SettingsView instead of the dashboard default", () => {
  const page = fs.readFileSync(path.join(root, "src/app/workspace/page.tsx"), "utf8");
  assert.match(page, /SettingsView/);
  assert.match(page, /case "settings":/);
  assert.equal(page.includes('from "@/components/workspace/settings-view"'), true);
});

test("welcome onboarding uses the G-AID logo and product name, not a brain mark", () => {
  const page = fs.readFileSync(path.join(root, "src/app/onboarding/page.tsx"), "utf8");
  assert.equal(page.includes("Brain"), false);
  assert.equal(page.includes("Sparkles"), false);
  assert.match(page, /PRODUCT_NAME/);
  assert.match(page, /<Logo /);
  assert.match(page, /\{PRODUCT_NAME\} is a local desktop workspace/);
  const layout = fs.readFileSync(path.join(root, "src/app/layout.tsx"), "utf8");
  assert.match(layout, /APP_ICON_PUBLIC_PATH/);
  assert.equal(layout.includes('"/icon.png"'), false);
});

test("desktop auth client does not return browser secrets to the renderer", () => {
  const desktopAuth = fs.readFileSync(path.join(root, "electron/desktop-auth.js"), "utf8");
  assert.match(desktopAuth, /return \{ started: true \}/);
  assert.match(desktopAuth, /redactSensitiveText/);
  assert.equal(desktopAuth.includes("g-aid.io"), false);
});

test("packaged dry-run tree excludes website, marketing, fixtures, and validation evidence", () => {
  const unpacked = findUnpackedApp();
  if (!unpacked) {
    console.log("skip  packaged dry-run tree (dist_desktop unpacked app not present yet)");
    return;
  }
  const rels = walkFiles(unpacked).map((file) => path.relative(unpacked, file).replace(/\\/g, "/"));
  const joined = rels.join("\n");
  assert.equal(joined.includes("website/"), false, "packaged tree contains website/");
  assert.equal(rels.some((rel) => rel.startsWith("tests/")), false, "packaged tree contains tests/");
  assert.equal(rels.some((rel) => rel.startsWith("docs/")), false, "packaged tree contains docs/");
  assert.equal(rels.some((rel) => rel.startsWith("python/tests/")), false, "packaged tree contains python/tests/");
  assert.equal(rels.some((rel) => rel.endsWith(".test.ts")), false, "packaged tree contains *.test.ts");
  for (const asset of MARKETING_PUBLIC) {
    assert.equal(rels.includes(asset), false, asset);
  }
  assert.ok(fs.existsSync(path.join(unpacked, "electron/main.js")));
  assert.ok(fs.existsSync(path.join(unpacked, "electron/preload.js")));
  assert.ok(
    fs.existsSync(path.join(unpacked, ".next")) || fs.existsSync(path.join(unpacked, ".next/BUILD_ID")),
    "Next build output missing from packaged app"
  );
  assert.ok(
    fs.existsSync(path.join(unpacked, "public/g-aid logo.png")) ||
      fs.existsSync(path.join(unpacked, "public/g-aid-logo.png"))
  );
  const resourcesRoot = path.resolve(unpacked, "..");
  const engine = path.join(resourcesRoot, "g-aid-engine");
  const ai = path.join(resourcesRoot, "ai");
  assert.ok(fs.existsSync(engine) || fs.existsSync(path.join(unpacked, "python")), "Python engine/resources missing");
  assert.ok(fs.existsSync(ai) || fs.existsSync(path.join(unpacked, "resources/ai")), "AI extraResources missing");
  const iconOk =
    fs.existsSync(path.join(unpacked, "build/icon.png")) ||
    fs.existsSync(path.join(resourcesRoot, "..", "usr", "share", "icons")) ||
    walkFiles(path.resolve(unpacked, "..", "..")).some((file) => /icon\.(png|ico|icns)$/i.test(file));
  assert.ok(iconOk, "packaged icons missing");
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
