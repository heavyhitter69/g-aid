"""Nagy 1966 terrain-correction fixtures. Density is never defaulted."""

from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from science.gravity import TWO_PI_G_MGAL, terrain_correction_prisms
from science.grid import Grid


def _plateau(extent_m: float, cell: float, height: float) -> Grid:
    n = int(round(2 * extent_m / cell))
    values = np.full((n, n), height, dtype=float)
    return Grid(values=values, x0=-extent_m, y0=-extent_m, dx=cell, dy=cell, crs_epsg=32630, units="m", name="plateau")


def test_flat_dem_tc_is_zero():
    dem = _plateau(400.0, 20.0, 120.0)
    out = terrain_correction_prisms(
        np.array([0.0]),
        np.array([0.0]),
        np.array([120.0]),
        dem,
        density_gcc=2.67,
        max_radius_m=250.0,
    )
    tc = float(out["terrain_correction_mgal"][0])
    assert abs(tc) < 1e-4, tc


def test_wide_plateau_approaches_slab():
    h = 100.0
    rho = 2.67
    dem = _plateau(2500.0, 50.0, h)
    out = terrain_correction_prisms(
        np.array([0.0]),
        np.array([0.0]),
        np.array([0.0]),
        dem,
        density_gcc=rho,
        max_radius_m=2000.0,
    )
    tc = float(out["terrain_correction_mgal"][0])
    expected = TWO_PI_G_MGAL * rho * h
    rel = abs(tc - expected) / expected
    assert rel < 0.08, f"TC {tc} vs slab {expected} rel={rel}"


def test_density_required():
    dem = _plateau(100.0, 20.0, 10.0)
    try:
        terrain_correction_prisms(np.array([0.0]), np.array([0.0]), np.array([0.0]), dem, density_gcc=None, max_radius_m=50.0)
        raise AssertionError("density must be required")
    except (TypeError, ValueError) as exc:
        assert "2.67" in str(exc) or "density" in str(exc).lower()


def test_radius_required():
    dem = _plateau(100.0, 20.0, 10.0)
    try:
        terrain_correction_prisms(np.array([0.0]), np.array([0.0]), np.array([0.0]), dem, density_gcc=2.67, max_radius_m=0)
        raise AssertionError("radius must be positive")
    except ValueError as exc:
        assert "radius" in str(exc).lower()


if __name__ == "__main__":
    test_flat_dem_tc_is_zero()
    test_wide_plateau_approaches_slab()
    test_density_required()
    test_radius_required()
    print("ok gravity terrain Nagy fixtures")
