/**
 * Map-layer display path: catalog/artifact identity → adapter → decode.
 * Unsupported formats return null; they are never turned into rasters or vectors.
 */

import { parseEsriAscii } from "./ascii.ts";
import { isFalselyDecodable } from "./display.ts";
import { parseGeojson } from "./geojson.ts";
import { parseGaidGeoTiff } from "./geotiff.ts";
import type { CrsInfo, RasterGrid, VectorLayerData } from "./types.ts";

export function decodeRasterLayer(input: {
  formatId: string;
  text?: string;
  buffer?: Buffer;
}): RasterGrid | null {
  if (isFalselyDecodable(input.formatId) || input.formatId === "unknown") return null;
  if (input.formatId === "geotiff") {
    if (input.buffer) {
      const decoded = parseGaidGeoTiff(input.buffer);
      if (decoded) return decoded.grid;
    }
    if (input.text) return parseEsriAscii(input.text);
    return null;
  }
  if (input.formatId === "esri-ascii-grid" || input.formatId === "dem-ascii") {
    return input.text ? parseEsriAscii(input.text) : null;
  }
  return null;
}

export function decodeVectorLayer(input: {
  formatId: string;
  text?: string;
}): { data: VectorLayerData; crs: CrsInfo } | null {
  if (isFalselyDecodable(input.formatId) || input.formatId === "unknown") return null;
  if (input.formatId !== "geojson" || !input.text) return null;
  return parseGeojson(input.text);
}
