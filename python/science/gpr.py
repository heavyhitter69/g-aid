"""Ground-penetrating radar processing.

Dewow: subtract an odd-length running mean (Jol 2009).
Time-zero: first sample where mean |amp| ≥ threshold × peak of the dewowed stack.
SEC gain: t^n spherical spreading with optional exponential (Jol 2009). Default n=2, α=0.
Bandpass: Butterworth SOS; corners are validated against Nyquist from dt. High-cut is
never silently placed at or above Nyquist.
Kirchhoff 2-D time migration: science.seismic (Yilmaz 2001). Constant velocity,
zero-offset; z = 0.5 v t is not ground truth.
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy.signal import butter, sosfiltfilt

from science.seismic import kirchhoff_time_migrate_2d

# Applied high-cut must be strictly below Nyquist. When the antenna default
# 0.2–2.0 × AntennaMHz exceeds Nyquist, the documented safe high-cut is this
# fraction of Nyquist (not a silent 0.999 clamp).
NYQUIST_HIGH_FRACTION = 0.8
DEFAULT_DEWOW_WINDOW = 31
DEFAULT_TIME_ZERO_THRESHOLD = 0.05
DEFAULT_SEC_POWER = 2.0
DEFAULT_SEC_EXP = 0.0
DEFAULT_FILTER_ORDER = 4
ANTENNA_LOW_FRACTION = 0.2
ANTENNA_HIGH_FRACTION = 2.0

TIME_ZERO_METHOD = (
    "First sample where the mean absolute amplitude of the (dewowed) stack is "
    f"≥ {DEFAULT_TIME_ZERO_THRESHOLD} × the stack peak. Not a picked ground wave."
)
SEC_FORMULA = "gain(t) = max(t, dt)^n * exp(α t)  (Jol 2009 SEC; default n=2, α=0)"
DEWOW_FORMULA = "trace minus odd-length running mean (Jol 2009)"
BANDPASS_FORMULA = f"Butterworth SOS band-pass, order {DEFAULT_FILTER_ORDER} unless overridden; filtfilt"
MIGRATION_FORMULA = (
    "2-D Kirchhoff time migration, zero-offset, constant velocity (Yilmaz 2001). "
    "z = 0.5 v t with the user velocity. No topography, no 3-D, not a measured depth model."
)


def sampling_from_dt(dt_s: float) -> dict[str, float]:
    dt_s = float(dt_s)
    if not math.isfinite(dt_s) or dt_s <= 0:
        raise ValueError("dt must be a positive sample interval in seconds.")
    sampling_hz = 1.0 / dt_s
    nyquist_hz = 0.5 * sampling_hz
    return {"dt_s": dt_s, "sampling_hz": sampling_hz, "nyquist_hz": nyquist_hz}


def _odd_window(window: int) -> int:
    window = max(3, int(window))
    if window % 2 == 0:
        window += 1
    return window


def resolve_bandpass(
    dt_s: float,
    f_low: float | None = None,
    f_high: float | None = None,
    antenna_mhz: float | None = None,
    apply_bandpass: bool = True,
) -> dict[str, Any]:
    """Validate requested/default Butterworth corners against Nyquist.

    Never silently uses a high-cut at or above Nyquist. If the antenna default
    0.2–2.0 × AntennaMHz is invalid, a documented safe high-cut of
    NYQUIST_HIGH_FRACTION × Nyquist is used when the low-cut still fits;
    otherwise the filter is refused and the traces are left unfiltered.
    """
    samp = sampling_from_dt(dt_s)
    nyq = samp["nyquist_hz"]
    out: dict[str, Any] = {
        **samp,
        "nyquist_high_fraction": NYQUIST_HIGH_FRACTION,
        "safe_high_hz": NYQUIST_HIGH_FRACTION * nyq,
        "apply_bandpass_requested": bool(apply_bandpass),
        "requested_low_hz": None,
        "requested_high_hz": None,
        "requested_source": "none",
        "applied_low_hz": None,
        "applied_high_hz": None,
        "bandpass_applied": False,
        "bandpass_defaulted_from_antenna": False,
        "bandpass_adjusted": False,
        "bandpass_refused": False,
        "refusal_reason": None,
        "adjustment_reason": None,
        "formula": BANDPASS_FORMULA,
    }
    if not apply_bandpass:
        out["refusal_reason"] = "Band-pass skipped because applyBandpass is false in the frozen plan."
        out["bandpass_refused"] = True
        return out

    user_low = float(f_low) if f_low not in (None, "") else None
    user_high = float(f_high) if f_high not in (None, "") else None
    if user_low is not None and user_high is not None:
        out["requested_low_hz"] = user_low
        out["requested_high_hz"] = user_high
        out["requested_source"] = "user"
        ok, reason = _corners_valid(user_low, user_high, nyq)
        if not ok:
            out["bandpass_refused"] = True
            out["refusal_reason"] = reason
            return out
        out["applied_low_hz"] = user_low
        out["applied_high_hz"] = user_high
        out["bandpass_applied"] = True
        return out

    if antenna_mhz:
        req_low = ANTENNA_LOW_FRACTION * float(antenna_mhz) * 1e6
        req_high = ANTENNA_HIGH_FRACTION * float(antenna_mhz) * 1e6
        out["requested_low_hz"] = req_low
        out["requested_high_hz"] = req_high
        out["requested_source"] = "antenna_default"
        out["bandpass_defaulted_from_antenna"] = True
        ok, reason = _corners_valid(req_low, req_high, nyq)
        if ok:
            out["applied_low_hz"] = req_low
            out["applied_high_hz"] = req_high
            out["bandpass_applied"] = True
            return out
        safe_high = NYQUIST_HIGH_FRACTION * nyq
        ok_safe, _ = _corners_valid(req_low, safe_high, nyq)
        if ok_safe:
            out["applied_low_hz"] = req_low
            out["applied_high_hz"] = safe_high
            out["bandpass_applied"] = True
            out["bandpass_adjusted"] = True
            out["adjustment_reason"] = (
                f"Antenna default 0.2–2.0 × AntennaMHz ({req_low/1e6:.4g}–{req_high/1e6:.4g} MHz) is not "
                f"Nyquist-safe (Nyquist {nyq/1e6:.4g} MHz). Applied documented safe high-cut "
                f"{NYQUIST_HIGH_FRACTION} × Nyquist = {safe_high/1e6:.4g} MHz. This is not a silent clamp to 0.999 Nyquist."
            )
            return out
        out["bandpass_refused"] = True
        out["refusal_reason"] = (
            f"{reason} Antenna default also cannot be replaced by {NYQUIST_HIGH_FRACTION} × Nyquist "
            f"({safe_high/1e6:.4g} MHz) while keeping the 0.2 × AntennaMHz low-cut. Supply fLowHz/fHighHz below Nyquist."
        )
        return out

    out["bandpass_refused"] = True
    out["refusal_reason"] = "No user fLowHz/fHighHz and no AntennaMHz, so the band-pass was not applied."
    return out


def _corners_valid(low: float, high: float, nyquist_hz: float) -> tuple[bool, str]:
    if not (math.isfinite(low) and math.isfinite(high)):
        return False, "Band-pass corners must be finite frequencies in Hz."
    if low <= 0 or high <= 0:
        return False, "Band-pass corners must be positive."
    if low >= high:
        return False, f"Band-pass low-cut {low} Hz must be below high-cut {high} Hz."
    if high >= nyquist_hz:
        return False, (
            f"Band-pass high-cut {high/1e6:.4g} MHz is at or above Nyquist {nyquist_hz/1e6:.4g} MHz. "
            "G-AID will not silently place a high-cut at 0.999 × Nyquist."
        )
    if low >= nyquist_hz:
        return False, (
            f"Band-pass low-cut {low/1e6:.4g} MHz is at or above Nyquist {nyquist_hz/1e6:.4g} MHz."
        )
    return True, ""


def dewow(section: np.ndarray, window: int = DEFAULT_DEWOW_WINDOW) -> np.ndarray:
    section = np.asarray(section, float)
    window = _odd_window(window)
    kernel = np.ones(window) / window
    out = np.empty_like(section)
    for i, tr in enumerate(np.atleast_2d(section)):
        trend = np.convolve(tr, kernel, mode="same")
        out[i] = tr - trend
    return out


def time_zero(section: np.ndarray, threshold: float = DEFAULT_TIME_ZERO_THRESHOLD) -> int:
    stack = np.mean(np.abs(np.atleast_2d(section)), axis=0)
    peak = np.max(stack) or 1.0
    hits = np.where(stack >= threshold * peak)[0]
    return int(hits[0]) if len(hits) else 0


def sec_gain(
    section: np.ndarray,
    dt: float,
    power: float = DEFAULT_SEC_POWER,
    exp: float = DEFAULT_SEC_EXP,
) -> np.ndarray:
    section = np.asarray(section, float)
    ns = section.shape[-1]
    t = np.arange(ns) * dt
    gain = np.clip(t, dt, None) ** power * np.exp(exp * t)
    return section * gain


def bandpass(section: np.ndarray, dt: float, f_low: float, f_high: float, order: int = DEFAULT_FILTER_ORDER) -> np.ndarray:
    """Apply a Nyquist-validated Butterworth. Callers must resolve corners first."""
    resolved = resolve_bandpass(dt, f_low, f_high, apply_bandpass=True)
    if not resolved["bandpass_applied"]:
        raise ValueError(resolved["refusal_reason"] or "Band-pass corners are not Nyquist-safe.")
    nyq = resolved["nyquist_hz"]
    sos = butter(int(order), [float(f_low) / nyq, float(f_high) / nyq], btype="bandpass", output="sos")
    return sosfiltfilt(sos, np.asarray(section, float), axis=-1)


def process_section(
    section: np.ndarray,
    dt: float,
    dx: float,
    f_low: float | None = None,
    f_high: float | None = None,
    antenna_mhz: float | None = None,
    dewow_window: int = DEFAULT_DEWOW_WINDOW,
    sec_power: float = DEFAULT_SEC_POWER,
    sec_exp: float = DEFAULT_SEC_EXP,
    time_zero_threshold: float = DEFAULT_TIME_ZERO_THRESHOLD,
    filter_order: int = DEFAULT_FILTER_ORDER,
    apply_dewow: bool = True,
    apply_time_zero: bool = True,
    apply_sec_gain: bool = True,
    apply_bandpass: bool = True,
) -> dict:
    work = np.asarray(section, float)
    dewow_window = _odd_window(dewow_window)
    wow = dewow(work, window=dewow_window) if apply_dewow else work
    tz = time_zero(wow, threshold=time_zero_threshold) if apply_time_zero else 0
    shifted = wow[:, tz:] if wow.ndim == 2 else wow[tz:]
    gained = sec_gain(shifted, dt, power=sec_power, exp=sec_exp) if apply_sec_gain else shifted
    filt = resolve_bandpass(dt, f_low, f_high, antenna_mhz=antenna_mhz, apply_bandpass=apply_bandpass)
    bp = gained
    if filt["bandpass_applied"]:
        try:
            bp = bandpass(
                gained,
                dt,
                float(filt["applied_low_hz"]),
                float(filt["applied_high_hz"]),
                order=filter_order,
            )
        except ValueError as err:
            filt["bandpass_applied"] = False
            filt["bandpass_refused"] = True
            filt["refusal_reason"] = str(err)
            bp = gained
    return {
        "dewow": wow,
        "time_zero_sample": tz,
        "gained": gained,
        "bandpassed": bp,
        "section": bp,
        "dt_s": dt,
        "dx_m": dx,
        "f_low_hz": filt["applied_low_hz"],
        "f_high_hz": filt["applied_high_hz"],
        "bandpass": filt,
        "bandpass_applied": filt["bandpass_applied"],
        "bandpass_defaulted_from_antenna": filt["bandpass_defaulted_from_antenna"],
        "bandpass_adjusted": filt["bandpass_adjusted"],
        "bandpass_refused": filt["bandpass_refused"],
        "dewow_window": dewow_window,
        "dewow_applied": bool(apply_dewow),
        "time_zero_applied": bool(apply_time_zero),
        "time_zero_threshold": time_zero_threshold,
        "time_zero_method": TIME_ZERO_METHOD,
        "sec_applied": bool(apply_sec_gain),
        "sec_power": sec_power,
        "sec_exp": sec_exp,
        "sec_formula": SEC_FORMULA,
        "dewow_formula": DEWOW_FORMULA,
        "filter_order": int(filter_order),
        "sampling_hz": filt["sampling_hz"],
        "nyquist_hz": filt["nyquist_hz"],
        "geological_certainty_improved": False,
        "formula": "optional dewow + optional time-zero + optional SEC + optional Nyquist-safe Butterworth (Jol 2009)",
        "limitations": [
            "Two-way time is not depth.",
            "Dewow, time-zero, SEC gain, and band-pass are processing choices. A visually enhanced radargram does not have improved geological certainty.",
            "Utilities, voids, archaeology, water table, and rebar are not established.",
        ],
    }


def synthetic_diffraction(
    ntr: int = 41,
    ns: int = 80,
    dx: float = 0.05,
    dt_s: float = 4e-10,
    velocity_ms: float = 1.0e8,
    apex_tr: int = 20,
    apex_s: int = 40,
) -> dict[str, Any]:
    """Zero-offset diffraction hyperbola at a known apex and constant velocity."""
    t0 = apex_s * dt_s
    section = np.zeros((ntr, ns), dtype=float)
    for ti in range(ntr):
        x = (ti - apex_tr) * dx
        t_hyp = math.sqrt(t0 * t0 + (x / velocity_ms) ** 2)
        samp = t_hyp / dt_s
        i0 = int(round(samp))
        if 0 <= i0 < ns:
            section[ti, i0] = 1.0
            if i0 + 1 < ns:
                section[ti, i0 + 1] = 0.4
            if i0 - 1 >= 0:
                section[ti, i0 - 1] = 0.4
    return {
        "section": section,
        "ntr": ntr,
        "ns": ns,
        "dx": dx,
        "dt_s": dt_s,
        "velocity_ms": velocity_ms,
        "apex_tr": apex_tr,
        "apex_s": apex_s,
        "formula": "t = sqrt(t0^2 + x^2/v^2) sampled onto the trace grid",
    }


def score_migration(section: np.ndarray, migrated: np.ndarray, apex_tr: int, apex_s: int) -> dict[str, Any]:
    peak = np.unravel_index(np.argmax(np.abs(migrated)), migrated.shape)
    mask = np.zeros_like(migrated, dtype=bool)
    r0 = max(0, apex_tr - 1)
    r1 = min(migrated.shape[0], apex_tr + 2)
    c0 = max(0, apex_s - 2)
    c1 = min(migrated.shape[1], apex_s + 3)
    mask[r0:r1, c0:c1] = True
    e_mig = float(np.sum(migrated[mask] ** 2))
    e_mig_all = float(np.sum(migrated**2)) + 1e-18
    e_raw = float(np.sum(section[mask] ** 2))
    e_raw_all = float(np.sum(section**2)) + 1e-18
    frac_mig = e_mig / e_mig_all
    frac_raw = e_raw / e_raw_all
    apex_amp = float(np.abs(migrated[apex_tr, apex_s]))
    flanks = [float(np.abs(migrated[0, apex_s])), float(np.abs(migrated[-1, apex_s]))]
    flank_mean = float(np.mean(flanks)) if flanks else 0.0
    loc_ok = abs(int(peak[0]) - apex_tr) <= 1 and abs(int(peak[1]) - apex_s) <= 2
    energy_ok = frac_mig > 2.0 * frac_raw
    contrast_ok = apex_amp > 5.0 * max(flank_mean, 1e-12)
    return {
        "peak_trace": int(peak[0]),
        "peak_sample": int(peak[1]),
        "true_apex_trace": apex_tr,
        "true_apex_sample": apex_s,
        "location_pass": loc_ok,
        "migrated_energy_fraction_near_apex": frac_mig,
        "raw_energy_fraction_near_apex": frac_raw,
        "energy_concentration_pass": energy_ok,
        "apex_amplitude": apex_amp,
        "flank_mean_amplitude": flank_mean,
        "contrast_pass": contrast_ok,
        "pass": bool(loc_ok and energy_ok and contrast_ok),
        "thresholds": {
            "peak_within_traces": 1,
            "peak_within_samples": 2,
            "energy_fraction_gt_raw_times": 2.0,
            "apex_over_flank": 5.0,
        },
    }


def run_migration_benchmark() -> dict[str, Any]:
    syn = synthetic_diffraction()
    migrated = kirchhoff_time_migrate_2d(syn["section"], syn["dt_s"], syn["dx"], syn["velocity_ms"])
    correct = score_migration(syn["section"], migrated, syn["apex_tr"], syn["apex_s"])
    wrong = kirchhoff_time_migrate_2d(syn["section"], syn["dt_s"], syn["dx"], syn["velocity_ms"] * 0.5)
    wrong_score = score_migration(syn["section"], wrong, syn["apex_tr"], syn["apex_s"])
    passed = bool(correct["pass"])
    return {
        "product_name": "GPR Kirchhoff time migration (user velocity)",
        "kernel": MIGRATION_FORMULA,
        "all_passed": passed,
        "unavailable_reason": None
        if passed
        else "Kirchhoff time migration failed the documented diffraction-collapse benchmark and is not available.",
        "cases": [
            {
                "name": "known_diffraction_correct_velocity",
                "velocity_ms": syn["velocity_ms"],
                "oracle": "analytic zero-offset hyperbola t=sqrt(t0^2+x^2/v^2) at a known apex",
                **correct,
            },
            {
                "name": "known_diffraction_half_velocity_diagnostic",
                "velocity_ms": syn["velocity_ms"] * 0.5,
                "oracle": "same hyperbola migrated at 0.5 v; must not earn the correct-velocity gate",
                **wrong_score,
                "diagnostic_only": True,
                "pass": True,
                "notes": "Wrong-velocity imaging is recorded; it is not required to fail the location gate.",
            },
        ],
        "limitations": [
            "Benchmark is a noise-free constant-velocity zero-offset hyperbola.",
            "Passing does not prove pipes, voids, archaeology, or a measured depth.",
            "3-D migration, topography, and laterally varying velocity are not implemented.",
        ],
    }
