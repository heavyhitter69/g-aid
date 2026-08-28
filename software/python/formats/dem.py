"""G-AID DEM ASCII contract (Phase 5B).

Required for gravity terrain correction. An ESRI ASCII grid is not a
supported DEM unless the documented comments are present.

Required comments (any of / # ; prefixes):
  EPSG=<integer>
  Units=m
  ElevationDatum=orthometric|ellipsoidal
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from science.gis import read_ascii_grid

_HEADER = re.compile(
    r"^(?:/\s*|#\s*|;\s*)?(EPSG|CRS|Units|ElevationDatum|VerticalDatum)\s*=\s*(.+)$",
    re.IGNORECASE,
)


def parse_dem_comments(text: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        m = _HEADER.match(line)
        if not m:
            continue
        found[m.group(1).lower()] = m.group(2).strip()
    return found


def sniff_dem_ascii(path: str | Path) -> bool:
    p = Path(path)
    if p.suffix.lower() not in {".asc", ".grd", ".ascii"}:
        return False
    try:
        text = p.read_text(encoding="utf-8", errors="replace")[:8000]
    except OSError:
        return False
    comments = parse_dem_comments(text)
    epsg = comments.get("epsg") or comments.get("crs")
    units = comments.get("units")
    datum = comments.get("elevationdatum") or comments.get("verticaldatum")
    if not epsg or not units or not datum:
        return False
    return bool(re.search(r"(?im)^ncols\s+\d+", text))


def parse_dem_ascii(path: str | Path) -> dict[str, Any]:
    p = Path(path)
    text = p.read_text(encoding="utf-8", errors="replace")
    comments = parse_dem_comments(text)
    epsg_raw = comments.get("epsg") or comments.get("crs")
    units = (comments.get("units") or "").lower()
    datum = (comments.get("elevationdatum") or comments.get("verticaldatum") or "").lower()
    if not epsg_raw:
        raise ValueError("DEM ASCII requires / EPSG=<integer>.")
    m = re.search(r"(\d{4,6})", epsg_raw)
    if not m:
        raise ValueError(f"DEM ASCII EPSG is not an integer: {epsg_raw!r}")
    epsg = int(m.group(1))
    if units not in {"m", "metre", "meter", "metres", "meters"}:
        raise ValueError("DEM ASCII requires / Units=m.")
    if datum not in {"orthometric", "ellipsoidal"}:
        raise ValueError("DEM ASCII requires / ElevationDatum=orthometric|ellipsoidal.")
    grid = read_ascii_grid(p)
    grid.crs_epsg = epsg
    grid.units = "m"
    grid.name = p.stem
    grid.metadata.update(
        {
            "elevation_datum": "orthometric" if datum.startswith("ortho") else "ellipsoidal",
            "source": str(p),
        }
    )
    return {
        "epsg": epsg,
        "units": "m",
        "elevation_datum": "orthometric" if datum.startswith("ortho") else "ellipsoidal",
        "ncols": int(grid.nx),
        "nrows": int(grid.ny),
        "xllcorner": float(grid.x0),
        "yllcorner": float(grid.y0),
        "cellsize": float(grid.dx),
        "nodata": grid.nodata,
        "values": grid.values,
        "xmin": float(grid.xmin),
        "xmax": float(grid.xmax),
        "ymin": float(grid.ymin),
        "ymax": float(grid.ymax),
        "grid": grid,
    }
