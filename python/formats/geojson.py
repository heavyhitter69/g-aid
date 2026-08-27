"""Documented GeoJSON reader.

RFC 7946 GeoJSON with no crs member is OGC:CRS84 (lon, lat degrees).
A legacy crs member is not RFC 7946. Companion .prj / EPSG= comments are a
G-AID custom import contract.
"""

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


def _epsg_from_name(name: str | None) -> int | None:
    if not isinstance(name, str):
        return None
    match = EPSG_RE.search(name)
    return int(match.group(1)) if match else None


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

    bbox = {"minX": min(xs), "minY": min(ys), "maxX": max(xs), "maxY": max(ys)}
    crs_info = _resolve_crs(obj, text, path, bbox)
    if crs_info.get("error"):
        raise ValueError(crs_info["error"])
    warnings.extend(crs_info.get("warnings") or [])

    unique_errors = list(dict.fromkeys(errors))
    return {
        "product_name": "G-AID documented GeoJSON vector layer",
        "format": "geojson",
        "crs_epsg": crs_info.get("crs_epsg"),
        "crs": crs_info["crs"],
        "crs_source": crs_info["crs_source"],
        "geojson_contract": crs_info["geojson_contract"],
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
        "source_path": path,
        "warnings": list(dict.fromkeys(warnings)),
        "errors": unique_errors,
        "formula": "GeoJSON Feature/FeatureCollection with documented CRS. Overlay is not geological proof. No silent reprojection or axis swap.",
    }


def _geographic(bbox: dict) -> bool:
    return (
        abs(bbox["minX"]) <= 180
        and abs(bbox["maxX"]) <= 180
        and abs(bbox["minY"]) <= 90
        and abs(bbox["maxY"]) <= 90
    )


def _resolve_crs(obj: dict, text: str, path: str, bbox: dict) -> dict:
    warnings: list[str] = []
    has_legacy = "crs" in obj and obj.get("crs") is not None
    crs_member = obj.get("crs") if isinstance(obj.get("crs"), dict) else {}
    props = crs_member.get("properties") if isinstance(crs_member.get("properties"), dict) else {}
    member_epsg = _epsg_from_name(props.get("name") if isinstance(props, dict) else None)
    prj_epsg = _epsg_from_prj(path)
    comment = COMMENT_RE.search(text[:2000])
    extra = obj.get("properties") if isinstance(obj.get("properties"), dict) else {}
    prop_epsg = None
    for key in ("EPSG", "crs", "CRS"):
        prop_epsg = _epsg_from_name(str(extra.get(key) or ""))
        if prop_epsg:
            break

    if has_legacy:
        warnings.append("The legacy GeoJSON crs member is not the RFC 7946 CRS mechanism. This file is labeled legacy-GeoJSON.")
        if member_epsg and prj_epsg and member_epsg != prj_epsg:
            return {"error": f"Legacy crs member EPSG:{member_epsg} conflicts with companion .prj EPSG:{prj_epsg}. I will not pick one silently."}
        if not member_epsg:
            return {"error": "Legacy GeoJSON crs member is present but has no validated EPSG mapping. Overlay stays blocked until a user-confirmed CRS mapping exists."}
        if member_epsg == 4326:
            warnings.append("Legacy crs names EPSG:4326 (OGC axis order lat-lon). GeoJSON coordinate arrays stay [lon, lat]. G-AID will not silently swap axes or relabel this as OGC:CRS84.")
        return {
            "crs": f"EPSG:{member_epsg}",
            "crs_epsg": member_epsg,
            "crs_source": "legacy-crs",
            "geojson_contract": "legacy-geojson",
            "axis_order": "lat-lon" if member_epsg == 4326 else "east-north",
            "coordinate_order": "lon-lat" if member_epsg == 4326 else "east-north",
            "warnings": warnings,
        }

    custom = prj_epsg or (int(comment.group(1)) if comment else None) or prop_epsg
    if custom:
        warnings.append("Projected or annotated GeoJSON is a G-AID custom import contract, not standard RFC 7946 GeoJSON.")
        if custom == 4326:
            warnings.append("Custom import names EPSG:4326. GeoJSON coordinate arrays stay [lon, lat]. This is not OGC:CRS84 identity.")
        return {
            "crs": f"EPSG:{custom}",
            "crs_epsg": custom,
            "crs_source": "companion-prj" if prj_epsg else "epsg-comment",
            "geojson_contract": "g-aid-custom-import",
            "axis_order": "lat-lon" if custom == 4326 else "east-north",
            "coordinate_order": "lon-lat" if custom == 4326 else "east-north",
            "warnings": warnings,
        }
    if os.path.isfile(os.path.splitext(path)[0] + ".prj"):
        return {"error": "Companion .prj has no EPSG authority. G-AID custom import cannot document the CRS."}
    if not _geographic(bbox):
        return {
            "error": "Coordinates fall outside longitude-latitude range. RFC 7946 OGC:CRS84 does not apply. Provide a G-AID custom import (.prj or / EPSG=) or a legacy crs member with a validated EPSG."
        }
    warnings.append("RFC 7946 GeoJSON with no crs member is documented OGC:CRS84 (WGS 84 longitude-latitude degrees). It is not EPSG:4326.")
    return {
        "crs": "OGC:CRS84",
        "crs_epsg": None,
        "crs_source": "rfc7946",
        "geojson_contract": "rfc7946",
        "axis_order": "lon-lat",
        "coordinate_order": "lon-lat",
        "warnings": warnings,
    }
