"""Gravity reductions.

Normal gravity (WGS-84 / Somigliana): Moritz (2000) Geodetic Reference System 1980.
Free-air:      Δg_FA = g_obs − γ + 0.3086 h            (mGal, h in metres)
Simple Bouguer: Δg_B  = Δg_FA − 2πGρ h                 (Bullard A)
Bullard B:     closed-form spherical cap (LaFehr 1991)
Terrain:       rectangular prisms (Nagy 1966) if a DEM grid is supplied.

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


def bullard_b(height_m, density_gcc: float = 2.67, earth_radius_m: float = 6371000.0) -> np.ndarray:
    """Spherical-cap (Bullard B) correction, LaFehr (1991) closed form, mGal."""
    h = np.asarray(height_m, float)
    r = float(earth_radius_m)
    alpha = 166.735  # km, conventional Bullard B cap radius used with 2πGρh
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


def prism_gz(east_m, north_m, height_m, x1, x2, y1, y2, z1, z2, density_gcc: float) -> float:
    """Vertical attraction of a right rectangular prism (Nagy 1966), mGal.

    Observation at (east_m, north_m, height_m). Prism in the same metric frame,
    z positive down from the observation height so z1/z2 are depths below the meter.
    """
    rho = density_gcc * 1000.0  # kg m⁻³
    gx = (x1 - east_m, x2 - east_m)
    gy = (y1 - north_m, y2 - north_m)
    gz = (z1 - (-height_m), z2 - (-height_m)) if False else (z1, z2)
    # Use observation at z=0, prism from z1 to z2 positive down
    acc = 0.0
    for i, x in enumerate(gx):
        for j, y in enumerate(gy):
            for k, z in enumerate((z1, z2)):
                r = math.sqrt(x * x + y * y + z * z)
                if r == 0.0:
                    continue
                sign = (-1) ** (i + j + k)
                acc += sign * (
                    x * math.log(y + r + 1e-12)
                    + y * math.log(x + r + 1e-12)
                    - z * math.atan2(x * y, z * r + 1e-12)
                )
    gz_ms2 = G_SI * rho * acc
    return gz_ms2 * 1.0e5


def terrain_correction_prisms(east, north, height, dem: Grid, density_gcc: float = 2.67, max_radius_m: float = 20000.0) -> np.ndarray:
    """Nagy prism terrain correction out to max_radius_m. DEM z is metres."""
    east = np.asarray(east, float)
    north = np.asarray(north, float)
    height = np.asarray(height, float)
    dem_z = dem.masked()
    xs = dem.x_centres()
    ys = dem.y_centres()
    out = np.zeros(east.shape, dtype=float)
    halfx = dem.dx / 2.0
    halfy = dem.dy / 2.0
    for n, (e, nrt, h) in enumerate(zip(east.ravel(), north.ravel(), height.ravel())):
        if not (np.isfinite(e) and np.isfinite(nrt) and np.isfinite(h)):
            out.ravel()[n] = np.nan
            continue
        tc = 0.0
        for iy, y in enumerate(ys):
            if abs(y - nrt) > max_radius_m:
                continue
            for ix, x in enumerate(xs):
                if abs(x - e) > max_radius_m:
                    continue
                z_dem = dem_z[iy, ix]
                if not np.isfinite(z_dem):
                    continue
                if abs(x - e) < dem.dx * 0.25 and abs(y - nrt) < dem.dy * 0.25:
                    continue
                z_top = min(h, z_dem)
                z_bot = max(h, z_dem)
                if abs(z_bot - z_top) < 1e-6:
                    continue
                # prism from station horizontal plane: depths positive down
                z1 = 0.0
                z2 = z_dem - h
                if abs(z2) < 1e-6:
                    continue
                if z2 < 0:
                    z1, z2 = z2, 0.0
                tc += prism_gz(e, nrt, 0.0, x - halfx, x + halfx, y - halfy, y + halfy, z1, z2, density_gcc)
        out.ravel()[n] = tc
    return out.reshape(east.shape)


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
