import math

from science.igrf import igrf13
from science.crs import wgs84_to_utm, utm_to_wgs84


def test_igrf_components_consistent():
    res = igrf13(40.0, -105.0, 0.0, 2020.0)
    assert abs(res.f**2 - (res.x**2 + res.y**2 + res.z**2)) / res.f**2 < 1e-12
    assert 40_000 < res.f < 60_000
    assert 55 < res.inclination < 75
    assert not res.extrapolated


def test_igrf_equator_weaker_than_high_latitude():
    eq = igrf13(0.0, 0.0, 0.0, 2020.0)
    hi = igrf13(70.0, 0.0, 0.0, 2020.0)
    assert eq.f < hi.f
    assert 20_000 < eq.f < 40_000


def test_igrf_extrapolation_flag():
    res = igrf13(10.0, 0.0, 0.0, 2026.5)
    assert res.extrapolated is True


def test_utm_roundtrip():
    e, n, zone = wgs84_to_utm(-1.5, 7.5)
    lon, lat = utm_to_wgs84(e, n, zone, northern=True)
    assert abs(lon + 1.5) < 1e-5
    assert abs(lat - 7.5) < 1e-5
    assert math.hypot(e - 500000, 0) < 200_000
