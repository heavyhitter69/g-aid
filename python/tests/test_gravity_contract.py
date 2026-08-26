"""Gravity ingest contract — named columns + documented CRS/units only."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from formats.gravity import parse_gravity_table, resolve_mapping

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "..", "tests", "fixtures", "gravity-project")


def test_valid_named_xyz():
    path = os.path.join(FIXTURES, "valid", "stations.xyz")
    df, qc = parse_gravity_table(path)
    assert len(df) == 9
    assert qc["crs_epsg"] == 32630
    assert qc["units_in"] == "mGal"
    assert qc["elevation_datum"] == "orthometric"
    assert "g_obs_mgal" in df.columns


def test_unnamed_xyz_rejected():
    path = os.path.join(FIXTURES, "unsupported-xyz", "random.xyz")
    try:
        parse_gravity_table(path)
        raise AssertionError("unnamed XYZ must be rejected")
    except ValueError as exc:
        assert "named gravity header" in str(exc)


def test_missing_crs_rejected():
    path = os.path.join(FIXTURES, "missing-crs", "stations.xyz")
    try:
        parse_gravity_table(path)
        raise AssertionError("missing CRS must be rejected")
    except ValueError as exc:
        assert "CRS" in str(exc)


def test_mixed_units_rejected():
    path = os.path.join(FIXTURES, "mixed-units", "stations.csv")
    try:
        parse_gravity_table(path)
        raise AssertionError("mixed units must be rejected")
    except ValueError as exc:
        assert "Mixed gravity units" in str(exc)


def test_unreviewed_alias_mapping_rejected():
    try:
        resolve_mapping(
            ["Easting", "Northing", "Grav"],
            {"x": "Easting", "y": "Northing", "gObs": "Grav", "reviewed": False},
        )
        raise AssertionError("unreviewed mapping must be rejected")
    except ValueError as exc:
        assert "not reviewed" in str(exc)


def test_reviewed_alias_mapping_accepted():
    mapping = resolve_mapping(
        ["Easting", "Northing", "Grav", "Height"],
        {"x": "Easting", "y": "Northing", "gObs": "Grav", "elevation": "Height", "reviewed": True},
    )
    assert mapping["gObs"] == "Grav"


if __name__ == "__main__":
    test_valid_named_xyz()
    test_unnamed_xyz_rejected()
    test_missing_crs_rejected()
    test_mixed_units_rejected()
    test_unreviewed_alias_mapping_rejected()
    test_reviewed_alias_mapping_accepted()
    print("ok gravity contract")
