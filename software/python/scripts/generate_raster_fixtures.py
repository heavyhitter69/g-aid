"""Write raster-project GeoTIFF fixtures used by catalog/map tests."""

from __future__ import annotations

import struct
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "python"))

from science.crs import CRS
from science.gis import write_geotiff
from science.grid import Grid

FIXTURE = ROOT / "tests" / "fixtures" / "raster-project"


def grid(
    values: list[list[float]],
    x0: float = 500000,
    y0: float = 6000000,
    dx: float = 10,
    epsg: int = 32630,
    nodata: float = -9999,
) -> Grid:
    arr = np.array(values, dtype=float)
    return Grid(values=arr, x0=x0, y0=y0, dx=dx, dy=dx, nodata=nodata, crs_epsg=epsg, units="metres", name="raster")


def write_bigtiff(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"II" + struct.pack("<H", 43) + struct.pack("<H", 8) + struct.pack("<H", 0) + struct.pack("<Q", 16))


def write_classic(
    path: Path,
    *,
    nx: int = 2,
    ny: int = 2,
    compression: int = 1,
    tiled: bool = False,
    extra_ifd: bool = False,
    omit_crs: bool = False,
    samples: int = 1,
) -> None:
    extras = bytearray()
    n_tags = 13 if omit_crs else 14
    extra_start = 8 + 2 + n_tags * 12 + 4

    def add(buf: bytes) -> int:
        off = extra_start + len(extras)
        extras.extend(buf)
        if len(buf) % 2:
            extras.extend(b"\0")
        return off

    scale = struct.pack("<ddd", 10.0, 10.0, 0.0)
    tie = struct.pack("<dddddd", 0, 0, 0, 500000.0, 6000000.0 + ny * 10.0, 0)
    geokeys = struct.pack("<HHHH", 1, 1, 0, 3)
    geokeys += struct.pack("<HHHH", 1024, 0, 1, 1)
    geokeys += struct.pack("<HHHH", 1025, 0, 1, 1)
    geokeys += struct.pack("<HHHH", 3072, 0, 1, 32630)
    nodata = b"-9999\0"
    off_scale = add(scale)
    off_tie = add(tie)
    off_geo = add(geokeys) if not omit_crs else 0
    off_nodata = add(nodata)
    payload_off = extra_start + len(extras)
    dummy = b"\x00" * 16

    def tag_long(code: int, value: int) -> bytes:
        return struct.pack("<HHI", code, 4, 1) + struct.pack("<I", value)

    def tag_short(code: int, value: int) -> bytes:
        return struct.pack("<HHI", code, 3, 1) + struct.pack("<HH", value, 0)

    def tag_off(code: int, typ: int, count: int, off: int) -> bytes:
        return struct.pack("<HHII", code, typ, count, off)

    layout = (
        [tag_long(322, 16), tag_long(323, 16), tag_long(324, payload_off)]
        if tiled
        else [tag_long(273, payload_off), tag_long(278, ny), tag_long(279, len(dummy))]
    )
    entries = [
        tag_long(256, nx),
        tag_long(257, ny),
        tag_short(258, 32),
        tag_short(259, compression),
        tag_short(262, 1),
        *layout,
        tag_short(277, samples),
        tag_short(339, 3),
        tag_off(33550, 12, 3, off_scale),
        tag_off(33922, 12, 6, off_tie),
        *([] if omit_crs else [tag_off(34735, 3, 16, off_geo)]),
        tag_off(42113, 2, len(nodata), off_nodata),
    ]
    extras_and_raw = bytes(extras) + dummy
    overview = b""
    next_ifd = 0
    if extra_ifd:
        ov = bytearray()
        ov.extend(struct.pack("<H", 4))
        ov.extend(tag_long(256, max(1, nx // 2)))
        ov.extend(tag_long(257, max(1, ny // 2)))
        ov.extend(tag_long(322, 16))
        ov.extend(tag_long(323, 16))
        ov.extend(struct.pack("<I", 0))
        overview = bytes(ov)
        next_ifd = 8 + 2 + len(entries) * 12 + 4 + len(extras_and_raw)
    header = b"II" + struct.pack("<H", 42) + struct.pack("<I", 8)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        header + struct.pack("<H", len(entries)) + b"".join(entries) + struct.pack("<I", next_ifd) + extras_and_raw + overview
    )


def main() -> None:
    FIXTURE.mkdir(parents=True, exist_ok=True)
    for name in ("valid-geotiff", "nodata", "crs-conflict"):
        (FIXTURE / name).mkdir(parents=True, exist_ok=True)
    write_geotiff(
        grid([[1, 2], [3, 4]]),
        str(FIXTURE / "valid-geotiff" / "grid.tif"),
        CRS(32630, "WGS 84 / UTM 30N", "projected"),
    )
    write_geotiff(grid([[1, -9999], [3, 4]], nodata=-9999), str(FIXTURE / "nodata" / "grid.tif"))
    write_geotiff(grid([[10, 20], [30, 40]]), str(FIXTURE / "crs-conflict" / "utm.tif"))
    write_classic(FIXTURE / "missing-crs" / "grid.tif", omit_crs=True)
    write_classic(FIXTURE / "compressed" / "grid.tif", compression=5)
    write_classic(FIXTURE / "cog-tiled" / "grid.tif", nx=4, ny=4, tiled=True, extra_ifd=True)
    write_classic(FIXTURE / "huge" / "grid.tif", nx=8192, ny=8192)
    write_classic(FIXTURE / "multiband" / "grid.tif", samples=3)
    write_bigtiff(FIXTURE / "bigtiff" / "grid.tif")
    (FIXTURE / "unknown").mkdir(parents=True, exist_ok=True)
    (FIXTURE / "unknown" / "mystery.bin").write_bytes(bytes([0, 1, 2, 255]))
    print("wrote raster-project GeoTIFF fixtures")


if __name__ == "__main__":
    main()
