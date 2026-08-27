import type { CatalogRecord, ProjectCatalog, SupportStatus } from "./types.ts";
import { isSupportedProcessingRecord } from "./classify.ts";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function countBySupport(catalog: ProjectCatalog): Record<SupportStatus, number> {
  const counts: Record<SupportStatus, number> = {
    supported: 0,
    "recognised-unsupported": 0,
    unknown: 0,
  };
  for (const record of catalog.records) {
    counts[record.supportStatus] += 1;
  }
  return counts;
}

export function recordsInTarget(catalog: ProjectCatalog | null, targetFolder: string): CatalogRecord[] {
  const records = catalog?.records ?? [];
  if (!targetFolder) return records;
  const prefix = targetFolder.replace(/\\/g, "/").replace(/\/$/, "");
  return records.filter((record) => {
    const rel = record.relativePath.replace(/\\/g, "/");
    return rel === prefix || rel.startsWith(`${prefix}/`);
  });
}

export function summarizeCatalog(catalog: ProjectCatalog | null, maxRecords = 80): string {
  if (!catalog) return "No project catalog. Open a folder to build one.";
  const counts = countBySupport(catalog);
  const magarrow = catalog.records.filter((record) => record.adapterId === "magarrow" && record.supportStatus === "supported");
  const gsm19 = catalog.records.filter((record) => record.adapterId === "gsm19" && record.supportStatus === "supported");
  const gravity = catalog.records.filter(
    (record) => (record.adapterId === "gravity-xyz" || record.adapterId === "gravity-csv") && record.supportStatus === "supported"
  );
  const dem = catalog.records.filter((record) => record.adapterId === "dem-ascii" && record.supportStatus === "supported");
  const ert = catalog.records.filter(
    (record) => (record.adapterId === "ert-dat" || record.adapterId === "ert-csv") && record.supportStatus === "supported"
  );
  const radio = catalog.records.filter(
    (record) =>
      (record.adapterId === "radiometric-csv" || record.adapterId === "radiometric-xyz") &&
      record.supportStatus === "supported"
  );
  const gpr = catalog.records.filter((record) => record.adapterId === "gpr-csv" && record.supportStatus === "supported");
  const las = catalog.records.filter((record) => record.adapterId === "las-well" && record.supportStatus === "supported");
  const geojson = catalog.records.filter((record) => record.adapterId === "geojson" && record.supportStatus === "supported");
  const geochem = catalog.records.filter(
    (record) => (record.adapterId === "geochem-csv" || record.adapterId === "geochem-xyz") && record.supportStatus === "supported"
  );
  const lines = [
    `Project catalog (${catalog.records.length} source files; G-AID Output skipped)`,
    `Support: supported ${counts.supported}, recognised-unsupported ${counts["recognised-unsupported"]}, unknown ${counts.unknown}`,
    `Supported processing inputs: MagArrow ${magarrow.length}, GSM-19 ${gsm19.length}, gravity ${gravity.length}, DEM ${dem.length}, ERT ${ert.length}, radiometrics ${radio.length}, GPR ${gpr.length}, LAS ${las.length}, GeoJSON ${geojson.length}, geochemistry ${geochem.length}`,
    catalog.truncated ? `Truncated: ${catalog.truncationReason || "file-count limit reached"}` : "",
    catalog.runs.length ? `Prior runs preserved: ${catalog.runs.map((run) => run.runId).join(", ")}` : "Prior runs preserved: (none)",
    "This catalog does not imply a magnetic, gravity, ERT, radiometric, GPR, borehole, GIS, or geochemistry workflow. Only supported MagArrow, GSM-19, gravity-contract, dem-ascii, ERT-contract, RAD-contract, GPR-contract, LAS 2.0, documented GeoJSON, and G-AID GEOCHEM 1.0 records can be processing inputs.",
  ].filter(Boolean);

  const shown = catalog.records.slice(0, maxRecords);
  for (const record of shown) {
    const err = record.parseErrors?.length ? `; parse errors: ${record.parseErrors[0]}` : "";
    lines.push(
      `- ${record.relativePath} [${record.id}] ${record.supportStatus}, ${record.formatId}/${record.mediaClass}, confidence ${record.sniffConfidence.toFixed(2)}, ${formatSize(record.size)}${err}`
    );
  }
  if (catalog.records.length > shown.length) {
    lines.push(`- … ${catalog.records.length - shown.length} more (open Dataset Explorer)`);
  }
  return lines.join("\n");
}

export function inventoryAnswer(catalog: ProjectCatalog | null): string {
  if (!catalog) {
    return "I don't have a project catalog yet. Open the survey folder (File → Open Folder) and I will inventory source files without assuming a magnetic workflow.";
  }
  const counts = countBySupport(catalog);
  const magarrow = catalog.records.filter((r) => r.adapterId === "magarrow" && r.supportStatus === "supported").length;
  const gsm19 = catalog.records.filter((r) => r.adapterId === "gsm19" && r.supportStatus === "supported").length;
  const gravity = catalog.records.filter(
    (r) => (r.adapterId === "gravity-xyz" || r.adapterId === "gravity-csv") && r.supportStatus === "supported"
  ).length;
  const dem = catalog.records.filter((r) => r.adapterId === "dem-ascii" && r.supportStatus === "supported").length;
  const ert = catalog.records.filter(
    (r) => (r.adapterId === "ert-dat" || r.adapterId === "ert-csv") && r.supportStatus === "supported"
  ).length;
  const radio = catalog.records.filter(
    (r) => (r.adapterId === "radiometric-csv" || r.adapterId === "radiometric-xyz") && r.supportStatus === "supported"
  ).length;
  const gpr = catalog.records.filter((r) => r.adapterId === "gpr-csv" && r.supportStatus === "supported").length;
  const las = catalog.records.filter((r) => r.adapterId === "las-well" && r.supportStatus === "supported").length;
  const geojson = catalog.records.filter((r) => r.adapterId === "geojson" && r.supportStatus === "supported").length;
  const geochem = catalog.records.filter(
    (r) => (r.adapterId === "geochem-csv" || r.adapterId === "geochem-xyz") && r.supportStatus === "supported"
  ).length;
  const formats = new Map<string, number>();
  for (const record of catalog.records) {
    formats.set(record.formatId, (formats.get(record.formatId) || 0) + 1);
  }
  const formatList = [...formats.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 16)
    .map(([id, n]) => `${id} (${n})`)
    .join(", ");
  const lines = [
    `This folder has **${catalog.records.length}** source files in the project catalog (G-AID Output was skipped).`,
    `- **supported** (can be processing inputs): ${counts.supported} — MagArrow ${magarrow}, GSM-19 ${gsm19}, gravity ${gravity}, DEM ${dem}, ERT ${ert}, radiometrics ${radio}, GPR ${gpr}, LAS ${las}, GeoJSON ${geojson}, geochemistry ${geochem}`,
    `- **recognised-unsupported** (identified, not processed in this release): ${counts["recognised-unsupported"]}`,
    `- **unknown** (not identified reliably): ${counts.unknown}`,
    formatList ? `Formats: ${formatList}.` : "",
    catalog.truncated ? `The catalog is truncated: ${catalog.truncationReason}` : "",
    catalog.runs.length
      ? `Prior run provenance kept: ${catalog.runs.map((run) => run.runId).join(", ")}.`
      : "",
    magarrow && gsm19
      ? "I can plan MagArrow + GSM-19 magnetics if you ask for that work. Mixed files do not start a magnetic workflow by themselves."
      : "I will not start a magnetic workflow unless you ask for magnetics and both MagArrow and GSM-19 supported records are present.",
    gravity
      ? "I can plan gravity reductions if you ask, after density, CRS, units, and elevation datum are documented. Near-zone terrain-corrected Bouguer also needs a documented dem-ascii record. Intermediate- and far-zone rings need covering DEM extent; G-AID does not download terrain. Spherical far-zone treatment, Hayford–Bowie geometry, global coverage, and atmospheric correction are excluded."
      : "Gravity processing needs a documented XYZ/CSV contract, not the first .xyz file.",
    dem
      ? "A documented DEM ASCII record is available as a near-zone terrain source. I will not download a DEM or apply far-zone terrain."
      : "Near-zone terrain-corrected Bouguer is blocked until a documented DEM (EPSG, Units=m, ElevationDatum) is in the catalog.",
    ert
      ? "I can plan ERT ingest/QC and a labelled pseudosection if you ask. 2-D inversion is experimental and is not in the default ERT workflow."
      : "ERT processing needs a documented Res2DInv-style .dat or reviewed ERT CSV, not the first .dat file.",
    radio
      ? "I can plan already-corrected radiometric ingest, grids, ternary (concentrations only), ratios, and GIS if you ask. Height correction, stripping, NASVD, and concentration conversion are not live capabilities."
      : "Radiometric processing needs a documented G-AID RAD 1.0 table (CRS, quantity, units, Line, acquisition metadata, CorrectionHistory), not a K/U/Th assay or a file with a familiar extension.",
    gpr
      ? "I can plan G-AID GPR 1.0 ingest, dewow/time-zero/SEC/bandpass, and a two-way-time radargram if you ask. Kirchhoff migration needs a user velocity. Arbitrary .dzt files are recognised-unsupported."
      : "GPR processing needs a documented G-AID GPR 1.0 CSV (Units, dt_ns, dx_m, AntennaMHz, Trace/Sample/Amplitude), not the first .dzt file.",
    las
      ? "I can plan CWLS LAS 2.0 WRAP.NO ingest, measured-depth log viewing, and evidence-bound interpretation if you ask. A collar is mapped only with coordinates and CRS. LASF LiDAR is not a well log."
      : "Borehole processing needs a documented CWLS LAS 2.0 WRAP.NO well log, not the first .las file or a LASF point cloud.",
    geojson
      ? "I can plan documented GeoJSON ingest, source-layer viewing, same-CRS overlap tables, and GeoJSON export if you ask. Layer roles are user-assigned. Shapefile and GeoPackage stay recognised-unsupported."
      : "GIS vector processing needs documented GeoJSON with an EPSG. Shapefile sidecars and GeoPackage are recognised, not parsed.",
    geochem
      ? "I can plan G-AID GEOCHEM 1.0 ingest, QC, sample-point maps, uncensored summaries, and evidence-bound interpretation if you ask. Below-detection stays censored. An arbitrary Fe/Cu CSV is not geochemistry."
      : "Geochemistry processing needs a documented G-AID GEOCHEM 1.0 table (CRS, Medium, SampleID, X, Y, element units), not the first chemistry CSV.",
    "Recognised-unsupported and unknown files never go to Proceed as processing inputs.",
  ].filter(Boolean);
  return lines.join("\n");
}

export function findRecord(catalog: ProjectCatalog | null, id: string): CatalogRecord | undefined {
  if (!catalog || !id) return undefined;
  return catalog.records.find((record) => record.id === id);
}

export function supportedProcessingRecords(catalog: ProjectCatalog | null, targetFolder = ""): CatalogRecord[] {
  return recordsInTarget(catalog, targetFolder).filter(isSupportedProcessingRecord);
}
