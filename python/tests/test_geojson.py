"""Documented GeoJSON parser and vector kernel tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from formats.geojson import parse_geojson

FIXTURE = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "gis-project"


def test_valid_geojson_preserves_geometry_attributes_and_crs():
    parsed = parse_geojson(str(FIXTURE / "valid-points" / "samples.geojson"))
    assert parsed["crs"] == "EPSG:32734"
    assert parsed["crs_epsg"] == 32734
    assert parsed["feature_count"] == 2
    assert "Point" in parsed["geometry_types"]
    assert "SAMPLE_ID" in parsed["attribute_names"]
    assert parsed["features"][0]["semantics"] == "unknown"
    assert parsed["role"] == "generic-vector"
    assert parsed["role_reviewed"] is False


def test_filename_geology_is_not_a_role():
    parsed = parse_geojson(str(FIXTURE / "valid-polygons" / "geology.geojson"), role="generic-vector", role_reviewed=False)
    assert parsed["role"] == "generic-vector"
    assert parsed["role_reviewed"] is False
    assert "UNIT" in parsed["attribute_names"]


def test_no_crs_is_refused():
    with pytest.raises(ValueError, match="documented EPSG"):
        parse_geojson(str(FIXTURE / "no-crs" / "clip.geojson"))


def test_malformed_polygon_is_refused():
    with pytest.raises(ValueError, match="closed"):
        parse_geojson(str(FIXTURE / "malformed" / "open-ring.geojson"))


def test_kernels_ingest_view_overlap_export_interpret(tmp_path):
    from kernels.vector import vector_export, vector_ingest, vector_interpret, vector_overlap, vector_view

    out = tmp_path / "G-AID Output" / "runs" / "r-gis"
    out.mkdir(parents=True)
    payload = {
        "parameters": {
            "baseDir": str(FIXTURE),
            "outDir": str(tmp_path / "G-AID Output" / "runs"),
            "taskFolder": "r-gis",
            "catalogInputs": [
                {
                    "catalogId": "tenure",
                    "path": "overlap/tenure.geojson",
                    "adapterId": "geojson",
                    "formatId": "geojson",
                    "checksum": "x",
                    "vectorRole": {"role": "tenure", "reviewed": True},
                },
                {
                    "catalogId": "samples",
                    "path": "overlap/samples.geojson",
                    "adapterId": "geojson",
                    "formatId": "geojson",
                    "checksum": "y",
                    "vectorRole": {"role": "sample-location", "reviewed": True},
                },
            ],
        }
    }
    vector_ingest(payload)
    vector_view(payload)
    vector_overlap(payload)
    vector_export(payload)
    vector_interpret(payload)
    qc = json.loads((out / "vector_ingest_qc.json").read_text())
    assert qc["n_layers"] == 2
    assert qc["reprojected"] is False
    overlap = json.loads((out / "vector_overlap.json").read_text())
    assert overlap["rows"]
    assert all("does not establish geological" in row["reason"] for row in overlap["rows"])
    interp = json.loads((out / "vector_interpretation.json").read_text())
    assert interp["geological_certainty_improved"] is False
    assert any("Mineral targeting is not established" in line for line in interp["not_established"])
    assert (out / "vector_export_1.geojson").is_file()
    meta = json.loads((out / "vector_export.meta.json").read_text())
    assert meta["shapefile"] is False
    assert meta["geopackage"] is False


def test_overlap_skips_without_two_layers(tmp_path):
    from kernels.vector import vector_ingest, vector_overlap

    out = tmp_path / "G-AID Output" / "runs" / "r-gis-one"
    out.mkdir(parents=True)
    payload = {
        "parameters": {
            "baseDir": str(FIXTURE),
            "outDir": str(tmp_path / "G-AID Output" / "runs"),
            "taskFolder": "r-gis-one",
            "catalogInputs": [
                {
                    "catalogId": "pts",
                    "path": "valid-points/samples.geojson",
                    "adapterId": "geojson",
                    "formatId": "geojson",
                    "checksum": "x",
                }
            ],
        }
    }
    vector_ingest(payload)
    vector_overlap(payload)
    qc = json.loads((out / "vector_overlap_qc.json").read_text())
    assert qc["skipped"] is True
    assert qc["reason"] == "gis_overlap_needs_two_layers"


def test_conflicting_crs_is_blocked_not_reprojected(tmp_path):
    from kernels.vector import vector_ingest, vector_overlap

    out = tmp_path / "G-AID Output" / "runs" / "r-gis-crs"
    out.mkdir(parents=True)
    payload = {
        "parameters": {
            "baseDir": str(FIXTURE),
            "outDir": str(tmp_path / "G-AID Output" / "runs"),
            "taskFolder": "r-gis-crs",
            "catalogInputs": [
                {"catalogId": "a", "path": "conflict-crs/a.geojson", "adapterId": "geojson", "formatId": "geojson", "checksum": "a"},
                {"catalogId": "b", "path": "conflict-crs/b.geojson", "adapterId": "geojson", "formatId": "geojson", "checksum": "b"},
            ],
        }
    }
    vector_ingest(payload)
    vector_overlap(payload)
    overlap = json.loads((out / "vector_overlap.json").read_text())
    assert overlap["rows"] == []
    assert overlap["blocked"]
    assert "Reprojection is not a registered capability" in overlap["blocked"][0]["reason"]
