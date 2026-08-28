"""Raster inspect/view and documented DEM terrain view kernels.

No hillshade, slope, spectral indices, raster algebra, or silent reprojection.
Pixel cubes are not copied into run artifacts.
"""

from __future__ import annotations

import os

from science.artifacts import make_artifact, skipped, task_dir, write_json, write_lineage


def _params(payload: dict) -> dict:
    return payload.get("parameters") or {}


def _out(payload: dict) -> str:
    return task_dir(payload)


def _find(directory: str, *names: str) -> str:
    for name in names:
        path = os.path.join(directory, name)
        if os.path.isfile(path):
            return path
    raise FileNotFoundError(f"None of {names} found in {directory}")


def _bound_rasters(params: dict, adapters: set[str]) -> list[dict]:
    items = params.get("catalogInputs") or params.get("catalog_inputs") or []
    if not isinstance(items, list) or not items:
        raise ValueError("raster_inspect requires parameters.catalogInputs from the frozen plan.")
    out = []
    for item in items:
        if not isinstance(item, dict):
            continue
        adapter = str(item.get("adapterId") or item.get("kind") or "").lower()
        fmt = str(item.get("formatId") or "").lower()
        if adapter in adapters or fmt in adapters:
            out.append(item)
    if not out:
        raise ValueError(
            "No bound geotiff, esri-ascii-grid, or dem-ascii catalog records. I will not search by extension."
        )
    return out


def _abs(params: dict, item: dict) -> str:
    rel = str(item.get("path") or "")
    base = str(params.get("baseDir") or "")
    filepath = item.get("absPath") or item.get("abs_path")
    if filepath:
        filepath = str(filepath)
        if os.path.isabs(filepath):
            return filepath
        return os.path.abspath(os.path.join(base, rel or filepath))
    return os.path.abspath(os.path.join(base, rel))


def _inspect_one(item: dict, filepath: str) -> dict:
    adapter = str(item.get("adapterId") or item.get("kind") or item.get("formatId") or "").lower()
    if adapter == "dem-ascii":
        from pathlib import Path

        from formats.ascii_grid import inspect_ascii_grid
        from formats.dem import parse_dem_comments

        meta = inspect_ascii_grid(filepath)
        comments = parse_dem_comments(Path(filepath).read_text(encoding="utf-8", errors="replace")[:8000])
        datum_raw = (comments.get("elevationdatum") or comments.get("verticaldatum") or "").lower()
        if "ortho" in datum_raw:
            datum = "orthometric"
        elif "ellips" in datum_raw:
            datum = "ellipsoidal"
        else:
            datum = None
        meta["source_format"] = "dem-ascii"
        meta["raster_contract"] = "dem-ascii"
        meta["units"] = "m"
        meta["elevation_datum"] = datum
        meta["crs"] = meta.get("crs")
        meta["terrain"] = True
        meta["pixels_loaded"] = False
        return meta
    if adapter == "geotiff":
        from formats.geotiff import inspect_geotiff

        return inspect_geotiff(filepath)
    from formats.ascii_grid import inspect_ascii_grid

    return inspect_ascii_grid(filepath)


def raster_inspect(payload: dict) -> dict:
    node_id = "raster_inspect"
    out = _out(payload)
    params = _params(payload)
    layers = []
    sources = []
    events = []
    for item in _bound_rasters(params, {"geotiff", "esri-ascii-grid", "dem-ascii"}):
        filepath = _abs(params, item)
        parsed = _inspect_one(item, filepath)
        parsed["catalog_id"] = item.get("catalogId") or item.get("catalog_id")
        parsed["checksum"] = item.get("checksum")
        parsed["source_path"] = item.get("path") or filepath
        parsed["filename_dem_inference"] = False
        layers.append(parsed)
        sources.append(str(item.get("path") or filepath))
        events.append(
            {
                "type": "NODE_PROGRESS",
                "message": (
                    f"Inspected raster '{os.path.basename(filepath)}' "
                    f"{parsed.get('width')}x{parsed.get('height')} CRS={parsed.get('crs')} "
                    f"layout={parsed.get('layout')} pixels_loaded={parsed.get('pixels_loaded')}."
                ),
            }
        )
    qc = {
        "product_name": "G-AID documented raster layer",
        "format": "gis-raster",
        "layers": layers,
        "n_layers": len(layers),
        "reprojected": False,
        "pixels_loaded": False,
        "hillshade": False,
        "slope": False,
        "spectral_indices": False,
        "raster_algebra": False,
        "filename_dem_inference": False,
    }
    canonical = os.path.join(out, "raster_canonical.json")
    write_json(canonical, {"kind": "gis-raster", "layers": layers})
    qc_path = write_json(os.path.join(out, "raster_inspect_qc.json"), qc)
    write_lineage(out, node_id, "Documented raster inspect (metadata only)", {"n": len(layers)}, sources, [canonical, qc_path])
    return {
        "artifacts": [
            make_artifact("artifact-raster-canonical", "processed_dataset", "json", canonical, node_id),
            make_artifact("artifact-raster-inspect-qc", "qc_report", "json", qc_path, node_id),
        ],
        "events": events,
    }


def raster_view(payload: dict) -> dict:
    node_id = "raster_view"
    out = _out(payload)
    src = _find(out, "raster_canonical.json")
    import json

    with open(src, encoding="utf-8") as handle:
        canonical = json.load(handle)
    tracks = {
        "kind": "gis-raster",
        "product_name": "G-AID documented raster layer",
        "layers": [],
        "warnings": [
            "This layer is source raster values. It is not a remote-sensing interpretation.",
            "Overlay requires documented CRS compatibility. Coordinates were not reprojected.",
        ],
        "crs_required_for_overlay": True,
        "silent_reprojection": False,
    }
    for layer in canonical.get("layers") or []:
        tracks["layers"].append(
            {
                "source_path": layer.get("source_path"),
                "catalog_id": layer.get("catalog_id"),
                "crs": layer.get("crs"),
                "crs_source": layer.get("crs_source"),
                "crs_confidence": layer.get("crs_confidence"),
                "source_format": layer.get("source_format"),
                "bbox": layer.get("bbox"),
                "geotransform": layer.get("geotransform"),
                "nodata": layer.get("nodata"),
                "band_count": layer.get("band_count"),
                "data_type": layer.get("data_type"),
                "compression": layer.get("compression"),
                "layout": layer.get("layout"),
                "preview_required": layer.get("preview_required"),
                "pixels_decodable": layer.get("pixels_decodable"),
                "pixels_loaded": False,
                "overview_count": layer.get("overview_count"),
                "units": layer.get("units"),
                "origin": "source",
            }
        )
    path = write_json(os.path.join(out, "raster_tracks.json"), tracks)
    meta = write_json(
        os.path.join(out, "raster_tracks.meta.json"),
        {
            "kind": "gis-raster",
            "crs_required_for_overlay": True,
            "silent_reprojection": False,
            "filename_dem_inference": False,
            "pixels_loaded": False,
        },
    )
    write_lineage(out, node_id, "Raster viewer metadata", {"n": len(tracks["layers"])}, [src], [path, meta])
    return {
        "artifacts": [
            make_artifact("artifact-raster-tracks", "grid", "json", path, node_id),
            make_artifact("artifact-raster-tracks-meta", "qc_report", "json", meta, node_id),
        ],
        "events": [{"type": "NODE_PROGRESS", "message": "Wrote raster viewer metadata. Overlay is not a joint interpretation."}],
    }


def terrain_view(payload: dict) -> dict:
    node_id = "terrain_view"
    out = _out(payload)
    params = _params(payload)
    dems = _bound_rasters(params, {"dem-ascii"})
    if not dems:
        return skipped(node_id, "No documented dem-ascii catalog records. Filename DEM labels are not used.")
    src = os.path.join(out, "raster_canonical.json")
    import json

    layers = []
    if os.path.isfile(src):
        with open(src, encoding="utf-8") as handle:
            canonical = json.load(handle)
        layers = [layer for layer in canonical.get("layers") or [] if layer.get("source_format") == "dem-ascii" or layer.get("terrain")]
    if not layers:
        for item in dems:
            filepath = _abs(params, item)
            parsed = _inspect_one(item, filepath)
            parsed["catalog_id"] = item.get("catalogId") or item.get("catalog_id")
            parsed["source_path"] = item.get("path") or filepath
            layers.append(parsed)
    tracks = {
        "kind": "gis-terrain",
        "product_name": "G-AID documented terrain layer",
        "layers": layers,
        "warnings": [
            "Terrain viewing uses documented DEM ASCII elevations. Hillshade, slope, aspect, and terrain correction are not applied.",
            "A filename containing 'dem' is not a DEM.",
        ],
        "hillshade": False,
        "slope": False,
        "terrain_correction": False,
        "filename_dem_inference": False,
    }
    path = write_json(os.path.join(out, "terrain_tracks.json"), tracks)
    meta = write_json(
        os.path.join(out, "terrain_tracks.meta.json"),
        {
            "kind": "gis-terrain",
            "filename_dem_inference": False,
            "hillshade": False,
            "slope": False,
            "terrain_correction": False,
        },
    )
    write_lineage(out, node_id, "Documented DEM terrain viewer metadata", {"n": len(layers)}, [src] if os.path.isfile(src) else [], [path, meta])
    return {
        "artifacts": [
            make_artifact("artifact-terrain-tracks", "grid", "json", path, node_id),
            make_artifact("artifact-terrain-tracks-meta", "qc_report", "json", meta, node_id),
        ],
        "events": [
            {
                "type": "NODE_PROGRESS",
                "message": "Wrote terrain viewer metadata for documented DEM ASCII. Derivatives were not computed.",
            }
        ],
    }
