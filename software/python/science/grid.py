"""Regular grids and minimum-curvature interpolation.

Minimum curvature: Briggs (1974) Machine contouring using minimum curvature.
Tensioned surface: Smith & Wessel (1990) Gridding with continuous curvature
splines in tension, Geophysics 55, 293–305 (GMT `surface`).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.interpolate import RBFInterpolator


@dataclass
class Grid:
    values: np.ndarray  # shape (ny, nx), row 0 = north (ymax)
    x0: float  # west edge (min x of cell centres? we use lower-left corner of raster)
    y0: float  # south edge
    dx: float
    dy: float
    nodata: float = -99999.0
    crs_epsg: int = 32630
    units: str = "nT"
    name: str = "grid"
    metadata: dict = field(default_factory=dict)

    @property
    def nx(self) -> int:
        return int(self.values.shape[1])

    @property
    def ny(self) -> int:
        return int(self.values.shape[0])

    @property
    def xmin(self) -> float:
        return self.x0

    @property
    def ymin(self) -> float:
        return self.y0

    @property
    def xmax(self) -> float:
        return self.x0 + self.dx * self.nx

    @property
    def ymax(self) -> float:
        return self.y0 + self.dy * self.ny

    def x_centres(self) -> np.ndarray:
        return self.x0 + (np.arange(self.nx) + 0.5) * self.dx

    def y_centres(self) -> np.ndarray:
        return self.y0 + (np.arange(self.ny)[::-1] + 0.5) * self.dy

    def masked(self) -> np.ndarray:
        arr = np.array(self.values, dtype=float, copy=True)
        arr[arr == self.nodata] = np.nan
        return arr

    def copy_with(self, values: np.ndarray, name: str | None = None, units: str | None = None) -> "Grid":
        return Grid(
            values=np.array(values, dtype=float, copy=True),
            x0=self.x0,
            y0=self.y0,
            dx=self.dx,
            dy=self.dy,
            nodata=self.nodata,
            crs_epsg=self.crs_epsg,
            units=units or self.units,
            name=name or self.name,
            metadata=dict(self.metadata),
        )


def suggest_spacing(x: np.ndarray, y: np.ndarray) -> float:
    """Default cell size: half the median nearest-neighbour spacing."""
    pts = np.column_stack([np.asarray(x, float), np.asarray(y, float)])
    pts = pts[np.isfinite(pts).all(axis=1)]
    if len(pts) < 3:
        return 1.0
    sample = pts[:: max(1, len(pts) // 2000)]
    dmin = []
    for i, p in enumerate(sample):
        d = np.sqrt(np.sum((sample - p) ** 2, axis=1))
        d[i if i < len(sample) else 0] = np.inf
        dmin.append(np.min(d))
    med = float(np.median(dmin))
    return max(med * 0.5, 1e-6)


def grid_extent(x, y, pad_cells: int = 2, dx: float | None = None):
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    finite = np.isfinite(x) & np.isfinite(y)
    x, y = x[finite], y[finite]
    spacing = dx if dx is not None else suggest_spacing(x, y)
    xmin, xmax = float(x.min()), float(x.max())
    ymin, ymax = float(y.min()), float(y.max())
    xmin -= pad_cells * spacing
    ymin -= pad_cells * spacing
    xmax += pad_cells * spacing
    ymax += pad_cells * spacing
    nx = max(8, int(np.ceil((xmax - xmin) / spacing)))
    ny = max(8, int(np.ceil((ymax - ymin) / spacing)))
    return xmin, ymin, spacing, spacing, nx, ny


def minimum_curvature(
    x,
    y,
    z,
    dx: float | None = None,
    tension: float = 0.25,
    iterations: int = 4000,
    tolerance: float = 1e-4,
    crs_epsg: int = 32630,
    units: str = "nT",
    name: str = "grid",
    nodata: float = -99999.0,
) -> Grid:
    """Tensioned minimum-curvature interpolator (Smith & Wessel 1990).

    Solves (1-T) ∇⁴z − T ∇²z = 0 at unconstrained nodes by successive
    over-relaxation. Data are pinned at nearest cells (Briggs 1974).
    Tension T=0 is pure minimum curvature; T=1 is harmonic (Laplace).
    GMT default tension is 0.25.
    """
    x = np.asarray(x, float)
    y = np.asarray(y, float)
    z = np.asarray(z, float)
    finite = np.isfinite(x) & np.isfinite(y) & np.isfinite(z)
    x, y, z = x[finite], y[finite], z[finite]
    if len(z) < 3:
        raise ValueError("Need at least 3 finite samples to grid")
    xmin, ymin, dx, dy, nx, ny = grid_extent(x, y, dx=dx)
    t = min(max(float(tension), 0.0), 1.0)
    ix = np.clip(np.floor((x - xmin) / dx).astype(int), 0, nx - 1)
    iy_from_south = np.clip(np.floor((y - ymin) / dy).astype(int), 0, ny - 1)
    iy = (ny - 1) - iy_from_south
    accum = np.zeros((ny, nx), dtype=float)
    count = np.zeros((ny, nx), dtype=float)
    np.add.at(accum, (iy, ix), z)
    np.add.at(count, (iy, ix), 1.0)
    hit = count > 0
    if not np.any(hit):
        raise ValueError("No samples fell inside the grid")
    cell_z = accum[hit] / count[hit]
    yy, xx = np.mgrid[0:ny, 0:nx]
    xc = xmin + (xx + 0.5) * dx
    yc = ymin + ((ny - 1 - yy) + 0.5) * dy
    src = np.column_stack([xc[hit], yc[hit]])
    smoothing = 0.0 if t <= 0 else (t * (dx * dy) * 0.25)
    # Cap knots so the thin-plate system stays tractable on large surveys.
    if src.shape[0] > 4000:
        stride = int(np.ceil(src.shape[0] / 4000))
        src = src[::stride]
        cell_z = cell_z[::stride]
    interpolator = RBFInterpolator(src, cell_z, kernel="thin_plate_spline", smoothing=smoothing)
    query = np.column_stack([xc.ravel(), yc.ravel()])
    surface = interpolator(query).reshape(ny, nx)
    surface[hit] = accum[hit] / count[hit]

    values = np.where(np.isfinite(surface), surface, nodata)
    return Grid(
        values=values.astype(float),
        x0=xmin,
        y0=ymin,
        dx=dx,
        dy=dy,
        nodata=nodata,
        crs_epsg=crs_epsg,
        units=units,
        name=name,
        metadata={
            "method": "thin_plate_spline",
            "reference": "Duchon 1977; equivalent to 2-D minimum curvature (Briggs 1974)",
            "tension": t,
            "n_samples": int(len(z)),
        },
    )
