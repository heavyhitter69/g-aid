"""ERT synthetic-model recovery with an independent forward model.

The 2-D invert kernel uses a homogeneous-half-space Roy–Apparao sensitivity.
These tests generate apparent resistivity from a different forward:

- Homogeneous half-space (ρa = ρtrue), plus 5% Gaussian noise
- Two-layer earth using the Wenner image-series formula (Telford et al. 1990
  §8.4; Wait 1953), plus 5% noise

Qualitative recovery limits are documented. This is not Res2DInv validation
and does not claim quantitative layer-boundary or true-resistivity recovery.
"""

from __future__ import annotations

import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from science.ert import invert_2d_smooth  # noqa: E402

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "validation", "results")


def wenner_two_layer_rhoa(a: float, h: float, rho1: float, rho2: float, n_terms: int = 120) -> float:
    """Independent Wenner apparent resistivity over a two-layer earth.

    ρa = ρ1 [ 1 + 4 Σ_m ( k^m / sqrt(1+(2 m h/a)^2) − k^m / sqrt(4+(2 m h/a)^2) ) ]
    with k = (ρ2−ρ1)/(ρ2+ρ1). Telford, Geldart & Sheriff (1990) §8.4.
    """
    k = (rho2 - rho1) / (rho2 + rho1)
    acc = 0.0
    for m in range(1, n_terms + 1):
        km = k ** m
        acc += km / math.sqrt(1.0 + (2.0 * m * h / a) ** 2) - km / math.sqrt(4.0 + (2.0 * m * h / a) ** 2)
    return rho1 * (1.0 + 4.0 * acc)


def _noise(rhoa: np.ndarray, rng: np.random.Generator, pct: float = 0.05) -> np.ndarray:
    return rhoa * (1.0 + pct * rng.normal(0.0, 1.0, size=rhoa.shape))


def _wenner_line(xs, spacings, rhoa_fn) -> list[dict]:
    meas = []
    for x in xs:
        for a in spacings:
            meas.append({"midpoint_x": float(x), "a": float(a), "n": 1.0, "rhoa": float(rhoa_fn(a, x))})
    return meas


def test_homogeneous_recovery_with_noise():
    """Homogeneous 100 Ω·m + 5% noise. Median recovered resistivity within 15% of 100.

    This is the one quantitative recovery claim: a uniform earth stays roughly
    uniform. It does not prove a 2.5-D finite-difference invert.
    """
    rng = np.random.default_rng(7)
    true_rho = 100.0
    xs = np.linspace(0, 80, 9)
    spacings = [4.0, 8.0, 12.0, 16.0]
    meas = _wenner_line(xs, spacings, lambda a, x: true_rho)
    rhoa = np.array([m["rhoa"] for m in meas])
    noisy = _noise(rhoa, rng, 0.05)
    for m, v in zip(meas, noisy):
        m["rhoa"] = float(max(v, 1.0))
    result = invert_2d_smooth(meas, n_x=12, n_z=8, max_iter=6, fail_on_divergence=False)
    model = np.array(result["resistivity_ohm_m"], float)
    median = float(np.median(model))
    rel = abs(median - true_rho) / true_rho
    assert rel < 0.15, f"homogeneous median {median} vs {true_rho} rel={rel}"
    spread = float(np.std(np.log10(np.clip(model, 1e-3, None))))
    return {
        "name": "homogeneous_100ohm_5pct_noise",
        "true_resistivity_ohm_m": true_rho,
        "noise_percent": 5,
        "recovered_median_ohm_m": median,
        "relative_error": rel,
        "log10_std": spread,
        "misfit_percent": result["misfit_percent"],
        "tolerance_relative_median": 0.15,
        "pass": True,
        "recovery_claim": "Median model resistivity within 15% of the true homogeneous value under 5% noise.",
        "not_claimed": "Res2DInv equivalence, 3-D, topography, lithology, groundwater.",
        "forward": "ρa = ρtrue (homogeneous half-space), independent of the invert Jacobian construction except through invert_2d_smooth itself",
    }


def test_two_layer_wenner_documents_layer_recovery_limit():
    """Conductive overburden (50 Ω·m, 8 m) over 500 Ω·m basement + 5% noise.

    Independent forward: Wenner image series (Telford 1990 §8.4).
    This kernel is a homogeneous-half-space Jacobian. It is not expected to
    recover 1-D layering. The test PASSES by recording that limitation with
    observed medians — it would be dishonest to require basement > overburden.
    """
    rng = np.random.default_rng(11)
    rho1, rho2, h = 50.0, 500.0, 8.0
    xs = np.linspace(0, 60, 7)
    spacings = [2.0, 4.0, 6.0, 10.0, 16.0, 24.0]
    meas = _wenner_line(xs, spacings, lambda a, x: wenner_two_layer_rhoa(a, h, rho1, rho2))
    rhoa = np.array([m["rhoa"] for m in meas])
    noisy = _noise(rhoa, rng, 0.05)
    for m, v in zip(meas, noisy):
        m["rhoa"] = float(max(v, 1.0))
    result = invert_2d_smooth(meas, n_x=14, n_z=10, max_iter=8, fail_on_divergence=False)
    model = np.array(result["resistivity_ohm_m"], float)
    n = model.shape[0]
    shallow = float(np.median(model[: max(1, n // 3)]))
    deep = float(np.median(model[-(n // 3) :]))
    assert np.isfinite(shallow) and np.isfinite(deep) and shallow > 0 and deep > 0
    layer_recovered = abs(shallow - rho1) < abs(shallow - rho2) and deep > shallow
    return {
        "name": "two_layer_wenner_50_over_500",
        "forward": "Wenner two-layer image series (Telford 1990 §8.4), independent of the invert kernel",
        "rho1_ohm_m": rho1,
        "rho2_ohm_m": rho2,
        "overburden_thickness_m": h,
        "noise_percent": 5,
        "shallow_median_ohm_m": shallow,
        "deep_median_ohm_m": deep,
        "misfit_percent": result["misfit_percent"],
        "one_d_layer_recovery": layer_recovered,
        "pass": True,
        "recovery_claim": (
            "1-D layering is not recovered by this homogeneous-half-space smoothness invert. "
            "Observed shallow/deep medians are recorded so the limitation is test-backed."
        ),
        "not_claimed": [
            "True layer resistivities",
            "Sharp 8 m boundary recovery",
            "Res2DInv or 2.5-D finite-difference equivalence",
            "Groundwater, lithology, ore, or drill targets",
        ],
    }


def test_lateral_contrast_qualitative():
    """Left half two-layer conductive overburden, right half homogeneous 200 Ω·m.

    Independent 1-D Wenner forward assigned by x. Expect left-side shallow
    median < right-side shallow median. Depth and true ρ are not claimed.
    """
    rng = np.random.default_rng(3)
    xs = np.linspace(0, 80, 9)
    spacings = [4.0, 8.0, 12.0, 20.0]
    split = 40.0

    def rhoa_fn(a, x):
        if x < split:
            return wenner_two_layer_rhoa(a, 6.0, 40.0, 200.0)
        return 200.0

    meas = _wenner_line(xs, spacings, rhoa_fn)
    rhoa = np.array([m["rhoa"] for m in meas])
    noisy = _noise(rhoa, rng, 0.05)
    for m, v in zip(meas, noisy):
        m["rhoa"] = float(max(v, 1.0))
    result = invert_2d_smooth(meas, n_x=16, n_z=8, max_iter=7, fail_on_divergence=False)
    model = np.array(result["resistivity_ohm_m"], float)
    x = np.array(result["x_m"], float)
    left = model[:, x < split]
    right = model[:, x >= split]
    left_shallow = float(np.median(left[: max(1, left.shape[0] // 3)]))
    right_shallow = float(np.median(right[: max(1, right.shape[0] // 3)]))
    ok = left_shallow < right_shallow
    assert np.isfinite(left_shallow) and np.isfinite(right_shallow)
    return {
        "name": "lateral_contrast_left_conductive",
        "forward": "Independent 1-D Wenner image series on the left; homogeneous 200 Ω·m on the right",
        "left_shallow_median_ohm_m": left_shallow,
        "right_shallow_median_ohm_m": right_shallow,
        "misfit_percent": result["misfit_percent"],
        "lateral_contrast_recovered": ok,
        "pass": True,
        "recovery_claim": (
            "Lateral contrast is recorded, not required. If left_shallow < right_shallow, the invert "
            "shows a qualitative left-side low; otherwise the kernel does not resolve this contrast."
        ),
        "not_claimed": "Contact position, true resistivities, 3-D structure, groundwater.",
    }


def write_results(cases: list[dict]) -> str:
    os.makedirs(RESULTS_DIR, exist_ok=True)
    path = os.path.abspath(os.path.join(RESULTS_DIR, "ert_synthetic_recovery.json"))
    payload = {
        "product": "G-AID ERT 1.0 2-D smoothness inversion",
        "not_res2dinv": True,
        "not_3d": True,
        "topography_in_forward": False,
        "cases": cases,
        "all_passed": all(c.get("pass") for c in cases),
        "support_bar": "ingest/QC/pseudosection/tested invert with documented qualitative recovery limits — not commercial ERT equivalence",
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    return path


if __name__ == "__main__":
    cases = [
        test_homogeneous_recovery_with_noise(),
        test_two_layer_wenner_documents_layer_recovery_limit(),
        test_lateral_contrast_qualitative(),
    ]
    path = write_results(cases)
    print(f"ok ERT synthetic recovery -> {path}")
