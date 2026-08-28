"""Radiometric formulas and already-corrected products.

Live pack: ingest of documented already-corrected concentrations or count rates,
ratios, and ternary stretch. Height correction, stripping, and NASVD remain
library functions only — they are not live capabilities because survey
calibration, live time, altitude, dead time, and stripping coefficients are
not a supported ingest contract.

Height correction: N = N0 exp(μ (h − h0))  (IAEA TECDOC-1363, 2003).
Window stripping:  3×3 Compton stripping (IAEA). Defaults are typical, not survey-calibrated.
NASVD: Hovgaard & Grasty (1997) / Minty (1998).
Ternary: linear percentile stretch, R=K, G=eTh, B=eU (documented assignment).
"""

from __future__ import annotations

import numpy as np


# Typical linear attenuation at STP for airborne gamma (IAEA TECDOC-1363 Table 4.1), 1/m
MU_TC = 0.0065
MU_K = 0.0075
MU_U = 0.0067
MU_TH = 0.0055


def height_correct(counts, height_m, mu: float, h_ref_m: float = 0.0) -> np.ndarray:
    """Library formula only. Not a live G-AID capability."""
    h = np.asarray(height_m, float)
    n = np.asarray(counts, float)
    return n * np.exp(float(mu) * (h - float(h_ref_m)))


def strip_windows(k_raw, u_raw, th_raw, ratios: dict | None = None) -> dict[str, np.ndarray]:
    """Library 3-window stripping. Defaults are not survey-calibrated. Not a live capability."""
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
    """Library NASVD. Not a live capability."""
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
        "formula": "NASVD (Hovgaard & Grasty 1997; Minty 1998) — library only, not a live capability",
    }


def line_qc(line: np.ndarray, x: np.ndarray, y: np.ndarray) -> dict:
    line = np.asarray(line, str)
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    n_lines = int(len(np.unique(line)))
    dup = 0
    seen: set[tuple] = set()
    for a, b, c in zip(line, x, y):
        key = (a, round(float(b), 3), round(float(c), 3))
        if key in seen:
            dup += 1
        seen.add(key)
    return {
        "n": int(len(line)),
        "n_lines": n_lines,
        "duplicate_xy_line": dup,
        "x_span_m": float(np.nanmax(x) - np.nanmin(x)) if len(x) else 0.0,
        "y_span_m": float(np.nanmax(y) - np.nanmin(y)) if len(y) else 0.0,
    }


def concentration_ratios(k: np.ndarray | None, eu: np.ndarray | None, eth: np.ndarray | None, eps: float = 1e-6) -> dict:
    """Ratios of already-corrected equivalent concentrations. Not a lithology index."""
    out: dict = {
        "formula": "eU/eTh (ppm/ppm); eU/K (ppm/%); eTh/K (ppm/%). Denominator clipped at eps.",
        "eps": eps,
    }
    if eu is not None and eth is not None:
        den = np.maximum(np.asarray(eth, float), eps)
        out["eu_eth"] = (np.asarray(eu, float) / den).tolist()
        out["n_eth_clipped"] = int(np.sum(np.asarray(eth, float) < eps))
    if eu is not None and k is not None:
        den = np.maximum(np.asarray(k, float), eps)
        out["eu_k"] = (np.asarray(eu, float) / den).tolist()
        out["n_k_clipped_eu"] = int(np.sum(np.asarray(k, float) < eps))
    if eth is not None and k is not None:
        den = np.maximum(np.asarray(k, float), eps)
        out["eth_k"] = (np.asarray(eth, float) / den).tolist()
        out["n_k_clipped_eth"] = int(np.sum(np.asarray(k, float) < eps))
    return out


def percentile_stretch(values: np.ndarray, p_lo: float = 2.0, p_hi: float = 98.0) -> np.ndarray:
    v = np.asarray(values, float)
    finite = v[np.isfinite(v)]
    if finite.size == 0:
        return np.zeros_like(v)
    lo = float(np.percentile(finite, p_lo))
    hi = float(np.percentile(finite, p_hi))
    if hi <= lo:
        return np.clip(np.where(np.isfinite(v), 0.5, np.nan), 0.0, 1.0)
    t = (v - lo) / (hi - lo)
    return np.clip(t, 0.0, 1.0)


def ternary_rgb(k: np.ndarray, eth: np.ndarray, eu: np.ndarray, p_lo: float = 2.0, p_hi: float = 98.0) -> dict:
    """RGB ternary for concentration grids. R=K, G=eTh, B=eU. Not mineralisation."""
    r = percentile_stretch(k, p_lo, p_hi)
    g = percentile_stretch(eth, p_lo, p_hi)
    b = percentile_stretch(eu, p_lo, p_hi)
    rgb = np.stack([r, g, b], axis=-1)
    return {
        "rgb": rgb,
        "p_lo": p_lo,
        "p_hi": p_hi,
        "assignment": {"R": "K %", "G": "eTh ppm", "B": "eU ppm"},
        "formula": f"Linear stretch between the {p_lo}th and {p_hi}th percentiles of each channel, clipped to [0,1].",
    }
