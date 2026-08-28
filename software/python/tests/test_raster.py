"""Raster inspect/view and DEM terrain-view kernel tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from formats.ascii_grid import inspect_ascii_grid
from formats.geotiff import inspect_geotiff
from kernels.raster import raster_inspect, raster_view, terrain_view

FIXTURE = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "raster-project"


def _payload(tmp_path: Path, inputs: list[dict]) -> dict:
    out = tmp_path / "G-AID Output" / "runs"
    out.mkdir(parents=True, exist_ok=True)
    return {
        "parameters": {
            "baseDir": str(FIXTURE),
            "outDir": str(out),
            "taskFolder": "run",
            "catalogInputs": inputs,
        }
    }


def _item(rel: str, adapter: str) -> dict:
    return {
        "catalogId": rel,
        "path": rel,
        "adapterId": adapter,
        "formatId": adapter,
        "absPath": str(FIXTURE / rel),
    }


def test_geotiff_metadata_preserves_crs_geotransform_and_does_not_load_pixels():
    parsed = inspect_geotiff(FIXTURE / "valid-geotiff" / "grid.tif")
    assert parsed["looks_like_tiff"] is True
    assert parsed["crs"] == "EPSG:32630"
    assert parsed["width"] == 2
    assert parsed["height"] == 2
    assert parsed["geotransform"]
    assert parsed["pixels_loaded"] is False
    assert parsed["support_status"] == "supported"


def test_compressed_and_cog_are_metadata_only():
    compressed = inspect_geotiff(FIXTURE / "compressed" / "grid.tif")
    assert compressed["compression"] == "lzw"
    assert compressed["pixels_decodable"] is False
    cog = inspect_geotiff(FIXTURE / "cog-tiled" / "grid.tif")
    assert cog["cog_like"] is True
    assert cog["pixels_decodable"] is False
    huge = inspect_geotiff(FIXTURE / "huge" / "grid.tif")
    assert huge["preview_required"] is True
    assert huge["pixels_loaded"] is False


def test_ascii_filename_dem_is_not_a_dem():
    named = inspect_ascii_grid(FIXTURE / "dem-filename-only" / "dem.asc")
    assert named["source_format"] == "esri-ascii-grid"
    assert named["filename_dem_inference"] is False
    assert named["support_status"] == "supported"
    from formats.dem import sniff_dem_ascii

    assert sniff_dem_ascii(FIXTURE / "ascii-valid" / "grid.asc") is False
    assert sniff_dem_ascii(FIXTURE / "dem-filename-only" / "dem.asc") is False
    assert sniff_dem_ascii(FIXTURE / "dem-valid" / "dem.asc") is True


def test_kernels_write_qc_without_pixel_cubes_or_hillshade(tmp_path: Path):
    payload = _payload(
        tmp_path,
        [
            _item("valid-geotiff/grid.tif", "geotiff"),
            _item("ascii-valid/grid.asc", "esri-ascii-grid"),
            _item("dem-valid/dem.asc", "dem-ascii"),
        ],
    )
    raster_inspect(payload)
    raster_view(payload)
    terrain_view(payload)
    out = tmp_path / "G-AID Output" / "runs" / "run"
    qc = json.loads((out / "raster_inspect_qc.json").read_text())
    assert qc["pixels_loaded"] is False
    assert qc["hillshade"] is False
    assert qc["slope"] is False
    assert qc["spectral_indices"] is False
    assert qc["raster_algebra"] is False
    assert qc["filename_dem_inference"] is False
    assert qc["reprojected"] is False
    tracks = json.loads((out / "raster_tracks.json").read_text())
    assert tracks["silent_reprojection"] is False
    terrain = json.loads((out / "terrain_tracks.json").read_text())
    assert terrain["terrain_correction"] is False
    assert any(layer.get("source_format") == "dem-ascii" for layer in terrain["layers"])


def test_terrain_view_ignores_filename_only_dem(tmp_path: Path):
    payload = _payload(tmp_path, [_item("dem-filename-only/dem.asc", "esri-ascii-grid")])
    with pytest.raises(ValueError, match="dem-ascii"):
        terrain_view(payload)
