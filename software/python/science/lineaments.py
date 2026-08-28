"""Structural lineament extraction from derivative grids.

Ridges of the total horizontal derivative are thinned by non-maximum
suppression and linked into polylines (Casas et al. 2000 style; standard
aeromagnetic lineament workflow). Azimuths feed a rose histogram.
"""

from __future__ import annotations

import math

import numpy as np

from science.fft_filters import horizontal_derivatives, total_horizontal_derivative
from science.grid import Grid


def extract_lineaments(grid: Grid, percentile: float = 85.0, min_length_cells: int = 8) -> dict:
    thd = total_horizontal_derivative(grid).masked()
    gx, gy = horizontal_derivatives(grid)
    mag = thd
    threshold = np.nanpercentile(mag, percentile)
    ny, nx = mag.shape
    ridges = np.zeros((ny, nx), dtype=bool)
    gx_m = gx.masked()
    gy_m = gy.masked()
    for j in range(1, ny - 1):
        for i in range(1, nx - 1):
            v = mag[j, i]
            if not np.isfinite(v) or v < threshold:
                continue
            ang = math.atan2(gy_m[j, i], gx_m[j, i])
            # sample perpendicular to gradient (along ridge)
            dx = math.cos(ang)
            dy = math.sin(ang)
            v1 = _sample(mag, i + dx, j + dy)
            v2 = _sample(mag, i - dx, j - dy)
            if v >= v1 and v >= v2:
                ridges[j, i] = True
    lines, azimuths = _link(ridges, min_length_cells, grid)
    if azimuths:
        hist, edges = np.histogram([(a + 180) % 180 for a in azimuths], bins=18, range=(0, 180))
        dominant = float((edges[int(np.argmax(hist))] + edges[int(np.argmax(hist)) + 1]) / 2.0)
        spread = float(np.std(azimuths))
    else:
        hist, edges, dominant, spread = np.array([]), np.array([]), None, None
    return {
        "lineaments": lines,
        "azimuths_deg": azimuths,
        "rose": {
            "counts": hist.tolist() if hasattr(hist, "tolist") else [],
            "edges_deg": edges.tolist() if hasattr(edges, "tolist") else [],
            "dominant_azimuth_deg": dominant,
            "spread_deg": spread,
        },
        "n_ridge_cells": int(ridges.sum()),
        "formula": "THD non-maximum suppression + 8-connected linking",
    }


def _sample(arr: np.ndarray, x: float, y: float) -> float:
    i = int(round(x))
    j = int(round(y))
    if j < 0 or i < 0 or j >= arr.shape[0] or i >= arr.shape[1]:
        return -np.inf
    v = arr[j, i]
    return v if np.isfinite(v) else -np.inf


def _link(ridges: np.ndarray, min_length: int, grid: Grid) -> tuple[list[dict], list[float]]:
    ny, nx = ridges.shape
    seen = np.zeros_like(ridges)
    lines = []
    azimuths = []
    nbr = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    xs = grid.x_centres()
    ys = grid.y_centres()
    for j in range(ny):
        for i in range(nx):
            if not ridges[j, i] or seen[j, i]:
                continue
            chain = [(i, j)]
            seen[j, i] = True
            changed = True
            while changed:
                changed = False
                ci, cj = chain[-1]
                for dj, di in nbr:
                    ni, nj = ci + di, cj + dj
                    if 0 <= nj < ny and 0 <= ni < nx and ridges[nj, ni] and not seen[nj, ni]:
                        chain.append((ni, nj))
                        seen[nj, ni] = True
                        changed = True
                        break
            if len(chain) < min_length:
                continue
            coords = [(float(xs[i]), float(ys[j])) for i, j in chain]
            dx = coords[-1][0] - coords[0][0]
            dy = coords[-1][1] - coords[0][1]
            az = (math.degrees(math.atan2(dx, dy)) + 360.0) % 180.0
            length = math.hypot(dx, dy)
            lines.append({"id": f"L{len(lines)+1}", "azimuth": az, "length_m": length, "coordinates": coords})
            azimuths.append(az)
    return lines, azimuths
