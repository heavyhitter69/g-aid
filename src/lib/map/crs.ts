import type { CrsInfo, OverlayDecision } from "./types.ts";

const EPSG_RE = /EPSG[:\s]*([0-9]{4,5})/i;
const AUTHORITY_RE = /AUTHORITY\["EPSG","(\d+)"\]/gi;

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
  return {
    key: `EPSG:${epsg}`,
    label: geographic
      ? "WGS 84 (EPSG:4326)"
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
    ...extra,
  };
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

export function crsFromGeojson(obj: unknown): CrsInfo {
  if (!obj || typeof obj !== "object") return crsFromEpsg(undefined, "geojson");
  const crs = (obj as { crs?: { properties?: { name?: string } } }).crs;
  const name = crs?.properties?.name;
  return crsFromEpsg(parseEpsg(name), "geojson");
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
