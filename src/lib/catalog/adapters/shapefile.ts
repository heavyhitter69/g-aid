import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { headerSummaryFromText } from "../peek-text.ts";
import {
  deferredRead,
  okIfRecognised,
  okIfSupported,
  type AdapterSniff,
  type CatalogAdapter,
  type CatalogInspection,
  type SniffContext,
} from "./types.ts";
import {
  SHAPEFILE_ADAPTER_ID,
  SHAPEFILE_FORMAT,
  inspectShapefileDataset,
  looksLikeShapefilePeek,
  shapefileReadyForSupport,
  type ShapefileInspect,
  type ShapefileSidecars,
} from "../shapefile-contract.ts";
import { UNASSIGNED_VECTOR_ROLE } from "../geojson-contract.ts";

function present(absPath: string): boolean {
  try {
    return fs.statSync(absPath).isFile();
  } catch {
    return false;
  }
}

function sha256(absPath: string): string | undefined {
  try {
    return createHash("sha256").update(fs.readFileSync(absPath)).digest("hex");
  } catch {
    return undefined;
  }
}

export function inspectShapefilePath(absPath: string, siblingNames?: string[]): ShapefileInspect {
  const filename = path.basename(absPath);
  const stem = filename.replace(/\.shp$/i, "");
  const names = new Set((siblingNames || []).map((name) => name.toLowerCase()));
  const dir = path.dirname(absPath);
  const find = (ext: string) => {
    const wanted = `${stem.toLowerCase()}${ext}`;
    const match = [...names].find((name) => name === wanted);
    return match ? path.join(dir, match) : path.join(dir, `${stem}${ext}`);
  };
  const shxPath = find(".shx");
  const dbfPath = find(".dbf");
  const prjPath = find(".prj");
  const cpgPath = find(".cpg");
  const sidecars: ShapefileSidecars = {
    shp: true,
    shx: present(shxPath),
    dbf: present(dbfPath),
    prj: present(prjPath),
    cpg: present(cpgPath),
  };
  let shp = Buffer.alloc(0);
  try {
    shp = fs.readFileSync(absPath);
  } catch (err) {
    return {
      looksLikeShapefile: false,
      sidecars,
      geometryTypes: [],
      featureCount: 0,
      validFeatureCount: 0,
      attributeNames: [],
      locationQuality: "missing",
      vectorRole: UNASSIGNED_VECTOR_ROLE,
      errors: [`Shapefile could not be read: ${err instanceof Error ? err.message : String(err)}`],
      warnings: [],
    };
  }
  return inspectShapefileDataset({
    shp,
    shx: sidecars.shx ? fs.readFileSync(shxPath) : undefined,
    dbf: sidecars.dbf ? fs.readFileSync(dbfPath) : undefined,
    prjText: sidecars.prj ? fs.readFileSync(prjPath, "utf8") : undefined,
    cpgText: sidecars.cpg ? fs.readFileSync(cpgPath, "utf8") : undefined,
    sidecars,
    checksums: {
      shp: sha256(absPath),
      shx: sidecars.shx ? sha256(shxPath) : undefined,
      dbf: sidecars.dbf ? sha256(dbfPath) : undefined,
      prj: sidecars.prj ? sha256(prjPath) : undefined,
      cpg: sidecars.cpg ? sha256(cpgPath) : undefined,
    },
  });
}

function sidecarNames(ctx: SniffContext) {
  const stem = ctx.filename.replace(/\.shp$/i, "").toLowerCase();
  const names = new Set((ctx.siblingNames || []).map((name) => name.toLowerCase()));
  return {
    shp: true,
    shx: names.has(`${stem}.shx`),
    dbf: names.has(`${stem}.dbf`),
    prj: names.has(`${stem}.prj`),
    cpg: names.has(`${stem}.cpg`),
  };
}

function inspectFromContext(ctx: SniffContext): ShapefileInspect {
  if (ctx.absPath) return inspectShapefilePath(ctx.absPath, ctx.siblingNames);
  const sidecars = sidecarNames(ctx);
  const missing = [
    !sidecars.shx ? ".shx" : "",
    !sidecars.dbf ? ".dbf" : "",
  ].filter(Boolean);
  return {
    looksLikeShapefile: looksLikeShapefilePeek(ctx.peek),
    sidecars,
    geometryTypes: [],
    featureCount: 0,
    validFeatureCount: 0,
    attributeNames: [],
    locationQuality: "missing",
    vectorRole: UNASSIGNED_VECTOR_ROLE,
    errors: [
      missing.length
        ? `Shapefile sidecar set is incomplete (missing ${missing.join(", ")}). A valid dataset needs .shp, .shx, and .dbf together.`
        : "Shapefile bytes were not fully read; sidecar presence alone is not processing support.",
    ],
    warnings: [],
  };
}

function shapefileSniff(ctx: SniffContext): AdapterSniff | null {
  if (ctx.extension !== "shp" && !ctx.filename.toLowerCase().endsWith(".shp")) return null;
  if (!looksLikeShapefilePeek(ctx.peek)) return null;
  const inspected = inspectFromContext(ctx);
  const ready = shapefileReadyForSupport(inspected);
  return {
    confidence: ready ? 0.94 : 0.88,
    formatId: SHAPEFILE_FORMAT,
    mediaClass: "vector",
    domainHint: "gis",
    notes: [
      ready
        ? "Matched documented ESRI shapefile contract (.shp/.shx/.dbf with .prj EPSG)."
        : "ESRI shapefile file-code 9994. Geometry, DBF, encoding, or CRS did not meet the processing contract.",
    ],
  };
}

export const shapefileAdapter: CatalogAdapter = {
  id: SHAPEFILE_ADAPTER_ID,
  formatId: SHAPEFILE_FORMAT,
  supportStatus: "supported",
  sniff: shapefileSniff,
  inspect: (ctx): CatalogInspection => {
    const inspected = inspectFromContext(ctx);
    const ready = shapefileReadyForSupport(inspected);
    const errors = [...inspected.errors];
    if (!ready && inspected.looksLikeShapefile) {
      errors.push(
        "This shapefile is recognised but not a supported processing input until .shp/.shx/.dbf parse, geometries validate, and .prj documents an EPSG."
      );
    }
    const sidecarNote = `sidecars shx=${inspected.sidecars.shx} dbf=${inspected.sidecars.dbf} prj=${inspected.sidecars.prj} cpg=${Boolean(inspected.sidecars.cpg)}`;
    return {
      columns: inspected.attributeNames,
      headerSummary: `ESRI shapefile file-code 9994; ${sidecarNote}; ${headerSummaryFromText(ctx.peekText) || "binary"}`.trim(),
      crs: inspected.crs,
      units: inspected.crs === "EPSG:4326" ? "degrees" : inspected.crs ? "metres-or-degrees" : undefined,
      bbox: inspected.bbox,
      recordCount: inspected.validFeatureCount,
      parseErrors: errors.length ? errors : undefined,
      supportStatus: ready ? "supported" : inspected.looksLikeShapefile ? "recognised-unsupported" : "unknown",
      geometryTypes: inspected.geometryTypes,
      locationQuality: inspected.locationQuality,
      coordinateKind: inspected.crs === "EPSG:4326" ? "geographic" : inspected.crs ? "easting-northing" : "unknown",
      vectorRole: UNASSIGNED_VECTOR_ROLE,
      attributeNames: inspected.attributeNames,
      shapefileSidecars: {
        shp: inspected.sidecars.shp,
        shx: inspected.sidecars.shx,
        dbf: inspected.sidecars.dbf,
        prj: inspected.sidecars.prj,
        cpg: inspected.sidecars.cpg,
      },
      crsSource: inspected.crsSource,
      axisOrder: inspected.axisOrder,
      coordinateOrder: inspected.coordinateOrder,
      encoding: inspected.encoding,
      encodingSource: inspected.encodingSource,
      crsConfidence: inspected.crsConfidence,
      vectorFormat: "shapefile",
      shapefileContract: inspected.shapefileContract,
    };
  },
  validate: (record) =>
    record.supportStatus === "supported"
      ? okIfSupported(record, SHAPEFILE_ADAPTER_ID)
      : okIfRecognised(record, SHAPEFILE_ADAPTER_ID),
  read: () => deferredRead(SHAPEFILE_ADAPTER_ID),
};
