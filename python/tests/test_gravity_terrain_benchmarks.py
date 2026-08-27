"""Independent / reference benchmarks for the Nagy prism terrain kernel.

These tests do not reuse the production prism_gz implementation as the oracle.
Tolerances are documented next to each case. Density is never defaulted.

References:
- Nagy, D., 1966, The gravitational attraction of a right rectangular prism:
  Geophysics, 31, 362–371.
- Newton's law volume integral of gz = G ρ ∭ z r^{-3} dV (observer at origin,
  z positive downward, matching the production sign convention).
- Infinite-slab closed form 2πGρh (Bullard A), used only as a wide-prism limit.
- LaFehr, T.R., 1991, An exact solution for the gravity curvature (Bullard B)
  correction: Geophysics, 56, 1179–1184 (small-h expansion 2πGρ h²/R).
"""

from __future__ import annotations

import json
import math
import os
import sys

import numpy as np
from numpy.polynomial.legendre import leggauss

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from science.gravity import (  # noqa: E402
    G_SI,
    TWO_PI_G_MGAL,
    bullard_b,
    prism_gz_vectorized,
    terrain_correction_prisms,
)
from science.grid import Grid  # noqa: E402

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "validation", "results")


def independent_newton_prism_gz(x1, x2, y1, y2, z1, z2, density_gcc: float, order: int = 24) -> float:
    """Gauss–Legendre volume integral of G ρ z / r³. Independent of Nagy's closed form."""
    nodes, weights = leggauss(order)
    rho = float(density_gcc) * 1000.0

    def mapped(a, b, t):
        return 0.5 * (b - a) * t + 0.5 * (a + b), 0.5 * (b - a)

    acc = 0.0
    for i, wx in enumerate(weights):
        x, jx = mapped(x1, x2, nodes[i])
        for j, wy in enumerate(weights):
            y, jy = mapped(y1, y2, nodes[j])
            for k, wz in enumerate(weights):
                z, jz = mapped(z1, z2, nodes[k])
                r2 = x * x + y * y + z * z
                if r2 < 1e-18:
                    continue
                r = math.sqrt(r2)
                acc += wx * wy * wz * jx * jy * jz * (z / (r ** 3))
    return G_SI * rho * acc * 1.0e5  # mGal


def nagy_closed_form_rewritten(x1, x2, y1, y2, z1, z2, density_gcc: float) -> float:
    """Nagy 1966 eight-corner evaluation written from the paper, not the production kernel."""
    rho = float(density_gcc) * 1000.0
    acc = 0.0
    corners = (
        (x1, y1, z1, 1),
        (x1, y1, z2, -1),
        (x1, y2, z1, -1),
        (x1, y2, z2, 1),
        (x2, y1, z1, -1),
        (x2, y1, z2, 1),
        (x2, y2, z1, 1),
        (x2, y2, z2, -1),
    )
    for x, y, z, sign in corners:
        r = math.sqrt(x * x + y * y + z * z)
        acc += sign * (
            x * math.log(max(y + r, 1e-12))
            + y * math.log(max(x + r, 1e-12))
            - z * math.atan2(x * y, z * r + 1e-12)
        )
    return G_SI * rho * acc * 1.0e5


def _rel(obs, exp):
    return abs(obs - exp) / max(abs(exp), 1e-9)


def test_nagy_vs_independent_newton_and_rewritten_closed_form():
    """Prism well away from the observer: Nagy vs Newton integral vs rewritten closed form.

    Tolerance: |Δ| ≤ 0.02 mGal or relative 1.5%, whichever is larger, vs Newton.
    Rewritten closed form must match production to 1e-4 mGal (same formula, different code).
    """
    geom = dict(x1=40.0, x2=90.0, y1=10.0, y2=40.0, z1=12.0, z2=40.0)
    rho = 2.67
    prod = float(prism_gz_vectorized(geom["x1"], geom["x2"], geom["y1"], geom["y2"], geom["z1"], geom["z2"], rho))
    newton = independent_newton_prism_gz(**geom, density_gcc=rho, order=28)
    rewritten = nagy_closed_form_rewritten(**geom, density_gcc=rho)
    west = dict(x1=-90.0, x2=-40.0, y1=10.0, y2=40.0, z1=12.0, z2=40.0)
    prod_w = float(prism_gz_vectorized(west["x1"], west["x2"], west["y1"], west["y2"], west["z1"], west["z2"], rho))
    newton_w = independent_newton_prism_gz(**west, density_gcc=rho, order=28)
    tol = max(0.005, 0.01 * abs(newton))
    assert abs(prod - newton) <= tol, f"Nagy {prod} vs Newton {newton} Δ={prod - newton} tol={tol}"
    assert abs(prod - rewritten) <= 1e-4, f"production {prod} vs rewritten Nagy {rewritten}"
    assert abs(prod_w - newton_w) <= max(0.005, 0.01 * abs(newton_w)), f"west Nagy {prod_w} vs Newton {newton_w}"
    return {
        "name": "single_prism_nagy_vs_newton",
        "density_gcc": rho,
        "geometry_m": geom,
        "production_mgal": prod,
        "independent_newton_mgal": newton,
        "rewritten_nagy_mgal": rewritten,
        "west_octant_production_mgal": prod_w,
        "west_octant_newton_mgal": newton_w,
        "tolerance_mgal": tol,
        "pass": True,
        "oracle": "Gauss–Legendre Newton volume integral; rewritten Nagy 1966 eight-corner form",
    }


def test_wide_prism_approaches_infinite_slab_analytic():
    """A very wide, thin prism of thickness H approaches the Bullard-A slab 2πGρH.

    Oracle is the analytic infinite-slab formula, not the terrain-correction loop.
    Tolerance: relative 6% for a 20 km-wide, 20 m-thick prism observed 0.1 m above the top.
    """
    h = 20.0
    rho = 2.67
    half = 10000.0
    # Observer at origin; prism from z=0.1 to 20.1 (entirely below, 0.1 m air gap avoided).
    prod = float(prism_gz_vectorized(-half, half, -half, half, 0.1, 0.1 + h, rho))
    expected = TWO_PI_G_MGAL * rho * h
    rel = _rel(prod, expected)
    assert rel < 0.06, f"wide prism {prod} vs slab {expected} rel={rel}"
    return {
        "name": "wide_prism_vs_analytic_slab",
        "density_gcc": rho,
        "thickness_m": h,
        "half_width_m": half,
        "production_mgal": prod,
        "analytic_slab_mgal": expected,
        "relative_error": rel,
        "tolerance_relative": 0.06,
        "pass": True,
        "oracle": "Infinite slab 2πGρh (Bullard A)",
    }


def test_bullard_b_small_height_expansion():
    """LaFehr small-h expansion: BB ≈ 2πGρ h²/R for |h| << R.

    Tolerance: relative 1% at h=200 m, R=6371000 m.
    """
    h = 200.0
    rho = 2.67
    r = 6371000.0
    bb = float(bullard_b(h, rho, r))
    expected = TWO_PI_G_MGAL * rho * h * (h / r)
    rel = _rel(bb, expected)
    assert rel < 0.01, f"Bullard B {bb} vs small-h {expected} rel={rel}"
    return {
        "name": "bullard_b_lafehr_small_h",
        "density_gcc": rho,
        "height_m": h,
        "earth_radius_m": r,
        "production_mgal": bb,
        "small_h_expansion_mgal": expected,
        "relative_error": rel,
        "tolerance_relative": 0.01,
        "pass": True,
        "oracle": "LaFehr 1991 small-h expansion 2πGρ h²/R",
    }


def test_single_dem_cell_matches_independent_prism():
    """One DEM cell's terrain correction equals |independent Nagy| of that prism.

    Tolerance: 1e-3 mGal.
    """
    cell = 20.0
    h_dem = 40.0
    h_sta = 10.0
    rho = 2.40
    dem = Grid(
        values=np.array([[h_dem]], float),
        x0=-cell / 2,
        y0=-cell / 2,
        dx=cell,
        dy=cell,
        crs_epsg=32630,
        units="m",
        name="one-cell",
    )
    out = terrain_correction_prisms(np.array([0.0]), np.array([0.0]), np.array([h_sta]), dem, density_gcc=rho, max_radius_m=50.0)
    tc = float(out["terrain_correction_mgal"][0])
    z_rel = h_dem - h_sta
    independent = abs(
        nagy_closed_form_rewritten(-cell / 2, cell / 2, -cell / 2, cell / 2, min(z_rel, 0.0), max(z_rel, 0.0), rho)
    )
    assert abs(tc - independent) < 1e-3, f"TC {tc} vs independent prism {independent}"
    return {
        "name": "one_dem_cell_vs_independent_prism",
        "density_gcc": rho,
        "tc_mgal": tc,
        "independent_prism_mgal": independent,
        "tolerance_mgal": 1e-3,
        "pass": True,
        "oracle": "Rewritten Nagy 1966 for the same rectangular cell",
    }


def write_results(cases: list[dict]) -> str:
    os.makedirs(RESULTS_DIR, exist_ok=True)
    path = os.path.abspath(os.path.join(RESULTS_DIR, "gravity_terrain_benchmarks.json"))
    payload = {
        "product_name": "near-zone terrain-corrected Bouguer anomaly",
        "not_complete_bouguer": True,
        "kernel": "Nagy 1966 rectangular prisms, near-zone only",
        "far_zone": False,
        "intermediate_zone": False,
        "cases": cases,
        "all_passed": all(c.get("pass") for c in cases),
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    return path


if __name__ == "__main__":
    cases = [
        test_nagy_vs_independent_newton_and_rewritten_closed_form(),
        test_wide_prism_approaches_infinite_slab_analytic(),
        test_bullard_b_small_height_expansion(),
        test_single_dem_cell_matches_independent_prism(),
    ]
    path = write_results(cases)
    print(f"ok gravity terrain independent benchmarks -> {path}")
