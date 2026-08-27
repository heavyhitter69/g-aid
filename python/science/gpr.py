"""Ground-penetrating radar.

Dewow: subtract running mean (Jol 2009).
Time-zero: first break above a fraction of max amplitude.
SEC gain: t^n spherical/exponential compensation.
Bandpass: Butterworth.
Kirchhoff 2-D time migration: same operator as science.seismic (Yilmaz 2001).
"""

from __future__ import annotations

import numpy as np
from scipy.signal import butter, sosfiltfilt

from science.seismic import kirchhoff_time_migrate_2d


def dewow(section: np.ndarray, window: int = 32) -> np.ndarray:
    section = np.asarray(section, float)
    window = max(3, int(window))
    if window % 2 == 0:
        window += 1
    kernel = np.ones(window) / window
    out = np.empty_like(section)
    for i, tr in enumerate(np.atleast_2d(section)):
        trend = np.convolve(tr, kernel, mode="same")
        out[i] = tr - trend
    return out


def time_zero(section: np.ndarray, threshold: float = 0.05) -> int:
    stack = np.mean(np.abs(np.atleast_2d(section)), axis=0)
    peak = np.max(stack) or 1.0
    hits = np.where(stack >= threshold * peak)[0]
    return int(hits[0]) if len(hits) else 0


def sec_gain(section: np.ndarray, dt: float, power: float = 2.0, exp: float = 0.0) -> np.ndarray:
    section = np.asarray(section, float)
    ns = section.shape[-1]
    t = np.arange(ns) * dt
    gain = np.clip(t, dt, None) ** power * np.exp(exp * t)
    return section * gain


def bandpass(section: np.ndarray, dt: float, f_low: float, f_high: float, order: int = 4) -> np.ndarray:
    nyq = 0.5 / dt
    sos = butter(order, [max(f_low / nyq, 1e-6), min(f_high / nyq, 0.999)], btype="bandpass", output="sos")
    return sosfiltfilt(sos, np.asarray(section, float), axis=-1)


def process_section(
    section: np.ndarray,
    dt: float,
    dx: float,
    f_low: float | None = None,
    f_high: float | None = None,
    antenna_mhz: float | None = None,
    dewow_window: int = 32,
    sec_power: float = 2.0,
) -> dict:
    wow = dewow(section, window=dewow_window)
    tz = time_zero(wow)
    shifted = wow[:, tz:] if wow.ndim == 2 else wow[tz:]
    gained = sec_gain(shifted, dt, power=sec_power)
    bandpass_applied = False
    bandpass_defaulted = False
    used_low = f_low
    used_high = f_high
    if (used_low is None or used_high is None) and antenna_mhz:
        used_low = 0.2 * float(antenna_mhz) * 1e6
        used_high = 2.0 * float(antenna_mhz) * 1e6
        bandpass_defaulted = True
    bp = gained
    if used_low and used_high:
        try:
            bp = bandpass(gained, dt, float(used_low), float(used_high))
            bandpass_applied = True
        except ValueError:
            bp = gained
            bandpass_applied = False
    return {
        "dewow": wow,
        "time_zero_sample": tz,
        "gained": gained,
        "bandpassed": bp,
        "dt_s": dt,
        "dx_m": dx,
        "f_low_hz": float(used_low) if used_low else None,
        "f_high_hz": float(used_high) if used_high else None,
        "bandpass_applied": bandpass_applied,
        "bandpass_defaulted_from_antenna": bandpass_defaulted,
        "dewow_window": dewow_window,
        "sec_power": sec_power,
        "formula": "dewow + time-zero + SEC t^2 + optional Butterworth (Jol 2009)",
    }

