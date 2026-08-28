"""G-AID GEOCHEM 1.0 parser tests. Element-like names are not geochemistry."""

from __future__ import annotations

from pathlib import Path

import pytest

from formats.geochem import looks_like_geochem, parse_censored, parse_geochem_table

FIXTURE = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "geochem-project"
CHEM = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "catalog-project" / "tables" / "chemistry.csv"


def test_chemistry_csv_is_not_geochem():
    text = CHEM.read_text(encoding="utf-8")
    assert looks_like_geochem(text) is False
    with pytest.raises(ValueError, match="not a G-AID GEOCHEM"):
        parse_geochem_table(str(CHEM))


def test_valid_assays_preserve_units_and_medium():
    parsed = parse_geochem_table(str(FIXTURE / "valid" / "assays.csv"))
    assert parsed["crs"] == "EPSG:32734"
    assert parsed["medium"] == "soil"
    assert parsed["n"] == 5
    assert parsed["replaced_bdl_with_zero"] is False
    first = parsed["samples"][0]
    assert first["sample_id"] == "S-001"
    assert first["values"]["Au_ppm"]["value"] == 0.12
    assert first["values"]["Au_ppm"]["censored"] is False
    assert first["values"]["Au_ppm"]["kind"] == "raw"


def test_bdl_is_censored_not_zero():
    parsed = parse_geochem_table(str(FIXTURE / "bdl" / "assays.csv"))
    au = parsed["samples"][0]["values"]["Au_ppm"]
    assert au["censored"] is True
    assert au["value"] is None
    assert au["value"] != 0
    assert parsed["replaced_bdl_with_zero"] is False


def test_mixed_units_are_preserved():
    parsed = parse_geochem_table(str(FIXTURE / "mixed-units" / "assays.csv"))
    assert parsed["mixed_units"] is True
    assert "ppm" in parsed["units"]
    assert "pct" in parsed["units"]


def test_xyz_contract():
    parsed = parse_geochem_table(str(FIXTURE / "xyz" / "assays.xyz"))
    assert parsed["n"] == 2
    assert parsed["medium"] == "rock"


def test_missing_crs_is_refused():
    with pytest.raises(ValueError, match="documented CRS"):
        parse_geochem_table(str(FIXTURE / "missing-crs" / "assays.csv"))


def test_unreviewed_noncanonical_mapping_is_refused():
    with pytest.raises(ValueError, match="reviewed column mapping"):
        parse_geochem_table(str(FIXTURE / "unknown-headers" / "assays.csv"))


def test_reviewed_mapping_allows_noncanonical_headers():
    mapping = {
        "sampleId": "SITE",
        "x": "Easting",
        "y": "Northing",
        "elements": [
            {"column": "Au", "symbol": "Au", "units": "ppm"},
            {"column": "Cu", "symbol": "Cu", "units": "ppm"},
        ],
        "reviewed": True,
    }
    parsed = parse_geochem_table(str(FIXTURE / "unknown-headers" / "assays.csv"), mapping=mapping)
    assert parsed["n"] == 2
    assert parsed["samples"][0]["values"]["Au_ppm"]["value"] == 0.12


def test_censored_parser_tokens():
    assert parse_censored("<0.01")["censored"] is True
    assert parse_censored("<0.01")["numeric"] is None
    assert parse_censored("BDL")["censored"] is True
    assert parse_censored("0.2")["numeric"] == 0.2
