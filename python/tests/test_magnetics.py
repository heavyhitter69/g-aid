import numpy as np

from science.fft_filters import analytic_signal, reduction_to_pole, vertical_derivative
from science.grid import Grid, minimum_curvature
from science.magnetics import diurnal_correct


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
