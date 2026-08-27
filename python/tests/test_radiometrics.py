"""Independent radiometric formula and ingest-contract tests.

Height correction, stripping, and NASVD are library-only. They are not live
capabilities and must not be dispatched as rad.correct.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from formats.radiometrics import parse_radiometric_table
from science.radiometrics import (
    MU_K,
    concentration_ratios,
    height_correct,
    nasvd,
    percentile_stretch,
    strip_windows,
    ternary_rgb,
)

FIXTURE = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "radio-project"
RESULTS = Path(__file__).resolve().parents[2] / "docs" / "validation" / "results"


def test_concentration_ratio_arithmetic():
    k = np.array([1.5, 2.0, 0.0])
    eu = np.array([3.0, 4.0, 1.0])
    eth = np.array([6.0, 8.0, 2.0])
    out = concentration_ratios(k, eu, eth, eps=1e-6)
    assert abs(out["eu_eth"][0] - 0.5) < 1e-12
    assert abs(out["eu_eth"][1] - 0.5) < 1e-12
    assert abs(out["eu_k"][0] - 2.0) < 1e-12
    assert abs(out["eth_k"][1] - 4.0) < 1e-12
    assert out["n_k_clipped_eu"] == 1


def test_percentile_stretch_and_ternary_assignment():
    k = np.array([0.0, 50.0, 100.0])
    stretched = percentile_stretch(k, 0.0, 100.0)
    assert abs(stretched[0] - 0.0) < 1e-12
    assert abs(stretched[2] - 1.0) < 1e-12
    rgb = ternary_rgb(np.array([1.0, 2.0]), np.array([10.0, 20.0]), np.array([3.0, 6.0]), 0.0, 100.0)
    assert rgb["assignment"] == {"R": "K %", "G": "eTh ppm", "B": "eU ppm"}
    arr = np.asarray(rgb["rgb"])
    assert arr.shape[-1] == 3
    assert 0.0 <= arr.min() <= arr.max() <= 1.0


def test_height_correct_library_formula_only():
    n0 = np.array([100.0])
    dh = 50.0
    got = height_correct(n0, dh, MU_K, h_ref_m=0.0)
    assert abs(got[0] - 100.0 * np.exp(MU_K * dh)) < 1e-12


def test_strip_windows_known_3x3():
    ratios = {"alpha": 0.2, "beta": 0.3, "gamma": 0.4, "a": 0.1, "b": 0.0, "g": 0.05}
    k_true, u_true, th_true = 10.0, 5.0, 8.0
    k_raw = k_true + ratios["alpha"] * u_true + ratios["beta"] * th_true
    u_raw = ratios["a"] * k_true + u_true + ratios["gamma"] * th_true
    th_raw = ratios["b"] * k_true + ratios["g"] * u_true + th_true
    out = strip_windows([k_raw], [u_raw], [th_raw], ratios)
    assert abs(out["k"][0] - k_true) < 1e-9
    assert abs(out["u"][0] - u_true) < 1e-9
    assert abs(out["th"][0] - th_true) < 1e-9


def test_nasvd_shape_and_energy():
    rng = np.random.default_rng(0)
    spectra = rng.normal(10.0, 1.0, size=(20, 12))
    out = nasvd(spectra, n_components=4)
    assert np.asarray(out["reconstructed"]).shape == spectra.shape
    assert len(out["singular_values"]) == 12
    assert "library only" in out["formula"]


def test_parse_rejects_assay_spectrum_and_counts(tmp_path):
    assay = FIXTURE / "assay-xy" / "assays.csv"
    with pytest.raises(ValueError, match="Line|Quantity|spectrometer|counts|channel"):
        parse_radiometric_table(str(assay))
    spectrum = FIXTURE / "raw-spectrum" / "spectra.csv"
    with pytest.raises(ValueError, match="Line|Quantity|spectrometer|counts|channel"):
        parse_radiometric_table(str(spectrum))
    counts = FIXTURE / "counts" / "stations.csv"
    with pytest.raises(ValueError, match="counts"):
        parse_radiometric_table(str(counts))


def test_parse_valid_concentration_contract():
    df, qc = parse_radiometric_table(str(FIXTURE / "valid" / "stations.csv"))
    assert len(df) == 16
    assert qc["quantity"] == "concentration"
    assert qc["crs_epsg"] == 32630
    assert qc["corrections_applied_in_g_aid"] is False
    assert "k" in df.columns and "eu" in df.columns and "eth" in df.columns


def test_write_benchmark_record():
    RESULTS.mkdir(parents=True, exist_ok=True)
    record = {
        "pack": "radiometrics",
        "contract": "G-AID RAD 1.0 already-corrected",
        "live_capabilities": ["rad.ingest", "rad.grid", "rad.ternary", "rad.ratios", "rad.gis", "rad.interpret"],
        "not_live": ["height_correct", "strip_windows", "nasvd", "dead_time", "background", "concentration_conversion"],
        "formula_checks": {
            "eu_eth": "3/6 = 0.5",
            "height_correct": "N = N0 exp(μ Δh) library only",
            "strip_windows": "known 3x3 inverse recovers windows",
        },
        "interpretation_limits": [
            "not mineralisation",
            "not lithology",
            "not alteration",
            "not drill targets",
        ],
    }
    path = RESULTS / "radiometrics_benchmarks.json"
    path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    assert path.is_file()
