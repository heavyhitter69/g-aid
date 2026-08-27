import { headerSummaryFromText, looksMostlyText, firstLines } from "../peek-text.ts";
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
  GEOJSON_ADAPTER_ID,
  GEOJSON_FORMAT,
  UNASSIGNED_VECTOR_ROLE,
  geojsonReadyForSupport,
  inspectGeojsonText,
  looksLikeGeojsonText,
} from "../geojson-contract.ts";

function geojsonSniff(ctx: SniffContext): AdapterSniff | null {
  if (!looksMostlyText(ctx.peek)) return null;
  if (!looksLikeGeojsonText(ctx.peekText)) return null;
  const inspected = inspectGeojsonText(ctx.peekText, {
    companionPrjText: ctx.companionPrjText,
    filename: ctx.filename,
  });
  const ready = geojsonReadyForSupport(inspected);
  return {
    confidence: ready ? 0.94 : 0.86,
    formatId: GEOJSON_FORMAT,
    mediaClass: "vector",
    domainHint: "gis",
    notes: [
      ready
        ? `Matched documented GeoJSON vector contract (${inspected.geojsonContract || "geojson"}).`
        : "GeoJSON tokens present; CRS, geometry validity, or feature content did not meet the processing contract.",
    ],
  };
}

export const geojsonAdapter: CatalogAdapter = {
  id: GEOJSON_ADAPTER_ID,
  formatId: GEOJSON_FORMAT,
  supportStatus: "supported",
  sniff: geojsonSniff,
  inspect: (ctx): CatalogInspection => {
    const inspected = inspectGeojsonText(ctx.peekText, {
      companionPrjText: ctx.companionPrjText,
      filename: ctx.filename,
    });
    const ready = geojsonReadyForSupport(inspected);
    const errors = [...inspected.errors];
    if (!ready && inspected.looksLikeGeojson) {
      errors.push(
        "This GeoJSON is recognised but not a supported processing input until geometries validate and CRS is documented as RFC 7946 OGC:CRS84, a validated legacy crs mapping, or a G-AID custom import (.prj / EPSG=)."
      );
    }
    const contractNote =
      inspected.geojsonContract === "rfc7946"
        ? "RFC 7946 OGC:CRS84 (lon, lat degrees)."
        : inspected.geojsonContract === "legacy-geojson"
          ? "legacy-GeoJSON (crs member is not RFC 7946)."
          : inspected.geojsonContract === "g-aid-custom-import"
            ? "G-AID custom import contract (not RFC 7946 GeoJSON)."
            : "GeoJSON tokens present.";
    return {
      columns: inspected.attributeNames,
      headerSummary:
        `${contractNote} ${firstLines(ctx.peekText, 4).join(" | ") || headerSummaryFromText(ctx.peekText)}`.trim(),
      crs: inspected.crs,
      units: inspected.crs === "OGC:CRS84" || inspected.crs === "EPSG:4326" ? "degrees" : inspected.crs ? "metres-or-degrees" : undefined,
      bbox: inspected.bbox,
      recordCount: inspected.validFeatureCount,
      parseErrors: errors.length ? errors : undefined,
      supportStatus: ready ? "supported" : inspected.looksLikeGeojson ? "recognised-unsupported" : "unknown",
      geometryTypes: inspected.geometryTypes,
      locationQuality: inspected.locationQuality,
      coordinateKind: inspected.crs === "OGC:CRS84" || inspected.crs === "EPSG:4326" ? "geographic" : inspected.crs ? "easting-northing" : "unknown",
      vectorRole: UNASSIGNED_VECTOR_ROLE,
      attributeNames: inspected.attributeNames,
      geojsonContract: inspected.geojsonContract,
      crsSource: inspected.crsSource,
      axisOrder: inspected.axisOrder,
      coordinateOrder: inspected.coordinateOrder,
    };
  },
  validate: (record) =>
    record.supportStatus === "supported"
      ? okIfSupported(record, GEOJSON_ADAPTER_ID)
      : okIfRecognised(record, GEOJSON_ADAPTER_ID),
  read: () => deferredRead(GEOJSON_ADAPTER_ID),
};
