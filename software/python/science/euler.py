"""3-D Euler deconvolution (Reid et al. 1990 Geophysics 55, 80–91).

x0 Tx + y0 Ty + z0 Tz = n T + x Tx + y Ty + z Tz
solved in sliding windows. Structural index n is 0 (contact), 1 (dike),
2 (pipe/cylinder), 3 (sphere) for magnetics.
"""

from __future__ import annotations

import numpy as np

from science.fft_filters import horizontal_derivatives, vertical_derivative
from science.grid import Grid


def euler_deconvolution(
    grid: Grid,
    structural_index: float = 1.0,
    window: int = 10,
    max_depth_m: float | None = None,
) -> dict:
    gx, gy = horizontal_derivatives(grid)
    gz = vertical_derivative(grid, 1)
    t = grid.masked()
    tx, ty, tz = gx.masked(), gy.masked(), gz.masked()
    ny, nx = t.shape
    xs = grid.x_centres()
    ys = grid.y_centres()
    xx, yy = np.meshgrid(xs, ys)
    w = max(4, int(window))
    si = float(structural_index)
    depth_cap = float(max_depth_m) if max_depth_m else grid.dx * nx
    solutions = []
    for iy in range(0, ny - w, max(1, w // 2)):
        for ix in range(0, nx - w, max(1, w // 2)):
            sl = (slice(iy, iy + w), slice(ix, ix + w))
            tt = t[sl]
            dxx = tx[sl]
            dyy = ty[sl]
            dzz = tz[sl]
            finite = np.isfinite(tt) & np.isfinite(dxx) & np.isfinite(dyy) & np.isfinite(dzz)
            if finite.sum() < 12:
                continue
            xw = xx[sl][finite]
            yw = yy[sl][finite]
            a = np.column_stack([dxx[finite], dyy[finite], dzz[finite], np.ones(finite.sum())])
            rhs = si * tt[finite] + xw * dxx[finite] + yw * dyy[finite]
            try:
                coef, residual, *_ = np.linalg.lstsq(a, rhs, rcond=None)
            except np.linalg.LinAlgError:
                continue
            x0, y0, z0 = float(coef[0]), float(coef[1]), float(coef[2])
            if z0 <= 0 or z0 > depth_cap:
                continue
            rms = float(np.sqrt(np.mean((a @ coef - rhs) ** 2))) / (np.nanstd(tt) + 1e-6)
            if rms > 0.5:
                continue
            solutions.append(
                {
                    "x": x0,
                    "y": y0,
                    "depth_m": z0,
                    "si": si,
                    "misfit": rms,
                    "window_x": float(xw.mean()),
                    "window_y": float(yw.mean()),
                }
            )
    return {
        "solutions": solutions,
        "n": len(solutions),
        "structural_index": si,
        "window": w,
        "formula": "Reid et al. 1990 Euler deconvolution; z positive down from grid",
    }
