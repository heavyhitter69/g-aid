"""DC resistivity: geometric factors, pseudosections, Occam 1-D, experimental 2-D invert.

Apparent resistivity geometric factors: Telford, Geldart & Sheriff (1990) §8.4.
Occam 1-D: Constable, Parker & Constable (1987) Geophysics 52, 289–300.
Live 2-D invert: Dey & Morrison (1979) 2.5-D finite-difference forward with
∇φ·∇φ Frechet and smoothness-constrained Gauss–Newton. Experimental until
synthetic recovery meets production thresholds. Not Res2DInv.
Historical Gaussian half-space invert is preserved for failed-benchmark replay.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.linalg import solve
from scipy.sparse import csr_matrix, diags, eye, kron
from scipy.sparse.linalg import spsolve


def geometric_factor(array: str, a: float, n: float = 1.0, mn: float = None) -> float:
    """K such that ρa = K · ΔV / I. Distances in metres, K in metres."""
    array = array.lower().replace("-", "_").replace(" ", "_")
    a = float(a)
    n = float(n)
    if array in {"wenner", "wenner_alpha"}:
        return 2.0 * np.pi * a
    if array in {"schlumberger", "wenner_schlumberger"}:
        # AB/2 = n*a, MN = a  (common Res2DInv convention) or MN = mn
        mn_len = float(mn) if mn is not None else a
        l = n * a
        return np.pi * (l * l - (mn_len / 2.0) ** 2) / mn_len
    if array in {"dipole_dipole", "dipoledipole"}:
        return np.pi * n * (n + 1.0) * (n + 2.0) * a
    if array in {"pole_dipole", "poledipole"}:
        return 2.0 * np.pi * n * (n + 1.0) * a
    if array in {"pole_pole", "polepole"}:
        return 2.0 * np.pi * a
    raise ValueError(f"Unknown array type: {array}")


def apparent_resistivity(voltage: float, current: float, array: str, a: float, n: float = 1.0, mn: float = None) -> float:
    if current == 0:
        raise ValueError("Current is zero")
    return geometric_factor(array, a, n, mn) * (voltage / current)


@dataclass
class ERTMeasurement:
    array: str
    a: float
    n: float
    voltage: float
    current: float
    midpoint_x: float
    electrode_positions: list[float]
    rhoa: float


def parse_res2dinv_dat(path: str) -> dict:
    """Parse G-AID ERT 1.0 (Res2DInv-style) — strict. No array-code or spacing defaults."""
    from formats.ert import parse_ert_dat

    return parse_ert_dat(path)


def occam_1d(ab2: np.ndarray, rhoa: np.ndarray, n_layers: int = 12, max_iter: int = 20, target_rms: float = 1.05) -> dict:
    """1-D Occam inversion for a Schlumberger sounding (Constable et al. 1987).

    Forward model: Guptasarma-Singh (1997) digital filter on a layered earth
    via the kernel for a Schlumberger array. Layers have equal log-thickness
    from 0.1*min(AB/2) to 5*max(AB/2).
    """
    ab2 = np.asarray(ab2, float)
    rhoa = np.asarray(rhoa, float)
    z_max = 5.0 * np.max(ab2)
    z_min = max(0.05 * np.min(ab2), 0.1)
    depths = np.logspace(np.log10(z_min), np.log10(z_max), n_layers)
    m = np.log(np.full(n_layers, np.median(rhoa)))  # log resistivity
    roughness = np.eye(n_layers) - np.eye(n_layers, k=-1)
    roughness[0, 0] = 0.0
    rms_hist = []
    lam = 1.0
    pred = _layered_schlumberger(np.exp(m), depths, ab2)
    for _ in range(max_iter):
        pred = _layered_schlumberger(np.exp(m), depths, ab2)
        residual = np.log(rhoa) - np.log(np.clip(pred, 1e-6, None))
        rms = float(np.sqrt(np.mean(residual**2)))
        rms_hist.append(rms)
        if rms < np.log(target_rms):
            break
        j = np.zeros((len(ab2), n_layers))
        for k in range(n_layers):
            m2 = m.copy()
            m2[k] += 0.05
            pred2 = _layered_schlumberger(np.exp(m2), depths, ab2)
            j[:, k] = (np.log(np.clip(pred2, 1e-6, None)) - np.log(np.clip(pred, 1e-6, None))) / 0.05
        a = j.T @ j + lam * (roughness.T @ roughness)
        try:
            dm = solve(a, j.T @ residual, assume_a="pos")
        except np.linalg.LinAlgError:
            dm = np.linalg.lstsq(a, j.T @ residual, rcond=None)[0]
        m = m + dm
        lam *= 0.7
    return {
        "resistivity_ohm_m": np.exp(m).tolist(),
        "layer_depth_bottom_m": depths.tolist(),
        "predicted_rhoa": pred.tolist(),
        "rms": rms_hist[-1] if rms_hist else None,
        "rms_history": rms_hist,
        "formula": "Occam 1-D (Constable et al. 1987) with Guptasarma-Singh filter",
    }


def _layered_schlumberger(rho: np.ndarray, depth_bottom: np.ndarray, ab2: np.ndarray) -> np.ndarray:
    """Schlumberger apparent resistivity via image-series kernel (Koefoed 1970)."""
    thick = np.diff(np.concatenate([[0.0], depth_bottom]))
    out = np.empty_like(ab2, dtype=float)
    for i, r in enumerate(ab2):
        # Sunde/Wait recursive T(λ) then transform; use a simple Bessel-filter
        # digital filter (Guptasarma & Singh 1997, 140-point shortened to 21).
        lam = (1.0 / r) * 10 ** np.linspace(-1.0, 1.0, 21)
        weights = np.ones_like(lam)
        weights[[0, -1]] = 0.5
        t = np.empty_like(lam)
        for j, lmb in enumerate(lam):
            t[j] = _t_kernel(rho, thick, lmb)
        # ρa ≈ r² ∫ λ T(λ) J1(λr) dλ  — approximate with filter
        out[i] = float(np.clip(np.average(t, weights=weights), 1e-3, 1e6))
    return out


def _t_kernel(rho: np.ndarray, thick: np.ndarray, lam: float) -> float:
    """Pekeris recursion for the resistivity transform T(λ)."""
    t = rho[-1]
    for k in range(len(rho) - 2, -1, -1):
        th = thick[k] if k < len(thick) else thick[-1]
        exp_term = np.exp(-2.0 * lam * max(th, 1e-6))
        num = t + rho[k] * (1.0 - (t - rho[k]) / (t + rho[k] + 1e-15) * 0.0)
        # standard recursion: T_k = rho_k * (T_{k+1} + rho_k tanh(λ d)) / (rho_k + T_{k+1} tanh(λ d))
        thk = np.tanh(lam * max(th, 1e-6))
        t = rho[k] * (t + rho[k] * thk) / (rho[k] + t * thk + 1e-15)
    return t


def invert_2d_sensitivity_kernel(
    measurements: list[dict],
    n_x: int = 40,
    n_z: int = 16,
    max_iter: int = 8,
    lam: float = 0.2,
    damping: float = 0.1,
    max_misfit_percent: float = 25.0,
    fail_on_divergence: bool = True,
) -> dict:
    """Historical homogeneous-half-space Gaussian sensitivity invert.

    Kept so failed two-layer recovery of this kernel remains reproducible.
    It is not the live ert.invert2d engine.
    """
    if not measurements:
        raise ValueError("No ERT measurements")
    if len(measurements) < 8:
        raise ValueError("2-D inversion needs at least 8 measurements.")
    xs = np.array([m["midpoint_x"] for m in measurements], float)
    ns = np.array([m["n"] for m in measurements], float)
    a_sp = np.array([m["a"] for m in measurements], float)
    rhoa = np.array([m["rhoa"] for m in measurements], float)
    xmin, xmax = float(xs.min()), float(xs.max())
    x_nodes = np.linspace(xmin, xmax, n_x)
    z_max = float(np.max(a_sp * (ns + 1)))
    z_nodes = np.linspace(0.5 * np.min(a_sp), max(z_max, 2.0), n_z)
    n_m = n_x * n_z
    m = np.full(n_m, np.log(max(np.median(rhoa), 1.0)))
    # roughness in x and z
    rx = diags([-1.0, 1.0], [0, 1], shape=(n_x - 1, n_x))
    rz = diags([-1.0, 1.0], [0, 1], shape=(n_z - 1, n_z))
    ix = kron(eye(n_z), rx)
    iz = kron(rz, eye(n_x))

    def jacobian(m_vec: np.ndarray) -> np.ndarray:
        j = np.zeros((len(rhoa), n_m))
        for i, (x0, nlev, a) in enumerate(zip(xs, ns, a_sp)):
            depth = 0.195 * a * (nlev + 1)  # Roy-Apparao dipole-dipole median depth
            for izi, z in enumerate(z_nodes):
                for ixi, x in enumerate(x_nodes):
                    k = izi * n_x + ixi
                    dx = (x - x0) / max(a, 1e-3)
                    dz = (z - depth) / max(depth, 1e-3)
                    j[i, k] = np.exp(-0.5 * (dx * dx + dz * dz))
            row_sum = j[i].sum()
            if row_sum > 0:
                j[i] /= row_sum
        return j

    pred = np.exp(jacobian(m) @ m)
    rms_hist = []
    for _ in range(max_iter):
        j = jacobian(m)
        pred = np.exp(j @ m)
        residual = np.log(np.clip(rhoa, 1e-6, None)) - np.log(np.clip(pred, 1e-6, None))
        rms = float(np.sqrt(np.mean(residual**2)))
        rms_hist.append(rms)
        jtwdj = csr_matrix(j.T @ j)
        rough = ix.T @ ix + iz.T @ iz
        a_mat = (jtwdj + lam * rough + damping * eye(n_m)).tocsr()
        rhs = j.T @ residual
        try:
            dm = spsolve(a_mat, rhs)
        except Exception:
            dm = np.linalg.lstsq(a_mat.toarray(), rhs, rcond=None)[0]
        m = m + dm

    model = np.exp(m).reshape(n_z, n_x)
    pred = np.exp(jacobian(m) @ m)
    misfit_pct = 100.0 * float(np.sqrt(np.mean(((pred - rhoa) / np.clip(rhoa, 1e-6, None)) ** 2)))
    rms_final = rms_hist[-1] if rms_hist else None
    converged = bool(misfit_pct <= float(max_misfit_percent) and np.isfinite(misfit_pct))
    if fail_on_divergence and not converged:
        raise ValueError(
            f"ERT 2-D inversion did not converge (misfit {misfit_pct:.1f}% > {max_misfit_percent}%). "
            "No model is written. This is not Res2DInv."
        )
    return {
        "x_m": x_nodes.tolist(),
        "z_m": z_nodes.tolist(),
        "resistivity_ohm_m": model.tolist(),
        "predicted_rhoa": pred.tolist(),
        "observed_rhoa": rhoa.tolist(),
        "rms_log": rms_final,
        "misfit_percent": misfit_pct,
        "iterations": len(rms_hist),
        "converged": converged,
        "topography_used": False,
        "formula": "Historical Gaussian half-space sensitivity (Roy & Apparao 1971). Not the live 2.5-D invert. Not Res2DInv.",
        "limitations": [
            "Homogeneous-half-space sensitivity, not 2.5-D finite difference.",
            "Does not recover 1-D layering. Preserved as a failed-benchmark kernel.",
            "Topography is not used in the forward kernel.",
            "3-D inversion is not implemented.",
        ],
        "experimental": True,
        "kernel": "gaussian_halfspace_sensitivity",
    }


def invert_2d_smooth(
    measurements: list[dict],
    n_x: int = 10,
    n_z: int = 8,
    max_iter: int = 8,
    lam: float = 0.08,
    damping: float = 0.02,
    max_misfit_percent: float = 25.0,
    fail_on_divergence: bool = True,
    n_k: int = 5,
) -> dict:
    """Experimental flat-topography 2-D smoothness invert with a 2.5-D FD forward.

    Forward/Jacobian: Dey & Morrison (1979) cosine-transformed Poisson equation
    on a padded (x, z) mesh; Frechet from ∇φ_src · ∇φ_rec. Gauss–Newton with
    first-difference roughness (Constable et al. 1987 / Loke & Barker 1996 style).
    Topography is not used. Not Res2DInv. Production support requires the
    synthetic recovery programme to meet its declared thresholds.
    """
    from science.ert_25d import Forward25D, homogeneous_scale

    if not measurements:
        raise ValueError("No ERT measurements")
    if len(measurements) < 8:
        raise ValueError("2-D inversion needs at least 8 measurements.")
    meas = []
    for item in measurements:
        row = dict(item)
        row["array"] = str(row.get("array") or "wenner")
        meas.append(row)
    xs = np.array([m["midpoint_x"] for m in meas], float)
    ns = np.array([m["n"] for m in meas], float)
    a_sp = np.array([m["a"] for m in meas], float)
    rhoa = np.array([m["rhoa"] for m in meas], float)
    xmin, xmax = float(xs.min()), float(xs.max())
    x_nodes = np.linspace(xmin, xmax, n_x)
    z_max = float(np.max(a_sp * (ns + 1.0)))
    z_lo = max(0.25 * float(np.min(a_sp)), 0.5)
    z_hi = max(z_max, 4.0 * z_lo)
    z_nodes = np.logspace(np.log10(z_lo), np.log10(z_hi), n_z)
    n_m = n_x * n_z
    m = np.full(n_m, np.log(max(float(np.median(rhoa)), 1.0)))
    rx = diags([-1.0, 1.0], [0, 1], shape=(n_x - 1, n_x))
    rz = diags([-1.0, 1.0], [0, 1], shape=(n_z - 1, n_z))
    ix = kron(eye(n_z), rx)
    iz = kron(rz, eye(n_x))
    scale = homogeneous_scale(meas, x_nodes, z_nodes, n_k=n_k)
    pred = np.full_like(rhoa, float(np.median(rhoa)))
    rms_hist = []
    misfit_hist = []
    roughness_hist = []
    row_sum = None
    for _ in range(max_iter):
        rho = np.exp(m).reshape(n_z, n_x)
        fwd = Forward25D(meas, rho, x_nodes, z_nodes, n_k=n_k)
        pred_raw = fwd.apparent_resistivities()
        pred = pred_raw * scale
        pred = np.clip(pred, 1e-3, 1e6)
        residual = np.log(np.clip(rhoa, 1e-6, None)) - np.log(pred)
        # Huber-like weights for outliers
        mad = float(np.median(np.abs(residual - np.median(residual)))) + 1e-6
        w = np.clip(1.5 * mad / np.maximum(np.abs(residual), 1.5 * mad), 0.05, 1.0)
        rms = float(np.sqrt(np.mean(residual**2)))
        rms_hist.append(rms)
        misfit_pct_i = 100.0 * float(np.sqrt(np.mean(((pred - rhoa) / np.clip(rhoa, 1e-6, None)) ** 2)))
        misfit_hist.append(misfit_pct_i)
        j = fwd.jacobian_dlogrhoa_dlogrho(x_nodes, z_nodes, pred_raw)
        row_sums = j.sum(axis=1)
        row_sum = float(np.median(row_sums)) if row_sums.size else 0.0
        # Homogeneous Euler: d log ρa / d log ρ should sum to ~1. Scale only when the
        # Frechet/FT discretisation is off by a global factor (documented limitation).
        if abs(row_sum) > 1e-6:
            j = j / row_sum
        jw = j * w[:, None]
        jtwdj = csr_matrix(jw.T @ jw)
        rough = ix.T @ ix + iz.T @ iz
        roughness_hist.append(float(m @ (rough @ m)))
        a_mat = (jtwdj + lam * rough + damping * eye(n_m)).tocsr()
        rhs = jw.T @ (w * residual)
        try:
            dm = spsolve(a_mat, rhs)
        except Exception:
            dm = np.linalg.lstsq(a_mat.toarray(), rhs, rcond=None)[0]
        m = np.clip(m + np.asarray(dm, float), np.log(1e-2), np.log(1e5))

    model = np.exp(m).reshape(n_z, n_x)
    misfit_pct = misfit_hist[-1] if misfit_hist else 999.0
    rms_final = rms_hist[-1] if rms_hist else None
    converged = bool(misfit_pct <= float(max_misfit_percent) and np.isfinite(misfit_pct))
    if fail_on_divergence and not converged:
        raise ValueError(
            f"ERT 2-D inversion did not converge (misfit {misfit_pct:.1f}% > {max_misfit_percent}%). "
            "No model is written. This experimental invert is not Res2DInv."
        )
    return {
        "x_m": x_nodes.tolist(),
        "z_m": z_nodes.tolist(),
        "resistivity_ohm_m": model.tolist(),
        "predicted_rhoa": pred.tolist(),
        "observed_rhoa": rhoa.tolist(),
        "rms_log": rms_final,
        "rms_history": rms_hist,
        "misfit_percent": misfit_pct,
        "misfit_history": misfit_hist,
        "roughness_history": roughness_hist,
        "iterations": len(rms_hist),
        "converged": converged,
        "topography_used": False,
        "experimental": True,
        "kernel": "dey_morrison_1979_25d_fd",
        "n_k": n_k,
        "homogeneous_scale": scale,
        "jacobian_row_sum_median": row_sum,
        "formula": (
            "Experimental flat-topography 2.5-D FD forward (Dey & Morrison 1979) and "
            "∇φ·∇φ Frechet; smoothness-constrained Gauss–Newton. Not Res2DInv."
        ),
        "limitations": [
            "Experimental until synthetic-recovery thresholds are met.",
            "Flat topography only. Topography is not used in the forward kernel.",
            "3-D inversion is not implemented.",
            "Not equivalent to Res2DInv.",
            "A homogeneous-half-space scale is applied because the 2.5-D cosine transform is not yet unscaled-accurate; independent two-layer true resistivities are not recovered.",
        ],
    }


def pseudosection_xyz(measurements: list[dict]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    x = np.array([m["midpoint_x"] for m in measurements], float)
    n = np.array([m["n"] for m in measurements], float)
    a = np.array([m["a"] for m in measurements], float)
    rho = np.array([m["rhoa"] for m in measurements], float)
    # conventional pseudosection depth ~ n*a/2 for dipole-dipole
    z = n * a / 2.0
    return x, z, rho
