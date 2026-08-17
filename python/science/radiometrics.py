"""Radiometric corrections.

Height correction: N = N0 exp(μ (h − h0))  (IAEA TECDOC-1363, 2003).
Window stripping:  K, U, Th standard stripping ratios (IAEA).
NASVD: Minty (1998) / Hovgaard & Grasty (1997) — SVD on spectra, reconstruct
from leading components. Applied only when a 2-D spectrum array is present.
"""

from __future__ import annotations

import numpy as np


# Typical linear attenuation at STP for airborne gamma (IAEA TECDOC-1363 Table 4.1), 1/m
MU_TC = 0.0065
MU_K = 0.0075
MU_U = 0.0067
MU_TH = 0.0055


def height_correct(counts, height_m, mu: float, h_ref_m: float = 0.0) -> np.ndarray:
    h = np.asarray(height_m, float)
    n = np.asarray(counts, float)
    return n * np.exp(float(mu) * (h - float(h_ref_m)))


def strip_windows(k_raw, u_raw, th_raw, ratios: dict | None = None) -> dict[str, np.ndarray]:
    """Standard 3-window stripping.

    K_c = (K − α U − β Th) / (1 − …) with IAEA default stripping ratios:
    α (U into K)=0.25, β (Th into K)=0.40, γ (Th into U)=0.35, a (K into U)=0.05,
    b (K into Th)=0.0, g (U into Th)=0.05. Exact values should be survey-calibrated;
    defaults are documented and overridable.
    """
    r = {
        "alpha": 0.25,
        "beta": 0.40,
        "gamma": 0.35,
        "a": 0.05,
        "b": 0.0,
        "g": 0.05,
    }
    if ratios:
        r.update(ratios)
    k = np.asarray(k_raw, float)
    u = np.asarray(u_raw, float)
    th = np.asarray(th_raw, float)
    # solve the 3x3 stripping system per sample
    k_c = np.empty_like(k)
    u_c = np.empty_like(u)
    th_c = np.empty_like(th)
    a_mat = np.array(
        [
            [1.0, r["alpha"], r["beta"]],
            [r["a"], 1.0, r["gamma"]],
            [r["b"], r["g"], 1.0],
        ]
    )
    for i in range(k.size):
        rhs = np.array([k.ravel()[i], u.ravel()[i], th.ravel()[i]])
        if not np.all(np.isfinite(rhs)):
            k_c.ravel()[i] = u_c.ravel()[i] = th_c.ravel()[i] = np.nan
            continue
        sol = np.linalg.solve(a_mat, rhs)
        k_c.ravel()[i], u_c.ravel()[i], th_c.ravel()[i] = sol
    return {"k": k_c, "u": u_c, "th": th_c, "ratios": r}


def nasvd(spectra: np.ndarray, n_components: int = 8) -> dict:
    """Noise-adjusted SVD reconstruction (Hovgaard & Grasty 1997).

    `spectra` shape (n_samples, n_channels). Channels are scaled by 1/sqrt(mean)
    (Poisson noise adjustment), SVD is taken, and the first n_components are kept.
    """
    x = np.asarray(spectra, float)
    if x.ndim != 2:
        raise ValueError("NASVD expects a 2-D array (samples × channels)")
    mean = np.clip(np.nanmean(x, axis=0), 1e-6, None)
    scale = 1.0 / np.sqrt(mean)
    y = np.nan_to_num(x) * scale
    u, s, vt = np.linalg.svd(y, full_matrices=False)
    nkeep = min(int(n_components), len(s))
    recon = (u[:, :nkeep] * s[:nkeep]) @ vt[:nkeep, :]
    recon = recon / scale
    energy = s**2
    return {
        "reconstructed": recon,
        "singular_values": s.tolist(),
        "variance_explained": (energy / energy.sum()).tolist() if energy.sum() else [],
        "n_components": nkeep,
        "formula": "NASVD (Hovgaard & Grasty 1997; Minty 1998)",
    }
