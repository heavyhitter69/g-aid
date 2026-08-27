"""Documented GeoJSON reader. RFC 7946 default CRS84 is not assumed."""

from __future__ import annotations

import json
import os
import re
from typing import Any

EPSG_RE = re.compile(r"EPSG[:\s]*([0-9]{4,6})", re.I)
AUTHORITY_RE = re.compile(r'AUTHORITY\["EPSG","(\d+)"\]', re.I)
COMMENT_RE = re.compile(r"/\s*EPSG\s*=\s*(\d{4,6})", re.I)


def _finite_pair(value: Any) -> tuple[float, float] | None:
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return None
    try:
        x = float(value[0])
        y = float(value[1])
    except (TypeError, ValueError):
        return None
    if x != x or y != y:  # NaN
        return None
    return x, y


def _line(coords: Any) -> list[tuple[float, float]]:
    if not isinstance(coords, list):
        return []
    out = []
    for item in coords:
        pair = _finite_pair(item)
        if pair:
            out.append(pair)
    return out


def _closed(ring: list[tuple[float, float]]) -> bool:
    return len(ring) >= 4 and ring[0] == ring[-1]


def _epsg_from_obj(obj: dict) -> int | None:
    crs = obj.get("crs") or {}
    props = crs.get("properties") if isinstance(crs, dict) else {}
    name = (props or {}).get("name") if isinstance(props, dict) else None
    if isinstance(name, str):
        match = EPSG_RE.search(name)
        if match:
            return int(match.group(1))
    extra = obj.get("properties") if isinstance(obj.get("properties"), dict) else {}
    for key in ("EPSG", "crs", "CRS"):
        match = EPSG_RE.search(str(extra.get(key) or ""))
        if match:
            return int(match.group(1))
    return None


def _epsg_from_prj(path: str) -> int | None:
    stem, _ = os.path.splitext(path)
    prj = stem + ".prj"
    if not os.path.isfile(prj):
        return None
    try:
        text = open(prj, encoding="utf-8", errors="replace").read()
    except OSError:
        return None
    auths = list(AUTHORITY_RE.finditer(text))
    if auths:
        return int(auths[-1].group(1))
    match = EPSG_RE.search(text)
    return int(match.group(1)) if match else None


def _walk_geom(geom: dict, errors: list[str]) -> tuple[str, list[tuple[float, float]]]:
    if not isinstance(geom, dict) or not geom.get("type"):
        errors.append("Feature is missing a geometry object.")
        return "", []
    gtype = str(geom.get("type"))
    coords = geom.get("coordinates")
    if gtype == "GeometryCollection":
        pts: list[tuple[float, float]] = []
        last = ""
        for child in geom.get("geometries") or []:
            ctype, cpts = _walk_geom(child if isinstance(child, dict) else {}, errors)
            if cpts:
                last = ctype or last
                pts.extend(cpts)
        return last or "GeometryCollection", pts
    if gtype == "Point":
        pair = _finite_pair(coords)
        if not pair:
            errors.append("Point coordinates are missing or not finite.")
            return gtype, []
        return gtype, [pair]
    if gtype == "MultiPoint" and isinstance(coords, list):
        pts = [p for p in (_finite_pair(item) for item in coords) if p]
        if not pts:
            errors.append("MultiPoint has no finite coordinates.")
        return gtype, pts
    if gtype == "LineString":
        pts = _line(coords)
        if len(pts) < 2:
            errors.append("LineString needs at least two finite positions.")
            return gtype, []
        return gtype, pts
    if gtype == "MultiLineString" and isinstance(coords, list):
        pts: list[tuple[float, float]] = []
        for line in coords:
            line_pts = _line(line)
            if len(line_pts) >= 2:
                pts.extend(line_pts)
        if not pts:
            errors.append("MultiLineString has no valid line.")
        return gtype, pts
    if gtype == "Polygon" and isinstance(coords, list):
        ring = _line(coords[0] if coords else [])
        if not _closed(ring):
            errors.append("Polygon exterior ring must be closed with at least four finite positions.")
            return gtype, []
        return gtype, ring
    if gtype == "MultiPolygon" and isinstance(coords, list):
        pts: list[tuple[float, float]] = []
        for poly in coords:
            if not isinstance(poly, list) or not poly:
                continue
            ring = _line(poly[0])
            if _closed(ring):
                pts.extend(ring)
        if not pts:
            errors.append("MultiPolygon has no valid closed exterior ring.")
        return gtype, pts
    errors.append(f"Geometry type {gtype} is not a supported processing geometry.")
    return gtype, []


def parse_geojson(path: str, role: str | None = None, role_reviewed: bool = False) -> dict:
    text = open(path, encoding="utf-8").read()
    try:
        obj = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"GeoJSON is not valid JSON: {exc}") from exc
    if not isinstance(obj, dict):
        raise ValueError("GeoJSON root must be an object.")

    features_in: list[dict]
    if obj.get("type") == "FeatureCollection" and isinstance(obj.get("features"), list):
        features_in = [item for item in obj["features"] if isinstance(item, dict)]
    elif obj.get("type") == "Feature":
        features_in = [obj]
    elif obj.get("type") and obj.get("coordinates") is not None:
        features_in = [{"type": "Feature", "geometry": obj, "properties": {}}]
    else:
        raise ValueError("Root must be a FeatureCollection, Feature, or geometry object.")

    errors: list[str] = []
    warnings = [
        "Attribute names have unknown semantics. Geology, tenure, and mineral meaning are not inferred from field names or filenames.",
    ]
    features = []
    types: set[str] = set()
    attrs: set[str] = set()
    xs: list[float] = []
    ys: list[float] = []
    for index, feature in enumerate(features_in):
        geom = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else feature
        gtype, pts = _walk_geom(geom if isinstance(geom, dict) else {}, errors)
        if gtype:
            types.add(gtype)
        if not pts:
            continue
        props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        for key in props:
            attrs.add(str(key))
        xs.extend(p[0] for p in pts)
        ys.extend(p[1] for p in pts)
        features.append(
            {
                "id": feature.get("id") if feature.get("id") is not None else index,
                "geometry_type": gtype,
                "coordinates": [{"x": x, "y": y} for x, y in pts],
                "properties": props,
                "semantics": "unknown",
            }
        )

    if not features:
        raise ValueError("No valid geometries after coordinate and ring checks. " + "; ".join(dict.fromkeys(errors)))

    epsg = _epsg_from_obj(obj)
    source = "geojson-crs" if epsg else None
    if epsg is None:
        comment = COMMENT_RE.search(text[:2000]) or EPSG_RE.search(text[:500])
        if comment:
            epsg = int(comment.group(1))
            source = "epsg-comment"
    if epsg is None:
        epsg = _epsg_from_prj(path)
        source = "companion-prj" if epsg else None
    if epsg is None:
        raise ValueError(
            "No documented EPSG. RFC 7946 lon/lat is not assumed. I will not invent a CRS or silently reproject."
        )

    unique_errors = list(dict.fromkeys(errors))
    return {
        "product_name": "G-AID documented GeoJSON vector layer",
        "format": "geojson",
        "crs_epsg": epsg,
        "crs": f"EPSG:{epsg}",
        "crs_source": source,
        "location_quality": "documented",
        "geometry_types": sorted(types),
        "attribute_names": sorted(attrs),
        "feature_count": len(features),
        "features": features,
        "bbox": {
            "minX": min(xs),
            "minY": min(ys),
            "maxX": max(xs),
            "maxY": max(ys),
        },
        "role": role or "generic-vector",
        "role_reviewed": bool(role_reviewed),
        "source_path": path,
        "warnings": warnings,
        "errors": unique_errors,
        "formula": "GeoJSON Feature/FeatureCollection with documented EPSG. Overlay is not geological proof.",
    }
