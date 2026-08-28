"""IGRF-13 main-field evaluation.

Alken et al. (2021), Earth Planets Space 73:49.
Potential V(r,θ,λ) = a Σ_n (a/r)^{n+1} Σ_m [g_n^m cos(mλ) + h_n^m sin(mλ)] P_n^m(cos θ)
with Schmidt quasi-normalized associated Legendre functions P_n^m.
B = −∇V. Geodetic coordinates are converted to geocentric on WGS-84.

Secular variation is linear between 2020.0 and 2025.0. Evaluation outside
that window extrapolates the same SV and sets `extrapolated=True`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from science.crs import WGS84_A, WGS84_E2
from science.igrf_coeffs import EPOCH, IGRF13_2020, NMAX, SV_END

_SCHMIDT_FACTOR = np.zeros((NMAX + 1, NMAX + 1))
for _n in range(NMAX + 1):
    for _m in range(_n + 1):
        _fact = math.factorial(_n - _m) / math.factorial(_n + _m)
        _SCHMIDT_FACTOR[_n, _m] = math.sqrt((2.0 if _m > 0 else 1.0) * _fact)


@dataclass(frozen=True)
class IGRFResult:
    x: float  # geodetic north, nT
    y: float  # geodetic east, nT
    z: float  # geodetic down, nT
    f: float  # total intensity, nT
    h: float  # horizontal intensity, nT
    inclination: float  # degrees, positive downward
    declination: float  # degrees, positive east of north
    year: float
    extrapolated: bool


def decimal_year(timestamp: float | None = None, year: float | None = None) -> float:
    if year is not None:
        return float(year)
    if timestamp is None:
        raise ValueError("decimal_year requires timestamp or year")
    from datetime import datetime, timezone

    dt = datetime.fromtimestamp(float(timestamp), tz=timezone.utc)
    start = datetime(dt.year, 1, 1, tzinfo=timezone.utc)
    end = datetime(dt.year + 1, 1, 1, tzinfo=timezone.utc)
    frac = (dt - start).total_seconds() / (end - start).total_seconds()
    return dt.year + frac


def _coefficients(year: float) -> tuple[np.ndarray, np.ndarray, bool]:
    t = year - EPOCH
    g = np.zeros((NMAX + 1, NMAX + 1))
    h = np.zeros((NMAX + 1, NMAX + 1))
    for n, m, gv, hv, gsv, hsv in IGRF13_2020:
        g[n, m] = gv + t * gsv
        h[n, m] = hv + t * hsv
    return g, h, (year < EPOCH - 1e-9 or year > SV_END + 1e-9)


def _schmidt_legendre(nmax: int, colat: float) -> tuple[np.ndarray, np.ndarray]:
    """Schmidt quasi-normalized P_n^m(cos θ) and dP_n^m/dθ.

    Unnormalized Ferrers functions (no Condon-Shortley phase) followed by
    Schmidt factors sqrt((2-δ_m0) (n-m)! / (n+m)!). Recurrence: Abramowitz
    & Stegun 8.5.1 / Winch et al. (2005).
    """
    x = math.cos(colat)
    s = math.sin(colat)
    p_un = np.zeros((nmax + 1, nmax + 1))
    dp_un = np.zeros((nmax + 1, nmax + 1))
    p_un[0, 0] = 1.0
    dp_un[0, 0] = 0.0
    if nmax >= 1:
        p_un[1, 0] = x
        dp_un[1, 0] = -s
        p_un[1, 1] = s
        dp_un[1, 1] = x
    for n in range(2, nmax + 1):
        p_un[n, n] = (2 * n - 1) * s * p_un[n - 1, n - 1]
        dp_un[n, n] = (2 * n - 1) * (s * dp_un[n - 1, n - 1] + x * p_un[n - 1, n - 1])
        p_un[n, n - 1] = (2 * n - 1) * x * p_un[n - 1, n - 1]
        dp_un[n, n - 1] = (2 * n - 1) * (x * dp_un[n - 1, n - 1] - s * p_un[n - 1, n - 1])
        for m in range(n - 2, -1, -1):
            p_un[n, m] = ((2 * n - 1) * x * p_un[n - 1, m] - (n + m - 1) * p_un[n - 2, m]) / (n - m)
            dp_un[n, m] = (
                (2 * n - 1) * (x * dp_un[n - 1, m] - s * p_un[n - 1, m]) - (n + m - 1) * dp_un[n - 2, m]
            ) / (n - m)

    p = p_un * _SCHMIDT_FACTOR[: nmax + 1, : nmax + 1]
    dp = dp_un * _SCHMIDT_FACTOR[: nmax + 1, : nmax + 1]
    return p, dp


def igrf13(lat_deg: float, lon_deg: float, alt_km: float = 0.0, year: float = 2020.0) -> IGRFResult:
    g, h, extrapolated = _coefficients(year)
    lat = math.radians(lat_deg)
    lon = math.radians(lon_deg)
    sin_lat = math.sin(lat)
    cos_lat = math.cos(lat)
    n_prime = WGS84_A / math.sqrt(1.0 - WGS84_E2 * sin_lat * sin_lat)
    xg = (n_prime + alt_km * 1000.0) * cos_lat * math.cos(lon)
    yg = (n_prime + alt_km * 1000.0) * cos_lat * math.sin(lon)
    zg = (n_prime * (1.0 - WGS84_E2) + alt_km * 1000.0) * sin_lat
    r_m = math.sqrt(xg * xg + yg * yg + zg * zg)
    r_km = r_m / 1000.0
    colat = math.acos(max(-1.0, min(1.0, zg / r_m)))
    a = 6371.2
    ratio = a / r_km
    p, dp = _schmidt_legendre(NMAX, colat)

    br = 0.0
    bt = 0.0
    bp = 0.0
    rr = ratio
    for n in range(1, NMAX + 1):
        rr *= ratio  # (a/r)^{n+1}
        for m in range(n + 1):
            cml = math.cos(m * lon)
            sml = math.sin(m * lon)
            gm = g[n, m]
            hm = h[n, m]
            br += (n + 1) * rr * (gm * cml + hm * sml) * p[n, m]
            bt -= rr * (gm * cml + hm * sml) * dp[n, m]
            if m:
                bp += rr * m * (gm * sml - hm * cml) * p[n, m]
    sin_th = math.sin(colat)
    if abs(sin_th) > 1e-10:
        bp /= sin_th

    # Rotate geocentric (B_r, B_θ, B_λ) to geodetic (north, east, down).
    psi = colat - (math.pi / 2.0 - lat)
    north = -bt * math.cos(psi) - br * math.sin(psi)
    east = bp
    down = bt * math.sin(psi) - br * math.cos(psi)
    f = math.sqrt(north * north + east * east + down * down)
    horiz = math.sqrt(north * north + east * east)
    inc = math.degrees(math.atan2(down, horiz)) if horiz > 0 or abs(down) > 0 else 0.0
    dec = math.degrees(math.atan2(east, north))
    return IGRFResult(north, east, down, f, horiz, inc, dec, year, extrapolated)


def igrf13_array(lat, lon, alt_km=0.0, year: float = 2020.0) -> dict:
    lat = np.asarray(lat, dtype=float)
    lon = np.asarray(lon, dtype=float)
    alt = np.broadcast_to(np.asarray(alt_km, dtype=float), lat.shape)
    out = {key: np.empty(lat.size, dtype=float) for key in ("x", "y", "z", "f", "inclination", "declination")}
    extra = False
    for i, (la, lo, al) in enumerate(zip(lat.ravel(), lon.ravel(), alt.ravel())):
        if not (np.isfinite(la) and np.isfinite(lo)):
            for key in out:
                out[key][i] = np.nan
            continue
        res = igrf13(float(la), float(lo), float(al) if np.isfinite(al) else 0.0, year)
        out["x"][i] = res.x
        out["y"][i] = res.y
        out["z"][i] = res.z
        out["f"][i] = res.f
        out["inclination"][i] = res.inclination
        out["declination"][i] = res.declination
        extra = extra or res.extrapolated
    shape = lat.shape
    return {key: val.reshape(shape) for key, val in out.items()} | {"year": year, "extrapolated": extra}
