/**
 * G-AID DEM ASCII contract (Phase 5B).
 * An ESRI ASCII grid is not a DEM unless an ElevationDatum/VerticalDatum comment
 * is present. EPSG or Units=m alone is not enough — generic ASCII grids may carry
 * those without being terrain. Support still requires EPSG, Units=m, and
 * ElevationDatum. G-AID never downloads a DEM, and a filename containing "dem"
 * is not a DEM.
 */

import type { CatalogBBox } from "./types.ts";
import { firstLines, headerSummaryFromText } from "./peek-text.ts";

export const DEM_ASCII_FORMAT = "dem-ascii";
export const DEM_ADAPTER_ID = "dem-ascii";

export type DemElevationDatum = "orthometric" | "ellipsoidal";

export interface DemContractResult {
  looksLikeDem: boolean;
  formatId: typeof DEM_ASCII_FORMAT | "esri-ascii-grid" | "unknown";
  epsg?: number;
  crs?: string;
  units?: "m";
  elevationDatum?: DemElevationDatum;
  bbox?: CatalogBBox;
  cellSizeM?: number;
  ncols?: number;
  nrows?: number;
  errors: string[];
  warnings: string[];
  nodata?: number;
}

const COMMENT_RE =
  /^(?:\/\s*|#\s*|;\s*)?(EPSG|CRS|Units|ElevationDatum|VerticalDatum)\s*=\s*(.+)$/i;

function parseComments(text: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.trim().match(COMMENT_RE);
    if (!match) continue;
    found[match[1].toLowerCase()] = match[2].trim();
  }
  return found;
}

function parseAsciiHeader(text: string): {
  ncols?: number;
  nrows?: number;
  cellsize?: number;
  xll?: number;
  yll?: number;
  nodata?: number;
} {
  const map: Record<string, number> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^[/#;]/.test(trimmed)) continue;
    const match = trimmed.match(
      /^(ncols|nrows|xllcorner|yllcorner|xllcenter|yllcenter|cellsize|nodata_value)\s+([-+0-9.eE]+)/i
    );
    if (!match) {
      if (Object.keys(map).length) break;
      continue;
    }
    map[match[1].toLowerCase()] = Number(match[2]);
  }
  const cell = map.cellsize;
  let xll = map.xllcorner;
  let yll = map.yllcorner;
  if (xll == null && map.xllcenter != null && Number.isFinite(cell)) xll = map.xllcenter - cell / 2;
  if (yll == null && map.yllcenter != null && Number.isFinite(cell)) yll = map.yllcenter - cell / 2;
  return {
    ncols: map.ncols,
    nrows: map.nrows,
    cellsize: cell,
    xll,
    yll,
    nodata: map.nodata_value,
  };
}

export function inspectDemText(text: string): DemContractResult {
  const comments = parseComments(text);
  const header = parseAsciiHeader(text);
  const hasGrid = Number.isFinite(header.ncols) && Number.isFinite(header.nrows);
  const epsgRaw = comments.epsg || comments.crs;
  const unitsRaw = (comments.units || "").toLowerCase();
  const datumRaw = (comments.elevationdatum || comments.verticaldatum || "").toLowerCase();
  const hasContractComment = Boolean(epsgRaw || unitsRaw || datumRaw);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!hasGrid) {
    return {
      looksLikeDem: false,
      formatId: "unknown",
      errors: ["Not an ESRI ASCII grid."],
      warnings,
    };
  }

  let epsg: number | undefined;
  if (epsgRaw) {
    const match = epsgRaw.match(/(\d{4,6})/);
    epsg = match ? parseInt(match[1], 10) : undefined;
    if (!epsg) errors.push("DEM EPSG is not an integer.");
  } else if (hasContractComment) {
    errors.push("DEM ASCII requires / EPSG=<integer>. I will not assume a CRS.");
  }

  let units: "m" | undefined;
  if (unitsRaw) {
    if (/^(m|metre|meter|metres|meters)$/i.test(unitsRaw)) units = "m";
    else errors.push("DEM ASCII requires / Units=m. Other elevation units are not converted.");
  } else if (hasContractComment) {
    errors.push("DEM ASCII requires / Units=m.");
  }

  let elevationDatum: DemElevationDatum | undefined;
  if (datumRaw) {
    if (/ortho/.test(datumRaw)) elevationDatum = "orthometric";
    else if (/ellips/.test(datumRaw)) elevationDatum = "ellipsoidal";
    else errors.push("DEM ASCII requires / ElevationDatum=orthometric|ellipsoidal.");
  } else if (hasContractComment) {
    errors.push("DEM ASCII requires / ElevationDatum=orthometric|ellipsoidal. I will not assume a vertical datum.");
  }

  let bbox: CatalogBBox | undefined;
  if (
    Number.isFinite(header.ncols) &&
    Number.isFinite(header.nrows) &&
    Number.isFinite(header.cellsize) &&
    Number.isFinite(header.xll) &&
    Number.isFinite(header.yll)
  ) {
    bbox = {
      minX: header.xll as number,
      minY: header.yll as number,
      maxX: (header.xll as number) + (header.ncols as number) * (header.cellsize as number),
      maxY: (header.yll as number) + (header.nrows as number) * (header.cellsize as number),
    };
  }

  // Require a vertical/elevation datum comment. EPSG or Units=m alone is
  // not enough — generic ASCII grids may carry those without being DEMs.
  const looksLikeDem = Boolean(datumRaw) && hasGrid;
  return {
    looksLikeDem,
    formatId: looksLikeDem ? DEM_ASCII_FORMAT : "esri-ascii-grid",
    epsg,
    crs: epsg ? `EPSG:${epsg}` : undefined,
    units,
    elevationDatum,
    bbox,
    cellSizeM: Number.isFinite(header.cellsize) ? header.cellsize : undefined,
    ncols: header.ncols,
    nrows: header.nrows,
    nodata: Number.isFinite(header.nodata) ? header.nodata : undefined,
    errors: looksLikeDem ? errors : [],
    warnings,
  };
}

export function demReadyForSupport(result: DemContractResult): boolean {
  return (
    result.looksLikeDem &&
    result.formatId === DEM_ASCII_FORMAT &&
    Boolean(result.epsg) &&
    result.units === "m" &&
    Boolean(result.elevationDatum) &&
    Boolean(result.bbox) &&
    typeof result.cellSizeM === "number" &&
    result.cellSizeM > 0 &&
    result.errors.length === 0
  );
}

export function demHeaderSummary(text: string): string | undefined {
  const lines = firstLines(text, 8).filter((line) => line.trim());
  return lines.length ? lines.slice(0, 4).join(" | ") : headerSummaryFromText(text);
}
