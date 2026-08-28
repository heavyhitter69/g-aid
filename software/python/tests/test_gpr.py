"""G-AID GPR 1.0 kernel and formula tests.

Arbitrary DZT is not a processing input. Velocity is never assumed.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from formats.gpr import parse_gpr_table
from science.gpr import dewow, process_section, time_zero, resolve_bandpass

FIXTURE = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "gpr-project"


def test_dewow_removes_dc_bias():
    section = np.ones((4, 32)) * 7.0
    section[:, 8] += 3.0
    out = dewow(section, window=9)
    assert abs(float(np.mean(out))) < 0.5


def test_time_zero_finds_first_break():
    section = np.zeros((3, 20))
    section[:, 6:] = 1.0
    assert time_zero(section, threshold=0.05) == 6


def test_process_section_defaults_bandpass_from_antenna():
    rng = np.random.default_rng(0)
    section = rng.normal(2.0, 0.1, size=(8, 48))
    out = process_section(section, dt=4e-10, dx=0.05, antenna_mhz=400)
    assert out["bandpass_defaulted_from_antenna"] is True
    assert out["bandpass_applied"] is True
    assert abs(out["f_low_hz"] - 80e6) < 1.0
    assert abs(out["f_high_hz"] - 800e6) < 1.0
    assert out["nyquist_hz"] > out["f_high_hz"]
    assert out["geological_certainty_improved"] is False
    assert "migrated" not in out


def test_valid_contract_parses_without_inventing_velocity():
    parsed = parse_gpr_table(str(FIXTURE / "valid" / "section.csv"))
    assert parsed["dt_ns"] == 0.4
    assert parsed["dx_m"] == 0.05
    assert parsed["antenna_mhz"] == 400
    assert parsed["velocity_ms"] is None
    assert parsed["n_traces"] == 20
    assert parsed["n_samples"] == 64


def test_missing_banner_is_refused():
    with pytest.raises(ValueError, match="G-AID GPR 1.0 banner"):
        parse_gpr_table(str(FIXTURE / "amplitude-only" / "traces.csv"))


def test_parse_dzt_does_not_invent_geometry():
    from formats import parse_dzt

    with pytest.raises(ValueError, match="recognised-unsupported"):
        parse_dzt(str(FIXTURE / "dzt-like" / "scan.dzt"))


def test_migrate_kernel_requires_velocity(tmp_path):
    from kernels.gpr import gpr_ingest, gpr_migrate, gpr_process

    out = tmp_path / "G-AID Output" / "runs" / "r-gpr"
    out.mkdir(parents=True)
    src = FIXTURE / "valid" / "section.csv"
    payload = {
        "parameters": {
            "baseDir": str(FIXTURE),
            "outDir": str(tmp_path / "G-AID Output" / "runs"),
            "taskFolder": "r-gpr",
            "catalogInputs": [
                {
                    "catalogId": "gpr-valid",
                    "path": "valid/section.csv",
                    "adapterId": "gpr-csv",
                    "absPath": str(src),
                }
            ],
        }
    }
    gpr_ingest(payload)
    gpr_process(payload)
    with pytest.raises(ValueError, match="velocityMs"):
        gpr_migrate(payload)
    payload["parameters"]["velocityMs"] = 1.0e8
    result = gpr_migrate(payload)
    qc = json.loads((out / "gpr_migrate_qc.json").read_text())
    assert qc["velocity_assumed"] is False
    assert qc["velocity_ms"] == 1.0e8
    assert qc["benchmark_passed"] is True
    assert result["artifacts"]


def _dispatch_section(tmp_path, rel, extra=None):
    from kernels.gpr import gpr_ingest, gpr_process

    src = FIXTURE / rel
    payload = {
        "parameters": {
            "baseDir": str(FIXTURE),
            "outDir": str(tmp_path / "G-AID Output" / "runs"),
            "taskFolder": "r-gpr",
            "catalogInputs": [
                {
                    "catalogId": "gpr-case",
                    "path": rel,
                    "adapterId": "gpr-csv",
                    "absPath": str(src),
                }
            ],
            **(extra or {}),
        }
    }
    (tmp_path / "G-AID Output" / "runs" / "r-gpr").mkdir(parents=True)
    gpr_ingest(payload)
    gpr_process(payload)
    qc = json.loads((tmp_path / "G-AID Output" / "runs" / "r-gpr" / "gpr_process_qc.json").read_text())
    return qc


def test_coarse_dt_adjusts_antenna_default_not_clamp(tmp_path):
    qc = _dispatch_section(tmp_path, "coarse-dt/section.csv")
    assert qc["bandpass_adjusted"] is True
    assert qc["bandpass_applied"] is True
    assert qc["bandpass_refused"] is False
    assert qc["nyquist_hz"] == pytest.approx(250e6)
    assert qc["applied_filter_hz"][1] == pytest.approx(0.8 * 250e6)
    assert qc["applied_filter_hz"][1] < qc["nyquist_hz"]
    assert "0.999" in (qc["bandpass"]["adjustment_reason"] or "")


def test_undersampled_antenna_default_refuses_filter(tmp_path):
    qc = _dispatch_section(tmp_path, "nyquist-refuse/section.csv")
    assert qc["bandpass_refused"] is True
    assert qc["bandpass_applied"] is False
    assert qc["applied_filter_hz"] == [None, None]
    assert qc["geological_certainty_improved"] is False


def test_skip_dewow_is_frozen(tmp_path):
    qc = _dispatch_section(tmp_path, "valid/section.csv", extra={"applyDewow": False, "applyBandpass": True})
    assert qc["dewow_applied"] is False
    assert qc["frozen_parameters"]["applyDewow"] is False
    assert qc["sampling_hz"] == pytest.approx(2.5e9)
