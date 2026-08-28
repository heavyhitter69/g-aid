import fs from "node:fs";
import path from "node:path";
import { buildProjectCatalog } from "@/lib/catalog/build";
import { overlayDecision, crsFromCatalog } from "@/lib/map/crs";
import { decodeRasterLayer } from "@/lib/map/decode";
import { parseEsriAscii } from "@/lib/map/ascii";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ROOT = path.join(process.cwd(), "tests/fixtures/validation-ui/G-AID Output/runs");
const RASTER_ROOT = path.join(process.cwd(), "tests/fixtures/raster-project");

function optional(run: string, file: string): string | null {
  const dest = path.join(ROOT, run, file);
  if (!fs.existsSync(dest)) return null;
  return fs.readFileSync(dest, "utf8");
}

function optionalJson(run: string, file: string): unknown | null {
  const text = optional(run, file);
  return text ? JSON.parse(text) : null;
}

function pack(run: string) {
  return {
    runId: run,
    planHash: `fixture-${run}`,
    inspectQc: optionalJson(run, "raster_inspect_qc.json") as Record<string, unknown> | null,
    tracks: optionalJson(run, "raster_tracks.json") as Record<string, unknown> | null,
    terrain: optionalJson(run, "terrain_tracks.json") as Record<string, unknown> | null,
    terrainMeta: optionalJson(run, "terrain_tracks.meta.json") as Record<string, unknown> | null,
  };
}

export async function GET() {
  const catalog = buildProjectCatalog(RASTER_ROOT);
  const records = catalog.records.map((record) => ({
    id: record.id,
    relativePath: record.relativePath,
    filename: record.filename,
    supportStatus: record.supportStatus,
    formatId: record.formatId,
    adapterId: record.adapterId,
    mediaClass: record.mediaClass,
    crs: record.crs || null,
    crsSource: record.crsSource || null,
    units: record.units || null,
    ncols: record.ncols ?? null,
    nrows: record.nrows ?? null,
    nodata: record.nodata ?? null,
    bandCount: record.bandCount ?? null,
    dataType: record.dataType || null,
    compression: record.compression || null,
    rasterLayout: record.rasterLayout || null,
    previewRequired: record.previewRequired ?? false,
    pixelsDecodable: record.pixelsDecodable ?? null,
    elevationDatum: record.elevationDatum || null,
    parseErrors: record.parseErrors,
    bbox: record.bbox,
  }));

  let geotiffGrid: { ncols: number; nrows: number; values: number[]; nodata: number; xllcorner: number; yllcorner: number; cellsize: number } | null =
    null;
  const tifPath = path.join(RASTER_ROOT, "valid-geotiff", "grid.tif");
  if (fs.existsSync(tifPath)) {
    const decoded = decodeRasterLayer({ formatId: "geotiff", buffer: fs.readFileSync(tifPath) });
    if (decoded) {
      geotiffGrid = {
        ncols: decoded.ncols,
        nrows: decoded.nrows,
        values: Array.from(decoded.values),
        nodata: decoded.nodata,
        xllcorner: decoded.xllcorner,
        yllcorner: decoded.yllcorner,
        cellsize: decoded.cellsize,
      };
    }
  }
  let asciiGrid: { ncols: number; nrows: number; values: number[]; nodata: number; xllcorner: number; yllcorner: number; cellsize: number } | null =
    null;
  const ascPath = path.join(RASTER_ROOT, "ascii-valid", "grid.asc");
  if (fs.existsSync(ascPath)) {
    const parsed = parseEsriAscii(fs.readFileSync(ascPath, "utf8"));
    if (parsed) {
      asciiGrid = {
        ncols: parsed.ncols,
        nrows: parsed.nrows,
        values: Array.from(parsed.values),
        nodata: parsed.nodata,
        xllcorner: parsed.xllcorner,
        yllcorner: parsed.yllcorner,
        cellsize: parsed.cellsize,
      };
    }
  }
  let demGrid: { ncols: number; nrows: number; values: number[]; nodata: number; xllcorner: number; yllcorner: number; cellsize: number } | null =
    null;
  const demPath = path.join(RASTER_ROOT, "dem-valid", "dem.asc");
  if (fs.existsSync(demPath)) {
    const parsed = parseEsriAscii(fs.readFileSync(demPath, "utf8"));
    if (parsed) {
      demGrid = {
        ncols: parsed.ncols,
        nrows: parsed.nrows,
        values: Array.from(parsed.values),
        nodata: parsed.nodata,
        xllcorner: parsed.xllcorner,
        yllcorner: parsed.yllcorner,
        cellsize: parsed.cellsize,
      };
    }
  }

  const utm = crsFromCatalog("EPSG:32630", { source: "geotiff" });
  const wgs = crsFromCatalog("EPSG:4326", { source: "catalog" });
  const conflict = overlayDecision(utm, wgs);
  const missing = overlayDecision(undefined, utm);

  return Response.json({
    catalog: { root: RASTER_ROOT, records },
    geotiffGrid,
    asciiGrid,
    demGrid,
    overlayConflict: conflict,
    overlayMissing: missing,
    geotiff: pack("r-verify-raster-geotiff"),
    ascii: pack("r-verify-raster-ascii"),
    dem: pack("r-verify-raster-dem"),
    compressed: pack("r-verify-raster-compressed"),
    cog: pack("r-verify-raster-cog"),
    huge: pack("r-verify-raster-huge"),
    missingCrs: pack("r-verify-raster-missing-crs"),
    conflict: pack("r-verify-raster-conflict"),
    filenameDem: pack("r-verify-raster-filename-dem"),
  });
}
