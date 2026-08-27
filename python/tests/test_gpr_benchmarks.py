"""Independent GPR processing and Kirchhoff diffraction benchmarks.

Nyquist corners are derived from dt. High-cut is never silently placed at
0.999 × Nyquist. Migration is gated on a known zero-offset hyperbola.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from science.gpr import (
    NYQUIST_HIGH_FRACTION,
    dewow,
    process_section,
    resolve_bandpass,
    run_migration_benchmark,
    sampling_from_dt,
    sec_gain,
    time_zero,
)

RESULTS = Path(__file__).resolve().parents[2] / "docs" / "validation" / "results"


def test_sampling_from_dt_ns():
    samp = sampling_from_dt(0.4e-9)
    assert abs(samp["sampling_hz"] - 2.5e9) < 1.0
    assert abs(samp["nyquist_hz"] - 1.25e9) < 1.0


def test_valid_antenna_default_is_nyquist_safe():
    out = resolve_bandpass(0.4e-9, antenna_mhz=400)
    assert out["bandpass_applied"] is True
    assert out["bandpass_adjusted"] is False
    assert out["bandpass_refused"] is False
    assert abs(out["applied_low_hz"] - 80e6) < 1.0
    assert abs(out["applied_high_hz"] - 800e6) < 1.0
    assert out["applied_high_hz"] < out["nyquist_hz"]


def test_antenna_default_above_nyquist_uses_documented_safe_high():
    out = resolve_bandpass(2e-9, antenna_mhz=400)
    assert out["bandpass_defaulted_from_antenna"] is True
    assert out["bandpass_adjusted"] is True
    assert out["bandpass_applied"] is True
    assert out["bandpass_refused"] is False
    assert abs(out["requested_high_hz"] - 800e6) < 1.0
    assert abs(out["applied_high_hz"] - NYQUIST_HIGH_FRACTION * 250e6) < 1.0
    assert out["applied_high_hz"] < out["nyquist_hz"]
    assert "0.999" in (out["adjustment_reason"] or "")


def test_user_high_cut_at_or_above_nyquist_is_refused_not_clamped():
    nyq = sampling_from_dt(0.4e-9)["nyquist_hz"]
    out = resolve_bandpass(0.4e-9, f_low=80e6, f_high=nyq)
    assert out["bandpass_applied"] is False
    assert out["bandpass_refused"] is True
    assert out["applied_high_hz"] is None
    over = resolve_bandpass(0.4e-9, f_low=80e6, f_high=nyq * 1.1)
    assert over["bandpass_refused"] is True
    assert over["bandpass_applied"] is False


def test_low_cut_above_nyquist_refuses_unsavable_antenna_default():
    out = resolve_bandpass(20e-9, antenna_mhz=400)
    assert out["bandpass_applied"] is False
    assert out["bandpass_refused"] is True
    assert out["applied_high_hz"] is None


def test_skip_bandpass_is_recorded():
    out = resolve_bandpass(0.4e-9, f_low=80e6, f_high=800e6, apply_bandpass=False)
    assert out["bandpass_applied"] is False
    assert out["bandpass_refused"] is True
    assert "applyBandpass is false" in out["refusal_reason"]


def test_dewow_removes_dc_bias():
    section = np.ones((4, 32)) * 7.0
    section[:, 8] += 3.0
    out = dewow(section, window=9)
    assert abs(float(np.mean(out))) < 0.5


def test_time_zero_finds_first_break():
    section = np.zeros((3, 20))
    section[:, 6:] = 1.0
    assert time_zero(section, threshold=0.05) == 6


def test_sec_gain_amplifies_late_samples():
    section = np.ones((2, 16))
    gained = sec_gain(section, dt=1e-9, power=2.0, exp=0.0)
    assert gained[0, -1] > gained[0, 1]


def test_process_optional_steps_are_honoured():
    rng = np.random.default_rng(0)
    section = rng.normal(2.0, 0.1, size=(8, 48))
    skipped = process_section(
        section,
        dt=4e-10,
        dx=0.05,
        antenna_mhz=400,
        apply_dewow=False,
        apply_time_zero=False,
        apply_sec_gain=False,
        apply_bandpass=False,
    )
    assert skipped["dewow_applied"] is False
    assert skipped["time_zero_applied"] is False
    assert skipped["time_zero_sample"] == 0
    assert skipped["sec_applied"] is False
    assert skipped["bandpass_applied"] is False
    assert skipped["geological_certainty_improved"] is False
    np.testing.assert_allclose(skipped["section"], section)


def test_process_records_sampling_and_filter():
    rng = np.random.default_rng(1)
    section = rng.normal(0.0, 1.0, size=(8, 64))
    out = process_section(section, dt=4e-10, dx=0.05, antenna_mhz=400)
    assert out["bandpass_applied"] is True
    assert abs(out["sampling_hz"] - 2.5e9) < 1.0
    assert abs(out["nyquist_hz"] - 1.25e9) < 1.0
    assert out["bandpass"]["requested_source"] == "antenna_default"


def test_migration_benchmark_is_recorded():
    report = run_migration_benchmark()
    RESULTS.mkdir(parents=True, exist_ok=True)
    dest = RESULTS / "gpr_migration_benchmark.json"
    dest.write_text(json.dumps(report, indent=2) + "\n")
    assert report["all_passed"] is True
    correct = next(c for c in report["cases"] if c["name"] == "known_diffraction_correct_velocity")
    assert correct["location_pass"] is True
    assert correct["energy_concentration_pass"] is True
    assert correct["contrast_pass"] is True
    assert correct["peak_trace"] == correct["true_apex_trace"]
