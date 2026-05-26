/**
 * auto-ingest.ts
 * Bridges the file-upload path (registerFile / addProjectFile) to the
 * scientific state engine (scientificState.ingestDataset).
 *
 * Given a browser File object it:
 *  1. Reads the first ~200 rows of CSV/TSV/DAT text
 *  2. Detects the data modality from column headers + file extension
 *  3. Computes lightweight quality metrics (row count, null ratio, spatial extent)
 *  4. Constructs a GeoDataset and returns it for ingestion
 *
 * Non-geophysical files (.json, .yaml, .txt with no recognisable columns) are
 * silently skipped (returns null).
 */

import type {
  GeoDataset,
  DataModality,
  BoundingBox,
  DataQualityMetrics,
} from "@/types/scientific";

// ─── Column keyword maps ──────────────────────────────────────────────────────

const MODALITY_KEYWORDS: Record<DataModality, string[]> = {
  magnetic: [
    "mag", "tmi", "nt", "igrf", "rtp", "analytic_signal", "as", "thd",
    "vd", "tilt", "magnetic", "magvalid", "diurnal",
  ],
  resistivity: [
    "res", "rho", "ohm", "ert", "ip", "chargeability", "resistivity",
    "apparent_res", "appres", "conductivity",
  ],
  gravity: [
    "grav", "bouguer", "freeair", "free_air", "mgal", "gravity",
    "terrain_correction", "isostatic",
  ],
  seismic: [
    "velocity", "vp", "vs", "amplitude", "twt", "seismic", "reflection",
    "refraction", "offset",
  ],
  "well-log": [
    "depth", "gamma", "density", "porosity", "sonic", "caliper", "sp",
    "neutron", "log",
  ],
  geochemical: ["ppm", "assay", "geochem", "sample_id"],
  dem: ["elevation", "dtm", "dem", "altitude", "height"],
  "remote-sensing": ["band", "ndvi", "spectral", "reflectance"],
};

const SPATIAL_KEYWORDS: Record<string, "lat" | "lon"> = {
  lat: "lat",
  latitude: "lat",
  northing: "lat",
  y: "lat",
  lon: "lon",
  lng: "lon",
  longitude: "lon",
  easting: "lon",
  x: "lon",
};

const SUPPORTED_EXTENSIONS = new Set([
  "csv", "tsv", "dat", "txt", "xyz", "asc", "las",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extension(fileName: string): string {
  const i = fileName.lastIndexOf(".");
  return i >= 0 ? fileName.slice(i + 1).toLowerCase() : "";
}

function detectDelimiter(firstLine: string): string {
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  const semis = (firstLine.match(/;/g) ?? []).length;
  if (tabs > 0 && tabs >= commas) return "\t";
  if (semis > commas) return ";";
  return ",";
}

function parseRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let inside = false;
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inside && line[i + 1] === '"') { current += '"'; i++; }
      else inside = !inside;
    } else if (ch === delimiter && !inside) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

// ─── Core logic ───────────────────────────────────────────────────────────────

function detectModality(headers: string[], ext: string): DataModality | null {
  const normalised = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ""));

  // Score each modality by keyword hits
  let bestModality: DataModality | null = null;
  let bestScore = 0;

  for (const [modality, keywords] of Object.entries(MODALITY_KEYWORDS) as [DataModality, string[]][]) {
    let score = 0;
    for (const kw of keywords) {
      for (const col of normalised) {
        if (col.includes(kw)) score++;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestModality = modality;
    }
  }

  // Extension-based fallback
  if (!bestModality || bestScore === 0) {
    if (ext === "las") return "well-log";
    if (ext === "sgy" || ext === "segy") return "seismic";
    if (ext === "grd") return "gravity";
    // If we found spatial columns but no modality keywords, default to magnetic
    // (most common survey type for generic CSV with lat/lon/value)
    const hasSpatial = normalised.some((c) =>
      Object.keys(SPATIAL_KEYWORDS).some((k) => c.includes(k))
    );
    if (hasSpatial && normalised.length >= 3) return "magnetic";
    return null;
  }

  return bestModality;
}

function detectSpatialColumns(headers: string[]): { latIdx: number; lonIdx: number } | null {
  let latIdx = -1;
  let lonIdx = -1;
  const normalised = headers.map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, ""));

  for (let i = 0; i < normalised.length; i++) {
    const col = normalised[i];
    for (const [keyword, type] of Object.entries(SPATIAL_KEYWORDS)) {
      if (col === keyword || col.includes(keyword)) {
        if (type === "lat" && latIdx === -1) latIdx = i;
        if (type === "lon" && lonIdx === -1) lonIdx = i;
      }
    }
  }

  return latIdx >= 0 && lonIdx >= 0 ? { latIdx, lonIdx } : null;
}

function computeSpatialExtent(
  rows: string[][],
  latIdx: number,
  lonIdx: number
): BoundingBox {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (const row of rows) {
    const lat = parseFloat(row[latIdx]);
    const lon = parseFloat(row[lonIdx]);
    if (isNaN(lat) || isNaN(lon)) continue;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }

  if (!isFinite(minLat)) {
    return { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };
  }

  return { minLat, maxLat, minLon, maxLon };
}

function computeQualityMetrics(
  rows: string[][],
  headers: string[]
): DataQualityMetrics {
  const totalCells = rows.length * headers.length;
  let nullCells = 0;

  for (const row of rows) {
    for (let i = 0; i < headers.length; i++) {
      const val = row[i] ?? "";
      if (val === "" || val.toLowerCase() === "null" || val.toLowerCase() === "nan" || val === "-") {
        nullCells++;
      }
    }
  }

  const completeness = totalCells > 0 ? 1 - nullCells / totalCells : 0;
  // Map completeness to a rough SNR (0–40 dB range)
  const snr = completeness * 35 + 5;
  const coverage = Math.min(100, rows.length / 5); // rough coverage estimate

  return {
    signalToNoise: Math.round(snr * 10) / 10,
    coveragePercent: Math.round(coverage * 10) / 10,
    tieLineRMSE: null,
    samplingUniformity: completeness > 0.95 ? 0.9 : completeness > 0.8 ? 0.7 : 0.5,
    knownArtifacts: [],
  };
}

function inferUnits(modality: DataModality): string {
  switch (modality) {
    case "magnetic": return "nT";
    case "resistivity": return "Ω·m";
    case "gravity": return "mGal";
    case "seismic": return "m/s";
    case "well-log": return "m";
    case "geochemical": return "ppm";
    case "dem": return "m";
    case "remote-sensing": return "DN";
    default: return "";
  }
}

function inferAcquisitionMethod(modality: DataModality, headers: string[]): string {
  const lower = headers.map((h) => h.toLowerCase()).join(" ");
  switch (modality) {
    case "magnetic":
      if (lower.includes("diurnal") || lower.includes("base")) return "Ground magnetic survey";
      return "Magnetic survey";
    case "resistivity":
      if (lower.includes("ip") || lower.includes("chargeability")) return "ERT + IP survey";
      return "Electrical resistivity survey";
    case "gravity":
      return "Ground gravity survey";
    case "seismic":
      return "Seismic reflection/refraction survey";
    case "well-log":
      return "Borehole geophysical logging";
    default:
      return "Geophysical survey";
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const MAX_PREVIEW_ROWS = 200;

/**
 * Attempt to auto-ingest a File as a GeoDataset.
 * Returns null if the file is not a recognisable geophysical dataset.
 */
export async function autoIngestFile(
  file: File,
  fileId: string
): Promise<GeoDataset | null> {
  const ext = extension(fileId);

  if (!SUPPORTED_EXTENSIONS.has(ext)) return null;

  let text: string;
  try {
    // Read first ~256KB for header detection — not the entire file
    const slice = file.slice(0, 256 * 1024);
    text = await slice.text();
  } catch {
    return null;
  }

  text = text.replace(/^\uFEFF/, "").trim();
  if (!text) return null;

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null; // need at least header + 1 data row

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseRow(lines[0], delimiter);

  // Skip if header looks like all-numeric (no real header row)
  const allNumeric = headers.every((h) => !isNaN(Number(h)));
  const effectiveHeaders = allNumeric
    ? headers.map((_, i) => `col_${i}`)
    : headers;
  const dataStartIdx = allNumeric ? 0 : 1;

  const modality = detectModality(effectiveHeaders, ext);
  if (!modality) return null;

  const dataRows = lines
    .slice(dataStartIdx, dataStartIdx + MAX_PREVIEW_ROWS)
    .map((l) => parseRow(l, delimiter));

  const spatial = detectSpatialColumns(effectiveHeaders);
  const extent: BoundingBox = spatial
    ? computeSpatialExtent(dataRows, spatial.latIdx, spatial.lonIdx)
    : { minLat: 0, maxLat: 0, minLon: 0, maxLon: 0 };

  const quality = computeQualityMetrics(dataRows, effectiveHeaders);

  const dataset: GeoDataset = {
    id: `ds_${Date.now()}_${fileId.replace(/[^a-zA-Z0-9]/g, "_")}`,
    name: fileId,
    modality,
    acquisitionMethod: inferAcquisitionMethod(modality, effectiveHeaders),
    crs: spatial ? "EPSG:4326" : "LOCAL",
    units: inferUnits(modality),
    spatialExtent: extent,
    samplingDensity: null,
    qualityMetrics: quality,
    lineage: [
      {
        step: `Auto-ingested from ${fileId} (${dataRows.length} rows parsed)`,
        toolId: null,
        toolExecutionId: null,
        timestamp: new Date().toISOString(),
        actorId: "system",
      },
    ],
    inferredSurveyType: inferAcquisitionMethod(modality, effectiveHeaders),
    spatialIndexId: null,
    uploadedAt: new Date().toISOString(),
    fileSize: file.size,
    fileExtension: ext,
  };

  return dataset;
}

/**
 * Produce a short summary of a file's columns for the AI context.
 * Used to give the orchestrator actual data awareness.
 */
export function summariseFileForAgent(
  fileId: string,
  content: string,
  maxRows: number = 5
): string {
  const text = content.replace(/^\uFEFF/, "").trim();
  if (!text) return `[${fileId}: empty]`;

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return `[${fileId}: empty]`;

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseRow(lines[0], delimiter);
  const totalRows = lines.length - 1;

  const preview = lines
    .slice(1, 1 + maxRows)
    .map((l) => parseRow(l, delimiter))
    .map((row) =>
      headers.map((h, i) => `${h}=${row[i] ?? ""}`).join(", ")
    )
    .join("\n  ");

  return `📄 **${fileId}** — ${totalRows} rows, ${headers.length} columns\n  Columns: ${headers.join(", ")}\n  Sample:\n  ${preview}`;
}
