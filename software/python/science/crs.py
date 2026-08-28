"""WGS-84 geodesy and UTM projection.

Formulas: NIMA / Snyder Map Projections — A Working Manual (USGS PP 1395).
Ellipsoid: EPSG:7030 (WGS 84). UTM: EPSG:326xx / 327xx.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

WGS84_A = 6378137.0
WGS84_F = 1.0 / 298.257223563
WGS84_B = WGS84_A * (1.0 - WGS84_F)
WGS84_E2 = WGS84_F * (2.0 - WGS84_F)
WGS84_EP2 = WGS84_E2 / (1.0 - WGS84_E2)
UTM_K0 = 0.9996


@dataclass(frozen=True)
class CRS:
    epsg: int
    name: str
    kind: str  # geographic | projected

    def wkt(self) -> str:
        if self.kind == "geographic":
            return (
                'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],'
                'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],AUTHORITY["EPSG","4326"]]'
            )
        hemisphere = "N" if self.epsg < 32700 else "S"
        zone = self.epsg - 32600 if hemisphere == "N" else self.epsg - 32700
        return (
            f'PROJCS["WGS 84 / UTM zone {zone}{hemisphere}",'
            'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],'
            'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],'
            f'PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],'
            f'PARAMETER["central_meridian",{utm_central_meridian(zone)}],'
            'PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],'
            f'PARAMETER["false_northing",{0 if hemisphere == "N" else 10000000}],'
            'UNIT["metre",1],'
            f'AUTHORITY["EPSG","{self.epsg}"]]'
        )


CRS_WGS84 = CRS(4326, "WGS 84", "geographic")


def utm_zone_from_lon(lon_deg: float) -> int:
    zone = int(math.floor((lon_deg + 180.0) / 6.0) + 1)
    return min(max(zone, 1), 60)


def utm_central_meridian(zone: int) -> float:
    return 6.0 * zone - 183.0


def utm_epsg(lat_deg: float, lon_deg: float) -> int:
    zone = utm_zone_from_lon(lon_deg)
    return (32700 if lat_deg < 0 else 32600) + zone


def utm_crs(lat_deg: float, lon_deg: float) -> CRS:
    epsg = utm_epsg(lat_deg, lon_deg)
    zone = epsg - (32700 if lat_deg < 0 else 32600)
    hemi = "S" if lat_deg < 0 else "N"
    return CRS(epsg, f"WGS 84 / UTM zone {zone}{hemi}", "projected")


def infer_crs_epsg(x, y) -> int:
    """Guess EPSG from sample coordinates. Lon/lat if |x|<=180 and |y|<=90."""
    import numpy as np

    xx = np.asarray(x, dtype=float)
    yy = np.asarray(y, dtype=float)
    finite = np.isfinite(xx) & np.isfinite(yy)
    if not np.any(finite):
        return 4326
    if np.nanmax(np.abs(xx[finite])) <= 180.0 and np.nanmax(np.abs(yy[finite])) <= 90.0:
        return 4326
    lat = float(np.nanmedian(yy[finite]))
    lon = float(np.nanmedian(xx[finite]))
    # Already projected: still return a UTM EPSG from median if values look like metres
    return utm_epsg(lat if abs(lat) <= 90 else 0.0, lon if abs(lon) <= 180 else 0.0)


def geodetic_to_geocentric(lat_deg: float, lon_deg: float, alt_km: float) -> tuple[float, float, float]:
    """Return (r_km, lon_rad, colatitude_rad) on WGS-84."""
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    sin_lat = math.sin(lat)
    n = WGS84_A / math.sqrt(1.0 - WGS84_E2 * sin_lat * sin_lat)
    x = (n + alt_km * 1000.0) * math.cos(lat) * math.cos(lon)
    y = (n + alt_km * 1000.0) * math.cos(lat) * math.sin(lon)
    z = (n * (1.0 - WGS84_E2) + alt_km * 1000.0) * sin_lat
    r = math.sqrt(x * x + y * y + z * z)
    colat = math.acos(z / r) if r > 0 else 0.0
    return r / 1000.0, lon, colat


def wgs84_to_utm(lon_deg: float, lat_deg: float, zone: int | None = None) -> tuple[float, float, int]:
    """Forward Transverse Mercator (USGS PP 1395). Returns easting, northing (m), zone."""
    if zone is None:
        zone = utm_zone_from_lon(lon_deg)
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    lon0 = math.radians(utm_central_meridian(zone))
    e2 = WGS84_E2
    ep2 = WGS84_EP2
    n = WGS84_A / math.sqrt(1.0 - e2 * math.sin(lat) ** 2)
    t = math.tan(lat) ** 2
    c = ep2 * math.cos(lat) ** 2
    a = math.cos(lat) * (lon - lon0)
    m = _meridian_arc(lat)
    easting = (
        UTM_K0
        * n
        * (
            a
            + (1 - t + c) * a**3 / 6.0
            + (5 - 18 * t + t**2 + 72 * c - 58 * ep2) * a**5 / 120.0
        )
        + 500000.0
    )
    northing = UTM_K0 * (
        m
        + n
        * math.tan(lat)
        * (
            a**2 / 2.0
            + (5 - t + 9 * c + 4 * c**2) * a**4 / 24.0
            + (61 - 58 * t + t**2 + 600 * c - 330 * ep2) * a**6 / 720.0
        )
    )
    if lat_deg < 0:
        northing += 10000000.0
    return easting, northing, zone


def utm_to_wgs84(easting: float, northing: float, zone: int, northern: bool = True) -> tuple[float, float]:
    """Inverse Transverse Mercator (USGS PP 1395). Returns lon_deg, lat_deg."""
    x = easting - 500000.0
    y = northing if northern else northing - 10000000.0
    e2 = WGS84_E2
    ep2 = WGS84_EP2
    e1 = (1.0 - math.sqrt(1.0 - e2)) / (1.0 + math.sqrt(1.0 - e2))
    m = y / UTM_K0
    mu = m / (WGS84_A * (1.0 - e2 / 4.0 - 3.0 * e2**2 / 64.0 - 5.0 * e2**3 / 256.0))
    phi1 = (
        mu
        + (3.0 * e1 / 2.0 - 27.0 * e1**3 / 32.0) * math.sin(2.0 * mu)
        + (21.0 * e1**2 / 16.0 - 55.0 * e1**4 / 32.0) * math.sin(4.0 * mu)
        + (151.0 * e1**3 / 96.0) * math.sin(6.0 * mu)
    )
    n1 = WGS84_A / math.sqrt(1.0 - e2 * math.sin(phi1) ** 2)
    r1 = WGS84_A * (1.0 - e2) / (1.0 - e2 * math.sin(phi1) ** 2) ** 1.5
    t1 = math.tan(phi1) ** 2
    c1 = ep2 * math.cos(phi1) ** 2
    d = x / (n1 * UTM_K0)
    lat = phi1 - (n1 * math.tan(phi1) / r1) * (
        d**2 / 2.0
        - (5.0 + 3.0 * t1 + 10.0 * c1 - 4.0 * c1**2 - 9.0 * ep2) * d**4 / 24.0
        + (61.0 + 90.0 * t1 + 298.0 * c1 + 45.0 * t1**2 - 252.0 * ep2 - 3.0 * c1**2) * d**6 / 720.0
    )
    lon0 = math.radians(utm_central_meridian(zone))
    lon = lon0 + (
        d
        - (1.0 + 2.0 * t1 + c1) * d**3 / 6.0
        + (5.0 - 2.0 * c1 + 28.0 * t1 - 3.0 * c1**2 + 8.0 * ep2 + 24.0 * t1**2) * d**5 / 120.0
    ) / math.cos(phi1)
    return math.degrees(lon), math.degrees(lat)


def _meridian_arc(lat: float) -> float:
    e2 = WGS84_E2
    return WGS84_A * (
        (1.0 - e2 / 4.0 - 3.0 * e2**2 / 64.0 - 5.0 * e2**3 / 256.0) * lat
        - (3.0 * e2 / 8.0 + 3.0 * e2**2 / 32.0 + 45.0 * e2**3 / 1024.0) * math.sin(2.0 * lat)
        + (15.0 * e2**2 / 256.0 + 45.0 * e2**3 / 1024.0) * math.sin(4.0 * lat)
        - (35.0 * e2**3 / 3072.0) * math.sin(6.0 * lat)
    )


def project_points(x, y, source_epsg: int = 4326, target_epsg: int | None = None):
    """Project arrays. Geographic source assumed lon=x, lat=y."""
    import numpy as np

    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    if source_epsg == 4326:
        lat0 = float(np.nanmedian(y))
        lon0 = float(np.nanmedian(x))
        crs = utm_crs(lat0, lon0) if target_epsg is None else CRS(target_epsg, f"EPSG:{target_epsg}", "projected")
        zone = crs.epsg - (32700 if crs.epsg >= 32700 else 32600)
        east = np.empty_like(x)
        north = np.empty_like(y)
        for i, (lon, lat) in enumerate(zip(x.ravel(), y.ravel())):
            if not (math.isfinite(lon) and math.isfinite(lat)):
                east.ravel()[i] = math.nan
                north.ravel()[i] = math.nan
                continue
            e, n, _ = wgs84_to_utm(float(lon), float(lat), zone)
            east.ravel()[i] = e
            north.ravel()[i] = n
        return east.reshape(x.shape), north.reshape(y.shape), crs
    if target_epsg in (None, 4326):
        zone = source_epsg - (32700 if source_epsg >= 32700 else 32600)
        northern = source_epsg < 32700
        lon = np.empty_like(x)
        lat = np.empty_like(y)
        for i, (e, n) in enumerate(zip(x.ravel(), y.ravel())):
            if not (math.isfinite(e) and math.isfinite(n)):
                lon.ravel()[i] = math.nan
                lat.ravel()[i] = math.nan
                continue
            lo, la = utm_to_wgs84(float(e), float(n), zone, northern)
            lon.ravel()[i] = lo
            lat.ravel()[i] = la
        return lon.reshape(x.shape), lat.reshape(y.shape), CRS_WGS84
    raise ValueError(f"Unsupported CRS pair {source_epsg} -> {target_epsg}")
