"""Independent checks for intermediate- and far-zone planar Nagy rings.

These tests do not treat production terrain_correction_prisms as the oracle for
the cylinder case. Annulus additivity is an internal consistency check.
Complete Bouguer remains false in every case.
"""

from __future__ import annotations

import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from science.gravity import (  # noqa: E402
    HAYFORD_BOWIE_OUTER_M,
    cylinder_gz_on_axis,
    terrain_correction_prisms,
    zoned_terrain_correction,
)
from science.grid import Grid  # noqa: E402

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "validation", "results")


def _plateau(extent_m: float, cell: float, height: float) -> Grid:
    n = int(round(2 * extent_m / cell))
    values = np.full((n, n), height, dtype=float)
    return Grid(values=values, x0=-extent_m, y0=-extent_m, dx=cell, dy=cell, crs_epsg=32630, units="m", name="plateau")


def _rel(obs, exp):
    return abs(obs - exp) / max(abs(exp), 1e-9)


def test_annulus_equals_difference_of_disks():
    """TC(R2) − TC(R1) equals the annulus R1 < r ≤ R2. Tolerance 1e-6 mGal."""
    dem = _plateau(400.0, 20.0, 80.0)
    rho = 2.40
    r1, r2 = 80.0, 200.0
    full = terrain_correction_prisms(np.array([0.0]), np.array([0.0]), np.array([0.0]), dem, rho, max_radius_m=r2)
    inner = terrain_correction_prisms(np.array([0.0]), np.array([0.0]), np.array([0.0]), dem, rho, max_radius_m=r1)
    ring = terrain_correction_prisms(
        np.array([0.0]), np.array([0.0]), np.array([0.0]), dem, rho, max_radius_m=r2, min_radius_m=r1
    )
    tc_full = float(full["terrain_correction_mgal"][0])
    tc_inner = float(inner["terrain_correction_mgal"][0])
    tc_ring = float(ring["terrain_correction_mgal"][0])
    delta = abs((tc_inner + tc_ring) - tc_full)
    assert delta < 1e-6, f"annulus {tc_ring} + inner {tc_inner} != full {tc_full} Δ={delta}"
    return {
        "name": "annulus_equals_disk_difference",
        "tc_full_mgal": tc_full,
        "tc_inner_mgal": tc_inner,
        "tc_ring_mgal": tc_ring,
        "delta_mgal": delta,
        "tolerance_mgal": 1e-6,
        "pass": True,
        "oracle": "Additivity of disjoint planar Nagy annuli (same DEM, same density)",
    }


def test_cylinder_on_axis_vs_prism_ring():
    """Raised circular-ish ring vs closed-form vertical cylinder annulus.

    Squares ≠ circle, so tolerance is 25% relative. Oracle is cylinder_gz_on_axis,
    independent of prism_gz_vectorized.
    """
    cell = 10.0
    r_inner, r_outer = 80.0, 150.0
    h = 40.0
    rho = 2.67
    extent = 180.0
    n = int(round(2 * extent / cell))
    xs = -extent + (np.arange(n) + 0.5) * cell
    yy, xx = np.meshgrid(-extent + (np.arange(n) + 0.5) * cell, xs, indexing="ij")
    dist = np.hypot(xx, yy)
    values = np.where((dist > r_inner) & (dist <= r_outer), h, 0.0).astype(float)
    dem = Grid(values=values, x0=-extent, y0=-extent, dx=cell, dy=cell, crs_epsg=32630, units="m", name="ring")
    out = terrain_correction_prisms(
        np.array([0.0]), np.array([0.0]), np.array([0.0]), dem, rho, max_radius_m=r_outer, min_radius_m=r_inner
    )
    tc = float(out["terrain_correction_mgal"][0])
    cyl_outer = abs(cylinder_gz_on_axis(r_outer, 0.0, h, rho))
    cyl_inner = abs(cylinder_gz_on_axis(r_inner, 0.0, h, rho))
    expected = cyl_outer - cyl_inner
    rel = _rel(tc, expected)
    assert rel < 0.25, f"prism ring {tc} vs cylinder annulus {expected} rel={rel}"
    return {
        "name": "cylinder_on_axis_vs_prism_ring",
        "tc_mgal": tc,
        "cylinder_annulus_mgal": expected,
        "relative_error": rel,
        "tolerance_relative": 0.25,
        "pass": True,
        "oracle": "On-axis vertical cylinder closed form 2πGρ[(z2−√(R²+z2²))−(z1−√(R²+z1²))]",
    }


def test_flat_plateau_intermediate_is_zero():
    """Station on a flat plateau: intermediate annulus TC ≈ 0. Tolerance 1e-4 mGal."""
    dem = _plateau(400.0, 20.0, 120.0)
    zoned = zoned_terrain_correction(
        np.array([0.0]),
        np.array([0.0]),
        np.array([120.0]),
        dem,
        density_gcc=2.67,
        near_radius_m=80.0,
        intermediate_radius_m=250.0,
        apply_intermediate=True,
        apply_far=False,
    )
    tc_int = float(zoned["intermediate_terrain_correction_mgal"][0])
    assert zoned["intermediate"]["applied"] is True
    assert abs(tc_int) < 1e-4, tc_int
    assert zoned["complete_bouguer"] is False
    return {
        "name": "flat_plateau_intermediate_zero",
        "intermediate_tc_mgal": tc_int,
        "applied": True,
        "complete_bouguer": False,
        "pass": True,
        "oracle": "Zero mass difference on a constant-height DEM",
    }


def test_intermediate_applied_when_dem_extends_past_near():
    dem = _plateau(800.0, 20.0, 80.0)
    zoned = zoned_terrain_correction(
        np.array([0.0]),
        np.array([0.0]),
        np.array([0.0]),
        dem,
        density_gcc=2.40,
        near_radius_m=100.0,
        intermediate_radius_m=400.0,
        apply_intermediate=True,
        apply_far=False,
    )
    assert zoned["intermediate"]["applied"] is True, zoned["intermediate"]["reason"]
    assert zoned["far"]["applied"] is False
    assert zoned["complete_bouguer"] is False
    tc_int = float(zoned["intermediate_terrain_correction_mgal"][0])
    assert tc_int > 0.0
    return {
        "name": "intermediate_applied_covering_dem",
        "intermediate_tc_mgal": tc_int,
        "effective_radius_m": zoned["intermediate"]["effective_radius_m"],
        "complete_bouguer": False,
        "pass": True,
        "oracle": "Coverage ≥ 0.95 inside R_near–R_int on a bound plateau DEM",
    }


def test_intermediate_skipped_when_dem_only_covers_near():
    dem = _plateau(200.0, 20.0, 80.0)
    zoned = zoned_terrain_correction(
        np.array([0.0]),
        np.array([0.0]),
        np.array([0.0]),
        dem,
        density_gcc=2.40,
        near_radius_m=300.0,
        intermediate_radius_m=HAYFORD_BOWIE_OUTER_M,
        apply_intermediate=True,
        apply_far=False,
    )
    assert zoned["intermediate"]["applied"] is False
    assert float(zoned["intermediate_terrain_correction_mgal"][0]) == 0.0
    assert zoned["complete_bouguer"] is False
    return {
        "name": "intermediate_skipped_near_only_dem",
        "reason": zoned["intermediate"]["reason"],
        "complete_bouguer": False,
        "pass": True,
        "oracle": "Bound DEM does not extend beyond the near-zone radius",
    }


def test_far_skipped_without_covering_dem():
    dem = _plateau(400.0, 20.0, 80.0)
    zoned = zoned_terrain_correction(
        np.array([0.0]),
        np.array([0.0]),
        np.array([0.0]),
        dem,
        density_gcc=2.40,
        near_radius_m=100.0,
        intermediate_radius_m=HAYFORD_BOWIE_OUTER_M,
        far_radius_m=200_000.0,
        apply_intermediate=True,
        apply_far=True,
    )
    assert zoned["far"]["applied"] is False
    assert "not invented" in zoned["far"]["reason"] or "does not cover" in zoned["far"]["reason"]
    assert zoned["complete_bouguer"] is False
    assert zoned["atmospheric_correction"] is False
    assert zoned["spherical_earth"] is False
    return {
        "name": "far_skipped_without_covering_dem",
        "reason": zoned["far"]["reason"],
        "complete_bouguer": False,
        "pass": True,
        "oracle": "No DEM download; incomplete far ring is a skip, not a silent pass",
    }


def test_far_skipped_without_radius():
    dem = _plateau(400.0, 20.0, 80.0)
    zoned = zoned_terrain_correction(
        np.array([0.0]),
        np.array([0.0]),
        np.array([0.0]),
        dem,
        density_gcc=2.40,
        near_radius_m=100.0,
        apply_far=True,
        far_radius_m=None,
    )
    assert zoned["far"]["applied"] is False
    assert "farRadiusM" in zoned["far"]["reason"]
    return {
        "name": "far_skipped_without_radius",
        "reason": zoned["far"]["reason"],
        "complete_bouguer": False,
        "pass": True,
        "oracle": "farRadiusM is required; no global default",
    }


def test_far_applied_on_covering_coarse_dem():
    """Coarse plateau covering 180 km: far ring 166.7–180 km applies; still not CBA."""
    cell = 5000.0
    extent = 200_000.0
    dem = _plateau(extent, cell, 100.0)
    zoned = zoned_terrain_correction(
        np.array([0.0]),
        np.array([0.0]),
        np.array([0.0]),
        dem,
        density_gcc=2.67,
        near_radius_m=20_000.0,
        intermediate_radius_m=HAYFORD_BOWIE_OUTER_M,
        far_radius_m=180_000.0,
        outer_cell_m=5000.0,
        apply_intermediate=True,
        apply_far=True,
    )
    assert zoned["far"]["applied"] is True, zoned["far"]["reason"]
    assert zoned["complete_bouguer"] is False
    assert zoned["hayford_bowie_compartments"] is False
    tc_far = float(zoned["far_terrain_correction_mgal"][0])
    assert tc_far > 0.0
    return {
        "name": "far_applied_covering_coarse_dem",
        "far_tc_mgal": tc_far,
        "complete_bouguer": False,
        "spherical_earth": zoned["spherical_earth"],
        "hayford_bowie_compartments": False,
        "pass": True,
        "oracle": "Planar Nagy annulus beyond 166.7 km on a bound DEM that actually covers 180 km",
    }


def write_results(cases: list[dict]) -> str:
    os.makedirs(RESULTS_DIR, exist_ok=True)
    path = os.path.abspath(os.path.join(RESULTS_DIR, "gravity_zoned_terrain_benchmarks.json"))
    payload = {
        "product_name": "zoned terrain-corrected Bouguer anomaly (planar Nagy; not Complete Bouguer)",
        "not_complete_bouguer": True,
        "complete_bouguer_justified": False,
        "kernel": "Nagy 1966 rectangular prisms, planar near/intermediate/far annuli on a bound DEM",
        "hayford_bowie_compartments": False,
        "spherical_earth": False,
        "atmospheric_correction": False,
        "dem_download": False,
        "cases": cases,
        "all_passed": all(c.get("pass") for c in cases),
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    return path


if __name__ == "__main__":
    cases = [
        test_annulus_equals_difference_of_disks(),
        test_cylinder_on_axis_vs_prism_ring(),
        test_flat_plateau_intermediate_is_zero(),
        test_intermediate_applied_when_dem_extends_past_near(),
        test_intermediate_skipped_when_dem_only_covers_near(),
        test_far_skipped_without_covering_dem(),
        test_far_skipped_without_radius(),
        test_far_applied_on_covering_coarse_dem(),
    ]
    path = write_results(cases)
    print(f"ok gravity zoned terrain benchmarks -> {path}")
