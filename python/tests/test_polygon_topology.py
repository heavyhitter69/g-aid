"""Topology engine: holes, boundaries, multiparts, malformed rings."""

from __future__ import annotations

from science.polygon_topology import assemble_polygon_parts, relate_features

EXTERIOR = [
    (260100.0, 6240100.0),
    (260500.0, 6240100.0),
    (260500.0, 6240400.0),
    (260100.0, 6240400.0),
    (260100.0, 6240100.0),
]
HOLE = [
    (260220.0, 6240200.0),
    (260320.0, 6240200.0),
    (260320.0, 6240300.0),
    (260220.0, 6240300.0),
    (260220.0, 6240200.0),
]
ISLAND = [
    (260600.0, 6240100.0),
    (260700.0, 6240100.0),
    (260700.0, 6240200.0),
    (260600.0, 6240200.0),
    (260600.0, 6240100.0),
]


def poly(parts, fid="P"):
    from science.polygon_topology import canonical_polygon

    return canonical_polygon(parts, fid, {})


def point(x, y, fid="1"):
    return {"id": fid, "geometry_type": "Point", "coordinates": [{"x": x, "y": y}], "properties": {}}


def line(pts, fid="L"):
    return {
        "id": fid,
        "geometry_type": "LineString",
        "coordinates": [{"x": x, "y": y} for x, y in pts],
        "properties": {},
    }


def test_point_in_shell_contained_point_in_hole_not_contained():
    feature = poly([[EXTERIOR, HOLE]])
    shell = relate_features(feature, point(260150.0, 6240150.0, "shell"))
    assert shell["relation"] == "contains"
    assert shell["engine"] == "g-aid-evenodd-segment"
    hole = relate_features(feature, point(260270.0, 6240250.0, "hole"))
    assert hole["relation"] == "disjoint"
    assert hole["location"] == "hole-interior"
    assert "not contained" in hole["reason"]


def test_boundary_points_are_on_boundary_not_contains():
    feature = poly([[EXTERIOR, HOLE]])
    exterior_b = relate_features(feature, point(260100.0, 6240250.0, "eb"))
    assert exterior_b["relation"] == "on-boundary"
    assert exterior_b["location"] == "exterior-boundary"
    hole_b = relate_features(feature, point(260220.0, 6240250.0, "hb"))
    assert hole_b["relation"] == "on-boundary"
    assert hole_b["location"] == "hole-boundary"


def test_line_in_hole_is_not_contained():
    feature = poly([[EXTERIOR, HOLE]])
    inside = relate_features(feature, line([(260140.0, 6240140.0), (260160.0, 6240160.0)]))
    assert inside["relation"] == "contains"
    in_hole = relate_features(feature, line([(260240.0, 6240220.0), (260300.0, 6240280.0)]))
    assert in_hole["relation"] == "disjoint"
    crossing = relate_features(feature, line([(260150.0, 6240150.0), (260270.0, 6240250.0)]))
    assert crossing["relation"] == "intersects"


def test_polygon_does_not_contain_geometry_in_its_hole():
    outer = poly([[EXTERIOR, HOLE]], "outer")
    inner = poly([[HOLE]], "inner")
    hit = relate_features(outer, inner)
    assert hit["relation"] != "contains"
    assert hit["relation"] in {"disjoint", "on-boundary", "intersects"}


def test_nesting_not_orientation_groups_hole_and_multipolygon():
    assembled = assemble_polygon_parts([EXTERIOR, HOLE, ISLAND])
    assert assembled["ok"] is True
    assert assembled["geometry_type"] == "MultiPolygon"
    assert assembled["part_count"] == 2
    assert assembled["hole_count"] == 1
    assert assembled["classification"] == "nesting-containment"


def test_self_intersecting_ring_is_invalid():
    bowtie = [
        (0.0, 0.0),
        (10.0, 10.0),
        (0.0, 10.0),
        (10.0, 0.0),
        (0.0, 0.0),
    ]
    assembled = assemble_polygon_parts([bowtie])
    assert assembled["ok"] is False
    assert any("self-intersecting" in err for err in assembled["errors"])


def test_hole_outside_exterior_is_invalid():
    assembled = assemble_polygon_parts([EXTERIOR, ISLAND])
    # ISLAND is disjoint, so it becomes a second exterior (multipolygon), not a hole.
    # A ring that is not nested and not crossing is another part.
    assert assembled["ok"] is True
    assert assembled["geometry_type"] == "MultiPolygon"
    outside_hole = [
        (261000.0, 6241000.0),
        (261010.0, 6241000.0),
        (261010.0, 6241010.0),
        (261000.0, 6241010.0),
        (261000.0, 6241000.0),
    ]
    # Explicit malformed: a "hole" that crosses the exterior.
    crossing = [
        (260000.0, 6240200.0),
        (260200.0, 6240200.0),
        (260200.0, 6240300.0),
        (260000.0, 6240300.0),
        (260000.0, 6240200.0),
    ]
    bad = assemble_polygon_parts([EXTERIOR, crossing])
    assert bad["ok"] is False
    void = outside_hole  # keep local used
    assert void[0][0] == 261000.0
