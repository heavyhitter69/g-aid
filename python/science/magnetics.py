"""Airborne magnetic corrections.

Diurnal:  B_corr = B_air − B_base(t) + B_ref   (Reeves 2005; standard GSM-19 practice)
IGRF:     B_anom = B_corr − F_IGRF(lat, lon, h, t)   (Alken et al. 2021)
Heading:  H(θ) = C0 + C1 cos θ + C2 sin θ + C3 cos 2θ + C4 sin 2θ
          (Luyendyk 1997; typical aircraft/drone heading error model)
Lag:      cross-correlation of opposing lines (Nabighian / standard AEM/mag lag)
Tie-line: least-squares mis-tie minimisation at intersections (Mittal 1984)
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.interpolate import interp1d
from scipy.signal import correlate


def diurnal_correct(air_nT, base_nT, method: str = "mean_base") -> tuple[np.ndarray, float, str]:
    base = np.asarray(base_nT, float)
    air = np.asarray(air_nT, float)
    if method == "median_base":
        ref = float(np.nanmedian(base))
    elif method == "first_sample":
        finite = base[np.isfinite(base)]
        if len(finite) == 0:
            raise ValueError("No finite base-station samples")
        ref = float(finite[0])
    else:
        method = "mean_base"
        ref = float(np.nanmean(base))
    return air - base + ref, ref, method


def interpolate_base(air_time, base_time, base_nT) -> np.ndarray:
    interpolator = interp1d(
        np.asarray(base_time, float),
        np.asarray(base_nT, float),
        kind="linear",
        bounds_error=False,
        fill_value=np.nan,
    )
    return interpolator(np.asarray(air_time, float))


def heading_from_track(x, y) -> np.ndarray:
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    dx = np.diff(x, prepend=x[0])
    dy = np.diff(y, prepend=y[0])
    dx[0] = dx[1] if len(dx) > 1 else 0.0
    dy[0] = dy[1] if len(dy) > 1 else 0.0
    return np.arctan2(dx, dy)  # 0 = north, positive east, radians


def heading_correction(nT, heading_rad) -> tuple[np.ndarray, dict]:
    """Least-squares fit of a 2-harmonic heading error and remove it."""
    t = np.asarray(nT, float)
    th = np.asarray(heading_rad, float)
    finite = np.isfinite(t) & np.isfinite(th)
    if finite.sum() < 20:
        return t.copy(), {"applied": False, "reason": "insufficient samples"}
    a = np.column_stack(
        [
            np.ones(finite.sum()),
            np.cos(th[finite]),
            np.sin(th[finite]),
            np.cos(2 * th[finite]),
            np.sin(2 * th[finite]),
        ]
    )
    residual = t[finite] - np.nanmedian(t[finite])
    coef, *_ = np.linalg.lstsq(a, residual, rcond=None)
    design = np.column_stack(
        [np.ones(len(th)), np.cos(th), np.sin(th), np.cos(2 * th), np.sin(2 * th)]
    )
    error = design @ coef
    error -= np.nanmean(error)
    return t - error, {
        "applied": True,
        "coefficients": {
            "c0": float(coef[0]),
            "c1_cos": float(coef[1]),
            "c2_sin": float(coef[2]),
            "c3_cos2": float(coef[3]),
            "c4_sin2": float(coef[4]),
        },
        "rms_nT": float(np.sqrt(np.nanmean(error**2))),
        "formula": "H(θ)=C0+C1 cosθ+C2 sinθ+C3 cos2θ+C4 sin2θ (Luyendyk 1997)",
    }


def lag_samples(signal_a: np.ndarray, signal_b: np.ndarray, max_lag: int = 40) -> int:
    a = np.asarray(signal_a, float)
    b = np.asarray(signal_b, float)
    a = a - np.nanmean(a)
    b = b - np.nanmean(b)
    a = np.nan_to_num(a)
    b = np.nan_to_num(b)
    corr = correlate(a, b, mode="full")
    lags = np.arange(-len(b) + 1, len(a))
    centre = np.logical_and(lags >= -max_lag, lags <= max_lag)
    peak = lags[centre][int(np.argmax(corr[centre]))]
    return int(peak)


def apply_lag(df: pd.DataFrame, value_col: str, lag: int) -> pd.DataFrame:
    out = df.copy()
    out[value_col] = np.roll(out[value_col].to_numpy(), int(lag))
    if lag > 0:
        out.loc[out.index[:lag], value_col] = np.nan
    elif lag < 0:
        out.loc[out.index[lag:], value_col] = np.nan
    return out


def estimate_lag_from_reciprocal_lines(df: pd.DataFrame, value_col: str = "magnetic_field") -> dict:
    if "line_id" not in df.columns:
        return {"lag_samples": 0, "applied": False, "reason": "no line_id"}
    headings = []
    grouped = []
    for line_id, part in df.groupby("line_id"):
        part = part.sort_values("timestamp")
        hd = heading_from_track(part["x"].to_numpy(), part["y"].to_numpy())
        headings.append((line_id, float(np.nanmedian(hd)), part))
        grouped.append(part)
    if len(headings) < 2:
        return {"lag_samples": 0, "applied": False, "reason": "need ≥2 lines"}
    lags = []
    for i, (id_a, hd_a, pa) in enumerate(headings):
        for id_b, hd_b, pb in headings[i + 1 :]:
            delta = abs(((hd_a - hd_b + math.pi) % (2 * math.pi)) - math.pi)
            if delta < math.radians(150):
                continue
            n = min(len(pa), len(pb), 400)
            if n < 30:
                continue
            lags.append(lag_samples(pa[value_col].to_numpy()[:n], pb[value_col].to_numpy()[:n][::-1]))
    if not lags:
        return {"lag_samples": 0, "applied": False, "reason": "no reciprocal line pairs"}
    lag = int(np.round(np.median(lags)))
    return {"lag_samples": lag, "applied": True, "pairs": len(lags), "all_lags": [int(v) for v in lags]}


def _intersections(df: pd.DataFrame, radius: float) -> list[tuple[str, str, float, float, float, float]]:
    """Return (line_a, line_b, val_a, val_b, x, y) at along-track nearest approaches."""
    lines = {lid: g.sort_values("timestamp") for lid, g in df.groupby("line_id")}
    ids = list(lines)
    hits = []
    for i, a in enumerate(ids):
        pa = lines[a]
        xa, ya, va = pa["x"].to_numpy(), pa["y"].to_numpy(), pa["magnetic_field"].to_numpy()
        for b in ids[i + 1 :]:
            pb = lines[b]
            xb, yb, vb = pb["x"].to_numpy(), pb["y"].to_numpy(), pb["magnetic_field"].to_numpy()
            # coarse: for each point of A find nearest B
            if len(xa) == 0 or len(xb) == 0:
                continue
            step_a = max(1, len(xa) // 200)
            for ia in range(0, len(xa), step_a):
                d2 = (xb - xa[ia]) ** 2 + (yb - ya[ia]) ** 2
                ib = int(np.argmin(d2))
                if d2[ib] <= radius * radius:
                    hits.append((str(a), str(b), float(va[ia]), float(vb[ib]), float(xa[ia]), float(ya[ia])))
    return hits


def tie_line_level(df: pd.DataFrame, radius_m: float = 15.0) -> tuple[pd.DataFrame, dict]:
    """Add a per-line constant that minimises intersection mis-ties (least squares)."""
    out = df.copy()
    if "line_id" not in out.columns:
        return out, {"applied": False, "reason": "no line_id"}
    if "magnetic_field" not in out.columns:
        if "corrected_magnetic_field" in out.columns:
            out["magnetic_field"] = out["corrected_magnetic_field"]
        else:
            raise ValueError("tie_line_level needs magnetic_field")
    hits = _intersections(out, radius_m)
    lines = list(out["line_id"].astype(str).unique())
    if len(hits) < 3 or len(lines) < 2:
        return out, {"applied": False, "reason": "insufficient intersections", "n_intersections": len(hits)}
    index = {lid: i for i, lid in enumerate(lines)}
    a = []
    d = []
    for la, lb, va, vb, *_ in hits:
        row = np.zeros(len(lines))
        row[index[la]] = 1.0
        row[index[lb]] = -1.0
        a.append(row)
        d.append(vb - va)
    a.append(np.ones(len(lines)))  # gauge: mean shift 0
    d.append(0.0)
    shift, *_ = np.linalg.lstsq(np.asarray(a), np.asarray(d), rcond=None)
    mapped = {lid: float(shift[i]) for lid, i in index.items()}
    out["magnetic_field"] = out["magnetic_field"] + out["line_id"].astype(str).map(mapped)
    rms_before = float(np.sqrt(np.mean([(va - vb) ** 2 for _, _, va, vb, *_ in hits])))
    rms_after = float(
        np.sqrt(np.mean([((va + mapped[la]) - (vb + mapped[lb])) ** 2 for la, lb, va, vb, *_ in hits]))
    )
    return out, {
        "applied": True,
        "n_intersections": len(hits),
        "rms_before_nT": rms_before,
        "rms_after_nT": rms_after,
        "line_shifts_nT": mapped,
        "formula": "least-squares mis-tie minimisation (Mittal 1984)",
    }
