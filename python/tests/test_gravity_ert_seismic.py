import numpy as np

from science.ert import apparent_resistivity, geometric_factor, invert_2d_smooth
from science.gravity import bouguer_slab_correction, latitude_free_air_bouguer, somigliana_normal_gravity
from science.seismic import nmo_correct, power_spectral_density


def test_somigliana_equator_vs_pole():
    ge = somigliana_normal_gravity(0.0)
    gp = somigliana_normal_gravity(90.0)
    assert ge < gp
    assert 978000 < ge < 978500
    assert 983000 < gp < 983500


def test_bouguer_slab_formula():
    corr = bouguer_slab_correction(100.0, 2.67)
    assert abs(corr - 0.041908 * 2.67 * 100) < 1e-9


def test_free_air_bouguer_chain():
    # synthetic: observed = normal + 0.3086*h - slab, so Bouguer ~ 0
    lat = np.array([45.0])
    h = np.array([200.0])
    gamma = somigliana_normal_gravity(lat)
    g_obs = gamma - 0.3086 * h + 0.041908 * 2.67 * h
    out = latitude_free_air_bouguer(g_obs, lat, h, 2.67, apply_bullard_b=False)
    assert abs(out["bouguer_mgal"][0]) < 0.05


def test_wenner_geometric_factor():
    assert abs(geometric_factor("wenner", 5.0) - 2 * np.pi * 5) < 1e-12
    rho = apparent_resistivity(voltage=1.0, current=0.1, array="wenner", a=5.0)
    assert abs(rho - geometric_factor("wenner", 5.0) * 10.0) < 1e-12


def test_ert_homogeneous_recovery():
    xs = np.linspace(0, 100, 21)
    meas = [{"midpoint_x": float(x), "a": 5.0, "n": 1.0, "rhoa": 100.0} for x in xs]
    meas += [{"midpoint_x": float(x), "a": 5.0, "n": 2.0, "rhoa": 100.0} for x in xs[1:-1]]
    result = invert_2d_smooth(meas, n_x=16, n_z=8, max_iter=6)
    model = np.array(result["resistivity_ohm_m"])
    assert 70 < np.median(model) < 140
    assert result["misfit_percent"] < 15


def test_nmo_flattens_hyperbola():
    ns, ntr = 200, 11
    dt = 0.002
    v = 2000.0
    t0 = 0.12
    traces = np.zeros((ntr, ns))
    offsets = np.linspace(-500, 500, ntr)
    for i, off in enumerate(offsets):
        t = np.sqrt(t0**2 + (off / v) ** 2)
        k = int(t / dt)
        if 0 <= k < ns:
            traces[i, k] = 1.0
    nmo = nmo_correct(traces, offsets, dt, v)
    peaks = [int(np.argmax(np.abs(tr))) for tr in nmo if np.max(np.abs(tr)) > 0]
    assert max(peaks) - min(peaks) <= 4


def test_psd_tone():
    dt = 0.001
    t = np.arange(0, 1.0, dt)
    tr = np.sin(2 * np.pi * 40 * t)
    psd = power_spectral_density(tr[None, :], dt, 256)
    assert 30 < psd["dominant_frequency_hz"] < 50
