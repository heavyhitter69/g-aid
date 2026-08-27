/**
 * Map-layer display path: catalog/artifact identity → adapter → decode.
 * Unsupported formats return null; they are never turned into rasters or vectors.
 */

import { parseEsriAscii } from "./ascii.ts";
import { isFalselyDecodable } from "./display.ts";
import { parseGeojson } from "./geojson.ts";
import { parseGaidGeoTiff } from "./geotiff.ts";
import { decodeShapefileDataset } from "../catalog/shapefile-contract.ts";
import { crsFromCatalog } from "./crs.ts";
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
  shp?: Buffer | Uint8Array;
  shx?: Buffer | Uint8Array;
  dbf?: Buffer | Uint8Array;
  prjText?: string;
  cpgText?: string;
}): { data: VectorLayerData; crs: CrsInfo } | null {
  if (isFalselyDecodable(input.formatId) || input.formatId === "unknown") return null;
  if (input.formatId === "geojson" && input.text) return parseGeojson(input.text);
  if (input.formatId === "shapefile" && input.shp && input.shx && input.dbf) {
    const decoded = decodeShapefileDataset({
      shp: Buffer.from(input.shp),
      shx: Buffer.from(input.shx),
      dbf: Buffer.from(input.dbf),
      prjText: input.prjText,
      cpgText: input.cpgText,
    });
    if (!decoded) return null;
    const crs = crsFromCatalog(decoded.inspect.crs, {
      source: "shapefile-prj",
      axisOrder: decoded.inspect.axisOrder,
      coordinateOrder: decoded.inspect.coordinateOrder,
    });
    return {
      data: {
        features: decoded.features.map((feature) => ({
          type: feature.geometry_type,
          coordinates: feature.coordinates,
          rings: feature.rings,
          parts: feature.parts,
          id: feature.id,
          properties: feature.properties,
        })),
        featureCount: decoded.features.length,
      },
      crs,
    };
  }
  return null;
}
