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
    assert parsed["geojson_contract"] == "legacy-geojson"
    assert parsed["crs_source"] == "legacy-crs"


def test_filename_geology_is_not_a_role():
    parsed = parse_geojson(str(FIXTURE / "valid-polygons" / "geology.geojson"), role="generic-vector", role_reviewed=False)
    assert parsed["role"] == "generic-vector"
    assert parsed["role_reviewed"] is False
    assert "UNIT" in parsed["attribute_names"]


def test_rfc7946_without_crs_member_is_crs84():
    parsed = parse_geojson(str(FIXTURE / "no-crs" / "clip.geojson"))
    assert parsed["crs"] == "OGC:CRS84"
    assert parsed["crs_epsg"] is None
    assert parsed["geojson_contract"] == "rfc7946"
    assert parsed["crs_source"] == "rfc7946"
    assert parsed["axis_order"] == "lon-lat"
    assert parsed["coordinate_order"] == "lon-lat"
    assert parsed["crs"] != "EPSG:4326"


def test_rfc7946_feature_root_is_crs84():
    parsed = parse_geojson(str(FIXTURE / "rfc7946-feature" / "point.geojson"))
    assert parsed["crs"] == "OGC:CRS84"
    assert parsed["geojson_contract"] == "rfc7946"


def test_legacy_crs_member_is_not_rfc7946():
    parsed = parse_geojson(str(FIXTURE / "compat" / "legacy-4326.geojson"))
    assert parsed["crs"] == "EPSG:4326"
    assert parsed["geojson_contract"] == "legacy-geojson"
    assert parsed["crs_source"] == "legacy-crs"
    assert parsed["axis_order"] == "lat-lon"
    assert parsed["coordinate_order"] == "lon-lat"


def test_custom_import_prj_is_not_rfc7946():
    parsed = parse_geojson(str(FIXTURE / "custom-import" / "samples.geojson"))
    assert parsed["crs"] == "EPSG:32734"
    assert parsed["geojson_contract"] == "g-aid-custom-import"
    assert parsed["crs_source"] == "companion-prj"


def test_epsg_comment_is_custom_import():
    parsed = parse_geojson(str(FIXTURE / "epsg-comment" / "samples.geojson"))
    assert parsed["crs"] == "EPSG:32734"
    assert parsed["geojson_contract"] == "g-aid-custom-import"
    assert parsed["crs_source"] == "epsg-comment"


def test_projected_undocumented_is_refused():
    with pytest.raises(ValueError, match="OGC:CRS84 does not apply"):
        parse_geojson(str(FIXTURE / "projected-undocumented" / "utm.geojson"))


def test_legacy_unmapped_crs_is_refused():
    with pytest.raises(ValueError, match="user-confirmed CRS mapping"):
        parse_geojson(str(FIXTURE / "legacy-unmapped" / "named-only.geojson"))


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


def test_overlap_skips_when_crs_is_missing(tmp_path):
    from kernels.vector import vector_overlap
    from science.artifacts import write_json

    out = tmp_path / "G-AID Output" / "runs" / "r-gis-ncrs"
    out.mkdir(parents=True)
    write_json(
        str(out / "vector_canonical.json"),
        {
            "kind": "gis-vector",
            "layers": [
                {
                    "source_path": "no-crs/clip.geojson",
                    "crs": "",
                    "bbox": {"minX": 18, "minY": -34, "maxX": 19, "maxY": -33},
                    "features": [{"id": "a", "geometry_type": "Point", "coordinates": [{"x": 18.4, "y": -33.9}]}],
                },
                {
                    "source_path": "valid-points/samples.geojson",
                    "crs": "EPSG:32734",
                    "bbox": {"minX": 260100, "minY": 6240100, "maxX": 260180, "maxY": 6240180},
                    "features": [{"id": "s1", "geometry_type": "Point", "coordinates": [{"x": 260100, "y": 6240100}]}],
                },
            ],
        },
    )
    payload = {
        "parameters": {
            "baseDir": str(FIXTURE),
            "outDir": str(tmp_path / "G-AID Output" / "runs"),
            "taskFolder": "r-gis-ncrs",
            "catalogInputs": [],
        }
    }
    vector_overlap(payload)
    qc = json.loads((out / "vector_overlap_qc.json").read_text())
    assert qc["skipped"] is True
    assert qc["reason"] == "gis_crs_required"
    assert qc["reprojected"] is False


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


def test_crs84_epsg4326_overlap_records_compatibility_decision(tmp_path):
    from kernels.vector import vector_export, vector_ingest, vector_overlap

    out = tmp_path / "G-AID Output" / "runs" / "r-gis-compat"
    out.mkdir(parents=True)
    payload = {
        "parameters": {
            "baseDir": str(FIXTURE),
            "outDir": str(tmp_path / "G-AID Output" / "runs"),
            "taskFolder": "r-gis-compat",
            "catalogInputs": [
                {"catalogId": "crs84", "path": "compat/crs84.geojson", "adapterId": "geojson", "formatId": "geojson", "checksum": "a"},
                {"catalogId": "legacy", "path": "compat/legacy-4326.geojson", "adapterId": "geojson", "formatId": "geojson", "checksum": "b"},
            ],
        }
    }
    vector_ingest(payload)
    vector_overlap(payload)
    vector_export(payload)
    qc = json.loads((out / "vector_ingest_qc.json").read_text())
    assert {layer["crs"] for layer in qc["layers"]} == {"OGC:CRS84", "EPSG:4326"}
    assert {layer["geojson_contract"] for layer in qc["layers"]} == {"rfc7946", "legacy-geojson"}
    overlap = json.loads((out / "vector_overlap.json").read_text())
    assert overlap["rows"]
    assert overlap["reprojected"] is False
    assert overlap["axis_swap"] is False
    assert overlap["crs_decisions"][0]["compatibility_decision"] == "geojson-lonlat-no-axis-swap"
    assert all(row["compatibility_decision"] == "geojson-lonlat-no-axis-swap" for row in overlap["rows"])
    exports = [
        json.loads((out / "vector_export_1.geojson").read_text()),
        json.loads((out / "vector_export_2.geojson").read_text()),
    ]
    crs84_export = next(item for item in exports if item["features"][0]["properties"].get("_g_aid_crs") == "OGC:CRS84")
    assert "crs" not in crs84_export
    assert crs84_export["features"][0]["properties"]["_g_aid_geojson_contract"] == "rfc7946"
