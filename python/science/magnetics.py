"""Airborne magnetic corrections.

Diurnal:  B_corr = B_air − B_base(t) + B_ref   (Reeves 2005; standard GSM-19 practice)
IGRF:     B_anom = B_corr − F_IGRF(lat, lon, h, t)   (Alken et al. 2021)
Heading:  H(θ) = C0 + C1 cos θ + C2 sin θ + C3 cos 2θ + C4 sin 2θ
          (Luyendyk 1997; typical aircraft/drone heading error model)
Lag:      cross-correlation of opposing lines (Nabighian / standard AEM/mag lag)
Tie-line: traverse/tie classification, nearest-crossing mis-ties, ties held
          as control (Oasis-style statistical levelling; Mittal 1984).
Grid microlevel: directional decorrugation with amplitude cap (Minty 1991).
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.interpolate import interp1d
from scipy.signal import correlate
from scipy.spatial import cKDTree


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


def _fold_azimuth_rad(heading_rad: np.ndarray) -> np.ndarray:
    """Fold heading into [0, π) so reciprocal N/S (or E/W) lines share an azimuth."""
    return np.mod(np.asarray(heading_rad, float), math.pi)


def classify_lines(df: pd.DataFrame) -> dict:
    """Split lines into traverse vs tie by dominant folded heading.

    The larger azimuth cluster is traverse (flight lines). Lines more than 45°
    from that heading are ties. Matches Oasis: ties are the perpendicular set.
    """
    if "line_id" not in df.columns:
        return {"lines": {}, "traverse_ids": [], "tie_ids": [], "flight_azimuth_deg": 0.0, "line_spacing_m": None}
    records = {}
    azimuths = []
    for lid, part in df.groupby(df["line_id"].astype(str)):
        part = part.sort_values("timestamp") if "timestamp" in part.columns else part
        hd = heading_from_track(part["x"].to_numpy(), part["y"].to_numpy())
        az = float(np.nanmedian(_fold_azimuth_rad(hd)))
        cx = float(np.nanmedian(part["x"].to_numpy()))
        cy = float(np.nanmedian(part["y"].to_numpy()))
        records[str(lid)] = {
            "azimuth_deg": math.degrees(az),
            "n": int(len(part)),
            "cx": cx,
            "cy": cy,
            "kind": "traverse",
        }
        azimuths.append(az)
    if not azimuths:
        return {"lines": records, "traverse_ids": [], "tie_ids": [], "flight_azimuth_deg": 0.0, "line_spacing_m": None}
    primary = float(np.median(azimuths))
    traverse_ids = []
    tie_ids = []
    for lid, rec in records.items():
        az = math.radians(rec["azimuth_deg"])
        delta = abs(((az - primary + math.pi / 2) % math.pi) - math.pi / 2)
        if delta <= math.radians(45.0):
            rec["kind"] = "traverse"
            traverse_ids.append(lid)
        else:
            rec["kind"] = "tie"
            tie_ids.append(lid)
    if len(traverse_ids) < 2 and tie_ids:
        traverse_ids, tie_ids = tie_ids, traverse_ids
        for lid, rec in records.items():
            rec["kind"] = "traverse" if lid in traverse_ids else "tie"
    spacing = _traverse_spacing_m(records, traverse_ids)
    return {
        "lines": records,
        "traverse_ids": traverse_ids,
        "tie_ids": tie_ids,
        "flight_azimuth_deg": math.degrees(primary),
        "line_spacing_m": spacing,
    }


def _traverse_spacing_m(records: dict, traverse_ids: list[str]) -> float | None:
    if len(traverse_ids) < 2:
        return None
    az = math.radians(float(np.median([records[i]["azimuth_deg"] for i in traverse_ids])))
    # Distance between line centroids measured across-track.
    across_x = math.cos(az)
    across_y = -math.sin(az)
    proj = sorted(records[i]["cx"] * across_x + records[i]["cy"] * across_y for i in traverse_ids)
    gaps = np.diff(proj)
    gaps = gaps[np.abs(gaps) > 1e-6]
    if len(gaps) == 0:
        return None
    return float(np.median(np.abs(gaps)))


def _pair_crossing(
    xa: np.ndarray, ya: np.ndarray, va: np.ndarray, sa: np.ndarray,
    xb: np.ndarray, yb: np.ndarray, vb: np.ndarray, sb: np.ndarray,
    radius: float,
) -> tuple[float, float, float, float, float, float, float] | None:
    """Closest sample pair within radius: va, vb, x, y, dist, s_a, s_b."""
    if len(xa) == 0 or len(xb) == 0:
        return None
    tree = cKDTree(np.column_stack([xb, yb]))
    dist, idx = tree.query(np.column_stack([xa, ya]))
    k = int(np.argmin(dist))
    if not np.isfinite(dist[k]) or dist[k] > radius:
        return None
    j = int(idx[k])
    return float(va[k]), float(vb[j]), float(xa[k]), float(ya[k]), float(dist[k]), float(sa[k]), float(sb[j])


def _along_track(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    step = np.hypot(np.diff(x, prepend=x[0]), np.diff(y, prepend=y[0]))
    step[0] = 0.0
    return np.cumsum(step)


def traverse_tie_intersections(df: pd.DataFrame, radius_m: float, classification: dict) -> list[dict]:
    """One crossing per traverse–tie pair (Oasis levelling table)."""
    groups = {str(lid): g.copy() for lid, g in df.groupby(df["line_id"].astype(str))}
    traverse = classification.get("traverse_ids") or list(groups)
    ties = classification.get("tie_ids") or []
    pairs: list[tuple[str, str]] = []
    if ties:
        for t in traverse:
            for k in ties:
                pairs.append((t, k))
    else:
        ids = list(groups)
        pairs = [(ids[i], ids[j]) for i in range(len(ids)) for j in range(i + 1, len(ids))]
    hits = []
    for a, b in pairs:
        if a not in groups or b not in groups:
            continue
        pa = groups[a].sort_values("timestamp") if "timestamp" in groups[a].columns else groups[a]
        pb = groups[b].sort_values("timestamp") if "timestamp" in groups[b].columns else groups[b]
        xa, ya = pa["x"].to_numpy(float), pa["y"].to_numpy(float)
        xb, yb = pb["x"].to_numpy(float), pb["y"].to_numpy(float)
        va = pa["magnetic_field"].to_numpy(float)
        vb = pb["magnetic_field"].to_numpy(float)
        sa, sb = _along_track(xa, ya), _along_track(xb, yb)
        cross = _pair_crossing(xa, ya, va, sa, xb, yb, vb, sb, radius_m)
        if cross is None:
            continue
        va_, vb_, x, y, dist, s_a, s_b = cross
        hits.append({
            "traverse": a,
            "tie": b,
            "val_traverse": va_,
            "val_tie": vb_,
            "x": x,
            "y": y,
            "dist_m": dist,
            "s_traverse_m": s_a,
            "s_tie_m": s_b,
            "mistie_nT": va_ - vb_,
        })
    return hits


def tie_line_level(
    df: pd.DataFrame,
    radius_m: float = 25.0,
    hold: str = "ties",
    degree: int = 0,
    max_shift_nT: float = 80.0,
) -> tuple[pd.DataFrame, dict]:
    """Oasis-style statistical levelling: hold ties, shift traverses.

    degree 0 = constant per traverse (Mittal 1984).
    degree 1 = constant + linear along-track term.
    Shifts are clipped to ±max_shift_nT so geology is not absorbed.
    """
    out = df.copy()
    if "line_id" not in out.columns:
        return out, {"applied": False, "reason": "no line_id"}
    if "magnetic_field" not in out.columns:
        if "corrected_magnetic_field" in out.columns:
            out["magnetic_field"] = out["corrected_magnetic_field"]
        else:
            raise ValueError("tie_line_level needs magnetic_field")
    classification = classify_lines(out)
    hits = traverse_tie_intersections(out, radius_m, classification)
    traverse_ids = classification["traverse_ids"] or list(out["line_id"].astype(str).unique())
    if not classification["tie_ids"] or hold != "ties":
        if len(hits) < 2:
            return out, {
                "applied": False,
                "reason": "insufficient crossings",
                "n_intersections": len(hits),
                "classification": classification,
            }
        return _joint_level(out, hits, classification, max_shift_nT)
    if len(hits) < 2 or not traverse_ids:
        return out, {
            "applied": False,
            "reason": "insufficient traverse–tie crossings",
            "n_intersections": len(hits),
            "classification": classification,
        }
    degree = 0 if int(degree) < 1 else 1
    n_t = len(traverse_ids)
    index = {lid: i for i, lid in enumerate(traverse_ids)}
    n_par = n_t * (1 + degree)
    rows = []
    rhs = []
    for hit in hits:
        tr = hit["traverse"]
        if tr not in index:
            continue
        i0 = index[tr]
        row = np.zeros(n_par)
        row[i0] = 1.0
        if degree == 1:
            row[n_t + i0] = hit["s_traverse_m"] / 1000.0
        rows.append(row)
        # Hold ties: traverse + shift = tie
        rhs.append(hit["val_tie"] - hit["val_traverse"])
    if hold != "ties":
        # Joint LS: also solve tie constants (gauge mean 0). Fallback path.
        return _joint_level(out, hits, classification, max_shift_nT)
    if len(rows) < n_par:
        return out, {
            "applied": False,
            "reason": "underdetermined (need more crossings than traverse parameters)",
            "n_intersections": len(hits),
            "classification": classification,
        }
    coef, *_ = np.linalg.lstsq(np.asarray(rows), np.asarray(rhs), rcond=None)
    c0 = {lid: float(np.clip(coef[index[lid]], -max_shift_nT, max_shift_nT)) for lid in traverse_ids}
    c1 = {}
    if degree == 1:
        c1 = {lid: float(coef[n_t + index[lid]]) for lid in traverse_ids}

    shift = np.zeros(len(out), dtype=float)
    along = np.zeros(len(out), dtype=float)
    for lid, part in out.groupby(out["line_id"].astype(str)):
        if lid not in c0:
            continue
        xa = part["x"].to_numpy(float)
        ya = part["y"].to_numpy(float)
        s = _along_track(xa, ya)
        along[part.index.to_numpy()] = s
        delta = c0[lid]
        if degree == 1:
            delta = delta + c1[lid] * (s / 1000.0)
        delta = np.clip(delta, -max_shift_nT, max_shift_nT)
        shift[part.index.to_numpy()] = delta
    out["magnetic_field"] = out["magnetic_field"].to_numpy(float) + shift
    out["level_shift_nT"] = shift

    def _rms(use_shifted: bool) -> float:
        vals = []
        for hit in hits:
            va = hit["val_traverse"]
            if use_shifted:
                va = va + float(c0.get(hit["traverse"], 0.0))
                if degree == 1:
                    va = va + float(c1.get(hit["traverse"], 0.0)) * (hit["s_traverse_m"] / 1000.0)
            vals.append(va - hit["val_tie"])
        return float(np.sqrt(np.mean(np.square(vals)))) if vals else 0.0

    return out, {
        "applied": True,
        "hold": "ties",
        "degree": degree,
        "n_intersections": len(hits),
        "n_traverse": len(traverse_ids),
        "n_tie": len(classification["tie_ids"]),
        "rms_before_nT": _rms(False),
        "rms_after_nT": _rms(True),
        "max_shift_nT": max_shift_nT,
        "line_shifts_nT": c0,
        "line_slopes_nT_per_km": c1,
        "flight_azimuth_deg": classification["flight_azimuth_deg"],
        "line_spacing_m": classification["line_spacing_m"],
        "classification": {
            "traverse_ids": classification["traverse_ids"],
            "tie_ids": classification["tie_ids"],
            "lines": classification["lines"],
        },
        "intersections": hits[:400],
        "formula": "Oasis-style statistical levelling: ties held, traverses shifted (Mittal 1984)",
    }


def _joint_level(df: pd.DataFrame, hits: list[dict], classification: dict, max_shift_nT: float) -> tuple[pd.DataFrame, dict]:
    """Fallback: every line gets a constant; gauge mean shift 0."""
    out = df.copy()
    lines = list(out["line_id"].astype(str).unique())
    index = {lid: i for i, lid in enumerate(lines)}
    a, d = [], []
    for hit in hits:
        row = np.zeros(len(lines))
        row[index[hit["traverse"]]] = 1.0
        row[index[hit["tie"]]] = -1.0
        a.append(row)
        d.append(hit["val_tie"] - hit["val_traverse"])
    a.append(np.ones(len(lines)))
    d.append(0.0)
    shift, *_ = np.linalg.lstsq(np.asarray(a), np.asarray(d), rcond=None)
    mapped = {lid: float(np.clip(shift[i], -max_shift_nT, max_shift_nT)) for lid, i in index.items()}
    out["magnetic_field"] = out["magnetic_field"] + out["line_id"].astype(str).map(mapped)
    return out, {
        "applied": True,
        "hold": "none",
        "n_intersections": len(hits),
        "line_shifts_nT": mapped,
        "classification": classification,
        "formula": "joint least-squares mis-tie (Mittal 1984), mean shift 0",
    }


def microlevel_along_line(
    df: pd.DataFrame, value_col: str, window: int = 101, max_amp_nT: float = 8.0
) -> tuple[pd.DataFrame, dict]:
    """Gentle 1-D high-pass per line. Amplitude-capped so geology is not stripped.

    Full Oasis microlevelling is the 2-D grid operator (`microlevel_grid`).
    """
    out = df.copy()
    if "line_id" not in out.columns or value_col not in out.columns:
        return out, {"applied": False, "reason": "need line_id and value column"}
    w = max(5, int(window) | 1)
    residual = np.zeros(len(out), dtype=float)
    n_lines = 0
    for _, part in out.groupby("line_id"):
        idx = part.index.to_numpy()
        vals = part[value_col].to_numpy(dtype=float)
        if len(vals) < w:
            continue
        s = pd.Series(vals).rolling(w, center=True, min_periods=max(3, w // 3)).median()
        low = s.to_numpy()
        residual[idx] = vals - np.where(np.isfinite(low), low, vals)
        n_lines += 1
    if n_lines == 0:
        return out, {"applied": False, "reason": "lines shorter than window"}
    residual = np.clip(residual, -abs(max_amp_nT), abs(max_amp_nT))
    out[value_col] = out[value_col].to_numpy(dtype=float) - residual
    return out, {
        "applied": True,
        "window": w,
        "n_lines": n_lines,
        "max_amp_nT": max_amp_nT,
        "rms_removed_nT": float(np.sqrt(np.nanmean(residual ** 2))),
        "formula": "capped per-line rolling-median high-pass (Minty 1991 1-D; 2-D grid microlevel preferred)",
    }


def microlevel_grid(grid, line_spacing_m: float, flight_azimuth_deg: float = 0.0, max_amp_nT: float = 6.0):
    """2-D microlevelling: subtract clipped across-track corrugation (Minty 1991).

    `decorrugate` high-passes across flight lines. The difference is the
    corrugation; clipping it keeps geologic wavelengths.
    """
    from science.fft_filters import decorrugate

    hp = decorrugate(grid, line_spacing_m, flight_azimuth_deg)
    original = grid.masked()
    corrugation = original - hp.masked()
    cap = abs(float(max_amp_nT))
    corrugation = np.clip(np.nan_to_num(corrugation, nan=0.0), -cap, cap)
    leveled = original - corrugation
    out = grid.copy_with(leveled, name="tmi_microleveled", units=grid.units)
    rms = float(np.sqrt(np.nanmean(corrugation**2)))
    info = {
        "applied": True,
        "line_spacing_m": float(line_spacing_m),
        "flight_azimuth_deg": float(flight_azimuth_deg),
        "max_amp_nT": cap,
        "rms_removed_nT": rms,
        "formula": "Minty 1991 2-D: directional across-track high-pass, corrugation clipped then subtracted",
    }
    out.metadata = {**grid.metadata, **info}
    return out, info
