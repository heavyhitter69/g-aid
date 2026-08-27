"""Documented shapefile parser and shared GIS kernel tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from formats.shapefile import parse_shapefile

FIXTURE = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "shapefile-project"


def test_valid_point_polyline_polygon_parse_geometry_and_attributes():
    pts = parse_shapefile(str(FIXTURE / "points" / "samples.shp"))
    assert pts["source_format"] == "shapefile"
    assert pts["parser"] == "pyshp-2.3.1"
    assert pts["crs"] == "EPSG:32734"
    assert pts["crs_source"] == "shapefile-prj"
    assert pts["crs_confidence"] == "high"
    assert pts["feature_count"] == 2
    assert "Point" in pts["geometry_types"]
    assert "SAMPLE_ID" in pts["attribute_names"]
    assert pts["role"] == "generic-vector"
    assert pts["reprojected"] is False

    lines = parse_shapefile(str(FIXTURE / "lines" / "faults.shp"))
    assert "LineString" in lines["geometry_types"]
    assert lines["feature_count"] == 2

    poly = parse_shapefile(str(FIXTURE / "polygons" / "geology.shp"))
    assert "Polygon" in poly["geometry_types"]
    assert "UNIT" in poly["attribute_names"]
    assert poly["role"] == "generic-vector"
    assert poly["role_reviewed"] is False


def test_filename_and_dbf_fields_are_not_roles():
    parsed = parse_shapefile(str(FIXTURE / "polygons" / "geology.shp"), role="generic-vector", role_reviewed=False)
    assert parsed["role"] == "generic-vector"
    assert "UNIT" in parsed["attribute_names"]


def test_missing_sidecars_are_refused():
    with pytest.raises(ValueError, match=r"missing \.dbf"):
        parse_shapefile(str(FIXTURE / "missing-dbf" / "samples.shp"))
    with pytest.raises(ValueError, match=r"missing \.shx"):
        parse_shapefile(str(FIXTURE / "missing-shx" / "samples.shp"))
    with pytest.raises(ValueError, match=r"\.prj is missing"):
        parse_shapefile(str(FIXTURE / "missing-prj" / "samples.shp"))


def test_unknown_crs_corrupt_dbf_pointz_and_invalid_geometry_are_refused():
    with pytest.raises(ValueError, match="no EPSG"):
        parse_shapefile(str(FIXTURE / "unknown-crs" / "geology.shp"))
    with pytest.raises(ValueError, match="unparseable"):
        parse_shapefile(str(FIXTURE / "corrupt-dbf" / "samples.shp"))
    with pytest.raises(ValueError, match="PointZ"):
        parse_shapefile(str(FIXTURE / "pointz" / "elevated.shp"))
    with pytest.raises(ValueError):
        parse_shapefile(str(FIXTURE / "invalid-geometry" / "open-ring.shp"))


def test_cp1252_cpg_decodes_and_invalid_utf8_is_refused():
    parsed = parse_shapefile(str(FIXTURE / "encoding-cp1252" / "labels.shp"))
    assert parsed["encoding"] == "cp1252"
    assert parsed["encoding_source"] == "cpg"
    assert parsed["features"][0]["properties"]["NAME"] == "café"
    with pytest.raises(ValueError):
        parse_shapefile(str(FIXTURE / "encoding-utf8-invalid" / "labels.shp"))


def test_null_shape_skipped_and_duplicate_ids_flagged():
    parsed = parse_shapefile(str(FIXTURE / "null-shape" / "samples.shp"))
    assert parsed["feature_count"] == 1
    assert any("null shape" in line.lower() for line in parsed["warnings"])
    dups = parse_shapefile(str(FIXTURE / "duplicate-ids" / "samples.shp"))
    assert dups["feature_count"] == 2
    assert any("Duplicate feature IDs" in line for line in dups["warnings"])


def test_kernels_ingest_shapefile_overlap_export_without_separate_pipeline(tmp_path):
    from kernels.vector import vector_export, vector_ingest, vector_interpret, vector_overlap, vector_view

    out = tmp_path / "G-AID Output" / "runs" / "r-shp"
    out.mkdir(parents=True)
    payload = {
        "parameters": {
            "baseDir": str(FIXTURE),
            "outDir": str(tmp_path / "G-AID Output" / "runs"),
            "taskFolder": "r-shp",
            "catalogInputs": [
                {
                    "catalogId": "tenure",
                    "path": "overlap/tenure.shp",
                    "adapterId": "shapefile",
                    "formatId": "shapefile",
                    "checksum": "x",
                    "vectorRole": {"role": "tenure", "reviewed": True},
                },
                {
                    "catalogId": "samples",
                    "path": "overlap/samples.shp",
                    "adapterId": "shapefile",
                    "formatId": "shapefile",
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
    assert {layer["source_format"] for layer in qc["layers"]} == {"shapefile"}
    overlap = json.loads((out / "vector_overlap.json").read_text())
    assert overlap["rows"]
    assert all("does not establish geological" in row["reason"] for row in overlap["rows"])
    exported = json.loads((out / "vector_export_1.geojson").read_text())
    assert exported["type"] == "FeatureCollection"
    assert exported["features"][0]["properties"]["_g_aid_source_format"] == "shapefile"
    meta = json.loads((out / "vector_export.meta.json").read_text())
    assert meta["shapefile"] is False
    assert meta["geopackage"] is False
    interp = json.loads((out / "vector_interpretation.json").read_text())
    assert interp["geological_certainty_improved"] is False
    assert any("GeoPackage ingest is not established" in line for line in interp["not_established"])
    assert not any("Shapefile or GeoPackage ingest is not established" in line for line in interp["not_established"])


def test_kernels_refuse_empty_catalog_inputs(tmp_path):
    from kernels.vector import vector_ingest

    payload = {"parameters": {"baseDir": str(FIXTURE), "outDir": str(tmp_path / "G-AID Output" / "runs"), "taskFolder": "r-empty"}}
    (tmp_path / "G-AID Output" / "runs" / "r-empty").mkdir(parents=True)
    with pytest.raises(ValueError, match="catalogInputs"):
        vector_ingest(payload)


def test_crs_conflict_blocks_overlap_without_reprojection(tmp_path):
    from kernels.vector import vector_ingest, vector_overlap

    out = tmp_path / "G-AID Output" / "runs" / "r-shp-conflict"
    out.mkdir(parents=True)
    payload = {
        "parameters": {
            "baseDir": str(FIXTURE),
            "outDir": str(tmp_path / "G-AID Output" / "runs"),
            "taskFolder": "r-shp-conflict",
            "catalogInputs": [
                {
                    "catalogId": "utm",
                    "path": "conflict-crs/utm_samples.shp",
                    "adapterId": "shapefile",
                    "formatId": "shapefile",
                    "checksum": "a",
                },
                {
                    "catalogId": "wgs",
                    "path": "conflict-crs/wgs_samples.shp",
                    "adapterId": "shapefile",
                    "formatId": "shapefile",
                    "checksum": "b",
                },
            ],
        }
    }
    vector_ingest(payload)
    vector_overlap(payload)
    overlap = json.loads((out / "vector_overlap.json").read_text())
    assert overlap["blocked"]
    assert overlap["reprojected"] is False
    assert "Reprojection is not a registered capability" in overlap["blocked"][0]["reason"]
