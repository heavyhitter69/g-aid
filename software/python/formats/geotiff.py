"""Classic TIFF/GeoTIFF IFD metadata. Pixel arrays are never loaded."""

from __future__ import annotations

import struct
from pathlib import Path
from typing import Any

TYPE_SIZE = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}
MAX_GRID_CELLS = 2_000_000
MAX_GRID_DIM = 4000


def _u16(buf: bytes, off: int, endian: str) -> int:
    return struct.unpack_from("<H" if endian == "<" else ">H", buf, off)[0]


def _u32(buf: bytes, off: int, endian: str) -> int:
    return struct.unpack_from("<I" if endian == "<" else ">I", buf, off)[0]


def _compression_name(code: int | None) -> str:
    if code == 1:
        return "uncompressed"
    if code == 5:
        return "lzw"
    if code == 7:
        return "jpeg"
    if code in {8, 32946}:
        return "deflate"
    if code == 32773:
        return "packbits"
    if code is None:
        return "unknown"
    return "other"


def _dtype(bits: int | None, sample_format: int | None) -> str:
    fmt = sample_format or 1
    if bits == 8 and fmt == 1:
        return "uint8"
    if bits == 16 and fmt == 1:
        return "uint16"
    if bits == 16 and fmt == 2:
        return "int16"
    if bits == 32 and fmt == 2:
        return "int32"
    if bits == 32 and fmt == 3:
        return "float32"
    if bits:
        return f"bits{bits}-fmt{fmt}"
    return "unknown"


def inspect_geotiff(path: str | Path) -> dict[str, Any]:
    p = Path(path)
    size = p.stat().st_size
    with p.open("rb") as handle:
        header = handle.read(8)
        if len(header) < 4:
            return {"looks_like_tiff": False, "errors": ["Not a TIFF signature."], "pixels_loaded": False}
        if header[:2] == b"II":
            endian = "<"
        elif header[:2] == b"MM":
            endian = ">"
        else:
            return {"looks_like_tiff": False, "errors": ["Not a TIFF signature."], "pixels_loaded": False}
        magic = _u16(header, 2, endian)
        if magic == 43:
            return {
                "looks_like_tiff": True,
                "is_bigtiff": True,
                "raster_contract": "bigtiff",
                "support_status": "recognised-unsupported",
                "pixels_loaded": False,
                "pixels_decodable": False,
                "errors": ["BigTIFF is recognised-unsupported."],
                "notes": ["Pixel values were not loaded."],
            }
        if magic != 42:
            return {"looks_like_tiff": False, "errors": ["Not a Classic TIFF magic."], "pixels_loaded": False}
        ifd = _u32(header, 4, endian)
        if not ifd or ifd + 2 > size:
            return {
                "looks_like_tiff": True,
                "is_bigtiff": False,
                "support_status": "recognised-unsupported",
                "pixels_loaded": False,
                "errors": ["TIFF IFD offset is missing."],
            }
        handle.seek(ifd)
        count_buf = handle.read(2)
        n = _u16(count_buf, 0, endian)
        entries = handle.read(n * 12 + 4)
        tags: dict[int, dict[str, Any]] = {}
        for i in range(n):
            o = i * 12
            if o + 12 > len(entries):
                break
            code = _u16(entries, o, endian)
            typ = _u16(entries, o + 2, endian)
            count = _u32(entries, o + 4, endian)
            val = _u32(entries, o + 8, endian)
            extra = b""
            nbytes = TYPE_SIZE.get(typ, 1) * count
            if nbytes > 4 and val + nbytes <= size:
                handle.seek(val)
                extra = handle.read(min(nbytes, 65536))
            tags[code] = {"typ": typ, "count": count, "val": val, "extra": extra}

        extra_ifds = 0
        if n * 12 + 4 <= len(entries):
            nxt = _u32(entries, n * 12, endian)
            while nxt and extra_ifds < 16 and nxt + 2 <= size:
                extra_ifds += 1
                handle.seek(nxt)
                cn_buf = handle.read(2)
                if len(cn_buf) < 2:
                    break
                cn = _u16(cn_buf, 0, endian)
                handle.seek(nxt + 2 + cn * 12)
                ptr = handle.read(4)
                if len(ptr) < 4:
                    break
                nxt = _u32(ptr, 0, endian)

    def tag_num(code: int) -> int | None:
        tag = tags.get(code)
        if not tag:
            return None
        if tag["typ"] == 3:
            return tag["val"] & 0xFFFF
        return tag["val"]

    def doubles(code: int, count: int) -> list[float]:
        extra = tags.get(code, {}).get("extra") or b""
        fmt = ("<" if endian == "<" else ">") + "d"
        out = []
        n = min(count, len(extra) // 8)
        for i in range(n):
            out.append(struct.unpack_from(fmt, extra, i * 8)[0])
        return out

    width = tag_num(256)
    height = tag_num(257)
    bits = tag_num(258)
    compression = tag_num(259) or 1
    samples = tag_num(277) or 1
    sample_format = tag_num(339) or 1
    tile_w = tag_num(322)
    tile_h = tag_num(323)
    tiled = bool(tile_w and tile_h)
    scale = doubles(33550, 3)
    tie = doubles(33922, 6)
    geo = tags.get(34735, {}).get("extra") or b""
    epsg = None
    if len(geo) >= 8:
        nkeys = _u16(geo, 6, endian)
        usable = min(nkeys, (len(geo) - 8) // 8)
        for i in range(usable):
            o = 8 + i * 8
            kid = _u16(geo, o, endian)
            value = _u16(geo, o + 6, endian)
            if kid in (3072, 2048):
                epsg = value
                break
    nodata = None
    nodata_raw = tags.get(42113, {}).get("extra") or b""
    if nodata_raw:
        try:
            nodata = float(nodata_raw.decode("ascii", "ignore").strip("\0").strip())
        except ValueError:
            nodata = None

    affine = None
    bbox = None
    if len(scale) >= 2 and len(tie) >= 6 and width and height:
        pixel_w = scale[0]
        pixel_h = -abs(scale[1] or scale[0])
        ox, oy = tie[3], tie[4]
        affine = [ox, pixel_w, 0.0, oy, 0.0, pixel_h]
        x1 = ox + width * pixel_w
        y1 = oy + height * pixel_h
        bbox = {
            "minX": min(ox, x1),
            "minY": min(oy, y1),
            "maxX": max(ox, x1),
            "maxY": max(oy, y1),
        }

    cells = (width or 0) * (height or 0)
    preview = bool(width and height) and (
        width > MAX_GRID_DIM or height > MAX_GRID_DIM or cells > MAX_GRID_CELLS
    )
    layout = "tiled" if tiled else "strips" if 273 in tags else "unknown"
    cog_like = tiled and extra_ifds > 0
    pixels_decodable = (
        compression == 1
        and layout == "strips"
        and bool(width and height)
        and bits in {8, 16, 32}
        and not preview
    )
    errors = []
    if not width or not height:
        errors.append("TIFF ImageWidth/ImageLength tags were not parsed.")
    if not affine:
        errors.append("GeoTIFF geotransform was not parsed.")
    ready = bool(width and height and affine and not errors)
    crs = f"EPSG:{epsg}" if epsg else None
    notes = ["Pixel values were not loaded during catalog inspect."]
    if not pixels_decodable:
        notes.append(f"Pixel decode is not registered for {layout}/{_compression_name(compression)}.")
    if samples > 1:
        notes.append(f"Multiband raster ({samples} samples). Map display samples band 1 only.")
    return {
        "looks_like_tiff": True,
        "is_bigtiff": False,
        "endian": "LE" if endian == "<" else "BE",
        "width": width,
        "height": height,
        "band_count": samples,
        "bits_per_sample": bits,
        "sample_format": sample_format,
        "data_type": _dtype(bits, sample_format),
        "compression": _compression_name(compression),
        "compression_code": compression,
        "layout": "cog" if cog_like else layout,
        "overview_count": extra_ifds,
        "cog_like": cog_like,
        "geotransform": affine,
        "bbox": bbox,
        "cell_size": abs(scale[0]) if scale else None,
        "crs": crs,
        "crs_epsg": epsg,
        "crs_confidence": "high" if crs else "none",
        "crs_source": "geotiff-geokeys" if crs else None,
        "nodata": nodata,
        "pixels_loaded": False,
        "pixels_decodable": pixels_decodable,
        "preview_required": preview,
        "raster_contract": "cog-layout" if cog_like else "geotiff-classic",
        "source_format": "geotiff",
        "support_status": "supported" if ready else "recognised-unsupported",
        "reprojected": False,
        "errors": errors,
        "notes": notes,
        "checksum_strategy": "file",
        "source_path": str(p),
        "size": size,
    }
