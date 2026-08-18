"""Wavenumber-domain potential-field operators.

References
----------
Blakely (1995) Potential Theory in Gravity and Magnetic Applications, ch. 12.
Nabighian (1972) The analytic signal of two-dimensional magnetic bodies.
Roest, Verhoef & Pilkington (1992) Magnetic interpretation using the 3-D analytic signal.
Baranov (1957) A new method for interpretation of aeromagnetic maps: pseudo-gravimetry.
Li (2008) Magnetic reduction-to-the-pole at low latitudes.

Grid convention: x east, y north, z up. Ambient-field direction cosines use
inclination positive downward and declination positive east of north, matching
IGRF and Oasis montaj MAGMAP.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from science.grid import Grid

LOW_INCLINATION_DEG = 15.0
UNSTABLE_INCLINATION_DEG = 10.0


@dataclass
class FilterQC:
    inclination: float
    declination: float
    low_latitude: bool
    regularized: bool
    warning: str | None


def _pad_grid(arr: np.ndarray) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    ny, nx = arr.shape
    py = 1 << (ny - 1).bit_length()
    px = 1 << (nx - 1).bit_length()
    py = max(py, ny + 4)
    px = max(px, nx + 4)
    pad_y = py - ny
    pad_x = px - nx
    top = pad_y // 2
    bottom = pad_y - top
    left = pad_x // 2
    right = pad_x - left
    filled = np.array(arr, dtype=float, copy=True)
    mean = np.nanmean(filled)
    filled = np.where(np.isfinite(filled), filled, mean)
    # linear edge taper to mean to reduce ringing
    taper_y = np.hanning(ny)
    taper_x = np.hanning(nx)
    window = np.outer(taper_y, taper_x)
    filled = (filled - mean) * window + mean
    padded = np.pad(filled, ((top, bottom), (left, right)), mode="linear_ramp", end_values=mean)
    return padded, (top, bottom, left, right)


def _crop(arr: np.ndarray, pads: tuple[int, int, int, int], shape: tuple[int, int]) -> np.ndarray:
    top, bottom, left, right = pads
    ny, nx = shape
    return arr[top : top + ny, left : left + nx]


def _wavenumbers(ny: int, nx: int, dx: float, dy: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    kx = 2.0 * np.pi * np.fft.fftfreq(nx, d=dx)
    ky = 2.0 * np.pi * np.fft.fftfreq(ny, d=dy)
    kx, ky = np.meshgrid(kx, ky)
    k = np.sqrt(kx * kx + ky * ky)
    return kx, ky, k


def _fft_prepare(grid: Grid) -> tuple[np.ndarray, tuple[int, int, int, int], np.ndarray, np.ndarray, np.ndarray]:
    data = grid.masked()
    padded, pads = _pad_grid(data)
    spec = np.fft.fft2(padded)
    kx, ky, k = _wavenumbers(padded.shape[0], padded.shape[1], grid.dx, grid.dy)
    return spec, pads, kx, ky, k


def _apply(grid: Grid, operator: np.ndarray, name: str, units: str) -> Grid:
    spec, pads, *_ = _fft_prepare(grid)
    # operator is computed on padded shape by caller — this helper unused if operator precomputed
    raise NotImplementedError


def _direction_cosines(inclination_deg: float, declination_deg: float) -> tuple[float, float, float]:
    inc = math.radians(inclination_deg)
    dec = math.radians(declination_deg)
    bx = math.cos(inc) * math.sin(dec)  # east
    by = math.cos(inc) * math.cos(dec)  # north
    bz = -math.sin(inc)  # up (inclination positive down)
    return bx, by, bz


def reduction_to_pole(
    grid: Grid,
    inclination: float,
    declination: float,
    magnetization_inclination: float | None = None,
    magnetization_declination: float | None = None,
    force: bool = False,
    epsilon: float = 1e-4,
) -> tuple[Grid, FilterQC]:
    """RTP operator (Blakely 1995, eq. 12.18).

    O(k) = |k|² / [(k · f̂)(k · m̂)]
    with k = (i kx, i ky, |k|) in (east, north, up).

    At |I| < 15° a Wiener damper is applied (Li 2008). At |I| < 10° the
    operator refuses unless `force=True`.
    """
    mi = inclination if magnetization_inclination is None else magnetization_inclination
    md = declination if magnetization_declination is None else magnetization_declination
    low = abs(inclination) < LOW_INCLINATION_DEG or abs(mi) < LOW_INCLINATION_DEG
    unstable = abs(inclination) < UNSTABLE_INCLINATION_DEG
    if unstable and not force:
        raise ValueError(
            f"RTP is unstable at inclination {inclination:.2f}°. "
            "Use analytic signal or reduction-to-equator, or pass force=True with regularization."
        )
    fx, fy, fz = _direction_cosines(inclination, declination)
    mx, my, mz = _direction_cosines(mi, md)
    spec, pads, kx, ky, k = _fft_prepare(grid)
    k_safe = np.where(k == 0.0, 1.0, k)
    field = 1j * kx * fx + 1j * ky * fy + k * fz
    mag = 1j * kx * mx + 1j * ky * my + k * mz
    denom = field * mag
    if low:
        denom = denom + epsilon * (k_safe**2)
    operator = np.ones_like(denom, dtype=complex)
    nonzero = k != 0.0
    operator[nonzero] = (k_safe[nonzero] ** 2) / denom[nonzero]
    operator = np.nan_to_num(operator, nan=1.0, posinf=1.0, neginf=1.0)
    out = np.real(np.fft.ifft2(spec * operator))
    result = _crop(out, pads, grid.values.shape)
    qc = FilterQC(
        inclination=float(inclination),
        declination=float(declination),
        low_latitude=low,
        regularized=low,
        warning=(
            f"Low magnetic latitude (|I|={inclination:.2f}°). RTP regularized; prefer analytic signal."
            if low
            else None
        ),
    )
    return grid.copy_with(result, name="rtp", units=grid.units), qc


def reduction_to_equator(grid: Grid, inclination: float, declination: float) -> Grid:
    """RTE: project anomalies to the magnetic equator (stable at low latitude)."""
    fx, fy, fz = _direction_cosines(inclination, declination)
    # equator field: I=0, same declination
    ex, ey, ez = _direction_cosines(0.0, declination)
    spec, pads, kx, ky, k = _fft_prepare(grid)
    k_safe = np.where(k == 0.0, 1.0, k)
    field = 1j * kx * fx + 1j * ky * fy + k * fz
    eq = 1j * kx * ex + 1j * ky * ey + k * ez
    operator = np.where(k == 0.0, 1.0, (eq * np.conjugate(eq)) / (field * np.conjugate(field) + 1e-12 * k_safe**2))
    out = np.real(np.fft.ifft2(spec * operator))
    return grid.copy_with(_crop(out, pads, grid.values.shape), name="rte", units=grid.units)


def vertical_derivative(grid: Grid, order: int = 1) -> Grid:
    """n-th vertical derivative: multiply by |k|^n (Blakely 1995). z positive up; MAGMAP 1VD uses |k|."""
    spec, pads, kx, ky, k = _fft_prepare(grid)
    operator = k ** order
    operator[0, 0] = 0.0
    out = np.real(np.fft.ifft2(spec * operator))
    units = f"{grid.units}/m" if order == 1 else f"{grid.units}/m^{order}"
    return grid.copy_with(_crop(out, pads, grid.values.shape), name=f"{order}vd", units=units)


def horizontal_derivatives(grid: Grid) -> tuple[Grid, Grid]:
    spec, pads, kx, ky, k = _fft_prepare(grid)
    dx = np.real(np.fft.ifft2(spec * (1j * kx)))
    dy = np.real(np.fft.ifft2(spec * (1j * ky)))
    gx = grid.copy_with(_crop(dx, pads, grid.values.shape), name="dx", units=f"{grid.units}/m")
    gy = grid.copy_with(_crop(dy, pads, grid.values.shape), name="dy", units=f"{grid.units}/m")
    return gx, gy


def total_horizontal_derivative(grid: Grid) -> Grid:
    gx, gy = horizontal_derivatives(grid)
    thd = np.hypot(gx.masked(), gy.masked())
    return grid.copy_with(thd, name="thd", units=f"{grid.units}/m")


def analytic_signal(grid: Grid) -> Grid:
    """3-D analytic signal / total gradient (Roest et al. 1992).

    AS = sqrt((dT/dx)² + (dT/dy)² + (dT/dz)²)
    """
    gx, gy = horizontal_derivatives(grid)
    gz = vertical_derivative(grid, 1)
    asg = np.sqrt(gx.masked() ** 2 + gy.masked() ** 2 + gz.masked() ** 2)
    return grid.copy_with(asg, name="analytic_signal", units=f"{grid.units}/m")


def tilt_angle(grid: Grid) -> Grid:
    """Tilt angle (Miller & Singh 1994): atan2(dT/dz, THD), degrees."""
    gz = vertical_derivative(grid, 1).masked()
    thd = total_horizontal_derivative(grid).masked()
    tilt = np.degrees(np.arctan2(gz, np.where(thd == 0.0, np.nan, thd)))
    return grid.copy_with(tilt, name="tilt", units="deg")


def upward_continue(grid: Grid, height_m: float) -> Grid:
    """Upward continuation by h metres: multiply by exp(−|k| h) (Blakely 1995)."""
    spec, pads, kx, ky, k = _fft_prepare(grid)
    operator = np.exp(-k * float(height_m))
    out = np.real(np.fft.ifft2(spec * operator))
    g = grid.copy_with(_crop(out, pads, grid.values.shape), name=f"uc_{int(height_m)}m", units=grid.units)
    g.metadata = {**grid.metadata, "continuation_height_m": float(height_m)}
    return g


def downward_continue(grid: Grid, height_m: float, alpha: float = 0.5) -> Grid:
    """Downward continuation with Wiener damper exp(+|k|h) / (1 + α k²)."""
    spec, pads, kx, ky, k = _fft_prepare(grid)
    operator = np.exp(k * float(height_m)) / (1.0 + float(alpha) * k * k)
    out = np.real(np.fft.ifft2(spec * operator))
    return grid.copy_with(_crop(out, pads, grid.values.shape), name=f"dc_{int(height_m)}m", units=grid.units)


def butterworth_highpass(grid: Grid, cutoff_m: float, order: int = 4) -> Grid:
    """Isotropic Butterworth high-pass. Cutoff is wavelength in metres."""
    spec, pads, kx, ky, k = _fft_prepare(grid)
    kc = 2.0 * np.pi / max(float(cutoff_m), grid.dx)
    hp = 1.0 / (1.0 + (kc / np.where(k == 0.0, 1.0, k)) ** (2 * int(order)))
    hp[0, 0] = 0.0
    out = np.real(np.fft.ifft2(spec * hp))
    return grid.copy_with(_crop(out, pads, grid.values.shape), name=f"hp_{int(cutoff_m)}m", units=grid.units)


def decorrugate(grid: Grid, line_spacing_m: float, flight_azimuth_deg: float = 0.0) -> Grid:
    """Directional Butterworth high-pass across flight lines (Minty 1991-style decorrugation).

    Flight azimuth 0 = northbound. Cutoff wavelength = 4 × line spacing.
    """
    spec, pads, kx, ky, k = _fft_prepare(grid)
    az = math.radians(float(flight_azimuth_deg))
    k_across = kx * math.cos(az) + ky * math.sin(az)
    cutoff = 2.0 * math.pi / max(4.0 * float(line_spacing_m), grid.dx)
    hp = (k_across ** 2) / (k_across ** 2 + cutoff ** 2)
    out = np.real(np.fft.ifft2(spec * hp))
    g = grid.copy_with(_crop(out, pads, grid.values.shape), name="decorrugated", units=grid.units)
    g.metadata = {**grid.metadata, "line_spacing_m": float(line_spacing_m), "flight_azimuth_deg": float(flight_azimuth_deg)}
    return g


def pseudo_gravity(grid: Grid) -> Grid:
    """Baranov (1957) pseudo-gravity: integrate TMI in wavenumber domain (× 1/|k|).

    Apply to an RTP grid when possible. Output units are relative (nT·m).
    """
    spec, pads, kx, ky, k = _fft_prepare(grid)
    operator = np.where(k == 0.0, 0.0, 1.0 / k)
    out = np.real(np.fft.ifft2(spec * operator))
    return grid.copy_with(_crop(out, pads, grid.values.shape), name="pseudo_gravity", units=f"{grid.units}·m")


def derivative_suite(grid: Grid, downward_m: float = 50.0) -> dict[str, Grid]:
    suite = {
        "analytic_signal": analytic_signal(grid),
        "1vd": vertical_derivative(grid, 1),
        "2vd": vertical_derivative(grid, 2),
        "thd": total_horizontal_derivative(grid),
        "tilt": tilt_angle(grid),
    }
    if downward_m and downward_m > 0:
        suite[f"dc_{int(downward_m)}m"] = downward_continue(grid, downward_m)
    return suite
