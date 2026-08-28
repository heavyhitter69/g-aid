"""Geospatial writers: ESRI ASCII Grid, GeoTIFF, GeoJSON, WKT.

ASCII Grid is the interchange format QGIS and ArcGIS open without plugins.
GeoTIFF is written as uncompressed little-endian TIFF with GeoTIFF 1.0 tags
(ModelPixelScale, ModelTiepoint, GeoKeyDirectory) so GDAL/QGIS read CRS.
"""

from __future__ import annotations

import json
import os
import struct
from typing import Iterable

import numpy as np

from science.crs import CRS, CRS_WGS84, utm_crs
from science.grid import Grid


def read_ascii_grid(path: str) -> Grid:
    with open(path, encoding="utf-8", errors="ignore") as handle:
        lines = handle.read().splitlines()
    meta: dict[str, float] = {}
    comment_meta: dict[str, str] = {}
    i = 0
    header_keys = {"ncols", "nrows", "xllcorner", "yllcorner", "xllcenter", "yllcenter", "cellsize", "nodata_value"}
    while i < len(lines):
        raw = lines[i].strip()
        if not raw or raw.startswith(("/", "#", ";", "\\")):
            if raw.startswith(("/", "#", ";", "\\")):
                for key in ("Units", "Quantity", "Channel"):
                    prefix = f"{key}="
                    lowered = raw.lstrip("/#;\\").strip()
                    if lowered.lower().startswith(key.lower() + "="):
                        comment_meta[key.lower()] = lowered.split("=", 1)[1].strip()
            i += 1
            continue
        parts = raw.split()
        if len(parts) < 2:
            break
        key = parts[0].lower()
        if key not in header_keys:
            break
        meta[key] = float(parts[1])
        i += 1
    nx = int(meta["ncols"])
    ny = int(meta["nrows"])
    vals: list[float] = []
    for line in lines[i:]:
        for part in line.split():
            vals.append(float(part))
            if len(vals) >= nx * ny:
                break
        if len(vals) >= nx * ny:
            break
    arr = np.array(vals[: nx * ny], float).reshape(ny, nx)
    cell = meta.get("cellsize", 1.0)
    x0 = meta.get("xllcorner")
    y0 = meta.get("yllcorner")
    if x0 is None and "xllcenter" in meta:
        x0 = meta["xllcenter"] - cell / 2.0
    if y0 is None and "yllcenter" in meta:
        y0 = meta["yllcenter"] - cell / 2.0
    metadata = {}
    if comment_meta.get("quantity"):
        metadata["quantity"] = comment_meta["quantity"]
    if comment_meta.get("channel"):
        metadata["channel"] = comment_meta["channel"]
    return Grid(
        values=arr,
        x0=float(x0 or 0.0),
        y0=float(y0 or 0.0),
        dx=cell,
        dy=cell,
        nodata=meta.get("nodata_value", -9999.0),
        name=os.path.splitext(os.path.basename(path))[0],
        units=comment_meta.get("units") or "nT",
        metadata=metadata,
    )


def write_ascii_grid(grid: Grid, path: str, crs: CRS | None = None) -> str:
    crs = crs or CRS(grid.crs_epsg, f"EPSG:{grid.crs_epsg}", "projected" if grid.crs_epsg != 4326 else "geographic")
    data = grid.masked()
    nodata = grid.nodata
    filled = np.where(np.isfinite(data), data, nodata)
    lines = [
        f"ncols         {grid.nx}",
        f"nrows         {grid.ny}",
        f"xllcorner     {grid.xmin:.8f}",
        f"yllcorner     {grid.ymin:.8f}",
        f"cellsize      {grid.dx:.8f}",
        f"NODATA_value  {nodata}",
    ]
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
        for row in filled:
            handle.write(" ".join(f"{v:.8g}" for v in row) + "\n")
    prj = os.path.splitext(path)[0] + ".prj"
    with open(prj, "w", encoding="utf-8") as handle:
        handle.write(crs.wkt())
    return path


def write_xyz(grid: Grid, path: str) -> str:
    xs = grid.x_centres()
    ys = grid.y_centres()
    data = grid.masked()
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("X Y Z\n")
        for iy, y in enumerate(ys):
            for ix, x in enumerate(xs):
                z = data[iy, ix]
                if np.isfinite(z):
                    handle.write(f"{x:.4f} {y:.4f} {z:.6f}\n")
    return path


def write_geojson_points(
    x,
    y,
    properties: list[dict] | None,
    path: str,
    crs_epsg: int = 4326,
    collection: dict | None = None,
) -> str:
    feats = []
    props = properties or [{}] * len(x)
    for xi, yi, prop in zip(x, y, props):
        if not (np.isfinite(xi) and np.isfinite(yi)):
            continue
        feats.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [float(xi), float(yi)]},
                "properties": {k: _jsonable(v) for k, v in prop.items()},
            }
        )
    payload = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": f"EPSG:{crs_epsg}"}},
        "features": feats,
    }
    if collection:
        payload.update({k: _jsonable(v) for k, v in collection.items()})
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
    return path


def write_geojson_lines(lines: Iterable[list[tuple[float, float]]], path: str, properties: list[dict] | None = None, crs_epsg: int = 4326) -> str:
    feats = []
    props = list(properties or [])
    for i, coords in enumerate(lines):
        if len(coords) < 2:
            continue
        feats.append(
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": [[float(a), float(b)] for a, b in coords]},
                "properties": props[i] if i < len(props) else {"id": i},
            }
        )
    payload = {
        "type": "FeatureCollection",
        "crs": {"type": "name", "properties": {"name": f"EPSG:{crs_epsg}"}},
        "features": feats,
    }
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
    return path


def write_geotiff(grid: Grid, path: str, crs: CRS | None = None) -> str:
    """Minimal uncompressed GeoTIFF 1.0 (little-endian). QGIS/GDAL readable."""
    crs = crs or CRS(grid.crs_epsg, f"EPSG:{grid.crs_epsg}", "projected" if grid.crs_epsg != 4326 else "geographic")
    data = grid.masked().astype(np.float32)
    data = np.where(np.isfinite(data), data, np.float32(grid.nodata))
    ny, nx = data.shape
    # TIFF: pixel (0,0) is upper-left. Our grid row 0 is already north.
    raw = data.tobytes(order="C")
    # GeoTIFF: ModelTiepoint maps raster (0,0) to (xmin, ymax) in map coords.
    # ModelPixelScale = (dx, dy, 0)
    entries, extra = _geotiff_ifd(nx, ny, len(raw), grid, crs)
    header = b"II" + struct.pack("<H", 42) + struct.pack("<I", 8)
    ifd_count = struct.pack("<H", len(entries))
    ifd = b"".join(entries)
    next_ifd = struct.pack("<I", 0)
    with open(path, "wb") as handle:
        handle.write(header)
        handle.write(ifd_count)
        handle.write(ifd)
        handle.write(next_ifd)
        handle.write(extra)
        handle.write(raw)
    return path


def _geotiff_ifd(nx: int, ny: int, data_bytes: int, grid: Grid, crs: CRS) -> tuple[list[bytes], bytes]:
    # Layout after 8-byte header: 2 + n*12 + 4, then extra values, then strip.
    n_tags = 14
    ifd_start = 8
    extra_start = ifd_start + 2 + n_tags * 12 + 4
    bits = struct.pack("<H", 32)
    # We'll append extras in order and record offsets.
    extras = bytearray()

    def add_extra(blob: bytes) -> int:
        off = extra_start + len(extras)
        extras.extend(blob)
        if len(extras) % 2:
            extras.extend(b"\x00")
        return off

    strip_offset_placeholder = extra_start  # updated after extras known — compute later

    # Geo keys
    # 1=GTModelTypeGeoKey, 2=GTRasterTypeGeoKey, 3072=ProjectedCSTypeGeoKey or 2048=GeographicTypeGeoKey
    if crs.epsg == 4326:
        geokeys = struct.pack(
            "<HHHH" + "HHHH" * 3,
            1, 1, 0, 3,
            1024, 0, 1, 2,  # ModelType Geographic
            1025, 0, 1, 1,  # RasterPixelIsArea
            2048, 0, 1, 4326,
        )
    else:
        geokeys = struct.pack(
            "<HHHH" + "HHHH" * 3,
            1, 1, 0, 3,
            1024, 0, 1, 1,  # ModelType Projected
            1025, 0, 1, 1,
            3072, 0, 1, int(crs.epsg),
        )
    pixel_scale = struct.pack("<ddd", float(grid.dx), float(grid.dy), 0.0)
    tiepoint = struct.pack("<dddddd", 0.0, 0.0, 0.0, float(grid.xmin), float(grid.ymax), 0.0)
    nodata_ascii = f"{grid.nodata}".encode("ascii") + b"\x00"

    # First pass extras: bits already inline. Collect offsets.
    # We need strip offset after extras. So extras = pixel_scale + tie + geokeys + nodata
    off_scale = extra_start
    extras.extend(pixel_scale)
    off_tie = extra_start + len(extras)
    extras.extend(tiepoint)
    off_geo = extra_start + len(extras)
    extras.extend(geokeys)
    off_nodata = extra_start + len(extras)
    extras.extend(nodata_ascii)
    if len(extras) % 2:
        extras.extend(b"\x00")
    strip_offset = extra_start + len(extras)

    def tag(code: int, typ: int, count: int, value: int) -> bytes:
        return struct.pack("<HHII", code, typ, count, value)

    def tag_short(code: int, value: int) -> bytes:
        return struct.pack("<HHIHH", code, 3, 1, value, 0)

    def tag_long(code: int, value: int) -> bytes:
        return tag(code, 4, 1, value)

    entries = [
        tag_long(256, nx),  # ImageWidth
        tag_long(257, ny),  # ImageLength
        tag_short(258, 32),  # BitsPerSample
        tag_short(259, 1),  # Compression none
        tag_short(262, 1),  # Photometric min-is-black
        tag_long(273, strip_offset),  # StripOffsets
        tag_short(277, 1),  # SamplesPerPixel
        tag_long(278, ny),  # RowsPerStrip
        tag_long(279, data_bytes),  # StripByteCounts
        tag_short(339, 3),  # SampleFormat IEEE float
        tag(33550, 12, 3, off_scale),  # ModelPixelScaleTag double x3
        tag(33922, 12, 6, off_tie),  # ModelTiepointTag double x6
        tag(34735, 3, 16, off_geo),  # GeoKeyDirectory SHORT x16 (4 + 3*4)
        tag(42113, 2, len(nodata_ascii), off_nodata),  # GDAL_NODATA
    ]
    if len(entries) != n_tags:
        raise RuntimeError("GeoTIFF tag count mismatch")
    return entries, bytes(extras)


def _jsonable(value):
    if isinstance(value, (np.floating, np.integer)):
        return float(value) if isinstance(value, np.floating) else int(value)
    if isinstance(value, np.ndarray):
        return value.tolist()
    return value


def export_grid_bundle(grid: Grid, directory: str, basename: str, crs: CRS | None = None) -> dict[str, str]:
    os.makedirs(directory, exist_ok=True)
    crs = crs or CRS(grid.crs_epsg, f"EPSG:{grid.crs_epsg}", "projected" if grid.crs_epsg != 4326 else "geographic")
    paths = {
        "asc": os.path.join(directory, f"{basename}.asc"),
        "tif": os.path.join(directory, f"{basename}.tif"),
        "xyz": os.path.join(directory, f"{basename}.xyz"),
    }
    write_ascii_grid(grid, paths["asc"], crs)
    write_geotiff(grid, paths["tif"], crs)
    write_xyz(grid, paths["xyz"])
    meta_path = os.path.join(directory, f"{basename}.meta.json")
    with open(meta_path, "w", encoding="utf-8") as handle:
        json.dump(
            {
                "name": grid.name,
                "units": grid.units or "unknown",
                "quantity": (grid.metadata or {}).get("quantity"),
                "channel": (grid.metadata or {}).get("channel"),
                "crs_epsg": grid.crs_epsg,
            },
            handle,
        )
    paths["meta"] = meta_path
    return paths
