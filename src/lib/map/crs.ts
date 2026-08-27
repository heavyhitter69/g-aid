import type { CrsAxisOrder, CrsInfo, GeojsonContractKind, OverlayDecision } from "./types.ts";

const EPSG_RE = /EPSG[:\s]*([0-9]{4,6})/i;
const AUTHORITY_RE = /AUTHORITY\["EPSG","(\d+)"\]/gi;

export const CRS84_KEY = "OGC:CRS84";
export const CRS84_LONLAT_NO_SWAP = "geojson-lonlat-no-axis-swap" as const;

export function parseEpsg(text: string | undefined | null): number | undefined {
  if (!text) return undefined;
  const auths = [...text.matchAll(AUTHORITY_RE)];
  const last = auths[auths.length - 1]?.[1];
  if (last) return parseInt(last, 10);
  const simple = text.match(EPSG_RE);
  if (simple) return parseInt(simple[1], 10);
  return undefined;
}

export function crsFromEpsg(
  epsg: number | undefined,
  source: CrsInfo["source"],
  extra?: Partial<CrsInfo>
): CrsInfo {
  if (!epsg) {
    return {
      key: "unknown",
      label: "CRS unknown",
      source,
      assumed: true,
      ...extra,
    };
  }
  const utmN = epsg >= 32601 && epsg <= 32660;
  const utmS = epsg >= 32701 && epsg <= 32760;
  const geographic = epsg === 4326;
  const projected = utmN || utmS || (!geographic && epsg >= 2000);
  const axisOrder: CrsAxisOrder = geographic ? "lat-lon" : projected ? "east-north" : "unknown";
  const geojsonStorage: CrsAxisOrder | undefined =
    extra?.coordinateOrder ||
    (source === "geojson" || source === "legacy-crs" || source === "custom-import" || extra?.geojsonContract
      ? geographic
        ? "lon-lat"
        : "east-north"
      : undefined);
  return {
    key: `EPSG:${epsg}`,
    label: geographic
      ? "WGS 84 (EPSG:4326, OGC axis order lat-lon)"
      : utmN
        ? `WGS 84 / UTM zone ${epsg - 32600}N (EPSG:${epsg})`
        : utmS
          ? `WGS 84 / UTM zone ${epsg - 32700}S (EPSG:${epsg})`
          : `EPSG:${epsg}`,
    epsg,
    units: geographic ? "degrees" : "metres",
    datum: "WGS 84",
    source,
    assumed: false,
    authority: "EPSG",
    axisOrder,
    coordinateOrder: geojsonStorage,
    ...extra,
  };
}

export function crs84(source: CrsInfo["source"] = "rfc7946", extra?: Partial<CrsInfo>): CrsInfo {
  return {
    key: CRS84_KEY,
    label: "WGS 84 longitude-latitude (OGC:CRS84)",
    units: "degrees",
    datum: "WGS 84",
    source,
    assumed: false,
    authority: "OGC",
    axisOrder: "lon-lat",
    coordinateOrder: "lon-lat",
    geojsonContract: "rfc7946",
    ...extra,
  };
}

export function isCrs84Key(key?: string | null): boolean {
  const value = (key || "").trim();
  return /^OGC:CRS84$/i.test(value) || /^CRS84$/i.test(value) || /^urn:ogc:def:crs:OGC:1\.3:CRS84$/i.test(value);
}

export function isEpsg4326(info?: CrsInfo | null): boolean {
  return info?.epsg === 4326 || info?.key === "EPSG:4326";
}

export function crsFromCatalog(value?: string | null, extra?: Partial<CrsInfo>): CrsInfo {
  if (!value?.trim()) return crsFromEpsg(undefined, extra?.source || "catalog", extra);
  if (isCrs84Key(value)) return crs84(extra?.source || "catalog", extra);
  return crsFromEpsg(parseEpsg(value), extra?.source || "catalog", extra);
}

export function crsFromPrj(wkt: string | undefined | null): CrsInfo {
  if (!wkt?.trim()) return crsFromEpsg(undefined, "prj");
  const epsg = parseEpsg(wkt);
  const name =
    wkt.match(/PROJCS\["([^"]+)"/)?.[1] ||
    wkt.match(/GEOGCS\["([^"]+)"/)?.[1];
  const info = crsFromEpsg(epsg, "prj");
  if (name && !epsg) {
    return { ...info, key: `wkt:${name}`, label: name, assumed: true };
  }
  if (name && epsg) return { ...info, label: `${name} (EPSG:${epsg})` };
  return info;
}

export function crsFromGeojson(obj: unknown, extras?: { companionPrjText?: string; sourceText?: string }): CrsInfo {
  const resolved = resolveGeojsonCrs(obj, extras);
  return resolved.crs;
}

export function resolveGeojsonCrs(
  obj: unknown,
  extras?: { companionPrjText?: string; sourceText?: string; bbox?: { minX: number; minY: number; maxX: number; maxY: number } }
): {
  crs: CrsInfo;
  contract?: GeojsonContractKind;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];
  const rec = obj && typeof obj === "object" ? (obj as { crs?: { properties?: { name?: string } }; properties?: Record<string, unknown> }) : null;
  const legacyName = rec?.crs?.properties?.name;
  const hasLegacyMember = Boolean(rec && "crs" in rec && rec.crs != null);
  const commentText = extras?.sourceText?.slice(0, 2000) || "";
  const commentEpsg = commentText.match(/\/\s*EPSG\s*=\s*(\d{4,6})/i);
  const prjEpsg = parseEpsg(extras?.companionPrjText);
  const memberEpsg = parseEpsg(legacyName);
  const propEpsg = parseEpsg(String(rec?.properties?.EPSG || rec?.properties?.crs || rec?.properties?.CRS || ""));

  if (hasLegacyMember) {
    warnings.push("The legacy GeoJSON crs member is not the RFC 7946 CRS mechanism. This file is labeled legacy-GeoJSON.");
    if (memberEpsg && prjEpsg && memberEpsg !== prjEpsg) {
      errors.push(`Legacy crs member EPSG:${memberEpsg} conflicts with companion .prj EPSG:${prjEpsg}. I will not pick one silently.`);
      return { crs: crsFromEpsg(undefined, "legacy-crs"), contract: "legacy-geojson", warnings, errors };
    }
    if (!memberEpsg) {
      errors.push("Legacy GeoJSON crs member is present but has no validated EPSG mapping. Overlay stays blocked until a user-confirmed CRS mapping exists.");
      return { crs: crsFromEpsg(undefined, "legacy-crs"), contract: "legacy-geojson", warnings, errors };
    }
    if (memberEpsg === 4326) {
      warnings.push("Legacy crs names EPSG:4326 (OGC axis order lat-lon). GeoJSON coordinate arrays stay [lon, lat]. G-AID will not silently swap axes or relabel this as OGC:CRS84.");
    }
    return {
      crs: crsFromEpsg(memberEpsg, "legacy-crs", {
        geojsonContract: "legacy-geojson",
        coordinateOrder: memberEpsg === 4326 ? "lon-lat" : "east-north",
      }),
      contract: "legacy-geojson",
      warnings,
      errors,
    };
  }

  const customEpsg = prjEpsg || (commentEpsg ? parseInt(commentEpsg[1], 10) : undefined) || propEpsg;
  if (customEpsg) {
    warnings.push("Projected or annotated GeoJSON is a G-AID custom import contract, not standard RFC 7946 GeoJSON.");
    if (customEpsg === 4326) {
      warnings.push("Custom import names EPSG:4326. GeoJSON coordinate arrays stay [lon, lat]. This is not OGC:CRS84 identity.");
    }
    return {
      crs: crsFromEpsg(customEpsg, "custom-import", {
        geojsonContract: "g-aid-custom-import",
        coordinateOrder: customEpsg === 4326 ? "lon-lat" : "east-north",
      }),
      contract: "g-aid-custom-import",
      warnings,
      errors,
    };
  }
  if (extras?.companionPrjText?.trim()) {
    errors.push("Companion .prj has no EPSG authority. G-AID custom import cannot document the CRS. Overlay is blocked.");
    warnings.push("This is not RFC 7946 GeoJSON because a companion .prj is present.");
    return { crs: crsFromEpsg(undefined, "custom-import", { geojsonContract: "g-aid-custom-import" }), contract: "g-aid-custom-import", warnings, errors };
  }

  const bbox = extras?.bbox;
  const geographic = bbox
    ? Math.abs(bbox.minX) <= 180 && Math.abs(bbox.maxX) <= 180 && Math.abs(bbox.minY) <= 90 && Math.abs(bbox.maxY) <= 90
    : true;
  if (bbox && !geographic) {
    errors.push("Coordinates fall outside longitude-latitude range. RFC 7946 OGC:CRS84 does not apply. Provide a G-AID custom import (.prj or / EPSG=) or a legacy crs member with a validated EPSG.");
    return { crs: crsFromEpsg(undefined, "geojson"), warnings, errors };
  }
  return {
    crs: crs84("rfc7946"),
    contract: "rfc7946",
    warnings: ["RFC 7946 GeoJSON with no crs member is documented OGC:CRS84 (WGS 84 longitude-latitude degrees). It is not EPSG:4326."],
    errors,
  };
}

function geojsonLonLatStorage(info?: CrsInfo): boolean {
  return info?.coordinateOrder === "lon-lat";
}

export function overlayDecision(a?: CrsInfo, b?: CrsInfo): OverlayDecision {
  const aKey = a?.key && a.key !== "unknown" ? a.key : "";
  const bKey = b?.key && b.key !== "unknown" ? b.key : "";
  if (a?.assumed || b?.assumed) {
    return {
      allowed: false,
      code: "assumed-crs",
      message: "Overlay blocked: at least one layer has an assumed CRS. I will not invent a datum or silently reproject.",
    };
  }
  if (aKey && bKey && aKey === bKey) {
    return { allowed: true, code: "same-crs", message: `Both layers use ${a?.label || aKey}.` };
  }
  const crs84Vs4326 =
    (isCrs84Key(aKey) && isEpsg4326(b)) || (isCrs84Key(bKey) && isEpsg4326(a));
  if (crs84Vs4326) {
    if (geojsonLonLatStorage(a) && geojsonLonLatStorage(b)) {
      return {
        allowed: true,
        code: "crs84-epsg4326-geojson-lonlat",
        compatibilityDecision: CRS84_LONLAT_NO_SWAP,
        message:
          "OGC:CRS84 and EPSG:4326 are different CRS identities (lon-lat vs OGC lat-lon). Documented compatibility uses stored GeoJSON [lon, lat] without an axis swap or reprojection. This is not CRS identity.",
      };
    }
    return {
      allowed: false,
      code: "crs84-epsg4326-axis-order",
      message:
        "Overlay blocked: OGC:CRS84 is longitude-latitude; EPSG:4326 is a different CRS with OGC lat-lon axis order. G-AID will not silently swap axes or treat them as the same unless both layers store GeoJSON [lon, lat].",
    };
  }
  if (aKey && bKey && aKey !== bKey) {
    return {
      allowed: false,
      code: "conflicting-crs",
      message: `Overlay blocked: ${a?.label || aKey} vs ${b?.label || bKey}. I will not silently reproject. Reprojection is not a registered capability in this release.`,
    };
  }
  return {
    allowed: false,
    code: "unknown-crs",
    message: "Overlay blocked: CRS is unknown. Coordinates were not assumed to match, and I will not silently reproject.",
  };
}

export function looksGeographic(x: number, y: number): boolean {
  return Math.abs(x) <= 180 && Math.abs(y) <= 90;
}
