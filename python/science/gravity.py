"""Gravity reductions.

Normal gravity (WGS-84 / Somigliana): Moritz (2000) Geodetic Reference System 1980.
Free-air:      Δg_FA = g_obs − γ + 0.3086 h            (mGal, h in metres)
Simple Bouguer: Δg_B  = Δg_FA − 2πGρ h                 (Bullard A)
Bullard B:     closed-form spherical cap (LaFehr 1991)
Terrain:       rectangular prisms (Nagy 1966) inside a configured near-zone
               radius or DEM extent. This is a near-zone terrain-corrected
               Bouguer anomaly, not a Complete Bouguer Anomaly.

G = 6.67430e-11 m³ kg⁻¹ s⁻².  2πG in mGal/m per g cm⁻³ = 0.041908.
"""

from __future__ import annotations

import math

import numpy as np

from science.grid import Grid

G_SI = 6.67430e-11
TWO_PI_G_MGAL = 0.041908  # mGal per (g/cm³ · m)
FREE_AIR_MGAL_PER_M = 0.3086
WGS84_GE = 9.7803253359  # m s⁻²
WGS84_K = 0.00193185265241
WGS84_E2 = 0.00669437999013


def somigliana_normal_gravity(lat_deg) -> np.ndarray:
    """γ on the WGS-84 ellipsoid, mGal (Moritz 2000)."""
    lat = np.radians(np.asarray(lat_deg, float))
    s2 = np.sin(lat) ** 2
    gamma = WGS84_GE * (1.0 + WGS84_K * s2) / np.sqrt(1.0 - WGS84_E2 * s2)
    return gamma * 1.0e5  # m/s² → mGal


def free_air_correction(height_m) -> np.ndarray:
    return FREE_AIR_MGAL_PER_M * np.asarray(height_m, float)


def bouguer_slab_correction(height_m, density_gcc: float) -> np.ndarray:
    """Simple Bouguer (infinite slab): 2πGρh. density_gcc is required."""
    if density_gcc is None:
        raise ValueError("Bouguer slab density is required. I will not assume 2.67 g/cm³.")
    return TWO_PI_G_MGAL * float(density_gcc) * np.asarray(height_m, float)


def bullard_b(height_m, density_gcc: float, earth_radius_m: float = 6371000.0) -> np.ndarray:
    """Spherical-cap (Bullard B) correction, LaFehr (1991) closed form, mGal."""
    if density_gcc is None:
        raise ValueError("Bullard B density is required. I will not assume 2.67 g/cm³.")
    h = np.asarray(height_m, float)
    r = float(earth_radius_m)
    # LaFehr 1991 eq. 4 approximation in mGal for |h| << R
    return TWO_PI_G_MGAL * float(density_gcc) * h * (h / r) * (1.0 - h / (2.0 * r))


def latitude_free_air_bouguer(
    g_obs_mgal,
    lat_deg,
    height_m,
    density_gcc: float,
    apply_bullard_b: bool = False,
) -> dict[str, np.ndarray]:
    if density_gcc is None:
        raise ValueError("Bouguer density is required. I will not assume 2.67 g/cm³.")
    g = np.asarray(g_obs_mgal, float)
    lat = np.asarray(lat_deg, float)
    h = np.asarray(height_m, float)
    gamma = somigliana_normal_gravity(lat)
    fa = g - gamma + free_air_correction(h)
    slab = bouguer_slab_correction(h, density_gcc)
    bb = bullard_b(h, density_gcc) if apply_bullard_b else 0.0
    bouguer = fa - slab + bb
    return {
        "normal_gravity_mgal": gamma,
        "free_air_mgal": fa,
        "bouguer_slab_mgal": slab,
        "bullard_b_mgal": np.asarray(bb, float) + np.zeros_like(fa),
        "bouguer_mgal": bouguer,
        "density_gcc": np.full_like(fa, density_gcc),
    }


def prism_gz_vectorized(x1, x2, y1, y2, z1, z2, density_gcc: float):
    """Vertical attraction of right rectangular prisms (Nagy 1966), mGal.

    Observation at the origin. Prism corners relative to the meter, z positive down.
    Arrays broadcast. Density is required; there is no 2.67 default.
    """
    if density_gcc is None:
        raise ValueError("Terrain-correction density is required. I will not assume 2.67 g/cm³.")
    rho = float(density_gcc) * 1000.0  # kg m⁻³
    acc = 0.0
    for i, x in enumerate((x1, x2)):
        for j, y in enumerate((y1, y2)):
            for k, z in enumerate((z1, z2)):
                r = np.sqrt(x * x + y * y + z * z)
                sign = (-1) ** (i + j + k)
                # Nagy 1966: x ln(y+r) + y ln(x+r) − z arctan2(xy, zr).
                # |x| inside the log is incorrect once a corner coordinate is negative.
                acc = acc + sign * (
                    x * np.log(np.maximum(y + r, 1e-12))
                    + y * np.log(np.maximum(x + r, 1e-12))
                    - z * np.arctan2(x * y, z * r + 1e-12)
                )
    return G_SI * rho * acc * 1.0e5


def prism_gz(east_m, north_m, height_m, x1, x2, y1, y2, z1, z2, density_gcc: float) -> float:
    """Single-prism Nagy 1966 gz in mGal. Observation at (east, north); z1/z2 positive down from the meter."""
    del height_m  # observation is reduced to z=0; z1/z2 are already relative
    val = prism_gz_vectorized(
        np.asarray(x1 - east_m, float),
        np.asarray(x2 - east_m, float),
        np.asarray(y1 - north_m, float),
        np.asarray(y2 - north_m, float),
        np.asarray(z1, float),
        np.asarray(z2, float),
        density_gcc,
    )
    return float(np.asarray(val).reshape(-1)[0])


def terrain_correction_prisms(
    east,
    north,
    height,
    dem: Grid,
    density_gcc: float,
    max_radius_m: float,
) -> dict:
    """Near-zone Nagy prism terrain correction.

    Each DEM cell is a rectangular prism of the mass difference between the DEM
    surface and the station slab plane. TC = |gz| so both hills and valleys
    add a positive correction. This is a near-zone terrain correction, not a
    Complete Bouguer Anomaly. Far-zone / intermediate-zone / Hayford–Bowie
    compartments are not implemented.

    Returns arrays plus coverage statistics. Density and radius are required.
    """
    if density_gcc is None:
        raise ValueError("Terrain-correction density is required. I will not assume 2.67 g/cm³.")
    if max_radius_m is None or not np.isfinite(max_radius_m) or float(max_radius_m) <= 0:
        raise ValueError("Terrain-correction radius must be a positive length in metres, or the caller must use the DEM extent.")
    east = np.asarray(east, float)
    north = np.asarray(north, float)
    height = np.asarray(height, float)
    dem_z = dem.masked()
    xs = dem.x_centres()
    ys = dem.y_centres()
    xx, yy = np.meshgrid(xs, ys)
    halfx = dem.dx / 2.0
    halfy = dem.dy / 2.0
    radius = float(max_radius_m)
    out = np.zeros(east.shape, dtype=float)
    coverage = np.full(east.shape, np.nan, dtype=float)
    cells_used = np.zeros(east.shape, dtype=int)
    for n, (e, nrt, h) in enumerate(zip(east.ravel(), north.ravel(), height.ravel())):
        if not (np.isfinite(e) and np.isfinite(nrt) and np.isfinite(h)):
            out.ravel()[n] = np.nan
            continue
        dist = np.hypot(xx - e, yy - nrt)
        inside = dist <= radius
        valid = inside & np.isfinite(dem_z)
        n_inside = int(np.count_nonzero(inside))
        n_valid = int(np.count_nonzero(valid))
        coverage.ravel()[n] = (n_valid / n_inside) if n_inside else 0.0
        cells_used.ravel()[n] = n_valid
        if n_valid == 0:
            out.ravel()[n] = np.nan
            continue
        dz = dem_z - h
        mask = valid & (np.abs(dz) >= 1e-6)
        if not np.any(mask):
            out.ravel()[n] = 0.0
            continue
        x1 = (xx - halfx)[mask] - e
        x2 = (xx + halfx)[mask] - e
        y1 = (yy - halfy)[mask] - nrt
        y2 = (yy + halfy)[mask] - nrt
        z_rel = dz[mask]
        z1 = np.minimum(z_rel, 0.0)
        z2 = np.maximum(z_rel, 0.0)
        gz = prism_gz_vectorized(x1, x2, y1, y2, z1, z2, density_gcc)
        out.ravel()[n] = float(np.abs(np.sum(gz)))
    return {
        "terrain_correction_mgal": out.reshape(east.shape),
        "coverage_fraction": coverage.reshape(east.shape),
        "cells_used": cells_used.reshape(east.shape),
        "radius_m": radius,
        "density_gcc": float(density_gcc),
        "method": "Nagy 1966 rectangular prisms, near-zone only — not Complete Bouguer",
        "far_zone": False,
    }


def polynomial_regional(grid: Grid, order: int = 2) -> tuple[Grid, Grid]:
    """Least-squares polynomial regional / residual split."""
    data = grid.masked()
    yy, xx = np.mgrid[0 : grid.ny, 0 : grid.nx]
    x = xx.astype(float)
    y = yy.astype(float)
    mask = np.isfinite(data)
    cols = [np.ones(mask.sum())]
    for p in range(1, order + 1):
        for q in range(p + 1):
            cols.append(((x[mask] ** (p - q)) * (y[mask] ** q)))
    a = np.column_stack(cols)
    coef, *_ = np.linalg.lstsq(a, data[mask], rcond=None)
    regional = np.full_like(data, np.nan)
    full_cols = [np.ones(x.size)]
    for p in range(1, order + 1):
        for q in range(p + 1):
            full_cols.append((x ** (p - q) * y**q).ravel())
    regional.ravel()[:] = np.column_stack(full_cols) @ coef
    residual = data - regional
    return (
        grid.copy_with(regional, name="regional", units=grid.units),
        grid.copy_with(residual, name="residual", units=grid.units),
    )
