/** WGS-84 → UTM (USGS PP 1395), same ellipsoid as python/science/crs.py. */

const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const K0 = 0.9996;

export function utmZoneFromLon(lonDeg: number): number {
  return Math.min(60, Math.max(1, Math.floor((lonDeg + 180) / 6) + 1));
}

export function utmEpsgFromLonLat(lonDeg: number, latDeg: number): number {
  return (latDeg < 0 ? 32700 : 32600) + utmZoneFromLon(lonDeg);
}

function meridianArc(lat: number): number {
  const e2 = E2;
  return (
    A *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * lat -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * lat) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * lat) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * lat))
  );
}

export function wgs84ToUtm(
  lonDeg: number,
  latDeg: number,
  zone?: number
): { easting: number; northing: number; zone: number } {
  const z = zone ?? utmZoneFromLon(lonDeg);
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const lon0 = (((6 * z - 183) * Math.PI) / 180);
  const n = A / Math.sqrt(1 - E2 * Math.sin(lat) ** 2);
  const t = Math.tan(lat) ** 2;
  const c = EP2 * Math.cos(lat) ** 2;
  const a = Math.cos(lat) * (lon - lon0);
  const m = meridianArc(lat);
  let easting =
    K0 *
      n *
      (a +
        ((1 - t + c) * a ** 3) / 6 +
        ((5 - 18 * t + t ** 2 + 72 * c - 58 * EP2) * a ** 5) / 120) +
    500000;
  let northing =
    K0 *
    (m +
      n *
        Math.tan(lat) *
        (a ** 2 / 2 +
          ((5 - t + 9 * c + 4 * c ** 2) * a ** 4) / 24 +
          ((61 - 58 * t + t ** 2 + 600 * c - 330 * EP2) * a ** 6) / 720));
  if (latDeg < 0) northing += 10000000;
  return { easting, northing, zone: z };
}

export function looksLonLat(x: number, y: number): boolean {
  return Math.abs(x) <= 180 && Math.abs(y) <= 90;
}

export function epsgZone(epsg: number): { zone: number; northern: boolean } | null {
  if (epsg >= 32601 && epsg <= 32660) return { zone: epsg - 32600, northern: true };
  if (epsg >= 32701 && epsg <= 32760) return { zone: epsg - 32700, northern: false };
  return null;
}
