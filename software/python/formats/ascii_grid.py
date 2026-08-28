"""ESRI ASCII grid metadata inspect. Cell arrays are not fully loaded."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

HEADER = re.compile(
    r"^(ncols|nrows|xllcorner|yllcorner|xllcenter|yllcenter|cellsize|nodata_value)\s+([-+0-9.eE]+)",
    re.IGNORECASE,
)
COMMENT = re.compile(r"^(?:/\s*|#\s*|;\s*)?(EPSG|CRS|Units)\s*=\s*(.+)$", re.IGNORECASE)
MAX_GRID_CELLS = 2_000_000
MAX_GRID_DIM = 4000
MAX_ASCII_BYTES = 32 * 1024 * 1024


def inspect_ascii_grid(path: str | Path, text: str | None = None) -> dict[str, Any]:
    p = Path(path)
    size = p.stat().st_size if p.exists() else 0
    if text is None:
        # Header plus a small sample only.
        raw = p.read_bytes()[: min(size, 65536)]
        text = raw.decode("utf-8", errors="replace")
    meta: dict[str, float] = {}
    comments: dict[str, str] = {}
    for line in text.splitlines():
        trimmed = line.strip()
        c = COMMENT.match(trimmed)
        if c:
            comments[c.group(1).lower()] = c.group(2).strip()
            continue
        if not trimmed or trimmed[:1] in "/#;":
            continue
        m = HEADER.match(trimmed)
        if not m:
            if meta:
                break
            continue
        meta[m.group(1).lower()] = float(m.group(2))
    ncols = int(meta["ncols"]) if "ncols" in meta else None
    nrows = int(meta["nrows"]) if "nrows" in meta else None
    cell = meta.get("cellsize")
    xll = meta.get("xllcorner", meta.get("xllcenter"))
    yll = meta.get("yllcorner", meta.get("yllcenter"))
    if "xllcenter" in meta and "xllcorner" not in meta and cell:
        xll = meta["xllcenter"] - cell / 2
    if "yllcenter" in meta and "yllcorner" not in meta and cell:
        yll = meta["yllcenter"] - cell / 2
    looks = ncols is not None and nrows is not None
    errors = []
    if not looks:
        return {"looks_like_ascii": False, "errors": ["Not an ESRI ASCII grid header."], "pixels_loaded": False}
    if not cell or cell <= 0:
        errors.append("ASCII grid cellsize is missing or invalid.")
    if xll is None or yll is None:
        errors.append("ASCII grid origin is missing.")
    bbox = None
    affine = None
    if looks and cell and xll is not None and yll is not None:
        bbox = {
            "minX": xll,
            "minY": yll,
            "maxX": xll + ncols * cell,
            "maxY": yll + nrows * cell,
        }
        affine = [xll, cell, 0.0, yll + nrows * cell, 0.0, -cell]
    epsg_raw = comments.get("epsg") or comments.get("crs")
    epsg = None
    if epsg_raw:
        m = re.search(r"(\d{4,6})", epsg_raw)
        if m:
            epsg = int(m.group(1))
    preview = bool(
        ncols and nrows and (ncols > MAX_GRID_DIM or nrows > MAX_GRID_DIM or ncols * nrows > MAX_GRID_CELLS or size > MAX_ASCII_BYTES)
    )
    ready = looks and not errors
    return {
        "looks_like_ascii": True,
        "width": ncols,
        "height": nrows,
        "band_count": 1,
        "data_type": "ascii-float",
        "compression": "uncompressed",
        "layout": "ascii",
        "geotransform": affine,
        "bbox": bbox,
        "cell_size": cell,
        "crs": f"EPSG:{epsg}" if epsg else None,
        "crs_epsg": epsg,
        "crs_confidence": "high" if epsg else "none",
        "crs_source": "epsg-comment" if epsg else None,
        "units": comments.get("units"),
        "nodata": meta.get("nodata_value"),
        "pixels_loaded": False,
        "pixels_decodable": not preview,
        "preview_required": preview,
        "raster_contract": "esri-ascii",
        "source_format": "esri-ascii-grid",
        "support_status": "supported" if ready else "recognised-unsupported",
        "reprojected": False,
        "errors": errors,
        "notes": [
            "ESRI ASCII grid. Cell values were not fully loaded into the catalog.",
            "A filename containing 'dem' does not make this a DEM.",
        ],
        "source_path": str(p),
        "size": size,
        "filename_dem_inference": False,
    }
