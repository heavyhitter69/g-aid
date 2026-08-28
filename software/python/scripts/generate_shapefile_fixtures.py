"""Generate documented shapefile fixtures with pyshp 2.3.1.

Sidecar presence is not enough: these datasets exercise real SHP/SHX/DBF/PRJ
records, including invalid and incomplete cases.
"""

from __future__ import annotations

import shutil
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / "python" / "vendor"
sys.path.insert(0, str(VENDOR))

import shapefile  # noqa: E402  (vendored pyshp)

DEST = ROOT / "tests" / "fixtures" / "shapefile-project"

WGS84_UTM34S = (
    'PROJCS["WGS 84 / UTM zone 34S",'
    'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],'
    'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],'
    'PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],'
    'PARAMETER["central_meridian",21],PARAMETER["scale_factor",0.9996],'
    'PARAMETER["false_easting",500000],PARAMETER["false_northing",10000000],'
    'UNIT["metre",1,AUTHORITY["EPSG","9001"]],AUTHORITY["EPSG","32734"]]'
)

WGS84_4326 = (
    'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],'
    'PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433],'
    'AUTHORITY["EPSG","4326"]]'
)

UNKNOWN_PRJ = 'GEOGCS["Unknown datum",DATUM["D_Unknown"],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]]'


def write_prj(stem: Path, wkt: str) -> None:
    stem.with_suffix(".prj").write_text(wkt, encoding="utf-8")


def write_cpg(stem: Path, codec: str) -> None:
    stem.with_suffix(".cpg").write_text(codec, encoding="ascii")


def close_ring(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if pts[0] != pts[-1]:
        return pts + [pts[0]]
    return pts


def write_points(stem: Path, rows: list[tuple[str, str, float, float]], prj: str = WGS84_UTM34S) -> None:
    stem.parent.mkdir(parents=True, exist_ok=True)
    writer = shapefile.Writer(str(stem), shapeType=shapefile.POINT)
    writer.field("ID", "C", 16)
    writer.field("SAMPLE_ID", "C", 24)
    for fid, sample, x, y in rows:
        writer.point(x, y)
        writer.record(fid, sample)
    writer.close()
    write_prj(stem, prj)


def write_lines(stem: Path, rows: list[tuple[str, str, list[tuple[float, float]]]], prj: str = WGS84_UTM34S) -> None:
    stem.parent.mkdir(parents=True, exist_ok=True)
    writer = shapefile.Writer(str(stem), shapeType=shapefile.POLYLINE)
    writer.field("ID", "C", 16)
    writer.field("NAME", "C", 32)
    for fid, name, pts in rows:
        writer.line([list(pts)])
        writer.record(fid, name)
    writer.close()
    write_prj(stem, prj)


def write_polygon_rings(
    stem: Path,
    rows: list[tuple[str, str, list[list[tuple[float, float]]]]],
    prj: str = WGS84_UTM34S,
) -> None:
    stem.parent.mkdir(parents=True, exist_ok=True)
    writer = shapefile.Writer(str(stem), shapeType=shapefile.POLYGON)
    writer.field("ID", "C", 16)
    writer.field("UNIT", "C", 24)
    for fid, unit, rings in rows:
        writer.poly([close_ring(list(ring)) for ring in rings])
        writer.record(fid, unit)
    writer.close()
    write_prj(stem, prj)


def write_polygons(stem: Path, rows: list[tuple[str, str, list[tuple[float, float]]]], prj: str = WGS84_UTM34S) -> None:
    write_polygon_rings(stem, [(fid, unit, [pts]) for fid, unit, pts in rows], prj)


def copy_dataset(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    for ext in (".shp", ".shx", ".dbf", ".prj", ".cpg"):
        file = src.with_suffix(ext)
        if file.is_file():
            shutil.copy2(file, dest.with_suffix(ext))


def main() -> None:
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir(parents=True)

    write_points(
        DEST / "points" / "samples",
        [
            ("1", "S-001", 260150.0, 6240150.0),
            ("2", "S-002", 260180.0, 6240180.0),
        ],
    )
    write_lines(
        DEST / "lines" / "faults",
        [
            ("F1", "fault-a", [(260120.0, 6240120.0), (260220.0, 6240220.0)]),
            ("F2", "fault-b", [(260130.0, 6240200.0), (260200.0, 6240140.0)]),
        ],
    )
    write_polygons(
        DEST / "polygons" / "geology",
        [
            (
                "G1",
                "Qal",
                [
                    (260100.0, 6240100.0),
                    (260500.0, 6240100.0),
                    (260500.0, 6240400.0),
                    (260100.0, 6240400.0),
                ],
            ),
            (
                "G2",
                "granite",
                [
                    (260050.0, 6240050.0),
                    (260090.0, 6240050.0),
                    (260090.0, 6240090.0),
                    (260050.0, 6240090.0),
                ],
            ),
        ],
    )
    write_polygons(
        DEST / "overlap" / "tenure",
        [
            (
                "T1",
                "licence",
                [
                    (260100.0, 6240100.0),
                    (260500.0, 6240100.0),
                    (260500.0, 6240400.0),
                    (260100.0, 6240400.0),
                ],
            )
        ],
    )
    write_points(
        DEST / "overlap" / "samples",
        [
            ("1", "S-001", 260150.0, 6240150.0),
            ("2", "S-002", 260180.0, 6240180.0),
        ],
    )

    copy_dataset(DEST / "points" / "samples", DEST / "missing-dbf" / "samples")
    (DEST / "missing-dbf" / "samples.dbf").unlink()
    copy_dataset(DEST / "points" / "samples", DEST / "missing-shx" / "samples")
    (DEST / "missing-shx" / "samples.shx").unlink()
    copy_dataset(DEST / "points" / "samples", DEST / "missing-prj" / "samples")
    (DEST / "missing-prj" / "samples.prj").unlink()

    copy_dataset(DEST / "polygons" / "geology", DEST / "unknown-crs" / "geology")
    write_prj(DEST / "unknown-crs" / "geology", UNKNOWN_PRJ)

    write_points(
        DEST / "conflict-crs" / "utm_samples",
        [("1", "S-001", 260150.0, 6240150.0)],
        prj=WGS84_UTM34S,
    )
    write_points(
        DEST / "conflict-crs" / "wgs_samples",
        [("1", "S-001", 18.41, -33.91)],
        prj=WGS84_4326,
    )

    # Invalid polygon: three unclosed vertices stored as POLYGON.
    invalid = DEST / "invalid-geometry" / "open-ring"
    invalid.parent.mkdir(parents=True, exist_ok=True)
    writer = shapefile.Writer(str(invalid), shapeType=shapefile.POLYGON)
    writer.field("ID", "C", 8)
    writer.poly([[(260100.0, 6240100.0), (260140.0, 6240100.0), (260140.0, 6240140.0)]])
    writer.record("1")
    writer.close()
    write_prj(invalid, WGS84_UTM34S)
    # pyshp auto-closes rings on write; punch a hole in the coordinate stream so
    # the catalog/kernel must reject an unclosed / truncated polygon record.
    shp = bytearray(invalid.with_suffix(".shp").read_bytes())
    # Record content starts at offset 100 + 8. Polygon: type(4)+bbox(32)+numParts(4)+numPoints(4)
    # Force numPoints=3 without repeating the first vertex.
    if len(shp) > 148:
        struct.pack_into("<i", shp, 144, 3)
        invalid.with_suffix(".shp").write_bytes(bytes(shp[:100 + 8 + 4 + 32 + 4 + 4 + 4 + 3 * 16]))

    copy_dataset(DEST / "points" / "samples", DEST / "corrupt-dbf" / "samples")
    (DEST / "corrupt-dbf" / "samples.dbf").write_bytes(b"NOT-A-DBF\x00\x00\x00this is not a dBase header")

    encoded = DEST / "encoding-cp1252" / "labels"
    encoded.parent.mkdir(parents=True, exist_ok=True)
    writer = shapefile.Writer(str(encoded), shapeType=shapefile.POINT, encoding="cp1252")
    writer.field("ID", "C", 8)
    writer.field("NAME", "C", 24)
    writer.point(260150.0, 6240150.0)
    writer.record("1", "café")
    writer.close()
    write_prj(encoded, WGS84_UTM34S)
    write_cpg(encoded, "CP1252")

    bad_utf = DEST / "encoding-utf8-invalid" / "labels"
    copy_dataset(encoded, bad_utf)
    if bad_utf.with_suffix(".cpg").is_file() is False:
        pass
    write_cpg(bad_utf, "UTF-8")

    zstem = DEST / "pointz" / "elevated"
    zstem.parent.mkdir(parents=True, exist_ok=True)
    writer = shapefile.Writer(str(zstem), shapeType=shapefile.POINTZ)
    writer.field("ID", "C", 8)
    writer.pointz(260150.0, 6240150.0, 412.0)
    writer.record("1")
    writer.close()
    write_prj(zstem, WGS84_UTM34S)

    dup = DEST / "duplicate-ids" / "samples"
    write_points(
        dup,
        [
            ("1", "S-001", 260150.0, 6240150.0),
            ("1", "S-002", 260180.0, 6240180.0),
        ],
    )

    nulls = DEST / "null-shape" / "samples"
    nulls.parent.mkdir(parents=True, exist_ok=True)
    writer = shapefile.Writer(str(nulls), shapeType=shapefile.POINT)
    writer.field("ID", "C", 8)
    writer.field("SAMPLE_ID", "C", 16)
    writer.null()
    writer.record("0", "NULL")
    writer.point(260150.0, 6240150.0)
    writer.record("1", "S-001")
    writer.close()
    write_prj(nulls, WGS84_UTM34S)

    exterior = [
        (260100.0, 6240100.0),
        (260500.0, 6240100.0),
        (260500.0, 6240400.0),
        (260100.0, 6240400.0),
    ]
    hole = [
        (260220.0, 6240200.0),
        (260320.0, 6240200.0),
        (260320.0, 6240300.0),
        (260220.0, 6240300.0),
    ]
    island = [
        (260600.0, 6240100.0),
        (260700.0, 6240100.0),
        (260700.0, 6240200.0),
        (260600.0, 6240200.0),
    ]
    write_polygon_rings(
        DEST / "topology" / "hole-polygon",
        [("H1", "licence-with-hole", [exterior, hole])],
    )
    write_points(
        DEST / "topology" / "hole-points",
        [
            ("shell", "IN-SHELL", 260150.0, 6240150.0),
            ("hole", "IN-HOLE", 260270.0, 6240250.0),
            ("ebound", "ON-EXTERIOR", 260100.0, 6240250.0),
            ("hbound", "ON-HOLE", 260220.0, 6240250.0),
        ],
    )
    write_lines(
        DEST / "topology" / "hole-line",
        [
            ("LF", "in-filled", [(260140.0, 6240140.0), (260160.0, 6240160.0)]),
            ("LH", "in-hole", [(260240.0, 6240220.0), (260300.0, 6240280.0)]),
        ],
    )
    write_polygon_rings(
        DEST / "topology" / "multipolygon",
        [("M1", "two-parts", [exterior, island])],
    )

    bowtie = DEST / "topology" / "self-intersect"
    bowtie.parent.mkdir(parents=True, exist_ok=True)
    writer = shapefile.Writer(str(bowtie), shapeType=shapefile.POLYGON)
    writer.field("ID", "C", 8)
    writer.poly([[(260100.0, 6240100.0), (260200.0, 6240200.0), (260100.0, 6240200.0), (260200.0, 6240100.0), (260100.0, 6240100.0)]])
    writer.record("X")
    writer.close()
    write_prj(bowtie, WGS84_UTM34S)

    crossing = [
        (260000.0, 6240200.0),
        (260200.0, 6240200.0),
        (260200.0, 6240300.0),
        (260000.0, 6240300.0),
    ]
    write_polygon_rings(
        DEST / "topology" / "crossing-hole",
        [("C1", "bad-hole", [exterior, crossing])],
    )

    print(f"Wrote shapefile fixtures under {DEST}")


if __name__ == "__main__":
    main()
