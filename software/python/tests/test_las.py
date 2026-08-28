"""CWLS LAS 2.0 WRAP.NO parser and borehole kernel tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from formats.las import is_lasf, parse_las_20

FIXTURE = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "las-project"


def test_valid_las20_preserves_curves_and_nulls():
    parsed = parse_las_20(str(FIXTURE / "valid" / "well.las"))
    assert parsed["las_version"] == "2.0"
    assert parsed["wrap"] == "NO"
    assert parsed["well"] == "DEMO-1"
    assert parsed["null"] == -999.25
    assert parsed["depth_index"] == "DEPT"
    assert parsed["depth_reference"] == "measured depth"
    mnemonics = [c["mnemonic"] for c in parsed["curves"]]
    assert mnemonics == ["DEPT", "GR", "RHOB", "NPHI"]
    assert all(c["semantics"] == "unknown" for c in parsed["curves"])
    assert parsed["data"]["GR"].isna().sum() == 1
    assert parsed["collar_mappable"] is False
    assert parsed["trajectory_computed"] is False


def test_unknown_curve_is_ingested_without_invented_meaning():
    parsed = parse_las_20(str(FIXTURE / "unknown-curves" / "well.las"))
    foo = next(c for c in parsed["curves"] if c["mnemonic"] == "FOO")
    assert foo["unit"] == "XXX"
    assert foo["semantics"] == "unknown"


def test_lidar_lasf_is_not_a_well_log():
    path = str(FIXTURE / "lidar" / "cloud.las")
    assert is_lasf(path)
    with pytest.raises(ValueError, match="LASF"):
        parse_las_20(path)


def test_wrap_yes_is_refused():
    with pytest.raises(ValueError, match="WRAP.YES"):
        parse_las_20(str(FIXTURE / "wrap-yes" / "well.las"))


def test_las3_is_refused():
    with pytest.raises(ValueError, match="LAS 3"):
        parse_las_20(str(FIXTURE / "las3" / "well.las"))


def test_missing_units_refused():
    with pytest.raises(ValueError, match="Missing curve units"):
        parse_las_20(str(FIXTURE / "missing-units" / "well.las"))


def test_duplicate_depth_refused():
    with pytest.raises(ValueError, match="Duplicate depth"):
        parse_las_20(str(FIXTURE / "duplicate-depth" / "well.las"))


def test_malformed_header_refused():
    with pytest.raises(ValueError, match="ASCII"):
        parse_las_20(str(FIXTURE / "malformed-header" / "well.las"))


def test_kernels_ingest_view_interpret_and_skip_unmapped_collar(tmp_path):
    from kernels.borehole import borehole_interpret, borehole_map_collar, borehole_view, las_ingest

    out = tmp_path / "G-AID Output" / "runs" / "r-las"
    out.mkdir(parents=True)
    src = FIXTURE / "valid" / "well.las"
    payload = {
        "parameters": {
            "baseDir": str(FIXTURE),
            "outDir": str(tmp_path / "G-AID Output" / "runs"),
            "taskFolder": "r-las",
            "catalogInputs": [
                {
                    "catalogId": "las-valid",
                    "path": "valid/well.las",
                    "adapterId": "las-well",
                    "absPath": str(src),
                    "checksum": "abc",
                }
            ],
        }
    }
    las_ingest(payload)
    borehole_view(payload)
    mapped = borehole_map_collar(payload)
    assert any("skipped" in (e.get("message") or "").lower() for e in mapped["events"])
    borehole_interpret(payload)
    qc = json.loads((out / "borehole_ingest_qc.json").read_text())
    assert qc["files"][0]["depth_reference"] == "measured depth"
    assert qc["trajectory_computed"] is False
    report = json.loads((out / "borehole_interpretation.json").read_text())
    blob = " ".join(report["not_established"]).lower()
    assert "lithology" in blob
    assert "aquifer" in blob
    assert "mineralisation" in blob
    assert "trajectory" in blob
    assert report["geological_certainty_improved"] is False
    tracks = json.loads((out / "borehole_tracks.json").read_text())
    assert tracks["depth_reference"] == "measured depth"
    gr = next(t for t in tracks["tracks"] if t["mnemonic"] == "GR")
    assert any(s["value"] is None for s in gr["samples"])


def test_collar_geojson_requires_crs(tmp_path):
    from kernels.borehole import borehole_map_collar, las_ingest

    out = tmp_path / "G-AID Output" / "runs" / "r-collar"
    out.mkdir(parents=True)
    src = FIXTURE / "valid-collar" / "well.las"
    payload = {
        "parameters": {
            "baseDir": str(FIXTURE),
            "outDir": str(tmp_path / "G-AID Output" / "runs"),
            "taskFolder": "r-collar",
            "catalogInputs": [
                {
                    "catalogId": "las-collar",
                    "path": "valid-collar/well.las",
                    "adapterId": "las-well",
                    "absPath": str(src),
                }
            ],
        }
    }
    las_ingest(payload)
    borehole_map_collar(payload)
    geo = json.loads((out / "borehole_collar.geojson").read_text())
    assert geo["crs"]["properties"]["name"] == "EPSG:4326"
    assert geo["features"][0]["geometry"]["coordinates"][0] == pytest.approx(18.4241)
    qc = json.loads((out / "borehole_collar_qc.json").read_text())
    assert qc["collar_mapped"] is True
    assert qc["coordinate_kind"] == "geographic"
    assert qc["trajectory_computed"] is False


def test_missing_crs_skips_collar_even_with_coordinates(tmp_path):
    from kernels.borehole import borehole_map_collar, las_ingest

    out = tmp_path / "G-AID Output" / "runs" / "r-ncrs"
    out.mkdir(parents=True)
    src = FIXTURE / "missing-crs" / "well.las"
    payload = {
        "parameters": {
            "baseDir": str(FIXTURE),
            "outDir": str(tmp_path / "G-AID Output" / "runs"),
            "taskFolder": "r-ncrs",
            "catalogInputs": [{"catalogId": "ncrs", "path": "missing-crs/well.las", "adapterId": "las-well", "absPath": str(src)}],
        }
    }
    las_ingest(payload)
    borehole_map_collar(payload)
    assert not (out / "borehole_collar.geojson").exists()
    qc = json.loads((out / "borehole_collar_qc.json").read_text())
    assert qc["skipped"] is True
    assert qc["reason"] == "borehole_crs_required"
