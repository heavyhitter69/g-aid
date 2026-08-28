"""Documented 2D polygon topology for GIS overlap.

Runtime has no GEOS/Shapely/GDAL. This engine is even-odd ray casting plus
segment-segment intersection. Ring roles come from nesting/containment, not
from clockwise vs counterclockwise orientation.

It is not an approximation of exterior-only overlap: a point in a hole is
disjoint, not contained. Relations that cannot be evaluated are labelled
``not-evaluated``.
"""

from __future__ import annotations

from typing import Any, Iterable, Sequence

ENGINE = "g-aid-evenodd-segment"
ENGINE_VERSION = "1.0"
ENGINE_METHOD = (
    "even-odd point-in-ring with hole exclusion; segment-segment intersection; "
    "ring nesting by containment (not orientation)"
)
EPS = 1e-9
PRECISION = {
    "model": "ieee754-float64",
    "epsilon": EPS,
    "on_boundary": "collinear-and-within-segment",
    "approximation": "none",
}
SUPPORTED_RELATIONS = (
    "contains",
    "within",
    "intersects",
    "on-boundary",
    "disjoint",
    "not-evaluated",
)

Point = tuple[float, float]
Ring = list[Point]


def engine_meta() -> dict[str, Any]:
    return {
        "engine": ENGINE,
        "engine_version": ENGINE_VERSION,
        "method": ENGINE_METHOD,
        "precision": dict(PRECISION),
        "supported_relations": list(SUPPORTED_RELATIONS),
    }


def _pt(value: Any) -> Point | None:
    if isinstance(value, dict) and "x" in value and "y" in value:
        try:
            x = float(value["x"])
            y = float(value["y"])
        except (TypeError, ValueError):
            return None
        if x != x or y != y:
            return None
        return (x, y)
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        try:
            x = float(value[0])
            y = float(value[1])
        except (TypeError, ValueError):
            return None
        if x != x or y != y:
            return None
        return (x, y)
    return None


def as_ring(values: Iterable[Any]) -> Ring:
    out: Ring = []
    for item in values:
        pt = _pt(item)
        if pt is None:
            continue
        if out and pt == out[-1]:
            continue
        out.append(pt)
    return out


def unique_verts(ring: Sequence[Point]) -> Ring:
    pts = list(ring)
    if len(pts) >= 2 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts


def closed(ring: Sequence[Point]) -> bool:
    pts = list(ring)
    return len(pts) >= 4 and pts[0] == pts[-1]


def ring_edges(ring: Sequence[Point]) -> list[tuple[Point, Point]]:
    pts = unique_verts(ring)
    n = len(pts)
    return [(pts[i], pts[(i + 1) % n]) for i in range(n)]


def _orient(a: Point, b: Point, c: Point) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def on_segment(p: Point, a: Point, b: Point) -> bool:
    if abs(_orient(a, b, p)) > EPS:
        return False
    return (
        min(a[0], b[0]) - EPS <= p[0] <= max(a[0], b[0]) + EPS
        and min(a[1], b[1]) - EPS <= p[1] <= max(a[1], b[1]) + EPS
    )


def proper_intersect(a: Point, b: Point, c: Point, d: Point) -> bool:
    """True when segment interiors cross. Endpoint touches are not proper."""
    o1 = _orient(a, b, c)
    o2 = _orient(a, b, d)
    o3 = _orient(c, d, a)
    o4 = _orient(c, d, b)
    if abs(o1) <= EPS or abs(o2) <= EPS or abs(o3) <= EPS or abs(o4) <= EPS:
        return False
    return (o1 > 0) != (o2 > 0) and (o3 > 0) != (o4 > 0)


def collinear_overlap(a: Point, b: Point, c: Point, d: Point) -> bool:
    if abs(_orient(a, b, c)) > EPS or abs(_orient(a, b, d)) > EPS:
        return False
    if max(a[0], b[0]) < min(c[0], d[0]) - EPS or max(c[0], d[0]) < min(a[0], b[0]) - EPS:
        return False
    if max(a[1], b[1]) < min(c[1], d[1]) - EPS or max(c[1], d[1]) < min(a[1], b[1]) - EPS:
        return False
    # Degenerate shared vertex only is not an overlap of interiors.
    shared = {a, b} & {c, d}
    if len(shared) == 1:
        other_a = b if a in shared else a
        other_c = d if c in shared else c
        if other_a == other_c:
            return True
        return False
    return a != b and c != d


def point_on_ring(p: Point, ring: Sequence[Point]) -> bool:
    return any(on_segment(p, a, b) for a, b in ring_edges(ring))


def point_in_ring_evenodd(p: Point, ring: Sequence[Point]) -> bool:
    """Strict interior via even-odd. Boundary is not interior."""
    if point_on_ring(p, ring):
        return False
    inside = False
    for a, b in ring_edges(ring):
        yi, yj = a[1], b[1]
        if (yi > p[1]) == (yj > p[1]):
            continue
        denom = (yj - yi) or 1e-18
        xinters = (b[0] - a[0]) * (p[1] - yi) / denom + a[0]
        if p[0] < xinters:
            inside = not inside
    return inside


def locate_on_ring(p: Point, ring: Sequence[Point]) -> str:
    if point_on_ring(p, ring):
        return "boundary"
    return "interior" if point_in_ring_evenodd(p, ring) else "exterior"


def ring_self_intersects(ring: Sequence[Point]) -> bool:
    edges = ring_edges(ring)
    n = len(edges)
    for i in range(n):
        a, b = edges[i]
        for j in range(i + 1, n):
            if abs(i - j) <= 1 or (i == 0 and j == n - 1):
                continue
            c, d = edges[j]
            if proper_intersect(a, b, c, d) or collinear_overlap(a, b, c, d):
                return True
    return False


def rings_cross(a: Sequence[Point], b: Sequence[Point]) -> bool:
    for p, q in ring_edges(a):
        for r, s in ring_edges(b):
            if proper_intersect(p, q, r, s) or collinear_overlap(p, q, r, s):
                return True
    return False


def ring_contains_ring(outer: Sequence[Point], inner: Sequence[Point]) -> bool:
    if rings_cross(outer, inner):
        return False
    verts = unique_verts(inner)
    if not verts:
        return False
    locs = [locate_on_ring(p, outer) for p in verts]
    if any(loc == "exterior" for loc in locs):
        return False
    return any(loc == "interior" for loc in locs)


def validate_ring(ring: Sequence[Point], label: str = "ring") -> list[str]:
    errors: list[str] = []
    if not closed(ring):
        errors.append(f"{label} must be closed with at least four finite positions.")
        return errors
    if ring_self_intersects(ring):
        errors.append(f"{label} is self-intersecting. Overlap will not use an exterior-ring approximation.")
    return errors


def assemble_polygon_parts(rings_in: Sequence[Sequence[Any]]) -> dict[str, Any]:
    """Group raw rings into polygon parts by nesting, not orientation."""
    rings = [as_ring(ring) for ring in rings_in]
    rings = [ring for ring in rings if unique_verts(ring)]
    errors: list[str] = []
    for i, ring in enumerate(rings):
        errors.extend(validate_ring(ring, f"Ring {i + 1}"))
    if errors:
        return {"ok": False, "parts": [], "errors": errors, "warnings": []}

    n = len(rings)
    contains = [[False] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            if ring_contains_ring(rings[i], rings[j]):
                contains[i][j] = True
            elif rings_cross(rings[i], rings[j]):
                errors.append(
                    f"Rings {i + 1} and {j + 1} cross. Hole/exterior relationships are invalid."
                )
    if errors:
        return {"ok": False, "parts": [], "errors": list(dict.fromkeys(errors)), "warnings": []}

    for i in range(n):
        for j in range(n):
            if i != j and contains[i][j] and contains[j][i]:
                errors.append(f"Rings {i + 1} and {j + 1} mutually contain each other.")
    if errors:
        return {"ok": False, "parts": [], "errors": list(dict.fromkeys(errors)), "warnings": []}

    depth = [sum(1 for i in range(n) if contains[i][j]) for j in range(n)]
    parent = [-1] * n
    for j in range(n):
        candidates = [i for i in range(n) if contains[i][j]]
        if not candidates:
            continue
        parent[j] = max(candidates, key=lambda i: depth[i])

    parts: list[list[Ring]] = []
    exterior_index: dict[int, int] = {}
    for i, ring in enumerate(rings):
        if depth[i] % 2 == 0:
            exterior_index[i] = len(parts)
            parts.append([ring])
        else:
            outer = parent[i]
            if outer < 0 or depth[outer] % 2 != 0 or outer not in exterior_index:
                errors.append(
                    f"Ring {i + 1} is nested as a hole but has no containing exterior. "
                    "The dataset stays unusable for topology-aware overlap."
                )
                continue
            parts[exterior_index[outer]].append(ring)
    if errors:
        return {"ok": False, "parts": [], "errors": list(dict.fromkeys(errors)), "warnings": []}
    if not parts:
        return {"ok": False, "parts": [], "errors": ["Polygon has no exterior ring."], "warnings": []}

    hole_count = sum(max(0, len(part) - 1) for part in parts)
    gtype = "MultiPolygon" if len(parts) > 1 else "Polygon"
    return {
        "ok": True,
        "parts": parts,
        "geometry_type": gtype,
        "hole_count": hole_count,
        "part_count": len(parts),
        "errors": [],
        "warnings": [],
        "classification": "nesting-containment",
        "engine": ENGINE,
    }


def xy_list(ring: Sequence[Point]) -> list[dict[str, float]]:
    return [{"x": x, "y": y} for x, y in ring]


def flatten_parts(parts: Sequence[Sequence[Sequence[Point]]]) -> list[dict[str, float]]:
    out: list[dict[str, float]] = []
    for part in parts:
        for ring in part:
            out.extend(xy_list(ring))
    return out


def canonical_polygon(parts: Sequence[Sequence[Sequence[Point]]], fid: Any, props: dict) -> dict:
    gtype = "MultiPolygon" if len(parts) > 1 else "Polygon"
    hole_count = sum(max(0, len(part) - 1) for part in parts)
    rings = [xy_list(ring) for ring in parts[0]] if parts else []
    return {
        "id": fid,
        "geometry_type": gtype,
        "coordinates": flatten_parts(parts),
        "rings": rings,
        "parts": [[xy_list(ring) for ring in part] for part in parts],
        "topology": {
            "engine": ENGINE,
            "engine_version": ENGINE_VERSION,
            "method": ENGINE_METHOD,
            "valid": True,
            "part_count": len(parts),
            "hole_count": hole_count,
            "classification": "nesting-containment",
        },
        "properties": props,
        "semantics": "unknown",
    }


def feature_parts(feature: dict) -> list[list[Ring]] | None:
    raw_parts = feature.get("parts")
    if isinstance(raw_parts, list) and raw_parts:
        parts: list[list[Ring]] = []
        for part in raw_parts:
            if not isinstance(part, list) or not part:
                continue
            rings = [as_ring(ring) for ring in part]
            if rings:
                parts.append(rings)
        return parts or None
    raw_rings = feature.get("rings")
    if isinstance(raw_rings, list) and raw_rings:
        return [[as_ring(ring) for ring in raw_rings]]
    coords = feature.get("coordinates") or []
    gtype = str(feature.get("geometry_type") or "")
    if "Polygon" in gtype and coords:
        ring = as_ring(coords)
        if closed(ring):
            return [[ring]]
    return None


def feature_lines(feature: dict) -> list[Ring]:
    gtype = str(feature.get("geometry_type") or "")
    coords = [_pt(p) for p in (feature.get("coordinates") or [])]
    pts = [p for p in coords if p is not None]
    if "Line" in gtype and len(pts) >= 2:
        return [pts]
    return []


def feature_points(feature: dict) -> list[Point]:
    gtype = str(feature.get("geometry_type") or "")
    coords = [pt for pt in (_pt(p) for p in (feature.get("coordinates") or [])) if pt]
    if gtype == "Point":
        return coords[:1]
    if gtype == "MultiPoint":
        return coords
    return []


def locate_point_in_parts(p: Point, parts: Sequence[Sequence[Sequence[Point]]]) -> dict[str, Any]:
    on_exterior = False
    on_hole = False
    in_filled = False
    in_hole = False
    for part in parts:
        if not part:
            continue
        exterior = part[0]
        loc_ext = locate_on_ring(p, exterior)
        if loc_ext == "boundary":
            on_exterior = True
            continue
        if loc_ext != "interior":
            continue
        hole_hit = False
        for hole in part[1:]:
            loc_h = locate_on_ring(p, hole)
            if loc_h == "boundary":
                on_hole = True
                hole_hit = True
                break
            if loc_h == "interior":
                in_hole = True
                hole_hit = True
                break
        if not hole_hit:
            in_filled = True
    if on_hole:
        return {"location": "hole-boundary", "relation_hint": "on-boundary"}
    if on_exterior and not in_filled:
        return {"location": "exterior-boundary", "relation_hint": "on-boundary"}
    if in_filled:
        return {"location": "interior", "relation_hint": "contains"}
    if in_hole:
        return {"location": "hole-interior", "relation_hint": "disjoint"}
    return {"location": "exterior", "relation_hint": "disjoint"}


def _line_ring_crosses(line: Sequence[Point], parts: Sequence[Sequence[Sequence[Point]]]) -> bool:
    for a, b in zip(line, line[1:]):
        for part in parts:
            for ring in part:
                for c, d in ring_edges(ring):
                    if proper_intersect(a, b, c, d):
                        return True
    return False


def _midpoints(line: Sequence[Point]) -> list[Point]:
    out: list[Point] = []
    for a, b in zip(line, line[1:]):
        out.append(((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0))
    return out


def relate_features(left: dict, right: dict) -> dict[str, Any]:
    """Topology-aware relation. Never falls back to exterior-ring-only contains."""
    meta = engine_meta()
    lt = str(left.get("geometry_type") or "")
    rt = str(right.get("geometry_type") or "")
    lp = feature_parts(left) if "Polygon" in lt else None
    rp = feature_parts(right) if "Polygon" in rt else None
    lpts = feature_points(left)
    rpts = feature_points(right)
    llines = feature_lines(left)
    rlines = feature_lines(right)

    if "Polygon" in lt and lp is None:
        return {**meta, "relation": "not-evaluated", "location": None, "reason": "Left polygon topology is missing or invalid."}
    if "Polygon" in rt and rp is None:
        return {**meta, "relation": "not-evaluated", "location": None, "reason": "Right polygon topology is missing or invalid."}

    # Point vs polygon
    if lp and rpts:
        return _points_vs_polygon(lp, rpts, polygon_is_left=True, meta=meta)
    if rp and lpts:
        hit = _points_vs_polygon(rp, lpts, polygon_is_left=False, meta=meta)
        return hit

    # Line vs polygon
    if lp and rlines:
        return _lines_vs_polygon(lp, rlines, polygon_is_left=True, meta=meta)
    if rp and llines:
        return _lines_vs_polygon(rp, llines, polygon_is_left=False, meta=meta)

    # Polygon vs polygon
    if lp and rp:
        return _polygon_vs_polygon(lp, rp, meta)

    # Point/point or line/line: coincidence of bbox is not a topology relation.
    if lpts and rpts:
        same = any(a == b for a in lpts for b in rpts)
        return {
            **meta,
            "relation": "intersects" if same else "disjoint",
            "location": "vertex" if same else "exterior",
            "reason": "Point coincidence." if same else "Points do not coincide.",
        }
    return {
        **meta,
        "relation": "not-evaluated",
        "location": None,
        "reason": f"Relation {lt} vs {rt} is not evaluated by {ENGINE}.",
    }


def _points_vs_polygon(parts: list[list[Ring]], pts: list[Point], polygon_is_left: bool, meta: dict) -> dict:
    locs = [locate_point_in_parts(p, parts) for p in pts]
    if any(item["location"] == "interior" for item in locs) and all(
        item["location"] in {"interior", "exterior-boundary", "hole-boundary"} for item in locs
    ):
        # contains requires every point in filled interior; mixed boundary handled below
        pass
    interiors = [item for item in locs if item["location"] == "interior"]
    holes = [item for item in locs if item["location"] == "hole-interior"]
    bounds = [item for item in locs if item["location"] in {"exterior-boundary", "hole-boundary"}]
    outside = [item for item in locs if item["location"] == "exterior"]

    if len(interiors) == len(pts):
        rel = "contains" if polygon_is_left else "within"
        return {
            **meta,
            "relation": rel,
            "location": "interior",
            "reason": "Point lies in the filled polygon interior (exterior ring minus holes).",
        }
    if len(holes) == len(pts):
        return {
            **meta,
            "relation": "disjoint",
            "location": "hole-interior",
            "reason": "Point lies in an interior ring (hole). It is not contained by the polygon.",
        }
    if len(bounds) == len(pts):
        loc = bounds[0]["location"]
        return {
            **meta,
            "relation": "on-boundary",
            "location": loc,
            "reason": f"Point lies on the polygon {loc.replace('-', ' ')}.",
        }
    if interiors or bounds:
        return {
            **meta,
            "relation": "intersects",
            "location": interiors[0]["location"] if interiors else bounds[0]["location"],
            "reason": "Some points meet the polygon interior or boundary.",
        }
    if holes and not interiors:
        return {
            **meta,
            "relation": "disjoint",
            "location": "hole-interior",
            "reason": "Point lies in an interior ring (hole). It is not contained by the polygon.",
        }
    return {
        **meta,
        "relation": "disjoint",
        "location": "exterior",
        "reason": "Point lies outside the polygon exterior.",
    }


def _lines_vs_polygon(parts: list[list[Ring]], lines: list[Ring], polygon_is_left: bool, meta: dict) -> dict:
    samples: list[Point] = []
    for line in lines:
        samples.extend(line)
        samples.extend(_midpoints(line))
    if not samples:
        return {**meta, "relation": "not-evaluated", "location": None, "reason": "Line has no evaluable vertices."}
    if any(_line_ring_crosses(line, parts) for line in lines):
        return {
            **meta,
            "relation": "intersects",
            "location": "edge",
            "reason": "Line crosses a polygon ring (exterior or hole).",
        }
    locs = [locate_point_in_parts(p, parts) for p in samples]
    if all(item["location"] == "interior" for item in locs):
        rel = "contains" if polygon_is_left else "within"
        return {
            **meta,
            "relation": rel,
            "location": "interior",
            "reason": "Line lies in the filled polygon interior; hole rings were excluded.",
        }
    if any(item["location"] == "interior" for item in locs):
        return {
            **meta,
            "relation": "intersects",
            "location": "interior",
            "reason": "Line meets the filled polygon interior.",
        }
    if all(item["location"] in {"hole-interior", "hole-boundary"} for item in locs):
        return {
            **meta,
            "relation": "disjoint",
            "location": "hole-interior",
            "reason": "Line lies in an interior ring (hole). It is not contained by the polygon.",
        }
    if all(item["location"] in {"exterior-boundary", "hole-boundary"} for item in locs):
        return {
            **meta,
            "relation": "on-boundary",
            "location": locs[0]["location"],
            "reason": "Line lies on a polygon ring.",
        }
    return {
        **meta,
        "relation": "disjoint",
        "location": "exterior",
        "reason": "Line does not meet the filled polygon interior.",
    }


def _all_verts(parts: Sequence[Sequence[Sequence[Point]]]) -> list[Point]:
    out: list[Point] = []
    for part in parts:
        for ring in part:
            out.extend(unique_verts(ring))
    return out


def _holes(parts: Sequence[Sequence[Sequence[Point]]]) -> list[Ring]:
    holes: list[Ring] = []
    for part in parts:
        holes.extend(part[1:])
    return holes


def _polygon_vs_polygon(a: list[list[Ring]], b: list[list[Ring]], meta: dict) -> dict:
    for part_a in a:
        for ring_a in part_a:
            for part_b in b:
                for ring_b in part_b:
                    if rings_cross(ring_a, ring_b):
                        return {
                            **meta,
                            "relation": "intersects",
                            "location": "edge",
                            "reason": "Polygon rings cross. Hole topology was retained.",
                        }
    a_pts = _all_verts(a)
    b_pts = _all_verts(b)
    loc_b_in_a = [locate_point_in_parts(p, a) for p in b_pts]
    loc_a_in_b = [locate_point_in_parts(p, b) for p in a_pts]
    hole_a_in_b = [locate_point_in_parts(p, b) for hole in _holes(a) for p in unique_verts(hole)]
    hole_b_in_a = [locate_point_in_parts(p, a) for hole in _holes(b) for p in unique_verts(hole)]

    def all_interior(locs: list[dict]) -> bool:
        return bool(locs) and all(item["location"] == "interior" for item in locs)

    if all_interior(loc_b_in_a) and not any(item["location"] == "interior" for item in hole_a_in_b):
        return {
            **meta,
            "relation": "contains",
            "location": "interior",
            "reason": "Right polygon lies in the filled interior of the left polygon (holes excluded).",
        }
    if all_interior(loc_a_in_b) and not any(item["location"] == "interior" for item in hole_b_in_a):
        return {
            **meta,
            "relation": "within",
            "location": "interior",
            "reason": "Left polygon lies in the filled interior of the right polygon (holes excluded).",
        }
    if any(item["location"] in {"interior", "exterior-boundary", "hole-boundary"} for item in loc_b_in_a) or any(
        item["location"] in {"interior", "exterior-boundary", "hole-boundary"} for item in loc_a_in_b
    ):
        return {
            **meta,
            "relation": "intersects",
            "location": "interior",
            "reason": "Polygons meet in the filled region. Holes were not discarded.",
        }
    return {
        **meta,
        "relation": "disjoint",
        "location": "exterior",
        "reason": "Polygons do not meet in the filled region.",
    }


def geojson_geometry(feature: dict) -> dict | None:
    gtype = str(feature.get("geometry_type") or "")
    if gtype == "Point":
        pts = [pt for pt in (_pt(p) for p in (feature.get("coordinates") or [])) if pt]
        if not pts:
            return None
        return {"type": "Point", "coordinates": [pts[0][0], pts[0][1]]}
    if "Line" in gtype:
        pts = [pt for pt in (_pt(p) for p in (feature.get("coordinates") or [])) if pt]
        if len(pts) < 2:
            return None
        return {"type": "LineString", "coordinates": [[x, y] for x, y in pts]}
    parts = feature_parts(feature)
    if not parts:
        return None
    def ring_coords(ring: Sequence[Point]) -> list[list[float]]:
        pts = list(ring)
        if not pts:
            return []
        if pts[0] != pts[-1]:
            pts = pts + [pts[0]]
        return [[x, y] for x, y in pts]
    if len(parts) == 1:
        return {"type": "Polygon", "coordinates": [ring_coords(ring) for ring in parts[0]]}
    return {"type": "MultiPolygon", "coordinates": [[ring_coords(ring) for ring in part] for part in parts]}
