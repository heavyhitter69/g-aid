"""Gravity reductions.

Normal gravity (WGS-84 / Somigliana): Moritz (2000) Geodetic Reference System 1980.
Free-air:      Δg_FA = g_obs − γ + 0.3086 h            (mGal, h in metres)
Simple Bouguer: Δg_B  = Δg_FA − 2πGρ h                 (Bullard A)
Bullard B:     closed-form spherical cap (LaFehr 1991)
Terrain:       rectangular prisms (Nagy 1966) in documented radial zones on a
               bound DEM. Near-zone uses native cells. Intermediate- and far-zone
               rings may use aggregated cells. This is never labelled a Complete
               Bouguer Anomaly unless every implemented convention gate is met
               (they are not: no atmospheric term, no global DEM download, planar
               Nagy, optional Bullard B only).


G = 6.67430e-11 m³ kg⁻¹ s⁻².  2πG in mGal/m per g cm⁻³ = 0.041908.

Hayford–Bowie outer radius (zone O) is 166.7 km. G-AID does not download a
global DEM; far-zone beyond the bound DEM is skipped, not invented.
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
HAYFORD_BOWIE_OUTER_M = 166_700.0  # 166.7 km, Hayford–Bowie outer (zone O)
DEFAULT_OUTER_CELL_M = 500.0


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


def cylinder_gz_on_axis(radius_m: float, z1: float, z2: float, density_gcc: float) -> float:
    """On-axis gz of a vertical circular cylinder, mGal.

    Observer at the origin. z positive down (same as Nagy). Independent of the
    prism kernel. Closed form: 2πGρ [(z2 − √(R²+z2²)) − (z1 − √(R²+z1²))].
    """
    if density_gcc is None:
        raise ValueError("Cylinder density is required. I will not assume 2.67 g/cm³.")
    rho = float(density_gcc) * 1000.0
    r = float(radius_m)

    def term(z: float) -> float:
        return z - math.sqrt(r * r + z * z)

    gz = 2.0 * math.pi * G_SI * rho * (term(float(z2)) - term(float(z1)))
    return gz * 1.0e5


def aggregate_dem(dem: Grid, factor: int) -> Grid:
    """Block-mean a DEM so outer-zone Nagy rings stay tractable.

    Each output cell is the mean of factor×factor input cells and is treated as
    one larger rectangular prism. This is a documented approximation, not a
    spherical-Earth far-zone theory.
    """
    factor = max(1, int(factor))
    if factor == 1:
        return dem
    z = dem.masked()
    ny, nx = z.shape
    out_ny = max(1, ny // factor)
    out_nx = max(1, nx // factor)
    cropped = z[: out_ny * factor, : out_nx * factor]
    blocks = cropped.reshape(out_ny, factor, out_nx, factor)
    with np.errstate(all="ignore"):
        mean = np.nanmean(blocks, axis=(1, 3))
    return Grid(
        values=np.where(np.isfinite(mean), mean, dem.nodata),
        x0=dem.x0,
        y0=dem.y0,
        dx=dem.dx * factor,
        dy=dem.dy * factor,
        nodata=dem.nodata,
        crs_epsg=dem.crs_epsg,
        units=dem.units,
        name=f"{dem.name}_agg{factor}",
        metadata={**(dem.metadata or {}), "aggregate_factor": factor},
    )


def terrain_correction_prisms(
    east,
    north,
    height,
    dem: Grid,
    density_gcc: float,
    max_radius_m: float,
    min_radius_m: float = 0.0,
) -> dict:
    """Nagy prism terrain correction inside a radial annulus.

    Each DEM cell is a rectangular prism of the mass difference between the DEM
    surface and the station slab plane. TC = |gz| so both hills and valleys
    add a positive correction. Planar geometry. Spherical far-zone treatment
    and Hayford–Bowie compartments are not implemented.

    min_radius_m < r ≤ max_radius_m selects the ring. Near-zone is min=0.
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
    r_min = max(0.0, float(min_radius_m))
    out = np.zeros(east.shape, dtype=float)
    coverage = np.full(east.shape, np.nan, dtype=float)
    cells_used = np.zeros(east.shape, dtype=int)
    for n, (e, nrt, h) in enumerate(zip(east.ravel(), north.ravel(), height.ravel())):
        if not (np.isfinite(e) and np.isfinite(nrt) and np.isfinite(h)):
            out.ravel()[n] = np.nan
            continue
        dist = np.hypot(xx - e, yy - nrt)
        if r_min <= 0:
            inside = dist <= radius
        else:
            inside = (dist <= radius) & (dist > r_min)
        valid = inside & np.isfinite(dem_z)
        n_inside = int(np.count_nonzero(inside))
        n_valid = int(np.count_nonzero(valid))
        coverage.ravel()[n] = (n_valid / n_inside) if n_inside else 0.0
        cells_used.ravel()[n] = n_valid
        if n_valid == 0:
            out.ravel()[n] = 0.0 if n_inside == 0 else np.nan
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
        "min_radius_m": r_min,
        "density_gcc": float(density_gcc),
        "method": "Nagy 1966 rectangular prisms, planar annulus",
        "cellsize_m": float(dem.dx),
    }


def zoned_terrain_correction(
    east,
    north,
    height,
    dem: Grid,
    density_gcc: float,
    near_radius_m: float,
    intermediate_radius_m: float | None = None,
    far_radius_m: float | None = None,
    outer_cell_m: float = DEFAULT_OUTER_CELL_M,
    apply_intermediate: bool = False,
    apply_far: bool = False,
) -> dict:
    """Near / intermediate / far Nagy rings on one bound DEM. No DEM download.

    Intermediate default outer radius is Hayford–Bowie 166.7 km, clipped to the
    DEM. Far-zone beyond that radius is applied only when the bound DEM actually
    covers the requested far radius. Atmospheric correction is not applied.
    complete_bouguer is always false.
    """
    near = terrain_correction_prisms(east, north, height, dem, density_gcc, near_radius_m, min_radius_m=0.0)
    east_a = np.asarray(east, float)
    north_a = np.asarray(north, float)
    xs = dem.x_centres()
    ys = dem.y_centres()
    dem_span = 0.5 * math.hypot(float(xs[-1] - xs[0]) if len(xs) else 0.0, float(ys[-1] - ys[0]) if len(ys) else 0.0)
    r_int_req = float(intermediate_radius_m) if intermediate_radius_m else HAYFORD_BOWIE_OUTER_M
    r_far_req = float(far_radius_m) if far_radius_m else None
    r_int_eff = min(r_int_req, max(float(near_radius_m), dem_span))
    target_cell = max(dem.dx, float(outer_cell_m) if outer_cell_m else DEFAULT_OUTER_CELL_M)
    factor = max(1, int(round(target_cell / max(dem.dx, 1e-6))))
    # Keep enough cells that an outer ring stays resolved on small bound DEMs.
    max_factor = max(1, min(dem.nx, dem.ny) // 16) if min(dem.nx, dem.ny) >= 16 else 1
    factor = max(1, min(factor, max_factor))
    outer_dem = aggregate_dem(dem, factor) if (apply_intermediate or apply_far) else dem

    intermediate = {
        "applied": False,
        "reason": "not requested",
        "terrain_correction_mgal": np.zeros(east_a.shape, dtype=float),
        "coverage_fraction": np.full(east_a.shape, np.nan),
        "radius_m": r_int_req,
        "effective_radius_m": r_int_eff,
        "hayford_bowie_outer_m": HAYFORD_BOWIE_OUTER_M,
        "cellsize_m": float(outer_dem.dx),
        "aggregate_factor": factor,
    }
    if apply_intermediate:
        if r_int_eff <= float(near_radius_m) * 1.001:
            intermediate["reason"] = (
                f"Bound DEM does not extend beyond the near-zone radius {near_radius_m} m. "
                "Intermediate-zone terrain was not invented."
            )
        else:
            ring = terrain_correction_prisms(
                east, north, height, outer_dem, density_gcc, r_int_eff, min_radius_m=float(near_radius_m)
            )
            cov = float(np.nanmean(ring["coverage_fraction"])) if np.isfinite(ring["coverage_fraction"]).any() else 0.0
            intermediate.update(ring)
            intermediate["effective_radius_m"] = r_int_eff
            intermediate["hayford_bowie_outer_m"] = HAYFORD_BOWIE_OUTER_M
            intermediate["aggregate_factor"] = factor
            if cov < 0.95:
                intermediate["applied"] = False
                intermediate["reason"] = (
                    f"Intermediate-zone DEM coverage {cov:.3f} < 0.95 inside {float(near_radius_m)}–{r_int_eff} m. "
                    "The annulus is incomplete; intermediate TC is not applied."
                )
                intermediate["terrain_correction_mgal"] = np.zeros(east_a.shape, dtype=float)
            else:
                intermediate["applied"] = True
                intermediate["reason"] = (
                    f"Planar Nagy annulus {float(near_radius_m)}–{r_int_eff} m on aggregated DEM "
                    f"(cell {outer_dem.dx:.1f} m). Hayford–Bowie compartments are not implemented."
                )
            intermediate["coverage_mean"] = cov

    far = {
        "applied": False,
        "reason": "not requested",
        "terrain_correction_mgal": np.zeros(east_a.shape, dtype=float),
        "coverage_fraction": np.full(east_a.shape, np.nan),
        "radius_m": r_far_req,
        "hayford_bowie_outer_m": HAYFORD_BOWIE_OUTER_M,
        "cellsize_m": float(outer_dem.dx),
        "aggregate_factor": factor,
    }
    r_far_inner = max(r_int_eff if intermediate.get("applied") else float(near_radius_m), HAYFORD_BOWIE_OUTER_M)
    if apply_far:
        if r_far_req is None:
            far["reason"] = "farRadiusM is required. G-AID will not assume a global terrain radius or download ETOPO/SRTM."
        elif r_far_req <= r_far_inner:
            far["reason"] = (
                f"farRadiusM {r_far_req} m does not extend beyond the Hayford–Bowie outer radius "
                f"{HAYFORD_BOWIE_OUTER_M} m (or the applied intermediate outer radius)."
            )
        elif dem_span + 1e-6 < r_far_req:
            far["reason"] = (
                f"Bound DEM half-span {dem_span:.1f} m does not cover farRadiusM {r_far_req} m. "
                "Far-zone terrain was not invented. G-AID does not download a global DEM."
            )
        else:
            ring = terrain_correction_prisms(
                east, north, height, outer_dem, density_gcc, float(r_far_req), min_radius_m=r_far_inner
            )
            cov = float(np.nanmean(ring["coverage_fraction"])) if np.isfinite(ring["coverage_fraction"]).any() else 0.0
            far.update(ring)
            far["aggregate_factor"] = factor
            if cov < 0.95:
                far["applied"] = False
                far["reason"] = (
                    f"Far-zone DEM coverage {cov:.3f} < 0.95 inside {r_far_inner}–{r_far_req} m. Far TC is not applied."
                )
                far["terrain_correction_mgal"] = np.zeros(east_a.shape, dtype=float)
            else:
                far["applied"] = True
                far["reason"] = (
                    f"Planar Nagy annulus {r_far_inner}–{r_far_req} m on aggregated DEM. "
                    "Spherical-Earth far-zone theory and atmospheric correction are excluded."
                )
            far["coverage_mean"] = cov

    tc_near = near["terrain_correction_mgal"]
    tc_int = intermediate["terrain_correction_mgal"]
    tc_far = far["terrain_correction_mgal"]
    complete = False  # atmospheric missing; spherical far-zone missing unless gates pass — they do not
    return {
        "near": near,
        "intermediate": intermediate,
        "far": far,
        "terrain_correction_mgal": tc_near + tc_int + tc_far,
        "near_terrain_correction_mgal": tc_near,
        "intermediate_terrain_correction_mgal": tc_int,
        "far_terrain_correction_mgal": tc_far,
        "complete_bouguer": complete,
        "atmospheric_correction": False,
        "spherical_earth": False,
        "hayford_bowie_compartments": False,
        "dem_download": False,
        "convention": (
            "Near-zone terrain-corrected Bouguer uses Nagy 1966 planar prisms on a bound DEM "
            "(native cells 0–R_near). Intermediate and far rings are optional, aggregated, "
            "and skipped when the DEM does not cover them. Far-zone beyond 166.7 km is never "
            "downloaded. Spherical far-zone treatment, Hayford–Bowie geometry, global coverage, "
            "and atmospheric correction are excluded."
        ),
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
