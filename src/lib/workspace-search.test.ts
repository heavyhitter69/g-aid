import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { WorkspaceIndex } from "./workspace-index.ts";
import {
  extractSearchNeedles,
  grepWorkspaceRoot,
  inferTargetFolder,
  searchWorkspaceIndex,
  unmatchedNeedles,
} from "./workspace-search.ts";

const index: WorkspaceIndex = {
  root: "/surveys/KUMASI-2026",
  truncated: false,
  folders: ["DAY 1", "DAY 2", "notes", "G-AID Output"],
  files: [
    { relativePath: "DAY 1/BASE.txt", name: "BASE.txt", size: 1200, ext: "txt", kind: "gsm19-base" },
    { relativePath: "DAY 1/A (16)-10Hz.csv", name: "A (16)-10Hz.csv", size: 8000, ext: "csv", kind: "magarrow" },
    { relativePath: "DAY 2/C (13)-10Hz.csv", name: "C (13)-10Hz.csv", size: 9000, ext: "csv", kind: "magarrow" },
    { relativePath: "notes/readme.md", name: "readme.md", size: 80, ext: "md", kind: "other" },
    { relativePath: "G-AID Output/DAY 1 - diurnal/map.png", name: "map.png", size: 10, ext: "png", kind: "other" },
  ],
};

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

test("named needles keep survey names and skip filler words", () => {
  const needles = extractSearchNeedles('Process SANBUSI DAY 1 and the file "A (16)-10Hz.csv" please');
  assert.equal(needles.named.some((item) => /sanbusi/i.test(item)), true);
  assert.equal(needles.named.some((item) => /day 1/i.test(item)), true);
  assert.equal(needles.named.some((item) => /A \(16\)-10Hz\.csv/i.test(item)), true);
  assert.equal(needles.all.includes("please") || needles.named.includes("Process"), false);
});

test("search finds DAY 1 and MagArrow filenames without a hardcoded survey", () => {
  const hits = searchWorkspaceIndex(index, "process day 1 A (16) magarrow");
  assert.ok(hits.some((hit) => hit.relativePath === "DAY 1"));
  assert.ok(hits.some((hit) => hit.relativePath.includes("A (16)-10Hz.csv")));
  assert.equal(hits.some((hit) => hit.relativePath.startsWith("G-AID Output")), false);
});

test("inferTargetFolder still resolves day 2 and also a named file's parent", () => {
  assert.equal(inferTargetFolder("process day 2 magnetics", index), "DAY 2");
  assert.equal(inferTargetFolder("look at A (16)-10Hz.csv", index), "DAY 1");
});

test("unmatched named tokens are reported", () => {
  const hits = searchWorkspaceIndex(index, "process Flight_99");
  const misses = unmatchedNeedles(["Flight_99"], hits);
  assert.deepEqual(misses, ["Flight_99"]);
});

test("grep finds a token inside file contents on disk", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gaid-search-"));
  try {
    fs.mkdirSync(path.join(root, "Line_alpha"));
    fs.writeFileSync(
      path.join(root, "Line_alpha", "logger.txt"),
      "time nT sq\n12:00:00.0  48012.1  99\n"
    );
    const hits = grepWorkspaceRoot(root, "time nt sq");
    assert.ok(hits.some((hit) => hit.why === "content" && hit.relativePath.includes("logger.txt")));
    assert.equal(inferTargetFolder("process Line_alpha", {
      root,
      folders: ["Line_alpha"],
      files: [{ relativePath: "Line_alpha/logger.txt", name: "logger.txt", size: 40, ext: "txt", kind: "gsm19-base" }],
      truncated: false,
    }), "Line_alpha");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("sample MagArrow folder is found by name without SANBUSI hardcoding", () => {
  const sample = "/workspace/.tmp/local_uploads";
  if (!fs.existsSync(path.join(sample, "DAY 1"))) return;
  const hits = grepWorkspaceRoot(sample, "process DAY 1 MagArrow A (16)");
  assert.ok(hits.some((hit) => /A \(16\)-10Hz\.csv/i.test(hit.relativePath)));
  assert.ok(hits.some((hit) => /^DAY 1$/i.test(hit.name) || hit.relativePath.startsWith("DAY 1")));
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
