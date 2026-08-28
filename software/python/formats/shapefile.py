"""Documented ESRI shapefile reader.

Requires .shp + .shx + .dbf together. Parses geometry records and DBF
attributes. Companion .prj must document an EPSG authority. Optional .cpg
declares DBF encoding.

This is a format adapter for the existing GIS vector pack. Layer purpose is
never inferred from the filename or DBF field names.
"""

from __future__ import annotations

import codecs
import hashlib
import math
import os
import re
import struct
import sys
from pathlib import Path
from typing import Any

from science.polygon_topology import assemble_polygon_parts, canonical_polygon

VENDOR = Path(__file__).resolve().parents[1] / "vendor"
if str(VENDOR) not in sys.path:
    sys.path.insert(0, str(VENDOR))

import shapefile as shapefile_lib  # vendored pyshp 2.3.1

AUTHORITY_RE = re.compile(r'AUTHORITY\["EPSG","(\d+)"\]', re.I)
EPSG_RE = re.compile(r"EPSG[:\s]*([0-9]{4,6})", re.I)

SUPPORTED_SHAPE_TYPES = {
    shapefile_lib.POINT: "Point",
    shapefile_lib.POLYLINE: "LineString",
    shapefile_lib.POLYGON: "Polygon",
    shapefile_lib.MULTIPOINT: "MultiPoint",
}

UNSUPPORTED_SHAPE_TYPES = {
    shapefile_lib.POINTZ: "PointZ",
    shapefile_lib.POLYLINEZ: "PolyLineZ",
    shapefile_lib.POLYGONZ: "PolygonZ",
    shapefile_lib.MULTIPOINTZ: "MultiPointZ",
    shapefile_lib.POINTM: "PointM",
    shapefile_lib.POLYLINEM: "PolyLineM",
    shapefile_lib.POLYGONM: "PolygonM",
    shapefile_lib.MULTIPOINTM: "MultiPointM",
    shapefile_lib.MULTIPATCH: "MultiPatch",
}

ENCODING_ALIASES = {
    "utf8": "utf-8",
    "utf-8": "utf-8",
    "cp1252": "cp1252",
    "windows-1252": "cp1252",
    "windows1252": "cp1252",
    "ansi": "cp1252",
    "latin1": "latin-1",
    "latin-1": "latin-1",
    "iso-8859-1": "latin-1",
    "iso8859-1": "latin-1",
}


def _stem(path: str) -> str:
    root, _ = os.path.splitext(path)
    return root


def _sibling(path: str, ext: str) -> str:
    return _stem(path) + ext


def _exists(path: str) -> bool:
    return os.path.isfile(path)


def _sha256(path: str) -> str | None:
    if not _exists(path):
        return None
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _normalize_encoding(name: str) -> str | None:
    key = re.sub(r"[^a-z0-9]+", "", name.strip().lower())
    aliases = {
        "utf8": "utf-8",
        "cp1252": "cp1252",
        "windows1252": "cp1252",
        "ansi": "cp1252",
        "latin1": "latin-1",
        "iso88591": "latin-1",
    }
    mapped = aliases.get(key)
    if mapped:
        return mapped
    try:
        codecs.lookup(name.strip())
        return name.strip()
    except LookupError:
        return None


def _read_cpg(path: str) -> tuple[str, str, list[str]]:
    cpg = _sibling(path, ".cpg")
    warnings: list[str] = []
    if _exists(cpg):
        raw = open(cpg, encoding="ascii", errors="replace").read().strip()
        codec = _normalize_encoding(raw)
        if not codec:
            raise ValueError(
                f"Shapefile .cpg declares encoding {raw!r}, which is not a documented codec. "
                "The dataset stays recognised-unsupported."
            )
        return codec, "cpg", warnings
    warnings.append(
        "No .cpg encoding declaration. DBF text is decoded as undeclared windows-1252/cp1252. "
        "This is not a silent UTF-8 assumption."
    )
    return "cp1252", "undeclared-cp1252", warnings


def _parse_prj(path: str) -> dict[str, Any]:
    prj = _sibling(path, ".prj")
    if not _exists(prj):
        raise ValueError(
            "Shapefile .prj is missing. A documented CRS is required. "
            "G-AID will not assume WGS 84 or silently reproject."
        )
    text = open(prj, encoding="utf-8", errors="replace").read()
    auths = list(AUTHORITY_RE.finditer(text))
    if auths:
        epsg = int(auths[-1].group(1))
        confidence = "high"
    else:
        match = EPSG_RE.search(text)
        if not match:
            raise ValueError(
                "Shapefile .prj has no EPSG authority. CRS is undocumented. "
                "The dataset stays recognised-unsupported."
            )
        epsg = int(match.group(1))
        confidence = "medium"
    geographic = epsg == 4326
    return {
        "crs": f"EPSG:{epsg}",
        "crs_epsg": epsg,
        "crs_source": "shapefile-prj",
        "crs_confidence": confidence,
        "axis_order": "lat-lon" if geographic else "east-north",
        "coordinate_order": "lon-lat" if geographic else "east-north",
        "prj_text": text.strip()[:800],
    }


def _finite(x: float, y: float) -> bool:
    return math.isfinite(x) and math.isfinite(y)


def _closed(ring: list[tuple[float, float]]) -> bool:
    return len(ring) >= 4 and ring[0] == ring[-1]


def _parts(shape: Any) -> list[list[tuple[float, float]]]:
    points = [(float(p[0]), float(p[1])) for p in (shape.points or [])]
    parts = list(shape.parts or [])
    if not parts:
        return [points] if points else []
    out: list[list[tuple[float, float]]] = []
    for i, start in enumerate(parts):
        end = parts[i + 1] if i + 1 < len(parts) else len(points)
        out.append(points[start:end])
    return out


def _geom_features(shape: Any, fid: str, props: dict[str, Any], errors: list[str], warnings: list[str]) -> list[dict]:
    stype = int(shape.shapeType)
    if stype == shapefile_lib.NULL:
        warnings.append(f"Feature {fid} is a null shape and was skipped. Coordinates were not invented.")
        return []
    if stype in UNSUPPORTED_SHAPE_TYPES:
        raise ValueError(
            f"Shapefile geometry type {UNSUPPORTED_SHAPE_TYPES[stype]} is not a validated processing geometry. "
            "Z/M and MultiPatch stay recognised-unsupported."
        )
    if stype not in SUPPORTED_SHAPE_TYPES:
        raise ValueError(f"Shapefile geometry type {stype} is not a supported processing geometry.")

    features: list[dict] = []
    if stype == shapefile_lib.POINT:
        if not shape.points:
            errors.append(f"Point {fid} has no coordinates.")
            return []
        x, y = float(shape.points[0][0]), float(shape.points[0][1])
        if not _finite(x, y):
            errors.append(f"Point {fid} has non-finite coordinates.")
            return []
        features.append(
            {
                "id": fid,
                "geometry_type": "Point",
                "coordinates": [{"x": x, "y": y}],
                "properties": props,
                "semantics": "unknown",
            }
        )
        return features

    if stype == shapefile_lib.MULTIPOINT:
        pts = []
        for i, point in enumerate(shape.points or []):
            x, y = float(point[0]), float(point[1])
            if not _finite(x, y):
                errors.append(f"MultiPoint {fid} has a non-finite vertex.")
                continue
            pts.append((x, y))
            features.append(
                {
                    "id": f"{fid}-pt{i + 1}" if len(shape.points or []) > 1 else fid,
                    "geometry_type": "Point",
                    "coordinates": [{"x": x, "y": y}],
                    "properties": props,
                    "semantics": "unknown",
                }
            )
        if not pts:
            errors.append(f"MultiPoint {fid} has no finite coordinates.")
        return features

    rings = _parts(shape)
    if stype == shapefile_lib.POLYLINE:
        for i, line in enumerate(rings):
            if any(not _finite(x, y) for x, y in line):
                errors.append(f"Polyline {fid} has non-finite coordinates.")
                continue
            if len(line) < 2:
                errors.append(f"Polyline {fid} needs at least two finite positions.")
                continue
            features.append(
                {
                    "id": f"{fid}-part{i + 1}" if len(rings) > 1 else fid,
                    "geometry_type": "LineString",
                    "coordinates": [{"x": x, "y": y} for x, y in line],
                    "properties": props,
                    "semantics": "unknown",
                }
            )
        return features

    if any(not _finite(x, y) for ring in rings for x, y in ring):
        errors.append(f"Polygon {fid} has non-finite coordinates.")
        return []
    assembled = assemble_polygon_parts(rings)
    if not assembled["ok"]:
        errors.extend(assembled["errors"] or [f"Polygon {fid} topology is invalid."])
        return []
    feature = canonical_polygon(assembled["parts"], fid, props)
    features.append(feature)
    return features


def _record_props(reader: Any, record: Any) -> dict[str, Any]:
    names = [item[0] for item in reader.fields[1:]]
    values = list(record) if not isinstance(record, dict) else [record.get(name) for name in names]
    props: dict[str, Any] = {}
    for name, value in zip(names, values):
        if isinstance(value, bytes):
            raise ValueError(f"DBF field {name} did not decode under the documented encoding.")
        if isinstance(value, str):
            props[name] = value.strip()
        else:
            props[name] = value
    return props


def parse_shapefile(path: str, role: str | None = None, role_reviewed: bool = False) -> dict:
    """Parse a shapefile dataset. Raises ValueError when the contract fails."""
    shp = path if path.lower().endswith(".shp") else path + ".shp"
    if not _exists(shp):
        raise ValueError(f"Shapefile {os.path.basename(shp)} is missing.")
    shx = _sibling(shp, ".shx")
    dbf = _sibling(shp, ".dbf")
    missing = [ext for ext, dest in ((".shx", shx), (".dbf", dbf)) if not _exists(dest)]
    if missing:
        raise ValueError(
            f"Shapefile sidecar set is incomplete (missing {', '.join(missing)}). "
            "A valid dataset needs .shp, .shx, and .dbf together. Sidecar names alone are not ingest."
        )

    encoding, encoding_source, warnings = _read_cpg(shp)
    crs_info = _parse_prj(shp)
    warnings.extend(
        [
            "Attribute names have unknown semantics. Geology, tenure, and mineral meaning are not inferred from field names or filenames.",
            f"CRS source is shapefile .prj ({crs_info['crs']}, confidence={crs_info['crs_confidence']}). Coordinates were not reprojected.",
        ]
    )

    try:
        reader = shapefile_lib.Reader(shp, encoding=encoding, encodingErrors="strict")
    except UnicodeDecodeError as exc:
        raise ValueError(
            f"DBF text is not valid {encoding} ({encoding_source}). The dataset stays recognised-unsupported."
        ) from exc
    except (shapefile_lib.ShapefileException, OSError, struct.error, ValueError) as exc:
        raise ValueError(f"Shapefile is unparseable: {exc}") from exc

    try:
        n_shp = len(reader.shapes())
        n_dbf = len(reader.records())
        shx_size = os.path.getsize(shx)
        n_shx = max(0, (shx_size - 100) // 8) if shx_size >= 100 else 0
    except (shapefile_lib.ShapefileException, OSError, ValueError, struct.error) as exc:
        reader.close()
        raise ValueError(f"Shapefile geometry or DBF records are corrupt: {exc}") from exc
    if n_shx and n_shx != n_shp:
        reader.close()
        raise ValueError(
            f"Shapefile SHX index count ({n_shx}) does not match SHP record count ({n_shp}). "
            "The dataset stays recognised-unsupported."
        )

    if n_shp != n_dbf:
        reader.close()
        raise ValueError(
            f"Shapefile geometry count ({n_shp}) does not match DBF record count ({n_dbf}). "
            "The dataset stays recognised-unsupported."
        )

    stype = int(reader.shapeType)
    if stype in UNSUPPORTED_SHAPE_TYPES:
        reader.close()
        raise ValueError(
            f"Shapefile geometry type {UNSUPPORTED_SHAPE_TYPES[stype]} is not a validated processing geometry."
        )
    if stype not in SUPPORTED_SHAPE_TYPES and stype != shapefile_lib.NULL:
        reader.close()
        raise ValueError(f"Shapefile geometry type {stype} is not a supported processing geometry.")

    errors: list[str] = []
    features: list[dict] = []
    types: set[str] = set()
    attrs: set[str] = set()
    seen_ids: dict[str, int] = {}
    xs: list[float] = []
    ys: list[float] = []

    try:
        pairs = list(reader.iterShapeRecords())
    except (UnicodeDecodeError, shapefile_lib.ShapefileException, ValueError, OSError) as exc:
        reader.close()
        if isinstance(exc, UnicodeDecodeError):
            raise ValueError(
                f"DBF text is not valid {encoding} ({encoding_source}). The dataset stays recognised-unsupported."
            ) from exc
        raise ValueError(f"Shapefile is unparseable: {exc}") from exc

    for index, pair in enumerate(pairs):
        props = _record_props(reader, pair.record)
        attrs.update(str(key) for key in props)
        raw_id = props.get("ID") or props.get("FID") or props.get("OBJECTID")
        fid = str(raw_id).strip() if raw_id not in (None, "") else str(index + 1)
        seen_ids[fid] = seen_ids.get(fid, 0) + 1
        try:
            geoms = _geom_features(pair.shape, fid, props, errors, warnings)
        except ValueError:
            reader.close()
            raise
        for feature in geoms:
            types.add(feature["geometry_type"])
            features.append(feature)
            for pt in feature["coordinates"]:
                xs.append(pt["x"])
                ys.append(pt["y"])

    reader.close()

    duplicates = sorted(key for key, count in seen_ids.items() if count > 1)
    if duplicates:
        warnings.append(
            f"Duplicate feature IDs were preserved and flagged ({', '.join(duplicates[:8])}). "
            "IDs were not rewritten."
        )

    if errors:
        raise ValueError(" ".join(dict.fromkeys(errors)))
    if not features:
        raise ValueError(
            "Shapefile has no valid Point/LineString/Polygon features after parsing. "
            "Null-only or empty datasets stay recognised-unsupported."
        )

    bbox = {"minX": min(xs), "minY": min(ys), "maxX": max(xs), "maxY": max(ys)}
    sidecars = {
        "shp": True,
        "shx": _exists(shx),
        "dbf": _exists(dbf),
        "prj": _exists(_sibling(shp, ".prj")),
        "cpg": _exists(_sibling(shp, ".cpg")),
    }
    checksums = {
        "shp": _sha256(shp),
        "shx": _sha256(shx),
        "dbf": _sha256(dbf),
        "prj": _sha256(_sibling(shp, ".prj")),
        "cpg": _sha256(_sibling(shp, ".cpg")),
    }
    return {
        "kind": "gis-vector",
        "source_format": "shapefile",
        "shapefile_contract": "esri-shp-shx-dbf-prj",
        "parser": "pyshp-2.3.1",
        "encoding": encoding,
        "encoding_source": encoding_source,
        "crs": crs_info["crs"],
        "crs_epsg": crs_info["crs_epsg"],
        "crs_source": crs_info["crs_source"],
        "crs_confidence": crs_info["crs_confidence"],
        "geojson_contract": None,
        "axis_order": crs_info["axis_order"],
        "coordinate_order": crs_info["coordinate_order"],
        "location_quality": "documented",
        "geometry_types": sorted(types),
        "attribute_names": sorted(attrs),
        "feature_count": len(features),
        "features": features,
        "bbox": bbox,
        "role": role or "generic-vector",
        "role_reviewed": bool(role_reviewed),
        "source_path": shp,
        "shapefile_sidecars": sidecars,
        "sidecar_checksums": checksums,
        "reprojected": False,
        "warnings": list(dict.fromkeys(warnings)),
        "errors": [],
        "formula": (
            "ESRI shapefile (.shp/.shx/.dbf) with documented .prj EPSG. "
            "Overlay is not geological proof. No silent reprojection or axis swap."
        ),
    }
