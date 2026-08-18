import os

import numpy as np
import pandas as pd

from science.fft_filters import analytic_signal, pseudo_gravity, reduction_to_pole, vertical_derivative
from science.grid import Grid, minimum_curvature
from science.magnetics import classify_lines, diurnal_correct, microlevel_grid, tie_line_level
from science.map_figure import write_potential_field_map


def _dipole_grid(inclination=90.0):
    xs = np.linspace(-200, 200, 41)
    ys = np.linspace(-200, 200, 41)
    xx, yy = np.meshgrid(xs, ys)
    # vertical dipole TMI ~ z (3z^2 - r^2) / r^5 at I=90
    z = 40.0
    r2 = xx**2 + yy**2 + z**2
    r = np.sqrt(r2)
    tmi = 1e6 * z * (3 * z**2 - r2) / r**5
    return Grid(values=tmi[::-1], x0=xs[0] - 5, y0=ys[0] - 5, dx=10.0, dy=10.0, crs_epsg=32630, units="nT", name="tmi")


def test_rtp_identity_at_pole():
    grid = _dipole_grid()
    rtp, qc = reduction_to_pole(grid, 90.0, 0.0)
    err = np.nanmean(np.abs(rtp.masked() - grid.masked())) / np.nanstd(grid.masked())
    assert err < 0.15
    assert qc.low_latitude is False


def test_analytic_signal_peaks_at_source():
    grid = _dipole_grid()
    asg = analytic_signal(grid).masked()
    j, i = np.unravel_index(np.nanargmax(asg), asg.shape)
    # centre cell
    assert abs(i - asg.shape[1] // 2) <= 2
    assert abs(j - asg.shape[0] // 2) <= 2


def test_1vd_sharpens():
    grid = _dipole_grid()
    vd = vertical_derivative(grid, 1)
    assert np.nanstd(vd.masked()) > 0


def test_minimum_curvature_honours_points():
    x = np.array([0.0, 10.0, 20.0, 0.0, 20.0])
    y = np.array([0.0, 10.0, 0.0, 20.0, 20.0])
    z = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
    g = minimum_curvature(x, y, z, dx=5.0)
    assert g.nx >= 4 and g.ny >= 4
    assert np.isfinite(g.masked()).mean() > 0.9


def test_diurnal_formula():
    air = np.array([50000.0, 50010.0])
    base = np.array([49900.0, 49920.0])
    corr, ref, method = diurnal_correct(air, base, "mean_base")
    assert method == "mean_base"
    assert abs(ref - 49910.0) < 1e-9
    assert abs(corr[0] - (50000 - 49900 + 49910)) < 1e-9


def _level_survey() -> pd.DataFrame:
    rows = []
    t = 0
    offsets = {0: 0.0, 1: 8.0, 2: -6.0, 3: 3.0}
    for i, x in enumerate([0.0, 20.0, 40.0, 60.0]):
        for y in np.linspace(0, 100, 51):
            rows.append(
                {
                    "timestamp": t,
                    "x": x,
                    "y": y,
                    "line_id": f"T{i}",
                    "magnetic_field": 100.0 + offsets[i],
                }
            )
            t += 1
    for j, y in enumerate([0.0, 100.0]):
        for x in np.linspace(0, 60, 31):
            rows.append(
                {
                    "timestamp": t,
                    "x": x,
                    "y": y,
                    "line_id": f"K{j}",
                    "magnetic_field": 100.0,
                }
            )
            t += 1
    return pd.DataFrame(rows)


def test_classify_traverse_and_tie():
    info = classify_lines(_level_survey())
    assert set(info["traverse_ids"]) == {"T0", "T1", "T2", "T3"}
    assert set(info["tie_ids"]) == {"K0", "K1"}
    assert info["line_spacing_m"] is not None
    assert abs(info["line_spacing_m"] - 20.0) < 2.0


def test_tie_line_level_holds_ties_and_cuts_mistie():
    df = _level_survey()
    leveled, qc = tie_line_level(df, radius_m=8.0, hold="ties", degree=0, max_shift_nT=80.0)
    assert qc["applied"] is True
    assert qc["rms_after_nT"] < qc["rms_before_nT"] * 0.25
    t1 = leveled.loc[leveled["line_id"] == "T1", "magnetic_field"].mean()
    k0 = leveled.loc[leveled["line_id"] == "K0", "magnetic_field"].mean()
    assert abs(k0 - 100.0) < 0.2
    assert abs(t1 - 100.0) < 1.5


def test_microlevel_grid_clips_corrugation():
    xs = np.linspace(0, 200, 41)
    ys = np.linspace(0, 200, 41)
    xx, yy = np.meshgrid(xs, ys)
    geology = 5.0 * np.sin(xx / 40.0)
    corrugation = 4.0 * np.sin(xx / 8.0)
    grid = Grid(
        values=(geology + corrugation)[::-1],
        x0=-2.5,
        y0=-2.5,
        dx=5.0,
        dy=5.0,
        crs_epsg=32630,
        units="nT",
        name="tmi",
    )
    out, info = microlevel_grid(grid, line_spacing_m=8.0, flight_azimuth_deg=0.0, max_amp_nT=6.0)
    assert info["applied"] is True
    assert info["rms_removed_nT"] > 0.5


def test_pseudo_gravity_finite():
    g = pseudo_gravity(_dipole_grid())
    assert np.isfinite(g.masked()).mean() > 0.9


def test_report_map_writes_png(tmp_path):
    path = os.path.join(tmp_path, "map_tmi.png")
    write_potential_field_map(_dipole_grid(), path, title="TMI residual", product="TMI residual", units="nT", survey="Unit test")
    assert os.path.isfile(path)
    assert os.path.getsize(path) > 8000
    with open(path, "rb") as handle:
        assert handle.read(8) == b"\x89PNG\r\n\x1a\n"
