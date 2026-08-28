/**
 * Documented ESRI shapefile contract.
 * Requires .shp + .shx + .dbf together. Parses geometry records and DBF
 * attributes. Companion .prj must document an EPSG. Optional .cpg declares encoding.
 * Layer purpose is never inferred from the filename or DBF field names.
 */

import type { CrsAxisOrder } from "../map/crs.ts";
import { assemblePolygonParts } from "../geometry/polygon-topology.ts";
import { UNASSIGNED_VECTOR_ROLE, type VectorRoleAssignment } from "./geojson-contract.ts";

export const SHAPEFILE_ADAPTER_ID = "shapefile";
export const SHAPEFILE_FORMAT = "shapefile";
export const SHAPEFILE_FILE_CODE = 9994;
export const SHAPEFILE_CONTRACT = "esri-shp-shx-dbf-prj";

export const SHAPE_NULL = 0;
export const SHAPE_POINT = 1;
export const SHAPE_POLYLINE = 3;
export const SHAPE_POLYGON = 5;
export const SHAPE_MULTIPOINT = 8;

const UNSUPPORTED_SHAPE: Record<number, string> = {
  11: "PointZ",
  13: "PolyLineZ",
  15: "PolygonZ",
  18: "MultiPointZ",
  21: "PointM",
  23: "PolyLineM",
  25: "PolygonM",
  28: "MultiPointM",
  31: "MultiPatch",
};

const AUTHORITY_RE = /AUTHORITY\["EPSG","(\d+)"\]/gi;
const EPSG_RE = /EPSG[:\s]*([0-9]{4,6})/i;

export type ShapefileCrsConfidence = "high" | "medium" | "none";
export type ShapefileEncodingSource = "cpg" | "undeclared-cp1252";

export interface ShapefileSidecars {
  shp: boolean;
  shx: boolean;
  dbf: boolean;
  prj: boolean;
  cpg?: boolean;
}

export interface ShapefileVectorFeature {
  id: string;
  geometry_type: "Point" | "LineString" | "Polygon" | "MultiPolygon";
  coordinates: { x: number; y: number }[];
  rings?: { x: number; y: number }[][];
  parts?: { x: number; y: number }[][][];
  topology?: {
    engine: string;
    valid: boolean;
    hole_count?: number;
    part_count?: number;
    classification?: string;
  };
  properties: Record<string, unknown>;
}

export interface ShapefileInspect {
  looksLikeShapefile: boolean;
  sidecars: ShapefileSidecars;
  geometryTypes: string[];
  featureCount: number;
  validFeatureCount: number;
  attributeNames: string[];
  bbox?: { minX: number; minY: number; maxX: number; maxY: number };
  crs?: string;
  crsSource?: "shapefile-prj";
  crsConfidence?: ShapefileCrsConfidence;
  axisOrder?: CrsAxisOrder;
  coordinateOrder?: CrsAxisOrder;
  encoding?: string;
  encodingSource?: ShapefileEncodingSource;
  locationQuality: "documented" | "user-confirmed" | "missing";
  vectorRole: VectorRoleAssignment;
  shapefileContract?: typeof SHAPEFILE_CONTRACT;
  sidecarChecksums?: Partial<Record<"shp" | "shx" | "dbf" | "prj" | "cpg", string>>;
  features?: ShapefileVectorFeature[];
  errors: string[];
  warnings: string[];
}

function readU32BE(buf: Buffer, offset: number): number {
  return buf.readUInt32BE(offset);
}
function readI32LE(buf: Buffer, offset: number): number {
  return buf.readInt32LE(offset);
}
function readF64LE(buf: Buffer, offset: number): number {
  return buf.readDoubleLE(offset);
}

export function looksLikeShapefilePeek(peek: Buffer): boolean {
  return peek.length >= 4 && peek.readUInt32BE(0) === SHAPEFILE_FILE_CODE;
}

function normalizeEncoding(raw: string): string | null {
  const key = raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const aliases: Record<string, string> = {
    utf8: "utf-8",
    cp1252: "windows-1252",
    windows1252: "windows-1252",
    ansi: "windows-1252",
    latin1: "latin1",
    iso88591: "latin1",
  };
  if (aliases[key]) return aliases[key];
  const candidate = raw.trim();
  try {
    new TextDecoder(candidate);
    return candidate;
  } catch {
    return null;
  }
}

function decodeBytes(bytes: Buffer, encoding: string, fatal: boolean): string {
  const decoder = new TextDecoder(encoding, { fatal, ignoreBOM: true });
  return decoder.decode(bytes);
}

function parsePrj(text: string | undefined): {
  crs?: string;
  confidence: ShapefileCrsConfidence;
  axisOrder?: CrsAxisOrder;
  coordinateOrder?: CrsAxisOrder;
  error?: string;
} {
  if (!text?.trim()) {
    return {
      confidence: "none",
      error: "Shapefile .prj is missing. A documented CRS is required. G-AID will not assume WGS 84 or silently reproject.",
    };
  }
  const auths = [...text.matchAll(AUTHORITY_RE)];
  const last = auths[auths.length - 1]?.[1];
  const simple = text.match(EPSG_RE)?.[1];
  const epsg = last ? parseInt(last, 10) : simple ? parseInt(simple, 10) : undefined;
  if (!epsg) {
    return {
      confidence: "none",
      error: "Shapefile .prj has no EPSG authority. CRS is undocumented. The dataset stays recognised-unsupported.",
    };
  }
  const geographic = epsg === 4326;
  return {
    crs: `EPSG:${epsg}`,
    confidence: last ? "high" : "medium",
    axisOrder: geographic ? "lat-lon" : "east-north",
    coordinateOrder: geographic ? "lon-lat" : "east-north",
  };
}

function closed(ring: { x: number; y: number }[]): boolean {
  if (ring.length < 4) return false;
  const a = ring[0];
  const b = ring[ring.length - 1];
  return a.x === b.x && a.y === b.y;
}

function finite(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y);
}

function parseShpHeader(shp: Buffer): { shapeType: number; fileWords: number; error?: string } {
  if (shp.length < 100) return { shapeType: -1, fileWords: 0, error: "Shapefile header is shorter than 100 bytes." };
  if (readU32BE(shp, 0) !== SHAPEFILE_FILE_CODE) {
    return { shapeType: -1, fileWords: 0, error: "Not an ESRI shapefile (file code is not 9994)." };
  }
  return { shapeType: readI32LE(shp, 32), fileWords: readU32BE(shp, 24) };
}

function parseShx(shx: Buffer): { offsets: number[]; error?: string } {
  if (shx.length < 100) return { offsets: [], error: "SHX header is shorter than 100 bytes." };
  if (readU32BE(shx, 0) !== SHAPEFILE_FILE_CODE) return { offsets: [], error: "SHX file code is not 9994." };
  const offsets: number[] = [];
  for (let i = 100; i + 8 <= shx.length; i += 8) {
    offsets.push(readU32BE(shx, i) * 2);
  }
  return { offsets };
}

function dbfFieldName(buf: Buffer): string {
  const end = buf.indexOf(0);
  return buf.subarray(0, end === -1 ? buf.length : end).toString("ascii").trim();
}

function parseDbf(
  dbf: Buffer,
  encoding: string,
  encodingSource: ShapefileEncodingSource
): { records: Record<string, unknown>[]; fields: string[]; error?: string; warnings: string[] } {
  const warnings: string[] = [];
  if (dbf.length < 32) return { records: [], fields: [], warnings, error: "DBF header is corrupt." };
  const nRecords = dbf.readUInt32LE(4);
  const headerLen = dbf.readUInt16LE(8);
  const recLen = dbf.readUInt16LE(10);
  if (!headerLen || headerLen < 33 || !recLen) return { records: [], fields: [], warnings, error: "DBF header lengths are invalid." };
  const fields: { name: string; type: string; length: number; decimal: number }[] = [];
  for (let offset = 32; offset + 32 <= headerLen && offset < dbf.length; offset += 32) {
    if (dbf[offset] === 0x0d) break;
    const name = dbfFieldName(dbf.subarray(offset, offset + 11));
    if (!name) continue;
    fields.push({
      name,
      type: String.fromCharCode(dbf[offset + 11] || 67),
      length: dbf[offset + 16] || 0,
      decimal: dbf[offset + 17] || 0,
    });
  }
  const records: Record<string, unknown>[] = [];
  let cursor = headerLen;
  for (let i = 0; i < nRecords && cursor + recLen <= dbf.length; i++) {
    const row = dbf.subarray(cursor, cursor + recLen);
    cursor += recLen;
    if (row[0] === 0x2a) continue;
    const rec: Record<string, unknown> = {};
    let pos = 1;
    for (const field of fields) {
      const raw = row.subarray(pos, pos + field.length);
      pos += field.length;
      try {
        if (field.type === "N" || field.type === "F") {
          const text = raw.toString("ascii").trim();
          rec[field.name] = text ? Number(text) : null;
        } else if (field.type === "L") {
          rec[field.name] = /^[tyTY1]/.test(raw.toString("ascii"));
        } else if (field.type === "D") {
          rec[field.name] = raw.toString("ascii").trim();
        } else {
          rec[field.name] = decodeBytes(raw, encoding, encodingSource === "cpg").replace(/\0/g, "").trim();
        }
      } catch {
        return {
          records: [],
          fields: fields.map((item) => item.name),
          warnings,
          error: `DBF text is not valid ${encoding} (${encodingSource}). The dataset stays recognised-unsupported.`,
        };
      }
    }
    records.push(rec);
  }
  if (records.length !== nRecords && records.length === 0) {
    return { records: [], fields: fields.map((item) => item.name), warnings, error: "DBF records could not be parsed." };
  }
  return { records, fields: fields.map((item) => item.name), warnings };
}

function readPoints(content: Buffer, offset: number, count: number): { pts: { x: number; y: number }[]; next: number; ok: boolean } {
  const pts: { x: number; y: number }[] = [];
  let next = offset;
  for (let i = 0; i < count; i++) {
    if (next + 16 > content.length) return { pts, next, ok: false };
    const x = readF64LE(content, next);
    const y = readF64LE(content, next + 8);
    next += 16;
    if (!finite(x, y)) return { pts, next, ok: false };
    pts.push({ x, y });
  }
  return { pts, next, ok: true };
}

function parseShapeContent(
  content: Buffer,
  fid: string,
  props: Record<string, unknown>,
  errors: string[],
  warnings: string[]
): ShapefileVectorFeature[] {
  if (content.length < 4) {
    errors.push(`Shape ${fid} record is truncated.`);
    return [];
  }
  const shapeType = readI32LE(content, 0);
  if (shapeType === SHAPE_NULL) {
    warnings.push(`Feature ${fid} is a null shape and was skipped. Coordinates were not invented.`);
    return [];
  }
  if (UNSUPPORTED_SHAPE[shapeType]) {
    errors.push(
      `Shapefile geometry type ${UNSUPPORTED_SHAPE[shapeType]} is not a validated processing geometry. Z/M and MultiPatch stay recognised-unsupported.`
    );
    return [];
  }
  if (shapeType === SHAPE_POINT) {
    if (content.length < 20) {
      errors.push(`Point ${fid} is truncated.`);
      return [];
    }
    const x = readF64LE(content, 4);
    const y = readF64LE(content, 12);
    if (!finite(x, y)) {
      errors.push(`Point ${fid} has non-finite coordinates.`);
      return [];
    }
    return [{ id: fid, geometry_type: "Point", coordinates: [{ x, y }], properties: props }];
  }
  if (shapeType === SHAPE_MULTIPOINT) {
    if (content.length < 40) {
      errors.push(`MultiPoint ${fid} is truncated.`);
      return [];
    }
    const n = readI32LE(content, 36);
    const { pts, ok } = readPoints(content, 40, n);
    if (!ok || !pts.length) {
      errors.push(`MultiPoint ${fid} has no finite coordinates.`);
      return [];
    }
    return pts.map((pt, i) => ({
      id: pts.length > 1 ? `${fid}-pt${i + 1}` : fid,
      geometry_type: "Point" as const,
      coordinates: [pt],
      properties: props,
    }));
  }
  if (shapeType === SHAPE_POLYLINE || shapeType === SHAPE_POLYGON) {
    if (content.length < 44) {
      errors.push(`Shape ${fid} is truncated.`);
      return [];
    }
    const nParts = readI32LE(content, 36);
    const nPoints = readI32LE(content, 40);
    const partsOff = 44;
    const ptsOff = partsOff + nParts * 4;
    if (ptsOff + nPoints * 16 > content.length) {
      errors.push(`Shape ${fid} coordinate stream is truncated.`);
      return [];
    }
    const parts: number[] = [];
    for (let i = 0; i < nParts; i++) parts.push(readI32LE(content, partsOff + i * 4));
    const { pts, ok } = readPoints(content, ptsOff, nPoints);
    if (!ok) {
      errors.push(`${shapeType === SHAPE_POLYGON ? "Polygon" : "Polyline"} ${fid} has non-finite coordinates.`);
      return [];
    }
    const rings: { x: number; y: number }[][] = [];
    for (let i = 0; i < parts.length; i++) {
      const start = parts[i];
      const end = i + 1 < parts.length ? parts[i + 1] : pts.length;
      rings.push(pts.slice(start, end));
    }
    if (shapeType === SHAPE_POLYLINE) {
      const out: ShapefileVectorFeature[] = [];
      rings.forEach((line, i) => {
        if (line.length < 2) {
          errors.push(`Polyline ${fid} needs at least two finite positions.`);
          return;
        }
        out.push({
          id: rings.length > 1 ? `${fid}-part${i + 1}` : fid,
          geometry_type: "LineString",
          coordinates: line,
          properties: props,
        });
      });
      return out;
    }
    const ring = rings[0] || [];
    if (!closed(ring) && rings.length === 1) {
      errors.push(`Polygon ${fid} exterior ring must be closed with at least four finite positions.`);
      return [];
    }
    const assembled = assemblePolygonParts(rings);
    if (!assembled.ok) {
      errors.push(...(assembled.errors.length ? assembled.errors : [`Polygon ${fid} topology is invalid.`]));
      return [];
    }
    const first = assembled.parts[0] || [];
    return [
      {
        id: fid,
        geometry_type: assembled.geometryType,
        coordinates: assembled.parts.flat(2),
        rings: first,
        parts: assembled.parts,
        topology: {
          engine: assembled.engine,
          valid: true,
          hole_count: assembled.holeCount,
          part_count: assembled.partCount,
          classification: assembled.classification,
        },
        properties: props,
      },
    ];
  }
  errors.push(`Shapefile geometry type ${shapeType} is not a supported processing geometry.`);
  return [];
}

export function inspectShapefileDataset(input: {
  shp: Buffer;
  shx?: Buffer;
  dbf?: Buffer;
  prjText?: string;
  cpgText?: string;
  sidecars: ShapefileSidecars;
  checksums?: ShapefileInspect["sidecarChecksums"];
}): ShapefileInspect {
  const errors: string[] = [];
  const warnings: string[] = [
    "Attribute names have unknown semantics. Geology, tenure, and mineral meaning are not inferred from field names or filenames.",
  ];
  const sidecars = input.sidecars;
  const base: ShapefileInspect = {
    looksLikeShapefile: looksLikeShapefilePeek(input.shp),
    sidecars,
    geometryTypes: [],
    featureCount: 0,
    validFeatureCount: 0,
    attributeNames: [],
    locationQuality: "missing",
    vectorRole: UNASSIGNED_VECTOR_ROLE,
    errors,
    warnings,
    sidecarChecksums: input.checksums,
  };
  if (!base.looksLikeShapefile) {
    errors.push("Not an ESRI shapefile (file code is not 9994).");
    return base;
  }
  const missing: string[] = [];
  if (!sidecars.shx || !input.shx) missing.push(".shx");
  if (!sidecars.dbf || !input.dbf) missing.push(".dbf");
  if (missing.length) {
    errors.push(
      `Shapefile sidecar set is incomplete (missing ${missing.join(", ")}). A valid dataset needs .shp, .shx, and .dbf together. Sidecar names alone are not ingest.`
    );
    if (!sidecars.prj) errors.push("Shapefile .prj is missing. A documented CRS is required.");
    return base;
  }

  let encoding = "windows-1252";
  let encodingSource: ShapefileEncodingSource = "undeclared-cp1252";
  if (sidecars.cpg || input.cpgText != null) {
    const raw = (input.cpgText || "").trim();
    const codec = normalizeEncoding(raw);
    if (!codec) {
      errors.push(
        `Shapefile .cpg declares encoding ${JSON.stringify(raw)}, which is not a documented codec. The dataset stays recognised-unsupported.`
      );
      return base;
    }
    encoding = codec;
    encodingSource = "cpg";
  } else {
    warnings.push(
      "No .cpg encoding declaration. DBF text is decoded as undeclared windows-1252/cp1252. This is not a silent UTF-8 assumption."
    );
  }
  base.encoding = encoding;
  base.encodingSource = encodingSource;

  const prj = parsePrj(input.prjText);
  if (prj.error) {
    errors.push(prj.error);
    return base;
  }
  base.crs = prj.crs;
  base.crsSource = "shapefile-prj";
  base.crsConfidence = prj.confidence;
  base.axisOrder = prj.axisOrder;
  base.coordinateOrder = prj.coordinateOrder;
  base.locationQuality = "documented";
  warnings.push(
    `CRS source is shapefile .prj (${prj.crs}, confidence=${prj.confidence}). Coordinates were not reprojected.`
  );

  const header = parseShpHeader(input.shp);
  if (header.error) {
    errors.push(header.error);
    return base;
  }
  if (UNSUPPORTED_SHAPE[header.shapeType]) {
    errors.push(
      `Shapefile geometry type ${UNSUPPORTED_SHAPE[header.shapeType]} is not a validated processing geometry. Z/M and MultiPatch stay recognised-unsupported.`
    );
    return base;
  }
  const shx = parseShx(input.shx!);
  if (shx.error) {
    errors.push(shx.error);
    return base;
  }
  const dbf = parseDbf(input.dbf!, encoding, encodingSource);
  if (dbf.error) {
    errors.push(dbf.error);
    return base;
  }
  warnings.push(...dbf.warnings);
  if (shx.offsets.length !== dbf.records.length) {
    errors.push(
      `Shapefile SHX index count (${shx.offsets.length}) does not match DBF record count (${dbf.records.length}). The dataset stays recognised-unsupported.`
    );
    return base;
  }

  const types = new Set<string>();
  const features: ShapefileVectorFeature[] = [];
  const seen = new Map<string, number>();
  let bbox: ShapefileInspect["bbox"];
  for (let i = 0; i < shx.offsets.length; i++) {
    const offset = shx.offsets[i];
    if (offset + 8 > input.shp.length) {
      errors.push("SHX offset is outside the SHP file.");
      break;
    }
    const contentLen = readU32BE(input.shp, offset + 4) * 2;
    const content = input.shp.subarray(offset + 8, offset + 8 + contentLen);
    const props = dbf.records[i] || {};
    const rawId = props.ID ?? props.FID ?? props.OBJECTID;
    const fid = rawId != null && String(rawId).trim() ? String(rawId).trim() : String(i + 1);
    seen.set(fid, (seen.get(fid) || 0) + 1);
    const geoms = parseShapeContent(content, fid, props, errors, warnings);
    for (const feature of geoms) {
      types.add(feature.geometry_type);
      features.push(feature);
      for (const pt of feature.coordinates) {
        if (!bbox) bbox = { minX: pt.x, minY: pt.y, maxX: pt.x, maxY: pt.y };
        else {
          bbox.minX = Math.min(bbox.minX, pt.x);
          bbox.minY = Math.min(bbox.minY, pt.y);
          bbox.maxX = Math.max(bbox.maxX, pt.x);
          bbox.maxY = Math.max(bbox.maxY, pt.y);
        }
      }
    }
  }

  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (duplicates.length) {
    warnings.push(`Duplicate feature IDs were preserved and flagged (${duplicates.slice(0, 8).join(", ")}). IDs were not rewritten.`);
  }

  base.geometryTypes = [...types].sort();
  base.attributeNames = dbf.fields;
  base.featureCount = shx.offsets.length;
  base.validFeatureCount = features.length;
  base.bbox = bbox;
  base.shapefileContract = SHAPEFILE_CONTRACT;
  base.features = features;
  if (errors.length) return base;
  if (!features.length) {
    errors.push(
      "Shapefile has no valid Point/LineString/Polygon features after parsing. Null-only or empty datasets stay recognised-unsupported."
    );
  }
  return base;
}

export function shapefileReadyForSupport(inspected: ShapefileInspect): boolean {
  return (
    inspected.looksLikeShapefile &&
    inspected.sidecars.shp &&
    inspected.sidecars.shx &&
    inspected.sidecars.dbf &&
    Boolean(inspected.crs) &&
    inspected.crsConfidence !== "none" &&
    inspected.validFeatureCount > 0 &&
    inspected.errors.length === 0
  );
}

export function decodeShapefileDataset(input: {
  shp: Buffer;
  shx: Buffer;
  dbf: Buffer;
  prjText?: string;
  cpgText?: string;
}): { features: ShapefileVectorFeature[]; inspect: ShapefileInspect } | null {
  const inspect = inspectShapefileDataset({
    shp: input.shp,
    shx: input.shx,
    dbf: input.dbf,
    prjText: input.prjText,
    cpgText: input.cpgText,
    sidecars: { shp: true, shx: true, dbf: true, prj: Boolean(input.prjText), cpg: Boolean(input.cpgText) },
  });
  if (!shapefileReadyForSupport(inspect) || !inspect.features?.length) return null;
  return { features: inspect.features, inspect };
}
