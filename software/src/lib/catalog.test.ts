import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildProjectCatalog } from "./catalog/build.ts";
import { catalogFilePath, loadProjectCatalog, refreshProjectCatalog, writeProjectCatalog } from "./catalog/persist.ts";
import { catalogRecordId } from "./catalog/ids.ts";
import { collectPlanInputs, inferIntentFromFiles } from "./plan-intent.ts";
import { EMPTY_STEPS, validatePlan, type AgentPlan } from "./plan-spec.ts";
import { isProjectInventoryQuestion } from "./workspace-index.ts";
import { inventoryAnswer, summarizeCatalog } from "./catalog/summarize.ts";
import { SUPPORT_STATUSES, type CatalogRecord } from "./catalog/types.ts";

const fixtureSrc = path.join(process.cwd(), "tests/fixtures/catalog-project");

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

function tmpCopy(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "g-aid-catalog-"));
  fs.cpSync(fixtureSrc, root, { recursive: true });
  const tif = Buffer.alloc(16, 0);
  tif[0] = 0x49;
  tif[1] = 0x49;
  tif[2] = 0x2a;
  tif[3] = 0x00;
  fs.mkdirSync(path.join(root, "gis"), { recursive: true });
  fs.writeFileSync(path.join(root, "gis", "tiny.tif"), tif);
  fs.writeFileSync(path.join(root, "gis", "empty.tif"), Buffer.from("not a tiff"));
  const shp = Buffer.alloc(100, 0);
  shp.writeUInt32BE(9994, 0);
  fs.writeFileSync(path.join(root, "gis", "clip.shp"), shp);
  const pdf = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.from("1 0 obj")]);
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "report.pdf"), pdf);
  const lasf = Buffer.concat([Buffer.from("LASF"), Buffer.alloc(64, 1)]);
  fs.writeFileSync(path.join(root, "logs", "cloud.las"), lasf);
  const segy = Buffer.alloc(3200, 0x40);
  segy[0] = 0xc3;
  segy[1] = 0x40;
  segy[2] = 0xf1;
  fs.mkdirSync(path.join(root, "seismic"), { recursive: true });
  fs.writeFileSync(path.join(root, "seismic", "line1.sgy"), segy);
  fs.writeFileSync(path.join(root, "seismic", "fake.sgy"), Buffer.from("this is not seismic"));
  fs.writeFileSync(path.join(root, "mystery.bin"), Buffer.from([0x00, 0x01, 0x02, 0xff]));
  return root;
}

function byPath(records: CatalogRecord[], rel: string): CatalogRecord {
  const record = records.find((item) => item.relativePath.replace(/\\/g, "/") === rel);
  assert.ok(record, `missing catalog record ${rel}`);
  return record;
}

function magPlan(root: string, overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    plan: "# Implementation Plan\n",
    taskFolder: "",
    outputDir: "",
    productsRel: "",
    workspaceRoot: root,
    targetFolder: "DAY 1",
    projectName: "MIXED",
    intent: "magnetic",
    steps: { ...EMPTY_STEPS, diurnal: true },
    parameters: { baseReference: "mean_base" },
    workspaceBrief: "",
    rev: 1,
    notes: [],
    status: "draft",
    ...overrides,
  };
}

test("catalog classifies mixed folder without defaulting to magnetics", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    assert.equal(catalog.skippedOutputDir, true);
    assert.equal(catalog.truncated, false);
    assert.equal(
      catalog.records.some((record) => record.relativePath.includes("G-AID Output")),
      false
    );
    assert.equal(
      catalog.records.some((record) => record.filename === "should-skip.txt"),
      false
    );

    const rover = byPath(catalog.records, "DAY 1/rover.csv");
    assert.equal(rover.supportStatus, "supported");
    assert.equal(rover.adapterId, "magarrow");
    assert.equal(rover.formatId, "magarrow");
    assert.equal(rover.mediaClass, "tabular-text");
    assert.equal(rover.domainHint, "magnetics");
    assert.equal(rover.id, catalogRecordId("DAY 1/rover.csv"));
    assert.ok(rover.columns?.some((col) => /lat/i.test(col)));
    assert.equal(rover.provenance.method, "adapter-sniff");
    assert.ok(rover.checksum.strategy === "sha256" || rover.checksum.strategy === "sha256-head-64k");

    const base = byPath(catalog.records, "DAY 1/base.txt");
    assert.equal(base.supportStatus, "supported");
    assert.equal(base.adapterId, "gsm19");
    assert.equal(base.units, "nT");

    const chem = byPath(catalog.records, "tables/chemistry.csv");
    assert.equal(chem.supportStatus, "recognised-unsupported");
    assert.equal(chem.formatId, "delimited-table");
    assert.equal(chem.domainHint, "unknown");
    assert.notEqual(chem.adapterId, "magarrow");
    assert.notEqual(chem.adapterId, "geochem-csv");
    assert.notEqual(chem.adapterId, "geochem-xyz");

    const dem = byPath(catalog.records, "gis/dem.asc");
    assert.equal(dem.supportStatus, "supported");
    assert.equal(dem.formatId, "esri-ascii-grid");
    assert.ok(dem.bbox);

    const geojson = byPath(catalog.records, "gis/clip.geojson");
    assert.equal(geojson.formatId, "geojson");
    assert.equal(geojson.supportStatus, "supported");
    assert.equal(geojson.crs, "OGC:CRS84");
    assert.equal(geojson.geojsonContract, "rfc7946");

    const prj = byPath(catalog.records, "gis/crs.prj");
    assert.equal(prj.formatId, "esri-prj");
    assert.equal(prj.mediaClass, "crs");

    const tif = byPath(catalog.records, "gis/tiny.tif");
    assert.equal(tif.formatId, "geotiff");
    assert.equal(tif.supportStatus, "recognised-unsupported");

    const emptyTif = byPath(catalog.records, "gis/empty.tif");
    assert.equal(emptyTif.supportStatus, "unknown");
    assert.equal(emptyTif.formatId, "unknown");

    const shp = byPath(catalog.records, "gis/clip.shp");
    assert.equal(shp.formatId, "shapefile");
    assert.equal(shp.supportStatus, "recognised-unsupported");
    assert.equal(shp.shapefileSidecars?.shx, false);
    assert.ok(shp.parseErrors?.some((line) => /sidecar/i.test(line)));

    const well = byPath(catalog.records, "logs/well.las");
    assert.equal(well.formatId, "las-well");
    assert.equal(well.adapterId, "las-well");
    assert.equal(well.mediaClass, "borehole-log");
    assert.equal(well.domainHint, "geology");
    assert.equal(well.supportStatus, "supported");

    const cloud = byPath(catalog.records, "logs/cloud.las");
    assert.equal(cloud.formatId, "las-point-cloud");
    assert.equal(cloud.mediaClass, "point-cloud");

    const segy = byPath(catalog.records, "seismic/line1.sgy");
    assert.equal(segy.formatId, "segy");
    assert.equal(segy.domainHint, "seismic");
    assert.equal(segy.supportStatus, "recognised-unsupported");

    const fake = byPath(catalog.records, "seismic/fake.sgy");
    assert.equal(fake.supportStatus, "unknown");
    assert.notEqual(fake.domainHint, "seismic");

    const pdf = byPath(catalog.records, "docs/report.pdf");
    assert.equal(pdf.formatId, "pdf");
    assert.equal(pdf.mediaClass, "document");

    const readme = byPath(catalog.records, "notes/readme.md");
    assert.equal(readme.supportStatus, "recognised-unsupported");
    assert.equal(readme.mediaClass, "document");

    const mystery = byPath(catalog.records, "mystery.bin");
    assert.equal(mystery.supportStatus, "unknown");
    assert.equal(mystery.domainHint, "unknown");

    for (const record of catalog.records) {
      assert.ok(SUPPORT_STATUSES.includes(record.supportStatus));
    }

    const intent = inferIntentFromFiles(null, {
      root,
      folders: ["DAY 1"],
      files: [
        { relativePath: "DAY 1/rover.csv", name: "rover.csv", size: 10, ext: "csv", kind: "magarrow" },
        { relativePath: "DAY 1/base.txt", name: "base.txt", size: 10, ext: "txt", kind: "gsm19-base" },
        { relativePath: "tables/chemistry.csv", name: "chemistry.csv", size: 10, ext: "csv", kind: "tabular" },
      ],
      truncated: false,
    }, "", "process this folder");
    assert.equal(intent, "none");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("planner binds supported catalog ids and rejects unsupported inputs", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const inputs = collectPlanInputs(null, "DAY 1", catalog);
    assert.ok(inputs.length >= 2);
    assert.ok(inputs.every((item) => item.catalogId && item.supportStatus === "supported"));
    assert.ok(inputs.some((item) => item.adapterId === "magarrow"));
    assert.ok(inputs.some((item) => item.adapterId === "gsm19"));
    assert.equal(inputs.some((item) => item.path.includes("chemistry")), false);
    assert.equal(inputs.some((item) => item.path.includes(".tif")), false);

    const ok = validatePlan(magPlan(root, { inputs }), catalog);
    assert.equal(ok.ok, true);

    const geotiff = catalog.records.find((record) => record.formatId === "geotiff");
    assert.ok(geotiff);
    const blocked = validatePlan(
      magPlan(root, {
        inputs: [
          ...inputs,
          {
            catalogId: geotiff.id,
            path: geotiff.relativePath,
            supportStatus: geotiff.supportStatus,
            adapterId: geotiff.adapterId,
          },
        ],
      }),
      catalog
    );
    assert.equal(blocked.ok, false);
    assert.equal(blocked.blockers.some((issue) => issue.code === "unsupported_catalog_input"), true);

    const noIds = validatePlan(
      magPlan(root, {
        inputs: [{ catalogId: "", path: "DAY 1/rover.csv", kind: "magarrow" }],
      }),
      catalog
    );
    assert.equal(noIds.ok, false);
    assert.equal(noIds.blockers.some((issue) => issue.code === "missing_catalog_id"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("refresh preserves prior run provenance and stable ids", () => {
  const root = tmpCopy();
  try {
    const first = refreshProjectCatalog(root);
    assert.ok(fs.existsSync(catalogFilePath(root)));
    assert.match(catalogFilePath(root).replace(/\\/g, "/"), /\/\.g-aid\/project\.catalog.json$/);
    const roverId = byPath(first.records, "DAY 1/rover.csv").id;
    assert.ok(first.runs.some((run) => run.runId === "r-prior-1"));
    assert.equal(first.runs.find((run) => run.runId === "r-prior-1")?.source, "disk");

    fs.writeFileSync(path.join(root, "DAY 1", "rover.csv"), `${fs.readFileSync(path.join(root, "DAY 1", "rover.csv"), "utf8")}32012.0\n`);
    fs.rmSync(path.join(root, "G-AID Output", "runs", "r-prior-1"), { recursive: true, force: true });

    const second = refreshProjectCatalog(root);
    assert.equal(byPath(second.records, "DAY 1/rover.csv").id, roverId);
    assert.ok(second.previousGeneratedAt);
    const preserved = second.runs.find((run) => run.runId === "r-prior-1");
    assert.ok(preserved);
    assert.equal(preserved.source, "previous-catalog");
    const loaded = loadProjectCatalog(root);
    assert.equal(loaded?.records.length, second.records.length);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("truncation is recorded and inventory answers from the catalog", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root, { fileCountLimit: 3 });
    assert.equal(catalog.truncated, true);
    assert.match(catalog.truncationReason || "", /Stopped after 3/);
    const text = inventoryAnswer(buildProjectCatalog(root));
    assert.match(text, /supported/);
    assert.match(text, /recognised-unsupported/);
    assert.match(text, /unknown/);
    assert.match(text, /do not start a magnetic workflow/i);
    const summary = summarizeCatalog(buildProjectCatalog(root));
    assert.match(summary, /rec:/);
    assert.equal(isProjectInventoryQuestion("What is in this project?"), true);
    assert.equal(isProjectInventoryQuestion("run diurnal on DAY 1"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("write catalog is under .g-aid only", () => {
  const root = tmpCopy();
  try {
    const catalog = buildProjectCatalog(root);
    const dest = writeProjectCatalog(catalog);
    assert.match(dest.replace(/\\/g, "/"), /\/\.g-aid\/project\.catalog.json$/);
    assert.equal(fs.existsSync(path.join(root, "DAY 1", "rover.csv")), true);
    assert.equal(fs.readFileSync(path.join(root, "DAY 1", "rover.csv"), "utf8").includes("latitude"), true);
    assert.equal(fs.existsSync(path.join(root, "G-AID Output", "project.catalog.json")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("client catalog adapters do not import node:fs", () => {
  const adaptersDir = path.join(process.cwd(), "src/lib/catalog/adapters");
  const hits: string[] = [];
  for (const name of fs.readdirSync(adaptersDir)) {
    if (!name.endsWith(".ts") || name.endsWith("-node.ts")) continue;
    const text = fs.readFileSync(path.join(adaptersDir, name), "utf8");
    if (text.includes("node:fs") || text.includes("node:crypto")) hits.push(name);
  }
  assert.deepEqual(hits, []);
  assert.equal(fs.existsSync(path.join(adaptersDir, "shapefile-node.ts")), true);
});

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall tests passed");
