"""Validation programme for experimental flat-topography ert.invert2d.

Independent oracles:
- Homogeneous half-space: ρa = ρtrue
- Two-layer Wenner: Telford 1990 §8.4 image series (not the invert Jacobian)

Self-consistent 2.5-D synthetics (same Dey–Morrison engine as the invert) are
used only for buried-target geometry, and are labelled as such.

The historical Gaussian half-space kernel's failed two-layer case is preserved.
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from science.ert import invert_2d_smooth, invert_2d_sensitivity_kernel  # noqa: E402
from science.ert_25d import (  # noqa: E402
    Forward25D,
    homogeneous_scale,
    wenner_two_layer_image_series,
)

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "docs", "validation", "results")


def _noise(rhoa: np.ndarray, rng: np.random.Generator, pct: float) -> np.ndarray:
    return rhoa * (1.0 + pct * rng.normal(0.0, 1.0, size=rhoa.shape))


def _line(xs, spacings, array: str, n: float, rhoa_fn) -> list[dict]:
    meas = []
    for x in xs:
        for a in spacings:
            meas.append(
                {
                    "midpoint_x": float(x),
                    "a": float(a),
                    "n": float(n),
                    "rhoa": float(rhoa_fn(a, x)),
                    "array": array,
                }
            )
    return meas


def _apply_noise(meas: list[dict], rng, pct: float) -> list[dict]:
    rhoa = np.array([m["rhoa"] for m in meas], float)
    noisy = _noise(rhoa, rng, pct)
    out = []
    for m, v in zip(meas, noisy):
        row = dict(m)
        row["rhoa"] = float(max(v, 1.0))
        out.append(row)
    return out


def _layer_stats(result: dict) -> tuple[float, float, np.ndarray]:
    model = np.array(result["resistivity_ohm_m"], float)
    n = model.shape[0]
    shallow = float(np.median(model[: max(1, n // 3)]))
    deep = float(np.median(model[-(n // 3) :]))
    return shallow, deep, model


def test_forward_vs_wenner_image_series():
    """2.5-D FD vs independent two-layer Wenner image series (forward only)."""
    xs = np.linspace(20, 80, 6)
    spacings = [6.0, 10.0, 16.0]
    meas = _line(xs, spacings, "wenner", 1.0, lambda a, x: 100.0)
    x_inv = np.linspace(20, 80, 8)
    z_inv = np.logspace(np.log10(1.5), np.log10(32), 6)
    scale = homogeneous_scale(meas, x_inv, z_inv, n_k=4)
    h, rho1, rho2 = 8.0, 50.0, 500.0
    rho = np.where(z_inv[:, None] < h, rho1, rho2) + np.zeros((1, len(x_inv)))
    pred = Forward25D(meas, rho, x_inv, z_inv, n_k=4).apparent_resistivities() * scale
    oracle = np.array([wenner_two_layer_image_series(m["a"], h, rho1, rho2) for m in meas])
    rel = np.abs(pred - oracle) / np.clip(oracle, 1e-6, None)
    med = float(np.median(rel))
    return {
        "name": "forward_25d_vs_wenner_image_series",
        "kind": "forward_oracle",
        "median_relative_error": med,
        "tolerance_relative": 0.30,
        "pass": med < 0.30,
        "oracle": "Wenner two-layer image series (Telford 1990 §8.4)",
        "note": "Documents 2.5-D mesh/FT error vs a closed-form 1-D forward. Invert data-fit uses this engine, not the image series.",
    }


def test_historical_gaussian_two_layer_failure():
    """Preserve the failed Gaussian-kernel two-layer case."""
    rng = np.random.default_rng(11)
    rho1, rho2, h = 50.0, 500.0, 8.0
    xs = np.linspace(0, 60, 7)
    spacings = [2.0, 4.0, 6.0, 10.0, 16.0, 24.0]
    meas = _apply_noise(
        _line(xs, spacings, "wenner", 1.0, lambda a, x: wenner_two_layer_image_series(a, h, rho1, rho2)),
        rng,
        0.05,
    )
    result = invert_2d_sensitivity_kernel(meas, n_x=14, n_z=10, max_iter=8, fail_on_divergence=False)
    shallow, deep, _ = _layer_stats(result)
    recovered = abs(shallow - rho1) < abs(shallow - rho2) and deep > shallow * 1.4
    return {
        "name": "historical_gaussian_two_layer_50_over_500",
        "kernel": "gaussian_halfspace_sensitivity",
        "forward": "Wenner two-layer image series (Telford 1990 §8.4)",
        "rho1_ohm_m": rho1,
        "rho2_ohm_m": rho2,
        "overburden_thickness_m": h,
        "shallow_median_ohm_m": shallow,
        "deep_median_ohm_m": deep,
        "one_d_layer_recovery": recovered,
        "pass": True,
        "preserved_failure": not recovered,
        "recovery_claim": "Historical kernel does not recover 1-D layering. Case retained; not deleted.",
    }


def test_homogeneous(array: str, n: float, rng_seed: int):
    rng = np.random.default_rng(rng_seed)
    true_rho = 100.0
    xs = np.linspace(10, 70, 7)
    spacings = [6.0, 10.0, 16.0]
    meas = _apply_noise(_line(xs, spacings, array, n, lambda a, x: true_rho), rng, 0.05)
    result = invert_2d_smooth(meas, n_x=8, n_z=6, max_iter=6, n_k=4, fail_on_divergence=False)
    model = np.array(result["resistivity_ohm_m"], float)
    median = float(np.median(model))
    rel = abs(median - true_rho) / true_rho
    spread = float(np.std(np.log10(np.clip(model, 1e-3, None))))
    ok = rel < 0.25 and spread < 0.35 and result["misfit_percent"] < 25
    return {
        "name": f"homogeneous_100ohm_{array}_5pct_noise",
        "array": array,
        "true_resistivity_ohm_m": true_rho,
        "recovered_median_ohm_m": median,
        "relative_error": rel,
        "log10_std": spread,
        "misfit_percent": result["misfit_percent"],
        "rms_history": result.get("rms_history"),
        "tolerance_relative_median": 0.25,
        "pass": bool(ok),
        "required_for_production": True,
        "forward": "ρa = ρtrue (independent homogeneous half-space)",
    }


def test_two_layer_independent(rho1, rho2, h, name, rng_seed: int):
    rng = np.random.default_rng(rng_seed)
    xs = np.linspace(10, 70, 8)
    spacings = [4.0, 8.0, 12.0, 20.0]
    meas = _apply_noise(
        _line(xs, spacings, "wenner", 1.0, lambda a, x: wenner_two_layer_image_series(a, h, rho1, rho2)),
        rng,
        0.05,
    )
    result = invert_2d_smooth(meas, n_x=8, n_z=8, max_iter=8, n_k=4, fail_on_divergence=False)
    shallow, deep, model = _layer_stats(result)
    polarity = (deep > shallow) if rho2 > rho1 else (deep < shallow)
    shallow_closer = abs(shallow - rho1) < abs(shallow - rho2)
    ratio = deep / max(shallow, 1e-6)
    # Meaningful structure: polarity + shallow closer to overburden. True ρ2 is not required.
    recovered = polarity and shallow_closer
    true_rho_ok = abs(shallow - rho1) / rho1 < 0.4 and abs(deep - rho2) / rho2 < 0.4
    return {
        "name": name,
        "array": "wenner",
        "forward": "Wenner two-layer image series (Telford 1990 §8.4), independent of the invert Jacobian",
        "rho1_ohm_m": rho1,
        "rho2_ohm_m": rho2,
        "overburden_thickness_m": h,
        "noise_percent": 5,
        "shallow_median_ohm_m": shallow,
        "deep_median_ohm_m": deep,
        "deep_over_shallow": ratio,
        "polarity_recovered": bool(polarity),
        "shallow_closer_to_overburden": bool(shallow_closer),
        "true_resistivities_recovered": bool(true_rho_ok),
        "one_d_layer_recovery": bool(recovered),
        "misfit_percent": result["misfit_percent"],
        "rms_history": result.get("rms_history"),
        "pass": bool(recovered and result["misfit_percent"] < 25),
        "required_for_production": True,
        "remaining_limit": "True layer resistivities and a sharp boundary are not required and typically not recovered.",
    }


def test_buried_target(kind: str, rng_seed: int):
    """Self-consistent 2.5-D synthetic: same engine as invert (labelled)."""
    rng = np.random.default_rng(rng_seed)
    xs = np.linspace(10, 70, 7)
    spacings = [6.0, 10.0, 16.0]
    meas0 = _line(xs, spacings, "wenner", 1.0, lambda a, x: 100.0)
    x_inv = np.linspace(10, 70, 10)
    z_inv = np.logspace(np.log10(1.5), np.log10(28), 8)
    bg = 100.0
    rho = np.full((len(z_inv), len(x_inv)), bg)
    x_target = 40.0
    ix = int(np.argmin(np.abs(x_inv - x_target)))
    iz = int(np.clip(np.searchsorted(z_inv, 8.0), 1, len(z_inv) - 2))
    target = 20.0 if kind == "conductive" else 500.0
    rho[iz : iz + 2, max(0, ix - 1) : ix + 2] = target
    scale = homogeneous_scale(meas0, x_inv, z_inv, n_k=4)
    pred = Forward25D(meas0, rho, x_inv, z_inv, n_k=4).apparent_resistivities() * scale
    meas = []
    for m, v in zip(meas0, pred):
        row = dict(m)
        row["rhoa"] = float(max(v, 1.0))
        meas.append(row)
    meas = _apply_noise(meas, rng, 0.03)
    result = invert_2d_smooth(meas, n_x=10, n_z=8, max_iter=6, n_k=4, fail_on_divergence=False)
    model = np.array(result["resistivity_ohm_m"], float)
    x = np.array(result["x_m"], float)
    if kind == "conductive":
        j = int(np.unravel_index(int(np.argmin(model)), model.shape)[1])
        found = float(x[j])
        contrast_ok = float(np.min(model)) < 0.75 * float(np.median(model))
    else:
        j = int(np.unravel_index(int(np.argmax(model)), model.shape)[1])
        found = float(x[j])
        contrast_ok = float(np.max(model)) > 1.25 * float(np.median(model))
    loc_ok = abs(found - x_target) <= 0.30 * (x.max() - x.min())
    return {
        "name": f"buried_{kind}_block_self_consistent_25d",
        "forward": "Self-consistent 2.5-D FD (same engine as invert) — not an independent 2-D oracle",
        "target_x_m": x_target,
        "recovered_x_m": found,
        "contrast_recovered": bool(contrast_ok),
        "location_recovered": bool(loc_ok),
        "misfit_percent": result["misfit_percent"],
        "pass": bool(contrast_ok and loc_ok),
        "required_for_production": False,
        "note": "Independent 2-D buried-target oracles are not implemented. This case cannot earn production support by itself.",
    }


def test_two_layer_oracle_array_coverage():
    return {
        "name": "two_layer_independent_oracle_array_coverage",
        "kind": "programme_coverage",
        "wenner": "Telford 1990 §8.4 image series — independently scored",
        "dipole_dipole": "no independent closed-form two-layer oracle in this programme",
        "schlumberger": "no independent closed-form two-layer oracle in this programme",
        "homogeneous_arrays_scored": ["wenner", "dipole_dipole", "schlumberger"],
        "pass": True,
        "required_for_production": False,
        "note": "Production two-layer scoring uses the Wenner image series only. Dipole-dipole and Schlumberger are scored on homogeneous recovery until independent layered oracles exist.",
    }


def test_jacobian_euler_and_depth_sensitivity():
    """Homogeneous Euler check and cumulative |J| vs depth (last invert iteration analogue)."""
    xs = np.linspace(10, 70, 7)
    spacings = [6.0, 10.0, 16.0]
    meas = _line(xs, spacings, "wenner", 1.0, lambda a, x: 100.0)
    x_inv = np.linspace(10, 70, 8)
    z_inv = np.logspace(np.log10(1.5), np.log10(28), 6)
    rho = np.full((len(z_inv), len(x_inv)), 100.0)
    fwd = Forward25D(meas, rho, x_inv, z_inv, n_k=4)
    pred = fwd.apparent_resistivities()
    j = fwd.jacobian_dlogrhoa_dlogrho(x_inv, z_inv, pred)
    row_sums = j.sum(axis=1)
    median_row = float(np.median(row_sums))
    j_z = np.abs(j).reshape(len(meas), len(z_inv), len(x_inv)).sum(axis=(0, 2))
    cum = np.cumsum(j_z)
    cum = cum / max(float(cum[-1]), 1e-12)
    half_depth = float(z_inv[int(np.searchsorted(cum, 0.5))])
    # After homogeneous_scale the data Jacobian is globally renormalised in invert_2d_smooth.
    # Unscaled Frechet row sums are documented, not required to equal 1.
    return {
        "name": "jacobian_euler_and_depth_sensitivity",
        "kind": "diagnostics",
        "median_jacobian_row_sum_unscaled": median_row,
        "row_sum_min": float(np.min(row_sums)),
        "row_sum_max": float(np.max(row_sums)),
        "depth_of_50pct_cumulative_abs_J_m": half_depth,
        "z_nodes_m": z_inv.tolist(),
        "cumulative_abs_J_fraction": cum.tolist(),
        "pass": True,
        "required_for_production": False,
        "note": "Unscaled ∇φ·∇φ Frechet row sums are not 1; invert_2d_smooth applies a median-row scale. Depth of 50% cumulative |J| is a sensitivity diagnostic, not a production DOI.",
    }


def test_outliers():
    rng = np.random.default_rng(5)
    xs = np.linspace(10, 70, 7)
    spacings = [6.0, 10.0, 16.0]
    meas = _apply_noise(_line(xs, spacings, "wenner", 1.0, lambda a, x: 100.0), rng, 0.05)
    meas[3]["rhoa"] *= 12.0
    meas[11]["rhoa"] *= 12.0
    result = invert_2d_smooth(meas, n_x=8, n_z=6, max_iter=6, n_k=4, fail_on_divergence=False)
    median = float(np.median(result["resistivity_ohm_m"]))
    ok = abs(median - 100.0) / 100.0 < 0.45
    return {
        "name": "homogeneous_with_two_12x_outliers",
        "recovered_median_ohm_m": median,
        "misfit_percent": result["misfit_percent"],
        "converged": result["converged"],
        "pass": bool(ok),
        "required_for_production": True,
        "forward": "Homogeneous 100 Ω·m + 5% noise + two 12× outliers",
        "note": "Huber-like residual weights. Invert must not collapse or follow outliers to a non-physical median.",
    }


def write_results(cases: list[dict]) -> str:
    os.makedirs(RESULTS_DIR, exist_ok=True)
    path = os.path.abspath(os.path.join(RESULTS_DIR, "ert_invert2d_benchmarks.json"))
    required = [c for c in cases if c.get("required_for_production")]
    required_pass = all(c.get("pass") for c in required)
    two_layer = [c for c in cases if c.get("name", "").startswith("two_layer_wenner")]
    true_rho = all(c.get("true_resistivities_recovered") for c in two_layer) if two_layer else False
    independent_2d_target_oracle = False
    production = bool(required_pass and true_rho and independent_2d_target_oracle)
    payload = {
        "product": "G-AID experimental flat-topography ert.invert2d",
        "support_level": "experimental",
        "production_supported": production,
        "not_res2dinv": True,
        "not_3d": True,
        "topography_in_forward": False,
        "independent_2d_target_oracle": independent_2d_target_oracle,
        "true_two_layer_resistivities_recovered": true_rho,
        "thresholds": {
            "homogeneous_median_relative": 0.25,
            "two_layer_polarity_and_shallow_closer": True,
            "true_layer_resistivities_within_40pct": "required for production; not currently claimed",
            "independent_2d_buried_target_oracle": "required for production; not implemented",
            "forward_vs_image_series_relative": 0.30,
        },
        "cases": cases,
        "required_cases_passed": required_pass,
        "all_passed": all(c.get("pass") for c in cases),
        "remaining_failure_cases": [
            {
                "name": c.get("name"),
                "issue": (
                    "true resistivities not recovered"
                    if c.get("true_resistivities_recovered") is False
                    else c.get("remaining_limit") or c.get("note") or "see case"
                ),
            }
            for c in cases
            if c.get("true_resistivities_recovered") is False
            or (c.get("name", "").startswith("buried_") and not c.get("pass"))
            or c.get("preserved_failure")
        ],
        "support_bar": (
            "ert.ingest and ert.pseudosection are supported. ert.invert2d is experimental "
            "until independent two-layer true-resistivity recovery and 2-D target oracles pass. "
            "Not a production inversion pack. Not Res2DInv."
        ),
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
    return path


if __name__ == "__main__":
    cases = [
        test_forward_vs_wenner_image_series(),
        test_historical_gaussian_two_layer_failure(),
        test_homogeneous("wenner", 1.0, 7),
        test_homogeneous("dipole_dipole", 2.0, 9),
        test_homogeneous("schlumberger", 4.0, 13),
        test_two_layer_independent(50.0, 500.0, 8.0, "two_layer_wenner_50_over_500_h8", 11),
        test_two_layer_independent(50.0, 500.0, 4.0, "two_layer_wenner_50_over_500_h4", 17),
        test_two_layer_independent(200.0, 40.0, 8.0, "two_layer_wenner_200_over_40_h8", 19),
        test_two_layer_oracle_array_coverage(),
        test_buried_target("conductive", 23),
        test_buried_target("resistive", 29),
        test_jacobian_euler_and_depth_sensitivity(),
        test_outliers(),
    ]
    path = write_results(cases)
    failed_required = [c["name"] for c in cases if c.get("required_for_production") and not c.get("pass")]
    print(f"ok ERT invert2d benchmarks -> {path}")
    print("required_failures", failed_required)
    print("production_supported", json.load(open(path))["production_supported"])
