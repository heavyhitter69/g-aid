import { MAX_COLUMNS, type CatalogBBox } from "../types.ts";
import { firstLines, headerSummaryFromText, looksMostlyText, splitHeader } from "../peek-text.ts";
import {
  deferredRead,
  okIfRecognised,
  type AdapterSniff,
  type CatalogAdapter,
  type CatalogInspection,
  type SniffContext,
} from "./types.ts";

function makeAdapter(
  id: string,
  formatId: string,
  sniff: (ctx: SniffContext) => AdapterSniff | null,
  inspect: (ctx: SniffContext, sniff: AdapterSniff) => CatalogInspection = () => ({})
): CatalogAdapter {
  return {
    id,
    formatId,
    supportStatus: "recognised-unsupported",
    sniff,
    inspect,
    validate: (record) => okIfRecognised(record, id),
    read: () => deferredRead(id),
  };
}

function startsWith(peek: Buffer, bytes: number[]): boolean {
  if (peek.length < bytes.length) return false;
  return bytes.every((b, i) => peek[i] === b);
}

function sniffGeotiff(ctx: SniffContext): AdapterSniff | null {
  const tiffLe = startsWith(ctx.peek, [0x49, 0x49, 0x2a, 0x00]);
  const tiffBe = startsWith(ctx.peek, [0x4d, 0x4d, 0x00, 0x2a]);
  const bigtiffLe = startsWith(ctx.peek, [0x49, 0x49, 0x2b, 0x00]);
  const bigtiffBe = startsWith(ctx.peek, [0x4d, 0x4d, 0x00, 0x2b]);
  if (!tiffLe && !tiffBe && !bigtiffLe && !bigtiffBe) return null;
  return {
    confidence: 0.86,
    formatId: "geotiff",
    mediaClass: "raster",
    domainHint: "gis",
    notes: ["TIFF signature. GeoTIFF tags were not parsed; raster bytes were not loaded."],
  };
}

function parseAsciiGrid(text: string): { bbox?: CatalogBBox; recordCount?: number; headerSummary?: string; cellSizeM?: number } {
  const map: Record<string, number> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^[/#;]/.test(trimmed)) continue;
    const match = trimmed.match(/^(ncols|nrows|xllcorner|yllcorner|xllcenter|yllcenter|cellsize)\s+([-+0-9.eE]+)/i);
    if (!match) {
      if (Object.keys(map).length) break;
      continue;
    }
    map[match[1].toLowerCase()] = Number(match[2]);
  }
  const ncols = map.ncols;
  const nrows = map.nrows;
  const cell = map.cellsize;
  const xll = map.xllcorner ?? map.xllcenter;
  const yll = map.yllcorner ?? map.yllcenter;
  let bbox: CatalogBBox | undefined;
  if ([ncols, nrows, cell, xll, yll].every((n) => Number.isFinite(n))) {
    bbox = {
      minX: xll,
      minY: yll,
      maxX: xll + ncols * cell,
      maxY: yll + nrows * cell,
    };
  }
  return {
    bbox,
    cellSizeM: Number.isFinite(cell) ? cell : undefined,
    recordCount: Number.isFinite(ncols) && Number.isFinite(nrows) ? ncols * nrows : undefined,
    headerSummary: headerSummaryFromText(text),
  };
}

function sniffEsriAscii(ctx: SniffContext): AdapterSniff | null {
  if (!looksMostlyText(ctx.peek)) return null;
  const head = firstLines(ctx.peekText, 8).join("\n").toLowerCase();
  if (!/\bncols\b/.test(head) || !/\bnrows\b/.test(head)) return null;
  return {
    confidence: 0.9,
    formatId: "esri-ascii-grid",
    mediaClass: "raster",
    domainHint: "gis",
    notes: ["ESRI ASCII grid header (ncols/nrows). Cell values were not loaded."],
  };
}

function sniffShapefile(ctx: SniffContext): AdapterSniff | null {
  if (ctx.peek.length < 4) return null;
  const code = ctx.peek.readUInt32BE(0);
  if (code !== 9994) return null;
  return {
    confidence: 0.88,
    formatId: "shapefile",
    mediaClass: "vector",
    domainHint: "gis",
    notes: ["ESRI shapefile file-code 9994. Shape records and DBF attributes were not loaded."],
  };
}

function inspectShapefile(ctx: SniffContext): CatalogInspection {
  const stem = ctx.filename.replace(/\.shp$/i, "");
  const names = new Set((ctx.siblingNames || []).map((name) => name.toLowerCase()));
  const sidecars = {
    shp: true,
    shx: names.has(`${stem.toLowerCase()}.shx`),
    dbf: names.has(`${stem.toLowerCase()}.dbf`),
    prj: names.has(`${stem.toLowerCase()}.prj`),
  };
  const missing: string[] = [];
  if (!sidecars.shx) missing.push(".shx");
  if (!sidecars.dbf) missing.push(".dbf");
  if (!sidecars.prj) missing.push(".prj");
  const errors = [
    "Shapefile is recognised-unsupported. G-AID does not parse shape records, DBF attributes, or shapefile geometry in this pack.",
  ];
  if (missing.length) {
    errors.push(`Shapefile sidecar set is incomplete (missing ${missing.join(", ")}). A valid dataset needs .shp, .shx, .dbf, and .prj together.`);
  } else if (!ctx.companionPrjText || !/EPSG/i.test(ctx.companionPrjText)) {
    errors.push("Shapefile .prj is present but has no EPSG authority. CRS is undocumented.");
  }
  return {
    parseErrors: errors,
    shapefileSidecars: sidecars,
    locationQuality: sidecars.prj && ctx.companionPrjText && /EPSG/i.test(ctx.companionPrjText) ? "documented" : "missing",
    headerSummary: `Shapefile file-code 9994; sidecars shx=${sidecars.shx} dbf=${sidecars.dbf} prj=${sidecars.prj}`,
  };
}

function sniffGeopackage(ctx: SniffContext): AdapterSniff | null {
  const sqlite = ctx.peek.length >= 16 && ctx.peek.subarray(0, 16).toString("utf8") === "SQLite format 3\0";
  const named = ctx.extension === "gpkg";
  const gpkgToken = ctx.peek.includes(Buffer.from("GPKG"));
  if (!sqlite && !named && !gpkgToken) return null;
  if (!sqlite && named) {
    return {
      confidence: 0.7,
      formatId: "geopackage",
      mediaClass: "vector",
      domainHint: "gis",
      notes: [".gpkg extension without a SQLite header. GeoPackage is not decoded."],
    };
  }
  if (!sqlite) return null;
  return {
    confidence: gpkgToken || named ? 0.9 : 0.75,
    formatId: "geopackage",
    mediaClass: "vector",
    domainHint: "gis",
    notes: ["SQLite/GeoPackage container. Tables and geometries were not loaded."],
  };
}

function sniffPrj(ctx: SniffContext): AdapterSniff | null {
  if (!looksMostlyText(ctx.peek)) return null;
  if (!/\b(GEOGCS|PROJCS|VERTCS|GEOCCS|LOCAL_CS|COMPD_CS)\b/i.test(ctx.peekText)) return null;
  return {
    confidence: 0.9,
    formatId: "esri-prj",
    mediaClass: "crs",
    domainHint: "gis",
    notes: ["WKT CRS text (GEOGCS/PROJCS)."],
  };
}

function sniffLasPointCloud(ctx: SniffContext): AdapterSniff | null {
  if (ctx.peek.length < 4) return null;
  if (ctx.peek.toString("ascii", 0, 4) !== "LASF") return null;
  const laz = ctx.extension === "laz" || ctx.peek.includes(Buffer.from("LASzip"));
  return {
    confidence: 0.93,
    formatId: laz ? "laz-point-cloud" : "las-point-cloud",
    mediaClass: "point-cloud",
    domainHint: "gis",
    notes: ["LASF signature. Point records were not loaded."],
  };
}

function sniffSegy(ctx: SniffContext): AdapterSniff | null {
  if (ctx.peek.length < 4) return null;
  const ascii = ctx.peekText.startsWith("C 1") || /^C {1,2}\d/.test(ctx.peekText.slice(0, 80));
  const ebcdicC1 = ctx.peek[0] === 0xc3 && ctx.peek[1] === 0x40 && ctx.peek[2] === 0xf1;
  let ebcdicCards = 0;
  for (let off = 0; off + 1 < Math.min(ctx.peek.length, 800); off += 80) {
    if (ctx.peek[off] === 0xc3) ebcdicCards += 1;
  }
  if (!ascii && !ebcdicC1 && ebcdicCards < 3) return null;
  return {
    confidence: ebcdicC1 || ebcdicCards >= 3 ? 0.82 : 0.78,
    formatId: "segy",
    mediaClass: "seismic",
    domainHint: "seismic",
    notes: ["SEG-Y textual header signature. Traces were not loaded."],
  };
}

function sniffPdf(ctx: SniffContext): AdapterSniff | null {
  if (!startsWith(ctx.peek, [0x25, 0x50, 0x44, 0x46])) return null;
  return {
    confidence: 0.95,
    formatId: "pdf",
    mediaClass: "document",
    domainHint: "report",
    notes: ["PDF magic. Pages were not extracted."],
  };
}

function sniffPng(ctx: SniffContext): AdapterSniff | null {
  if (!startsWith(ctx.peek, [0x89, 0x50, 0x4e, 0x47])) return null;
  return {
    confidence: 0.95,
    formatId: "png",
    mediaClass: "image",
    domainHint: "unknown",
    notes: ["PNG signature. Image pixels were not loaded."],
  };
}

function sniffJpeg(ctx: SniffContext): AdapterSniff | null {
  if (!startsWith(ctx.peek, [0xff, 0xd8, 0xff])) return null;
  return {
    confidence: 0.9,
    formatId: "jpeg",
    mediaClass: "image",
    domainHint: "unknown",
    notes: ["JPEG signature. Image pixels were not loaded."],
  };
}

const README_NAMES = /^(readme|metadata|licence|license|changelog)(\.|$)/i;

function sniffReport(ctx: SniffContext): AdapterSniff | null {
  if (!looksMostlyText(ctx.peek)) return null;
  const name = ctx.filename.toLowerCase();
  const isDoc =
    README_NAMES.test(name) ||
    name.endsWith(".md") ||
    name.endsWith(".txt") && /readme|metadata|notes|log/.test(name);
  if (!isDoc) return null;
  if (/\btime\s+nt\s+sq\b/i.test(ctx.peekText) || /\blatitude\b/i.test(ctx.peekText) && /\bmag\b/i.test(ctx.peekText)) {
    return null;
  }
  return {
    confidence: 0.72,
    formatId: name.startsWith("metadata") ? "metadata-document" : "report-document",
    mediaClass: "document",
    domainHint: "report",
    notes: ["Text document identified from name and printable content, not as a survey method."],
  };
}

function sniffDelimitedTable(ctx: SniffContext): AdapterSniff | null {
  if (!looksMostlyText(ctx.peek)) return null;
  const headerLine = firstLines(ctx.peekText, 6).find((line) => {
    const cols = splitHeader(line);
    return cols.length >= 2 && (/[,\t;]/.test(line));
  });
  if (!headerLine) return null;
  const columns = splitHeader(headerLine);
  if (columns.length < 2) return null;
  const joined = columns.join(" ").toLowerCase();
  if (/\blatitude\b/.test(joined) && /\blongitude\b/.test(joined) && /\bmag\b/.test(joined)) return null;
  if (/time\s+nt\s+sq/i.test(ctx.peekText)) return null;
  return {
    confidence: 0.7,
    formatId: "delimited-table",
    mediaClass: "tabular-text",
    domainHint: "unknown",
    notes: ["Delimited table with a header row. It does not match a supported ingest contract."],
  };
}

export const recognisedAdapters: CatalogAdapter[] = [
  makeAdapter("las-point-cloud", "las-point-cloud", sniffLasPointCloud, () => ({
    parseErrors: undefined,
  })),
  makeAdapter("geotiff", "geotiff", sniffGeotiff),
  makeAdapter("shapefile", "shapefile", sniffShapefile, inspectShapefile),
  makeAdapter("geopackage", "geopackage", sniffGeopackage, () => ({
    parseErrors: [
      "GeoPackage is recognised-unsupported. G-AID does not parse GPKG tables, geometries, or CRS in this pack.",
    ],
  })),
  makeAdapter("segy", "segy", sniffSegy),
  makeAdapter("pdf", "pdf", sniffPdf),
  makeAdapter("png", "png", sniffPng),
  makeAdapter("jpeg", "jpeg", sniffJpeg),
  makeAdapter("esri-ascii-grid", "esri-ascii-grid", sniffEsriAscii, (ctx) => parseAsciiGrid(ctx.peekText)),
  makeAdapter("esri-prj", "esri-prj", sniffPrj, (ctx) => ({
    crs: ctx.peekText.replace(/\s+/g, " ").trim().slice(0, 300),
    headerSummary: headerSummaryFromText(ctx.peekText),
  })),
  makeAdapter("report-document", "report-document", sniffReport, (ctx) => ({
    headerSummary: headerSummaryFromText(ctx.peekText),
  })),
  makeAdapter("delimited-table", "delimited-table", sniffDelimitedTable, (ctx) => {
    const headerLine = firstLines(ctx.peekText, 6).find((line) => splitHeader(line).length >= 2) || "";
    const columns = splitHeader(headerLine).slice(0, MAX_COLUMNS);
    return {
      columns: columns.length ? columns : undefined,
      headerSummary: headerSummaryFromText(ctx.peekText),
    };
  }),
];
