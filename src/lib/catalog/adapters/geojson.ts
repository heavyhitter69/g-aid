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
        ? "Matched documented GeoJSON vector contract (geometry + EPSG)."
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
        "This GeoJSON is recognised but not a supported processing input until geometries validate and an EPSG is documented (crs member, / EPSG= comment, or companion .prj AUTHORITY)."
      );
    }
    return {
      columns: inspected.attributeNames,
      headerSummary: firstLines(ctx.peekText, 4).join(" | ") || headerSummaryFromText(ctx.peekText),
      crs: inspected.crs,
      units: inspected.crs === "EPSG:4326" ? "degrees" : inspected.crs ? "metres-or-degrees" : undefined,
      bbox: inspected.bbox,
      recordCount: inspected.validFeatureCount,
      parseErrors: errors.length ? errors : undefined,
      supportStatus: ready ? "supported" : inspected.looksLikeGeojson ? "recognised-unsupported" : "unknown",
      geometryTypes: inspected.geometryTypes,
      locationQuality: inspected.locationQuality,
      vectorRole: UNASSIGNED_VECTOR_ROLE,
      attributeNames: inspected.attributeNames,
    };
  },
  validate: (record) =>
    record.supportStatus === "supported"
      ? okIfSupported(record, GEOJSON_ADAPTER_ID)
      : okIfRecognised(record, GEOJSON_ADAPTER_ID),
  read: () => deferredRead(GEOJSON_ADAPTER_ID),
};
